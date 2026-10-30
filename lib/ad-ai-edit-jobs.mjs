import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {safeChild} from './core.mjs';
import {AD_AI_EDIT_MODEL,generateAdAiEdit,planAdAiEdit,adAiEditMode,validateAdAiRecompositionResult} from './ad-ai-edit.mjs';
import {AD_AI_PROPORTION_METHOD,adAiProportionRepair} from './ad-ai-proportion.mjs';
import {normalizeAdAiOutput} from './ad-ai-frame.mjs';
import {planAdAiRetouch,maskAdAiRetouchInput,finishAdAiRetouch} from './ad-ai-retouch.mjs';
import {adAiOriginalReference,readAdAiOriginalReference} from './ad-ai-original-reference.mjs';
import {assessAdAiPalette} from './ad-ai-palette.mjs';
import {updateAdWorkingDraft} from './ad-version-lifecycle.mjs';
import {snapshotAdAiReferences,readAdAiReferenceBuffers} from './ad-ai-references.mjs';
import {AD_AI_LAYOUT_REFERENCE_METHOD,validateAdAiReferenceResult} from './ad-ai-reference-guard.mjs';
import {adSafeTypographyInset,renderAdSafeTypography,AD_SAFE_TYPOGRAPHY_METHOD} from './ad-safe-typography.mjs';
import {adAiModel} from '../public/ad-ai-models.js';

const activeStates=new Set(['queued','preparing','submitting','processing','downloading','saving']);
export const isAdAiEditActive=job=>activeStates.has(job?.status);
export const isAdAiEditLocked=job=>isAdAiEditActive(job)||job?.status==='result_uncertain'||job?.status==='awaiting_review';
const fail=(message,status=409)=>Object.assign(new Error(message),{status});
const now=()=>new Date().toISOString();
const draftFields=['sourceAssetId','logoAssetId','zoom','offsetX','offsetY','logoScale','logoX','logoY'];
const draftKey=draft=>draftFields.map(key=>draft?.[key]??null);
const token=(batch,item)=>createHash('sha256').update(JSON.stringify([batch.sourceSha256,item.versions?.at(-1)?.number||0,draftKey(item.draft)])).digest('hex');
const canResume=job=>job?.status==='result_uncertain'||job?.status==='failed'&&Boolean(job.resultReady||job.rawReady||job.providerJobId&&/尺寸比例/.test(job.error||''));
export const publicAdAiEdit=job=>job?{...Object.fromEntries(['id','requestId','prompt','referenceImages','status','model','error','resultReady','rawReady','baseVersion','basePreviewUrl','versionNumber','undoVersionNumber','createdAt','updatedAt','scope','groupId','groupLeaderSpecId','groupSpecIds','sharedFromJobId','sharedFromSpecId'].filter(key=>job[key]!==undefined).map(key=>[key,job[key]])),canResume:canResume(job)}:null;

export function createAdAiEditJobs({root,storageDir,batches,save,getCatalog,assetBuffer,renderJpg,renderForSpec,saveVersion,embeddedLogo,applyWorkingDraft,generate=generateAdAiEdit}){
  const running=new Map();
  const result=(item,job=item.aiEditJob)=>({editJob:publicAdAiEdit(job),pending:isAdAiEditActive(job),...(job?.status==='awaiting_review'?{candidate:job.candidate}:{}),...(job?.status==='completed'?{draft:item.draft,draftDirty:item.draftDirty}:{}),...(job?.versionNumber?{version:item.versions.find(v=>v.number===job.versionNumber)}:{})});
  const assertFree=(item)=>{if(item?.aiEditJob?.status==='awaiting_review')throw fail('请先采用或放弃 AI 候选，再继续调整');if(isAdAiEditLocked(item?.aiEditJob))throw fail('当前尺寸正在 AI 修改，请完成或查询本次结果后再调整')};
  const start=(batch,spec,item,job)=>{
    if(running.has(job.id))return;
    const operation=(async()=>{
      const current=()=>batches.includes(batch)&&item.aiEditJob?.id===job.id;
      const update=async values=>{if(!current())throw fail('AI 修改任务已被替换');Object.assign(job,values,{updatedAt:now()});await save()};
      const assertUnchanged=()=>{if(!current()||token(batch,item)!==job.baseToken)throw fail('生成期间当前稿件发生变化，结果已保留，未覆盖现有画面')};
      try{
        const committed=item.versions.find(v=>v.aiEdit?.jobId===job.id);
        if(committed){await update({status:'completed',versionNumber:committed.number,error:''});return}
        await update({status:'preparing',error:''});
        const source=batch.assets.find(a=>a.id===job.baseDraft.sourceAssetId&&a.role==='visual');
        if(!source)throw fail('原素材不存在，请重新上传源图',422);
        const folder=`ad-resources-${batch.id}`,workDir=safeChild(storageDir,folder,'ai-edit',job.id);
        await fs.mkdir(workDir,{recursive:true});
        if(!job.basePreviewUrl){
          const before=await renderForSpec(batch,spec,job.baseDraft);
          await fs.writeFile(path.join(workDir,'before.jpg'),before);
          await update({basePreviewUrl:`/storage/${folder}/ai-edit/${job.id}/before.jpg`});
        }
        let newSource=source,nextDraft={...job.plan.nextDraft};
        if(job.plan.imageInstruction){
          const outputPath=path.join(workDir,'result.png');
          let generated;
          if(job.resultReady)generated=await fs.readFile(outputPath);
          else{
            const insetX=!job.referenceImages?.length?adSafeTypographyInset(job.plan.imageInstruction,spec):null;
            const typography=insetX?await renderAdSafeTypography({batch,source,spec,draft:job.baseDraft,storageDir,assetBuffer,insetX}):null;
            if(typography){
              generated=typography.buffer;
              await update({safeTypography:typography.assessment,model:'local-typography',outputAdaptation:{method:AD_SAFE_TYPOGRAPHY_METHOD}});
            }else{
            const inputPath=path.join(workDir,'input.png');
            let input;
            try{input=await fs.readFile(inputPath)}catch(error){
              if(error.code!=='ENOENT')throw error;
              const original=await assetBuffer(batch,source);
              input=await renderJpg(original,{...spec,minBytes:0,maxBytes:null},job.baseDraft);
              await fs.writeFile(inputPath,input);
            }
            const logo=spec.logo==='required'&&!embeddedLogo(source)?batch.assets.find(a=>a.id===nextDraft.logoAssetId&&a.role==='logo'):null;
            let logoBounds;
            if(logo){
              const width=Math.max(1,Math.min(spec.width,Math.floor(spec.height*logo.width/logo.height),Math.round((nextDraft.logoScale||.18)*spec.width))),height=Math.max(1,Math.round(width*logo.height/logo.width));
              const clamp=(v,max)=>Math.max(0,Math.min(max,v));
              logoBounds={x:clamp((nextDraft.logoX??.78)*spec.width,spec.width-width)/spec.width,y:clamp((nextDraft.logoY??.06)*spec.height,spec.height-height)/spec.height,width:width/spec.width,height:height/spec.height};
            }
            const rawPath=path.join(workDir,'raw-image');
            if(job.rawReady)generated=await fs.readFile(rawPath);
            else{
              const modelInput=job.plan.retouch?await maskAdAiRetouchInput(input,job.plan.retouch):input;
              const originalReferenceBuffer=await readAdAiOriginalReference({batch,job,workDir,assetBuffer});
              const referenceBuffers=await readAdAiReferenceBuffers({storageDir,batch,job});
              generated=await generate({root,sourceBuffer:modelInput,originalReferenceBuffer,referenceBuffers,spec,instruction:job.plan.imageInstruction,embeddedLogo:embeddedLogo(source),logoBounds,job,onUpdate:update});
              await fs.writeFile(rawPath,generated);await update({rawReady:true});
            }
            const normalized=await normalizeAdAiOutput(generated,spec,job.generationFrame);
            generated=job.plan.retouch?await finishAdAiRetouch(input,normalized.buffer,job.plan.retouch):normalized.buffer;
            await update({outputAdaptation:normalized.adaptation});
            }
            await fs.writeFile(outputPath,generated);await update({resultReady:true});
          }
          await validateAdAiReferenceResult({storageDir,batch,job,workDir,generated,update});
          if(job.originalPaletteGuard){
            const reference=await readAdAiOriginalReference({batch,job,workDir,assetBuffer});
            const paletteAssessment=await assessAdAiPalette(reference,generated);await update({paletteAssessment});
            if(!paletteAssessment.consistent)throw Object.assign(Error('AI 修改稿的蓝紫配色偏离上传原图，未替换当前稿。结果已保留，请调整要求后再生成'),{editStatus:'needs_revision'});
          }
          await validateAdAiRecompositionResult({job,workDir,generated,update});
          const filename=`visual-ai-edit-${job.id}.png`,url=`/storage/${folder}/asset/${filename}`;
          await fs.mkdir(safeChild(storageDir,folder,'asset'),{recursive:true});
          await fs.writeFile(safeChild(storageDir,folder,'asset',filename),generated);
          newSource={id:job.assetId,role:'visual',name:`${batch.project}_AI修改_${spec.width}x${spec.height}.png`,width:spec.width,height:spec.height,url,sourceFormat:'AIEdit',logoFree:!embeddedLogo(source),hasEmbeddedLogo:embeddedLogo(source),aiSourceAssetId:source.id,aiEditId:job.id,aiSpecId:spec.id};
          if(job.safeTypography)newSource.safeTypography=job.safeTypography;
          if(source.toneReferenceAssetId)newSource.toneReferenceAssetId=source.toneReferenceAssetId;
          nextDraft={...nextDraft,sourceAssetId:newSource.id,zoom:1,offsetX:0,offsetY:0};
        }
        if(spec.logo==='forbidden'||embeddedLogo(newSource))nextDraft.logoAssetId='';
        const logo=spec.logo==='required'&&!embeddedLogo(newSource)?batch.assets.find(a=>a.id===nextDraft.logoAssetId&&a.role==='logo'):null;
        const output=await renderJpg(await (newSource===source?assetBuffer(batch,source):fs.readFile(safeChild(storageDir,folder,'ai-edit',job.id,'result.png'))),spec,nextDraft,logo?await assetBuffer(batch,logo):null);
        const sheet=await getCatalog(batch);
        if(sheet.sourceSha256!==job.catalogSha)throw fail('尺寸规范已变化，AI 结果已保留，未覆盖当前稿');
        assertUnchanged();await update({status:'saving'});
        if(job.reviewBeforeApply){
          const filename='candidate.jpg';await fs.writeFile(safeChild(storageDir,folder,'ai-edit',job.id,filename),output);assertUnchanged();
          if(newSource!==source&&!batch.assets.some(a=>a.id===newSource.id))batch.assets.push(newSource);
          await update({status:'awaiting_review',candidate:{id:job.id,url:`/storage/${folder}/ai-edit/${job.id}/${filename}`,draft:nextDraft,width:spec.width,height:spec.height,bytes:output.length},error:''});return;
        }
        await saveVersion(batch,spec,output,{aiEdit:{jobId:job.id,requestId:job.requestId,prompt:job.prompt,model:job.model,baseVersion:job.baseVersion},beforeCommit:version=>{
          assertUnchanged();
          if(newSource!==source&&!batch.assets.some(a=>a.id===newSource.id))batch.assets.push(newSource);
          item.draft=nextDraft;item.autoError='';item.autoWarning='';
          Object.assign(job,{status:'completed',versionNumber:version.number,error:'',updatedAt:now()});
        }});
      }catch(error){
        if(current()){
          Object.assign(job,{status:error.editStatus||(error.status===409?'conflict':'failed'),error:error.message,updatedAt:now()});
          await save();
        }
      }
    })();
    running.set(job.id,operation);operation.finally(()=>running.delete(job.id)).catch(()=>{});
  };
  const submit=async(batch,spec,item,input)=>{
    if(spec.format!=='JPG')throw fail('AI 改图当前支持静态图片；动效请使用可灵制作工具',422);
    const requestId=String(input.requestId||'');if(!/^[a-zA-Z0-9-]{8,80}$/.test(requestId))throw fail('缺少有效的修改请求编号，请刷新后重试',422);
    const duplicate=[item.aiEditJob,...(item.aiEditHistory||[])].find(j=>j?.requestId===requestId);
    if(duplicate)return result(item,duplicate);
    const model=adAiModel(input.model);
    assertFree(item);
    if(!Number.isInteger(input.expectedVersion)||input.expectedVersion!==(item.versions.at(-1)?.number||0))throw fail('当前候选稿已更新，请刷新后再提交修改');
    if(JSON.stringify(draftKey(input.draft))!==JSON.stringify(draftKey(item.draft)))throw fail('画面调整尚未保存，请等待自动保存后再提交');
    if(batch.sourceSha256!==(await getCatalog(batch)).sourceSha256)throw fail('尺寸规范已更新，请先刷新页面');
    // Another request may have acquired this item while the catalog was read.
    assertFree(item);
    if(input.expectedVersion!==(item.versions.at(-1)?.number||0)||JSON.stringify(draftKey(input.draft))!==JSON.stringify(draftKey(item.draft)))throw fail('当前画面已变化，请刷新后再提交修改');
    const source=batch.assets.find(a=>a.id===item.draft.sourceAssetId&&a.role==='visual');
    if(!source)throw fail('请先上传画面素材',422);
    if(spec.logo==='forbidden'&&embeddedLogo(source))throw fail('当前尺寸要求无 Logo，请先选择纯图',422);
    const logo=batch.assets.find(a=>a.id===item.draft.logoAssetId&&a.role==='logo');
    if(spec.logo==='required'&&!embeddedLogo(source)&&!logo)throw fail('当前尺寸必须带 Logo，请先上传独立 Logo',422);
    const plan=planAdAiEdit(input.prompt,{spec,draft:item.draft,independentLogo:Boolean(logo),embeddedLogo:embeddedLogo(source)});
    const referenceImages=snapshotAdAiReferences(batch,item,input.referenceIds);
    if(input.reviewBeforeApply===true&&!plan.imageInstruction){if(input.syncSimilar===true&&applyWorkingDraft)return {localDraft:true,...await applyWorkingDraft(batch,spec,plan.nextDraft)};updateAdWorkingDraft(item,plan.nextDraft);await save();return {localDraft:true,draft:item.draft,draftDirty:item.draftDirty};}
    if(adAiEditMode(plan.imageInstruction)==='local')plan.retouch=planAdAiRetouch(plan.imageInstruction,spec);
    const job={id:randomUUID(),assetId:randomUUID(),requestId,prompt:plan.prompt,plan,project:batch.project,status:'queued',model:plan.imageInstruction?model:'local-logo',baseDraft:{...item.draft},baseToken:token(batch,item),baseVersion:item.versions.at(-1)?.number||0,basePreviewUrl:item.versions.at(-1)?.url||'',catalogSha:batch.sourceSha256,createdAt:now(),updatedAt:now()};
    if(referenceImages.length){job.referenceImages=referenceImages;job.referenceInputMethod=AD_AI_LAYOUT_REFERENCE_METHOD;}
    job.reviewBeforeApply=input.reviewBeforeApply===true;if(item.draftDirty)job.basePreviewUrl='';
    const originalReference=adAiOriginalReference(batch,source,plan.imageInstruction);
    if(originalReference)job.originalReferenceAssetId=originalReference.id;
    if(adAiProportionRepair(plan.imageInstruction)){job.inputMethod=AD_AI_PROPORTION_METHOD;job.proportionSourceAssetId=originalReference?.id||source.id;}
    if(originalReference&&(source.toneReferenceAssetId||job.inputMethod===AD_AI_PROPORTION_METHOD))job.originalPaletteGuard=true;
    if(item.aiEditJob)(item.aiEditHistory||=[]).push(item.aiEditJob);
    item.aiEditJob=job;await save();start(batch,spec,item,job);return result(item,job);
  };
  const resume=async(batch,spec,item)=>{
    const job=item.aiEditJob;
    if(!job)return result(item);
    if(canResume(job)){
      await running.get(job.id);
      job.status='queued';job.error='';await save();start(batch,spec,item,job);
    }
    return result(item);
  };
  const undo=async(batch,spec,item,input)=>{
    assertFree(item);
    if(item.draftDirty)throw fail('编辑稿已继续调整，请使用编辑稿的撤销功能，或先保留当前方案');
    const job=item.aiEditJob;
    if(job?.status!=='completed'||input.expectedVersion!==job.versionNumber||item.versions.at(-1)?.number!==job.versionNumber)throw fail('当前稿已继续修改，不能直接撤回这次 AI 修改');
    if(batch.sourceSha256!==job.catalogSha)throw fail('尺寸规范已变化，不能恢复旧规范稿');
    const previousToken=token(batch,item),output=await renderForSpec(batch,spec,job.baseDraft);
    return saveVersion(batch,spec,output,{...(job.reviewBeforeApply?{referenceOnly:true,compositionDraft:job.baseDraft}:{}),restoredFromVersion:job.baseVersion,beforeCommit:version=>{
      if(token(batch,item)!==previousToken)throw fail('当前稿已更新，未执行撤回');
      item.draft={...job.baseDraft};Object.assign(job,{status:'reverted',undoVersionNumber:version.number,updatedAt:now()});
    }});
  };
  const accept=async(batch,spec,item,input)=>{
    const job=item.aiEditJob;
    if(!job||input.candidateId!==job.id)throw fail('AI 候选已更新，请刷新后重试');
    if(job.status==='completed'&&job.versionNumber)return result(item);
    if(job.status!=='awaiting_review'||!job.candidate)throw fail('当前没有可采用的 AI 候选');
    try{
      const workDir=safeChild(storageDir,`ad-resources-${batch.id}`,'ai-edit',job.id),update=async values=>{Object.assign(job,values);await save();};
      await validateAdAiReferenceResult({storageDir,batch,job,workDir,update});
      if(adAiProportionRepair(job.plan?.imageInstruction))await validateAdAiRecompositionResult({job,workDir,update});
    }
    catch(error){job.status='needs_revision';job.error=error.message;delete job.candidate;await save();throw fail(error.message);}
    if(token(batch,item)!==job.baseToken||batch.sourceSha256!==(await getCatalog(batch)).sourceSha256)throw fail('编辑稿已继续调整，候选未覆盖当前稿；请重新生成');
    const buffer=await fs.readFile(safeChild(storageDir,`ad-resources-${batch.id}`,'ai-edit',job.id,'candidate.jpg')),draft={...job.candidate.draft};
    await saveVersion(batch,spec,buffer,{referenceOnly:true,compositionDraft:draft,aiEdit:{jobId:job.id,requestId:job.requestId,prompt:job.prompt,model:job.model,baseVersion:job.baseVersion},beforeCommit:version=>{
      if(token(batch,item)!==job.baseToken||item.aiEditJob!==job)throw fail('编辑稿已更新，未采用过期候选');
      item.draft=draft;item.autoError='';item.autoWarning='';Object.assign(job,{status:'completed',versionNumber:version.number,error:'',updatedAt:now()});delete job.candidate;
    }});
    await Promise.all(['candidate.jpg',`candidate-${AD_SAFE_TYPOGRAPHY_METHOD}.jpg`].map(name=>fs.rm(safeChild(storageDir,`ad-resources-${batch.id}`,'ai-edit',job.id,name),{force:true})));return result(item);
  };
  const discard=async(batch,spec,item,input)=>{
    const job=item.aiEditJob;if(!job||input.candidateId!==job.id)throw fail('AI 候选已更新，请刷新后重试');
    if(job.status==='discarded')return result(item);
    if(job.status!=='awaiting_review')throw fail('当前没有待处理的 AI 候选');
    job.status='discarded';delete job.candidate;job.updatedAt=now();await save();
    await Promise.all(['candidate.jpg',`candidate-${AD_SAFE_TYPOGRAPHY_METHOD}.jpg`].map(name=>fs.rm(safeChild(storageDir,`ad-resources-${batch.id}`,'ai-edit',job.id,name),{force:true})));return result(item);
  };
  const restore=async sheet=>{
    for(const batch of batches){const batchSpecs=batch.outputPolicy?(await getCatalog(batch)).specs:sheet.specs;for(const spec of batchSpecs){
      const item=batch.items?.[spec.id],job=item?.aiEditJob;if(job?.groupId)continue;
      // Repair only an unadopted, margin-only candidate with native PSD layers.
      // Saved versions and the designer's working draft are never migrated.
      if(job?.status==='awaiting_review'&&!job.referenceImages?.length&&!job.safeTypography&&token(batch,item)===job.baseToken){
        try{
        const insetX=adSafeTypographyInset(job.plan?.imageInstruction,spec),source=batch.assets.find(a=>a.id===job.baseDraft?.sourceAssetId);
        if(insetX&&source){
          const typography=await renderAdSafeTypography({batch,source,spec,draft:job.baseDraft,storageDir,assetBuffer,insetX});
          if(typography){
            const folder=`ad-resources-${batch.id}`,workDir=safeChild(storageDir,folder,'ai-edit',job.id),filename=`candidate-${AD_SAFE_TYPOGRAPHY_METHOD}.jpg`;
            const draft={...job.candidate.draft,zoom:1,offsetX:0,offsetY:0};
            const logo=spec.logo==='required'&&!embeddedLogo(source)?batch.assets.find(a=>a.id===draft.logoAssetId&&a.role==='logo'):null;
            const output=await renderJpg(typography.buffer,spec,draft,logo?await assetBuffer(batch,logo):null);
            if(token(batch,item)!==job.baseToken)continue;
            await fs.writeFile(path.join(workDir,'result.png'),typography.buffer);
            await fs.writeFile(safeChild(storageDir,folder,'asset',`visual-ai-edit-${job.id}.png`),typography.buffer);
            // Keep the conventional file for adoption, but change the preview URL
            // so an already cached rejected candidate cannot masquerade as fixed.
            await fs.writeFile(path.join(workDir,'candidate.jpg'),output);
            await fs.writeFile(path.join(workDir,filename),output);
            const asset=batch.assets.find(a=>a.id===job.assetId);if(asset)asset.safeTypography=typography.assessment;
            Object.assign(job,{safeTypography:typography.assessment,resultReady:true,model:'local-typography',updatedAt:now(),outputAdaptation:{method:AD_SAFE_TYPOGRAPHY_METHOD},candidate:{...job.candidate,url:`/storage/${folder}/ai-edit/${job.id}/${filename}`,draft,bytes:output.length}});
            await save();
          }
        }
        }catch(error){Object.assign(job,{status:'needs_revision',error:`文字保护区调整未完成：${error.message}`,updatedAt:now()});delete job.candidate;await save();}
      }
      if(job?.status==='awaiting_review'&&job.referenceImages?.length){
        try{await validateAdAiReferenceResult({storageDir,batch,job,workDir:safeChild(storageDir,`ad-resources-${batch.id}`,'ai-edit',job.id),update:async values=>{Object.assign(job,values);await save();}});}
        catch(error){Object.assign(job,{status:'needs_revision',error:error.message,updatedAt:now()});delete job.candidate;await save();}
      }
      if(job?.status==='awaiting_review'&&adAiProportionRepair(job.plan?.imageInstruction)){
        try{await validateAdAiRecompositionResult({job,workDir:safeChild(storageDir,`ad-resources-${batch.id}`,'ai-edit',job.id),update:async values=>{Object.assign(job,values);await save();}});}
        catch(error){Object.assign(job,{status:'needs_revision',error:error.message,updatedAt:now()});delete job.candidate;await save();}
      }
      if(!isAdAiEditActive(job))continue;
      if(job.submittedAt&&!job.providerJobId&&!job.resultReady){job.status='result_uncertain';job.error='服务已恢复，请继续查询上次提交的结果';await save()}
      else start(batch,spec,item,job);
    }}
  };
  return {submit,resume,undo,restore,result,assertFree,accept,discard};
}
