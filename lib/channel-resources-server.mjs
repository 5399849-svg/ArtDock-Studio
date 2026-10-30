import {createProjectLogoLibrary} from './project-logos.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import sharp from 'sharp';
import {safeChild} from './core.mjs';
import {buildOutpaintRequest,composeOutpaintPrompt,downloadRaw,pollJob,submitGeneration} from './ai-huabu.mjs';
import {loadCanvasConfig} from '../platform/canvas.mjs';
import {createSafeOutpaint} from './safe-outpaint.mjs';
import {channelOutpaintGaps,extractChromaTypography,normalizeChannelDraft,optimizeChannelCandidate} from './channel-editor-ops.mjs';
import {localPython} from '../platform/local-compute.mjs';
import {setProjectHint} from '../platform/request-context.mjs';

const run = promisify(execFile);
const channels = [
  {id:'huawei',name:'华为'}, {id:'oppo',name:'OPPO'}, {id:'vivo',name:'vivo'},
  {id:'xiaomi',name:'小米'}, {id:'honor',name:'荣耀'},
];
const psdSceneTemplates=new Set(['21鸿蒙-首页大卡.psd','1应用商店-banner.psd','2应用商店-banner.psd']);
const respond = (res,status,value) => {const body=Buffer.from(JSON.stringify(value));res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Content-Length':body.length});res.end(body);};
const failure = (message,status=422) => Object.assign(new Error(message),{status});
async function requestJson(req,limit=45*1024*1024){const chunks=[];let total=0;for await(const chunk of req){total+=chunk.length;if(total>limit)throw failure('请求内容过大',413);chunks.push(chunk);}try{return JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');}catch{throw failure('请求不是有效 JSON',400);}}
function csvRows(input){const rows=[];let row=[],cell='',quoted=false;for(let i=0;i<input.length;i++){const c=input[i];if(quoted){if(c==='"'&&input[i+1]==='"'){cell+='"';i++;}else if(c==='"')quoted=false;else cell+=c;}else if(c==='"')quoted=true;else if(c===','){row.push(cell);cell='';}else if(c==='\n'){row.push(cell.replace(/\r$/,''));rows.push(row);row=[];cell='';}else cell+=c;}if(cell||row.length){row.push(cell);rows.push(row);}const headings=(rows.shift()||[]).map(h=>h.replace(/^\uFEFF/,''));return rows.filter(r=>r.some(Boolean)).map(r=>Object.fromEntries(headings.map((h,i)=>[h,r[i]||''])));}
function parseLimit(value){const match=String(value||'').match(/([\d.]+)\s*(KB|MB)/i);return match?Math.floor(Number(match[1])*(match[2].toUpperCase()==='MB'?1048576:1024)):null;}
function splitSize(value){const match=String(value||'').match(/(\d+)\s*[x×*]\s*(\d+)/i);return match?[Number(match[1]),Number(match[2])]:[0,0];}
function filled(value){const text=String(value||'').trim();return /^[\\/－—-]$/.test(text)?'':text;}
function normalizeItem(cells,{id,row,sourceImages=[]}){const [width,height]=splitSize(cells.F);const quantity=Number(cells.E||1);if(!width||!height||width>10000||height>10000)throw failure(`第 ${row} 行尺寸无效：${cells.F||'未填写'}`);if(!Number.isInteger(quantity)||quantity<1||quantity>30)throw failure(`第 ${row} 行张数应为 1–30`);return Array.from({length:quantity},(_,i)=>({id:quantity===1?`${id}-${row}`:`${id}-${row}-${i+1}`,row,copyIndex:i+1,quantity,project:cells.A||'未命名项目',category:cells.B||'',resource:cells.C||cells.D||'资源位',type:cells.D||'',width,height,limitRaw:cells.G||'',maxBytes:parseLimit(cells.G),format:(cells.H||'JPG').trim(),template:filled(cells.J),sourceCopy:filled(cells.L),requirements:filled(cells.M),sourceImages,versions:[],review:null}));}
function imageUrl(batchId,bucket,file){return `/storage/channel-resources-${encodeURIComponent(batchId)}/${bucket}/${encodeURIComponent(file)}`;}

export async function createChannelResourcesHandler({root,runtimeDir,storageDir,generateImage,taskName=(key,fallback)=>fallback,projectLogos=createProjectLogoLibrary({runtimeDir,storageDir}),recycleBin}){
  recycleBin ||= await (await import("./recycle-bin.mjs")).getRecycleBin({runtimeDir,storageDir});
  const sampleDir=path.join(runtimeDir,'channel-analysis','0922-test');
  const jobsFile=path.join(runtimeDir,'channel-resource-jobs.json');
  const overlayFile=path.join(runtimeDir,'channel-resource-overlays.json');
  const rulesFile=path.join(runtimeDir,'channel-analysis','huawei-current','华为资源位规则清单.csv');
  const rules=csvRows(await fs.readFile(rulesFile,'utf8'));
  let jobs=[];let overlays={};const generationJobs=new Map();
  try{jobs=JSON.parse(await fs.readFile(jobsFile,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
  try{overlays=JSON.parse(await fs.readFile(overlayFile,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
  const persistJobs=()=>fs.writeFile(jobsFile,JSON.stringify(jobs,null,2)+'\n');
  const persistOverlays=()=>fs.writeFile(overlayFile,JSON.stringify(overlays,null,2)+'\n');
  async function attachProjectLogo(batch,input){
    batch.projectId=input.projectId||'';
    const logo=await projectLogos.copyToTask({projectId:batch.projectId,logoId:input.projectLogoId,folder:`channel-resources-${batch.id}`,bucket:'editor'});
    if(!logo)return;
    batch.projectLogo=logo;
    for(const item of batch.items){
      const forbidden=/纯图|(?:无|不含|禁止|不带)\s*logo/i.test(`${item.requirements||''} ${item.sourceCopy||''}`)||/icon|图标/i.test(item.type||'');
      const width=Math.round(Math.min(item.width*(item.height>item.width ? .45 : .22),item.height*.2*logo.width/logo.height));
      overlays[item.id]={versions:[],editor:{backgroundUrl:'',assets:[{...logo,kind:'layer'}],layers:forbidden?[]:[{id:`logo-${logo.id}`,type:'image',name:'项目 Logo',url:logo.url,x:Math.round(item.width*.04),y:Math.round(item.height*.04),width,visible:true}]}};
    }
  }
  const ruleFor=item=>item.template
    ?rules.find(r=>filled(r.模板)===item.template&&splitSize(r.尺寸).join('x')===`${item.width}x${item.height}`)||null
    :rules.find(r=>!filled(r.模板)&&r.资源位===item.resource&&splitSize(r.尺寸).join('x')===`${item.width}x${item.height}`)||null;
  async function sample(){
    try{
      const manifest=JSON.parse(await fs.readFile(path.join(sampleDir,'制作任务清单.json'),'utf8'));
      const v1=JSON.parse(await fs.readFile(path.join(sampleDir,'candidates-v1','checks.json'),'utf8'));
      const items=manifest.tasks.map((record,index)=>{
        const sourceNames=record.sourceImages?.length?record.sourceImages.map(name=>path.basename(name)):[path.basename(record.sourceImage||'')].filter(Boolean);
        const item={id:record.id,row:record.sourceRow,copyIndex:1,quantity:record.quantity,project:record.project,category:record.category|| (index<2?'鸿蒙':'应用商店'),resource:record.resource|| (index<2?'首页大卡':'Banner'),type:record.type||'banner',width:record.size[0],height:record.size[1],limitRaw:record.sizeLimitRaw,maxBytes:parseLimit(record.sizeLimitRaw),format:record.format,template:filled(record.template),sourceCopy:filled(record.copyRaw),requirements:filled(record.requirementsRaw),sourceImages:sourceNames.map(name=>({name,url:`/channel-sample/source/${encodeURIComponent(name)}`})),needsRecheck:index<2&&!filled(record.template),versions:[],review:null};
        const original=v1.find(v=>v.id===index+1);
        const preview=item.needsRecheck?{}:{sceneUrl:`/channel-sample/psd-scenes/0${index+1}-v1.jpg`,sceneKind:'华为 PSD 模板预览'};
        if(original)item.versions.push({name:'当前交付稿',file:original.file,bytes:original.bytes,url:`/channel-sample/candidates-v1/${encodeURIComponent(original.file)}`,...preview});
        return item;
      });
      return {id:'huawei-0922',channel:'huawei',name:'0922 华为测试',sourceName:'0922-华为需求表.xlsx',createdAt:'2026-09-22T00:00:00.000Z',items,sample:true};
    }catch(e){if(e.code==='ENOENT')return null;throw e;}
  }
  async function allBatches(){const example=await sample();return [...(example?[example]:[]),...jobs];}
  const recycleKey=(batch,item)=>`channel-resources:${batch.id}:${encodeURIComponent(String(item.project||'未命名项目').trim())}`;
  const visible=(batch,item)=>!overlays[item.id]?.deleted&&!recycleBin.isTaskHidden(recycleKey(batch,item));
  recycleBin.register('channel-resources',{
    list:async()=>{const rows=[];for(const batch of await allBatches()){
      const groups=new Map();for(const item of batch.items){if(overlays[item.id]?.deleted)continue;const key=recycleKey(batch,item);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(item);}
      for(const [key,items]of groups)rows.push({key,label:taskName(key,items[0].project+' · '+batch.name),projectId:items[0].projectId||batch.projectId,folder:batch.sample?'':`channel-resources-${batch.id}`,data:{...batch,items,overlays:Object.fromEntries(items.map(item=>[item.id,overlays[item.id]||{}]))},busy:[...generationJobs.values()].some(job=>items.some(item=>item.id===job.itemId)&&job.status==='running')});
    }return rows;},
    drop:async(key,snapshot)=>{const ids=new Set(snapshot.items.map(item=>item.id)),batch=jobs.find(b=>b.id===snapshot.id);if(batch){batch.items=batch.items.filter(item=>!ids.has(item.id));if(!batch.items.length)jobs=jobs.filter(b=>b!==batch);}for(const id of ids){if(snapshot.sample)overlays[id]={...overlays[id],deleted:true};else delete overlays[id];}await persistJobs();await persistOverlays();},
  });
  async function publicBatches(){return Promise.all((await allBatches()).filter(batch=>batch.items.some(item=>visible(batch,item))).map(async batch=>({...batch,items:batch.items.filter(item=>visible(batch,item)).map(item=>{
    const extra=overlays[item.id]||{};const rule=ruleFor(item);const sourceImages=item.sourceImages.map(name=>typeof name==='string'?{name,url:imageUrl(batch.id,'import',name)}:name);const versions=batch.sample?(extra.versions?.length?[extra.versions.at(-1)]:item.versions):[...item.versions,...(extra.versions||[])];
    const taskLabel=taskName(`channel-resources:${batch.id}:${encodeURIComponent(String(item.project||'未命名项目').trim())}`,'');
     return {...item,projectId:item.projectId||batch.projectId||'',taskName:taskLabel||undefined,sourceImages,versions:versions.map(version=>({...version,downloadName:`${(taskLabel||item.project).replace(/[<>:"/\\|?*\x00-\x1f]/g,'_')}_${item.width}x${item.height}.${path.extname(version.file||'').slice(1)||'jpg'}`})),editor:extra.editor||{backgroundUrl:'',referenceUrl:'',layers:[],copyCandidates:[],outpaintCandidates:[]},
       editorJobs:[...generationJobs.values()].filter(job=>job.itemId===item.id&&job.status==='running').map(job=>({id:job.id,kind:job.kind,status:job.status})),
       review:extra.review||item.review,rule:rule?{id:rule.编号,name:rule.资源位,template:rule.模板,description:rule.逐项制作规则,raw:rule.设计要求原文,previewRequired:rule.预览要求==='需要',status:rule.状态}:null,hasRuleConflict:Boolean(rule&&/纯图/.test(rule.设计要求原文||'')&&/(logo|标识|提示语)/i.test(`${item.requirements} ${item.sourceCopy}`))};
  })})));
  }
  async function findItem(id){for(const batch of await allBatches()){const item=batch.items.find(x=>x.id===id&&visible(batch,x));if(item)return {batch,item};}return null;}
  const editorRecord=record=>({backgroundUrl:'',referenceUrl:'',layers:[],copyCandidates:[],outpaintCandidates:[],...(record.editor||{})});
  function allowedUrls(batch,item,record){
    const sources=item.sourceImages.map(entry=>typeof entry==='string'?imageUrl(batch.id,'import',entry):entry.url);
    const editor=editorRecord(record);
    return new Set([...sources,...item.versions.map(v=>v.url),...(record.versions||[]).map(v=>v.url),
      ...(editor.assets||[]).map(v=>v.url),...(editor.copyCandidates||[]).flatMap(v=>[v.url,v.layerUrl]),
      ...(editor.outpaintCandidates||[]).map(v=>v.url)].filter(Boolean));
  }
  function fileForUrl(batch,url){
    const parts=String(url).split('/').filter(Boolean).map(decodeURIComponent);
    if(parts[0]==='storage'&&parts[1]===`channel-resources-${batch.id}`&&parts.length===4)
      return safeChild(storageDir,parts[1],parts[2],parts[3]);
    if(batch.sample&&parts[0]==='channel-sample'&&parts.length===3){
      if(parts[1]==='source')return safeChild(sampleDir,parts[2]);
      if(['candidates-v1','candidates-v2','scene-previews-v1','psd-scenes'].includes(parts[1]))return safeChild(sampleDir,parts[1],parts[2]);
    }
    throw failure('图片地址无效');
  }
  async function readItemImage(batch,item,record,url){
    if(!allowedUrls(batch,item,record).has(url))throw failure('图片不属于当前交付稿');
    const buffer=await fs.readFile(fileForUrl(batch,url));
    const info=await sharp(buffer).metadata().catch(()=>null);
    if(!info?.width||!info?.height||info.width*info.height>25_000_000)throw failure('图片尺寸无效或过大');
    return {buffer,info};
  }
  async function callImageModel(body,idempotencyKey){
    if(generateImage){const output=await generateImage(body,{idempotencyKey});return Buffer.isBuffer(output)?output:output.buffer;}
    const config=await loadCanvasConfig(undefined,{root});
    const jobId=await submitGeneration(config,body,{idempotencyKey});
    await pollJob(config,jobId);
    return (await downloadRaw(config,jobId)).buffer;
  }
  function enqueueGeneration(itemId,kind,work){
    if([...generationJobs.values()].some(job=>job.itemId===itemId&&job.kind===kind&&job.status==='running'))throw failure('此稿已有同类生成任务正在进行',409);
    const id=randomUUID();const job={id,itemId,kind,status:'running',startedAt:new Date().toISOString()};generationJobs.set(id,job);
    Promise.resolve().then(work).then(result=>{job.status='done';job.result=result;job.finishedAt=new Date().toISOString();})
      .catch(error=>{job.status='failed';job.error=String(error.message||error).slice(0,500);job.finishedAt=new Date().toISOString();});
    return job;
  }
  async function saveEditorImage(batch,item,bucket,buffer,extension){
    const file=`${item.id}-${randomUUID().slice(0,8)}.${extension}`;
    const target=safeChild(storageDir,`channel-resources-${batch.id}`,bucket,file);
    await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,buffer);
    return {url:imageUrl(batch.id,bucket,file),file,bytes:buffer.length};
  }
  const handle=async function handle(req,res,url){
    const parts=url.pathname.split('/').filter(Boolean);
    if(parts[0]!=='api'||parts[1]!=='channel-resources')return false;
    if(req.method==='GET'&&parts.length===2)return respond(res,200,{channels,batches:await publicBatches(),ruleCount:rules.length,projects:await projectLogos.projects()});
    if(req.method==='GET'&&parts[2]==='rules'&&parts.length===3)return respond(res,200,{channels,rules});
    if(req.method==='POST'&&parts[2]==='import'&&parts.length===3){
      const input=await requestJson(req,1024*32);const channel=String(input.channel||'');if(!channels.some(c=>c.id===channel))throw failure('请选择有效渠道');
      if(channel!=='huawei')throw failure('当前需求表字段映射仅支持华为渠道；其他渠道可先手动创建逐稿任务');
      const source=path.resolve(String(input.path||'').trim());if(path.extname(source).toLowerCase()!=='.xlsx')throw failure('请选择 .xlsx 需求表');
      const stat=await fs.stat(source).catch(()=>null);if(!stat?.isFile())throw failure('找不到需求表文件');if(stat.size>30*1024*1024)throw failure('需求表不能超过 30MB');
      const id=randomUUID();const importedDir=safeChild(storageDir,`channel-resources-${id}`,'import');await fs.mkdir(importedDir,{recursive:true});
      const python=process.env.CHANNEL_PYTHON||path.join(root,'local-ai','.venv','Scripts','python.exe');
      let parsed;try{const output=await localPython([path.join(root,'scripts','parse-channel-requirements.py'),source,importedDir],{env:{...process.env,PYTHONIOENCODING:'utf-8'},maxBuffer:10*1024*1024,windowsHide:true});parsed=JSON.parse(output.stdout);}catch(e){throw failure(`需求表解析失败：${e.stderr||e.message}`);}
      if(!parsed.rows?.length)throw failure('需求表没有可用的资源位行');
      const items=parsed.rows.flatMap(entry=>normalizeItem(entry.cells,{id,row:entry.row,sourceImages:entry.images}));
      const batch={id,channel,name:String(input.name||path.basename(source,'.xlsx')).trim().slice(0,100),sourceName:path.basename(source),createdAt:new Date().toISOString(),items,sample:false};
      await attachProjectLogo(batch,input);jobs.unshift(batch);await persistJobs();await persistOverlays();return respond(res,201,{id,itemCount:items.length});
    }
    if(req.method==='POST'&&parts[2]==='manual'&&parts.length===3){
      const input=await requestJson(req,1024*32);const channel=String(input.channel||'');if(!channels.some(c=>c.id===channel))throw failure('请选择有效渠道');
      const project=String(input.project||'').trim();if(!project||project.length>100)throw failure('请填写 100 字以内的项目名称');
      const id=randomUUID();const cells={A:project,B:String(input.category||'').trim(),C:String(input.resource||'').trim(),D:String(input.type||'').trim(),E:String(input.quantity||1),F:String(input.size||''),G:String(input.limit||'').trim(),H:String(input.format||'JPG').trim(),J:String(input.template||'').trim(),L:String(input.copy||'').trim(),M:String(input.requirements||'').trim()};
      const items=normalizeItem(cells,{id,row:1});const batch={id,channel,name:String(input.name||`${project} · 渠道资源位`).trim().slice(0,100),sourceName:'手动创建',createdAt:new Date().toISOString(),items,sample:false};
      await attachProjectLogo(batch,input);jobs.unshift(batch);await persistJobs();await persistOverlays();return respond(res,201,{id,itemCount:items.length});
    }
    if(req.method==='POST'&&parts[2]==='batches'&&parts[3]&&parts[4]==='projects'&&parts[5]&&parts[6]==='copy'&&parts.length===7){
      const input=await requestJson(req,4096),source=(await allBatches()).find(batch=>batch.id===parts[3]),project=decodeURIComponent(parts[5]),selected=source?.items.filter(item=>String(item.project||'未命名项目').trim()===project&&!overlays[item.id]?.deleted);
      if(!selected?.length||recycleBin.isTaskHidden(recycleKey(source,selected[0])))throw failure('渠道任务不存在，请刷新列表后重试',404);
      const name=String(input.name||`${project} 副本`).trim();if(!name||[...name].length>100)throw failure('请填写 100 字以内的任务名称');
      if(typeof input.projectId!=='string')throw failure('所属项目无效');
      if(input.projectId&&!(await projectLogos.projects()).some(p=>p.id===input.projectId&&p.status!=='archived'))throw failure('所选项目不存在或已归档，请先调整所属项目');
      const id=randomUUID(),items=selected.map((item,index)=>({id:`${id}-${index+1}`,row:index+1,copyIndex:1,quantity:1,project:name,...Object.fromEntries(['category','resource','type','width','height','limitRaw','maxBytes','format','template','sourceCopy','requirements'].map(k=>[k,item[k]])),sourceImages:[],versions:[],review:null}));
      const batch={id,channel:source.channel,name,sourceName:'复制任务',createdAt:new Date().toISOString(),items,sample:false};
      await attachProjectLogo(batch,input);jobs.unshift(batch);await persistJobs();await persistOverlays();return respond(res,201,{id,itemCount:items.length});
    }
    if(req.method==='DELETE'&&parts[2]==='batches'&&parts[3]&&parts[4]==='projects'&&parts[5]&&parts.length===6){
      const batch=(await allBatches()).find(entry=>entry.id===parts[3]);
      if(batch)setProjectHint(batch.projectId||'');
      if(!batch)return respond(res,404,{error:'渠道批次不存在'});
      const project=decodeURIComponent(parts[5]);
      const selected=batch.items.filter(item=>String(item.project||'未命名项目').trim()===project&&!overlays[item.id]?.deleted);
      if(!selected.length)return respond(res,404,{error:'渠道项目不存在'});
      if([...generationJobs.values()].some(job=>selected.some(item=>item.id===job.itemId)&&job.status==='running'))return respond(res,409,{error:'项目正在制作，请完成后再删除'});
      return respond(res,200,await recycleBin.trashTask(recycleKey(batch,selected[0])));
    }
    if(parts[2]==='items'&&parts[3]){
      const found=await findItem(decodeURIComponent(parts[3]));if(!found)return respond(res,404,{error:'交付稿不存在'});
      setProjectHint(found.item.projectId||found.batch.projectId||'');
      const {batch,item}=found;const record=overlays[item.id]||{versions:[]};
      if(req.method==='GET'&&parts[4]==='jobs'&&parts[5]){
        const job=generationJobs.get(parts[5]);if(!job||job.itemId!==item.id)return respond(res,404,{error:'生成任务不存在'});
        return respond(res,200,job);
      }
      if(req.method==='POST'&&parts[4]==='editor-asset'){
        const input=await requestJson(req,30*1024*1024);
        const match=/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/i.exec(String(input.dataUrl||''));
        if(!match)throw failure('仅支持 JPG、PNG、WebP 图片');
        const buffer=Buffer.from(match[2],'base64');if(buffer.length>20*1024*1024||!buffer.length)throw failure('素材图片不能超过 20MB');
        const info=await sharp(buffer).metadata().catch(()=>null);if(!info?.width||!info?.height||info.width*info.height>25_000_000)throw failure('素材尺寸无效或过大');
        const kind=['reference','clean-background'].includes(input.kind)?input.kind:'layer';
        if(kind==='clean-background'&&(info.width!==item.width||info.height!==item.height))throw failure(`无字底图应为 ${item.width}×${item.height}`);
        const extension=info.format==='jpeg'?'jpg':info.format;
        const saved=await saveEditorImage(batch,item,'editor',buffer,extension);
        const latest=overlays[item.id]||{versions:[]},editor=editorRecord(latest);
        editor.assets=[...(editor.assets||[]),{...saved,kind,name:String(input.name||'上传素材').slice(0,100)}];
        if(kind==='reference')editor.referenceUrl=saved.url;
        if(kind==='clean-background')editor.cleanBackgroundUrl=saved.url;
        latest.editor=editor;overlays[item.id]=latest;await persistOverlays();
        return respond(res,201,{asset:{...saved,kind,name:String(input.name||'上传素材').slice(0,100)}});
      }
      if(req.method==='PUT'&&parts[4]==='editor-draft'){
        const input=await requestJson(req,1024*128);
        const latest=overlays[item.id]||{versions:[]},editor=editorRecord(latest);
        const draft=normalizeChannelDraft(input,item,allowedUrls(batch,item,latest));
        latest.editor={...editor,...draft};overlays[item.id]=latest;await persistOverlays();
        return respond(res,200,{editor:latest.editor});
      }
      if(req.method==='POST'&&parts[4]==='generate-copy'){
        const input=await requestJson(req,1024*16);
        const targetText=String(input.targetText||'').trim();if(!targetText||targetText.length>80)throw failure('请填写 80 字以内的目标文案');
        const referenceUrl=String(input.referenceUrl||record.editor?.referenceUrl||'');
        if(!referenceUrl)throw failure('请先上传原版字效参考图');
        const source=await readItemImage(batch,item,record,referenceUrl);
        const lines=targetText.split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
        if(lines.length>3)throw failure('标题最多 3 行，请将副标题单独制作');
        const layout=lines.length>1?`按 ${lines.length} 行排版，每行文字依次为 ${lines.map((line,index)=>`第${index+1}行「${line}」`).join('、')}。不得合并、改写或遗漏任何一行。`:`文字必须逐字逐符号准确为「${targetText}」。`;
        const prompt=`以输入图片中的中文字为字效参考，只参考笔画形状、材质、色彩、描边、立体阴影和装饰细节。重新设计中文标题。${layout}不要保留或复制原图中的旧文字，不要背景、人物、Logo、额外文案或水印。只输出目标标题，完整居中，字与字不裁切，四周留空。画布背景必须是完全均匀的纯色亮绿 #00FF00，不要渐变、纹理、阴影或其他元素落在背景上。High-quality Chinese game title typography; isolated on solid chroma green #00FF00.`;
        const job=enqueueGeneration(item.id,'copy',async()=>{
          const candidates=[];
          for(let variant=1;variant<=1;variant++){
            const body=buildOutpaintRequest({model:'banana_pro',base64:source.buffer.toString('base64'),prompt,ratio:'21:9',imageSize:'2K'});
            const output=await callImageModel(body,randomUUID());
            const info=await sharp(output).metadata().catch(()=>null);if(!info?.width||!info?.height)throw failure('模型返回的文案图无效');
            const raw=await saveEditorImage(batch,item,'editor',output,info.format==='jpeg'?'jpg':info.format);
            const extracted=await extractChromaTypography(output);
            const layer=extracted.buffer?await saveEditorImage(batch,item,'editor',extracted.buffer,'png'):null;
            const candidate={id:randomUUID(),targetText,referenceUrl,url:raw.url,layerUrl:layer?.url||null,
              extractError:extracted.reason||null,createdAt:new Date().toISOString()};
            candidates.push(candidate);
            const latest=overlays[item.id]||{versions:[]},editor=editorRecord(latest);
            editor.copyCandidates=[candidate];latest.editor=editor;overlays[item.id]=latest;await persistOverlays();
          }
          return {candidates};
        });
        return respond(res,202,{jobId:job.id});
      }
      if(req.method==='POST'&&parts[4]==='outpaint'){
        const input=await requestJson(req,1024*16);const sourceUrl=String(input.sourceUrl||record.editor?.backgroundUrl||item.versions.at(-1)?.url||'');
        if(!sourceUrl)throw failure('请先选择背景源图或上传候选图');
        const source=await readItemImage(batch,item,record,sourceUrl);
        const gaps=channelOutpaintGaps(source.info.width,source.info.height,item.width,item.height,input.occupancy);
        if(gaps.width*gaps.height>18_000_000)throw failure('扩图目标过大，请提高原图占比');
        const prompt=composeOutpaintPrompt(String(input.prompt||'').slice(0,500));
        const job=enqueueGeneration(item.id,'outpaint',async()=>{
          const png=await sharp(source.buffer).png().toBuffer();
          const body=buildOutpaintRequest({model:'rh_image_outpaint',base64:png.toString('base64'),prompt,...gaps});
          const output=await callImageModel(body,randomUUID());
          const info=await sharp(output).metadata().catch(()=>null);
          if(!info?.width||!info?.height||Math.abs(info.width-gaps.width)>16||Math.abs(info.height-gaps.height)>16)
            throw failure('模型扩图尺寸与原图保护区不匹配，已保留原图；请调整占比重试');
          const extraX=Math.max(0,info.width-gaps.width)/2,extraY=Math.max(0,info.height-gaps.height)/2;
          const safe=await createSafeOutpaint({sourceBuffer:source.buffer,generatedBuffer:output,width:info.width,height:info.height,
            sourceRect:{x:(gaps.left+extraX)/info.width,y:(gaps.top+extraY)/info.height,
              width:source.info.width/info.width,height:source.info.height/info.height}});
          const final=await sharp(safe.buffer).resize(item.width,item.height,{fit:'fill',kernel:'lanczos3'}).png().toBuffer();
          const saved=await saveEditorImage(batch,item,'editor',final,'png');
          const candidate={id:randomUUID(),sourceUrl,url:saved.url,occupancy:Number(input.occupancy)||80,
            prompt:String(input.prompt||'').slice(0,500),createdAt:new Date().toISOString()};
          const latest=overlays[item.id]||{versions:[]},editor=editorRecord(latest);
          editor.outpaintCandidates=[candidate,...editor.outpaintCandidates];latest.editor=editor;overlays[item.id]=latest;await persistOverlays();
          return candidate;
        });
        return respond(res,202,{jobId:job.id});
      }
      if(req.method==='POST'&&parts[4]==='versions'){
        const input=await requestJson(req);const match=/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/i.exec(String(input.dataUrl||''));if(!match)throw failure('仅支持 JPG、PNG、WebP 候选图');
        let data=Buffer.from(match[2],'base64');if(!data.length||data.length>30*1024*1024)throw failure('候选图须小于 30MB');
        const info=await sharp(data).metadata().catch(()=>null);if(!info||info.width!==item.width||info.height!==item.height)throw failure(`候选图应为 ${item.width}×${item.height}`);
        const imageFormat=info.format==='jpeg'?'JPG':info.format.toUpperCase();if(!item.format.toUpperCase().includes(imageFormat))throw failure(`此稿要求 ${item.format} 格式`);
        if(input.optimize===true)data=await optimizeChannelCandidate(data,{format:imageFormat,maxBytes:item.maxBytes});
        if(item.maxBytes&&data.length>=item.maxBytes)throw failure(`文件须小于 ${item.limitRaw}`);
        const number=item.versions.length+(record.versions?.length||0)+1;const extension=info.format==='jpeg'?'jpg':info.format;const file=batch.sample?`${item.id}-current-${randomUUID().slice(0,8)}.${extension}`:`${item.id}-v${number}.${extension}`;
        const target=safeChild(storageDir,`channel-resources-${batch.id}`,'candidate',file);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,data);
        let sceneUrl=null,sceneError=null;
        if(batch.channel==='huawei'&&psdSceneTemplates.has(item.template)){
          const sceneFile=batch.sample?`${path.parse(file).name}-psd-scene.jpg`:`${item.id}-v${number}-psd-scene.jpg`;
          const sceneTarget=safeChild(storageDir,`channel-resources-${batch.id}`,'candidate',sceneFile);
          const python=process.env.CHANNEL_PYTHON||path.join(root,'local-ai','.venv','Scripts','python.exe');
          try{
            await localPython([path.join(root,'scripts','render-huawei-psd-preview.py'),path.join(root,'渠道资源位','华为资源位',item.template),target,sceneTarget],{env:{...process.env,PYTHONIOENCODING:'utf-8'},maxBuffer:1024*1024,windowsHide:true});
            sceneUrl=imageUrl(batch.id,'candidate',sceneFile);
          }catch(error){sceneError=`PSD 预览生成失败：${error.stderr||error.message}`.slice(0,500);}
        }
        const previous=record.versions||[];
        const version={name:batch.sample?'当前交付稿':`V${number} 上传候选`,file,bytes:data.length,url:imageUrl(batch.id,'candidate',file),sceneUrl,sceneKind:sceneUrl?'华为 PSD 模板预览':null,sceneError};
        record.versions=batch.sample?[version]:[...previous,version];record.review=null;
        if(batch.sample&&record.editor&&(!record.editor.backgroundUrl||record.editor.backgroundUrl===item.versions[0]?.url||previous.some(entry=>entry.url===record.editor.backgroundUrl)))record.editor.backgroundUrl=version.url;
        overlays[item.id]=record;await persistOverlays();
        if(batch.sample){for(const old of previous){for(const oldUrl of [old.url,old.sceneUrl]){if(!oldUrl?.startsWith(`/storage/channel-resources-${batch.id}/candidate/`))continue;await fs.rm(fileForUrl(batch,oldUrl),{force:true});}}}
        return respond(res,201,{version});
      }
      if(req.method==='POST'&&parts[4]==='review'){
        const input=await requestJson(req,1024*32);const versions=[...item.versions,...(record.versions||[])];if(!versions.length)throw failure('请先添加候选图');
        if(input.versionFile!==versions.at(-1).file)throw failure('请先选中最新候选，再记录验收');
        if(!input.sceneVerified||!input.rulesConfirmed)throw failure('请完成实际场景与规范差异核对后再确认验收');
        record.review={approved:true,note:String(input.note||'').trim().slice(0,1000),at:new Date().toISOString(),versionFile:input.versionFile,versionCount:versions.length};overlays[item.id]=record;await persistOverlays();return respond(res,200,{review:record.review});
      }
    }
    return respond(res,404,{error:'渠道资源位接口不存在'});
  };
  // Project filing must validate the same imported and historical sample groups
  // that the UI sees, including overlay deletions and non-UUID sample IDs.
  handle.listProjectBatches=publicBatches;
  return handle;
}
