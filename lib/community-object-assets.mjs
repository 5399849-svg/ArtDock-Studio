import fs from 'node:fs/promises';
import sharp from 'sharp';
import {createHash,randomUUID} from 'node:crypto';
import {safeChild} from './core.mjs';
import {renderCommunityArtworkEditSource} from './community-master-workspace.mjs';
import {communityRewardGroups,defaultRewardStyle,normalizedRewardStyle,currentCommunityObjectSource} from '../public/community-object-state.js';

export const objectFail=(message,status=422)=>Object.assign(Error(message),{status});
export const objectHash=value=>createHash('sha256').update(value).digest('hex');
export function communityCurrentSource(task){
 const name=currentCommunityObjectSource(task),source=task.assets.find(a=>a.name===name&&a.mime?.startsWith('image/')&&!a.libraryDeletedAt);
 if(!source)throw objectFail('请先生成并选用当前插画');
 const placement=structuredClone(task.parameters?.backgroundByTemplate?.[task.masterTemplateId]||{});
 if(placement.url)throw objectFail('请先选用一份插画素材，再从当前生成稿提取');
 return {name:source.name,bucket:source.bucket||'assets',placement,token:objectHash(JSON.stringify([task.masterTemplateId,source.name,placement]))};
}
export async function readCommunityCurrentSource({storageDir,task,source=communityCurrentSource(task),template}){
 return renderCommunityArtworkEditSource(await fs.readFile(safeChild(storageDir,task.id,source.bucket,source.name)),template,source.placement);
}
export const readCommunityObjectAsset=async(storageDir,task,name)=>{
 const asset=task.assets.find(a=>a.name===name&&a.mime?.startsWith('image/')&&!a.libraryDeletedAt);if(!asset)throw objectFail('素材不存在或已移除');
 return fs.readFile(safeChild(storageDir,task.id,asset.bucket||'assets',asset.name));
};
export function ensureCommunityObjects(task){
 const defaults=communityRewardGroups(task);
 const state=task.communityObjects||={schemaVersion:1,revision:0,rewards:defaults,characters:[],styles:[]};
 state.rewards||=defaults;state.characters||=[];state.styles||=[];return state;
}
export function assertCommunityObjectEdit(task,input,{templateMap,jobs,revision=true}={}){
 if(!task)throw objectFail('任务不存在',404);
 if(!templateMap.get(task.masterTemplateId)?.communityMaster)throw objectFail('请在社区外媒母版制作页面使用此功能');
 if(task.status==='已完成'&&task.deliveredPackage)throw objectFail('请先开始新版本再调整素材',409);
 if(jobs.has(task.id)||task.communityGeneration?.status==='running'||task.outpaint?.status==='running'||task.communityObjectJob?.status==='running')throw objectFail('请等待当前任务处理完成',409);
 if(revision&&input.expectedRevision!==(task.communityObjects?.revision||0))throw objectFail('素材设置已更新，请刷新后再操作',409);
}
export function touchCommunityObjects(task){const state=ensureCommunityObjects(task);state.revision++;task.updatedAt=new Date().toISOString();}
export function addCommunityRewards(task,names){
 if(!Array.isArray(names)||!names.length||names.length>100)throw objectFail('请选择要加入的道具图片');
 const assets=names.map(name=>task.assets.find(a=>a.name===name&&a.mime?.startsWith('image/')&&!a.libraryDeletedAt));if(assets.some(a=>!a))throw objectFail('选中的道具不属于当前任务');
 const state=ensureCommunityObjects(task);if(new Set([...state.rewards.map(r=>r.sourceName),...names]).size>100)throw objectFail('一个任务最多管理 100 个奖励道具');
 for(const asset of assets)if(!state.rewards.some(r=>r.sourceName===asset.name))state.rewards.push({id:rewardIdFor(asset.name),name:asset.name.replace(/\.[^.]+$/,''),sourceName:asset.name,style:defaultRewardStyle()});
 touchCommunityObjects(task);return task;
}
const rewardIdFor=name=>'reward:'+name;

// Remove only a uniform, edge-connected white matte. Interior white artwork is
// retained. Complex backgrounds require the explicit, source-pixel cutout tool.
export async function transparentRewardPng(buffer){
 const decoded=await sharp(buffer,{limitInputPixels:40000000}).toColourspace('srgb').ensureAlpha().raw().toBuffer({resolveWithObject:true}),{data,info}=decoded,w=info.width,h=info.height;
 let empty=0;for(let i=3;i<data.length;i+=4)if(data[i]<16)empty++;
 if(empty<w*h*.01){
  const seen=new Uint8Array(w*h),queue=new Int32Array(w*h);let head=0,tail=0;
  const white=index=>{const p=index*4;return Math.min(data[p],data[p+1],data[p+2])>224&&Math.max(data[p],data[p+1],data[p+2])-Math.min(data[p],data[p+1],data[p+2])<15;};
  const push=index=>{if(!seen[index]&&white(index)){seen[index]=1;queue[tail++]=index;}};
  for(let x=0;x<w;x++){push(x);push((h-1)*w+x);}for(let y=0;y<h;y++){push(y*w);push(y*w+w-1);}
  while(head<tail){const i=queue[head++],x=i%w,y=Math.floor(i/w);data[i*4+3]=0;if(x)push(i-1);if(x<w-1)push(i+1);if(y)push(i-w);if(y<h-1)push(i+w);}
  if(tail<w*h*.01||tail>w*h*.995)throw objectFail('道具缺少可用透明背景，请先使用“抠出道具”');
 }
 let ink=0;for(let i=3;i<data.length;i+=4)if(data[i]>32)ink++;
 if(!ink)throw objectFail('道具没有可见内容');
 return sharp(data,{raw:info}).trim({background:'#00000000',threshold:5}).png().toBuffer();
}
export function bubbleSvg(size=1024,opacity=.85){
 const s=size,svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 1024 1024"><defs><radialGradient id="film"><stop offset=".6" stop-color="#fff" stop-opacity=".01"/><stop offset=".9" stop-color="#d9ecff" stop-opacity=".12"/><stop offset="1" stop-color="#fff" stop-opacity=".5"/></radialGradient><linearGradient id="rim" x2="1" y2="1"><stop stop-color="#fff"/><stop offset=".28" stop-color="#f5b7ea"/><stop offset=".54" stop-color="#fff8d4"/><stop offset=".76" stop-color="#a0ede6"/><stop offset="1" stop-color="#fff"/></linearGradient></defs><g opacity="${opacity}"><circle cx="512" cy="512" r="453" fill="url(#film)" stroke="url(#rim)" stroke-width="12"/><circle cx="512" cy="512" r="437" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="3"/><path d="M180 345 Q248 170 424 137" fill="none" stroke="#fff" stroke-width="25" stroke-linecap="round"/><path d="M661 870 Q791 823 856 690" fill="none" stroke="#fff" stroke-opacity=".8" stroke-width="13" stroke-linecap="round"/><ellipse cx="284" cy="218" rx="43" ry="20" fill="#fff" transform="rotate(-32 284 218)"/></g></svg>`;
 return Buffer.from(svg);
}
export async function renderCommunityReward({storageDir,task,reward,part='combo',style:override,candidate=false,thumbnail=false}){
 const state=task.communityObjects||{},styles=[...(state.styles||[])];
 if(candidate&&state.styleCandidate){const base=styles.find(s=>s.id===state.styleCandidate.baseStyle?.styleId);styles.push({...base,...state.styleCandidate,id:'candidate'});}
 const style=normalizedRewardStyle(override||reward.style,styles),body=await transparentRewardPng(await readCommunityObjectAsset(storageDir,task,reward.bodyName||reward.sourceName));
 if(part==='body')return thumbnail?sharp(body).resize(220,180,{fit:'inside',withoutEnlargement:true}).png().toBuffer():body;
 const size=thumbnail?240:1024,layers=[],plate=styles.find(s=>s.id===style.styleId),styleSize=Math.round(size*Math.min(.98,.88*style.scale)),offset=Math.floor((size-styleSize)/2);
 const fitLayer=async name=>sharp(await readCommunityObjectAsset(storageDir,task,name)).resize(styleSize,styleSize,{fit:'contain',background:'#00000000'}).ensureAlpha().linear([1,1,1,style.opacity],[0,0,0,0]).png().toBuffer();
 if(style.kind==='bubble')layers.push({input:await sharp(bubbleSvg(styleSize,style.opacity)).png().toBuffer(),left:offset,top:offset});
 if(style.kind==='backing'&&plate?.backingName)layers.push({input:await fitLayer(plate.backingName),left:offset,top:offset});
 if(part!=='decoration'){
  const pixels=Math.max(1,Math.round(size*style.contentScale)),item=await sharp(body).resize(pixels,pixels,{fit:'inside'}).png().toBuffer({resolveWithObject:true});
  layers.push({input:item.data,left:Math.floor((size-item.info.width)/2),top:Math.floor((size-item.info.height)/2)});
 }
 if(style.kind==='backing'&&plate?.foregroundName)layers.push({input:await fitLayer(plate.foregroundName),left:offset,top:offset});
 return sharp({create:{width:size,height:size,channels:4,background:'#00000000'}}).composite(layers).png().toBuffer();
}
export async function publishCommunityObjectPng({storageDir,task,buffer,name,role,extra={}}){
 const meta=await sharp(buffer).metadata(),dir=safeChild(storageDir,task.id,'assets');await fs.mkdir(dir,{recursive:true});await fs.writeFile(safeChild(dir,name),buffer);
 return {name,role,mime:'image/png',width:meta.width,height:meta.height,bytes:buffer.length,url:`/storage/${task.id}/assets/${encodeURIComponent(name)}`,transparent:true,createdAt:new Date().toISOString(),...extra};
}
const safeName=name=>String(name||'素材').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').replace(/\.+$/,'').slice(0,80)||'素材';
export async function communityObjectDownloadFiles({storageDir,task}){
 const files=[];
 for(const [index,reward]of communityRewardGroups(task).entries()){
  const dir=`奖励道具/${String(index+1).padStart(2,'0')}_${safeName(reward.name)}`;
  files.push({name:dir+'/道具.png',data:await renderCommunityReward({storageDir,task,reward,part:'body'})});
  if(reward.style?.kind!=='none')files.push({name:dir+'/组合.png',data:await renderCommunityReward({storageDir,task,reward})});
 }
 for(const [index,character]of (task.communityObjects?.characters||[]).entries())files.push({name:`人物/${String(index+1).padStart(2,'0')}_当前稿人物.png`,data:await readCommunityObjectAsset(storageDir,task,character.assetName)});
 const used=new Set(communityRewardGroups(task).filter(r=>r.style?.kind==='backing').map(r=>r.style.styleId));
 for(const style of task.communityObjects?.styles||[])if(used.has(style.id))for(const [key,label]of [['backingName','底板'],['foregroundName','前景装饰']])if(style[key])files.push({name:`共用装饰/${safeName(style.name)}_${style.id.slice(0,8)}_${label}.png`,data:await readCommunityObjectAsset(storageDir,task,style[key])});
 if(communityRewardGroups(task).some(r=>r.style?.kind==='bubble'))files.push({name:'共用装饰/通用气泡.png',data:await sharp(bubbleSvg()).png().toBuffer()});
 return files;
}
