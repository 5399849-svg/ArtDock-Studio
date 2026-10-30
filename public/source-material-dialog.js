import {projectMaterialCategories,projectMaterialLabel} from './project-material-model.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const image=a=>/^image\/(png|jpeg|webp)$/.test(a.mime||'');
export function sourceMaterialDialog(project){
 return `<dialog id="source-material-dialog" aria-labelledby="source-material-heading"><form id="source-material-form"><div class="source-material-heading"><h3 id="source-material-heading">新增使用素材</h3><button type="button" id="source-material-close" aria-label="关闭">×</button></div>
 <button type="button" id="source-material-upload" class="source-material-upload"><strong>＋ 上传图片</strong><span>也可在这里 Ctrl + V 粘贴图片</span><small>PNG、JPG、WebP · 最大 25 MB</small></button><input id="source-material-file" type="file" accept="image/png,image/jpeg,image/webp" hidden>
 <section class="source-project-library" aria-labelledby="source-project-title"><div class="source-project-heading"><b id="source-project-title">项目素材${project?.name?' · '+esc(project.name):''}</b><label><input id="source-material-favorites" type="checkbox">仅常用</label></div><div class="source-material-filters"><input id="source-material-search" type="search" placeholder="搜索项目素材名称、标签" aria-label="搜索项目素材"><select id="source-material-category" aria-label="筛选项目素材分类">${projectMaterialCategories.filter(([id])=>id!=='font').map(([id,label])=>`<option value="${id}">${label}</option>`).join('')}</select></div><div id="source-material-grid" class="source-material-grid" aria-label="当前项目素材"></div><button type="button" id="source-material-retry" class="button ghost" hidden>重新加载项目素材</button></section>
 <div id="source-material-selection" class="source-material-selection" hidden><span data-source-material-name></span><button type="button" id="source-material-clear" aria-label="取消选择">×</button></div><p id="source-material-error" class="source-error" role="alert"></p><div class="source-dialog-actions"><button id="source-material-cancel" type="button" class="button ghost">取消</button><button id="source-material-submit" type="submit" class="button primary" disabled>添加到画布</button></div></form></dialog>`;
}
export function mountSourceMaterialDialog({root,task,api,add,readFile,isBusy=()=>false}){
 const dialog=root.querySelector('#source-material-dialog'),form=dialog.querySelector('form'),fileInput=dialog.querySelector('#source-material-file'),grid=dialog.querySelector('#source-material-grid'),error=dialog.querySelector('#source-material-error'),submit=dialog.querySelector('#source-material-submit'),preview=dialog.querySelector('#source-material-selection'),retry=dialog.querySelector('#source-material-retry');
 let file=null,asset=null,url='',assets=[],submitting=false,loading=0,disposed=false;
 const release=()=>{if(url)URL.revokeObjectURL(url);url='';};
 const draw=()=>{const query=dialog.querySelector('#source-material-search').value.trim().toLowerCase(),category=dialog.querySelector('#source-material-category').value,favorites=dialog.querySelector('#source-material-favorites').checked;
  const shown=assets.filter(a=>(!favorites||a.favorite)&&(category==='all'||a.category===category)&&`${projectMaterialLabel(a)} ${(a.tags||[]).join(' ')}`.toLowerCase().includes(query));
  grid.innerHTML=shown.map(a=>`<button type="button" class="source-project-material ${asset?.id===a.id?'selected':''}" data-project-material="${esc(a.id)}" aria-pressed="${asset?.id===a.id}" title="${esc(projectMaterialLabel(a))}" ${submitting?'disabled':''}><span class="source-material-art"><img src="${esc(a.url)}" alt="" loading="lazy">${a.favorite?'<i aria-label="常用素材">★</i>':''}</span><b>${esc(projectMaterialLabel(a))}</b><small>${a.width&&a.height?`${a.width} × ${a.height}`:'图片'}</small></button>`).join('')||`<p class="source-material-empty">${!task.projectId?'请先为任务关联项目':query||favorites||category!=='all'?'没有符合筛选条件的项目素材':'项目中还没有可用图片，可先上传或粘贴图片'}</p>`;
 };
 const selection=()=>{preview.hidden=!file&&!asset;preview.querySelector('img')?.remove();preview.querySelector('.wb-file-missing')?.remove();const source=file?url:asset?.url;
  if(source){const img=new Image();img.alt='已选素材预览';img.src=source;preview.prepend(img);}
  preview.querySelector('[data-source-material-name]').textContent=file?file.name:asset?projectMaterialLabel(asset):'';submit.disabled=submitting||!file&&!asset;draw();};
 const clear=()=>{release();file=null;asset=null;fileInput.value='';selection();};
 const choose=fileValue=>{if(submitting||isBusy())return;if(!/^image\/(png|jpeg|webp)$/.test(fileValue.type)){error.textContent='请使用 PNG、JPG 或 WebP 图片';return;}if(fileValue.size>25*1048576){error.textContent='素材不能超过 25 MB';return;}release();file=fileValue;asset=null;url=URL.createObjectURL(file);error.textContent='';selection();};
 async function load(){const token=++loading;assets=[];grid.innerHTML='<p class="source-material-empty" role="status">正在加载项目素材…</p>';retry.hidden=true;if(!task.projectId){draw();return;}
  try{const library=await api(`/api/projects/${encodeURIComponent(task.projectId)}/design-library`);if(disposed||!dialog.open||token!==loading)return;assets=library.assets.filter(image).sort((a,b)=>Number(b.favorite)-Number(a.favorite)||String(b.updatedAt||b.createdAt||'').localeCompare(String(a.updatedAt||a.createdAt||'')));draw();}
  catch(e){if(disposed||token!==loading)return;grid.innerHTML='<p class="source-material-empty">项目素材暂未加载</p>';error.textContent=e.message;retry.hidden=false;}
 }
 root.querySelector('#source-add-material')?.addEventListener('click',()=>{if(submitting||isBusy())return;form.reset();clear();error.textContent='';dialog.showModal();void load();});
 dialog.querySelector('#source-material-upload').onclick=()=>fileInput.click();fileInput.onchange=()=>{const picked=fileInput.files?.[0];if(picked)choose(picked);};
 dialog.addEventListener('paste',e=>{if(!dialog.open)return;const pasted=[...(e.clipboardData?.items||[])].find(i=>i.kind==='file'&&i.type.startsWith('image/'))?.getAsFile()||[...(e.clipboardData?.files||[])].find(f=>f.type.startsWith('image/'));if(!pasted)return;e.preventDefault();e.stopPropagation();choose(new File([pasted],`粘贴素材-${Date.now()}.${pasted.type==='image/jpeg'?'jpg':pasted.type.split('/')[1]}`,{type:pasted.type}));});
 grid.onclick=e=>{const button=e.target.closest('[data-project-material]');if(!button||submitting||isBusy())return;const picked=assets.find(a=>a.id===button.dataset.projectMaterial);if(!picked)return;release();file=null;fileInput.value='';asset=picked;error.textContent='';selection();};
 for(const id of ['source-material-search','source-material-category','source-material-favorites'])dialog.querySelector('#'+id).addEventListener(id==='source-material-search'?'input':'change',draw);
 retry.onclick=()=>{error.textContent='';void load();};dialog.querySelector('#source-material-clear').onclick=()=>{if(!submitting)clear();};
 for(const id of ['source-material-close','source-material-cancel'])dialog.querySelector('#'+id).onclick=()=>{if(!submitting)dialog.close();};
 dialog.addEventListener('cancel',e=>{if(submitting)e.preventDefault();});dialog.addEventListener('close',()=>{loading++;clear();});
 form.onsubmit=async e=>{e.preventDefault();if(submitting||isBusy()||!file&&!asset)return;submitting=true;const controls=[...dialog.querySelectorAll('button,input,select')];controls.forEach(c=>c.disabled=true);error.textContent='';
  try{const input=file?{name:file.name,dataUrl:await readFile(file)}:{projectAssetId:asset.id};await add(input);dialog.close();}
  catch(e){error.textContent=e.message;}finally{submitting=false;controls.forEach(c=>c.disabled=false);submit.disabled=!file&&!asset;}
 };
 return ()=>{disposed=true;loading++;release();};
}
