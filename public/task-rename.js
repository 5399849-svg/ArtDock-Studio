export function openTaskRename(task,save){
  return new Promise(resolve=>{
    const dialog=document.createElement('dialog');dialog.className='dialog';
    dialog.setAttribute('aria-label','修改任务名称');
    dialog.innerHTML='<form><div class="dialog-head"><h2>修改任务名称</h2><button type="button" class="icon-button" data-cancel aria-label="关闭">×</button></div><label>任务名称<input name="taskName" maxlength="100" required autocomplete="off"></label><p role="alert" hidden></p><div class="dialog-actions"><button type="button" class="button secondary" data-cancel>取消</button><button type="submit" class="button primary">保存</button></div></form>';
    const form=dialog.querySelector('form'),input=form.elements.taskName,errorNode=dialog.querySelector('[role="alert"]'),submit=dialog.querySelector('[type="submit"]');
    let busy=false,saved=false;input.value=task.project||task.label||'';
    dialog.querySelectorAll('[data-cancel]').forEach(button=>button.onclick=()=>{if(!busy)dialog.close()});
    dialog.oncancel=event=>{if(busy)event.preventDefault()};
    dialog.onclose=()=>{dialog.remove();resolve(saved)};
    form.onsubmit=async event=>{
      event.preventDefault();if(busy)return;
      const name=input.value.trim();
      if(!name){input.setCustomValidity('请填写任务名称');input.reportValidity();return}
      if(name===task.project){dialog.close();return}
      busy=true;submit.disabled=true;input.disabled=true;errorNode.hidden=true;
      try{await save(name);saved=true;dialog.close()}
      catch(error){errorNode.textContent=error.message;errorNode.hidden=false}
      finally{busy=false;submit.disabled=false;input.disabled=false}
    };
    input.oninput=()=>input.setCustomValidity('');
    document.body.append(dialog);dialog.showModal();input.focus();input.select();
  });
}
