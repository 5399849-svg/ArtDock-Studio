const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function renderTargetSizeDialog(available,{allowCustom=false}={}){
 const custom=allowCustom&&!available.length;
 return `<dialog id="add-size-dialog" class="dialog add-size-dialog"><form id="add-size-form" data-mode="${custom?'custom':'common'}"><div class="dialog-head"><div><h2>添加尺寸</h2><p class="dialog-note">选择常用尺寸，或为当前任务添加临时尺寸</p></div><button type="button" class="icon-button" id="close-add-size" aria-label="关闭">×</button></div>${allowCustom?`<div class="add-size-tabs" role="tablist" aria-label="尺寸来源"><button type="button" role="tab" data-size-tab="common" aria-selected="${!custom}" aria-controls="add-size-common">常用尺寸</button><button type="button" role="tab" data-size-tab="custom" aria-selected="${custom}" aria-controls="add-size-custom">自定义尺寸</button></div>`:''}<div id="add-size-common" role="tabpanel" ${custom?'hidden':''}><div class="add-size-options">${available.map(t=>`<label><input type="checkbox" name="templateIds" value="${esc(t.id)}"><span><b>${esc(t.name)}</b><small>${t.width} × ${t.height} · ${t.format}</small></span></label>`).join('')||'<div class="empty"><b>常用尺寸已全部加入</b>可以切换到自定义尺寸，填写新的宽高。</div>'}</div></div>${allowCustom?`<fieldset id="add-size-custom" class="add-size-custom" role="tabpanel" ${custom?'':'hidden disabled'}><div class="add-size-dimensions"><label>宽度 <small>px</small><input type="number" name="width" placeholder="例如 1200" min="64" max="8192" step="1" required></label><span>×</span><label>高度 <small>px</small><input type="number" name="height" placeholder="例如 628" min="64" max="8192" step="1" required></label></div><label>导出格式<select name="format"><option value="PNG">PNG</option><option value="JPG">JPG</option></select></label><p>宽高支持 64–8192 px，总像素不超过 3200 万。添加后可单独调整构图，素材保持原有比例。</p></fieldset>`:''}<p class="add-size-error" role="alert" hidden></p><div class="dialog-actions"><button type="button" class="button ghost" id="cancel-add-size">取消</button><button type="submit" class="button primary" ${!custom&&!available.length?'disabled':''}>${custom?'添加自定义尺寸':'添加所选尺寸'}</button></div></form></dialog>`;
}
export function bindTargetSizeDialog(dialog){
 if(!dialog)return;const form=dialog.querySelector('form'),submit=form.querySelector('[type=submit]');
 const update=()=>{submit.disabled=form.dataset.mode==='common'&&!form.querySelector('[name=templateIds]:checked');};
 dialog.querySelectorAll('[data-size-tab]').forEach(button=>button.onclick=()=>{
  const mode=button.dataset.sizeTab;form.dataset.mode=mode;
  dialog.querySelectorAll('[data-size-tab]').forEach(b=>b.setAttribute('aria-selected',String(b===button)));
  dialog.querySelector('#add-size-common').hidden=mode!=='common';const custom=dialog.querySelector('#add-size-custom');custom.hidden=custom.disabled=mode!=='custom';
  dialog.querySelector('[role=alert]').hidden=true;submit.textContent=mode==='custom'?'添加自定义尺寸':'添加所选尺寸';update();
 });
 form.querySelectorAll('[name=templateIds]').forEach(input=>input.addEventListener('change',update));update();
 dialog.addEventListener('keydown',event=>event.stopPropagation());dialog.addEventListener('keyup',event=>event.stopPropagation());
}
