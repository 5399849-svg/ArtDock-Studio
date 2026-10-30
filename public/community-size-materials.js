import {sourceMaterialDialog,mountSourceMaterialDialog} from './source-material-dialog.js';
import {placedCommunityObjects} from './community-object-layers.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function renderSizeMaterials(task,template,{disabled=false}={}){
 const layers=placedCommunityObjects(task,template.id).filter(l=>l.appearance.kind==='material');
 return `<section class="community-size-materials"><h3>画布素材</h3>${layers.map(l=>{const asset=task.assets.find(a=>a.name===l.appearance.assetName);return `<div class="size-material-row"><img src="${esc(asset?.url)}" alt=""><span title="${esc(l.appearance.name)}">${esc(l.appearance.name)}</span><button type="button" data-size-material-select="${esc(l.id)}" ${disabled?'disabled':''}>选中</button><button type="button" data-object-unplace="${esc(l.id)}" aria-label="移除${esc(l.appearance.name)}" ${disabled?'disabled':''}>×</button></div>`;}).join('')}<button type="button" id="source-add-material" class="button secondary full-button" ${disabled?'disabled':''}>＋ 新增使用素材</button></section>`;
}
export {sourceMaterialDialog};
export function mountSizeMaterials({root,task,template,api,flush,updated,select,isBusy}){
 root.querySelectorAll('[data-size-material-select]').forEach(button=>button.onclick=()=>select(button.dataset.sizeMaterialSelect));
 return mountSourceMaterialDialog({root,task,api,isBusy,readFile:file=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('素材读取失败'));reader.readAsDataURL(file);}),add:async input=>{
  const current=await flush();if(!current)throw Error('排版尚未保存，请稍后再试');const saved=await api(`/api/tasks/${task.id}/community-canvas-materials`,{method:'POST',body:JSON.stringify({...input,templateId:template.id,expectedUpdatedAt:current.updatedAt})});
  await updated(saved);select(placedCommunityObjects(saved,template.id).at(-1).id);
 }});
}
