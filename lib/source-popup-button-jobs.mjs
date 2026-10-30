import fs from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import sharp from 'sharp';
import {safeChild} from './core.mjs';
import {mutateJson} from './json-store.mjs';
import {sourceComposition,isSourceAdaptation} from '../public/source-adaptation-model.js';
import {rememberSourceVersion} from './source-adaptation.mjs';
import {COMMUNITY_POPUP_ID} from '../public/community-popup-model.js';
import {rememberCommunityPopupVersion} from './community-popup.mjs';
const now=()=>new Date().toISOString(),fail=(message,status=409)=>Object.assign(Error(message),{status});
const buttonPopup=(task,id)=>isSourceAdaptation(task)?sourceComposition(task,id)?.popup:task.parameters?.communityPopupByTemplate?.[id];
export function sourcePopupButtonRequest(prompt,reference){
 const references=Array.isArray(reference)?reference:reference?[reference]:[];
 return {model:'gpt-image-2',task_type:'image',bot_id:'canvas',ratio:'21:9',image_size:'2K',quality:'high',background:'transparent',output_format:'png',
  prompt:`绘制一个游戏活动弹窗的独立横向按钮底板。设计师要求：${prompt}\n只绘制一个完整、清晰的按钮底板，不要文字、字符、数字、Logo、水印、人物或场景。中间留出干净的文案区域，文字将在工作台中另行排版。底板周围保持真实透明 Alpha，不要棋盘格、白色或黑色背景。完整保留边缘和装饰，适合缩小后使用。${references.length?'附图按上传顺序依次为图1至图'+references.length+'。按设计师描述参考形状、颜色和材质，不复制文案、人物或场景。':''}`,
  ...(references.length?{images:references.map(r=>({data_base64:r.toString('base64')}))}:{})};
}
export async function normalizeButtonBacking(raw){
 const {data,info}=await sharp(raw,{limitInputPixels:40000000}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 let clear=0,ink=0;for(let i=3;i<data.length;i+=info.channels){if(data[i]<20)clear++;if(data[i]>30)ink++;}
 if(clear<info.width*info.height*.03||ink<info.width*info.height*.001)throw Error('底板缺少真实透明区域或有效图案，原按钮已保留');
 return sharp(raw).trim({background:'#00000000',threshold:5}).png().toBuffer();
}
export function createSourcePopupButtonJobs({tasksFile,storageDir,jobs,loadConfig,createCanvas,submitGeneration,pollJob,downloadRaw,invalidate}){
 const operations=new Map(),load=async id=>JSON.parse(await fs.readFile(tasksFile,'utf8')).find(t=>t.id===id);
 const update=(id,runId,fn)=>mutateJson(tasksFile,tasks=>{const t=tasks.find(t=>t.id===id);if(t?.communityGeneration?.runId!==runId)throw fail('按钮生成任务已变化');fn(t);return t;});
 function start(id,runId){
  if(operations.has(runId))return;
  const operation=(async()=>{try{
   let task=await load(id),run=task.communityGeneration;
   const directory=safeChild(storageDir,id,'button-generation',runId);await fs.mkdir(directory,{recursive:true});let raw;
   if(run.rawFile)raw=await fs.readFile(safeChild(directory,'raw-image'));
   else{
    const config=await loadConfig(task);if(config.enabled===false)throw Error('画布服务尚未启用');
    if(!run.providerJobId){
     let body;
     if(run.submittedAt){
      if(Date.now()-Date.parse(run.submittedAt)>23*3600000)throw fail('本次提交已超过安全查询时限，请先核对画布任务记录');
      body=JSON.parse(await fs.readFile(safeChild(directory,'request.json'),'utf8'));
     }else{
      const references=[];for(const name of run.referenceNames||[run.referenceName].filter(Boolean)){
       const asset=task.assets.find(a=>a.name===name&&!a.libraryDeletedAt);if(!asset)throw Error('参考图已移除');
       references.push(await fs.readFile(safeChild(storageDir,id,asset.bucket||'assets',asset.name)));
      }
      body=sourcePopupButtonRequest(run.prompt,references);await fs.writeFile(safeChild(directory,'request.json'),JSON.stringify(body));
     }
     let canvasId=run.canvasId;if(!canvasId){canvasId=await createCanvas(config,{title:`${task.project} 按钮底板`});await update(id,runId,t=>{t.communityGeneration.canvasId=canvasId;});}
     const key=createHash('sha256').update(`popup-button:${id}:${runId}`).digest('hex');
     await update(id,runId,t=>Object.assign(t.communityGeneration,{submittedAt:run.submittedAt||now(),stage:'submitting'}));
     let jobId;try{jobId=await submitGeneration(config,{...body,canvas_id:canvasId},{idempotencyKey:key});}catch(error){if(![400,401,402,403,422].includes(Number(error.code||error.status)))error.buttonStatus='interrupted';throw error;}
     await update(id,runId,t=>Object.assign(t.communityGeneration,{providerJobId:jobId,stage:'processing'}));
    }
    task=await load(id);run=task.communityGeneration;await pollJob(config,run.providerJobId);raw=(await downloadRaw(config,run.providerJobId)).buffer;
    await fs.writeFile(safeChild(directory,'raw-image'),raw);await update(id,runId,t=>Object.assign(t.communityGeneration,{rawFile:true,stage:'saving'}));
   }
   const buffer=await normalizeButtonBacking(raw),meta=await sharp(buffer).metadata(),name=`按钮底板-${runId}.png`,assetDir=safeChild(storageDir,id,'assets');await fs.mkdir(assetDir,{recursive:true});await fs.writeFile(safeChild(assetDir,name),buffer);
   await update(id,runId,current=>{
    const job=current.communityGeneration,popup=buttonPopup(current,job.templateId),time=now();
    const applied=Boolean(current.targetTemplateIds.includes(job.templateId)&&JSON.stringify(popup)===job.popupToken&&!(current.status==='已完成'&&current.deliveredPackage));
    if(applied)(isSourceAdaptation(current)?rememberSourceVersion:rememberCommunityPopupVersion)(current,'AI 生成按钮底板前');
    if(!current.assets.some(a=>a.name===name))current.assets.push({name,label:'AI 按钮底板',role:'button',canvasTemplateId:job.templateId,mime:'image/png',width:meta.width,height:meta.height,bytes:buffer.length,url:`/storage/${id}/assets/${encodeURIComponent(name)}`,generatorModel:'gpt-image-2',materialRunId:runId,createdAt:time});
    if(applied){popup.buttonBackingAsset=name;if(!isSourceAdaptation(current)){((current.parameters.assetByTemplate||={})[job.templateId]||={}).button=name;if(current.communityTargetReviews)delete current.communityTargetReviews[job.templateId];}invalidate(current,'使用 AI 按钮底板');}
    Object.assign(job,{status:'done',stage:'ready',done:1,applied,assetName:name,error:'',completedAt:time});current.updatedAt=time;
    (current.history||=[]).push({at:time,action:`生成透明按钮底板${applied?'并应用':'，保存到已有底板'}：${job.prompt}`,by:'设计师',status:current.status});
   });
  }catch(error){await update(id,runId,t=>Object.assign(t.communityGeneration,{status:error.buttonStatus||'failed',error:error.message,completedAt:now()})).catch(()=>{});}
  finally{jobs.delete(id);}})();operations.set(runId,operation);operation.finally(()=>operations.delete(runId)).catch(()=>{});
 }
 function check(task,input){
  if(!task)throw fail('任务不存在',404);
  if(input.templateId!==COMMUNITY_POPUP_ID||!task.targetTemplateIds.includes(input.templateId)||!buttonPopup(task,input.templateId))throw fail('请先应用透明弹窗方案，再生成按钮底板');
  if(task.status==='已完成'&&task.deliveredPackage)throw fail('请先开始新版本');
  if(input.expectedUpdatedAt!==task.updatedAt)throw fail('任务已更新，请刷新后重试');
  if(jobs.has(task.id)||['communityGeneration','communityObjectJob','outpaint'].some(k=>task[k]?.status==='running'))throw fail('请等待当前任务处理完成');
 }
 async function submit(id,input){
  const written=[];let saved;try{saved=await mutateJson(tasksFile,async tasks=>{
   const task=tasks.find(t=>t.id===id);
   if(task&&[task.communityGeneration,...(task.popupButtonRuns||[])].some(r=>r?.phase==='popup-button'&&r.requestId===input.requestId))return task;
   check(task,input);const old=task.communityGeneration;
   if(old?.phase==='popup-button'&&old.status==='interrupted')throw fail('请继续处理上次提交，避免重复生成');
   const prompt=String(input.prompt||'').trim();if(!prompt||prompt.length>1200)throw fail('底板样式请填写 1–1200 个字',422);
   if(!/^[\w-]{8,100}$/.test(input.requestId||''))throw fail('请求标识无效',422);
   const referenceName=String(input.referenceName||''),references=input.references??(referenceName?[{assetName:referenceName}]:[]);
   if(!Array.isArray(references)||references.length>5)throw fail('最多添加 5 张参考图',422);
   let bytes=0;const prepared=[];
   for(const ref of references){
    if(ref?.assetName){const asset=task.assets.find(a=>a.name===ref.assetName&&!a.libraryDeletedAt&&/^image\/(png|jpeg|webp)$/.test(a.mime)&&(a.role==='popup-button-reference'||a.role==='button'||buttonPopup(task,input.templateId).buttonBackingAsset===a.name));if(!asset)throw fail('参考底板不属于当前任务');const stat=await fs.stat(safeChild(storageDir,id,asset.bucket||'assets',asset.name));bytes+=stat.size;prepared.push({asset});}
    else{const match=/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(ref?.dataUrl||'');if(!match)throw fail('参考图请使用 PNG、JPG 或 WebP',422);const buffer=Buffer.from(match[2],'base64');if(buffer.length>10*1048576)throw fail('单张参考图不能超过 10 MB',422);const meta=await sharp(buffer,{limitInputPixels:40000000}).metadata();if(!['png','jpeg','webp'].includes(meta.format))throw fail('参考图格式无效',422);bytes+=buffer.length;prepared.push({buffer,meta,label:String(ref.name||'按钮参考图').slice(0,150)});}
   }
   if(bytes>25*1048576)throw fail('参考图总大小不能超过 25 MB',422);
   const referenceNames=[];for(const ref of prepared){if(ref.asset){referenceNames.push(ref.asset.name);continue;}const name=`按钮参考-${randomUUID()}.${ref.meta.format==='jpeg'?'jpg':ref.meta.format}`,folder=safeChild(storageDir,id,'assets');await fs.mkdir(folder,{recursive:true});const file=safeChild(folder,name);await fs.writeFile(file,ref.buffer,{flag:'wx'});written.push(file);task.assets.push({name,label:ref.label,role:'popup-button-reference',canvasTemplateId:input.templateId,mime:`image/${ref.meta.format}`,width:ref.meta.width,height:ref.meta.height,bytes:ref.buffer.length,createdAt:now(),url:`/storage/${id}/assets/${encodeURIComponent(name)}`});referenceNames.push(name);}
   if(old?.phase==='popup-button')(task.popupButtonRuns||=[]).push(old);
   task.communityGeneration={phase:'popup-button',runId:randomUUID(),requestId:input.requestId,templateId:input.templateId,prompt,referenceName,referenceNames,popupToken:JSON.stringify(buttonPopup(task,input.templateId)),status:'running',stage:'preparing',done:0,total:1,startedAt:now()};task.updatedAt=now();return task;
  });}catch(error){await Promise.all(written.map(file=>fs.unlink(file).catch(()=>{})));throw error;}
  const run=saved.communityGeneration;if(run?.phase==='popup-button'&&run.status==='running'&&!jobs.has(id)){jobs.set(id,run.runId);start(id,run.runId);}return saved;
 }
 async function resume(id,input){
  const saved=await mutateJson(tasksFile,tasks=>{const task=tasks.find(t=>t.id===id);check(task,input);const run=task.communityGeneration;if(run?.phase!=='popup-button'||!['failed','interrupted'].includes(run.status)||!run.submittedAt&&!run.providerJobId&&!run.rawFile)throw fail('没有可继续处理的按钮生成');Object.assign(run,{status:'running',error:'',stage:'preparing'});return task;});
  jobs.set(id,saved.communityGeneration.runId);start(id,saved.communityGeneration.runId);return saved;
 }
 async function restore(){for(const t of JSON.parse(await fs.readFile(tasksFile,'utf8'))){const run=t.communityGeneration;if(run?.phase!=='popup-button'||run.status!=='running')continue;
  if(run.submittedAt&&!run.providerJobId&&!run.rawFile)await update(t.id,run.runId,c=>Object.assign(c.communityGeneration,{status:'interrupted',error:'提交回执待确认，请继续处理本次生成'}));
  else{jobs.set(t.id,run.runId);start(t.id,run.runId);}
 }}
 return {submit,resume,restore,settled:async()=>Promise.all([...operations.values()])};
}
