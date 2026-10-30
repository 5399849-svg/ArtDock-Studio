import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {safeChild} from './core.mjs';
import {mutateJson} from './json-store.mjs';
import {normalizeCommunityMaterial} from './community-materials.mjs';
import {communityRewardGroups} from '../public/community-object-state.js';
import {refreshPlacedRewardAppearances,communityObjectAppearance} from '../public/community-object-layers.js';
import {objectFail,objectHash,ensureCommunityObjects,touchCommunityObjects,assertCommunityObjectEdit,communityCurrentSource,readCommunityCurrentSource,readCommunityObjectAsset,publishCommunityObjectPng} from './community-object-assets.mjs';

export function validateObjectSelection(selection){
 const box=selection?.box,points=selection?.points;
 if(!Array.isArray(box)||box.length!==4||box.some(n=>!Number.isFinite(n)||n<0||n>1)||box[2]-box[0]<.02||box[3]-box[1]<.02)throw objectFail('请框选要提取的主体');
 if(!Array.isArray(points)||!points.length||points.length>12||points.some(p=>!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)||![0,1].includes(p.label)||p.x<box[0]||p.x>box[2]||p.y<box[1]||p.y>box[3])||!points.some(p=>p.label===1))throw objectFail('请在框内点击要保留的部位，最多 12 个选点');
 return {box:[...box],points:points.map(p=>({x:p.x,y:p.y,label:p.label}))};
}
export async function preserveObjectCutout(source,mask,selection,{withBounds=false}={}){
 const [a,b]=await Promise.all([source,mask].map(buffer=>sharp(buffer,{limitInputPixels:40000000}).toColourspace('srgb').ensureAlpha().raw().toBuffer({resolveWithObject:true})));
 if(a.info.width!==b.info.width||a.info.height!==b.info.height)throw objectFail('抠图遮罩尺寸不一致，原图已保留');
 const {width:w,height:h}=a.info,box=selection.box.map((n,i)=>Math.round(n*(i%2?h:w)));let ink=0,area=0;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const p=(y*w+x)*4,inside=x>=box[0]&&x<box[2]&&y>=box[1]&&y<box[3];a.data[p+3]=inside?Math.min(a.data[p+3],b.data[p+3]):0;if(!a.data[p+3])a.data[p]=a.data[p+1]=a.data[p+2]=0;if(inside){area++;if(a.data[p+3]>32)ink++;}}
 if(ink<Math.max(8,area*.005)||ink>area*.99)throw objectFail('抠图尚未分离出有效主体，请调整选框和保留、排除选点');
 for(const point of selection.points.filter(p=>p.label===1)){const x=Math.min(w-1,Math.round(point.x*w)),y=Math.min(h-1,Math.round(point.y*h));if(a.data[(y*w+x)*4+3]<32)throw objectFail('抠图遗漏了保留选点，请补充选点后重试');}
 const result=await sharp(a.data,{raw:a.info}).trim({background:'#00000000',threshold:5}).png().toBuffer({resolveWithObject:true});
 return withBounds?{buffer:result.data,bounds:{left:-result.info.trimOffsetLeft||0,top:-result.info.trimOffsetTop||0,width:result.info.width,height:result.info.height}}:result.data;
}
export function communityStyleRequest(run,reference){
 const front=run.layer==='foreground',matte=run.matte==='green'?'#00FF00':'#FF00FF';
 return {model:run.model,task_type:'image',bot_id:'canvas',ratio:'1:1',image_size:'2K',output_format:'png',quality:'high',prompt:`为游戏奖励道具制作一份可重复使用的${front?'前景光效与边缘装饰':'空底板、边框及装饰'}，只输出这一份独立素材。
【设计要求】${run.prompt}
【内容约束】不绘制奖励道具、物品、人物、卷轴、瓶子、食物、文字、数字、Logo或水印。所有道具由工作台使用原始PNG在本地叠加，本次不能重画或替换原道具。${reference?'参考图只参考外围底板的造型、边框、材质、配色与光效；中心主体已遮去，不能补回、模仿或猜测参考图中的物品。':''}
${front?'画面中心至少60%的区域保持空白，装饰只沿外围分布，适合作为道具前方的稀疏星光、闪光与边缘装饰。':'底板居中，完整轮廓，四周留出8%的空白，中心留干净空间放置原道具，不绘制物品轮廓或占位符。'}
【抠底要求】素材之外的全部空白区域使用完全平坦、精确的纯色 ${matte}，四边也须为该底色；装饰本身不要使用此色。不要棋盘格、渐变背景或额外展示底。工作台会将底色转换为真实透明，保留装饰自身的颜色与光泽。`,...(reference?{images:[{data_base64:reference.toString('base64')}]}:{})};
}
export async function decorationReference(dataUrl){
 const match=/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl||'');if(!match)throw objectFail('样式参考图需要 PNG、JPG 或 WebP');
 const buffer=Buffer.from(match[2],'base64');if(buffer.length>10*1024*1024)throw objectFail('样式参考图不能超过 10MB');
 const normalized=await sharp(buffer,{limitInputPixels:40000000}).rotate().flatten({background:'#eee'}).resize(768,768,{fit:'contain',background:'#eee'}).png().toBuffer();
 // Only perimeter styling enters the provider request, never the reference icon.
 const cover=Buffer.from('<svg width="768" height="768"><rect x="123" y="123" width="522" height="522" rx="24" fill="#eeeeee"/></svg>');
 return sharp(normalized).composite([{input:cover}]).png().toBuffer();
}

export function createCommunityObjectJobs({tasksFile,storageDir,templateMap,jobs,segment,loadConfig,createCanvas,submitGeneration,pollJob,downloadRaw,invalidate}){
 const running=new Map(),load=async id=>JSON.parse(await fs.readFile(tasksFile,'utf8')).find(t=>t.id===id);
 const update=(id,runId,callback)=>mutateJson(tasksFile,tasks=>{const task=tasks.find(t=>t.id===id);if(task?.communityObjectJob?.runId!==runId)throw objectFail('素材处理任务已变化',409);callback(task,task.communityObjectJob);return task;});
 const start=(id,runId)=>{
  if(running.has(runId))return;
  const operation=(async()=>{
   try{
    let task=await load(id),run=task.communityObjectJob,dir=safeChild(storageDir,id,'object-generation',runId);await fs.mkdir(dir,{recursive:true});
    let buffer,cutoutBounds;
    if(run.kind==='style'){
     let raw;if(run.rawReady)raw=await fs.readFile(path.join(dir,'raw-image'));
     else{
      const config=await loadConfig(task);if(config.enabled===false)throw objectFail('画布服务尚未启用');
      if(!run.providerJobId){
       if(run.submittedAt&&Date.now()-Date.parse(run.submittedAt)>23*3600000)throw Object.assign(objectFail('本次提交已超过安全查询时限，请核对原任务，避免重复生成'),{objectStatus:'interrupted'});
       const request=JSON.parse(await fs.readFile(path.join(dir,'request.json'),'utf8'));let canvasId=run.canvasId;
       if(!canvasId){canvasId=await createCanvas(config,{title:`${task.project} 道具装饰`});await update(id,runId,(_,job)=>{job.canvasId=canvasId;});}
       request.canvas_id=canvasId;const key=run.providerRequestKey||objectHash(`community-object:${id}:${runId}`);
       await update(id,runId,(_,job)=>Object.assign(job,{submittedAt:run.submittedAt||new Date().toISOString(),providerRequestKey:key,stage:'submitting'}));
       let providerJobId;try{providerJobId=await submitGeneration(config,request,{idempotencyKey:key});}catch(error){if(![400,401,402,403,422].includes(Number(error.code||error.status)))error.objectStatus='interrupted';throw error;}
       await update(id,runId,(_,job)=>Object.assign(job,{providerJobId,stage:'processing'}));
      }
      task=await load(id);run=task.communityObjectJob;await pollJob(config,run.providerJobId);raw=(await downloadRaw(config,run.providerJobId)).buffer;
      await fs.writeFile(path.join(dir,'raw-image'),raw);await update(id,runId,(_,job)=>Object.assign(job,{rawReady:true,stage:'saving'}));
     }
     const meta=await sharp(raw).metadata();if(!meta.width||!meta.height||Math.abs(Math.log(meta.width/meta.height))>.08)throw objectFail('装饰返回比例不符，原始结果已保留');
     try{buffer=await normalizeCommunityMaterial(raw,'title',run.matte);}catch(error){error.message=error.message.replace(/文字|文案/g,'装饰').replace(/字形/g,'图案');throw error;}
    }else{
     let source;try{source=await fs.readFile(path.join(dir,'source.png'));}catch(error){if(error.code!=='ENOENT')throw error;
      source=run.kind==='character'?await readCommunityCurrentSource({storageDir,task,source:run.source,template:templateMap.get(run.templateId)}):await readCommunityObjectAsset(storageDir,task,run.source.name);
      await fs.writeFile(path.join(dir,'source.png'),source);await update(id,runId,(_,job)=>{job.sourceSha256=objectHash(source);});
     }
     let mask;try{mask=await fs.readFile(path.join(dir,'mask.png'));}catch(error){if(error.code!=='ENOENT')throw error;await update(id,runId,(_,job)=>{job.stage='segmenting';});mask=await segment({sourceBuffer:source,selection:run.selection,workDir:dir});await fs.writeFile(path.join(dir,'mask.png'),mask);}
     const preserved=await preserveObjectCutout(source,mask,run.selection,{withBounds:true});buffer=preserved.buffer;cutoutBounds=preserved.bounds;
    }
    task=await load(id);run=task.communityObjectJob;
    const name=`${run.kind==='style'?'道具装饰':run.kind==='character'?'当前稿人物':'奖励道具'}-${runId}.png`,asset=await publishCommunityObjectPng({storageDir,task,buffer,name,role:run.kind==='style'?'community-object-style':run.kind==='character'?'community-object-character':'community-object-body',extra:{objectRunId:runId,sourceAssetName:run.source?.name,sourceSha256:run.sourceSha256,cutoutBounds,cutoutSource:run.kind==='character'?run.source:undefined,extractionMethod:run.kind==='style'?undefined:'source-pixel-mask-v1'}});
    await update(id,runId,(current,job)=>{
     const state=ensureCommunityObjects(current);if(!current.assets.some(a=>a.objectRunId===runId))current.assets.push(asset);
     if(run.kind==='style'){
      state.styleCandidate={id:runId,name:run.name,layer:run.layer,...(run.layer==='foreground'?{foregroundName:name}:{backingName:name}),rewardId:run.rewardId,scope:run.scope,baseStyle:run.baseStyle,baseRewards:run.baseRewards};
     }else if(run.kind==='character'){
      const existing=state.characters.find(c=>c.sourceToken===run.source.token);if(existing){(existing.versions||=[]).push(existing.assetName);existing.assetName=name;}else state.characters.push({id:randomUUID(),name:'当前稿人物',assetName:name,sourceName:run.source.name,sourceToken:run.source.token,versions:[]});
     }else{const reward=state.rewards.find(r=>r.id===run.rewardId);if(!reward)throw objectFail('对应道具已移除，提取结果已保存',409);reward.bodyName=name;refreshPlacedRewardAppearances(current,[reward.id]);}
     if(run.kind!=='style'){
      let used=false;for(const layers of Object.values(current.parameters?.communityObjectLayersByTemplate||{}))for(const layer of layers){
       if(run.kind==='character'&&layer.appearance.kind==='character'){const group=state.characters.find(c=>c.id===layer.appearance.groupId&&c.sourceToken===run.source.token);if(group){layer.appearance=communityObjectAppearance(current,'character',group.id);used=true;}}
       if(run.kind==='reward-cutout'&&layer.appearance.kind==='reward'&&layer.appearance.groupId===run.rewardId)used=true;
      }
      if(used){current.communityMasterApproval=null;invalidate?.(current,'更新画布独立素材');}
     }
     touchCommunityObjects(current);Object.assign(job,{status:'done',stage:'ready',assetName:name,completedAt:new Date().toISOString()});
    });
    if(run.kind!=='style')await Promise.all(['source.png','mask.png','segmented.png','refined.png','prompts.json'].map(file=>fs.rm(safeChild(dir,file),{force:true}).catch(()=>{})));
   }catch(error){await update(id,runId,(_,job)=>Object.assign(job,{status:error.objectStatus||'failed',error:error.message,completedAt:new Date().toISOString()})).catch(()=>{});}
   finally{if(jobs.get(id)===`object:${runId}`)jobs.delete(id);}
  })();running.set(runId,operation);operation.finally(()=>running.delete(runId)).catch(()=>{});
 };
 const submit=async(id,input)=>{
  if(!/^[a-zA-Z0-9-]{8,80}$/.test(input.requestId||''))throw objectFail('缺少有效操作编号');
  let task=await load(id);if(!task)throw objectFail('任务不存在',404);
  const signature=objectHash(JSON.stringify({kind:input.kind,rewardId:input.rewardId,selection:input.selection,sourceToken:input.sourceToken,prompt:input.prompt,layer:input.layer,scope:input.scope,referenceDataUrl:input.referenceDataUrl,model:input.model}));
  const duplicate=[task.communityObjectJob,...(task.communityObjectRuns||[])].find(r=>r?.requestId===input.requestId);if(duplicate){if(duplicate.inputSignature!==signature)throw objectFail('操作编号对应的内容已变化，请重新提交',409);return task;}
  assertCommunityObjectEdit(task,input,{templateMap,jobs});
  if(task.communityObjectJob?.status==='interrupted')throw objectFail('上一次装饰生成回执待确认，请先继续查询',409);
  const run={runId:randomUUID(),requestId:input.requestId,inputSignature:signature,kind:input.kind,templateId:task.masterTemplateId,status:'running',stage:'preparing',startedAt:new Date().toISOString()};
  let request;
  if(input.kind==='style'){
   if(task.communityObjects?.styleCandidate)throw objectFail('请先采用或放弃已有样式候选',409);
   if(!['banana_pro','gpt-image-2'].includes(input.model)||!['backing','foreground'].includes(input.layer))throw objectFail('请选择有效的生图模型和装饰图层');
   const reward=communityRewardGroups(task).find(r=>r.id===input.rewardId);if(!reward)throw objectFail('请先选中一个奖励道具');
   const prompt=String(input.prompt||'').trim();if(!prompt||prompt.length>1600)throw objectFail('请填写 1–1600 字的样式要求');
   const scope=input.scope==='all'?'all':'current';Object.assign(run,{rewardId:reward.id,scope,name:String(input.name||'AI 底板').trim().slice(0,40),prompt,model:input.model,layer:input.layer,matte:/紫|粉|洋红|magenta|purple|pink/i.test(prompt)?'green':'magenta',baseStyle:structuredClone(reward.style),baseRewards:communityRewardGroups(task).filter(r=>scope==='all'||r.id===reward.id).map(r=>({id:r.id,style:structuredClone(r.style)}))});
   request=communityStyleRequest(run,input.referenceDataUrl?await decorationReference(input.referenceDataUrl):null);
  }else if(['character','reward-cutout'].includes(input.kind)){
   run.selection=validateObjectSelection(input.selection);
   if(input.kind==='character'&&run.selection.points.filter(p=>p.label===1).length<2)throw objectFail('请在人物脸部和身体各添加一个保留选点');
   if(input.kind==='character'){run.source=communityCurrentSource(task);if(input.sourceToken!==run.source.token)throw objectFail('当前生成稿已变化，请重新打开人物提取',409);}
   else{const reward=communityRewardGroups(task).find(r=>r.id===input.rewardId);if(!reward)throw objectFail('道具不存在');Object.assign(run,{rewardId:reward.id,source:{name:reward.bodyName||reward.sourceName}});}
  }else throw objectFail('请选择人物提取、道具抠图或 AI 装饰');
  if(request){const dir=safeChild(storageDir,id,'object-generation',run.runId);await fs.mkdir(dir,{recursive:true});await fs.writeFile(path.join(dir,'request.json'),JSON.stringify(request));}
  const saved=await mutateJson(tasksFile,tasks=>{
   const current=tasks.find(t=>t.id===id);assertCommunityObjectEdit(current,input,{templateMap,jobs});
   if(current.updatedAt!==task.updatedAt)throw objectFail('画面已变化，请重新提交',409);
   ensureCommunityObjects(current);if(current.communityObjectJob)(current.communityObjectRuns||=[]).push(current.communityObjectJob);current.communityObjectJob=run;return current;
  });jobs.set(id,`object:${run.runId}`);start(id,run.runId);return saved;
 };
 const resume=async id=>{
  const task=await load(id),run=task?.communityObjectJob;if(!run||!['failed','interrupted'].includes(run.status))throw objectFail('没有可继续处理的素材任务',409);
  if(run.kind==='style'&&!run.rawReady&&!run.providerJobId&&!run.submittedAt)throw objectFail('上次尚未提交生成，请重新提交样式要求',409);
  assertCommunityObjectEdit(task,{}, {templateMap,jobs,revision:false});await running.get(run.runId);
  const saved=await update(id,run.runId,(_,job)=>Object.assign(job,{status:'running',stage:'preparing',error:''}));jobs.set(id,`object:${run.runId}`);start(id,run.runId);return saved;
 };
 const restore=async()=>{for(const task of JSON.parse(await fs.readFile(tasksFile,'utf8'))){const run=task.communityObjectJob;if(run?.status!=='running')continue;
  if(run.kind==='style'&&run.submittedAt&&!run.providerJobId&&!run.rawReady)await update(task.id,run.runId,(_,job)=>Object.assign(job,{status:'interrupted',error:'生成提交回执待确认，请继续查询同一次任务'}));
  else{jobs.set(task.id,`object:${run.runId}`);start(task.id,run.runId);}
 }};
 return {submit,resume,restore};
}
