import {mountPopupButtonTextEditor} from './popup-button-text-editor.js';
import {popupFontFamily} from './project-fonts.js';
import {popupConfig,popupDefaults,popupLayerBox,COMMUNITY_POPUP_ID} from './community-popup-model.js';
import {renderPopupButtonComposer,mountPopupButtonComposer} from './popup-button-composer.js';
import {popupButtonControls,mountPopupButtonControls,readPopupButtonTextPosition,syncPopupButtonTextControls} from './popup-button-controls.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const kinds=[['background','背景／透明底板'],['character','角色 1'],['character2','角色 2'],['foreground','前景装饰'],['title','主标'],['subtitle','副标'],['logo','Logo'],['button','按钮素材']];
export function popupInitialBindings(task,resolveAsset){
 const p=task.parameters||{},id=COMMUNITY_POPUP_ID,source=p.communityPopupByTemplate?.[id]?id:task.masterTemplateId;
 const b={...p.assetByTemplate?.[source]};
 const hasPlacedCharacters=p.communityObjectLayersByTemplate?.[source]?.some(l=>l.appearance.kind==='character');
 for(const [kind]of kinds)if(!Object.hasOwn(b,kind)){const roles=kind==='character'?['character','core-character']:kind==='background'?['background','background-landscape','background-portrait','clean-kv']:[kind];b[kind]=hasPlacedCharacters&&['character','character2'].includes(kind)?null:resolveAsset?resolveAsset(task,source,kind)||null:task.assets.find(a=>roles.includes(a.role)&&a.mime?.startsWith('image/'))?.name||null;}
 return b;
}
export function renderPopupPanel(task,template,{disabled=false,draft,preview='checker'}={}){
 const active=popupConfig(task,template),c=draft?.config||active||popupDefaults(),history=[...(task.communityPopupVersions||[])].reverse();
 return `<section class="popup-panel"><div class="popup-panel-heading"><h3>透明弹窗</h3><span>500 × 650 · PNG</span></div><p class="popup-help">沿用母版素材，背景在轮廓内显示，人物、文案和按钮可独立移动。${active?'保存后保留上一版方案。':'应用后生成新方案，原有尺寸稿保留。'}</p>
 <form id="community-popup-form"><fieldset ${disabled?'disabled':''}><label>背景形状<select name="shape">${[['circle','圆形'],['ellipse','椭圆'],['asset','不规则透明底板'],['none','无背景']].map(([v,t])=>`<option value="${v}" ${c.shape===v?'selected':''}>${t}</option>`).join('')}</select></label>
 <div class="popup-frame-fields"><label>X<input name="x" type="number" value="${c.frame.x}" min="0" max="450" required></label><label>Y<input name="y" type="number" value="${c.frame.y}" min="0" max="600" required></label><label>宽<input name="width" type="number" value="${c.frame.width}" min="50" max="500" required></label><label>高<input name="height" type="number" value="${c.frame.height}" min="50" max="650" required></label></div>
 <label class="popup-check"><input name="outline" type="checkbox" ${c.outline?'checked':''}>显示轮廓描边<input name="outlineColor" type="color" value="${c.outlineColor}" aria-label="描边颜色"></label>
 <label class="popup-check"><input name="clipCharacterBottom" type="checkbox" ${c.clipCharacterBottom?'checked':''}>人物底部收进背景轮廓</label>
 <label class="popup-check"><input name="buttonVisible" type="checkbox" ${c.buttonVisible?'checked':''}>显示按钮</label><div class="popup-button-fields"><label>按钮文案<input name="buttonLabel" value="${esc(c.buttonLabel)}" maxlength="16" required></label><label>颜色<input name="buttonColor" type="color" value="${c.buttonColor}"></label></div>
 ${popupButtonControls(c,task.assets,task.parameters?.layoutByTemplate?.[template.id]?.button||popupLayerBox('button'))}
 <p id="popup-panel-error" class="popup-error" role="alert"></p><button class="button primary full-button" type="submit">${active?'保存弹窗设置':'应用透明弹窗方案'}</button>${active?'<button class="button secondary full-button" type="button" id="popup-reflow">重新排列人物与文案</button>':''}</fieldset></form>
 ${disabled&&task.deliveredPackage?'':renderPopupButtonComposer(task,c,{templateId:template.id,disabled})}
 <label class="popup-preview-label">预览底色<select id="popup-preview-mode">${[['checker','棋盘格'],['white','白色'],['dark','深色']].map(([v,t])=>`<option value="${v}" ${preview===v?'selected':''}>${t}</option>`).join('')}</select></label>
 ${history.length?`<details class="popup-history"><summary>历史方案 · ${history.length}</summary><select id="popup-history-version">${history.map(h=>`<option value="${esc(h.id)}">${esc(new Date(h.at).toLocaleString('zh-CN'))} · ${esc(h.label)}</option>`).join('')}</select><button class="button secondary full-button" id="popup-restore" ${disabled?'disabled':''}>恢复所选方案</button></details>`:''}</section>`;
}
export function mountPopupPanel({root,task,api,flush,updated,resolveAsset,onPreview,onDraft,onGeneration,onTextSelect,textSelected,getButtonImage}){
 const form=root.querySelector('#community-popup-form');if(!form)return;
 const error=root.querySelector('#popup-panel-error');
 // Read values directly: async uploads/font selection temporarily disable the fieldset.
 const draft=()=>{const f={get:k=>form.elements.namedItem(k)?.value??null,has:k=>Boolean(form.elements.namedItem(k)?.checked)};return {config:{...popupConfig(task,{id:COMMUNITY_POPUP_ID}),shape:f.get('shape'),frame:Object.fromEntries(['x','y','width','height'].map(k=>[k,Number(f.get(k))])),outline:f.has('outline'),outlineColor:f.get('outlineColor'),buttonVisible:f.has('buttonVisible'),buttonLabel:f.get('buttonLabel'),buttonColor:f.get('buttonColor'),clipCharacterBottom:f.has('clipCharacterBottom'),buttonFontId:f.get('buttonFontId'),buttonTextPosition:readPopupButtonTextPosition(form),buttonFontSize:f.get('buttonFontSize')?Number(f.get('buttonFontSize')):undefined,buttonBackingAsset:f.get('buttonBackingAsset')}};};
 let submitting=false;
 const busy=async work=>{if(submitting)return;submitting=true;error.textContent='';const downloads=[...root.querySelectorAll('#editor-download-single,#editor-download-materials')],previous=downloads.map(b=>b.disabled);downloads.forEach(b=>b.disabled=true);form.querySelector('fieldset').disabled=true;try{await work();}catch(e){error.textContent=e.message;}finally{submitting=false;if(form.isConnected)form.querySelector('fieldset').disabled=false;downloads.forEach((b,i)=>{if(b.isConnected)b.disabled=previous[i];});}};
 mountPopupButtonControls({root:form,assets:task.assets,layout:()=>task.parameters?.layoutByTemplate?.[COMMUNITY_POPUP_ID]?.button||popupLayerBox('button'),commitFontSize:()=>save('apply'),selectText:()=>onTextSelect(true),config:()=>draft().config,changed:()=>onDraft(draft()),work:busy,upload:async file=>{
  const values=draft(),current=await flush();if(!current)throw Error('排版尚未保存');
  const uploaded=await api(`/api/tasks/${task.id}/community-popup`,{method:'POST',body:JSON.stringify({action:'upload',role:'button',...file,expectedUpdatedAt:current.updatedAt})});
  values.config.buttonBackingAsset=uploaded.assets.at(-1).name;
  const saved=await api(`/api/tasks/${task.id}/community-popup`,{method:'POST',body:JSON.stringify({action:'apply',...values,bindings:popupInitialBindings(uploaded,resolveAsset),expectedUpdatedAt:uploaded.updatedAt})});onDraft(null);await updated(saved);
 }});
 const save=async action=>{const values=draft();await busy(async()=>{const current=await flush();if(!current)throw Error('排版尚未保存，请稍后再试');const saved=await api(`/api/tasks/${task.id}/community-popup`,{method:'POST',body:JSON.stringify({action,...values,bindings:popupInitialBindings(current,resolveAsset),expectedUpdatedAt:current.updatedAt})});onDraft(null);await updated(saved);});};
 form.addEventListener('submit',e=>{e.preventDefault();void save('apply');});root.querySelector('#popup-reflow')?.addEventListener('click',()=>void save('reflow'));
 const updateShape=()=>{form.elements.height.readOnly=form.elements.shape.value==='circle';if(form.elements.height.readOnly)form.elements.height.value=form.elements.width.value;};updateShape();
 form.addEventListener('change',()=>{updateShape();onDraft(draft());});
 root.querySelector('#popup-preview-mode').onchange=e=>onPreview(e.target.value);
 root.querySelector('#popup-restore')?.addEventListener('click',()=>void busy(async()=>{const current=await flush();if(!current)throw Error('排版尚未保存');const saved=await api(`/api/tasks/${task.id}/community-popup`,{method:'POST',body:JSON.stringify({action:'restore',versionId:root.querySelector('#popup-history-version').value,expectedUpdatedAt:current.updatedAt})});onDraft(null);await updated(saved);}));
 const disposeText=mountPopupButtonTextEditor({root,config:()=>draft().config,layout:()=>task.parameters?.layoutByTemplate?.[COMMUNITY_POPUP_ID]?.button||popupLayerBox('button'),image:()=>getButtonImage(draft().config),fontFamily:()=>popupFontFamily(draft().config),selected:textSelected,select:onTextSelect,locked:()=>form.querySelector('fieldset').disabled||['communityGeneration','communityObjectJob','outpaint'].some(k=>task[k]?.status==='running')||!popupConfig(task,{id:COMMUNITY_POPUP_ID}),change:next=>{syncPopupButtonTextControls(form,next,task.parameters?.layoutByTemplate?.[COMMUNITY_POPUP_ID]?.button||popupLayerBox('button'),getButtonImage(next));onDraft(draft());},commit:()=>save('apply')});
 const disposeComposer=mountPopupButtonComposer({root,task,config:()=>draft().config,isBusy:()=>['communityGeneration','communityObjectJob','outpaint'].some(k=>task[k]?.status==='running'),disabled:Boolean(task.status==='已完成'&&task.deliveredPackage),generate:async input=>{
  const current=await flush();if(!current)throw Error('排版尚未保存');let saved=current;
  if(!input.resume)saved=await api(`/api/tasks/${task.id}/community-popup`,{method:'POST',body:JSON.stringify({action:'apply',...draft(),bindings:popupInitialBindings(current,resolveAsset),expectedUpdatedAt:current.updatedAt})});
  onDraft(null);
  try{const next=await api(`/api/tasks/${task.id}/source-popup-button`,{method:'POST',body:JSON.stringify({action:input.resume?'resume':'generate',templateId:COMMUNITY_POPUP_ID,prompt:input.prompt,references:input.references,requestId:crypto.randomUUID(),expectedUpdatedAt:saved.updatedAt})});
   await updated(next);onGeneration?.();
  }catch(e){await updated(saved);const visibleError=root.querySelector('[data-button-error]');if(visibleError)visibleError.textContent=e.message;throw e;}
 }});
 return ()=>{disposeText();disposeComposer();};
}
