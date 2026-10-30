let nextPicker=0;

// Create only the project. The surrounding task form and its staged files stay
// mounted so a designer can finish choosing a destination without starting over.
export function bindProjectCreation(select,projects,{api,businessLineIds=[]}={}){
  if(!select||typeof api!=='function')return null;
  const root=document.createElement('div');root.className='project-picker-create';
  const panelId=`project-picker-create-${++nextPicker}`;
  root.innerHTML=`<button type="button" class="project-picker-add" aria-expanded="false" aria-controls="${panelId}">＋ 创建项目</button><div class="project-picker-form" id="${panelId}" hidden><label>项目名称<input class="project-picker-name" maxlength="100" placeholder="输入新项目名称" autocomplete="off"></label><div class="project-picker-actions"><button type="button" class="button project-picker-submit" data-project-create>创建并选中</button><button type="button" class="button ghost" data-project-cancel>取消</button></div><small class="project-picker-error" role="alert" hidden></small></div><small class="project-picker-status" role="status" hidden></small>`;
  (select.closest('label')||select).after(root);
  const add=root.querySelector('.project-picker-add'),panel=root.querySelector('.project-picker-form'),input=root.querySelector('input'),create=root.querySelector('[data-project-create]'),cancel=root.querySelector('[data-project-cancel]'),error=root.querySelector('.project-picker-error'),status=root.querySelector('.project-picker-status');
  let busy=false,previousDisabled=false;
  const message=value=>{error.textContent=value;error.hidden=!value;};
  const show=value=>{panel.hidden=!value;add.setAttribute('aria-expanded',String(value));message('');if(value){status.hidden=true;input.focus();}};
  add.onclick=()=>{if(!busy)show(panel.hidden);};
  cancel.onclick=()=>{if(!busy){show(false);add.focus();}};
  const save=async()=>{
    if(busy||select.disabled)return;
    const name=input.value.trim();message('');status.hidden=true;
    if(!name){message('请填写项目名称');input.focus();return;}
    busy=true;previousDisabled=select.disabled;select.disabled=true;
    for(const node of [add,input,create,cancel])node.disabled=true;
    create.textContent='正在创建…';
    try{
      const project=await api('/api/projects',{method:'POST',body:JSON.stringify({name,businessLineIds})});
      if(!project?.id||!project.name)throw Error('项目创建回执不完整，请刷新项目列表核对');
      const list=typeof projects==='function'?projects():projects;
      const known=list.find(p=>p.id===project.id);if(known)Object.assign(known,project);else list.unshift(project);
      let option=[...select.options].find(option=>option.value===project.id);
      if(!option){option=document.createElement('option');option.value=project.id;option.textContent=project.name;select.append(option);}
      select.value=project.id;select.dispatchEvent(new Event('change',{bubbles:true}));
      window.dispatchEvent(new CustomEvent('workbench-project-created',{detail:{project}}));
      input.value='';show(false);status.textContent='项目已创建并选中';status.hidden=false;
    }catch(e){message(e.message||'项目创建失败，请稍后重试');}
    finally{
      busy=false;select.disabled=previousDisabled;
      for(const node of [add,input,create,cancel])node.disabled=false;
      create.textContent='创建并选中';
    }
  };
  create.onclick=save;
  input.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();event.stopPropagation();void save();}});
  select.closest('form')?.addEventListener('submit',event=>{if(busy){event.preventDefault();event.stopImmediatePropagation();message('项目正在创建，请稍候');}},true);
  return {get busy(){return busy},root};
}
