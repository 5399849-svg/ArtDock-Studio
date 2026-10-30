import {communityObjectLayerAssetNames} from './community-object-layers.js';
import {popupConfig} from './community-popup-model.js';
import {sourceComposition,sourceTargetPending} from './source-adaptation-model.js';
export function communityTargetCompositionAsset(task,template){
 if(!template?.communityPlacement||template.id===task.masterTemplateId)return null;
 const selected=task.parameters?.assetByTemplate?.[template.id]?.background;
 return (task.assets||[]).find(a=>a.name===selected&&a.role==='generated-background'&&a.sourceTemplateId===template.id)||null;
}
export function communityTargetHasComposition(task,template){if(task.sourceAdaptation)return Boolean(sourceComposition(task,template.id));const popup=popupConfig(task,template);return popup?popup.shape==='none'||task.assets?.some(a=>a.name===task.parameters?.assetByTemplate?.[template.id]?.background):Boolean(communityTargetCompositionAsset(task,template));}
const canonical=value=>JSON.stringify(value,(_,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);
export function communityTargetReviewSnapshot(task,template){
 if(task.sourceAdaptation)return {masterFingerprint:task.communityMasterApproval?.fingerprint||'',templateId:template.id,sourceHash:task.sourceAdaptation.sourceHash,composition:sourceComposition(task,template.id)};
 const p=task.parameters||{},id=template.id,bindings=p.assetByTemplate?.[id]||{};
 const names=[...new Set([...Object.values(bindings),p.layoutByTemplate?.[id]?.['subtitle-backing']?.backing?.assetName,...(p.communityObjectLayersByTemplate?.[id]||[]).flatMap(communityObjectLayerAssetNames)].filter(Boolean))].sort();
 return {masterFingerprint:task.communityMasterApproval?.fingerprint||'',templateId:id,...(p.communityPopupNativeByTemplate?.[id]?{popupNative:p.communityPopupNativeByTemplate[id]}:{}),bindings,layout:p.layoutByTemplate?.[id]||{},background:p.backgroundByTemplate?.[id]||{},artwork:p.communityArtworkByTemplate?.[id]||null,...(popupConfig(task,template)?{popup:popupConfig(task,template)}:{}),...(p.communityObjectLayersByTemplate?.[id]?.length?{objectLayers:p.communityObjectLayersByTemplate[id]}:{}),copy:task.copy||'',subtitleText:p.subtitleText||'',fonts:Object.fromEntries(['titleFontId','subtitleFontId','titleFontAsset','subtitleFontAsset'].map(k=>[k,p[k]||null])),assets:names.map(name=>{const asset=task.assets?.find(a=>a.name===name);return {name,bytes:asset?.bytes||null,createdAt:asset?.createdAt||null};})};
}
export function communityTargetReviewMatches(task,template){
 const review=task.communityTargetReviews?.[template?.id];
 return !!review&&communityTargetHasComposition(task,template)&&canonical(review.snapshot)===canonical(communityTargetReviewSnapshot(task,template));
}
// A previous composition remains visible/editable while its master needs sync.
// Only a never-generated size is shown as a master reference.
export function communityArtworkTargetPending(task,template){
  if(task.sourceAdaptation){if(!template||template.id===task.masterTemplateId)return false;return sourceTargetPending(task,template.id);}
  if(communityTargetReviewMatches(task,template))return false;
  const popup=popupConfig(task,template);if(popup)return !communityTargetHasComposition(task,template)||popup.masterFingerprint!==(task.communityMasterApproval?.fingerprint||'');
  const p=task.parameters || {},master=p.communityArtworkByTemplate?.[task.masterTemplateId];
  if(task.masterTemplateId==='community-banner-master'&&p.communityMaterialWorkflow?.version>=1&&!master&&template?.communityPlacement&&template.id!==task.masterTemplateId){
    const selected=p.assetByTemplate?.[template.id]?.background,asset=(task.assets||[]).find(a=>a.name===selected);
    const revision=p.communityTargetRevisions?.[template.id],fp=task.communityMasterApproval?.fingerprint;
    return !fp||asset?.extensionMode!=='layered-reflow-v1'||asset.sourceTemplateId!==template.id||!(asset.sourceMasterFingerprint===fp||revision?.backgroundName===selected&&revision.masterFingerprint===fp);
  }
  if(!master || !template?.communityPlacement || template.id===task.masterTemplateId)return false;
  const selected=p.assetByTemplate?.[template.id]?.background;
  const target=p.communityArtworkByTemplate?.[template.id];
  const asset=(task.assets || []).find(a=>a.name===selected);
  return !target || target.assetName!==selected || !(target.sourceArtworkName===master.assetName || asset?.sourceBackgroundName===master.assetName);
}

