import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {mutateJson,writeJson} from './json-store.mjs';
import {safeChild} from './core.mjs';
import {layeredReflowVersion,usesLayeredCommunityReflow,planLayeredCommunityTarget,renderLocalCommunityTarget,communityTargetReflowRequest,normalizeCommunityTargetReflow,communityMasterLogoAssetName} from './community-target-reflow.mjs';
import {synchronizeCommunityTargets,rememberCommunityTargetRevision,sceneDigest} from './community-target-sync.mjs';
import {bannerMasterSnapshot} from './community-banner-session.mjs';
import {communityArtworkTargetPending,communityTargetHasComposition} from '../public/community-artwork-state.js';
import {popupConfig} from '../public/community-popup-model.js';
import {renderCommunityArtworkEditSource} from './community-master-workspace.mjs';

const fail=(message,status=409)=>Object.assign(Error(message),{status}),now=()=>new Date().toISOString();
const digest=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
const targetToken=(task,id)=>digest(['assetByTemplate','layoutByTemplate','backgroundByTemplate','communityObjectLayersByTemplate'].map(k=>task.parameters?.[k]?.[id]));
const complete=(task,id)=>!communityArtworkTargetPending(task,{id,communityPlacement:true});
const cacheKey=(id,sourceHash,templateId,run,plan)=>digest([layeredReflowVersion,'scene-v1',id,sourceHash,templateId,run.model,plan.prompt,plan.titleZone,plan.embeddedCharacter]);

export function createCommunityTargetReflowJobs({tasksFile,storageDir,templateMap,jobs,loadConfig,createCanvas,submitGeneration,pollJob,downloadRaw,confirmedSource,fingerprint,invalidate,concurrency=2}){
 const running=new Map(),load=async id=>(JSON.parse(await fs.readFile(tasksFile,'utf8'))).find(t=>t.id===id);
 const update=(id,runId,work)=>mutateJson(tasksFile,tasks=>{const t=tasks.find(t=>t.id===id);if(t?.communityGeneration?.runId!==runId)throw fail('延展任务已变化');work(t,t.communityGeneration);t.updatedAt=now();return t;});
 const assertCurrent=async(task,run)=>{if(task.communityMasterApproval?.fingerprint!==run.fingerprint||await fingerprint(task)!==run.fingerprint)throw fail('已确认母版发生变化，结果已保留，未覆盖当前尺寸');};
 const syncTask=async task=>{
  const source=await confirmedSource(task);
  return synchronizeCommunityTargets(task,{templates:task.targetTemplateIds.map(id=>templateMap.get(id)).filter(Boolean),master:templateMap.get(task.masterTemplateId),fingerprint:task.communityMasterApproval.fingerprint,sceneHash:sceneDigest(source.buffer),storageDir});
 };
 const synchronize=async(id,input={})=>mutateJson(tasksFile,async tasks=>{
  const task=tasks.find(t=>t.id===id);if(!task)throw fail('任务不存在',404);
  if(!usesLayeredCommunityReflow(task))return task;
  if(task.status==='已完成'&&task.deliveredPackage)throw fail('请先开始新版本再同步');
  if(jobs.has(id)||task.communityGeneration?.status==='running'||task.outpaint?.status==='running')throw fail('当前任务正在生成');
  if(input.expectedUpdatedAt&&input.expectedUpdatedAt!==task.updatedAt)throw fail('画面已更新，请刷新后再同步');
  const fp=task.communityMasterApproval?.fingerprint;if(!fp||fp!==await fingerprint(task))throw fail('母版已更新，请先重新确认母版');
  const result=await syncTask(task);
  if(result.updated.length){invalidate(task,'本地同步母版图层，保留各尺寸构图');(task.history||=[]).push({at:now(),action:`本地同步 ${result.updated.length} 张尺寸稿，保留原有背景与手动构图，无需重新生图`,by:'设计师',status:task.status});}
  task.updatedAt=now();return task;
 });
 const start=(id,runId)=>{
  if(running.has(runId))return;
  const operation=(async()=>{
   try{
    let task=await load(id),run=task.communityGeneration;await assertCurrent(task,run);
    const source=await confirmedSource(task),sourceHash=digest(source.buffer),master=templateMap.get(task.masterTemplateId);
    const work=async item=>{
     if(item.status==='done')return;
     const template=templateMap.get(item.templateId),plan=item.plan;
     try{
      await update(id,runId,(t,r)=>{Object.assign(r.items.find(i=>i.templateId===template.id),{status:'running',stage:plan.method==='local'?'本地适配':run.reuseCachedOnly?'恢复已生成结果':'AI 重排',startedAt:now()});});
      let buffer,providerJobId,reused=false;
      if(plan.method==='local')buffer=await renderLocalCommunityTarget(source.buffer,master,plan);
      else{
       // Stable across retries/restarts. A failed local validation never starts
       // another paid request; raw results and provider receipt are durable.
       const inputBuffer=plan.editSource?await renderCommunityArtworkEditSource(await fs.readFile(safeChild(storageDir,id,plan.editSource.bucket,plan.editSource.assetName)),template,plan.editSource.placement):source.buffer;
       const key=item.cacheKey||cacheKey(id,digest(inputBuffer),template.id,run,plan);
       const dir=safeChild(storageDir,id,'target-reflow',key);await fs.mkdir(dir,{recursive:true});
       const recordFile=path.join(dir,'receipt.json');let record;
       try{record=JSON.parse(await fs.readFile(recordFile,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;record={key};}
       let raw;
       if(record.rawSha256){raw=await fs.readFile(path.join(dir,'raw-image'));if(digest(raw)!==record.rawSha256)throw Error('已保存的原始结果发生变化，请检查缓存');reused=true;}
       else{
        if(run.reuseCachedOnly)throw Error('已有结果尚未完整保存，未重新提交生图');
        const config=await loadConfig(task);if(config.enabled===false)throw Error('画布服务未启用');
        if(!record.providerJobId){
         let body;
         if(record.submittedAt){
          if(Date.now()-Date.parse(record.submittedAt)>23*3600000)throw Error('提交回执超过安全查询时限，请核对画布任务记录');
          body=JSON.parse(await fs.readFile(path.join(dir,'request.json'),'utf8'));
         }else{
          body=communityTargetReflowRequest(run,plan,inputBuffer);
          body.canvas_id=await createCanvas(config,{title:`${task.project} ${template.width}×${template.height}`});
          await fs.writeFile(path.join(dir,'request.json'),JSON.stringify(body));
         }
         record.submittedAt||=now();await writeJson(recordFile,record);
         providerJobId=await submitGeneration(config,body,{idempotencyKey:key});
         record.providerJobId=providerJobId;await writeJson(recordFile,record);
        }
        providerJobId=record.providerJobId;
        await update(id,runId,(t,r)=>Object.assign(r.items.find(i=>i.templateId===template.id),{providerJobId,stage:'等待 AI 结果'}));
        await pollJob(config,providerJobId);raw=(await downloadRaw(config,providerJobId)).buffer;
        await fs.writeFile(path.join(dir,'raw-image'),raw);record.rawSha256=digest(raw);await writeJson(recordFile,record);
       }
       providerJobId=record.providerJobId;
       await update(id,runId,(t,r)=>Object.assign(r.items.find(i=>i.templateId===template.id),{cacheKey:key,rawAvailable:true}));
       buffer=await normalizeCommunityTargetReflow(raw,plan);
      }
      const name=`分层延展-${template.width}x${template.height}-${runId}.png`,meta=await sharp(buffer).metadata();
      const dir=safeChild(storageDir,id,'assets');await fs.mkdir(dir,{recursive:true});await fs.writeFile(safeChild(dir,name),buffer);
      await mutateJson(tasksFile,async tasks=>{
       const current=tasks.find(t=>t.id===id);if(current?.communityGeneration?.runId!==runId)throw fail('延展任务已变化');
       const job=current.communityGeneration,entry=job.items.find(i=>i.templateId===template.id);
       const asset={name,mime:'image/png',url:`/storage/${id}/assets/${encodeURIComponent(name)}`,role:'generated-background',width:meta.width,height:meta.height,bytes:buffer.length,sourceTemplateId:template.id,extensionMode:layeredReflowVersion,sourceMasterFingerprint:run.fingerprint,sourceSceneHash:sourceHash,sourceBackgroundName:source.assetName,generatorModel:plan.method==='local'?'local-approved-crop':run.model,sourceJobId:providerJobId,createdAt:now()};
       if(!current.assets.some(a=>a.name===name))current.assets.push(asset);
       let conflict;
       try{await assertCurrent(current,run);}catch(error){conflict=error.message;}
       if(targetToken(current,template.id)!==entry.sourceToken)conflict='此尺寸在生成期间被修改，结果已存入素材，未覆盖手动调整';
       if(conflict){Object.assign(entry,{status:'failed',stage:'结果已保留',assetName:name,error:conflict,completedAt:now()});current.updatedAt=now();return;}
       const p=current.parameters;p.assetByTemplate||={};p.layoutByTemplate||={};p.backgroundByTemplate||={};
       (current.communityTargetVersions||=[]).push({templateId:template.id,at:now(),label:'调整尺寸前',snapshot:Object.fromEntries(['assetByTemplate','layoutByTemplate','backgroundByTemplate','communityArtworkByTemplate','communityTargetRevisions','communityObjectLayersByTemplate'].map(k=>[k,structuredClone(p[k]?.[template.id]??null)]))});
       p.assetByTemplate[template.id]={...plan.assets,background:name};p.layoutByTemplate[template.id]=structuredClone(plan.layouts);
       if(plan.objectLayers||p.communityObjectLayersByTemplate?.[template.id]) (p.communityObjectLayersByTemplate||={})[template.id]=structuredClone(plan.objectLayers||[]);
       p.backgroundByTemplate[template.id]={focalX:50,focalY:50,scale:100,smartExpand:false,url:''};
       // Old whole-artwork markers must not describe the new independent layers.
       if(p.communityArtworkByTemplate)delete p.communityArtworkByTemplate[template.id];
       rememberCommunityTargetRevision(current,template,{fingerprint:run.fingerprint,sceneHash:sourceHash,masterSnapshot:run.masterSnapshot||bannerMasterSnapshot(task),plan});
       invalidate(current,`完成 ${template.width}×${template.height} 分层延展`);
       Object.assign(entry,{status:'done',stage:'完成',assetName:name,reused,completedAt:now(),durationMs:Date.now()-Date.parse(entry.startedAt)});
       job.done=job.items.filter(i=>i.status==='done').length;current.updatedAt=now();
      });
     }catch(error){await update(id,runId,(t,r)=>{Object.assign(r.items.find(i=>i.templateId===template.id),{status:'failed',stage:'未完成',error:error.message,completedAt:now()});}).catch(()=>{});}
    };
    // Cheap local work finishes first. Only genuinely different compositions
    // use AI, with bounded parallelism instead of six serial image jobs.
    for(const item of run.items.filter(i=>i.plan.method==='local'))await work(item);
    const pending=run.items.filter(i=>i.plan.method==='ai');let cursor=0;
    await Promise.all(Array.from({length:Math.min(concurrency,pending.length)},async()=>{while(cursor<pending.length)await work(pending[cursor++]);}));
    await update(id,runId,(t,r)=>{
     const ids=t.targetTemplateIds.filter(id=>id!==t.masterTemplateId),covered=ids.filter(id=>complete(t,id));
     const failed=r.items.filter(i=>i.status==='failed');
     r.done=covered.length;r.total=ids.length;r.status=!failed.length&&covered.length===ids.length?'done':'partial';r.completedAt=now();r.durationMs=Date.now()-Date.parse(r.startedAt);
     r.errors=[...new Set([...failed.map(i=>`${templateMap.get(i.templateId)?.name||i.templateId}：${i.error}`),...ids.filter(id=>!complete(t,id)).map(id=>`${templateMap.get(id)?.name||id}：${r.items.find(i=>i.templateId===id)?.error||'此尺寸尚未延展'}`)])];
     (t.history||=[]).push({at:r.completedAt,action:`分层尺寸延展：完成 ${r.done}/${r.total}，本地 ${r.items.filter(i=>i.plan.method==='local').length} 张，AI ${r.items.filter(i=>i.plan.method==='ai').length} 张`,by:'设计师',status:t.status});
    });
   }catch(error){await update(id,runId,(t,r)=>Object.assign(r,{status:'failed',error:error.message,completedAt:now()})).catch(()=>{});}
   finally{jobs.delete(id);}
  })();running.set(runId,operation);operation.finally(()=>running.delete(runId)).catch(()=>{});
 };
 const submit=async(id,input)=>{
  let task=await load(id);if(!task)throw fail('任务不存在',404);
  const duplicate=[task.communityGeneration,...(task.communityTargetRuns||[])].find(r=>r?.requestId===input.requestId&&input.requestId);if(duplicate)return task;
  if(!usesLayeredCommunityReflow(task))throw fail('此接口需要独立插画与文案母版',422);
  if(task.status==='已完成'&&task.deliveredPackage)throw fail('请先开始新版本再延展尺寸');
  if(jobs.has(id)||task.communityGeneration?.status==='running'||task.outpaint?.status==='running')throw fail('当前任务正在生成');
  const fp=task.communityMasterApproval?.fingerprint;if(!fp||fp!==await fingerprint(task))throw fail('母版已更新，请先重新确认母版');
  if(!['gpt-image-2','banana_pro'].includes(input.model))throw fail('请选择有效模型',422);
  const available=task.targetTemplateIds.filter(id=>id!==task.masterTemplateId),explicit=Array.isArray(input.targetTemplateIds);
  const selected=explicit?[...new Set(input.targetTemplateIds)]:available;
  if(selected.some(id=>!available.includes(id))||!selected.length)throw fail('延展尺寸不属于当前任务',422);
  task=await synchronize(id,{expectedUpdatedAt:task.updatedAt});
  if(explicit&&selected.some(id=>popupConfig(task,{id})))throw fail('透明弹窗请使用弹窗面板重新排版，原方案已保留');
  const targets=(explicit?selected:selected.filter(id=>!complete(task,id))).filter(id=>!popupConfig(task,{id}));
  if(!targets.length)return task;
  for(const name of new Set([...Object.values(task.parameters.assetByTemplate?.[task.masterTemplateId]||{}),communityMasterLogoAssetName(task,templateMap.get(task.masterTemplateId))])){
   const asset=task.assets.find(a=>a.name===name);if(!asset||asset.width&&asset.height)continue;
   const meta=await sharp(safeChild(storageDir,id,asset.bucket||'assets',name)).metadata();asset.width=meta.width;asset.height=meta.height;
  }
  const runId=randomUUID(),master=templateMap.get(task.masterTemplateId),items=targets.map(id=>({templateId:id,status:'pending',sourceToken:targetToken(task,id),previous:structuredClone(Object.fromEntries(['assetByTemplate','layoutByTemplate','backgroundByTemplate','communityArtworkByTemplate'].map(k=>[k,task.parameters[k]?.[id]??null]))),plan:planLayeredCommunityTarget(task,master,templateMap.get(id),{prompt:explicit?input.prompt:''})}));
  const saved=await mutateJson(tasksFile,async tasks=>{const current=tasks.find(t=>t.id===id);if(current.updatedAt!==task.updatedAt)throw fail('画面已更新，请重新提交');
   if(current.communityGeneration)(current.communityTargetRuns||=[]).push(structuredClone(current.communityGeneration));
   current.communityGeneration={runId,requestId:input.requestId||runId,workflow:layeredReflowVersion,phase:'targets',model:input.model,fingerprint:fp,masterSnapshot:bannerMasterSnapshot(current),status:'running',items,total:items.length,done:0,errors:[],startedAt:now()};current.updatedAt=now();return current;
  });jobs.set(id,runId);start(id,runId);return saved;
 };
 const restore=async()=>{for(const t of JSON.parse(await fs.readFile(tasksFile,'utf8'))){const r=t.communityGeneration;if(r?.workflow===layeredReflowVersion&&r.status==='running'){jobs.set(t.id,r.runId);start(t.id,r.runId);}}};
 const resume=async(id,input={})=>{
  const task=await load(id);if(!task)throw fail('任务不存在',404);
  if(jobs.has(id)||task.communityGeneration?.status==='running'||task.outpaint?.status==='running')throw fail('当前任务正在生成');
  if(task.status==='已完成'&&task.deliveredPackage)throw fail('请先开始新版本再修改');
  if(input.expectedUpdatedAt!==task.updatedAt)throw fail('画面已更新，请刷新后再恢复');
  const old=task.communityGeneration,item=old?.items?.find(i=>i.templateId===input.templateId),template=templateMap.get(input.templateId);
  if(old?.workflow!==layeredReflowVersion||old.runId!==input.runId||item?.status!=='failed'||item.plan?.method!=='ai'||!task.targetTemplateIds.includes(input.templateId))throw fail('没有可恢复的当前尺寸结果');
  await assertCurrent(task,old);
  if(targetToken(task,input.templateId)!==item.sourceToken)throw fail('此尺寸已有手动调整，未覆盖当前画面');
  const source=await confirmedSource(task),inputBuffer=item.plan.editSource?await renderCommunityArtworkEditSource(await fs.readFile(safeChild(storageDir,id,item.plan.editSource.bucket,item.plan.editSource.assetName)),template,item.plan.editSource.placement):source.buffer;
  const key=item.cacheKey||cacheKey(id,digest(inputBuffer),input.templateId,old,item.plan),directory=safeChild(storageDir,id,'target-reflow',key);
  let receipt,raw;try{receipt=JSON.parse(await fs.readFile(path.join(directory,'receipt.json'),'utf8'));raw=await fs.readFile(path.join(directory,'raw-image'));}catch{throw fail('没有已保存的完整结果，未重新提交生图');}
  if(!receipt.rawSha256||digest(raw)!==receipt.rawSha256)throw fail('已有结果校验失败，原画面已保留');
  // Validate before changing the job or entering any provider code path.
  await normalizeCommunityTargetReflow(raw,item.plan);
  const plan=structuredClone(item.plan);
  if(communityTargetHasComposition(task,template)){plan.layouts=structuredClone(task.parameters.layoutByTemplate[template.id]);plan.assets=structuredClone(task.parameters.assetByTemplate[template.id]);}
  const runId=randomUUID(),saved=await mutateJson(tasksFile,tasks=>{
   const current=tasks.find(t=>t.id===id);if(current.updatedAt!==task.updatedAt)throw fail('画面已更新，请重新恢复');
   (current.communityTargetRuns||=[]).push(structuredClone(current.communityGeneration));
   current.communityGeneration={runId,requestId:runId,workflow:layeredReflowVersion,phase:'targets',model:old.model,fingerprint:old.fingerprint,masterSnapshot:old.masterSnapshot||bannerMasterSnapshot(task),status:'running',reuseCachedOnly:true,items:[{templateId:template.id,status:'pending',sourceToken:targetToken(current,template.id),plan,cacheKey:key,rawAvailable:true}],total:1,done:0,errors:[],startedAt:now()};current.updatedAt=now();return current;
  });jobs.set(id,runId);start(id,runId);return saved;
 };
 return {submit,resume,restore,synchronize,syncTask,wait:async runId=>running.get(runId)};
}
