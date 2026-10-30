const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function targetSizeRemoveButton(task,template){
 if(task.customCanvas||task.status==='已完成'&&task.deliveredPackage||template.id===task.masterTemplateId)return '';
 const last=task.targetTemplateIds.length<=1,label=`删除 ${template.width} × ${template.height} 尺寸`;
 return `<button type="button" class="target-size-remove" data-remove-target="${esc(template.id)}" aria-label="${label}" title="${last?'请至少保留一个目标尺寸':label}" ${last?'disabled':''}><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/></svg></button>`;
}
export function nextTargetAfterRemoval(ids,selected,removed){
 const remaining=ids.filter(id=>id!==removed);
 return selected!==removed?selected:remaining[Math.min(ids.indexOf(removed),remaining.length-1)];
}
