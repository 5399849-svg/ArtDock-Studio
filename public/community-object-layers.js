import {communityRewardGroups,communityCharacterGroups,normalizedRewardStyle} from './community-object-state.js';
const clone=value=>structuredClone(value),clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
export const placedCommunityObjects=(task,id=task.masterTemplateId)=>task.parameters?.communityObjectLayersByTemplate?.[id]||[];
export const communityObjectMaxSize=layer=>layer?.appearance?.kind==='character'?3:1;
export function communityObjectAppearance(task,kind,id){
 if(kind==='reward'){
  const reward=communityRewardGroups(task).find(r=>r.id===id);if(!reward)throw Error('道具已移除');
  const style=normalizedRewardStyle(reward.style,task.communityObjects?.styles||[]),decoration=task.communityObjects?.styles?.find(s=>s.id===style.styleId);
  return {kind,groupId:id,name:reward.name,assetName:reward.bodyName||reward.sourceName,aspect:1,style:{...style,...(decoration?.backingName?{backingName:decoration.backingName}:{}),...(decoration?.foregroundName?{foregroundName:decoration.foregroundName}:{})}};
 }
 const character=communityCharacterGroups(task).find(c=>c.id===id),asset=task.assets?.find(a=>a.name===character?.assetName);
 if(kind!=='character'||!asset)throw Error('请先提取人物 PNG');
 return {kind,groupId:id,name:'当前稿人物',assetName:asset.name,aspect:asset.width/asset.height};
}
export function communityObjectLayerRect(layer,template){
 const side=Math.min(template.width,template.height)*layer.size,aspect=Math.max(.05,Math.min(20,layer.appearance.aspect||1));
 const width=aspect>=1?side:side*aspect,height=aspect>=1?side/aspect:side;
 const position=(center,extent,length)=>clamp(center*extent-length/2,Math.min(0,extent-length),Math.max(0,extent-length));
 return {x:position(layer.x,template.width,width),y:position(layer.y,template.height,height),width,height};
}
export function placeCommunityObject(task,template,kind,groupId,point){
 if(task.communityObjects?.styleCandidate&&kind==='reward')throw Error('请先采用或放弃装饰候选，再放入画布');
 const appearance=communityObjectAppearance(task,kind,groupId),layers=placedCommunityObjects(task,template.id),id=`${kind}:${groupId}`;
 const existing=layers.find(l=>l.id===id);
 if(existing){if(point)Object.assign(existing,{x:clamp(point.x/template.width,0,1),y:clamp(point.y/template.height,0,1)});return existing;}
 if(layers.length>=32)throw Error('当前画布最多放入 32 个独立素材');
 const layer={id,appearance,x:point?clamp(point.x/template.width,0,1):.5,y:point?clamp(point.y/template.height,0,1):.5,size:kind==='reward'?.3:.75};
 ((task.parameters||={}).communityObjectLayersByTemplate||={})[template.id]=[...layers,layer];return layer;
}
export function changeCommunityObjectLayer(task,templateId,id,values){
 const layer=placedCommunityObjects(task,templateId).find(l=>l.id===id);if(!layer)throw Error('该素材已移出画布');
 for(const key of ['x','y','size'])if(Object.hasOwn(values,key)){if(!Number.isFinite(values[key]))throw Error('素材位置或大小无效');layer[key]=clamp(values[key],key==='size'?.05:0,key==='size'?communityObjectMaxSize(layer):1);}
 return layer;
}
export function removeCommunityObjectLayer(task,templateId,id){
 const current=placedCommunityObjects(task,templateId);if(!current.some(l=>l.id===id))return;
 task.parameters.communityObjectLayersByTemplate[templateId]=current.filter(l=>l.id!==id);
}
export function refreshPlacedRewardAppearances(task,ids){
 for(const layers of Object.values(task.parameters?.communityObjectLayersByTemplate||{}))for(const layer of layers)if(layer.appearance.kind==='reward'&&ids.includes(layer.appearance.groupId))layer.appearance=communityObjectAppearance(task,'reward',layer.appearance.groupId);
}
export const communityObjectLayerAssetNames=layer=>[layer.appearance.assetName,layer.appearance.style?.backingName,layer.appearance.style?.foregroundName].filter(Boolean);
export function validateCommunityObjectLayers(task,map,templateIds){
 if(map===undefined)return;if(!map||Array.isArray(map)||typeof map!=='object')throw Error('独立素材图层设置无效');
 const allAssets=task.assets||[];let total=0;
 for(const [id,layers]of Object.entries(map)){
  if(!templateIds.includes(id)||!Array.isArray(layers)||layers.length>32||new Set(layers.map(l=>l?.id)).size!==layers.length)throw Error('独立素材画布或数量无效');
  total+=layers.length;if(total>500)throw Error('独立素材图层过多');
  for(const layer of layers){
   if(!layer||typeof layer.id!=='string'||layer.id.length>300||!['x','y','size'].every(k=>Number.isFinite(layer[k])&&layer[k]>=(k==='size'?.05:0)&&layer[k]<=(k==='size'?communityObjectMaxSize(layer):1)))throw Error('独立素材位置或大小无效');
   const a=layer.appearance;if(!a||!['reward','character','material'].includes(a.kind)||typeof a.groupId!=='string'||typeof a.assetName!=='string'||!a.assetName||typeof a.name!=='string'||a.name.length>150||!Number.isFinite(a.aspect)||a.aspect<.05||a.aspect>20)throw Error('独立素材内容无效');
   for(const name of communityObjectLayerAssetNames(layer))if(!allAssets.some(asset=>asset.name===name&&asset.mime?.startsWith('image/')))throw Error('图层素材不属于当前任务');
   if(a.kind==='reward')normalizedRewardStyle(a.style,[{id:a.style?.styleId}]);
  }
 }
}
// Match edits by stable layer ID. Preserve a designer's target-specific offsets,
// scale and other objects when only part of the master changed.
export function syncCommunityObjectLayers(current=[],previous=[],next=[]){
 const result=clone(current.filter(l=>!previous.some(p=>p.id===l.id)||next.some(n=>n.id===l.id)));
 for(const layer of next){const old=previous.find(l=>l.id===layer.id),target=result.find(l=>l.id===layer.id);
  if(!target){if(!old)result.push(clone(layer));continue;}
  if(!old)continue;
  if(JSON.stringify(old.appearance)!==JSON.stringify(layer.appearance))target.appearance=clone(layer.appearance);
  for(const key of ['x','y'])if(old[key]!==layer[key])target[key]=clamp(target[key]+layer[key]-old[key],0,1);
  if(old.size!==layer.size)target.size=clamp(target.size*layer.size/old.size,.05,communityObjectMaxSize(target));
 }
 return result;
}
export const communityObjectLayerImageUrl=(task,layer)=>`/api/tasks/${encodeURIComponent(task.id)}/community-objects/placed-image?appearance=${encodeURIComponent(JSON.stringify(layer.appearance))}`;
export const communityObjectLayerImageKey=(task,layer)=>'object-layer:'+communityObjectLayerImageUrl(task,layer);
export async function loadCommunityObjectLayerImages(task,loadImage,images=new Map()){
 const layers=Object.values(task.parameters?.communityObjectLayersByTemplate||{}).flat();
 const needed=new Set(layers.map(layer=>communityObjectLayerImageKey(task,layer)));
 for(const key of images.keys())if(key.startsWith('object-layer:')&&!needed.has(key))images.delete(key);
 await Promise.all([...new Map(layers.map(layer=>[communityObjectLayerImageKey(task,layer),layer])).entries()].map(async([key,layer])=>{if(!images.has(key))images.set(key,await loadImage(communityObjectLayerImageUrl(task,layer)));}));return images;
}
export function drawCommunityObjectLayers(ctx,task,template,images,{selectedId,showSelection=false,kinds}={}){
 for(const layer of placedCommunityObjects(task,template.id)){
  if(kinds&&!kinds.includes(layer.appearance.kind))continue;
  const image=images.get(communityObjectLayerImageKey(task,layer));if(!image)throw Error('独立素材尚未加载，请稍候再下载');
  const r=communityObjectLayerRect(layer,template);ctx.drawImage(image,r.x,r.y,r.width,r.height);
  if(showSelection&&layer.id===selectedId){ctx.save();ctx.strokeStyle='#7057ef';ctx.lineWidth=Math.max(2,template.width/600);ctx.setLineDash([8,6]);ctx.strokeRect(r.x,r.y,r.width,r.height);ctx.restore();}
 }
}
