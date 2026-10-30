import { communityReferences } from './community-references.js';
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

export function hasCommunityMaster(task){
  return Boolean(task.parameters?.assetByTemplate?.[task.masterTemplateId]?.background || task.parameters?.backgroundByTemplate?.[task.masterTemplateId]?.url || task.communityDesign?.currentVersionId || (task.assets || []).some(asset=>['mother-candidate','background','clean-kv'].includes(asset.role)));
}

export function renderCommunityComposer(task, { model, disabled, running, uploading, mode, activeTemplate, error='' }) {
  const references = communityReferences(task);
  const hasMaster = hasCommunityMaster(task);
  const artwork=task.parameters?.communityArtworkByTemplate?.[task.masterTemplateId];
  const currentMode=mode || (artwork?'concept-edit':'concept');
  const draft=task.parameters?.communityDesignDraft ?? (hasMaster?'':task.parameters?.communityImagePrompt || '');
  const versions=task.communityDesign?.versions || [];
  const run=task.communityGeneration;
  const failed=['compose','artwork'].includes(run?.phase) && ['failed','interrupted'].includes(run.status);
  const visibleError=error || (failed?`上次修改未完成，当前母版已保留：${run.error || run.errors?.[0] || '任务已中断，请重新提交'}`:'');
  const editingMaster=currentMode==='concept-edit' && activeTemplate && activeTemplate.id!==task.masterTemplateId;
  return `<div class="community-composer" id="community-composer" data-community-paste="reference-image" tabindex="0" aria-label="参考图与创作说明，支持粘贴图片">
    <div class="community-composer-attachments">${references.map((asset, index) => `<figure class="community-composer-reference"><img src="${esc(asset.url)}" alt="${esc(asset.name)}"><figcaption>图${index+1}</figcaption><button type="button" data-community-remove-ref="${encodeURIComponent(asset.name)}" aria-label="移除参考图 ${esc(asset.name)}">×</button></figure>`).join('')}<label class="community-composer-add" title="添加参考图"><span>＋</span><small>参考图</small><input id="community-reference-upload" type="file" accept="image/png,image/jpeg,image/webp" multiple hidden ${uploading?'disabled':''}></label></div>
    <div class="community-design-mode"><select id="community-composer-mode" aria-label="创作方式" ${running?'disabled':''}><option value="concept" ${currentMode==='concept'?'selected':''}>AI 整稿设计</option>${hasMaster?`<option value="concept-edit" ${currentMode==='concept-edit'?'selected':''}>修改当前整稿</option>`:''}<option value="design" ${currentMode==='design'?'selected':''}>分层制作（固定字体）</option>${hasMaster&&!artwork?`<option value="edit" ${currentMode==='edit'?'selected':''}>调整独立图层</option>`:''}</select><small>${currentMode.startsWith('concept')?'统一设计构图与文案，Logo 独立保留':currentMode==='edit'?'未提到的图层保留':'按公司字体制作独立图层'}</small></div>
    ${artwork&&(artwork.copy!==String(task.copy || '').trim()||artwork.subtitle!==String(task.parameters?.subtitleText || '').trim())?'<p class="community-design-error">文案已修改，请生成对应的整稿修改版。</p>':''}
    ${editingMaster?`<p class="community-last-edit">下方文字修改母版 ${task.masterTemplate?.width || ''}×${task.masterTemplate?.height || ''}；当前尺寸使用「生成当前尺寸试稿」。</p>`:''}
    <textarea id="community-image-prompt" rows="5" aria-label="创作说明" ${running?'disabled':''} placeholder="${currentMode==='edit'?'例如：人物缩小10%，副标底板改成纸质题签，其余保留。':'例如：参考图1的风格与版式，用图2的角色设计，标题醒目，人物自然融入场景。'}">${esc(draft)}</textarea>
    ${task.parameters?.communityCopyReference ? `<details class="community-legacy-copy"><summary>文案补充</summary><textarea id="community-copy-reference" aria-label="文案补充">${esc(task.parameters.communityCopyReference)}</textarea></details>` : ''}
    <div class="community-composer-tools"><select id="community-model-select" aria-label="生图模型" style="width:${model==='gpt-image-2'?'90':'110'}px" ${running?'disabled':''}><option value="banana_pro" ${model==='banana_pro'?'selected':''}>Nano Banana</option><option value="gpt-image-2" ${model==='gpt-image-2'?'selected':''}>GPT Image</option></select><button type="button" id="community-generate-master" class="community-composer-send" ${disabled||uploading?'disabled':''}>${running?'处理中…':currentMode==='concept'?'生成整稿方案 ↑':currentMode==='concept-edit'?'生成整稿修改版 ↑':currentMode==='edit'?'调整当前图层 ↑':'生成分层母版 ↑'}</button></div>
    ${run?.status==='candidate-ready'?`<div class="community-artwork-proposal"><p>新方案已生成。期间画面有调整，已保留当前画面。</p>${task.communityArtworkProposals?.find(p=>p.run.runId===run.runId)?.asset?.url?`<img src="${esc(task.communityArtworkProposals.find(p=>p.run.runId===run.runId).asset.url)}" alt="已保留的整稿方案" style="width:100%">`:''}<button type="button" class="button secondary" id="community-apply-artwork" data-run-id="${esc(run.runId)}">应用新方案</button></div>`:''}
    <p id="community-design-error" class="community-design-error" role="alert" ${visibleError?'':'hidden'}>${esc(visibleError)}</p>
    ${failed&&run.phase==='artwork'&&run.providerJobs?.artwork?.rawFile?`<button type="button" class="button secondary" id="community-resume-artwork" data-run-id="${esc(run.runId)}">恢复已生成的方案（不重新生图）</button>`:''}
    ${task.communityDesign?.lastInstruction?`<p class="community-last-edit">上次修改：${esc(task.communityDesign.lastInstruction)}</p>`:''}
    ${versions.length?`<div class="community-design-versions"><select id="community-design-version" aria-label="母版历史版本">${versions.slice().reverse().map(v=>`<option value="${esc(v.id)}" ${v.id===task.communityDesign.currentVersionId?'selected':''}>${esc(v.label)}</option>`).join('')}</select><button type="button" id="community-restore-version" ${running?'disabled':''}>恢复此版</button></div>`:''}
    ${uploading?'<span class="community-composer-uploading" role="status">正在保存参考图…</span>':''}
  </div>`;
}
