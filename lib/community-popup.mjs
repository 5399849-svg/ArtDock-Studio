import fs from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {mutateJson} from './json-store.mjs';
import {safeChild} from './core.mjs';
import {COMMUNITY_POPUP_ID,popupConfig,popupSnapshotKeys,popupNativeCopy,normalizePopupConfig,fitPopupLayer,popupLayerBox,assertPopupPixels} from '../public/community-popup-model.js';
import {remapCommunitySubtitleBacking} from '../public/community-auto-layout.js';
import {communityObjectLayerRect} from '../public/community-object-layers.js';
const fail=(text,status=422)=>{throw Object.assign(Error(text),{status});},clone=v=>structuredClone(v);
const layerKinds=['background','character','character2','foreground','title','subtitle','logo','ip-copyright','button'];
export function assertPopupParameterSave(task,input){
 if(!input.parameters)return;
 if(['communityPopupByTemplate','communityPopupNativeByTemplate'].some(k=>JSON.stringify(input.parameters[k]||{})!==JSON.stringify(task.parameters?.[k]||{})))fail('弹窗方案已更新，请刷新后使用透明弹窗面板保存',409);
 if(task.parameters?.communityPopupByTemplate?.[COMMUNITY_POPUP_ID]&&input.expectedUpdatedAt!==task.updatedAt)fail('弹窗画面已更新，请刷新后继续调整',409);
}
export async function assertPopupPng(buffer){const m=await sharp(buffer,{limitInputPixels:40000000}).metadata();if(m.format!=='png'||!m.hasAlpha)fail('请选择带透明区域的 PNG，棋盘格截图不能用作透明素材');const {data}=await sharp(buffer).ensureAlpha().raw().toBuffer({resolveWithObject:true});try{assertPopupPixels(data);}catch(e){fail(e.message);}return m;}
export function rememberCommunityPopupVersion(task,label){
 const id=COMMUNITY_POPUP_ID,p=task.parameters;
 (task.communityPopupVersions||=[]).push({id:randomUUID(),templateId:id,at:new Date().toISOString(),label,snapshot:{...Object.fromEntries(popupSnapshotKeys.map(k=>[k,clone(p[k]?.[id]??null)])),communityPopupNativeByTemplate:clone(p.communityPopupNativeByTemplate?.[id]||popupNativeCopy(task))},review:clone(task.communityTargetReviews?.[id]||null),artifacts:clone(task.artifacts||[]),pagePreviews:clone(task.pagePreviews||[]),taskVersion:task.version});
}
const stash=rememberCommunityPopupVersion;
export function createCommunityPopup({tasksFile,storageDir,templateMap,jobs=new Map(),invalidate=()=>{},reconcile=()=>{},readFonts=async()=>({fonts:[]})}){
 return (id,input)=>mutateJson(tasksFile,async tasks=>{
  const task=tasks.find(t=>t.id===id);if(!task)fail('任务不存在',404);
  if(!task.targetTemplateIds?.includes(COMMUNITY_POPUP_ID))fail('当前任务没有社区弹窗尺寸');
  if(task.status==='已完成'&&task.deliveredPackage)fail('请先开始新版本再制作弹窗',409);
  if(jobs.has(id)||task.communityGeneration?.status==='running'||task.communityObjectJob?.status==='running'||task.outpaint?.status==='running')fail('请等待当前生成完成后再修改弹窗',409);
  if(input.expectedUpdatedAt!==task.updatedAt)fail('任务已更新，请刷新后继续',409);
  const p=task.parameters||={},template=templateMap.get(COMMUNITY_POPUP_ID),active=popupConfig(task,template);
  if(input.action==='upload'){
   if(!['background','character','character2','foreground','button'].includes(input.role))fail('素材分类无效');
   const match=/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(input.dataUrl||'');if(!match)fail('请选择 PNG、JPG 或 WebP 图片');
   const buffer=Buffer.from(match[2],'base64');if(buffer.length>25*1048576)fail('单张素材请小于 25 MB');
   const meta=await sharp(buffer,{limitInputPixels:40000000}).metadata();
   if(!['background','button'].includes(input.role)||input.transparent===true)await assertPopupPng(buffer);
   if(input.role==='button'&&meta.format!=='png')fail('按钮底板请使用 PNG');
   const name=`弹窗-${input.role}-${randomUUID()}.${meta.format==='jpeg'?'jpg':meta.format}`,directory=safeChild(storageDir,id,'assets');await fs.mkdir(directory,{recursive:true});await fs.writeFile(safeChild(directory,name),buffer);
   task.assets.push({name,label:String(input.name||name).slice(0,150),role:input.role==='character2'?'character':input.role,mime:`image/${meta.format}`,width:meta.width,height:meta.height,bytes:buffer.length,createdAt:new Date().toISOString(),url:`/storage/${id}/assets/${encodeURIComponent(name)}`,popupUpload:true});
   task.updatedAt=new Date().toISOString();return task;
  }
  if(input.action==='restore'){
   const previous=task.communityPopupVersions?.find(v=>v.id===input.versionId);if(!previous)fail('历史弹窗方案不存在',404);
   const snapshot=clone(previous.snapshot);stash(task,'恢复方案前');
   for(const key of popupSnapshotKeys){p[key]||={};if(snapshot[key]===null||snapshot[key]===undefined)delete p[key][template.id];else p[key][template.id]=snapshot[key];}
   if(task.communityTargetReviews)delete task.communityTargetReviews[template.id];
   invalidate(task,'恢复弹窗历史方案');reconcile(task);task.updatedAt=new Date().toISOString();(task.history||=[]).push({at:task.updatedAt,action:'恢复社区弹窗方案，保留全部历史版本',by:'设计师',status:task.status});return task;
  }
  if(!['apply','reflow'].includes(input.action))fail('弹窗操作无效');
  let config;try{config=normalizePopupConfig(input.config);}catch(e){fail(e.message);}
  if(config.buttonFontId&&!(await readFonts()).fonts.some(f=>f.id===config.buttonFontId))fail('按钮字体不在公司版权字体库中，请重新选择');
  const sourceId=active?template.id:task.masterTemplateId;
  const source=clone(p.layoutByTemplate?.[sourceId]||{}),bindings=clone(p.assetByTemplate?.[sourceId]||{}),originalBindings=clone(bindings),requested=input.bindings||{};
  for(const kind of layerKinds){if(Object.hasOwn(requested,kind))bindings[kind]=requested[kind]||null;}
  if(config.buttonBackingAsset)bindings.button=config.buttonBackingAsset;
  else if(active?.buttonBackingAsset)bindings.button=null;
  const get=async(name,alpha=false)=>{
   if(!name)return null;const asset=task.assets.find(a=>a.name===name&&!a.libraryDeletedAt);if(!asset?.mime?.startsWith('image/'))fail('所选素材不属于当前任务');
   const buffer=await fs.readFile(safeChild(storageDir,id,asset.bucket||'assets',name));
   const meta=alpha?await assertPopupPng(buffer):await sharp(buffer,{limitInputPixels:40000000}).metadata();
   const result={...asset,width:meta.width,height:meta.height};
   if(alpha){const trimmed=await sharp(buffer).trim({background:'#00000000',threshold:5}).toBuffer({resolveWithObject:true});result.alphaBounds={x:-trimmed.info.trimOffsetLeft||0,y:-trimmed.info.trimOffsetTop||0,width:trimmed.info.width,height:trimmed.info.height};}
   return result;
  };
  if(config.shape!=='none'&&!bindings.background)fail('请选择背景图片，或使用无背景模式');
  // A flattened artwork contains its own text/figures; applying independent overlays would duplicate them.
  if(config.shape!=='none'&&Object.values(p.communityArtworkByTemplate||{}).some(a=>a.assetName===bindings.background))fail('当前是合成整稿，请选择无文字背景或上传透明底板后制作弹窗');
  const assets={};for(const kind of layerKinds)if(bindings[kind])assets[kind]=await get(bindings[kind],['character','character2'].includes(kind)||kind==='background'&&config.shape==='asset');
  const character=assets.character;
  if(config.shape!=='none'&&character?.sourceAssetName===bindings.background){
   const paired=(task.localAi?.outputs||[]).find(a=>a.kind==='repaired-background'&&a.sourceAssetName===bindings.background&&task.assets.some(b=>b.name===a.name));
   if(!paired)fail('这张背景里仍有原人物，请换用无人物底图或选择无背景，避免移动后出现双重人物');
   bindings.background=paired.name;assets.background=await get(paired.name);
  }
  const layouts=clone(p.layoutByTemplate?.[template.id]||{}),reflow=!active||input.action==='reflow';
  for(const kind of layerKinds.filter(k=>k!=='background')){
   if(reflow||bindings[kind]!==p.assetByTemplate?.[template.id]?.[kind]||!layouts[kind])layouts[kind]=fitPopupLayer(kind,assets[kind],{...source[kind],...(assets[kind]&&bindings[kind]!==originalBindings[kind]?{visible:true}:{})});
   if(!bindings[kind]&&!['title','subtitle','ip-copyright','button'].includes(kind))layouts[kind].visible=false;
  }
  if(!bindings.button&&reflow)layouts.button=popupLayerBox('button');
  if(reflow)for(const kind of ['title','subtitle'])if(!bindings[kind]){layouts[kind].align='center';layouts[kind].verticalAlign='middle';}
  layouts.button.visible=config.buttonVisible;
  if(reflow&&source['subtitle-backing']?.backing?.enabled){const backing=remapCommunitySubtitleBacking(templateMap.get(sourceId),template,source.subtitle,layouts.subtitle,source['subtitle-backing']);if(backing)layouts['subtitle-backing']=backing;}
  const objectLayers=clone(p.communityObjectLayersByTemplate?.[sourceId]||[]).filter(l=>l.appearance.kind!=='character'||![bindings.character,bindings.character2].includes(l.appearance.assetName));
  for(const layer of objectLayers.filter(l=>l.appearance.kind==='character'))await get(layer.appearance.assetName,true);
  if(reflow)for(const kind of ['character','reward']){
   const group=objectLayers.filter(l=>l.appearance.kind===kind);if(!group.length)continue;
   const sourceTemplate=templateMap.get(sourceId),rects=group.map(l=>communityObjectLayerRect(l,sourceTemplate)),b=popupLayerBox(kind==='character'?'character':'foreground');
   const left=Math.min(...rects.map(r=>r.x)),top=Math.min(...rects.map(r=>r.y)),right=Math.max(...rects.map(r=>r.x+r.width)),bottom=Math.max(...rects.map(r=>r.y+r.height)),scale=Math.min(b.width/(right-left),b.height/(bottom-top));
   group.forEach((layer,i)=>{const r=rects[i];layer.x=(b.x+(b.width-(right-left)*scale)/2+(r.x-left+r.width/2)*scale)/500;layer.y=(b.y+(b.height-(bottom-top)*scale)/2+(r.y-top+r.height/2)*scale)/650;layer.size=Math.max(.05,Math.min(kind==='character'?3:1,Math.max(r.width,r.height)*scale/500));});
  }
  config.masterFingerprint=task.communityMasterApproval?.fingerprint||'';
  const oldBackground=p.assetByTemplate?.[template.id]?.background;
  stash(task,active?'调整透明弹窗前':'制作透明弹窗前');
  (p.communityPopupByTemplate||={})[template.id]=config;
  if(!active||reflow||active.masterFingerprint!==config.masterFingerprint)(p.communityPopupNativeByTemplate||={})[template.id]=popupNativeCopy(task);
  (p.assetByTemplate||={})[template.id]=bindings;(p.layoutByTemplate||={})[template.id]=layouts;
  (p.communityObjectLayersByTemplate||={})[template.id]=objectLayers;
  if(p.communityArtworkByTemplate)delete p.communityArtworkByTemplate[template.id];
  if(p.communityTargetRevisions)delete p.communityTargetRevisions[template.id];
  if(task.communityTargetReviews)delete task.communityTargetReviews[template.id];
  if(!active||bindings.background!==oldBackground)(p.backgroundByTemplate||={})[template.id]={focalX:50,focalY:50,scale:100,url:'',smartExpand:false};
  invalidate(task,'保存透明弹窗方案');if(task.status==='主图制作'&&task.communityMasterApproval?.at)task.status='批量生成';reconcile(task);task.updatedAt=new Date().toISOString();(task.history||=[]).push({at:task.updatedAt,action:'保存社区 500×650 透明弹窗，原方案已保留',by:'设计师',status:task.status});return task;
 });
}
