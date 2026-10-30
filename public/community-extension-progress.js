import {communityArtworkTargetPending,communityTargetHasComposition,communityTargetReviewMatches} from './community-artwork-state.js?v=20261022-reviewed-suite';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function communityExtensionProgress(task,template){
 const run=task.communityGeneration||{},sync=task.communityTargetSync;if(run.workflow!=='layered-reflow-v1'&&!sync)return '';
 const templates=(task.targetTemplateIds||[]).filter(id=>id!==task.masterTemplateId).map(id=>task.templates?.find(t=>t.id===id)||{id,communityPlacement:true});
 const pending=templates.filter(t=>communityArtworkTargetPending(task,t)),retained=templates.filter(t=>communityTargetHasComposition(task,t)),done=templates.length-pending.length;
 const item=run.items?.find(i=>i.templateId===template.id),failed=['partial','failed'].includes(run.status)&&(item?.status==='failed'||!!run.error);
 const elapsed=Math.max(0,Math.round(((run.status==='running'?Date.now():Date.parse(run.completedAt))-Date.parse(run.startedAt))/1000));
 const time=Number.isFinite(elapsed)?elapsed>=60?`${Math.floor(elapsed/60)}分${elapsed%60}秒`:`${elapsed}秒`:'';
 const locallySynced=sync?.fingerprint===task.communityMasterApproval?.fingerprint&&sync.updated?.length>0;
 const status=run.status==='running'?`更新进度 ${run.items?.filter(i=>i.status==='done').length??run.done??0}/${run.items?.length||run.total||templates.length} · 已保留 ${retained.length} 张尺寸稿${time?' · '+time:''}`:failed?`本次调整未完成 · 已保留 ${retained.length} 张尺寸稿`:pending.length&&retained.length?`已保留 ${retained.length} 张尺寸稿 · ${pending.length} 张待同步`:locallySynced&&!pending.length?`已同步 ${done}/${templates.length} · 本地更新`:`已完成 ${done}/${templates.length}${time?' · 用时 '+time:''}`;
 const stale=communityArtworkTargetPending(task,template)&&communityTargetHasComposition(task,template),detail=failed?(communityTargetHasComposition(task,template)?'仍显示上次尺寸稿，本次调整未应用':'本次生成未完成'):stale?'保留上次构图，等待同步母版':communityTargetReviewMatches(task,template)?'已确认当前尺寸稿，可成套输出':locallySynced&&!pending.length?'背景与各尺寸手动构图已保留，无需重新生图':item?.stage||'等待处理';
 const recoverable=failed&&item?.status==='failed'&&(item.rawAvailable||item.providerJobId&&/画幅|比例/.test(item.error||''));
 return `<div class="community-extension-progress ${failed?'has-error':''}" role="status"><b>${esc(status)}</b><span>当前尺寸：${esc(detail)}</span>${failed&&item?.error?`<p>${esc(item.error)}</p>`:failed&&run.error?`<p>${esc(run.error)}</p>`:''}${recoverable?`<button type="button" class="button secondary full-button" id="community-resume-target" data-template-id="${esc(template.id)}" data-run-id="${esc(run.runId)}">恢复已生成结果（不重新生图）</button>`:''}</div>`;
}
