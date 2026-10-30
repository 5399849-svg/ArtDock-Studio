const image=asset=>asset?.mime?.startsWith('image/')&&!asset.libraryDeletedAt;
export const rewardId=name=>'reward:'+name;
export const defaultRewardStyle=()=>({kind:'bubble',styleId:'',scale:1,opacity:.85,contentScale:.72});
export function communityRewardGroups(task){
 const saved=task.communityObjects?.rewards;
 if(Array.isArray(saved))return saved;
 return (task.assets||[]).filter(a=>image(a)&&a.role==='reward').map(a=>({id:rewardId(a.name),name:a.name.replace(/\.[^.]+$/,''),sourceName:a.name,style:defaultRewardStyle()}));
}
export const communityCharacterGroups=task=>task.communityObjects?.characters||[];
export const communityObjectBusy=task=>task.communityObjectJob?.status==='running';
export const communityObjectRevision=task=>task.communityObjects?.revision||0;
export const currentCommunityObjectSource=task=>task.parameters?.assetByTemplate?.[task.masterTemplateId]?.background||'';
export function normalizedRewardStyle(value={},styles=[]){
 const number=(key,min,max,fallback)=>Number.isFinite(Number(value[key]))?Math.max(min,Math.min(max,Number(value[key]))):fallback;
 const kind=['none','bubble','backing'].includes(value.kind)?value.kind:'bubble',styleId=typeof value.styleId==='string'?value.styleId:'';
 if(kind==='backing'&&!styles.some(s=>s.id===styleId))throw Error('请先选择或生成一套底板样式');
 return {kind,styleId:kind==='backing'?styleId:'',scale:number('scale',.6,1.1,1),opacity:number('opacity',.1,1,.85),contentScale:number('contentScale',.3,.9,.72)};
}
export function communityObjectImageUrl(task,reward,{part='combo',thumbnail=false,style,candidate=false}={}){
 const params=new URLSearchParams({rewardId:reward.id,part,v:String(communityObjectRevision(task))});
 if(thumbnail)params.set('thumbnail','1');if(style)params.set('style',JSON.stringify(style));if(candidate)params.set('candidate','1');
 return `/api/tasks/${encodeURIComponent(task.id)}/community-objects/image?${params}`;
}
