import {companyFonts} from './project-fonts.js';
import {openMaterialFontPicker} from './community-material-fonts.js';
import {popupButtonBaseFontSize,popupButtonTextCenter,popupLayerBox} from './community-popup-model.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function textPositionControls(config,asset,layout){
 const p=popupButtonTextCenter(config,layout,asset);
 return `<div class="popup-button-text-position"><button type="button" class="button secondary full-button" data-popup-text-select>选中按钮文字</button><small>独立拖动文字，对齐底板正文区域</small><div class="popup-text-position-fields">${[['x','文字中心 X',500],['y','文字中心 Y',650]].map(([k,label,max])=>`<label>${label}<input type="number" data-popup-text-axis="${k}" min="0" max="${max}" step="0.1" aria-label="${label}" value="${Math.round(p[k])}"></label>`).join('')}</div><input type="hidden" name="buttonTextPosition" value="${config.buttonTextPosition?esc(JSON.stringify(config.buttonTextPosition)):''}"><button type="button" class="button ghost full-button" data-popup-text-center>恢复随底板居中</button></div>`;
}
export function readPopupButtonTextPosition(root){const value=root.querySelector('[name=buttonTextPosition]')?.value;return value?JSON.parse(value):undefined;}
export function syncPopupButtonTextControls(root,config,layout,image){
 const position=root.querySelector('[name=buttonTextPosition]');if(!position)return;
 position.value=config.buttonTextPosition?JSON.stringify(config.buttonTextPosition):'';
 const p=popupButtonTextCenter(config,layout,image);
 root.querySelectorAll('[data-popup-text-axis]').forEach(input=>{input.value=Math.round(p[input.dataset.popupTextAxis]*10)/10;});
 const manual=Number.isFinite(config.buttonFontSize),size=manual?config.buttonFontSize:Math.max(8,Math.round(popupButtonBaseFontSize(config,layout,image)));
 root.querySelector('[name=buttonFontSize]').value=manual?size:'';
 for(const selector of ['[data-popup-font-size-range]','[data-popup-font-size-number]'])root.querySelector(selector).value=size;
 root.querySelector('[data-popup-font-size-value]').textContent=manual?size+' px':'自动';
}
function fontSizeControls(config,asset,layout){
 const manual=Number.isFinite(config.buttonFontSize),size=manual?config.buttonFontSize:Math.max(8,Math.round(popupButtonBaseFontSize(config,layout,asset)));
 return `<div class="popup-button-font-size"><label for="popup-button-font-size-range">文字大小 <output data-popup-font-size-value>${manual?size+' px':'自动'}</output></label><div class="popup-button-font-size-inputs"><input id="popup-button-font-size-range" data-popup-font-size-range type="range" min="8" max="120" step="1" value="${size}" aria-label="按钮文字大小滑杆"><div><input data-popup-font-size-number type="number" min="8" max="120" step="0.1" value="${size}" aria-label="按钮文字大小"><span>px</span></div></div><input type="hidden" name="buttonFontSize" value="${manual?size:''}"><button type="button" class="button ghost full-button" data-popup-font-size-reset>恢复自动字号</button></div>`;
}
export function popupButtonControls(config,assets=[],layout=popupLayerBox('button')){
 const font=companyFonts().find(f=>f.id===config.buttonFontId),asset=assets.find(a=>a.name===config.buttonBackingAsset);
 const existing=assets.filter(a=>(a.role==='button'||a.name===config.buttonBackingAsset)&&a.mime==='image/png'&&!a.libraryDeletedAt);
 return `<div class="popup-button-custom"><label>按钮底板 <small>沿用原图比例</small></label><button type="button" class="button secondary full-button" data-popup-upload>＋ 上传按钮底板</button>${existing.length?`<label>已有底板<select data-popup-existing><option value="">默认纯色按钮</option>${existing.map(a=>`<option value="${esc(a.name)}" ${a.name===config.buttonBackingAsset?'selected':''}>${esc(a.label||a.name)}</option>`).join('')}</select></label>`:''}<input data-popup-file type="file" accept="image/png" hidden><small data-popup-backing-name>${esc(asset?.label||asset?.name||'默认纯色按钮 · 支持 PNG 底板')}</small><button type="button" class="button ghost full-button" data-popup-remove ${asset?'':'hidden'}>恢复纯色底板</button><label>按钮版权字</label><button type="button" class="button secondary full-button" data-popup-font>${esc(font?.name||'选择版权字体')}</button>${fontSizeControls(config,asset,layout)}${textPositionControls(config,asset,layout)}<input type="hidden" name="buttonFontId" value="${esc(config.buttonFontId||'')}"><input type="hidden" name="buttonBackingAsset" value="${esc(config.buttonBackingAsset||'')}"></div>`;
}
export function mountPopupButtonControls({root,config,changed,upload,work,prepareBacking,layout=()=>popupLayerBox('button'),assets=[],commitFontSize,selectText}){
 const file=root.querySelector('[data-popup-file]');if(!file)return;
 const range=root.querySelector('[data-popup-font-size-range]'),number=root.querySelector('[data-popup-font-size-number]'),sizeField=root.querySelector('[name=buttonFontSize]'),output=root.querySelector('[data-popup-font-size-value]');
 const currentSize=()=>{const c=config();return Math.max(8,Math.round(popupButtonBaseFontSize(c,layout(),assets.find(a=>a.name===c.buttonBackingAsset))));};
 const textInputs=[...root.querySelectorAll('[data-popup-text-axis]')],positionField=root.querySelector('[name=buttonTextPosition]');
 const position=()=>{if(textInputs.some(i=>!i.value||!i.validity.valid))return false;positionField.value=JSON.stringify(Object.fromEntries(textInputs.map(i=>[i.dataset.popupTextAxis,Number(i.value)])));changed();return true;};
 for(const input of textInputs){input.addEventListener('input',position);input.addEventListener('change',()=>{if(position())void commitFontSize?.();});}
 root.querySelector('[data-popup-text-select]').onclick=()=>selectText?.();
 root.querySelector('[data-popup-text-center]').onclick=()=>{positionField.value='';changed();const c=config();syncPopupButtonTextControls(root,c,layout(),assets.find(a=>a.name===c.buttonBackingAsset));void commitFontSize?.();};
 const resize=input=>{const size=Number(input.value);if(!input.value||!Number.isFinite(size)||size<8||size>120)return false;range.value=size;number.value=size;sizeField.value=size;output.textContent=size+' px';changed();return true;};
 for(const input of [range,number]){input.addEventListener('input',()=>resize(input));input.addEventListener('change',()=>{if(!resize(input)){range.value=number.value=currentSize();return;}void commitFontSize?.();});}
 root.querySelector('[data-popup-font-size-reset]').onclick=()=>{sizeField.value='';output.textContent='自动';changed();range.value=number.value=currentSize();void commitFontSize?.();};
 root.querySelector('[data-popup-upload]').onclick=()=>file.click();
 root.querySelector('[data-popup-existing]')?.addEventListener('change',e=>void work(async()=>{const old=config().buttonBackingAsset;try{await prepareBacking?.(e.target.value);root.querySelector('[name=buttonBackingAsset]').value=e.target.value;root.querySelector('[data-popup-backing-name]').textContent=e.target.selectedOptions[0].textContent;root.querySelector('[data-popup-remove]').hidden=!e.target.value;changed();}catch(error){e.target.value=old;throw error;}}));
 root.querySelector('[data-popup-font]').onclick=()=>void work(async()=>{
  const c=config(),picked=await openMaterialFontPicker({fonts:companyFonts(),selectedId:c.buttonFontId,text:c.buttonLabel,kind:'button'});if(!picked)return;
  root.querySelector('[name=buttonFontId]').value=picked.id||'';root.querySelector('[data-popup-font]').textContent=companyFonts().find(f=>f.id===picked.id)?.name||'选择版权字体';changed();
 });
 root.querySelector('[data-popup-remove]').onclick=()=>{root.querySelector('[name=buttonBackingAsset]').value='';const existing=root.querySelector('[data-popup-existing]');if(existing)existing.value='';root.querySelector('[data-popup-backing-name]').textContent='默认纯色按钮 · 支持 PNG 底板';root.querySelector('[data-popup-remove]').hidden=true;changed();};
 file.onchange=()=>void work(async()=>{try{const image=file.files?.[0];if(!image)return;if(image.size>25*1048576)throw Error('按钮底板不能超过 25 MB');if(image.type!=='image/png')throw Error('请选择 PNG 按钮底板');const dataUrl=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(Error('读取图片失败'));r.readAsDataURL(image);});await upload({name:image.name,dataUrl});}finally{file.value='';}});
}
