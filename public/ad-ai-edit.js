import {adAiSameTypeSpecs,adAiScopeKey,adAiTypeLabel,adAiDefaultScope} from './ad-ai-scope.js?v=20261022-ai-share-v2';
import {adAiPreservationOnly,AD_AI_PRESERVATION_MESSAGE} from './ad-ai-preservation.js?v=20261022-history-colour';
import {isAdImageUrl} from './ad-image-url.js?v=20261022-draft-sync';
import {createAdAiPreview} from './ad-ai-preview.js?v=20261022-ai-preview';
import {mountAdAiReferences,adAiSameReferences} from './ad-ai-references.js?v=20261023-reference-slot';
import {AD_AI_MODELS,AD_AI_DEFAULT_MODEL} from './ad-ai-models.js?v=20261023-compact-inspector';
const active=new Set(['queued','preparing','submitting','processing','downloading','saving']);
export const isAdAiEditLocked=job=>active.has(job?.status)||job?.status==='result_uncertain'||job?.status==='awaiting_review';
const labels={queued:'等待修改',preparing:'正在准备当前画面',submitting:'正在提交画布',processing:'AI 正在修改画面',downloading:'正在取回修改稿',saving:'正在保存新候选',completed:'修改稿已生成，请检查画面',needs_revision:'AI 未完成修改要求，原稿已保留',failed:'本次修改未完成，原稿已保留',conflict:'当前稿已变化，结果未覆盖',result_uncertain:'本次结果待确认，请继续查询',reverted:'已恢复修改前版本'};
const storage={read(key){try{return JSON.parse(sessionStorage.getItem(key)||'null')}catch{return null}},write(key,value){try{value===null?sessionStorage.removeItem(key):sessionStorage.setItem(key,JSON.stringify(value))}catch{}}};

export function mountAdAiEditor({root,batch,spec,specs,item,draft,source,logos,api,toast,isActive,refresh,waitForSaves}){
  let stopped=false,timer,busy=false,submissionUncertain=false,comparing=false,localError='',localNotice='',previewError='';
  const live=()=>!stopped&&root.isConnected&&isActive();
  const key=`ad-ai-prompt:${batch.id}:${spec.id}`,requestKey=key+':request';
  const scopeKey=`ad-ai-scope:auto-v2:${batch.id}:${adAiScopeKey(spec)}`,sameType=adAiSameTypeSpecs(spec,specs);
  let scope=adAiDefaultScope(spec,specs,{job:item.aiEditJob,storedScope:storage.read(scopeKey)});
  const endpoint=id=>`/api/ad-resources/batches/${encodeURIComponent(batch.id)}/items/${encodeURIComponent(id)}/ai-edit`;
  const panel=spec.format==='JPG'&&root.querySelector('.ad-controls')?document.createElement('section'):null;
  const modelKey=`ad-ai-model:${batch.id}`;
  let model=storage.read(modelKey)||item.aiEditJob?.model||AD_AI_DEFAULT_MODEL;
  if(!AD_AI_MODELS.some(option=>option.id===model))model=AD_AI_DEFAULT_MODEL;
  let input,submit,status,error,resume,compare,undo,scopeSelect,modelSelect,adopt,discard,share,references;
  if(panel){
    panel.className='ad-ai-editor';panel.setAttribute('aria-label','AI 修改');
    panel.innerHTML='<div class="ad-ai-heading"><h4>AI 修改</h4></div><div class="ad-ai-composer"><textarea id="ad-ai-prompt" rows="4" maxlength="2000" aria-label="修改要求"></textarea><div class="ad-ai-composer-footer"><select id="ad-ai-model" aria-label="改图模型"></select><button class="button primary" id="ad-ai-submit" type="button" title="生成修改稿" aria-label="生成修改稿"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div></div><p class="ad-ai-status" id="ad-ai-status" role="status" aria-live="polite" hidden></p><p class="ad-ai-error" id="ad-ai-error" role="alert" hidden></p><div class="ad-ai-actions"><button class="button secondary" id="ad-ai-resume" type="button" hidden>继续查询</button><button class="button ghost" id="ad-ai-compare" type="button" hidden>查看修改前</button><button class="button ghost" id="ad-ai-undo" type="button" hidden>撤回本次修改</button></div>';
    const scopeRow=document.createElement('div');scopeRow.className='ad-ai-scope';
    const scopeLabel=document.createElement('label');scopeLabel.htmlFor='ad-ai-scope';scopeLabel.textContent='修改范围';
    scopeSelect=document.createElement('select');scopeSelect.id='ad-ai-scope';
    scopeSelect.add(new Option(`仅当前尺寸 · ${spec.width}×${spec.height}`,'current'));
    if(sameType.length>1)scopeSelect.add(new Option(`自动同步${adAiTypeLabel(spec)} · ${sameType.length}项`,'same-ratio'));
    scopeSelect.value=scope;scopeRow.append(scopeLabel,scopeSelect);
    panel.querySelector('.ad-ai-composer').before(scopeRow);
    scopeSelect.onchange=()=>{scope=scopeSelect.value;storage.write(scopeKey,scope);present()};
    root.querySelector('.ad-inspector-scroll').prepend(panel);
    input=panel.querySelector('#ad-ai-prompt');submit=panel.querySelector('#ad-ai-submit');status=panel.querySelector('#ad-ai-status');error=panel.querySelector('#ad-ai-error');resume=panel.querySelector('#ad-ai-resume');compare=panel.querySelector('#ad-ai-compare');undo=panel.querySelector('#ad-ai-undo');
    modelSelect=panel.querySelector('#ad-ai-model');
    for(const option of AD_AI_MODELS)modelSelect.add(new Option(option.label,option.id));
    modelSelect.value=model;modelSelect.onchange=()=>{model=modelSelect.value;localNotice='';storage.write(modelKey,model);present();};
    const review=document.createElement('div');review.className='ad-ai-review-actions';review.innerHTML='<button class="button primary" type="button" id="ad-ai-adopt">采用并保留</button><button class="button ghost" type="button" id="ad-ai-discard">放弃候选</button>';panel.append(review);adopt=review.querySelector('#ad-ai-adopt');discard=review.querySelector('#ad-ai-discard');
    share=document.createElement('button');share.type='button';share.className='button ghost ad-ai-share';share.textContent='同步到同类尺寸 · 复用当前候选';panel.append(share);
    input.value=storage.read(key)||item.aiEditJob?.prompt||'';
    input.addEventListener('input',()=>{localNotice='';storage.write(key,input.value);present()});
  }
  const showError=message=>{localError=message||'';if(!error)return;error.textContent=localError;error.hidden=!localError};
  const preview=createAdAiPreview({root,onState:state=>{if(!live())return;previewError=state.status==='failed'?'候选预览加载失败，请点击画布中的“重新加载预览”。无需再次生成。':'';present();}});
  const present=()=>{
    const job=item.aiEditJob,reviewing=job?.status==='awaiting_review'&&Boolean(job.candidate),locked=busy||Boolean(references?.busy)||submissionUncertain||isAdAiEditLocked(job)||reviewing;
    const download=root.querySelector('#ad-download-all');if(download)download.disabled=busy||submissionUncertain||batch.sourceSha256!==root.dataset.adCatalogSha||Object.values(batch.items||{}).some(i=>isAdAiEditLocked(i.aiEditJob)||['queued','preparing','submitting','submitted','processing','downloading','encoding'].includes(i.motionJob?.status));
    if(!panel)return;
    const grouped=scope==='same-ratio',groupCount=job?.groupSpecIds?.length||0;
    scopeSelect.disabled=locked;modelSelect.disabled=locked;
    const submitLabel=busy?'正在提交…':active.has(job?.status)?(groupCount?`正在同步 ${groupCount} 项…`:'正在修改…'):grouped?`生成并同步 ${sameType.length} 项`:job?.status==='completed'?'继续修改当前稿':'生成修改稿';
    submit.disabled=locked||!source||!input.value.trim();submit.title=submitLabel;submit.setAttribute('aria-label',submitLabel);submit.setAttribute('aria-busy',String(busy||active.has(job?.status)));
    input.disabled=locked;
    references?.setLocked(locked);
    const changed=Boolean(job&&(input.value.trim()!==job.prompt||AD_AI_MODELS.some(option=>option.id===job.model)&&model!==job.model||!adAiSameReferences(references?.ids,(job.referenceImages||[]).map(ref=>ref.id))));
    const corrected=item.versions.at(-1)?.toneCorrection&&!active.has(job?.status)?item.versions.at(-1):null;
    status.textContent=busy?'正在提交…':submissionUncertain?'提交结果待确认':reviewing?'候选已生成，请检查画面':localNotice||(corrected&&!changed?'配色已校准':job&&active.has(job.status)?labels[job.status]:job&&['needs_revision','failed','conflict','result_uncertain'].includes(job.status)?labels[job.status]:'');
    status.hidden=!status.textContent;
    if(groupCount&&status.textContent&&!changed)status.textContent+=`（同类 ${groupCount} 项）`;
    if(!busy&&!submissionUncertain){error.textContent=localError||previewError||job?.error||'';error.hidden=!error.textContent}
    resume.hidden=!(submissionUncertain||job?.canResume||job?.status==='result_uncertain'||job?.status==='failed'&&job.resultReady);resume.disabled=busy;
    resume.textContent=job?.status==='failed'&&job.canResume?'重新处理已有结果':'继续查询';
    const current=!item.draftDirty&&job?.status==='completed'&&job.versionNumber===item.versions.at(-1)?.number;
    compare.hidden=!((current||reviewing)&&job.basePreviewUrl);undo.hidden=!current;compare.disabled=busy;undo.disabled=busy;
    resume.parentElement.hidden=resume.hidden&&compare.hidden&&undo.hidden;
    adopt.parentElement.hidden=!reviewing;discard.disabled=busy;adopt.textContent=groupCount?`采用并保留 ${groupCount} 项`:'采用并保留';
    if(reviewing)preview.show(comparing?job.basePreviewUrl:job.candidate.url,{caption:comparing?'正在查看修改前 · 返回候选后可采用':'AI 候选预览 · 尚未采用，当前稿保持不变',alt:comparing?'AI 修改前画面':'AI 候选预览，尚未采用'});
    adopt.disabled=busy||comparing||preview.state.status!=='ready';
    share.hidden=!(reviewing||current)||Boolean(groupCount)||sameType.length<2;share.disabled=busy||reviewing&&preview.state.status!=='ready';share.textContent=reviewing?'同步到同类尺寸 · 复用当前候选':'同步到同类尺寸 · 复用已采用结果';
    if(reviewing&&!comparing&&preview.state.status!=='ready')status.textContent=preview.state.status==='failed'?'AI 候选已保存，但预览加载失败；无需重新生成':'AI 候选已保存，正在加载预览…';
    undo.textContent=groupCount?`撤回本次同类修改（${groupCount}项）`:'撤回本次修改';
    root.querySelectorAll('#ad-source-upload,#ad-logo-upload,.ad-sliders input').forEach(node=>{node.disabled=locked});
    const keep=root.querySelector('#ad-keep-version');if(keep)keep.disabled=locked;
    const draftUndo=root.querySelector('#ad-draft-undo'),draftRedo=root.querySelector('#ad-draft-redo');if(draftUndo)draftUndo.disabled=locked||!item.draftCanUndo;if(draftRedo)draftRedo.disabled=locked||!item.draftCanRedo;
  };
  const acceptOne=(id,result,notify=true)=>{
    const target=batch.items[id];if(!target)return;
    const old=target.aiEditJob;target.aiEditJob=result.editJob;
    if(result.candidate&&target.aiEditJob)target.aiEditJob.candidate=result.candidate;
    if(result.version&&result.editJob?.status==='completed'){
      if(!target.versions.some(v=>v.number===result.version.number))target.versions.push(result.version);
      if(result.draft)target.draft={...result.draft};
      target.draftDirty=Boolean(result.draftDirty);
    }
    if(id===spec.id)localError='';
    const card=root.querySelector(`[data-ad-spec="${CSS.escape(id)}"]`),job=result.editJob;
    if(active.has(job?.status)||job?.status==='result_uncertain'){const text=card?.querySelector('em');if(text)text.textContent=labels[job.status]}
    if(notify&&id===spec.id&&job?.status==='awaiting_review'&&(old?.id!==job.id||old?.status!=='awaiting_review')){storage.write(requestKey,null);toast('AI 候选已生成，请检查后采用或放弃');refresh();return;}
    if(notify&&id===spec.id&&job?.status==='completed'&&job.versionNumber!==old?.versionNumber){
      storage.write(requestKey,null);toast(result.version?.kind==='composition'?(job.groupId?`已采用候选并保留 ${job.groupSpecIds.length} 项方案`:'已采用候选并保留为方案'):job.groupId?`同类 ${job.groupSpecIds.length} 项修改稿已生成，请检查画面`:'AI 修改稿已生成，请检查画面');refresh();return;
    }
    if(result.version&&job?.status==='completed'){
      const image=card?.querySelector('img');if(image)image.src=result.version.url;
      const text=card?.querySelector('em');if(text)text.textContent=`${target.versions.length} 个保留方案 · 待检查`;
    }
    present();
  };
  const accept=(id,result)=>{
    // Update siblings before refreshing the selected canvas, including when a
    // sibling poll is the first to return the completed group.
    for(const child of result.groupJobs||[])if(child.specId!==spec.id)acceptOne(child.specId,child,false);
    const selected=result.groupJobs?.find(child=>child.specId===spec.id);
    if(selected)acceptOne(spec.id,selected);
    else acceptOne(id,result);
  };
  const poll=async()=>{
    if(!live())return;
    await Promise.allSettled(specs.filter(s=>active.has(batch.items?.[s.id]?.aiEditJob?.status)).map(async s=>{
      try{const result=await api(endpoint(s.id));if(live())accept(s.id,result)}catch{if(live()&&s.id===spec.id&&status)status.textContent='状态读取暂未成功，正在继续查询…'}
    }));
    if(live()&&specs.some(s=>active.has(batch.items?.[s.id]?.aiEditJob?.status)))timer=setTimeout(poll,2500);
  };
  const watch=()=>{clearTimeout(timer);if(live()&&specs.some(s=>active.has(batch.items?.[s.id]?.aiEditJob?.status)))timer=setTimeout(poll,500)};
  if(panel){
    references=mountAdAiReferences({panel,batch,item,endpoint:endpoint(spec.id),api,isActive:live,onChange:present,onError:showError});
    submit.onclick=async()=>{
      if(busy||references.busy||submissionUncertain||isAdAiEditLocked(item.aiEditJob)||!input.value.trim())return;
      if(adAiPreservationOnly(input.value)){localNotice=AD_AI_PRESERVATION_MESSAGE;showError('');present();return}
      localNotice='';busy=true;showError('');present();
      try{
        await waitForSaves();if(!live())return;
        const prompt=input.value.trim(),referenceIds=references.ids,expectedVersion=item.versions.at(-1)?.number||0;
        const groupPayload=scope==='same-ratio'?{scope,targets:sameType.map(s=>({specId:s.id,expectedVersion:batch.items[s.id]?.versions?.at(-1)?.number||0,draft:{...batch.items[s.id]?.draft}}))}:{};
        const saved=storage.read(requestKey);
        // Only reuse a request whose receipt is still unknown. Once the server
        // confirmed a failed/finished job, an explicit new click is a new edit.
        // Otherwise retrying the same words returns the old failure forever.
        const confirmed=saved&&item.aiEditJob?.requestId===saved.requestId;
        const payload=!confirmed&&saved?.prompt===prompt&&(saved.model||AD_AI_DEFAULT_MODEL)===model&&adAiSameReferences(saved.referenceIds,referenceIds)&&saved.expectedVersion===expectedVersion&&JSON.stringify(saved.draft)===JSON.stringify(draft)&&(saved.scope||'current')===scope&&JSON.stringify(saved.targets)===JSON.stringify(groupPayload.targets)?saved:{requestId:crypto.randomUUID(),prompt,model,referenceIds,expectedVersion,draft:{...draft},reviewBeforeApply:true,syncSimilar:true,...groupPayload};
        storage.write(requestKey,payload);
        const result=await api(endpoint(spec.id),{method:'POST',body:JSON.stringify(payload)});
        if(!live())return;
        if(result.localDraft){storage.write(requestKey,null);toast(result.sync?.updated?.length?`Logo 调整已同步 ${result.sync.updated.length} 个同类尺寸，没有新增版本`:'Logo 调整已保存到编辑稿，没有新增版本');refresh();return;}
        accept(spec.id,result);watch();
      }catch(e){
        if(!live())return;
        try{
          const result=await api(endpoint(spec.id));if(!live())return;
          const saved=storage.read(requestKey);
          if(result.editJob?.requestId===saved?.requestId){accept(spec.id,result);watch()}
          else{storage.write(requestKey,null);showError(e.message)}
        }catch{submissionUncertain=true;showError('暂时无法确认提交结果，请继续查询；本次请求已保留')}
      }finally{busy=false;if(live())present()}
    };
    resume.onclick=async()=>{
      if(busy)return;busy=true;showError('');present();
      try{
        const result=await api(endpoint(spec.id)+(submissionUncertain?'':'/resume'),submissionUncertain?undefined:{method:'POST',body:'{}'});
        if(!live())return;
        submissionUncertain=false;accept(spec.id,result);watch();
      }catch(e){if(live())showError(e.message)}finally{busy=false;if(live())present()}
    };
    compare.onclick=()=>{
      const img=root.querySelector('#ad-stage-final'),job=item.aiEditJob;if(!img||!job)return;
      const before=job.basePreviewUrl,latest=job.status==='awaiting_review'?job.candidate?.url:item.versions.at(-1)?.url;
      if(!isAdImageUrl(before)||!isAdImageUrl(latest))return;
      comparing=!comparing;preview.show(comparing?before:latest,{caption:comparing?'正在查看修改前':'AI 修改后预览',alt:comparing?'AI 修改前候选':'AI 修改后候选'});compare.textContent=comparing?'返回修改后':'查看修改前';compare.setAttribute('aria-pressed',String(comparing));present();
    };
    undo.onclick=async()=>{
      if(busy)return;busy=true;showError('');present();
      try{await waitForSaves();const grouped=Boolean(item.aiEditJob?.groupId);await api(endpoint(spec.id)+'/undo',{method:'POST',body:JSON.stringify({expectedVersion:item.versions.at(-1)?.number})});if(live()){storage.write(requestKey,null);toast(grouped?'同类尺寸已一起恢复，修改稿仍保留在历史中':'已恢复修改前版本，修改稿仍保留在历史中');refresh()}}
      catch(e){if(live())showError(e.message)}finally{busy=false;if(live())present()}
    };
    for(const [button,action]of [[adopt,'accept'],[discard,'discard']])button.onclick=async()=>{
      if(busy||action==='accept'&&(comparing||preview.state.status!=='ready'))return;busy=true;showError('');present();
      try{await waitForSaves();const result=await api(endpoint(spec.id)+'/'+action,{method:'POST',body:JSON.stringify({candidateId:item.aiEditJob.candidate.id})});if(live()){storage.write(requestKey,null);if(action==='accept')accept(spec.id,result);else{toast('已放弃候选，当前编辑稿未改变');refresh();}}}
      catch(e){if(live())showError(e.message)}finally{busy=false;if(live())present()}
    };
    share.onclick=async()=>{
      if(busy||item.aiEditJob?.status==='awaiting_review'&&preview.state.status!=='ready')return;busy=true;showError('');present();
      try{await waitForSaves();const result=await api(endpoint(spec.id)+'/synchronize',{method:'POST',body:JSON.stringify({candidateId:item.aiEditJob.candidate?.id||item.aiEditJob.id})});if(live()){toast(result.sharedSpecIds?(result.sharedSpecIds.length?'已复用确认结果，同步并保留其它同类尺寸':'同类尺寸已一致，没有新增重复版本'):'现有候选已同步到同类尺寸，未重新生成；确认后可一起采用');refresh();}}
      catch(e){if(live())showError(e.message)}finally{busy=false;if(live())present()}
    };
  }
  root.addEventListener('ad-candidate-updated',present);
  root.addEventListener('ad-working-updated',present);
  present();watch();
  return ()=>{stopped=true;clearTimeout(timer);preview.dispose();references?.dispose();root.removeEventListener('ad-candidate-updated',present);root.removeEventListener('ad-working-updated',present)};
}
