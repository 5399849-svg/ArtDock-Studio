import {bindProjectCreation} from './project-picker-create.js?v=20261023-project-create';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const logos=project=>(project?.assets||[]).filter(asset=>asset.role==='logo'&&asset.id);

export function bindProjectLogoChoice(projectSelect,projects,{anchor=projectSelect.closest('label'),note='需要 Logo 的资源位自动使用；无 Logo 稿按规范处理。',api,businessLineIds=[]}={}){
  const panel=document.createElement('div');panel.className='project-logo-choice';anchor.after(panel);
  let projectId='';
  const render=()=>{
    const project=(typeof projects==='function'?projects():projects).find(p=>p.id===projectSelect.value),assets=logos(project);
    const previous=projectId===projectSelect.value?panel.querySelector('select')?.value:undefined;projectId=projectSelect.value;
    panel.hidden=!project;if(!project){panel.replaceChildren();return;}
    const defaultLogo=assets.find(asset=>asset.id===project.defaultLogoId);
    panel.innerHTML=`<label>项目 Logo<select name="projectLogoId"><option value="default">${defaultLogo?`使用默认：${esc(defaultLogo.name)}`:'项目暂未设置默认 Logo'}</option>${assets.map(asset=>`<option value="${esc(asset.id)}">${esc(asset.name)}</option>`).join('')}<option value="">本次不使用项目 Logo</option></select></label><div class="project-logo-selected"><img alt="所选项目 Logo" hidden><small></small></div><small class="project-logo-note">${esc(note)}</small>`;
    const select=panel.querySelector('select');if(previous!==undefined&&[...select.options].some(option=>option.value===previous))select.value=previous;
    const preview=()=>{const asset=assets.find(asset=>asset.id===(select.value==='default'?project.defaultLogoId:select.value)),image=panel.querySelector('img'),caption=panel.querySelector('.project-logo-selected small');image.hidden=!asset;if(asset)image.src=asset.url;else image.removeAttribute('src');caption.textContent=asset?asset.name:select.value===''?'本次不带入项目 Logo':'可在项目详情中上传或从已有任务选择 Logo。';};
    select.onchange=preview;preview();
  };
  const creator=bindProjectCreation(projectSelect,projects,{api,businessLineIds});
  projectSelect.addEventListener('change',render);render();
  return {render,get value(){return panel.querySelector('select')?.value??'default';},get creatingProject(){return creator?.busy||false;}};
}

export async function mountProjectLogoManager(container,{project,api,reload,toast}){
  container.classList.add('project-logo-manager');
  let data,busy=false;
  const endpoint=`/api/projects/${encodeURIComponent(project.id)}/logos`;
  const execute=async work=>{
    if(busy)return;busy=true;container.querySelectorAll('button,input,select').forEach(node=>node.disabled=true);
    try{data=await work();await reload();if(container.isConnected)render();toast('项目 Logo 已保存，新任务将按所选 Logo 创建');}
    catch(error){toast(error.message);if(container.isConnected)render();}
    finally{busy=false;}
  };
  const render=()=>{
    container.innerHTML=`<header><div><h3>项目 Logo</h3><p>选项目后自动带入默认 Logo，也可以切换其他版本。更新项目 Logo 不会改动已有任务。</p></div><label class="button secondary">＋ 上传 Logo<input type="file" accept="image/png,image/jpeg,image/webp" multiple hidden data-logo-upload></label></header><div class="project-logo-grid">${data.logos.map(asset=>`<article><div class="project-logo-art"><img src="${esc(asset.url)}" alt="${esc(asset.name)}"></div><b>${esc(asset.name)}</b>${asset.id===data.defaultLogoId?'<span class="project-logo-default">当前默认</span>':`<button class="button ghost" type="button" data-logo-default="${esc(asset.id)}">设为默认</button>`}</article>`).join('')||'<p>还没有项目 Logo。可上传一次，或从下面已有素材中选择。</p>'}</div><div class="project-logo-existing"><label>从已有素材添加<select data-logo-source><option value="">选择这个项目的已有 Logo</option>${data.candidates.filter(asset=>!data.logos.some(logo=>logo.url===asset.url)).map((asset,index)=>`<option value="${esc(asset.url)}">${esc(asset.name)} · ${esc(asset.origin)}</option>`).join('')}</select></label><img data-logo-source-preview alt="已有 Logo 预览" hidden><button type="button" class="button secondary" data-logo-add>添加到项目</button></div>`;
    container.querySelectorAll('[data-logo-default]').forEach(button=>button.onclick=()=>execute(()=>api(endpoint+'/default',{method:'PUT',body:JSON.stringify({logoId:button.dataset.logoDefault})})));
    const select=container.querySelector('[data-logo-source]'),image=container.querySelector('[data-logo-source-preview]');select.onchange=()=>{image.hidden=!select.value;if(select.value)image.src=select.value;else image.removeAttribute('src')};
    container.querySelector('[data-logo-add]').onclick=()=>{if(!select.value){toast('请先选择已有 Logo');return;}execute(()=>api(endpoint,{method:'POST',body:JSON.stringify({sourceUrl:select.value})}));};
    container.querySelector('[data-logo-upload]').onchange=event=>{const files=[...event.target.files||[]];if(!files.length)return;execute(async()=>{let result=data;for(const file of files){if(file.size>20*1024*1024)throw Error('Logo 需要小于 20MB');const dataUrl=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('图片读取失败'));reader.readAsDataURL(file)});result=await api(endpoint,{method:'POST',body:JSON.stringify({name:file.name,dataUrl})});}return result;});};
  };
  container.textContent='正在读取项目 Logo…';
  try{data=await api(endpoint);if(container.isConnected)render();}catch(error){container.textContent=`项目 Logo 读取失败：${error.message}`;}
}
