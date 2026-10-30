import {transformPopupButtonText} from './community-popup-model.js';
import {SOURCE_BUTTON_ID,SOURCE_BUTTON_TEXT_ID,sourceButtonTextElement,sourceButtonElement,constrainSourceButton,sourceButtonDefault} from './source-popup-button.js';
import {mountPopupButtonComposer} from './popup-button-composer.js';
import {mountSourceMaterialDialog} from './source-material-dialog.js';
import {mountSourceSeparation} from './source-reflow-panel.js';
import {SOURCE_COPYRIGHT_ID,sourceCopyrightElement} from './source-copyright.js';
import {sourceComposition,drawSourceComposition,sourceNeedsSeparation,sourceTargetPending} from './source-adaptation-model.js';
import {sourceProperties,sourceLayerItems} from './source-editor-view.js';
import {moveSourceLayer,sourceStackLayers} from './source-layer-order.js';
import {mountPopupButtonControls,readPopupButtonTextPosition,syncPopupButtonTextControls} from './popup-button-controls.js';
import {hitLayerCorner,layerCorners,resizeLayerFromCorner,scaleLayerAtPoint} from './source-canvas-transform.js';
const readFile=file=>new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(Error('无法读取图片'));r.readAsDataURL(file);});
export function mountSourceWorkspace({root,task,template,images,selectedId,api,project,updated,select,home,download,suite,importFolder,addSizes,removeSize}){
 let draft=structuredClone(sourceComposition(task,template?.id)),selected=null,dirty=false,busy=false,drag=null,base=null,stopped=false,frame=0,buttonPoll=0;
 const canvas=root.querySelector('#preview-canvas'),error=root.querySelector('#source-error'),stage=root.querySelector('.source-stage'),inspector=root.querySelector('#source-inspector'),readonly=task.status==='已完成'&&task.deliveredPackage;
 const previewTask=()=>({...task,parameters:{...task.parameters,sourceCompositionByTemplate:{...task.parameters.sourceCompositionByTemplate,...(draft?{[template.id]:draft}:{})}}});
 const button=()=>sourceButtonElement(draft?.popup,images);
 const buttonText=()=>sourceButtonTextElement(canvas.getContext('2d'),draft?.popup,images);
 const copyright=()=>draft?sourceCopyrightElement(canvas.getContext('2d'),previewTask(),template,project):null;
 const draw=()=>{
  if(stopped||!task.sourceAdaptation||!canvas.isConnected)return;
  const scale=Math.max(.05,Math.min((stage.clientWidth-48)/template.width,(stage.clientHeight-48)/template.height)),ratio=Math.min(3,scale*(window.devicePixelRatio||1));
  canvas.style.width=`${template.width*scale}px`;canvas.style.height=`${template.height*scale}px`;
  canvas.width=Math.max(1,Math.round(template.width*ratio));canvas.height=Math.max(1,Math.round(template.height*ratio));canvas.dataset.logicalWidth=template.width;canvas.dataset.logicalHeight=template.height;
  const ctx=canvas.getContext('2d');ctx.setTransform(canvas.width/template.width,0,0,canvas.height/template.height,0,0);
  drawSourceComposition(ctx,previewTask(),template,images,{project,selectedId:selected?.id,handleSize:8/scale});
 };
 const thumbs=()=>root.querySelectorAll('[data-source-thumb]').forEach(c=>{const t=task.templates.find(t=>t.id===c.dataset.sourceThumb),scale=Math.min(220/t.width,100/t.height,1);c.width=Math.ceil(t.width*scale);c.height=Math.ceil(t.height*scale);const full=document.createElement('canvas');full.width=t.width;full.height=t.height;drawSourceComposition(full.getContext('2d'),previewTask(),t,images,{project});c.getContext('2d').drawImage(full,0,0,c.width,c.height);full.width=full.height=1;});
 const post=async(action,fields={})=>{task=await api(`/api/tasks/${task.id}/source-adaptation`,{method:'POST',body:JSON.stringify({action,...fields,expectedUpdatedAt:task.updatedAt})});return task;};
 const update=async fields=>updated(task,fields);
 const change=()=>{dirty=true;root.querySelector('#source-save-state').textContent='有未保存的调整';draw();};
 const work=async(fn,propagate=false)=>{if(busy)return;busy=true;error.textContent='';const controls=[...root.querySelectorAll('button,input,select')],disabled=controls.map(c=>c.disabled);controls.forEach(c=>c.disabled=true);try{await fn();}catch(e){error.textContent=e.message;if(propagate)throw e;}finally{busy=false;controls.forEach((c,i)=>{if(c.isConnected)c.disabled=disabled[i];});}};
 const save=async()=>{if(!dirty)return;const id=selected?.id;await post('save',{templateId:template.id,composition:draft});draft=structuredClone(sourceComposition(task,template.id));dirty=false;pick(id);root.querySelector('#source-save-state').textContent='已保存';thumbs();};
 function setCopyright(values){
  const old=copyright();if(!old)return;
  draft.copyright={x:old.x,y:old.y,fontSize:old.fontSize,colorMode:old.colorMode,...values};
  draft.copyright.fontSize=Math.max(8,Math.min(200,Math.round(draft.copyright.fontSize)));draft.copyright.x=Math.max(0,Math.round(draft.copyright.x));draft.copyright.y=Math.max(0,Math.round(draft.copyright.y));
  selected=copyright();draft.copyright.x=selected.x;draft.copyright.y=selected.y;draft.copyright.fontSize=selected.fontSize;
 }
 function transform(value,original=selected){
  if(selected.id===SOURCE_BUTTON_TEXT_ID){transformPopupButtonText(draft.popup,value,original);selected=buttonText();syncPopupButtonTextControls(root,draft.popup,sourceButtonDefault,images.get(draft.popup.buttonBackingAsset));}
  else if(selected.id===SOURCE_BUTTON_ID){draft.popup.buttonLayout=constrainSourceButton(value);selected=button();}
  else if(selected.id===SOURCE_COPYRIGHT_ID)setCopyright({x:value.x,y:value.y,fontSize:original.fontSize*value.width/original.width});
  else Object.assign(selected,value);
 }
 function sync(){
  if(!selected)return;root.querySelector('#source-x').value=Math.round(selected.x);root.querySelector('#source-y').value=Math.round(selected.y);
  const size=root.querySelector('#source-copyright-size');if(size)size.value=selected.fontSize;
  if(selected.id===SOURCE_BUTTON_ID)syncButtonWidth();
  const n=Math.round(selected.width/base.width*100),slider=root.querySelector('#source-scale');slider.min=Math.min(10,n);slider.max=Math.max(250,n);slider.value=n;root.querySelector('#source-scale-label').textContent=n+'%';change();
 }
 function pick(id){
  selected=id===SOURCE_BUTTON_TEXT_ID?buttonText():id===SOURCE_BUTTON_ID?button():id===SOURCE_COPYRIGHT_ID?copyright():draft?.layers.find(l=>l.id===id);selected||=draft?.layers.at(-1)||null;
  select(selected?.id);base=selected?{...selected}:null;
  root.querySelectorAll('[data-source-layer]').forEach(b=>{b.classList.toggle('active',b.dataset.sourceLayer===selected?.id);b.setAttribute('aria-pressed',String(b.dataset.sourceLayer===selected?.id));});
  inspector.innerHTML=sourceProperties(task,template,draft,selected);bindInspector();draw();
 }
 function bindInspector(){
  if(!selected)return;
  for(const key of ['x','y'])root.querySelector('#source-'+key).oninput=e=>{if(readonly)return;const n=Number(e.target.value);if(!Number.isFinite(n))return;if(selected.id===SOURCE_COPYRIGHT_ID)setCopyright({[key]:n});else if([SOURCE_BUTTON_ID,SOURCE_BUTTON_TEXT_ID].includes(selected.id))transform({...selected,[key]:n});else selected[key]=n;change();};
  root.querySelector('#source-scale').oninput=e=>{if(readonly)return;const scale=Number(e.target.value)/100;transform({x:selected.x,y:selected.y,width:base.width*scale,height:base.height*scale},base);sync();};
  root.querySelector('#source-copyright-size')?.addEventListener('input',e=>{const size=Number(e.target.value);if(readonly||!Number.isFinite(size)||size<8||size>200)return;setCopyright({fontSize:size});sync();});
  root.querySelector('#source-copyright-color')?.addEventListener('change',e=>{if(readonly)return;setCopyright({colorMode:e.target.value});sync();});
  root.querySelector('#source-visible')?.addEventListener('change',e=>{if(readonly)return;if(selected.id===SOURCE_BUTTON_ID){draft.popup.buttonVisible=e.target.checked;root.querySelector('#source-popup-button').checked=e.target.checked;}else selected.visible=e.target.checked;change();});
  root.querySelector('#source-background')?.addEventListener('change',e=>{if(readonly)return;draft.background=e.target.value;change();});
  root.querySelector('#source-replace-text')?.addEventListener('click',()=>root.querySelector('#source-text-file').click());
  root.querySelector('#source-text-file')?.addEventListener('change',e=>void work(async()=>{const file=e.target.files?.[0];if(!file)return;if(file.size>20*1048576)throw Error('文案 PNG 不能超过 20 MB');const layerId=selected.id;await save();await post('replace-text',{layerId,dataUrl:await readFile(file)});await update({stage:'sizes'});}));
 }
 const layerList=root.querySelector('.source-layers'),stack=root.querySelector('#source-layer-stack');let draggingLayer=null;
 function reorder(id,index){
  if(readonly||busy||!moveSourceLayer(draft,id,index))return;
  stack.innerHTML=sourceLayerItems(task,draft,id);pick(id);change();thumbs();
 }
 layerList?.addEventListener('click',e=>{
  if(busy)return;const move=e.target.closest('[data-source-move]');
  if(move){const id=move.closest('[data-source-row]').dataset.sourceRow,index=sourceStackLayers(draft).reverse().findIndex(l=>l.id===id);reorder(id,index+Number(move.dataset.sourceMove));return;}
  const item=e.target.closest('[data-source-layer]');if(item)pick(item.dataset.sourceLayer);
 });
 const clearDrop=()=>stack?.querySelectorAll('.drop-before,.drop-after').forEach(row=>row.classList.remove('drop-before','drop-after'));
 stack?.addEventListener('dragstart',e=>{const row=e.target.closest('[data-source-row]');if(readonly||busy||!row){e.preventDefault();return;}draggingLayer=row.dataset.sourceRow;e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',draggingLayer);row.classList.add('dragging');});
 stack?.addEventListener('dragover',e=>{const row=e.target.closest('[data-source-row]');if(readonly||busy||!draggingLayer||!row)return;e.preventDefault();e.dataTransfer.dropEffect='move';clearDrop();const b=row.getBoundingClientRect();row.classList.add(e.clientY<b.y+b.height/2?'drop-before':'drop-after');});
 stack?.addEventListener('drop',e=>{const row=e.target.closest('[data-source-row]');if(!row||!draggingLayer)return;e.preventDefault();const displayed=sourceStackLayers(draft).reverse(),from=displayed.findIndex(l=>l.id===draggingLayer),to=displayed.findIndex(l=>l.id===row.dataset.sourceRow),b=row.getBoundingClientRect(),insertion=to+(e.clientY>=b.y+b.height/2?1:0);clearDrop();reorder(draggingLayer,insertion-(from<insertion?1:0));draggingLayer=null;});
 stack?.addEventListener('dragend',()=>{draggingLayer=null;clearDrop();stack.querySelectorAll('.dragging').forEach(row=>row.classList.remove('dragging'));});
 root.querySelector('#source-home').onclick=()=>void work(async()=>{await save();cleanup();home();});
 root.querySelectorAll('[data-source-target]').forEach(b=>b.onclick=()=>void work(async()=>{await save();await update({stage:'sizes',templateId:b.dataset.sourceTarget});}));
 root.querySelectorAll('[data-remove-target]').forEach(b=>b.onclick=()=>void work(async()=>{await save();await update({render:false});await removeSize(b.dataset.removeTarget);}));
 root.querySelector('#source-save')?.addEventListener('click',()=>void work(async()=>{await save();await update();}));
 for(const action of ['source-adapt','source-adapt-pending'])root.querySelector('#'+action)?.addEventListener('click',()=>void work(async()=>{await save();const ids=action==='source-adapt'?[template.id]:task.targetTemplateIds.filter(id=>sourceTargetPending(task,id));if(!ids.length)return;if(sourceNeedsSeparation(task))throw Error('请先点击“分离角色并补全背景”，完成后会自动排版当前尺寸');await post('adapt',{templateIds:ids,fit:'reflow'});await update();}));
 root.querySelector('#editor-download-single').onclick=()=>void work(async()=>{await save();await update({render:false});await download();});
 root.querySelector('#editor-download-materials')?.addEventListener('click',()=>void work(async()=>{await save();await update({render:false});await suite();}));
 root.querySelector('#source-upload')?.addEventListener('click',()=>root.querySelector('#asset-upload').click());
 root.querySelector('#asset-upload')?.addEventListener('change',e=>void work(async()=>{const file=e.target.files?.[0];if(!file)return;const limit=/\.ps[db]$/i.test(file.name)?500:20;if(file.size>limit*1048576)throw Error(`源文件不能超过 ${limit} MB`);await save();error.textContent='源文件读取中…';task=await api(`/api/tasks/${task.id}/source-file?name=${encodeURIComponent(file.name)}&expectedUpdatedAt=${encodeURIComponent(task.updatedAt)}`,{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:file});await update({stage:'sizes'});}));
 root.querySelector('#import-kv-pack')?.addEventListener('click',()=>void work(async()=>{await save();await update({render:false});await importFolder();}));
 root.querySelector('#editor-add-size')?.addEventListener('click',()=>void work(async()=>{await save();await update({render:false});root.querySelector('#add-size-dialog').showModal();}));
 root.querySelector('#add-size-form')?.addEventListener('submit',addSizes);
 for(const id of ['close-add-size','cancel-add-size'])root.querySelector('#'+id)?.addEventListener('click',()=>root.querySelector('#add-size-dialog').close());
 root.querySelector('#source-start-revision')?.addEventListener('click',()=>void work(async()=>{task=await api(`/api/tasks/${task.id}/start-revision`,{method:'POST',body:'{}'});await update({stage:'sizes'});}));
 const dialog=root.querySelector('#source-original-dialog');root.querySelector('#source-compare').onclick=()=>dialog.showModal();root.querySelector('#source-original-close').onclick=()=>dialog.close();
 mountSourceSeparation({root,task,images,post,work,updated:update,save,templateId:template.id});
 for(const [id,key,event] of [['source-popup-shape','shape','change'],['source-popup-button','buttonVisible','change'],['source-popup-label','buttonLabel','input'],['source-popup-color','buttonColor','input'],['source-popup-clip','clipCharacterBottom','change'],['source-popup-outline','outline','change'],['source-popup-outline-color','outlineColor','input'],['source-popup-outline-width','outlineWidth','input']])root.querySelector('#'+id)?.addEventListener(event,e=>{if(readonly)return;if(e.target.type==='number'&&(!e.target.validity.valid||!e.target.value))return;draft.popup[key]=e.target.type==='number'?Number(e.target.value):e.target.type==='checkbox'?e.target.checked:e.target.value;if(key==='shape')draft.popup.frame.height=e.target.value==='ellipse'?360:440;if(selected?.id===SOURCE_BUTTON_TEXT_ID)pick(SOURCE_BUTTON_TEXT_ID);change();});
 if(draft?.popup)mountPopupButtonControls({root,config:()=>draft.popup,work,assets:task.assets,layout:()=>sourceButtonDefault,selectText:()=>pick(SOURCE_BUTTON_TEXT_ID),prepareBacking:async name=>{if(!name||images.has(name))return;const asset=task.assets.find(a=>a.name===name);if(!asset)throw Error('按钮底板不存在');const image=await new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(Error('按钮底板加载失败'));i.src=asset.url;});images.set(name,image);},changed:()=>{const position=readPopupButtonTextPosition(root);if(position)draft.popup.buttonTextPosition=position;else delete draft.popup.buttonTextPosition;const value=root.querySelector('[name=buttonFontSize]').value;if(value==='')delete draft.popup.buttonFontSize;else draft.popup.buttonFontSize=Number(value);draft.popup.buttonFontId=root.querySelector('[name=buttonFontId]').value;draft.popup.buttonBackingAsset=root.querySelector('[name=buttonBackingAsset]').value;syncButtonWidth();if([SOURCE_BUTTON_ID,SOURCE_BUTTON_TEXT_ID].includes(selected?.id))pick(selected.id);change();},upload:async file=>{await save();await post('upload-button',{...file,templateId:template.id});await update();}});
 function syncButtonWidth(){const b=button();if(!b)return;root.querySelector('#source-button-width').value=Math.round(b.width);root.querySelector('#source-button-width-value').textContent=Math.round(b.width)+' px';}
 root.querySelector('#source-select-button')?.addEventListener('click',()=>{if(!draft.popup.buttonVisible){draft.popup.buttonVisible=true;root.querySelector('#source-popup-button').checked=true;change();}pick(SOURCE_BUTTON_ID);});
 root.querySelector('#source-button-width')?.addEventListener('input',e=>{if(readonly||busy)return;const b=sourceButtonElement({...draft.popup,buttonVisible:true},images),width=Number(e.target.value),height=b.height*width/b.width;draft.popup.buttonLayout=constrainSourceButton({x:b.x+(b.width-width)/2,y:b.y+b.height-height,width,height});syncButtonWidth();if(selected?.id===SOURCE_BUTTON_ID)pick(SOURCE_BUTTON_ID);change();});
 const disposeButtonComposer=mountPopupButtonComposer({root,task,templateId:template.id,config:()=>draft.popup,isBusy:()=>busy,disabled:readonly,generate:input=>work(async()=>{await save();task=await api(`/api/tasks/${task.id}/source-popup-button`,{method:'POST',body:JSON.stringify({action:input.resume?'resume':'generate',templateId:template.id,prompt:input.prompt,references:input.references,requestId:crypto.randomUUID(),expectedUpdatedAt:task.updatedAt})});await update();},true)});
 function pollButton(){buttonPoll=setTimeout(async()=>{if(stopped)return;try{const fresh=await api(`/api/tasks/${task.id}`);if(stopped)return;task=fresh;await update();}catch(e){if(!stopped){error.textContent=e.message;pollButton();}}},2500);}
 root.querySelector('#source-scene-upload')?.addEventListener('click',()=>root.querySelector('#source-scene-file').click());
 root.querySelector('#source-scene-file')?.addEventListener('change',e=>void work(async()=>{const file=e.target.files?.[0];if(!file)return;if(file.size>25*1048576)throw Error('场景图片不能超过 25 MB');await save();await post('scene-background',{name:file.name,dataUrl:await readFile(file)});await update();}));
 const disposeMaterials=mountSourceMaterialDialog({root,task,api,readFile,isBusy:()=>busy,add:input=>work(async()=>{await save();await post('add-material',input);select(task.sourceAdaptation.layers.at(-1).id);await update({stage:'sizes'});},true)});
 const sample=document.createElement('canvas');sample.width=sample.height=1;const sampleCtx=sample.getContext('2d',{willReadFrequently:true});
 const point=e=>{const r=canvas.getBoundingClientRect();return {x:(e.clientX-r.left)*template.width/r.width,y:(e.clientY-r.top)*template.height/r.height};},radius=()=>10*template.width/canvas.getBoundingClientRect().width;
 const contains=(l,p)=>l&&l.visible!==false&&p.x>=l.x&&p.y>=l.y&&p.x<=l.x+l.width&&p.y<=l.y+l.height;
 const hitLayer=p=>{const text=buttonText();if(contains(text,p))return text;const mark=copyright();if(contains(mark,p))return mark;const cta=button();if(contains(cta,p))return cta;return [...(draft?.layers||[])].reverse().find(l=>{if(!contains(l,p))return false;const img=images.get(l.assetName);if(!img)return false;sampleCtx.clearRect(0,0,1,1);sampleCtx.drawImage(img,(p.x-l.x)/l.width*(img.naturalWidth||img.width),(p.y-l.y)/l.height*(img.naturalHeight||img.height),1,1,0,0,1,1);return sampleCtx.getImageData(0,0,1,1).data[3]>16;});};
 canvas.onpointerdown=e=>{
  if(readonly||busy||e.button!==0||!selected)return;const p=point(e),hit=hitLayer(p);let corner=hitLayerCorner(selected,p,radius(),template);
  if([SOURCE_COPYRIGHT_ID,SOURCE_BUTTON_TEXT_ID].includes(hit?.id)&&selected.id!==hit.id)corner=null;
  if(!corner){if(!hit)return;if(hit.id!==selected.id)pick(hit.id);}
  e.preventDefault();drag={point:p,layer:{...selected},corner:corner?.name};canvas.setPointerCapture(e.pointerId);
 };
 canvas.onpointermove=e=>{if(!selected)return;const p=point(e);if(!drag){const corner=hitLayerCorner(selected,p,radius(),template);canvas.style.cursor=corner?(corner.name==='nw'||corner.name==='se'?'nwse-resize':'nesw-resize'):hitLayer(p)?'move':'default';return;}if(busy)return;
  if(drag.corner){const origin=layerCorners(drag.layer).find(c=>c.name===drag.corner);transform(resizeLayerFromCorner(drag.layer,drag.corner,{x:origin.x+p.x-drag.point.x,y:origin.y+p.y-drag.point.y}),drag.layer);}else transform({...drag.layer,x:drag.layer.x+p.x-drag.point.x,y:drag.layer.y+p.y-drag.point.y},drag.layer);sync();
 };
 canvas.onpointerup=canvas.onpointercancel=canvas.onlostpointercapture=()=>{drag=null;};
 canvas.addEventListener('wheel',e=>{if(readonly||busy||drag)return;const p=point(e),hit=hitLayer(p);if(!hit)return;e.preventDefault();if(hit.id!==selected?.id)pick(hit.id);const delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?canvas.clientHeight:1);transform(scaleLayerAtPoint(selected,Math.exp(-Math.max(-100,Math.min(100,delta))*.0015),p));sync();},{passive:false});
 const observer=new ResizeObserver(()=>{if(!canvas.isConnected){cleanup();return;}cancelAnimationFrame(frame);frame=requestAnimationFrame(draw);});observer.observe(stage);
 function cleanup(){stopped=true;observer.disconnect();cancelAnimationFrame(frame);disposeMaterials();disposeButtonComposer();clearTimeout(buttonPoll);}
 pick(selectedId);thumbs();if(task.communityGeneration?.phase==='popup-button'&&task.communityGeneration.status==='running'){busy=true;root.querySelectorAll('button,input,select,textarea').forEach(c=>c.disabled=true);pollButton();}return cleanup;
}
