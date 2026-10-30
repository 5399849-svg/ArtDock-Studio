import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import sharp from 'sharp';
import {safeChild} from './core.mjs';
import {mutateJson} from './json-store.mjs';
import {receiveAdAssetUpload} from './ad-asset-upload.mjs';
import {prepareSourceReflow} from './source-reflow.mjs';
import {isSourceAdaptation,sourceMasterTemplate,sourceComposition,planSourceComposition,validateSourceComposition} from '../public/source-adaptation-model.js';
import {localPython} from '../platform/local-compute.mjs';
const exec=promisify(execFile),fail=(message,status=422)=>{throw Object.assign(Error(message),{status});};
export async function sourceFileHash(file){const hash=createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);return hash.digest('hex');}
export function registerSourceMaster(task,templates){const template=sourceMasterTemplate(task);if(template)templates.set(template.id,template);return template;}
export const sourceFingerprint=task=>createHash('sha256').update(JSON.stringify([task.sourceAdaptation?.sourceHash,task.sourceAdaptation?.layers,sourceComposition(task,task.masterTemplateId),...(task.sourceAdaptation?.reflow?[task.sourceAdaptation.reflow]:[])])).digest('hex');
const snapshotKeys=['sourceAdaptation','parameters','masterTemplateId','masterCanvasId','primaryAssetName','communityMasterApproval','communityGeneration','communityTargetReviews','communityObjects','artifacts','pagePreviews','qc','version','status'];
export function rememberSourceVersion(task,label){(task.sourceAdaptationVersions||=[]).push({id:randomUUID(),at:new Date().toISOString(),label,snapshot:Object.fromEntries(snapshotKeys.map(k=>[k,structuredClone(task[k]??null)]))});}
const stash=rememberSourceVersion;
function editable(task,input,jobs){
 if(!task)fail('任务不存在',404);
 if(!isSourceAdaptation(task))fail('请在尺寸适配或替换文案任务中使用源稿');
 if(task.status==='已完成'&&task.deliveredPackage)fail('请先开始新版本再修改源稿',409);
 if(jobs.has(task.id)||['communityGeneration','communityObjectJob','outpaint'].some(k=>task[k]?.status==='running'))fail('请等待当前任务处理完成',409);
 if(input.expectedUpdatedAt!==task.updatedAt)fail('任务已更新，请刷新后再操作',409);
}
export function assertSourceParameterSave(task,input){
 if(!task.sourceAdaptation)return;
 if(input.parameters&&JSON.stringify(input.parameters.sourceCompositionByTemplate||{})!==JSON.stringify(task.parameters?.sourceCompositionByTemplate||{}))fail('请在源稿适配面板保存图层',409);
 if(input.parameters&&input.expectedUpdatedAt!==task.updatedAt)fail('源稿已更新，请刷新后继续',409);
 if(('mode'in input&&input.mode!==task.mode)||('masterTemplateId'in input&&input.masterTemplateId!==task.masterTemplateId))fail('不能通过普通保存切换源稿流程');
}
export async function prepareSourceScene({root,storageDir,task,name,templateMap,invalidate=()=>{}}){
 const source=task.assets.find(a=>a.name===name&&!a.libraryDeletedAt);if(!source)fail('源文件不属于当前任务');
 if(!/\.ps[db]$/i.test(source.name)&&!/^image\/(png|jpeg|webp)$/.test(source.mime||''))fail('请选择 PSD、PSB 或完整原图');
 const sourcePath=safeChild(storageDir,task.id,source.bucket||'assets',source.name),sourceHash=await sourceFileHash(sourcePath);
 if(task.sourceAdaptation?.sourceHash===sourceHash){delete task.sourceImportError;return task;}
 const directory=safeChild(storageDir,task.id,'assets'),temporary=await fs.mkdtemp(safeChild(storageDir,task.id,'source-scene-'));
 try{
  let manifest;
  if(/\.ps[db]$/i.test(source.name)){
   const {stdout}=await localPython([path.join(root,'scripts','export-source-scene.py'),'--source',sourcePath,'--output',temporary],{cwd:root,windowsHide:true,timeout:180000,maxBuffer:4*1048576,env:{...process.env,PYTHONPATH:path.join(root,'local-ai','psd-deps'),PYTHONIOENCODING:'utf-8',OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'}});
   manifest=JSON.parse(stdout);
  }else{
   const buffer=await sharp(sourcePath,{limitInputPixels:64000000}).rotate().png().toBuffer(),m=await sharp(buffer).metadata();await fs.writeFile(path.join(temporary,'original.png'),buffer);
   manifest={width:m.width,height:m.height,preview:'original.png',layers:[{file:'original.png',label:'原稿完整组合',role:'source-group',x:0,y:0,width:m.width,height:m.height,visible:true}],fidelity:{reference:'source-image',verified:true},warnings:['这是完整图片，人物与文字保持原组合；不会自动拆解重画。']};
  }
  if(!manifest.layers.length||manifest.layers.length>200)fail('源稿视觉组数量无效');
  const prefix=`源稿-${sourceHash.slice(0,12)}-${randomUUID().slice(0,8)}`,added=[],names=new Map();
  await fs.mkdir(directory,{recursive:true});
  for(const file of new Set([manifest.preview,...manifest.layers.map(l=>l.file)])){
   const assetName=`${prefix}-${file}`,buffer=await fs.readFile(safeChild(temporary,file)),meta=await sharp(buffer).metadata();await fs.writeFile(safeChild(directory,assetName),buffer);names.set(file,assetName);
   added.push({name:assetName,role:file===manifest.preview?'source-preview':'source-visual-group',mime:'image/png',width:meta.width,height:meta.height,bytes:buffer.length,url:`/storage/${task.id}/assets/${encodeURIComponent(assetName)}`,sourceAssetName:source.name,sourceHash,createdAt:new Date().toISOString()});
  }
  stash(task,'导入原稿前（保留试稿及历史）');
  task.assets.push(...added);
  task.sourceAdaptation={version:1,sourceName:source.name,sourceHash,width:manifest.width,height:manifest.height,previewName:names.get(manifest.preview),fidelity:manifest.fidelity,warnings:manifest.warnings,layers:manifest.layers.map((l,i)=>({id:`source-layer-${i}`,assetName:names.get(l.file),label:l.label,role:l.role,x:l.x,y:l.y,width:l.width,height:l.height,visible:true}))};
  const template=registerSourceMaster(task,templateMap);task.masterTemplateId=template.id;task.masterCanvasId='source-original';task.primaryAssetName=task.sourceAdaptation.previewName;
  const p=task.parameters||={};(p.sourceCompositionByTemplate||={})[template.id]={fit:'contain',background:'transparent',layers:structuredClone(task.sourceAdaptation.layers)};
  // Existing generated trial files, original PSD and target drafts stay referenced in the snapshot.
  task.communityMasterApproval=null;task.communityGeneration=null;task.communityTargetReviews={};
  if(task.communityObjects?.rewards)task.communityObjects.rewards=task.communityObjects.rewards.filter(r=>{
   const a=task.assets.find(a=>a.name===r.sourceName);return !(a?.psdSourceHash&&a.role==='supplement'&&!r.bodyName&&!r.confirmedAsReward);
  });
  delete task.sourceImportError;invalidate(task,'按源文件原始尺寸还原，保留原试稿');task.status='主图制作';return task;
 }finally{
  // This exact mkdtemp directory is a disposable child of this task's storage.
  const resolved=path.resolve(temporary),parent=path.resolve(storageDir,task.id)+path.sep;
  if(resolved.startsWith(parent)&&path.basename(resolved).startsWith('source-scene-'))await fs.rm(resolved,{recursive:true,force:true});
 }
}
export function createSourceAdaptation({root,storageDir,tasksFile,templateMap,jobs=new Map(),invalidate=()=>{},segment,repairBackground,readFonts=async()=>({fonts:[]}),readProjectMaterial=async()=>fail('项目素材库暂不可用')}){
 const actionHandler=async(id,input)=>{
  if(input.action==='adapt'){
   const before=JSON.parse(await fs.readFile(tasksFile,'utf8')).find(t=>t.id===id);editable(before,input,jobs);
   const r=before.sourceAdaptation?.reflow;
   if(r?.backgroundRegion&&r.backgroundMode!=='full-scene'){
    if(!Array.isArray(input.templateIds)||!input.templateIds.length||input.templateIds.some(t=>!before.targetTemplateIds.includes(t)))fail('请选择本任务的目标尺寸');
    const fixed=await actionHandler(id,{action:'separate',selections:r.selections||[r.selection],expectedUpdatedAt:before.updatedAt});input={...input,expectedUpdatedAt:fixed.updatedAt};
   }
  }
  if(input.action==='separate'){
   const before=JSON.parse(await fs.readFile(tasksFile,'utf8')).find(t=>t.id===id);editable(before,input,jobs);
   jobs.set(id,`source-reflow:${id}`);let result,published=false;
   try{
    result=await prepareSourceReflow({root,storageDir,task:before,input,segment,repairBackground});
    const saved=await mutateJson(tasksFile,tasks=>{
     const task=tasks.find(t=>t.id===id);editable(task,input,new Map());stash(task,'分离原稿人物前');
     task.assets.push(...result.assets);task.sourceAdaptation.reflow=result.reflow;
     task.communityMasterApproval=null;task.communityTargetReviews={};invalidate(task,'分别分离原图人物并补全背景，保留旧尺寸稿');
     task.updatedAt=new Date().toISOString();(task.history||=[]).push({at:task.updatedAt,action:'原像素抠图；原稿和全部历史素材保留',by:'设计师',status:task.status});return task;
    });published=true;return saved;
   }finally{jobs.delete(id);if(result&&!published)for(const asset of result.assets)await fs.unlink(safeChild(storageDir,id,'assets',asset.name)).catch(()=>{});}
  }
  return mutateJson(tasksFile,async tasks=>{
  const task=tasks.find(t=>t.id===id);editable(task,input,jobs);let action='';
  if(input.action==='prepare'){await prepareSourceScene({root,storageDir,task,name:input.sourceName,templateMap,invalidate});action='按原稿还原源文件';}
  else if(input.action==='restore'){
   const version=task.sourceAdaptationVersions?.find(v=>v.id===input.versionId);if(!version)fail('历史版本不存在');
   const snapshot=structuredClone(version.snapshot),nextVersion=Math.max(task.version||1,snapshot.version||1)+1;stash(task,'恢复源稿历史前');for(const key of snapshotKeys)if(snapshot[key]===null)delete task[key];else task[key]=snapshot[key];task.version=nextVersion;registerSourceMaster(task,templateMap);action='恢复源稿历史，保留全部素材及其它历史';
  }else{
   if(!task.sourceAdaptation)fail('请先导入并核对源稿');
   const p=task.parameters,master=task.masterTemplateId;
   if(input.action==='add-material'){
    const roles=['foreground','character','secondary-character','title','subtitle','logo'];
    let role=input.role||'foreground';if(!roles.includes(role))fail('素材类型无效');
    if([Boolean(input.projectAssetId),Boolean(input.assetName),Boolean(input.dataUrl)].filter(Boolean).length!==1)fail('请上传图片或选择一个项目素材');
    if(task.sourceAdaptation.layers.length>=190)fail('当前源稿素材数量已达上限');
    const previousFingerprint=sourceFingerprint(task),masterComposition=sourceComposition(task,master);
    let asset,buffer,metadata;
    if(input.projectAssetId){
     const material=await readProjectMaterial(task,input.projectAssetId),source=material.asset;metadata=material.metadata;
     role=({logo:'logo',character:'character',text:source.role==='subtitle'?'subtitle':'title'})[source.category]||'foreground';
     asset=task.assets.find(a=>!a.libraryDeletedAt&&a.projectLibraryProjectId===task.projectId&&a.projectLibraryAssetId===source.id&&a.projectLibrarySha256===material.sha256);
     if(!asset){
      const extension=metadata.format==='jpeg'?'jpg':metadata.format,name=`项目素材-${randomUUID()}.${extension}`;buffer=material.buffer;
      asset={name,label:source.displayName,role:'source-visual-group',mime:`image/${metadata.format}`,width:metadata.width,height:metadata.height,bytes:buffer.length,url:`/storage/${id}/assets/${encodeURIComponent(name)}`,projectLibraryProjectId:task.projectId,projectLibraryAssetId:source.id,projectLibrarySourceUrl:source.url,projectLibrarySha256:material.sha256,createdAt:new Date().toISOString()};
     }
    }else if(input.assetName){
     asset=task.assets.find(a=>a.name===input.assetName&&!a.libraryDeletedAt&&/^image\/(png|jpeg|webp)$/.test(a.mime||''));
     if(!asset)fail('素材不属于当前任务或不是可用图片');
     metadata=await sharp(safeChild(storageDir,id,asset.bucket||'assets',asset.name),{limitInputPixels:16000000}).metadata();
    }else{
     const match=/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(input.dataUrl||'');
     if(!match||match[2].length>35*1048576)fail('请上传不超过 25 MB 的 PNG、JPG 或 WebP 素材');
     const bytes=Buffer.from(match[2],'base64');if(bytes.length>25*1048576)fail('素材不能超过 25 MB');
     buffer=await sharp(bytes,{limitInputPixels:16000000}).rotate().png().toBuffer();metadata=await sharp(buffer).metadata();
     const name=`新增素材-${randomUUID()}.png`;
     asset={name,label:String(input.name||'新增素材').slice(0,150),role:'source-visual-group',mime:'image/png',width:metadata.width,height:metadata.height,bytes:buffer.length,url:`/storage/${id}/assets/${encodeURIComponent(name)}`,createdAt:new Date().toISOString()};
    }
    const scale=Math.min(1,task.sourceAdaptation.width*.4/metadata.width,task.sourceAdaptation.height*.4/metadata.height),width=metadata.width*scale,height=metadata.height*scale;
    const definition={id:`source-added-${randomUUID()}`,assetName:asset.name,label:String(input.name||asset.label||asset.name).slice(0,150),role,width:metadata.width,height:metadata.height,x:0,y:0,visible:true,addedMaterial:true};
    if(buffer)await fs.writeFile(safeChild(storageDir,id,'assets',asset.name),buffer,{flag:'wx'});
    stash(task,'新增使用素材前');if(buffer)task.assets.push(asset);task.sourceAdaptation.layers.push(definition);
    masterComposition.layers.push({...definition,x:(task.sourceAdaptation.width-width)/2,y:(task.sourceAdaptation.height-height)/2,width,height});
    const fingerprint=sourceFingerprint(task);
    // Append only the new element; keep every existing target's manual layout intact.
    for(const tid of task.targetTemplateIds){const c=sourceComposition(task,tid),target=templateMap.get(tid);if(!c||!target)continue;
     let placement;
     try{placement=planSourceComposition(task,target).layers.find(l=>l.id===definition.id);}catch{}
     if(!placement){const s=Math.min(target.width*.4/metadata.width,target.height*.4/metadata.height,1);placement={...definition,x:(target.width-metadata.width*s)/2,y:(target.height-metadata.height*s)/2,width:metadata.width*s,height:metadata.height*s};}
     c.layers.push(placement);if(c.sourceFingerprint===previousFingerprint)c.sourceFingerprint=fingerprint;
    }
    task.communityMasterApproval={at:new Date().toISOString(),fingerprint};task.communityTargetReviews={};invalidate(task,'新增使用素材，保留现有排版');task.status='批量生成';action='新增使用素材，保留源文件、其它素材位置和历史';
   }else if(['scene-background','upload-button'].includes(input.action)){
    const scene=input.action==='scene-background',match=/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(input.dataUrl||'');
    if(!match||match[2].length>35*1048576)fail('请上传不超过 25 MB 的图片');
    const buffer=Buffer.from(match[2],'base64');if(buffer.length>25*1048576)fail('图片不能超过 25 MB');
    const meta=await sharp(buffer,{limitInputPixels:40000000}).metadata();
    if(!['png','jpeg','webp'].includes(meta.format)||!scene&&meta.format!=='png')fail('按钮底板请使用 PNG');
    if(scene&&(!task.sourceAdaptation.reflow||!(await sharp(buffer).stats()).isOpaque))fail('请先分离人物，再上传完整、不透明的场景背景');
    if(scene&&!task.sourceAdaptation.reflow.layers.some(l=>l.role==='background'))fail('没有可替换的场景背景');
    const comp=sourceComposition(task,input.templateId);
    if(!scene&&(!task.targetTemplateIds.includes(input.templateId)||!comp?.popup))fail('当前尺寸不是透明弹窗');
    const name=`${scene?'完整场景':'弹窗按钮'}-${randomUUID()}.${meta.format==='jpeg'?'jpg':meta.format}`;
    await fs.writeFile(safeChild(storageDir,id,'assets',name),buffer,{flag:'wx'});stash(task,scene?'替换完整场景背景前':'更换弹窗按钮底板前');
    task.assets.push({name,label:String(input.name||name).slice(0,150),role:scene?'source-reflow-background':'button',mime:`image/${meta.format}`,width:meta.width,height:meta.height,bytes:buffer.length,url:`/storage/${id}/assets/${encodeURIComponent(name)}`,createdAt:new Date().toISOString()});
    if(scene){
     const previousFingerprint=sourceFingerprint(task),reflow=task.sourceAdaptation.reflow,bg=reflow.layers.find(l=>l.role==='background');
     if(!bg)fail('没有可替换的场景背景');
     Object.assign(bg,{assetName:name,label:'完整场景背景',width:meta.width,height:meta.height,x:0,y:0});reflow.backgroundMode='full-scene';reflow.backgroundMethod='uploaded-scene';reflow.backgroundRegion=null;
     const fp=sourceFingerprint(task);if(task.communityMasterApproval?.fingerprint===previousFingerprint)task.communityMasterApproval={...task.communityMasterApproval,fingerprint:fp};
     for(const tid of task.targetTemplateIds){const c=sourceComposition(task,tid);if(!c?.reflowVersion)continue;const layer=c.layers.find(l=>l.id===bg.id);if(!layer)continue;
      const box=c.popup?.frame||{x:0,y:0,width:templateMap.get(tid).width,height:templateMap.get(tid).height},scale=Math.max(box.width/meta.width,box.height/meta.height);
      Object.assign(layer,bg,{x:box.x+(box.width-meta.width*scale)/2,y:box.y+(box.height-meta.height*scale)/2,width:meta.width*scale,height:meta.height*scale});
      if(c.sourceFingerprint===previousFingerprint)c.sourceFingerprint=fp;if(task.communityTargetReviews)delete task.communityTargetReviews[tid];
     }
    }else comp.popup.buttonBackingAsset=name;
    invalidate(task,scene?'使用完整场景，保留人物与文案排版':'更换弹窗按钮底板');action=scene?'补全场景背景，原人物、文字和历史保留':'更换弹窗按钮底板，保留文字和历史';
   }else if(input.action==='replace-text'){
    if(task.mode!=='copy-replace')fail('请在替换文案任务中使用此操作');
    const definition=task.sourceAdaptation.layers.find(l=>l.id===input.layerId),composition=sourceComposition(task,master),placed=composition.layers.find(l=>l.id===input.layerId);
    if(!definition||!['title','subtitle'].includes(definition.role))fail('请选择原稿的主标或副标组');
    const match=/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(input.dataUrl||'');if(!match||match[1].length>28*1048576)fail('请上传不超过 20MB 的透明文案 PNG');
    const buffer=await sharp(Buffer.from(match[1],'base64'),{limitInputPixels:16000000}).rotate().png().toBuffer(),metadata=await sharp(buffer).metadata();
    if(!metadata.hasAlpha||(await sharp(buffer).stats()).isOpaque)fail('文案 PNG 需要透明底，避免遮挡原稿');
    const name=`源稿文案-${randomUUID()}.png`,scale=Math.min(placed.width/metadata.width,placed.height/metadata.height),width=metadata.width*scale,height=metadata.height*scale;
    await fs.writeFile(safeChild(storageDir,task.id,'assets',name),buffer);stash(task,'替换原稿文案前');
    task.assets.push({name,role:'source-visual-group',mime:'image/png',width:metadata.width,height:metadata.height,bytes:buffer.length,url:`/storage/${task.id}/assets/${encodeURIComponent(name)}`,sourceAssetName:task.sourceAdaptation.sourceName,createdAt:new Date().toISOString()});
    Object.assign(definition,{assetName:name,width:metadata.width,height:metadata.height});
    Object.assign(placed,{assetName:name,x:placed.x+(placed.width-width)/2,y:placed.y+(placed.height-height)/2,width,height});
    task.communityMasterApproval=null;task.communityTargetReviews={};invalidate(task,'替换原稿文案，保留其它原素材');task.status='主图制作';action='替换透明文案，保留原文案与历史';
   }else if(input.action==='save'){
    if(![master,...task.targetTemplateIds].includes(input.templateId))fail('画布不属于当前任务');
     const value=validateSourceComposition(task,input.composition,input.templateId),old=sourceComposition(task,input.templateId);
    if(value.popup?.buttonFontId&&!(await readFonts()).fonts.some(f=>f.id===value.popup.buttonFontId))fail('按钮字体不在公司版权字体库中，请重新选择');
    if(value.popup?.buttonBackingAsset&&!task.assets.some(a=>a.name===value.popup.buttonBackingAsset&&!a.libraryDeletedAt&&a.mime==='image/png'))fail('按钮底板不属于当前任务');
    if(!old)fail('请先适配当前尺寸');
    value.sourceFingerprint=old.sourceFingerprint||'';if(JSON.stringify({...old,sourceFingerprint:old.sourceFingerprint||''})===JSON.stringify(value))return task;
    stash(task,'调整源稿图层前');p.sourceCompositionByTemplate[input.templateId]=value;
    if(input.templateId===master)task.communityMasterApproval=null;
    if(task.communityTargetReviews)delete task.communityTargetReviews[input.templateId];
    invalidate(task,'调整源稿图层');action='保存素材位置、缩放与图层顺序';
   }else if(input.action==='confirm'){
    task.communityMasterApproval={at:new Date().toISOString(),fingerprint:sourceFingerprint(task)};task.status='批量生成';action='确认原稿，允许保留原素材适配尺寸';
   }else if(input.action==='adapt'){
    const approval={at:new Date().toISOString(),fingerprint:sourceFingerprint(task)};
    const ids=[...new Set(input.templateIds||[])];if(!ids.length||ids.some(id=>!task.targetTemplateIds.includes(id)))fail('请选择本任务的目标尺寸');
     const plans=ids.map(id=>[id,planSourceComposition({...task,communityMasterApproval:approval},templateMap.get(id))]);
     stash(task,'目标尺寸重排前');task.communityMasterApproval=approval;for(const [id,composition] of plans){p.sourceCompositionByTemplate[id]=composition;if(task.communityTargetReviews)delete task.communityTargetReviews[id];}
     invalidate(task,'按目标比例重排原稿素材');task.status='批量生成';action=`按目标比例重排 ${ids.length} 个尺寸；人物和字效沿用原像素`;
   }else fail('源稿操作无效');
  }
  task.updatedAt=new Date().toISOString();(task.history||=[]).push({at:task.updatedAt,action,by:'设计师',status:task.status});return task;
  });};
 actionHandler.upload=async(id,req,{name,expectedUpdatedAt})=>{
  const input={expectedUpdatedAt},before=JSON.parse(await fs.readFile(tasksFile,'utf8')).find(t=>t.id===id);editable(before,input,jobs);
  const original=path.basename(String(name||'')),extension=path.extname(original).toLowerCase();if(!['.psd','.psb','.png','.jpg','.jpeg','.webp'].includes(extension))fail('请选择 PSD、PSB、PNG、JPG 或 WebP 源文件');
  const upload=await receiveAdAssetUpload(req,{runtimeDir:path.dirname(tasksFile),name:extension==='.psb'?original.slice(0,-4)+'.psd':original,mime:'application/octet-stream'});
  try{return await mutateJson(tasksFile,async tasks=>{
    const task=tasks.find(t=>t.id===id);editable(task,input,jobs);
    const safeStem=path.basename(original,extension).replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').slice(0,100)||'源文件',name=`${safeStem}-${randomUUID().slice(0,8)}${extension}`,directory=safeChild(storageDir,id,'assets');await fs.mkdir(directory,{recursive:true});await fs.copyFile(upload.sourcePath,safeChild(directory,name),1);
    task.assets.push({name,label:original,role:/\.ps[db]$/.test(extension)?'source-psd':'source-original',mime:upload.mime,bytes:upload.bytes,url:`/storage/${id}/assets/${encodeURIComponent(name)}`,createdAt:new Date().toISOString()});
    try{await prepareSourceScene({root,storageDir,task,name,templateMap,invalidate});}catch(error){task.sourceImportError=`新源文件已保存，原有画面保留。还原未完成：${String(error.stderr||error.message).trim().split(/\r?\n/).at(-1)}`;}
    task.updatedAt=new Date().toISOString();(task.history||=[]).push({at:task.updatedAt,action:'上传新源文件，保留同名原文件和历史',by:'设计师',status:task.status});return task;
  });}finally{await upload.cleanup();}
 };
 return actionHandler;
}
