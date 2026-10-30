import {isCommunityPopup,popupDefaults,normalizePopupConfig,tracePopupFrame,drawPopupButton,drawPopupOutline,assertPopupPixels,clipPopupCharacterBottom} from './community-popup-model.js';
import {SOURCE_BUTTON_ID,SOURCE_BUTTON_TEXT_ID,sourceButtonTextElement,sourceButtonElement,sourceButtonDefault} from './source-popup-button.js';
import {popupFontFamily} from './project-fonts.js';
import {drawLayerHandles} from './source-canvas-transform.js';
import {preserveSourceLayerOrder,sourceCharacterDepth} from './source-layer-order.js';
import {drawSourceCopyright,sourceCopyrightLayout,sourceCopyrightElement,sourceCopyrightState,validateSourceCopyright,SOURCE_COPYRIGHT_ID} from './source-copyright.js';
export const SOURCE_REFLOW_VERSION=2;
export const isSourceAdaptation = task => Boolean(!task?.customCanvas && ['adapt','copy-replace'].includes(task?.mode) && (/^(community-|source-master-)/.test(task.masterTemplateId||'') || task.templates?.some(t=>t.communityPlacement)));
export function sourceMasterTemplate(task){
 const s=task.sourceAdaptation;if(!s)return null;
 return {id:`source-master-${task.id}`,name:'源稿',width:s.width,height:s.height,format:'PNG',maxBytes:64*1048576,communityPlacement:true,communityMaster:true,sourceMaster:true,businessLineId:task.businessLineId,segmentId:'community-master',family:'源稿',renderMode:'source-adaptation'};
}
export const sourceComposition=(task,id)=>task.parameters?.sourceCompositionByTemplate?.[id]||null;
export const sourceMergedLayer=task=>task.sourceAdaptation?.layers.find(l=>l.role==='source-group'&&l.width*l.height>task.sourceAdaptation.width*task.sourceAdaptation.height*.45);
export const sourceNeedsSeparation=task=>Boolean(sourceMergedLayer(task)&&task.sourceAdaptation?.reflow?.sourceHash!==task.sourceAdaptation?.sourceHash);
export const sourceTargetPending=(task,id)=>{const c=sourceComposition(task,id);return !c||c.reflowVersion!==SOURCE_REFLOW_VERSION||!task.communityMasterApproval?.fingerprint||c.sourceFingerprint!==task.communityMasterApproval.fingerprint;};
export function sourceReflowDefinitions(task){
 const s=task.sourceAdaptation,master=sourceComposition(task,task.masterTemplateId);
 const originals=s.layers.map(l=>({...l,visible:master?.layers.find(m=>m.id===l.id)?.visible!==false}));
 return [...originals,...(s.reflow?.sourceHash===s.sourceHash?s.reflow.layers:[])];
}
// Foregrounds always use a uniform scale. Only background pixels are cropped.
function fitBox(layer,box,cover=false){const scale=(cover?Math.max:Math.min)(box.width/layer.width,box.height/layer.height);return {...layer,x:box.x+(box.width-layer.width*scale)/2,y:box.y+(box.height-layer.height*scale)/2,width:layer.width*scale,height:layer.height*scale};}
export function planSourceComposition(task,target){
 const s=task.sourceAdaptation;if(!s)throw Error('请先导入源稿');
 if(target.id===task.masterTemplateId)return structuredClone(sourceComposition(task,target.id));
 if(sourceNeedsSeparation(task))throw Error('人物与背景合在同一组，请先框选并分离人物，再按目标尺寸重排');
 const popup=isCommunityPopup(target),w=target.width,h=target.height,wide=w/h>=1.45;
 const defs=sourceReflowDefinitions(task),background=defs.find(l=>l.role==='background'),characters=defs.filter(l=>['character','secondary-character'].includes(l.role)&&l.visible!==false);
 if(background&&s.reflow?.backgroundMode!=='full-scene'&&s.reflow?.backgroundRegion&&characters.some(l=>Math.min(background.width/l.width,background.height/l.height)<.55))throw Error('旧版背景尚未补全，请点击“分离角色并补全背景”，完成后会自动重排当前尺寸。');
 if(popup&&(!characters.length||!background))throw Error('透明弹窗需要独立的人物和背景，请先分离合并画面');
 const config=popup?normalizePopupConfig(sourceComposition(task,target.id)?.popup||{...popupDefaults(),frame:{x:30,y:104,width:440,height:440},buttonColor:'#6544a5',buttonLabel:'立即参与'}):null;
 const box=(x,y,width,height)=>({x:x*w,y:y*h,width:width*w,height:height*h});
 const boxes=popup?{
  character:box(.08,.035,.84,.71),title:box(.025,.565,.95,.31),subtitle:box(.08,.83,.84,.04),logo:box(.78,.035,.16,.12),foreground:box(.04,.51,.92,.20)
 }:wide?{
  character:box(.57,0,.42,1),title:box(.035,.24,.53,.65),subtitle:box(.045,.86,.49,.10),logo:box(.04,.035,.10,.18),foreground:box(.60,.65,.37,.31)
 }:{
  character:box(.07,.04,.86,.68),title:box(.035,.63,.93,.29),subtitle:box(.08,.91,.84,.06),logo:box(.79,.025,.15,.12),foreground:box(.03,.49,.94,.24)
 };
 const layers=defs.map(l=>{
  if(l.id===background?.id)return {...fitBox(l,popup?config.frame:{x:0,y:0,width:w,height:h},true),visible:l.visible!==false};
  if(l.role==='source-group'||l.role==='background')return {...fitBox(l,box(0,0,1,1)),visible:false};
  if(['character','secondary-character'].includes(l.role)){
   const i=characters.findIndex(c=>c.id===l.id);let b=boxes.character;
   // A cutout reaching the original top edge may include a swing rope or an
   // already cropped head. Keep that edge at the canvas boundary, rather than
   // centering its visibly truncated end in the sky. Preserve group spacing.
   const anchorTop=s.reflow?.version>=4&&characters.some(c=>c.sourceBounds?.top<=1);
   if(characters.length>1&&characters.every(c=>c.sourceBounds)){
    const left=Math.min(...characters.map(c=>c.sourceBounds.left)),top=Math.min(...characters.map(c=>c.sourceBounds.top)),right=Math.max(...characters.map(c=>c.sourceBounds.left+c.width)),bottom=Math.max(...characters.map(c=>c.sourceBounds.top+c.height)),scale=Math.min(b.width/(right-left),b.height/(bottom-top));
    return {...l,x:b.x+(b.width-(right-left)*scale)/2+(l.sourceBounds.left-left)*scale,y:(anchorTop?0:b.y+(b.height-(bottom-top)*scale)/2)+(l.sourceBounds.top-top)*scale,width:l.width*scale,height:l.height*scale};
   }
   if(characters.length>1){const slot=b.width/characters.length;b={...b,x:b.x+slot*Math.max(i,0),width:slot};}
   const fitted=fitBox(l,b);return anchorTop?{...fitted,y:0}:fitted;
  }
  if(['ip-copyright','copyright'].includes(l.role))return {...fitBox(l,sourceCopyrightLayout(target)),visible:l.visible!==false&&target.ipCopyright!==false};
  const role=l.role;
  return {...fitBox(l,boxes[role]||boxes.foreground),visible:l.visible!==false&&!(l.role==='logo'&&target.brandLogo===false)};
 });
 const order=l=>l.id===background?.id?0:['ip-copyright','copyright'].includes(l.role)?6:['character','secondary-character'].includes(l.role)?2:l.role==='logo'?5:['title','subtitle'].includes(l.role)?4:1;
 layers.sort((a,b)=>order(a)-order(b)||sourceCharacterDepth(a,b));
 const previous=sourceComposition(task,target.id),copyright=previous?.copyright;
 return {reflowVersion:SOURCE_REFLOW_VERSION,fit:'reflow',background:popup?'transparent':'#211b30',sourceFingerprint:task.communityMasterApproval?.fingerprint||'',layers:preserveSourceLayerOrder(layers,previous),...(previous?.layerOrderCustomized?{layerOrderCustomized:true}:{}),...(popup?{popup:config}:{}),...(copyright?{copyright:validateSourceCopyright(copyright)}:{})};
}
export function validateSourceComposition(task,value,templateId=task.masterTemplateId){
 if(!value||!Array.isArray(value.layers)||value.layers.length>200)throw Error('源稿图层无效');
 const master=templateId===task.masterTemplateId;
 const definitions=new Map((!master&&value.reflowVersion===SOURCE_REFLOW_VERSION?sourceReflowDefinitions(task):task.sourceAdaptation.layers).map(l=>[l.id,l]));
 if(value.layers.length!==definitions.size||new Set(value.layers.map(l=>l.id)).size!==definitions.size)throw Error('源稿图层已变化，请刷新');
 if(!['transparent',...(/^#[a-f\d]{6}$/i.test(value.background||'')?[value.background]:[])].includes(value.background))throw Error('画布底色无效');
 if(!master&&templateId==='community-community-popup'&&value.reflowVersion===SOURCE_REFLOW_VERSION&&(!value.popup||value.background!=='transparent'))throw Error('弹窗必须保留透明底和异形背景');
 const layers=value.layers.map(l=>{
  const original=definitions.get(l.id);if(!original||l.assetName!==original.assetName)throw Error('不能替换源稿引用');
  for(const key of ['x','y','width','height'])if(!Number.isFinite(l[key])||Math.abs(l[key])>60000)throw Error('图层位置或大小无效');
  if(l.width<1||l.height<1||Math.abs(l.width/l.height-original.width/original.height)>.002)throw Error('源稿素材必须保持原有比例');
  return {...original,x:l.x,y:l.y,width:l.width,height:l.height,visible:l.visible!==false};
 });
 const popup=value.popup?normalizePopupConfig(value.popup):null;
 if(popup&&(master||templateId!=='community-community-popup'||!['circle','ellipse','none'].includes(popup.shape)))throw Error('异形背景仅用于透明弹窗');
 if(master&&value.copyright)throw Error('请在目标尺寸中调整版权标识');
 return {fit:master?(value.fit==='cover'?'cover':'contain'):'reflow',background:value.background,layers,...(value.layerOrderCustomized===true?{layerOrderCustomized:true}:{}),...(!master&&value.reflowVersion===SOURCE_REFLOW_VERSION?{reflowVersion:SOURCE_REFLOW_VERSION}:{}),...(popup?{popup}:{}),...(value.copyright?{copyright:validateSourceCopyright(value.copyright)}:{})};
}
export function drawSourceComposition(ctx,task,template,images,{selectedId,original=false,handleSize=8,project}={}){
 const s=task.sourceAdaptation;if(!s)return;
 const composition=sourceComposition(task,template.id);
 ctx.clearRect(0,0,template.width,template.height);
 if(original){const img=images.get(s.previewName);if(img)ctx.drawImage(img,0,0,template.width,template.height);return;}
 if(!composition)return;
 if(composition.background!=='transparent'){ctx.fillStyle=composition.background;ctx.fillRect(0,0,template.width,template.height);}
 const layers=template.id===task.masterTemplateId?composition.layers:[...composition.layers].sort((a,b)=>Number(['ip-copyright','copyright'].includes(a.role))-Number(['ip-copyright','copyright'].includes(b.role)));
 const copyright=sourceCopyrightState(task,template,project);
 for(const layer of layers){
  if(copyright?.settings&&['ip-copyright','copyright'].includes(layer.role))continue;
  if(layer.visible===false)continue;const img=images.get(layer.assetName);if(!img)continue;
  ctx.save();
  if(composition.popup&&layer.role==='background'){
   if(composition.popup.shape==='none'){ctx.restore();continue;}
   tracePopupFrame(ctx,composition.popup);ctx.clip();
  }
  if(['character','secondary-character'].includes(layer.role))clipPopupCharacterBottom(ctx,composition.popup,template.width);
  ctx.drawImage(img,layer.x,layer.y,layer.width,layer.height);ctx.restore();
  if(layer.role==='background')drawPopupOutline(ctx,composition.popup);
 }
 if(composition.popup){const c=composition.popup,image=c.buttonBackingAsset?images.get(c.buttonBackingAsset):null;
  if(c.buttonBackingAsset&&!image)throw Error('按钮底板尚未加载');
  drawPopupButton(ctx,c,sourceButtonDefault,{image,fontFamily:popupFontFamily(c)});
 }
 drawSourceCopyright(ctx,task,template,project);
 const selected=selectedId===SOURCE_BUTTON_TEXT_ID?sourceButtonTextElement(ctx,composition.popup,images):selectedId===SOURCE_COPYRIGHT_ID?sourceCopyrightElement(ctx,task,template,project):selectedId===SOURCE_BUTTON_ID?sourceButtonElement(composition.popup,images):composition.layers.find(l=>l.id===selectedId&&l.visible!==false);
 if(selected)drawLayerHandles(ctx,selected,handleSize,template);
}
export function assertSourceExport(task,template,pixels){
 if(!task.sourceAdaptation||template.id===task.masterTemplateId)return;
 if(sourceTargetPending(task,template.id))throw Error('此尺寸尚未按目标比例重排，请先重新适配');
 if(isCommunityPopup(template))assertPopupPixels(pixels);
 else {let clear=0;for(let i=3;i<pixels.length;i+=4)if(pixels[i]<250)clear++;if(clear>pixels.length/4*.005)throw Error('普通横幅存在透明留白，请铺满背景后导出');}
}
