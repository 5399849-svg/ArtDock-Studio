from pathlib import Path
root=Path(__file__).resolve().parents[1]
def edit(name, old, new):
 p=root/name;s=p.read_text(encoding='utf-8');assert old in s,(name,old[:100]);p.write_text(s.replace(old,new),encoding='utf-8')
edit('public/project-fonts.js',"  for (const kind of ['title', 'subtitle']) {","  await loadPopupFonts(task);\n  if(task.sourceAdaptation)return;\n  for (const kind of ['title', 'subtitle']) {")
with (root/'public/project-fonts.js').open('a',encoding='utf-8') as f:f.write('''
export function popupFontFamily(config){
 if(!config?.buttonFontId)return undefined;
 const asset=companyFontsById.get(config.buttonFontId);
 if(!asset)throw Error('按钮版权字体不可用，请重新选择');
 return projectFontFamily(asset);
}
export async function loadPopupFonts(task){
 const configs=[...Object.values(task.parameters?.communityPopupByTemplate||{}),...Object.values(task.parameters?.sourceCompositionByTemplate||{}).map(c=>c.popup)].filter(Boolean);
 for(const id of new Set(configs.map(c=>c.buttonFontId).filter(Boolean))){const font=companyFontsById.get(id);if(!font)throw Error('按钮版权字体不可用，请重新选择');await loadFontAsset(font);}
}
''')
edit('public/community-material-fonts.js',"kind==='title'?'主标':'副标'","kind==='button'?'按钮':kind==='title'?'主标':'副标'")
edit('public/community-material-fonts.js','选择后可直接排字，或交给 AI 设计字效；当前素材保留。',"${kind==='button'?'按钮文字使用所选字体，预览与 PNG 导出一致。':'选择后可直接排字，或交给 AI 设计字效；当前素材保留。'}")
edit('public/community-popup-panel.js',"const esc=", "import {popupButtonControls,mountPopupButtonControls} from './popup-button-controls.js';\nconst esc=")
edit('public/community-popup-panel.js',' <label class="popup-check"><input name="buttonVisible"',' <label class="popup-check"><input name="clipCharacterBottom" type="checkbox" ${c.clipCharacterBottom?\'checked\':\'\'}>人物底部收进背景轮廓</label>\n <label class="popup-check"><input name="buttonVisible"')
edit('public/community-popup-panel.js',' <p id="popup-panel-error"',' ${popupButtonControls(c,task.assets)}\n <p id="popup-panel-error"')
edit('public/community-popup-panel.js',"buttonColor:f.get('buttonColor')","buttonColor:f.get('buttonColor'),clipCharacterBottom:f.has('clipCharacterBottom'),buttonFontId:f.get('buttonFontId'),buttonBackingAsset:f.get('buttonBackingAsset')")
edit('public/community-popup-panel.js'," const save=async action=>",''' mountPopupButtonControls({root:form,config:()=>draft().config,changed:()=>onDraft(draft()),work:busy,upload:async file=>{
  const values=draft(),current=await flush();if(!current)throw Error('排版尚未保存');
  const uploaded=await api(`/api/tasks/${task.id}/community-popup`,{method:'POST',body:JSON.stringify({action:'upload',role:'button',...file,expectedUpdatedAt:current.updatedAt})});
  values.config.buttonBackingAsset=uploaded.assets.at(-1).name;
  const saved=await api(`/api/tasks/${task.id}/community-popup`,{method:'POST',body:JSON.stringify({action:'apply',...values,bindings:popupInitialBindings(uploaded,resolveAsset),expectedUpdatedAt:uploaded.updatedAt})});onDraft(null);await updated(saved);
 }});
 const save=async action=>''')
# Use one font registry across the app, picker, source renderer and popup renderer.
edit('public/app.js',"loadFontAsset } from '/project-fonts.js?v=20261014-company-font-library-ready'","loadFontAsset, popupFontFamily } from '/project-fonts.js'")
edit('public/app.js','drawPopupButton,assertPopupPixels','drawPopupButton,clipPopupCharacterBottom,assertPopupPixels')
edit('public/app.js','if(!state.task.sourceAdaptation)await loadProjectFonts','await loadProjectFonts')
edit('public/app.js','Object.assign(state,await loadEditorImages(saved,loadImage));if(options.render!==false)', 'Object.assign(state,await loadEditorImages(saved,loadImage));await loadProjectFonts(saved,state.data.projects||[]);if(options.render!==false)')
edit('public/app.js',"    drawBreakoutCharacter(ctx, template);", "    ctx.save();clipPopupCharacterBottom(ctx,popup,template.width);\n    drawBreakoutCharacter(ctx, template);")
edit('public/app.js',"{kinds:['character'],selectedId:state.communityObjectCanvasSelectedId,showSelection:showGuide});", "{kinds:['character'],selectedId:state.communityObjectCanvasSelectedId,showSelection:showGuide});\n    ctx.restore();")
edit('public/app.js','  drawUploadedElement(ctx, template, "button");\n  if(popup&&!selectedAssetName(state.task,template,"button"))drawPopupButton(ctx,popup,getElementLayout(state.task,template,"button"));', '''  if(popup&&(popup.buttonBackingAsset||!selectedAssetName(state.task,template,"button"))){
    const image=popup.buttonBackingAsset?state.assetImages.get(popup.buttonBackingAsset):null;
    if(popup.buttonBackingAsset&&!image)throw Error('按钮底板尚未加载，请刷新后导出');
    drawPopupButton(ctx,popup,getElementLayout(state.task,template,"button"),{image,fontFamily:popupFontFamily(popup)});
  }else drawUploadedElement(ctx,template,"button");''')
