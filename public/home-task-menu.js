const actions=[
 ['rename','重命名','<path d="m15 4 5 5M4 20l4-1L20 7a2.1 2.1 0 0 0-3-3L5 16z"/>'],
 ['copy','复制任务','<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M15 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h3"/>'],
 ['download','下载','<path d="M12 3v12m-4-4 4 4 4-4M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/>'],
 ['trash','删除','<path d="M3 6h18M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M5 6l1 14a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1l1-14M10 10v7m4-7v7"/>'],
];
const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function homeTaskMenu({taskId,index}){
 const core=taskId!==undefined,panel=core?`data-home-task-menu-panel="${esc(taskId)}"`:`data-dash-menu-panel="${index}"`;
 return `<div class="home-task-menu" ${panel} hidden>${actions.map(([action,label,paths])=>`<button type="button" ${action==='trash'?'class="danger-text" ':''}${core?`data-home-task-action="${action}" data-task-id="${esc(taskId)}"`:`data-dash-action="${action}" data-dash-index="${index}"`}><svg class="home-task-action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg><span>${label}</span></button>`).join('')}</div>`;
}

// Like the existing core-task copy, module copies start as new task drafts.
// Generation, delivery files and approvals stay with the original task.
export async function copyModuleTaskSetup(task,api){
 const name=[...`${task.project||'未命名任务'} 副本`].slice(0,80).join(''),body={project:name,projectId:task.projectId||'',requestId:crypto.randomUUID()};
 let endpoint;
 if(task.module==='channel-resources'){
  endpoint=`/api/channel-resources/batches/${encodeURIComponent(task.batchId)}/projects/${encodeURIComponent(task.projectKey)}/copy`;body.name=name;
 }else if(task.module==='ad-resources')endpoint='/api/ad-resources/batches';
 else if(['store-preorder','store-launch','icon-preorder','icon-launch'].includes(task.module))endpoint=`/api/${task.module}/jobs`;
 else throw Error('任务类型无效，请刷新页面重试');
 return api(endpoint,{method:'POST',body:JSON.stringify(body)});
}
