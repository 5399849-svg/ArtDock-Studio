import sharp from 'sharp';

export const communityMasterTemplate={
  id:'community-banner-master',name:'Banner 母版',width:1920,height:1080,
  format:'PNG',maxBytes:32*1048576,communityPlacement:true,communityMaster:true,
  businessLineId:'platform-community',segmentId:'community-master',categoryId:'community-master',
  family:'母版',renderMode:'layered-community',brandLogo:true,ipCopyright:true,
  safeArea:{left:.04,top:.04,right:.04,bottom:.04},
  communityLayout:{title:[.045,.15,.53,.43],subtitle:[.055,.58,.49,.2],character:[.56,.02,.42,.94],foreground:[0,.79,1,.21],logo:[.03,.025,.16,.16],copyright:[.76,.91,.21,.06]}
};

export function remapLegacyMasterSnapshot(snapshot,source){
  if(snapshot.masterTemplateId===communityMasterTemplate.id)return structuredClone(snapshot);
  const result=structuredClone(snapshot),scale=Math.min(1920/source.width,1080/source.height);
  const dx=(1920-source.width*scale)/2,dy=(1080-source.height*scale)/2;
  for(const layout of Object.values(result.layout||{})){
    if(!layout||!['x','y','width','height'].every(k=>Number.isFinite(layout[k])))continue;
    layout.x=dx+layout.x*scale;layout.y=dy+layout.y*scale;
    layout.width*=scale;layout.height*=scale;
    for(const k of ['scaleBaseWidth','scaleBaseHeight'])if(Number.isFinite(layout[k]))layout[k]*=scale;
  }
  result.masterTemplateId=communityMasterTemplate.id;
  // Preserve the entire historical artwork until it is deliberately redesigned.
  result.background={...result.background,fit:'contain'};
  return result;
}

// Called explicitly when opening an editable legacy task, never by a GET or on
// delivered versions. Delivery sizes, old layouts, assets and history stay intact.
export function ensureCommunityMasterWorkspace(task,sourceTemplate,{now=new Date().toISOString()}={}){
  if(['adapt','copy-replace'].includes(task.mode))return false;
  if(task.customCanvas||task.masterTemplateId===communityMasterTemplate.id)return false;
  if(!sourceTemplate?.communityPlacement || task.deliveredPackage&&task.status==='已完成')return false;
  if(task.communityGeneration?.status==='running'||task.outpaint?.status==='running')throw Object.assign(Error('请等待当前生成完成后进入母版制作'),{status:409});
  const p=task.parameters ||= {},old=task.masterTemplateId,id=communityMasterTemplate.id;
  const snapshot=remapLegacyMasterSnapshot({masterTemplateId:old,layout:p.layoutByTemplate?.[old]||{},background:p.backgroundByTemplate?.[old]||{},assets:p.assetByTemplate?.[old]||{},artwork:p.communityArtworkByTemplate?.[old]},sourceTemplate);
  p.layoutByTemplate ||= {};p.assetByTemplate ||= {};p.backgroundByTemplate ||= {};p.communityArtworkByTemplate ||= {};
  p.layoutByTemplate[id]=snapshot.layout;p.assetByTemplate[id]=snapshot.assets;p.backgroundByTemplate[id]=snapshot.background;
  if(snapshot.artwork)p.communityArtworkByTemplate[id]=snapshot.artwork;
  task.communityMasterWorkspace={version:1,previousTemplateId:old,previousApproval:structuredClone(task.communityMasterApproval||null),openedAt:now};
  task.masterTemplateId=id;task.masterCanvasId='landscape-1920x1080';task.communityMasterApproval=null;
  p.communityImageModel ||= 'gpt-image-2';
  task.updatedAt=now;(task.history ||= []).push({at:now,action:'进入 1920×1080 母版制作，保留原尺寸稿及历史版本',by:'设计师',status:task.status});
  return true;
}

// Render an edit input from the saved high-resolution artwork, never the small
// browser preview. This also honors the user's actual zoom/focus/contain setting.
export async function renderCommunityArtworkEditSource(sourceBuffer,template,placement={}){
  const meta=await sharp(sourceBuffer).metadata(),width=template.width*2,height=template.height*2;
  if(!meta.width||!meta.height)throw Error('母版原图无效');
  const fit=placement.fit==='contain'?Math.min:Math.max;
  const scale=fit(width/meta.width,height/meta.height)*Math.max(.2,Number(placement.scale??100)/100);
  const rw=Math.max(1,Math.round(meta.width*scale)),rh=Math.max(1,Math.round(meta.height*scale));
  const x=Math.round(-(rw-width)*Number(placement.focalX??50)/100),y=Math.round(-(rh-height)*Number(placement.focalY??50)/100);
  const left=Math.max(0,-x),top=Math.max(0,-y),cw=Math.min(rw-left,width-Math.max(0,x)),ch=Math.min(rh-top,height-Math.max(0,y));
  if(cw<=0||ch<=0)throw Error('母版位置超出画布');
  const layer=await sharp(sourceBuffer).resize(rw,rh,{fit:'fill'}).extract({left,top,width:cw,height:ch}).png().toBuffer();
  return sharp({create:{width,height,channels:3,background:placement.fit==='contain'?'#eef1f7':'#111827'}}).composite([{input:layer,left:Math.max(0,x),top:Math.max(0,y)}]).png().toBuffer();
}
