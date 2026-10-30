// Size-specific additions do not invalidate the approved master. If a designer
// later uses one on the master itself, its binding/layer makes it a master input.
export function belongsToCommunityMaster(task,asset){
 const master=task.masterTemplateId,bound=Object.values(task.parameters?.assetByTemplate?.[master]||{}).includes(asset.name),placed=(task.parameters?.communityObjectLayersByTemplate?.[master]||[]).some(l=>l.appearance.assetName===asset.name);
 return (!asset.canvasTemplateId||asset.canvasTemplateId===master||bound||placed)&&(!asset.popupUpload||bound);
}
