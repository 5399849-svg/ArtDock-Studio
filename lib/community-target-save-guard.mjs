// A browser opened before a background generation completed can still hold a
// full, obsolete parameters object. Never let it silently roll outputs back.
export function assertCommunityTargetSaveCurrent(task,input){
 if(!input.parameters||task.communityGeneration?.workflow!=='layered-reflow-v1'&&!Object.keys(task.parameters?.communityTargetRevisions||{}).length)return;
 const stale=input.expectedUpdatedAt&&input.expectedUpdatedAt!==task.updatedAt;
 if(input.expectedUpdatedAt&&!stale)return;
 let obsolete=false;
 for(const id of task.targetTemplateIds||[]){
  const current=task.parameters?.assetByTemplate?.[id]?.background;
  const asset=task.assets.find(a=>a.name===current),submitted=input.parameters.assetByTemplate?.[id]?.background;
  if(asset?.extensionMode==='layered-reflow-v1'&&submitted!==undefined&&submitted!==current)obsolete=true;
  const revision=task.parameters?.communityTargetRevisions?.[id];
  if(revision&&input.parameters.assetByTemplate?.[id]&&JSON.stringify(input.parameters.assetByTemplate[id])!==JSON.stringify(task.parameters.assetByTemplate[id]))obsolete=true;
 }
 if(stale||obsolete)throw Object.assign(Error('尺寸结果已更新，本次旧页面参数未覆盖新稿；请刷新后继续调整'),{status:409});
}
