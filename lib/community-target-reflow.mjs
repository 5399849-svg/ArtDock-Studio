import sharp from 'sharp';
import {nearestBananaRatio} from './ai-huabu.mjs';
import {remapCommunitySubtitleBacking} from '../public/community-auto-layout.js';
import {communityTargetCompositionAsset} from '../public/community-artwork-state.js';
import {isRenderableImageAsset} from '../public/editor-image-source.js';

export const layeredReflowVersion='layered-reflow-v1';
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const kinds=['character','character2','foreground','title','subtitle','logo','ip-copyright'];
const valid=r=>r&&['x','y','width','height'].every(k=>Number.isFinite(r[k]))&&r.width>0&&r.height>0;

// The editor also displays an uploaded Logo when the master has no explicit
// binding. A missing key is automatic selection; an explicit null is removal.
export function communityMasterLogoAssetName(task,master){
 const p=task.parameters||{},bindings=p.assetByTemplate?.[master.id]||{};
 if(master.brandLogo===false||Object.hasOwn(bindings,'logo')&&bindings.logo===null)return null;
 if(bindings.logo)return bindings.logo;
 const assets=task.assets||[],automatic=assets.find(a=>a.role==='logo'&&isRenderableImageAsset({...a,url:a.url||a.name}));
 if(automatic)return automatic.name;
 const global=p.assetByRole?.logo;
 return global&&assets.some(a=>a.name===global)?global:null;
}

export function usesLayeredCommunityReflow(task){
 return task.masterTemplateId==='community-banner-master'&&task.parameters?.communityMaterialWorkflow?.version>=1&&!task.parameters?.communityArtworkByTemplate?.[task.masterTemplateId];
}
function visibleRect(layout,asset){
 if(!asset?.width||!asset?.height)return {...layout};
 const s=Math.min(layout.width/asset.width,layout.height/asset.height),width=asset.width*s,height=asset.height*s;
 return {...layout,x:layout.x+(layout.width-width)/2,y:layout.y+(layout.height-height)/2,width,height};
}
function fit(source,box){
 const scale=Math.min(box.width/source.width,box.height/source.height),width=source.width*scale,height=source.height*scale;
 return {...source,x:box.x+(box.width-width)/2,y:box.y+(box.height-height)/2,width,height};
}
function finish(layout,source,scale){
 const r={...source,...layout,scaleBaseWidth:layout.width,scaleBaseHeight:layout.height};
 if(source.effects){r.effects=structuredClone(source.effects);if(r.effects.stroke?.width)r.effects.stroke.width*=scale;
  for(const k of ['blur','offsetX','offsetY'])if(Number.isFinite(r.effects.shadow?.[k]))r.effects.shadow[k]*=scale;}
 return r;
}

// Local targets retain the relationship between the actual visible title,
// subject and scene. A generic per-template title box cannot do that.
export function planLayeredCommunityTarget(task,master,target,{prompt=''}={}){
 if(!master?.width||!target?.width||!target?.height)throw Error('缺少母版或目标尺寸');
 const p=task.parameters||{},bindings={...p.assetByTemplate?.[master.id],logo:communityMasterLogoAssetName(task,master)},source=p.layoutByTemplate?.[master.id]||{};
 const ratio=target.width/target.height,masterRatio=master.width/master.height;
 const retained=Math.min(ratio/masterRatio,masterRatio/ratio);
 const method=!String(prompt).trim()&&ratio>=1.6&&retained>=.58?'local':'ai';
 const W=target.width,H=target.height,inset=Math.min(W,H)*.035;
 const scale=Math.max(W/master.width,H/master.height);
 const transform={scale,x:(W-master.width*scale)/2,y:(H-master.height*scale)*.12};
 const layouts={},assets={background:null};
 const rects={};
 for(const kind of kinds){
  const allowed=kind==='logo'?target.brandLogo===true:kind==='ip-copyright'?target.ipCopyright===true:true;
  assets[kind]=allowed?(bindings[kind]||null):null;
  const original=source[kind];if(!valid(original))continue;
  const asset=task.assets.find(a=>a.name===bindings[kind]),r=visibleRect(original,asset);rects[kind]=r;
  if(!allowed||original.visible===false){layouts[kind]={...original,visible:false};continue;}
  let mapped;
  if(method==='local'){
   mapped={x:r.x*scale+transform.x,y:r.y*scale+transform.y,width:r.width*scale,height:r.height*scale};
   const f=Math.min(1,(W-2*inset)/mapped.width,(H-2*inset)/mapped.height);mapped.width*=f;mapped.height*=f;
   mapped.x=clamp(mapped.x,inset,W-inset-mapped.width);mapped.y=clamp(mapped.y,inset,H-inset-mapped.height);
  }else{
   const portrait=ratio<1,box=portrait?{
    title:[.06,.13,.88,.20],subtitle:[.08,.325,.84,.055],logo:[.04,.025,.27,.08],
    character:[.11,.37,.78,.58],character2:[.57,.48,.36,.40],foreground:[0,.82,1,.18],'ip-copyright':[.64,.95,.31,.025]
   }:{title:[.04,.24,.51,.29],subtitle:[.04,.54,.48,.075],logo:[.035,.03,.24,.14],
    character:[.56,.10,.40,.83],character2:[.72,.30,.25,.62],foreground:[0,.82,1,.18],'ip-copyright':[.72,.94,.24,.025]};
   const b=box[kind];mapped=fit(r,{x:b[0]*W,y:b[1]*H,width:b[2]*W,height:b[3]*H});
  }
  layouts[kind]=finish(mapped,original,mapped.width/r.width);
 }
 if(source['subtitle-backing']?.backing?.enabled){
  const backing=remapCommunitySubtitleBacking(master,target,source.subtitle,layouts.subtitle,source['subtitle-backing']);
  if(backing)layouts['subtitle-backing']=backing;
 }
 // A follow-up edits the displayed composition. Keep its independently tuned
 // overlays instead of applying the generic first-generation title/Logo boxes.
 const previous=String(prompt).trim()&&communityTargetCompositionAsset(task,target);
 const placement=p.backgroundByTemplate?.[target.id]||{};
 if(previous){
  Object.assign(layouts,structuredClone(p.layoutByTemplate?.[target.id]||{}));
  Object.assign(assets,structuredClone(p.assetByTemplate?.[target.id]||{}),{background:null});
 }
 const title=layouts.title;
  const objectLayers=structuredClone(p.communityObjectLayersByTemplate?.[previous?target.id:master.id]||[]);
  if(!previous&&method==='ai')for(const layer of objectLayers){
   if(layer.appearance.kind!=='character'||!task.communityObjects?.characters?.some(c=>c.id===layer.appearance.groupId&&c.materialRunId))continue;
   const portrait=ratio<1,aspect=layer.appearance.aspect,box=portrait?{x:.08*W,y:.38*H,width:.84*W,height:.57*H}:{x:.55*W,y:.12*H,width:.42*W,height:.82*H};
   const side=Math.min(Math.min(W,H),box.width/Math.min(1,aspect),box.height/Math.min(1,1/aspect));
   layer.x=(box.x+box.width/2)/W;layer.y=(box.y+box.height/2)/H;layer.size=clamp(side/Math.min(W,H),.05,1);
  }
 return {version:layeredReflowVersion,templateId:target.id,width:W,height:H,method,transform,layouts,assets,
   ...(objectLayers.length?{objectLayers}:{}),
  ...(previous&&!placement.url?{editSource:{assetName:previous.name,bucket:previous.bucket||'assets',placement:structuredClone(placement)}}:{}),
   embeddedCharacter:!['character','character2'].some(k=>bindings[k]&&source[k]?.visible!==false)&&!p.communityObjectLayersByTemplate?.[master.id]?.some(l=>l.appearance.kind==='character')&&task.assets.find(a=>a.name===bindings.background)?.sceneCharacters?.mode!=='independent-character',
  titleZone:title&&title.visible!==false?{x:title.x/W,y:title.y/H,width:title.width/W,height:title.height/H}:null,prompt:String(prompt).trim().slice(0,1200)};
}

export async function renderLocalCommunityTarget(sourceBuffer,master,plan){
 const meta=await sharp(sourceBuffer).metadata(),W=plan.width*2,H=plan.height*2;
 // Source is an exact capture of the approved background, without text/Logo.
 const scale=Math.max(W/meta.width,H/meta.height),rw=Math.round(meta.width*scale),rh=Math.round(meta.height*scale);
 const left=Math.round((rw-W)/2),top=Math.round((rh-H)*.12);
 return sharp(sourceBuffer).resize(rw,rh).extract({left,top,width:W,height:H}).png().toBuffer();
}

export function communityTargetReflowRequest(run,plan,sourceBuffer){
 const portrait=plan.width<plan.height,zone=plan.titleZone;
 const reserve=zone?`标题稍后独立叠加的区域：左${(zone.x*100).toFixed(1)}%、上${(zone.y*100).toFixed(1)}%、宽${(zone.width*100).toFixed(1)}%、高${(zone.height*100).toFixed(1)}%。此区域必须是自然连续的简洁环境，禁止放入人脸、手、重要道具，也不要画空白矩形或底板。`:'';
 const person=plan.embeddedCharacter?`保留图中已有角色的身份、五官、发型、头饰、服装花纹、姿态和手持道具，以及原有角色数量，人物必须仍在插画中，不能删除人物或另加角色。${portrait?'人物位于画面中下部，头顶在画面高度38%左右，脸部在43%至58%之间，下方延续身体、桌案及场景。':'人物置于右侧，脸与手完整，脸部在横向63%至90%之间，左侧留给标题。'}`:'这是无人物环境背景；独立人物稍后叠加，保持承托面、透视与原场景一致，不画新人物。';
 return {model:run.model,task_type:'image',bot_id:'canvas',ratio:nearestBananaRatio(plan.width,plan.height),image_size:'2K',quality:'high',output_format:'png',images:[{data_base64:sourceBuffer.toString('base64')}],
  prompt:`以输入的${plan.editSource?'当前尺寸无字插画':'已确认无字插画'}为唯一视觉母版，${plan.editSource?'按设计师要求调整当前画面':'重排'}为 ${plan.width}×${plan.height} 的${portrait?'竖版':'横版'}构图。保留原画风、季节、昼夜、配色、光照、主要建筑与道具叙事。允许重新安排空间并补绘环境，使整张画面自然完整；这次是构图重排，不是要求原图矩形原位不动的扩图。${person}${reserve}品牌Logo稍后独立叠加，左上角留自然空间。输出铺满整个画幅的无字插画，不要任何主标、副标、书法字、伪字、Logo、边框、灰区、黑边或拼接。${plan.prompt?`设计师补充（优先执行，仅修改指定内容，其余构图保留）：${plan.prompt}`:''}`};
}

// Native provider ratios may differ slightly (e.g. 4:3 for a 5:4 card).
// Cover-crop the small difference; never stretch or add letterbox bars.
export async function normalizeCommunityTargetReflow(raw,plan){
 const m=await sharp(raw,{limitInputPixels:40000000}).metadata();
 const targetRatio=plan.width/plan.height,actualRatio=m.width/m.height,nativeRatio=nearestBananaRatio(plan.width,plan.height).split(':').map(Number).reduce((a,b)=>a/b);
 const closeToTarget=Math.abs(Math.log(actualRatio/targetRatio))<=.16;
 // 984×334 is wider than the provider's nearest supported 21:9. A valid
 // 21:9 result must be cover-cropped, not rejected as a failed generation.
 const validNative=Math.abs(Math.log(actualRatio/nativeRatio))<=.035&&Math.min(actualRatio/targetRatio,targetRatio/actualRatio)>=.64;
 if(!m.width||!m.height||(!closeToTarget&&!validNative))throw Error('返回画幅与目标尺寸差异过大，原始结果已保留，未覆盖当前尺寸');
 return sharp(raw).resize(plan.width*2,plan.height*2,{fit:'cover',position:'centre'}).flatten({background:'#ffffff'}).png().toBuffer();
}
