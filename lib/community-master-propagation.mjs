import {isRenderableImageAsset} from '../public/editor-image-source.js';
import {normalizeSubtitleBacking} from '../public/subtitle-backing.js';
import {popupConfig} from '../public/community-popup-model.js';

export const communityMasterLayerKinds = Object.freeze(['character','character2','foreground','title','subtitle','logo','ip-copyright']);
// Native shapes have no asset selection. Keep them out of image validation so
// an absent bitmap cannot hide an explicitly added backing.
export const communityNativeLayerKinds = Object.freeze(['subtitle-backing']);
const fail=(message,status=409)=>{throw Object.assign(new Error(message),{status});};
const validGeometry=layout=>layout && !Array.isArray(layout) && ['x','y','width','height'].every(k=>Number.isFinite(layout[k])) && layout.width>0 && layout.height>0;

export function assertCommunityMasterReady(task, expectedFingerprint, currentFingerprint) {
  if (task.communityGeneration?.status === 'running' || task.outpaint?.status === 'running') fail('生成尚未结束，请等待所有图层完成后再确认或重排母版');
  if (!expectedFingerprint || task.communityMasterApproval?.fingerprint !== expectedFingerprint || currentFingerprint !== expectedFingerprint) fail('母版未确认或已变化，请先确认当前母版再重排');
}

export function validateCommunityMasterSelections(task, selections) {
  const bindings=task.parameters?.assetByTemplate?.[task.masterTemplateId] || {};
  const result={};
  for(const kind of ['background',...communityMasterLayerKinds]) {
    const name=selections?.[kind] || null;
    if(name!==null && typeof name!=='string')fail('母版素材名称无效',422);
    if(Object.hasOwn(bindings,kind) && (bindings[kind] || null)!==name)fail('母版素材已变化，请刷新后重新确认');
    if(name && !(task.assets || []).some(a=>a.name===name && isRenderableImageAsset(a)))fail(`母版素材不存在：${name}`,422);
    result[kind]=name;
  }
  return result;
}

export function propagateCommunityMaster(task,{templates,masterAssets,targetLayouts,backgroundName,masterFingerprint,isIpProject=false,now=new Date().toISOString()}) {
  const parameters=structuredClone(task.parameters || {});
  parameters.assetByTemplate ||= {};parameters.layoutByTemplate ||= {};parameters.backgroundByTemplate ||= {};
  const sourceLayout=parameters.layoutByTemplate[task.masterTemplateId] || {};
  for(const template of templates) {
    if(template.id===task.masterTemplateId || !template.communityPlacement)continue;
    if(popupConfig(task,template))continue;
    if(!targetLayouts?.[template.id] || typeof targetLayouts[template.id]!=='object' || Array.isArray(targetLayouts[template.id]))fail('缺少目标尺寸布局',422);
    const bindings=parameters.assetByTemplate[template.id] ||= {};
    if(parameters.communityObjectLayersByTemplate?.[task.masterTemplateId]||parameters.communityObjectLayersByTemplate?.[template.id]) (parameters.communityObjectLayersByTemplate||={})[template.id]=structuredClone(parameters.communityObjectLayersByTemplate[task.masterTemplateId]||[]);
    const layouts=parameters.layoutByTemplate[template.id] ||= {};
    const masterArtwork=parameters.communityArtworkByTemplate?.[task.masterTemplateId],targetArtwork=parameters.communityArtworkByTemplate?.[template.id];
    const existingArtwork=(task.assets || []).find(a=>a.name===bindings.background&&a.role==='generated-background'&&a.sourceTemplateId===template.id);
    if(masterArtwork && targetArtwork && existingArtwork && targetArtwork.assetName===existingArtwork.name && (targetArtwork.sourceArtworkName===masterArtwork.assetName || existingArtwork.sourceBackgroundName===masterArtwork.assetName)){
      // A trial from this exact artwork is already a real target composition.
      // Keep its layout; only synchronize original brand assets and eligibility.
      bindings.logo=template.brandLogo===true?(masterAssets.logo || null):null;
      bindings['ip-copyright']=template.ipCopyright===true&&isIpProject?(masterAssets['ip-copyright'] || null):null;
      continue;
    }
    for(const kind of communityMasterLayerKinds) {
      const allowed=kind==='logo'?template.brandLogo===true:kind==='ip-copyright'?template.ipCopyright===true && isIpProject:true;
      bindings[kind]=allowed?(masterAssets[kind] || null):null;
      if(!allowed){delete layouts[kind];continue;}
      const layout=targetLayouts[template.id][kind];
      if(!layout){delete layouts[kind];continue;}
      if(!validGeometry(layout))fail('目标图层布局无效',422);
      layouts[kind]=structuredClone(layout);
      if((!bindings[kind] && !['title','subtitle'].includes(kind)) || sourceLayout[kind]?.visible===false)layouts[kind].visible=false;
    }
    for(const kind of communityNativeLayerKinds) {
      // Native layers must never acquire or retain a stale asset binding.
      delete bindings[kind];
      const source=sourceLayout[kind];
      const backing=normalizeSubtitleBacking(source?.backing);
      if(!backing.enabled){delete layouts[kind];continue;}
      const target=targetLayouts[template.id][kind];
      if(!validGeometry(target))fail('缺少或无效的副标承托布局',422);
      layouts[kind]={...structuredClone(source),x:target.x,y:target.y,width:target.width,height:target.height,visible:source.visible!==false,backing};
    }
    const selected=(task.assets || []).find(a=>a.name===bindings.background);
    const sameExtension=selected?.role==='generated-background' && selected.sourceTemplateId===template.id && selected.sourceMasterFingerprint===masterFingerprint;
    if(sameExtension) {
      const previous=parameters.backgroundByTemplate[template.id] || {};
      parameters.backgroundByTemplate[template.id]={focalX:previous.focalX??50,focalY:previous.focalY??50,scale:previous.scale??100,smartExpand:false,url:''};
    } else {
      bindings.background=backgroundName || null;
      parameters.backgroundByTemplate[template.id]={focalX:50,focalY:50,scale:100,smartExpand:false,url:''};
    }
  }
  parameters.communityAutoLayoutAt=now;
  parameters.communityAutoLayoutMasterFingerprint=masterFingerprint;
  return parameters;
}
