from pathlib import Path
root=Path(__file__).resolve().parents[1]
def edit(name,old,new):
 p=root/name;s=p.read_text(encoding='utf-8');assert old in s,(name,old[:100]);p.write_text(s.replace(old,new),encoding='utf-8')
edit('public/source-adaptation-ui.js',"const esc=", "import {popupButtonControls,mountPopupButtonControls} from './popup-button-controls.js';\nimport {hitLayerCorner,resizeLayerFromCorner,scaleLayerAtPoint} from './source-canvas-transform.js';\nconst esc=")
edit('public/source-adaptation-ui.js','沿用原稿素材；拖动画面可移动选中组，缩放始终保持比例。','点击元素选中，拖动四角或滚动鼠标滚轮等比缩放；拖动内部移动位置。')
edit('public/source-adaptation-ui.js','按目标比例重排：背景等比铺满，人物与文案分别布局。','按目标比例重排，保持完整场景与人物的空间比例。')
edit('public/source-adaptation-ui.js',' ${ready&&!master?`<p', ''' ${ready&&s.reflow?`<button id="source-scene-upload" class="button secondary full-button" ${readonly?'disabled':''}>上传完整场景背景</button><input id="source-scene-file" type="file" accept="image/png,image/jpeg,image/webp" hidden><p class="source-help">使用去除人物、按目标比例补全的场景。保留原人物、文案和历史方案。</p>`:''}
 ${ready&&!master?`<p''')
edit('public/source-adaptation-ui.js','</label></fieldset>`:\'\'}\n ${selected?', '''</label><label class="source-check"><input id="source-popup-clip" type="checkbox" ${composition.popup.clipCharacterBottom?'checked':''}>人物底部收进背景轮廓</label>${popupButtonControls(composition.popup,task.assets)}</fieldset>`:''}
 ${selected?''')
edit('public/source-adaptation-ui.js','images,{selectedId:selected?.id});','images,{selectedId:selected?.id,handleSize:8*template.width/(canvas.getBoundingClientRect().width||template.width)});')
edit('public/source-adaptation-ui.js',"['source-popup-color','buttonColor','input']", "['source-popup-color','buttonColor','input'],['source-popup-clip','clipCharacterBottom','change']")
edit('public/source-adaptation-ui.js',' if(!selected)return;', ''' if(draft?.popup)mountPopupButtonControls({root,config:()=>draft.popup,work,changed:()=>{draft.popup.buttonFontId=root.querySelector('[name=buttonFontId]').value;draft.popup.buttonBackingAsset=root.querySelector('[name=buttonBackingAsset]').value;change();},upload:async file=>{await save();await post('upload-button',{...file,templateId:template.id});await update();}});
 root.querySelector('#source-scene-upload')?.addEventListener('click',()=>root.querySelector('#source-scene-file').click());
 root.querySelector('#source-scene-file')?.addEventListener('change',e=>void work(async()=>{const file=e.target.files?.[0];if(!file)return;if(file.size>25*1048576)throw Error('场景图片不能超过 25 MB');await save();const dataUrl=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(Error('无法读取场景图片'));r.readAsDataURL(file);});await post('scene-background',{name:file.name,dataUrl});await update();}));
 if(!selected)return;''')
p=root/'public/source-adaptation-ui.js';s=p.read_text(encoding='utf-8');start=s.index(' let drag;');s=s[:start]+'''
 let drag;canvas.style.touchAction='none';
 const point=e=>{const r=canvas.getBoundingClientRect();return {x:(e.clientX-r.left)*canvas.width/r.width,y:(e.clientY-r.top)*canvas.height/r.height};};
 const radius=()=>10*canvas.width/canvas.getBoundingClientRect().width;
 const sync=()=>{root.querySelector('#source-x').value=Math.round(selected.x);root.querySelector('#source-y').value=Math.round(selected.y);const n=Math.round(selected.width/base.width*100),slider=root.querySelector('#source-scale');slider.min=Math.min(10,n);slider.max=Math.max(250,n);slider.value=n;root.querySelector('#source-scale-label').textContent=n+'%';change();};
 const sample=document.createElement('canvas');sample.width=sample.height=1;const sampleCtx=sample.getContext('2d',{willReadFrequently:true});
 const hitLayer=p=>[...draft.layers].reverse().find(l=>{if(l.visible===false||p.x<l.x||p.y<l.y||p.x>l.x+l.width||p.y>l.y+l.height)return false;const img=images.get(l.assetName);if(!img)return false;sampleCtx.clearRect(0,0,1,1);sampleCtx.drawImage(img,(p.x-l.x)/l.width*(img.naturalWidth||img.width),(p.y-l.y)/l.height*(img.naturalHeight||img.height),1,1,0,0,1,1);return sampleCtx.getImageData(0,0,1,1).data[3]>16;});
 canvas.onpointerdown=e=>{if(busy||e.button!==0)return;const p=point(e),corner=hitLayerCorner(selected,p,radius());
  if(!corner){const hit=hitLayer(p);if(!hit)return;if(hit.id!==selected.id){void work(async()=>{await save();select(hit.id);await update();});return;}}
  e.preventDefault();drag={point:p,layer:{...selected},corner:corner?.name};canvas.setPointerCapture(e.pointerId);
 };
 canvas.onpointermove=e=>{const p=point(e);if(!drag){const corner=hitLayerCorner(selected,p,radius());canvas.style.cursor=corner?(corner.name==='nw'||corner.name==='se'?'nwse-resize':'nesw-resize'):hitLayer(p)?'move':'default';return;}
  if(busy)return;if(drag.corner)Object.assign(selected,resizeLayerFromCorner(drag.layer,drag.corner,p));else Object.assign(selected,{x:drag.layer.x+p.x-drag.point.x,y:drag.layer.y+p.y-drag.point.y});sync();
 };
 canvas.onpointerup=canvas.onpointercancel=canvas.onlostpointercapture=()=>{drag=null;};
 canvas.addEventListener('wheel',e=>{if(busy||drag||selected.visible===false)return;e.preventDefault();const p=point(e),delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?canvas.clientHeight:1);Object.assign(selected,scaleLayerAtPoint(selected,Math.exp(-Math.max(-100,Math.min(100,delta))*.0015),p));sync();},{passive:false});
}
''';p.write_text(s,encoding='utf-8')
edit('server.mjs','invalidate:invalidateTaskArtifacts,reconcile:reconcileCommunityTargetExtension});','invalidate:invalidateTaskArtifacts,reconcile:reconcileCommunityTargetExtension,readFonts:()=>readCompanyFontLibrary({root})});')
edit('server.mjs','jobs:communityGenerationJobs,invalidate:invalidateTaskArtifacts});','jobs:communityGenerationJobs,invalidate:invalidateTaskArtifacts,readFonts:()=>readCompanyFontLibrary({root})});')
