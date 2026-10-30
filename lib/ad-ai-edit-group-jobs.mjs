import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {safeChild} from './core.mjs';
import {adAiSameTypeSpecs} from '../public/ad-ai-scope.js';
import {AD_AI_EDIT_MODEL,generateAdAiEdit,planAdAiEdit,adAiEditMode,validateAdAiRecompositionResult} from './ad-ai-edit.mjs';
import {AD_AI_PROPORTION_METHOD,adAiProportionRepair} from './ad-ai-proportion.mjs';
import {isAdAiEditActive,isAdAiEditLocked,publicAdAiEdit} from './ad-ai-edit-jobs.mjs';
import {normalizeAdAiOutput} from './ad-ai-frame.mjs';
import {planAdAiRetouch,maskAdAiRetouchInput,finishAdAiRetouch} from './ad-ai-retouch.mjs';
import {adAiOriginalReference,readAdAiOriginalReference} from './ad-ai-original-reference.mjs';
import {assessAdAiPalette} from './ad-ai-palette.mjs';
import {updateAdWorkingDraft} from './ad-version-lifecycle.mjs';
import {snapshotAdAiReferences,readAdAiReferenceBuffers} from './ad-ai-references.mjs';
import {AD_AI_LAYOUT_REFERENCE_METHOD,validateAdAiReferenceResult} from './ad-ai-reference-guard.mjs';
import {adAiModel} from '../public/ad-ai-models.js';

const fail=(message,status=409)=>Object.assign(Error(message),{status}),now=()=>new Date().toISOString();
const fields=['sourceAssetId','logoAssetId','zoom','offsetX','offsetY','logoScale','logoX','logoY'];
const draftKey=d=>fields.map(k=>d?.[k]??null);
const token=(b,i)=>createHash('sha256').update(JSON.stringify([b.sourceSha256,i.versions?.at(-1)?.number||0,draftKey(i.draft)])).digest('hex');
const shared=['status','error','rawReady','resultReady','providerJobId','submittedAt','model'];

export function createAdAiGroupJobs({root,storageDir,batches,save,getCatalog,assetBuffer,renderJpg,renderForSpec,saveVersions,embeddedLogo,applyWorkingDraft,generate=generateAdAiEdit}){
 const running=new Map();
 const sharing=new Map();
 const one=(item,job=item.aiEditJob)=>({editJob:publicAdAiEdit(job),pending:isAdAiEditActive(job),...(job?.status==='awaiting_review'?{candidate:job.candidate}:{}),...(job?.status==='completed'?{draft:item.draft,draftDirty:item.draftDirty}:{}),...(job?.versionNumber?{version:item.versions.find(v=>v.number===job.versionNumber)}:{})});
 const result=(batch,item,job=item.aiEditJob)=>({...one(item,job),groupJobs:(job?.groupSpecIds||[]).flatMap(specId=>{const target=batch.items[specId];return target?.aiEditJob?.groupId===job.groupId?[{specId,...one(target)}]:[];})});
 const leader=(batch,item)=>{
  const child=item.aiEditJob,job=batch.items[child?.groupLeaderSpecId]?.aiEditJob;
  if(!job?.members||job.groupId!==child?.groupId)throw fail('同类修改记录已变化，请刷新页面');
  return {job,item:batch.items[job.groupLeaderSpecId]};
 };
 const owned=(batch,m)=>batch.items[m.specId]?.aiEditJob?.id===m.jobId;
 const check=(batch,job)=>{
  if(!batches.includes(batch)||job.members.some(m=>!owned(batch,m)||token(batch,batch.items[m.specId])!==m.baseToken))throw fail('生成期间有同类稿件发生变化，结果已保留，整组未覆盖');
 };
 const update=async(batch,job,values,{skipUnchanged=false}={})=>{
  if(skipUnchanged){
   const next={...job,...values},same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
   if(Object.entries(values).every(([key,value])=>same(job[key],value))&&job.members.filter(m=>owned(batch,m)).every(m=>{const child=batch.items[m.specId].aiEditJob;return child===job||shared.every(key=>!Object.hasOwn(next,key)||same(child[key],next[key]));}))return;
  }
  const time=now();Object.assign(job,values,{updatedAt:time});
  for(const m of job.members)if(owned(batch,m)){
   const child=batch.items[m.specId].aiEditJob;
   if(child!==job)for(const k of shared)if(Object.hasOwn(job,k))child[k]=job[k];
   child.updatedAt=time;
  }
  await save();
 };
 const start=(batch,job)=>{
  if(running.has(job.id))return;
  const operation=(async()=>{
   try{
    const sheet=await getCatalog(batch),specById=new Map(sheet.specs.map(s=>[s.id,s]));
    const committed=job.members.map(m=>batch.items[m.specId]?.versions.find(v=>v.aiEdit?.groupId===job.groupId));
    if(committed.every(Boolean)){
     job.members.forEach((m,i)=>{if(owned(batch,m))batch.items[m.specId].aiEditJob.versionNumber=committed[i].number;});
     await update(batch,job,{status:'completed',error:''});return;
    }
    if(sheet.sourceSha256!==job.catalogSha)throw fail('尺寸规范已变化，整组未覆盖原稿');
    await update(batch,job,{status:'preparing',error:''});check(batch,job);
    const generationSpec=specById.get(job.generationSpecId);if(!generationSpec)throw fail('同类尺寸规范已变化');
    const source=batch.assets.find(a=>a.id===job.baseDraft.sourceAssetId&&a.role==='visual');if(!source)throw fail('原素材不存在',422);
    const workDir=safeChild(storageDir,`ad-resources-${batch.id}`,'ai-edit',job.id);await fs.mkdir(workDir,{recursive:true});
    for(const m of job.members){
     const child=batch.items[m.specId].aiEditJob;
     if(!child.basePreviewUrl){const name=`before-${m.specId}.jpg`;await fs.writeFile(path.join(workDir,name),await renderForSpec(batch,specById.get(m.specId),m.baseDraft));child.basePreviewUrl=`/storage/ad-resources-${batch.id}/ai-edit/${job.id}/${name}`;}
    }
    await save();let generated,newSource=null;
    if(job.plan.imageInstruction){
     const resultPath=path.join(workDir,'result.png');
     if(job.resultReady)generated=await fs.readFile(resultPath);
     else{
      const inputPath=path.join(workDir,'input.png');let input;
      try{input=await fs.readFile(inputPath);}catch(e){if(e.code!=='ENOENT')throw e;input=await sharp(await renderJpg(await assetBuffer(batch,source),{...generationSpec,minBytes:0,maxBytes:null},job.baseDraft)).png().toBuffer();await fs.writeFile(inputPath,input);}
      const rawPath=path.join(workDir,'raw-image');let raw;
      if(job.rawReady)raw=await fs.readFile(rawPath);
      else{
       const originalReferenceBuffer=await readAdAiOriginalReference({batch,job,workDir,assetBuffer});
       const referenceBuffers=await readAdAiReferenceBuffers({storageDir,batch,job});
       raw=await generate({root,sourceBuffer:job.plan.retouch?await maskAdAiRetouchInput(input,job.plan.retouch):input,originalReferenceBuffer,referenceBuffers,spec:generationSpec,instruction:job.plan.imageInstruction,embeddedLogo:false,logoBounds:job.logoAreas?.length?job.logoAreas:undefined,job,onUpdate:values=>update(batch,job,values)});
       await fs.writeFile(rawPath,raw);await update(batch,job,{rawReady:true});
      }
      const normalized=await normalizeAdAiOutput(raw,generationSpec,job.generationFrame);
      generated=job.plan.retouch?await finishAdAiRetouch(input,normalized.buffer,job.plan.retouch):normalized.buffer;
      await fs.writeFile(resultPath,generated);await update(batch,job,{resultReady:true,outputAdaptation:normalized.adaptation});
     }
     await validateAdAiReferenceResult({storageDir,batch,job,workDir,generated,update:values=>update(batch,job,values)});
     if(job.originalPaletteGuard){
      const reference=await readAdAiOriginalReference({batch,job,workDir,assetBuffer});
      const paletteAssessment=await assessAdAiPalette(reference,generated);await update(batch,job,{paletteAssessment});
      if(!paletteAssessment.consistent)throw Object.assign(Error('AI 修改稿的蓝紫配色偏离上传原图，整组原稿已保留'),{editStatus:'needs_revision'});
     }
     await validateAdAiRecompositionResult({job,workDir,generated,update:values=>update(batch,job,values)});
     const filename=`visual-ai-edit-${job.id}.png`;await fs.writeFile(safeChild(storageDir,`ad-resources-${batch.id}`,'asset',filename),generated);
     newSource={id:job.assetId,role:'visual',name:`${batch.project}_AI同类修改_${generationSpec.width}x${generationSpec.height}.png`,width:generationSpec.width,height:generationSpec.height,url:`/storage/ad-resources-${batch.id}/asset/${filename}`,sourceFormat:'AIEdit',logoFree:true,hasEmbeddedLogo:false,aiSourceAssetId:source.id,aiEditId:job.id,aiSpecId:job.groupLeaderSpecId,aiGroupSpecIds:job.groupSpecIds};
     if(source.toneReferenceAssetId)newSource.toneReferenceAssetId=source.toneReferenceAssetId;
    }
    const entries=[];
    for(const m of job.members){
     const spec=specById.get(m.specId);if(!spec)throw fail('同类尺寸规范已变化');
     const draft={...m.plan.nextDraft,...(newSource?{sourceAssetId:newSource.id,zoom:1,offsetX:0,offsetY:0}:{})};
     if(spec.logo==='forbidden')draft.logoAssetId='';
     const currentSource=batch.assets.find(a=>a.id===draft.sourceAssetId),logo=spec.logo==='required'&&!embeddedLogo(newSource||currentSource)?batch.assets.find(a=>a.id===draft.logoAssetId&&a.role==='logo'):null;
     const image=newSource?generated:await assetBuffer(batch,currentSource);
     entries.push({spec,draft,buffer:await renderJpg(image,spec,draft,logo?await assetBuffer(batch,logo):null),input:{aiEdit:{jobId:m.jobId,groupId:job.groupId,scope:'same-ratio',prompt:job.prompt,model:job.model,baseVersion:m.baseVersion}}});
    }
    if((await getCatalog(batch)).sourceSha256!==job.catalogSha)throw fail('尺寸规范已变化，整组结果已保留，未覆盖原稿');
    check(batch,job);await update(batch,job,{status:'saving'});
    if(job.reviewBeforeApply){
     const folder=`ad-resources-${batch.id}`;
     for(const entry of entries){const filename=`candidate-${entry.spec.id}.jpg`;await fs.writeFile(safeChild(storageDir,folder,'ai-edit',job.id,filename),entry.buffer);}
     check(batch,job);if(newSource&&!batch.assets.some(a=>a.id===newSource.id))batch.assets.push(newSource);
     for(const entry of entries)batch.items[entry.spec.id].aiEditJob.candidate={id:job.id,url:`/storage/${folder}/ai-edit/${job.id}/candidate-${entry.spec.id}.jpg`,draft:entry.draft,width:entry.spec.width,height:entry.spec.height,bytes:entry.buffer.length};
     await update(batch,job,{status:'awaiting_review',error:''});return;
    }
    await saveVersions(batch,entries,{beforeCommit:versions=>{
     check(batch,job);if(newSource&&!batch.assets.some(a=>a.id===newSource.id))batch.assets.push(newSource);
     job.members.forEach((m,index)=>{const item=batch.items[m.specId];item.draft=entries[index].draft;item.autoError='';item.autoWarning='';Object.assign(item.aiEditJob,{status:'completed',error:'',versionNumber:versions[index].number,updatedAt:now()});});
    }});
   }catch(error){
    const status=error.editStatus||(error.status===409?'conflict':'failed');
    for(const m of job.members)if(owned(batch,m))Object.assign(batch.items[m.specId].aiEditJob,{status,error:error.message,updatedAt:now()});
    await save();
   }
  })();
  running.set(job.id,operation);operation.finally(()=>running.delete(job.id)).catch(()=>{});
 };
 const submit=async(batch,spec,item,input)=>{
  const requestId=String(input.requestId||'');if(!/^[a-zA-Z0-9-]{8,80}$/.test(requestId))throw fail('缺少有效的修改请求编号',422);
  const duplicate=[item.aiEditJob,...(item.aiEditHistory||[])].find(j=>j?.requestId===requestId);if(duplicate)return result(batch,item,duplicate);
  const model=adAiModel(input.model);
  const sheet=await getCatalog(batch),specs=adAiSameTypeSpecs(spec,sheet.specs);
  if(specs.length<2)throw fail('当前画面比例没有其它可同步的静态尺寸',422);
  if(batch.sourceSha256!==sheet.sourceSha256)throw fail('尺寸规范已更新，请先刷新');
  const expected=input.targets;
  if(!Array.isArray(expected)||expected.length!==specs.length||new Set(expected.map(t=>t.specId)).size!==specs.length||expected.some(t=>!specs.some(s=>s.id===t.specId)))throw fail('同类尺寸范围已变化，请刷新后重新选择');
  if(input.expectedVersion!==(item.versions.at(-1)?.number||0)||JSON.stringify(draftKey(input.draft))!==JSON.stringify(draftKey(item.draft)))throw fail('当前画面尚未保存或已变化，请刷新后重试');
  const prompt=typeof input.prompt==='string'?input.prompt.trim():'';
  if(!prompt||prompt.length>2000)throw fail('请填写 1–2000 字的修改要求',422);
  const referenceImages=snapshotAdAiReferences(batch,item,input.referenceIds);
  const source=batch.assets.find(a=>a.id===item.draft.sourceAssetId&&a.role==='visual');
  if(!source||embeddedLogo(source))throw fail('同类修改需要无 Logo 底图和独立 Logo，请先更换纯图',422);
  const onlyImage=prompt.split(/[，,；;。\n]+/).map(s=>s.trim()).filter(s=>s&&!/logo/i.test(s)).join('；');
  const plans=specs.map(target=>{
   const state=batch.items[target.id],snapshot=expected.find(t=>t.specId===target.id);
   if(!state?.draft?.sourceAssetId)throw fail(`${target.width}×${target.height} 尚未准备好画面，请先完成该尺寸候选`,422);
   if(isAdAiEditLocked(state.aiEditJob))throw fail(`${target.width}×${target.height} 正在 AI 修改，请等待完成`);
   if(snapshot.expectedVersion!==(state.versions.at(-1)?.number||0)||JSON.stringify(draftKey(snapshot.draft))!==JSON.stringify(draftKey(state.draft)))throw fail('有同类尺寸已经更新，请刷新后重新提交');
   const original=batch.assets.find(a=>a.id===state.draft.sourceAssetId&&a.role==='visual');if(!original)throw fail('同类尺寸的原素材不存在',422);
   const next={...state.draft};const logo=target.logo==='required'?(batch.assets.find(a=>a.id===next.logoAssetId&&a.role==='logo')||batch.assets.find(a=>a.id===batch.activeLogoAssetId&&a.role==='logo')||batch.assets.find(a=>a.role==='logo')):null;
   if(target.logo==='required'&&!logo)throw fail(`${target.width}×${target.height} 需要独立 Logo 才能同步修改`,422);
   next.logoAssetId=logo?.id||'';
   const plan=target.logo==='forbidden'&&!onlyImage?{prompt,imageInstruction:'',logoCommands:[],nextDraft:next}:planAdAiEdit(target.logo==='forbidden'?onlyImage:prompt,{spec:target,draft:next,independentLogo:Boolean(logo),embeddedLogo:false});
   return {specId:target.id,jobId:randomUUID(),baseDraft:{...state.draft},baseToken:token(batch,state),baseVersion:state.versions.at(-1)?.number||0,plan};
  });
  if(input.reviewBeforeApply===true&&plans.every(m=>!m.plan.imageInstruction)){
   if(input.syncSimilar===true&&applyWorkingDraft){
    const anchor=spec.logo==='required'?plans.find(m=>m.specId===spec.id):plans.find(m=>specs.find(s=>s.id===m.specId)?.logo==='required');
    if(anchor){const applied=await applyWorkingDraft(batch,specs.find(s=>s.id===anchor.specId),anchor.plan.nextDraft),{synced,sync,...anchorState}=applied,all=[{specId:anchor.specId,...anchorState},...synced];return {localDraft:true,draft:item.draft,draftDirty:Boolean(item.draftDirty),draftUpdatedAt:item.draftUpdatedAt,canUndo:Boolean(item.draftUndo?.length),canRedo:Boolean(item.draftRedo?.length),synced:all.filter(row=>row.specId!==spec.id),sync:{...sync,updated:all.filter(row=>row.specId!==spec.id).map(row=>row.specId)}};}
   }
   for(const m of plans)updateAdWorkingDraft(batch.items[m.specId],m.plan.nextDraft);await save();return {localDraft:true,groupJobs:plans.map(m=>({specId:m.specId,draft:batch.items[m.specId].draft,draftDirty:batch.items[m.specId].draftDirty}))};
  }
  const generationSpec=specs.reduce((a,b)=>a.width*a.height>=b.width*b.height?a:b),groupId=randomUUID(),lead=plans.find(m=>m.specId===spec.id);lead.jobId=groupId;
  const plan={...lead.plan};if(adAiEditMode(plan.imageInstruction)==='local')plan.retouch=planAdAiRetouch(plan.imageInstruction,generationSpec);
  const logoAreas=plans.flatMap(m=>{const target=specs.find(s=>s.id===m.specId),d=m.plan.nextDraft,logo=batch.assets.find(a=>a.id===d.logoAssetId&&a.role==='logo');if(!logo)return [];const pixels=Math.max(1,Math.min(target.width,Math.floor(target.height*logo.width/logo.height),Math.round((d.logoScale||.18)*target.width))),width=pixels/target.width,height=Math.max(1,Math.round(pixels*logo.height/logo.width))/target.height;return [{x:Math.max(0,Math.min(1-width,d.logoX??.78)),y:Math.max(0,Math.min(1-height,d.logoY??.06)),width,height}];});
  const time=now(),job={id:groupId,groupId,scope:'same-ratio',groupLeaderSpecId:spec.id,groupSpecIds:specs.map(s=>s.id),generationSpecId:generationSpec.id,members:plans,assetId:randomUUID(),requestId,prompt,plan,logoAreas,project:batch.project,model:plan.imageInstruction?model:'local-logo',baseDraft:lead.baseDraft,baseToken:lead.baseToken,baseVersion:lead.baseVersion,catalogSha:batch.sourceSha256,status:'queued',createdAt:time,updatedAt:time};
  if(referenceImages.length){job.referenceImages=referenceImages;job.referenceInputMethod=AD_AI_LAYOUT_REFERENCE_METHOD;}
  job.reviewBeforeApply=input.reviewBeforeApply===true;
  const originalReference=adAiOriginalReference(batch,source,plan.imageInstruction);
  if(originalReference)job.originalReferenceAssetId=originalReference.id;
   if(adAiProportionRepair(plan.imageInstruction)){job.inputMethod=AD_AI_PROPORTION_METHOD;job.proportionSourceAssetId=originalReference?.id||source.id;}
   if(originalReference&&(source.toneReferenceAssetId||job.inputMethod===AD_AI_PROPORTION_METHOD))job.originalPaletteGuard=true;
  for(const m of plans){const state=batch.items[m.specId];if(state.aiEditJob)(state.aiEditHistory||=[]).push(state.aiEditJob);state.aiEditJob=m.specId===spec.id?job:{id:m.jobId,groupId,scope:'same-ratio',groupLeaderSpecId:spec.id,groupSpecIds:job.groupSpecIds,requestId,prompt,...(referenceImages.length?{referenceImages}:{}),model:job.model,baseDraft:m.baseDraft,baseVersion:m.baseVersion,status:'queued',createdAt:time,updatedAt:time};}
  await save();start(batch,job);return result(batch,item);
 };
 const resume=async(batch,spec,item)=>{
  const {job}=leader(batch,item);
  if(publicAdAiEdit(job).canResume){await running.get(job.id);await update(batch,job,{status:'queued',error:''});start(batch,job);}
  return result(batch,item);
 };
 const undo=async(batch,spec,item,input)=>{
  const {job}=leader(batch,item),sheet=await getCatalog(batch);
  if(item.aiEditJob.status!=='completed'||input.expectedVersion!==item.versions.at(-1)?.number||sheet.sourceSha256!==job.catalogSha)throw fail('当前稿已变化，不能直接撤回这组修改');
  for(const m of job.members){const target=batch.items[m.specId];if(target.draftDirty||!owned(batch,m)||target.aiEditJob.status!=='completed'||target.versions.at(-1)?.number!==target.aiEditJob.versionNumber)throw fail('有同类尺寸已继续修改，不能整组撤回；当前稿已保留');}
  const keys=job.members.map(m=>token(batch,batch.items[m.specId])),entries=[];
  for(const m of job.members){const target=sheet.specs.find(s=>s.id===m.specId);if(!target)throw fail('尺寸规范已变化');entries.push({spec:target,buffer:await renderForSpec(batch,target,m.baseDraft),input:{...(job.reviewBeforeApply?{referenceOnly:true,compositionDraft:m.baseDraft}:{}),aiEdit:{undoGroupId:job.groupId}}});}
  await saveVersions(batch,entries,{beforeCommit:versions=>{
   job.members.forEach((m,index)=>{if(!owned(batch,m)||token(batch,batch.items[m.specId])!==keys[index])throw fail('同类稿件已更新，未执行撤回');});
   job.members.forEach((m,index)=>{const target=batch.items[m.specId];target.draft={...m.baseDraft};Object.assign(target.aiEditJob,{status:'reverted',undoVersionNumber:versions[index].number,updatedAt:now()});});
  }});return result(batch,item);
 };
 const restore=async()=>{
  for(const batch of batches)for(const item of Object.values(batch.items||{})){
   const job=item.aiEditJob;if(!job?.members||!job.groupId)continue;
   if(job.status==='awaiting_review'&&job.referenceImages?.length){
    try{await validateAdAiReferenceResult({storageDir,batch,job,workDir:safeChild(storageDir,`ad-resources-${batch.id}`,'ai-edit',job.id),update:values=>update(batch,job,values,{skipUnchanged:true})});}
    catch(error){for(const m of job.members)if(owned(batch,m))delete batch.items[m.specId].aiEditJob.candidate;await update(batch,job,{status:'needs_revision',error:error.message});}
   }
    if(job.status==='awaiting_review'&&adAiProportionRepair(job.plan?.imageInstruction)){
     try{await validateAdAiRecompositionResult({job,workDir:safeChild(storageDir,`ad-resources-${batch.id}`,'ai-edit',job.id),update:values=>update(batch,job,values,{skipUnchanged:true})});}
     catch(error){for(const m of job.members)if(owned(batch,m))delete batch.items[m.specId].aiEditJob.candidate;await update(batch,job,{status:'needs_revision',error:error.message});}
    }
   if(!isAdAiEditActive(job))continue;
   if(job.submittedAt&&!job.providerJobId&&!job.resultReady)await update(batch,job,{status:'result_uncertain',error:'服务已恢复，请继续查询同一次同类修改'});
   else start(batch,job);
  }
 };
 const synchronizeCompleted=async(batch,spec,item,original)=>{
  const sheet=await getCatalog(batch),source=batch.assets.find(a=>a.id===item.draft.sourceAssetId&&a.role==='visual');
  if(original.status!=='completed'||item.draftDirty||item.versions.at(-1)?.number!==original.versionNumber)throw fail('当前编辑稿已继续修改，请先保留当前方案');
  if(sheet.sourceSha256!==original.catalogSha||batch.sourceSha256!==original.catalogSha)throw fail('尺寸规范已变化，未同步结果');
  if(!source||embeddedLogo(source)||source.aiEditId!==(original.sharedFromJobId||original.id))throw fail('当前结果没有可复用的独立无 Logo 底图',422);
  const rootToken=token(batch,item),plans=adAiSameTypeSpecs(spec,sheet.specs).filter(s=>s.id!==spec.id).map(target=>{
   const row=batch.items[target.id];if(!row?.draft?.sourceAssetId)throw fail(`${target.width}×${target.height} 尚未准备主视觉`,422);
   if(isAdAiEditLocked(row.aiEditJob))throw fail(`${target.width}×${target.height} 有其它修改待处理，未覆盖结果`);
   const draft={...row.draft,sourceAssetId:source.id,zoom:1,offsetX:0,offsetY:0};if(target.logo==='forbidden')draft.logoAssetId='';
   const logo=target.logo==='required'?batch.assets.find(a=>a.id===draft.logoAssetId&&a.role==='logo'):null;if(target.logo==='required'&&!logo)throw fail(`${target.width}×${target.height} 尚未添加独立 Logo`,422);
   return {spec:target,row,draft,logo,baseDraft:{...row.draft},baseToken:token(batch,row),previousJob:row.aiEditJob,jobId:randomUUID()};
  }).filter(p=>JSON.stringify(draftKey(p.draft))!==JSON.stringify(draftKey(p.row.draft)));
  if(!plans.length)return {...result(batch,item),sharedSpecIds:[]};
  const unchanged=()=>{if(item.aiEditJob!==original||original.status!=='completed'||token(batch,item)!==rootToken||plans.some(p=>token(batch,p.row)!==p.baseToken||p.row.aiEditJob!==p.previousJob||isAdAiEditLocked(p.row.aiEditJob)))throw fail('有同类稿件已继续修改，未覆盖当前画面');};
  const art=await assetBuffer(batch,source),entries=[];
  for(const p of plans){const buffer=await renderJpg(art,p.spec,p.draft,p.logo?await assetBuffer(batch,p.logo):null);entries.push({spec:p.spec,buffer,input:{referenceOnly:true,compositionDraft:p.draft,aiEdit:{jobId:p.jobId,sharedFromJobId:source.aiEditId,sharedFromSpecId:spec.id,sharedFromVersion:original.versionNumber,prompt:original.prompt,model:original.model,baseVersion:p.row.versions.at(-1)?.number||0}}});}
  if((await getCatalog(batch)).sourceSha256!==original.catalogSha)throw fail('尺寸规范已变化，未同步结果');
  await saveVersions(batch,entries,{beforeCommit:versions=>{unchanged();plans.forEach((p,index)=>{
   const version=p.row.versions.at(-1),time=now();if(p.row.aiEditJob)(p.row.aiEditHistory??=[]).push(p.row.aiEditJob);
   p.row.aiEditJob={id:p.jobId,requestId:randomUUID(),prompt:original.prompt,status:'completed',model:original.model,reviewBeforeApply:true,sharedFromJobId:source.aiEditId,sharedFromSpecId:spec.id,baseDraft:p.baseDraft,baseVersion:version?.number||0,basePreviewUrl:p.row.draftDirty?'':version?.url||'',catalogSha:original.catalogSha,versionNumber:versions[index].number,createdAt:time,updatedAt:time};
   p.row.draft=p.draft;p.row.autoError='';p.row.autoWarning='';
  });}});
  return {...result(batch,item),sharedSpecIds:plans.map(p=>p.spec.id),groupJobs:plans.map(p=>({specId:p.spec.id,...one(p.row)}))};
 };
 const synchronize=async(batch,spec,item,input)=>{
  const original=item.aiEditJob;
  if(original?.groupId){if(input.candidateId!==original.groupId)throw fail('AI 候选已更新，请刷新后重试');return result(batch,item);}
  if(!original||input.candidateId!==original.id)throw fail('AI 候选已更新，请刷新后重试');
  if(sharing.has(original.id))return sharing.get(original.id);
  const operation=(async()=>{
   if(original.status==='completed')return synchronizeCompleted(batch,spec,item,original);
   if(original.status!=='awaiting_review'||!original.candidate)throw fail('当前没有可同步的 AI 候选');
   const sheet=await getCatalog(batch),specs=adAiSameTypeSpecs(spec,sheet.specs);
   if(sheet.sourceSha256!==original.catalogSha||batch.sourceSha256!==original.catalogSha)throw fail('尺寸规范已变化，未同步候选');
   if(specs.length<2)throw fail('当前没有同类尺寸可以同步',422);
   const source=batch.assets.find(a=>a.id===original.candidate.draft.sourceAssetId&&a.role==='visual');
   if(!source||embeddedLogo(source))throw fail('需要独立无 Logo 底图才能同步候选',422);
   const members=specs.map(target=>{
    const row=batch.items[target.id];if(!row?.draft?.sourceAssetId)throw fail(`${target.width}×${target.height} 尚未准备主视觉`,422);
    if(target.id!==spec.id&&isAdAiEditLocked(row.aiEditJob))throw fail(`${target.width}×${target.height} 有其它修改待处理，未覆盖候选`);
    const baseDraft={...row.draft},nextDraft={...baseDraft,sourceAssetId:source.id,zoom:1,offsetX:0,offsetY:0};
    if(target.logo==='forbidden')nextDraft.logoAssetId='';
    else if(!batch.assets.some(a=>a.id===nextDraft.logoAssetId&&a.role==='logo'))throw fail(`${target.width}×${target.height} 尚未添加独立 Logo`,422);
    return {specId:target.id,jobId:target.id===spec.id?original.id:randomUUID(),baseDraft,baseVersion:row.versions.at(-1)?.number||0,baseToken:token(batch,row),plan:{...original.plan,nextDraft},nextDraft,previousJob:row.aiEditJob};
   });
   const unchanged=()=>{
    if(item.aiEditJob!==original||original.status!=='awaiting_review'||token(batch,item)!==original.baseToken||members.some(m=>token(batch,batch.items[m.specId])!==m.baseToken||batch.items[m.specId].aiEditJob!==m.previousJob||m.specId!==spec.id&&isAdAiEditLocked(batch.items[m.specId].aiEditJob)))throw fail('有同类稿件已继续修改，未覆盖当前画面');
   };
   unchanged();const folder=`ad-resources-${batch.id}`,workDir=safeChild(storageDir,folder,'ai-edit',original.id),art=await assetBuffer(batch,source),entries=[];
   for(const m of members){
    const target=specs.find(s=>s.id===m.specId),logo=target.logo==='required'?batch.assets.find(a=>a.id===m.nextDraft.logoAssetId):null;
    const buffer=await renderJpg(art,target,m.nextDraft,logo?await assetBuffer(batch,logo):null),name=`candidate-${m.specId}.jpg`;
    await fs.writeFile(path.join(workDir,name),buffer);
    let before=m.specId===spec.id?original.basePreviewUrl:batch.items[m.specId].draftDirty?'':batch.items[m.specId].versions.at(-1)?.url||'';
    if(!before){const name=`before-${m.specId}.jpg`;await fs.writeFile(path.join(workDir,name),await renderForSpec(batch,target,m.baseDraft));before=`/storage/${folder}/ai-edit/${original.id}/${name}`;}
    entries.push({m,before,candidate:{id:original.id,url:`/storage/${folder}/ai-edit/${original.id}/${name}`,draft:m.nextDraft,width:target.width,height:target.height,bytes:buffer.length}});
   }
   unchanged();if((await getCatalog(batch)).sourceSha256!==original.catalogSha)throw fail('尺寸规范已变化，未同步候选');unchanged();
   const time=now(),groupSpecIds=specs.map(s=>s.id),job={...original,groupId:original.id,scope:'same-ratio',groupLeaderSpecId:spec.id,groupSpecIds,generationSpecId:spec.id,promotedSingle:true,members:members.map(({nextDraft,previousJob,...m})=>m),updatedAt:time};
   const historyLengths=new Map(members.map(m=>[m.specId,batch.items[m.specId].aiEditHistory?.length||0]));
   for(const {m,before,candidate}of entries){
    const row=batch.items[m.specId];
    if(m.specId!==spec.id&&row.aiEditJob)(row.aiEditHistory??=[]).push(row.aiEditJob);
    row.aiEditJob=m.specId===spec.id?Object.assign(job,{candidate,basePreviewUrl:before}):{id:m.jobId,groupId:job.groupId,scope:'same-ratio',groupLeaderSpecId:spec.id,groupSpecIds,requestId:job.requestId,prompt:job.prompt,model:job.model,status:'awaiting_review',baseDraft:m.baseDraft,baseVersion:m.baseVersion,basePreviewUrl:before,candidate,createdAt:time,updatedAt:time};
   }
   try{await save()}catch(error){for(const m of members){const row=batch.items[m.specId];row.aiEditJob=m.previousJob;if(row.aiEditHistory)row.aiEditHistory.length=historyLengths.get(m.specId);}throw error;}return result(batch,item);
  })();
  sharing.set(original.id,operation);try{return await operation}finally{sharing.delete(original.id);}
 };
 const accept=async(batch,spec,item,input)=>{
  const {job}=leader(batch,item);if(input.candidateId!==job.id)throw fail('AI 候选已更新');
  if(job.status==='completed'&&job.versionNumber)return result(batch,item);
  if(job.status!=='awaiting_review')throw fail('当前没有可采用的 AI 候选');
  try{
   const workDir=safeChild(storageDir,`ad-resources-${batch.id}`,'ai-edit',job.id),change=values=>update(batch,job,values);
   await validateAdAiReferenceResult({storageDir,batch,job,workDir,update:change});
   if(adAiProportionRepair(job.plan?.imageInstruction))await validateAdAiRecompositionResult({job,workDir,update:change});
  }
  catch(error){for(const m of job.members)if(owned(batch,m))delete batch.items[m.specId].aiEditJob.candidate;await update(batch,job,{status:'needs_revision',error:error.message});throw fail(error.message);}
  const sheet=await getCatalog(batch);if(sheet.sourceSha256!==job.catalogSha)throw fail('尺寸规范已更新，未采用候选');check(batch,job);
  const entries=[];
  for(const m of job.members){const target=sheet.specs.find(s=>s.id===m.specId),candidate=batch.items[m.specId].aiEditJob.candidate;if(!target||!candidate)throw fail('同类候选不完整');entries.push({spec:target,draft:candidate.draft,buffer:await fs.readFile(safeChild(storageDir,`ad-resources-${batch.id}`,'ai-edit',job.id,`candidate-${m.specId}.jpg`)),input:{referenceOnly:true,compositionDraft:candidate.draft,aiEdit:{jobId:m.jobId,groupId:job.groupId,scope:'same-ratio',prompt:job.prompt,model:job.model,baseVersion:m.baseVersion}}});}
  await saveVersions(batch,entries,{beforeCommit:versions=>{check(batch,job);job.members.forEach((m,i)=>{const target=batch.items[m.specId];target.draft=entries[i].draft;target.autoError='';target.autoWarning='';Object.assign(target.aiEditJob,{status:'completed',versionNumber:versions[i].number,updatedAt:now()});delete target.aiEditJob.candidate;});}});
  for(const m of job.members)await fs.rm(safeChild(storageDir,`ad-resources-${batch.id}`,'ai-edit',job.id,`candidate-${m.specId}.jpg`),{force:true});if(job.promotedSingle)await fs.rm(safeChild(storageDir,`ad-resources-${batch.id}`,'ai-edit',job.id,'candidate.jpg'),{force:true});return result(batch,item);
 };
 const discard=async(batch,spec,item,input)=>{
  const {job}=leader(batch,item);if(input.candidateId!==job.id)throw fail('AI 候选已更新');
  if(job.status==='discarded')return result(batch,item);if(job.status!=='awaiting_review')throw fail('当前没有待处理的 AI 候选');
  for(const m of job.members)if(owned(batch,m))delete batch.items[m.specId].aiEditJob.candidate;
  await update(batch,job,{status:'discarded'});
  for(const m of job.members)await fs.rm(safeChild(storageDir,`ad-resources-${batch.id}`,'ai-edit',job.id,`candidate-${m.specId}.jpg`),{force:true});if(job.promotedSingle)await fs.rm(safeChild(storageDir,`ad-resources-${batch.id}`,'ai-edit',job.id,'candidate.jpg'),{force:true});return result(batch,item);
 };
 return {submit,result,resume,undo,restore,accept,discard,synchronize};
}
