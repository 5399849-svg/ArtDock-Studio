import {isAdImageUrl} from './ad-image-url.js?v=20261022-draft-sync';

export const AD_AI_REFERENCE_LIMIT=3;
export function validateAdAiReference(file){
  if(!file||!file.size||file.size>10*1024*1024)return '参考图须为 10MB 以内的 JPG、PNG 或 WebP';
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)&&!(file.type===''&&/\.(?:jpe?g|png|webp)$/i.test(file.name||'')))return '参考图仅支持 JPG、PNG 或 WebP';
  return '';
}
export const adAiReferenceIds=references=>(references||[]).map(ref=>ref.id);
export const adAiSameReferences=(a=[],b=[])=>JSON.stringify(a)===JSON.stringify(b);
export function adAiClipboardImages(clipboard){
  const fromItems=Array.from(clipboard?.items||[]).filter(entry=>entry.kind==='file'&&entry.type.startsWith('image/')).map(entry=>entry.getAsFile()).filter(Boolean);
  return fromItems.length?fromItems:Array.from(clipboard?.files||[]).filter(file=>file.type?.startsWith('image/')||/\.(?:png|jpe?g|webp)$/i.test(file.name||''));
}

export function mountAdAiReferences({panel,batch,item,endpoint,api,isActive,onChange,onError}){
  let destroyed=false,locked=false,busy=false;
  let references=(item.aiEditReferenceIds||[]).map(id=>(batch.aiEditReferenceAssets||[]).find(ref=>ref.id===id)).filter(Boolean);
  const composer=panel.querySelector('.ad-ai-composer');
  const section=document.createElement('section');section.className='ad-ai-references';section.setAttribute('aria-label','修改参考图');
  section.innerHTML=`<div class="ad-ai-reference-heading">${composer?'<div class="ad-ai-reference-list"></div>':'<b>修改参考图 <small>可选</small></b>'}<button type="button" class="ad-ai-reference-add" aria-label="添加参考图" title="添加参考图">${composer?'＋':'＋ 添加参考图'}</button></div><input type="file" accept="image/jpeg,image/png,image/webp" multiple hidden>${composer?'':'<div class="ad-ai-reference-list"></div><div class="ad-ai-reference-drop" tabindex="0" role="button" aria-label="选择或粘贴修改参考图">上传 / 拖入图片，或按 Ctrl+V 粘贴</div>'}<p class="ad-ai-reference-progress" role="status" aria-live="polite" hidden></p><dialog class="ad-ai-reference-preview"><div><strong></strong><button type="button" aria-label="关闭参考图预览">×</button></div><img alt="修改参考图大图"></dialog>`;
  if(composer)composer.querySelector('.ad-ai-composer-footer').before(section);else panel.querySelector('.ad-ai-suggestions').before(section);
  const choose=section.querySelector('.ad-ai-reference-add'),files=section.querySelector('input'),list=section.querySelector('.ad-ai-reference-list'),zone=composer||section.querySelector('.ad-ai-reference-drop'),progress=section.querySelector('.ad-ai-reference-progress'),dialog=section.querySelector('dialog');
  const live=()=>!destroyed&&isActive();
  const update=result=>{
    references=result.references;
    item.aiEditReferenceIds=adAiReferenceIds(references);
    const assets=(batch.aiEditReferenceAssets||=[]);
    for(const ref of references)if(!assets.some(a=>a.id===ref.id))assets.push(ref);
  };
  const controls=()=>{
    const disabled=locked||busy;
    choose.disabled=disabled||references.length>=AD_AI_REFERENCE_LIMIT;files.disabled=choose.disabled;
    zone.setAttribute('aria-disabled',String(disabled));
    if(!composer){zone.tabIndex=choose.disabled?-1:0;zone.hidden=references.length>=AD_AI_REFERENCE_LIMIT;}
    list.querySelectorAll('.ad-ai-reference-remove').forEach(button=>{button.disabled=disabled});
    if(composer){
      for(const [name,enabled]of [['has-references',references.length>0],['multiple-references',references.length>1]])composer.classList[enabled?'add':'remove'](name);
    }
  };
  const render=()=>{
    if(destroyed)return;list.replaceChildren();
    references.forEach((ref,index)=>{
      if(!isAdImageUrl(ref.url))return;
      const card=document.createElement('div');card.className='ad-ai-reference-card';
      const preview=document.createElement('button');preview.type='button';preview.className='ad-ai-reference-thumb';preview.title=`查看参考图${index+1}：${ref.name}`;
      const image=document.createElement('img');image.src=ref.url;image.alt=`参考图${index+1}`;
      const caption=document.createElement('span');caption.textContent=`参考图${index+1}`;preview.append(image,caption);
      preview.onclick=()=>{dialog.querySelector('img').src=ref.url;dialog.querySelector('strong').textContent=`参考图${index+1} · ${ref.name}`;dialog.showModal()};
      const remove=document.createElement('button');remove.type='button';remove.className='ad-ai-reference-remove';remove.textContent='×';remove.title=`移除参考图${index+1}`;remove.setAttribute('aria-label',remove.title);remove.onclick=()=>removeReference(ref.id);
      card.append(preview,remove);list.append(card);
    });controls();
  };
  const setBusy=value=>{busy=value;if(!destroyed){progress.hidden=!value;progress.textContent=value?'正在上传…':'';controls();onChange();}};
  const add=async input=>{
    if(locked||busy||destroyed)return;
    const incoming=Array.from(input||[]);if(!incoming.length)return;
    if(incoming.length+references.length>AD_AI_REFERENCE_LIMIT){onError('最多添加 3 张修改参考图，请先移除不需要的图片');return;}
    const invalid=incoming.map(validateAdAiReference).find(Boolean);if(invalid){onError(invalid);return;}
    onError('');setBusy(true);
    try{for(const file of incoming){
      const result=await api(`${endpoint}/references?name=${encodeURIComponent(file.name||'粘贴参考图.png')}`,{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:file});update(result);
      if(!live())break;render();
    }}catch(error){
      // Recover an upload whose reply was lost; the server deduplicates image bytes.
      try{update(await api(`${endpoint}/references`));}catch{}
      if(live()){render();onError(error.message);}
    }finally{setBusy(false);}
  };
  const removeReference=async id=>{
    if(locked||busy||destroyed)return;onError('');setBusy(true);
    try{update(await api(`${endpoint}/references/${encodeURIComponent(id)}`,{method:'DELETE'}));if(live())render();}
    catch(error){if(live())onError(error.message);}finally{setBusy(false);}
  };
  choose.onclick=()=>files.click();files.onchange=()=>{const selected=Array.from(files.files||[]);files.value='';void add(selected);};
  if(!composer){zone.onclick=()=>{if(!locked&&!busy)files.click();};zone.onkeydown=event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();zone.click();}};}
  zone.ondragover=event=>{event.preventDefault();if(!locked&&!busy)zone.classList.add('dragging');};zone.ondragleave=()=>zone.classList.remove('dragging');zone.ondrop=event=>{event.preventDefault();zone.classList.remove('dragging');void add(event.dataTransfer?.files);};
  const paste=event=>{const images=adAiClipboardImages(event.clipboardData);if(images.length){event.preventDefault();void add(images);}};
  // Capture paste from the instruction textarea itself as well as the upload
  // area. Ordinary text paste is left to the native textarea unchanged.
  panel.addEventListener('paste',paste,true);
  dialog.querySelector('button').onclick=()=>dialog.close();dialog.onclick=event=>{if(event.target===dialog)dialog.close();};
  render();
  return {get busy(){return busy},get ids(){return adAiReferenceIds(references)},setLocked(value){locked=value;controls();},dispose(){destroyed=true;panel.removeEventListener('paste',paste,true);zone.ondragover=null;zone.ondragleave=null;zone.ondrop=null;if(dialog.open)dialog.close();section.remove();}};
}
