import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {safeChild} from './core.mjs';
import {bannerMasterSnapshot} from './community-banner-session.mjs';
import {planLayeredCommunityTarget,layeredReflowVersion,communityMasterLogoAssetName} from './community-target-reflow.mjs';
import {communityTargetCompositionAsset,communityArtworkTargetPending} from '../public/community-artwork-state.js';
import {syncCommunityObjectLayers} from '../public/community-object-layers.js';
import {popupConfig} from '../public/community-popup-model.js';

export const sceneDigest=buffer=>createHash('sha256').update(buffer).digest('hex');
const same=(a,b)=>JSON.stringify(a??null)===JSON.stringify(b??null),clone=v=>structuredClone(v),kinds=['character','character2','foreground','title','subtitle','logo','ip-copyright','subtitle-backing'];
const valid=r=>r&&['x','y','width','height'].every(k=>Number.isFinite(r[k]))&&r.width>0&&r.height>0;
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
export function rememberCommunityTargetRevision(task,template,{fingerprint,sceneHash,masterSnapshot,plan}){
 const p=task.parameters,backgroundName=p.assetByTemplate?.[template.id]?.background;
 (p.communityTargetRevisions||={})[template.id]={version:1,masterFingerprint:fingerprint,sceneHash,backgroundName,masterSnapshot:clone(masterSnapshot),plan:clone(plan),syncedAt:new Date().toISOString()};
}
function stash(task,id){
 (task.communityTargetVersions||=[]).push({templateId:id,at:new Date().toISOString(),label:'同步母版前',snapshot:Object.fromEntries(['assetByTemplate','layoutByTemplate','backgroundByTemplate','communityArtworkByTemplate','communityTargetRevisions','communityObjectLayersByTemplate'].map(k=>[k,clone(task.parameters[k]?.[id]??null)]))});
}
function legacyMissingLogo(task,master,target,asset){
 const p=task.parameters,revision=p.communityTargetRevisions?.[target.id],bindings=p.assetByTemplate?.[target.id],layout=p.layoutByTemplate?.[target.id]?.logo;
 // Repair only the proven old planner omission, never a hidden/removed Logo
 // or a target whose original plan already selected an actual Logo material.
 if(target.brandLogo!==true||!revision||revision.backgroundName!==asset.name||revision.plan?.version!==layeredReflowVersion||revision.plan.assets?.logo!==null||Object.hasOwn(revision.masterSnapshot?.assets||{},'logo')||Object.hasOwn(p.assetByTemplate?.[master.id]||{},'logo')||bindings?.logo!==null||!valid(layout)||layout.visible===false||revision.masterSnapshot?.layout?.logo?.visible===false||p.layoutByTemplate?.[master.id]?.logo?.visible===false)return null;
 return communityMasterLogoAssetName(task,master);
}
function mapLayer(current,old,next,asset,target,master){
 if(!valid(current)||!valid(old)||!valid(next))return clone(next||{visible:false});
 const result=clone(current),geometry=['x','y','width','height'];
 if(geometry.some(k=>Math.abs(next[k]-old[k])>.001)){
  const sx=next.width/old.width,sy=next.height/old.height,dx=(next.x+next.width/2-old.x-old.width/2)*target.width/master.width,dy=(next.y+next.height/2-old.y-old.height/2)*target.height/master.height;
  const cx=current.x+current.width/2+dx,cy=current.y+current.height/2+dy;
  result.width=current.width*sx;result.height=current.height*sy;
  if(asset?.width&&asset?.height){const factor=Math.min(result.width/asset.width,result.height/asset.height);result.width=asset.width*factor;result.height=asset.height*factor;}
  const fit=Math.min(1,target.width/result.width,target.height/result.height);result.width*=fit;result.height*=fit;result.x=clamp(cx-result.width/2,0,target.width-result.width);result.y=clamp(cy-result.height/2,0,target.height-result.height);
  result.scaleBaseWidth=result.width;result.scaleBaseHeight=result.height;
 }
 for(const key of new Set([...Object.keys(old),...Object.keys(next)]))if(![...geometry,'scaleBaseWidth','scaleBaseHeight','effects'].includes(key)&&!same(old[key],next[key])){if(next[key]===undefined)delete result[key];else result[key]=clone(next[key]);}
 if(!same(old.effects,next.effects)){
  result.effects=clone(next.effects||{});const scale=result.width/next.width;
  if(result.effects.stroke?.width)result.effects.stroke.width*=scale;
  for(const k of ['blur','offsetX','offsetY'])if(Number.isFinite(result.effects.shadow?.[k]))result.effects.shadow[k]*=scale;
 }
 return result;
}

// Old releases stored the source only inside durable provider requests. Prove
// that exact input matches today's scene before reusing any expensive artwork.
export async function recoverLegacySceneProof(task,storageDir,sceneHash){
 const candidates=(task.assets||[]).filter(a=>a.extensionMode===layeredReflowVersion&&a.sourceJobId&&a.sourceMasterFingerprint),jobIds=new Map(candidates.map(a=>[String(a.sourceJobId),a.sourceMasterFingerprint])),proven=new Set();
 if(!jobIds.size)return proven;
 const directory=safeChild(storageDir,task.id,'target-reflow');let entries;try{entries=await fs.readdir(directory,{withFileTypes:true});}catch(e){if(e.code==='ENOENT')return proven;throw e;}
 for(const entry of entries){if(!entry.isDirectory()||! /^[a-f0-9]{64}$/.test(entry.name))continue;
  try{const receipt=JSON.parse(await fs.readFile(safeChild(directory,entry.name,'receipt.json'),'utf8')),fp=jobIds.get(String(receipt.providerJobId));if(!fp||proven.has(fp))continue;const request=JSON.parse(await fs.readFile(safeChild(directory,entry.name,'request.json'),'utf8'));if(sceneDigest(Buffer.from(request.images?.[0]?.data_base64||'','base64'))===sceneHash)proven.add(fp);}catch(e){if(e.code!=='ENOENT'&&!(e instanceof SyntaxError))throw e;}
 }
 return proven;
}

export async function synchronizeCommunityTargets(task,{templates,master,fingerprint,sceneHash,storageDir,legacyProof}){
 for(const name of new Set([...Object.values(task.parameters.assetByTemplate?.[master.id]||{}),communityMasterLogoAssetName(task,master)])){
  const asset=task.assets.find(a=>a.name===name);if(!asset?.mime?.startsWith('image/')||asset.width&&asset.height)continue;
  const metadata=await sharp(safeChild(storageDir,task.id,asset.bucket||'assets',asset.name)).metadata();asset.width=metadata.width;asset.height=metadata.height;
 }
 const p=task.parameters,snapshot=bannerMasterSnapshot(task),proof=legacyProof||await recoverLegacySceneProof(task,storageDir,sceneHash),updated=[],retained=[],pending=[];
 for(const target of templates){if(target.id===master.id||!target.communityPlacement)continue;
  if(popupConfig(task,target)){(communityArtworkTargetPending(task,target)?pending:retained).push(target.id);continue;}
  const asset=communityTargetCompositionAsset(task,target);if(!asset||asset.extensionMode!==layeredReflowVersion){pending.push(target.id);continue;}
  if(!communityArtworkTargetPending(task,target)){
   const logo=legacyMissingLogo(task,master,target,asset);
   if(logo){stash(task,target.id);p.assetByTemplate[target.id].logo=logo;p.communityTargetRevisions[target.id].plan.assets.logo=logo;p.communityTargetRevisions[target.id].syncedAt=new Date().toISOString();updated.push(target.id);}
   else retained.push(target.id);
   continue;
  }
  const revision=p.communityTargetRevisions?.[target.id],sameScene=revision?.backgroundName===asset.name&&revision.sceneHash===sceneHash||asset.sourceSceneHash===sceneHash||proof.has(asset.sourceMasterFingerprint);
  if(!sameScene){pending.push(target.id);continue;}
  const historical=[task.communityGeneration,...(task.communityTargetRuns||[])].filter(Boolean).find(r=>r.fingerprint===asset.sourceMasterFingerprint&&r.items?.some(i=>i.templateId===target.id&&i.assetName===asset.name));
  const previous=revision?.masterSnapshot,oldPlan=revision?.plan||historical?.items.find(i=>i.templateId===target.id)?.plan,nextPlan=planLayeredCommunityTarget(task,master,target);
  // Without any original overlay plan, the scene can still be retained but an
  // automatic composition update would risk overwriting intentional placement.
  if(!previous&&!oldPlan){pending.push(target.id);continue;}
  stash(task,target.id);const bindings=p.assetByTemplate[target.id],layouts=p.layoutByTemplate[target.id]||={};
  for(const kind of kinds){
   const before=previous?.layout?.[kind]||oldPlan?.layouts?.[kind],next=previous?snapshot.layout[kind]:nextPlan.layouts[kind],oldBinding=previous?.assets?.[kind]??oldPlan?.assets?.[kind]??null,newBinding=kind==='subtitle-backing'?null:nextPlan.assets[kind]||null;
   const changed=!same(before,next)||oldBinding!==newBinding||(kind==='title'&&previous?.copy!==undefined&&previous.copy!==snapshot.copy)||(kind==='subtitle'&&previous?.subtitleText!==undefined&&previous.subtitleText!==snapshot.subtitleText);
   if(!changed)continue;
   if(kind!=='subtitle-backing')bindings[kind]=newBinding;
   const selected=task.assets.find(a=>a.name===newBinding);
   // Use master-space deltas for future edits; legacy plans are already in
   // target space and therefore use a target-sized coordinate frame.
   layouts[kind]=mapLayer(layouts[kind],before,next,selected,target,previous?master:target);
   if(next?.visible===false||!newBinding&&!['title','subtitle','subtitle-backing'].includes(kind))layouts[kind].visible=false;
   if(kind==='subtitle-backing'&&!next?.backing?.enabled)delete layouts[kind];
  }
  // Background asset, focus, zoom and every unchanged manual overlay are kept.
  if(previous?.objectLayers||snapshot.objectLayers||p.communityObjectLayersByTemplate?.[target.id]) (p.communityObjectLayersByTemplate||={})[target.id]=syncCommunityObjectLayers(p.communityObjectLayersByTemplate?.[target.id]||[],previous?.objectLayers||[],snapshot.objectLayers||[]);
  rememberCommunityTargetRevision(task,target,{fingerprint,sceneHash,masterSnapshot:snapshot,plan:nextPlan});updated.push(target.id);
 }
 if(updated.length||task.communityTargetSync?.fingerprint!==fingerprint||!same(task.communityTargetSync?.pending,pending))task.communityTargetSync={fingerprint,updated,retained,pending,at:new Date().toISOString(),method:'local-layer-sync-v1'};
 return {updated,retained,pending};
}
