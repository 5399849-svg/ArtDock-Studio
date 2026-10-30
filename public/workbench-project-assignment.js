import {escapeHtml as esc} from './workbench-model.js?v=20261022-version-lifecycle';

export function createProjectAssignment({projects,api,reload,toast}){
 async function open(tasks,onSaved=()=>{}){
  if(!tasks.length)return;
  let dialog=document.querySelector('#wb-project-assignment-dialog');
  if(!dialog){dialog=document.createElement('dialog');dialog.id='wb-project-assignment-dialog';dialog.className='dialog wb-project-assignment-dialog';document.body.append(dialog);}
  const choices=projects(),canUnfile=tasks.some(t=>t.projectId||t.projectIds?.length);
  const common=tasks.every(t=>t.projectId===tasks[0].projectId)?tasks[0].projectId:'';
  dialog.innerHTML=`<form id="wb-project-assignment-form"><div class="dialog-head"><h2>归档到项目</h2><button type="button" class="icon-button" data-assignment-cancel aria-label="关闭归档窗口">×</button></div><p class="wb-assignment-summary">${tasks.length===1?esc(tasks[0].label):`已选择 ${tasks.length} 个任务`}</p><label for="wb-assignment-project">选择项目</label><select id="wb-assignment-project" required aria-describedby="wb-assignment-error"><option value="" disabled selected>请选择归档项目</option>${choices.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}${p.status==='archived'?'（已归档项目）':''}</option>`).join('')}${canUnfile?'<option value="__unfiled__">移出项目，设为未归档</option>':''}</select>${choices.length?'':'<p>还没有项目，请先在项目页新建项目。</p>'}<p class="wb-assignment-error" id="wb-assignment-error" role="alert" hidden></p><div class="dialog-actions"><button type="button" class="button secondary" data-assignment-cancel>取消</button><button type="submit" class="button primary" id="wb-assignment-submit" disabled>确认归档</button></div></form>`;
  const select=dialog.querySelector('select'),submit=dialog.querySelector('[type=submit]'),error=dialog.querySelector('[role=alert]');
  if(common&&choices.some(p=>p.id===common))select.value=common;
  select.onchange=()=>{submit.disabled=!select.value;error.hidden=true;};select.onchange();
  let busy=false;
  dialog.oncancel=e=>{if(busy)e.preventDefault();};
  dialog.querySelectorAll('[data-assignment-cancel]').forEach(b=>b.onclick=()=>{if(!busy)dialog.close();});
  dialog.querySelector('form').onsubmit=async e=>{
   e.preventDefault();if(busy||!select.value)return;
   busy=true;submit.disabled=true;select.disabled=true;submit.textContent='正在保存…';error.hidden=true;
   dialog.querySelectorAll('[data-assignment-cancel]').forEach(b=>b.disabled=true);
   const projectId=select.value==='__unfiled__'?'':select.value;
   try{await api('/api/workbench/project-links',{method:'PUT',body:JSON.stringify({keys:tasks.map(t=>t.key),projectId})});}
   catch(e){busy=false;error.textContent=e.message||'归档未保存，请重试';error.hidden=false;submit.textContent='确认归档';submit.disabled=false;select.disabled=false;dialog.querySelectorAll('[data-assignment-cancel]').forEach(b=>b.disabled=false);return;}
   busy=false;dialog.close();
   try{await reload();await onSaved();toast(projectId?`${tasks.length} 个任务已归档到“${choices.find(p=>p.id===projectId).name}”`:'任务已设为未归档');}
   catch(e){toast('项目归属已保存，请刷新页面查看：'+e.message);}
  };
  dialog.showModal();select.focus();
 }
 return {open};
}

export function bindProjectAssignmentTable(root,rows,open){
 root.querySelectorAll('[data-assign-project]').forEach(button=>button.onclick=()=>{
  const task=rows.find(t=>t.key===button.dataset.assignProject);if(task)open([task]);
 });
 const boxes=[...root.querySelectorAll('[data-wb-task-select]')],all=root.querySelector('[data-wb-select-all]'),bar=root.querySelector('[data-wb-task-bulk]');
 if(!all||!bar)return;
 const selected=()=>boxes.filter(b=>b.checked);
 const sync=()=>{const count=selected().length;bar.hidden=!count;bar.querySelector('[data-wb-selected-count]').textContent=`已选择 ${count} 个任务`;all.checked=boxes.length>0&&count===boxes.length;all.indeterminate=count>0&&count<boxes.length;};
 boxes.forEach(b=>b.onchange=sync);
 all.onchange=()=>{boxes.forEach(b=>b.checked=all.checked);sync();};
 bar.querySelector('[data-wb-clear-selection]').onclick=()=>{boxes.forEach(b=>b.checked=false);sync();};
 bar.querySelector('[data-wb-assign-selected]').onclick=()=>{const keys=new Set(selected().map(b=>b.dataset.wbTaskSelect));open(rows.filter(t=>keys.has(t.key)));};
 sync();
}
