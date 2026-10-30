import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {safeChild} from './core.mjs';
import {readFile} from 'node:fs/promises';
import {mutateJson} from './json-store.mjs';
import {bannerSourceToken} from './community-banner-session.mjs';
import {prepareCommunityMaterial,communityMaterialRequest,normalizeCommunityMaterial,selectCommunityMaterial} from './community-materials.mjs';
import {prepareCommunityMaterialFont} from './community-material-font.mjs';
import {runLayeredIllustration} from './community-layered-illustration-jobs.mjs';
import {layeredIllustrationWorkflow} from './community-layered-illustration.mjs';

const fail=(message,status=409)=>Object.assign(Error(message),{status}),now=()=>new Date().toISOString();
export function createCommunityMaterialJobs({tasksFile,storageDir,templateMap,jobs,loadConfig,createCanvas,submitGeneration,pollJob,downloadRaw,invalidate,prepareFont=prepareCommunityMaterialFont}){
 const running=new Map(),load=async id=>(JSON.parse(await readFile(tasksFile,'utf8'))).find(t=>t.id===id);
 const update=(id,runId,mutate)=>mutateJson(tasksFile,tasks=>{const task=tasks.find(t=>t.id===id);if(task?.communityGeneration?.runId!==runId)throw fail('素材任务已变化');mutate(task);return task;});
 const start=(id,runId)=>{
  if(running.has(runId))return;const operation=(async()=>{
   try{
    let task=await load(id),run=task.communityGeneration;const template=templateMap.get(run.templateId),directory=safeChild(storageDir,id,'material-generation',runId);await fs.mkdir(directory,{recursive:true});
    if(run.workflow===layeredIllustrationWorkflow){await runLayeredIllustration({id,runId,load,update,storageDir,templateMap,loadConfig,createCanvas,submitGeneration,pollJob,downloadRaw,invalidate});return;}
    let raw;
    if(run.rawFile)raw=await fs.readFile(safeChild(directory,'raw-image'));
    else{
     const config=await loadConfig(task);if(config.enabled===false)throw Error('画布服务尚未启用');
     if(!run.providerJobId){
      let body;
      if(run.submittedAt){body=JSON.parse(await fs.readFile(safeChild(directory,'request.json'),'utf8'));}
      else{
       const readAsset=async name=>{const a=task.assets.find(a=>a.name===name);if(!a)throw Error('参考素材已移除');return fs.readFile(safeChild(storageDir,id,a.bucket||'assets',a.name));};
       const images=await Promise.all(run.referenceNames.map(readAsset));
       if(run.licensedFont){const guide=await fs.readFile(safeChild(directory,'font-guide.png'));if(createHash('sha256').update(guide).digest('hex')!==run.fontGuideSha256)throw Error('版权字形参考已变化，停止生成');images.push(guide);}
       if(run.sceneName)images.push(await readAsset(run.sceneName));
       body=communityMaterialRequest(run,images);await fs.writeFile(safeChild(directory,'request.json'),JSON.stringify(body));
      }
      let canvasId=run.canvasId;if(!canvasId){canvasId=await createCanvas(config,{title:`${task.project} 独立素材`});await update(id,runId,t=>{t.communityGeneration.canvasId=canvasId;});}
      body.canvas_id=canvasId;const key=run.providerRequestKey||createHash('sha256').update(`community-material:${id}:${runId}`).digest('hex');
      if(run.submittedAt&&Date.now()-Date.parse(run.submittedAt)>23*3600000)throw fail('本次提交已超过安全查询时限，请核对画布任务记录后再处理');
      await update(id,runId,t=>Object.assign(t.communityGeneration,{submittedAt:run.submittedAt||now(),providerRequestKey:key,stage:'submitting'}));
      let jobId;try{jobId=await submitGeneration(config,body,{idempotencyKey:key});}catch(error){if(![400,401,402,403,422].includes(Number(error.code||error.status)))error.materialStatus='interrupted';throw error;}
      await update(id,runId,t=>Object.assign(t.communityGeneration,{providerJobId:jobId,stage:'processing'}));
     }
     task=await load(id);run=task.communityGeneration;await pollJob(config,run.providerJobId);raw=(await downloadRaw(config,run.providerJobId)).buffer;
     await fs.writeFile(safeChild(directory,'raw-image'),raw);await update(id,runId,t=>Object.assign(t.communityGeneration,{rawFile:'raw-image',stage:'saving'}));
    }
    task=await load(id);run=task.communityGeneration;
    const buffer=await normalizeCommunityMaterial(raw,run.kind,run.matte,run.canvas),meta=await sharp(buffer).metadata(),name=`素材-${run.kind}-${runId}.png`,assetDir=safeChild(storageDir,id,'assets');await fs.mkdir(assetDir,{recursive:true});await fs.writeFile(safeChild(assetDir,name),buffer);
    await update(id,runId,current=>{
     const job=current.communityGeneration,time=now(),asset={name,mime:'image/png',bytes:buffer.length,width:meta.width,height:meta.height,url:`/storage/${id}/assets/${encodeURIComponent(name)}`,role:run.kind==='illustration'?'mother-candidate':run.kind,materialKind:run.kind,exactText:run.text,generatorModel:run.model,sourceTemplateId:template.id,materialRunId:runId,createdAt:time,...(run.kind==='illustration'?{sceneCharacters:{mode:'reference-character-scene'}}:{})};
     if(run.licensedFont)asset.fontProvenance={fontId:run.licensedFont.id,fontName:run.licensedFont.name,sha256:run.licensedFont.sha256,method:'licensed-glyph-reference-v1',guideSha256:run.fontGuideSha256};
     const unchanged=bannerSourceToken(current)===run.sourceToken;
     if(!current.assets.some(a=>a.materialRunId===runId))current.assets.push(asset);
     let applied=false;
     if(unchanged){try{selectCommunityMaterial(current,{name,expectedUpdatedAt:current.updatedAt},template,{now:time});invalidate(current,'选用独立素材，待确认母版');applied=true;}catch(error){job.applyWarning=error.message;}}
     Object.assign(job,{status:'done',stage:'ready',done:1,assetName:name,applied,completedAt:time});current.updatedAt=time;
     (current.history||=[]).push({at:time,action:`生成独立${run.kind==='illustration'?'插画':run.kind==='title'?'主标':'副标'}素材${applied?'并应用':'，已保存到素材库'}：${run.prompt}`,by:'设计师',status:current.status});
    });
   }catch(error){await update(id,runId,t=>Object.assign(t.communityGeneration,{status:error.materialStatus||'failed',error:error.message,completedAt:now()})).catch(()=>{});}
   finally{jobs.delete(id);}
  })();running.set(runId,operation);operation.finally(()=>running.delete(runId)).catch(()=>{});
 };
 const submit=async(id,input)=>{
  const task=await load(id);if(!task)throw fail('任务不存在',404);
  const duplicate=[task.communityGeneration,...(task.communityMaterialRuns||[])].find(r=>r?.requestId===input.requestId);
  if(duplicate)return task;
  if(task.communityGeneration?.phase==='materials'&&task.communityGeneration.status==='interrupted')throw fail('上一次素材提交结果待确认，请先继续查询，避免重复生成');
  if(jobs.has(id)||task.communityGeneration?.status==='running'||task.outpaint?.status==='running')throw fail('当前任务正在生成，请等待完成');
   if(task.communityObjectJob?.status==='running')throw fail('当前素材正在处理，请等待完成');
   if(task.status==='已完成'&&task.deliveredPackage)throw fail('请先开始新版本再生成素材');
  const run=prepareCommunityMaterial(task,input,templateMap.get(task.masterTemplateId));run.sourceToken=bannerSourceToken(task);
  const licensed=await prepareFont(task,run.kind);
  if(licensed){run.licensedFont=licensed.font;run.fontGuideSha256=createHash('sha256').update(licensed.guide).digest('hex');const directory=safeChild(storageDir,id,'material-generation',run.runId);await fs.mkdir(directory,{recursive:true});await fs.writeFile(safeChild(directory,'font-guide.png'),licensed.guide);}
   const saved=await mutateJson(tasksFile,tasks=>{const current=tasks.find(t=>t.id===id);if(current.updatedAt!==task.updatedAt||bannerSourceToken(current)!==run.sourceToken||current.communityGeneration?.status==='running'||current.communityObjectJob?.status==='running'||current.outpaint?.status==='running'||current.status==='已完成'&&current.deliveredPackage)throw fail('母版已变化或正在处理，请刷新后再提交');
   if(current.communityGeneration?.phase==='materials')(current.communityMaterialRuns||=[]).push(current.communityGeneration);
   current.communityGeneration={...run,status:'running',stage:'preparing',done:0,total:run.workflow===layeredIllustrationWorkflow?2:1,startedAt:now()};return current;
  });jobs.set(id,run.runId);start(id,run.runId);return saved;
 };
 const resume=async id=>{
   const task=await load(id),run=task?.communityGeneration;if(run?.phase!=='materials'||!['failed','interrupted'].includes(run.status)||!run.rawFile&&!run.providerJobId&&!run.submittedAt&&run.workflow!==layeredIllustrationWorkflow)throw fail('没有可恢复的素材任务');
   if(task.status==='已完成'&&task.deliveredPackage)throw fail('请先开始新版本再恢复生成');
  if(jobs.has(id))throw fail('素材任务仍在执行');await running.get(run.runId);
  const saved=await update(id,run.runId,t=>Object.assign(t.communityGeneration,{status:'running',error:'',stage:'preparing'}));jobs.set(id,run.runId);start(id,run.runId);return saved;
 };
 const restore=async()=>{for(const task of JSON.parse(await readFile(tasksFile,'utf8'))){const run=task.communityGeneration;if(run?.phase!=='materials'||run.status!=='running')continue;
   if(run.submittedAt&&!run.providerJobId&&!run.rawFile||run.workflow===layeredIllustrationWorkflow&&run.steps.some(s=>s.submittedAt&&!s.providerJobId&&!s.rawFile))await update(task.id,run.runId,t=>Object.assign(t.communityGeneration,{status:'interrupted',error:'提交回执待确认，请继续查询同一次任务'}));
  else{jobs.set(task.id,run.runId);start(task.id,run.runId);}
 }};
 return {submit,resume,restore};
}
