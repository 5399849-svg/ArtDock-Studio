import {registerCustomCanvas} from '../public/custom-canvas-model.js';
import {registerCustomTargets} from '../public/custom-target-sizes.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import sharp from 'sharp';
import {mutateJson} from './json-store.mjs';
import {safeChild} from './core.mjs';
import {projectMaterialCategory,projectMaterialLabel,projectMaterialRole,projectMaterialCategories} from '../public/project-material-model.js';
import {ensureCommunityObjects} from './community-object-assets.mjs';
import {placeCommunityObject} from '../public/community-object-layers.js';
import {initializeCommunityMaterialReferences} from './community-material-references.mjs';
const fail=(message,status=422)=>Object.assign(Error(message),{status});
const read=async(file,fallback=[])=>{try{return JSON.parse(await fs.readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')return fallback;throw e;}};
const hash=b=>createHash('sha256').update(b).digest('hex');
const key=a=>a.id||`legacy-${hash(a.url||a.name).slice(0,24)}`;
const nameOf=value=>String(value||'').trim().slice(0,100);
const category=value=>{if(!projectMaterialCategories.some(([id])=>id!=='all'&&id===value))throw fail('素材分类无效');return value;};
const image=a=>/^image\/(png|jpeg|webp)$/.test(a.mime||'')||/\.(png|jpe?g|webp)$/i.test(a.url||a.name||'');
const mapValues=(value,map)=>typeof value==='string'?map.get(value)||value:Array.isArray(value)?value.map(v=>mapValues(v,map)):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,mapValues(v,map)])):value;
const active=task=>['communityGeneration','outpaint','communityObjectJob'].some(k=>['running','submitting','processing'].includes(task[k]?.status));
export function createProjectDesignLibrary({runtimeDir,storageDir,sourceIndex,readFonts=async()=>({fonts:[]}),templateMap=new Map(),jobs=new Map(),invalidate=()=>{}}){
 const projectsFile=path.join(runtimeDir,'projects.json'),tasksFile=path.join(runtimeDir,'tasks.json');
 const projectFor=async(id,edit=false)=>{const p=(await read(projectsFile)).find(p=>p.id===id);if(!p)throw fail('项目不存在',404);if(edit&&p.status==='archived')throw fail('项目已归档，请先恢复项目',409);return p;};
 async function local(url){
  if(typeof url!=='string'||!url.startsWith('/storage/'))throw fail('素材地址无效');
  let parts;try{parts=url.slice(9).split('/').map(decodeURIComponent);}catch{throw fail('素材地址无效');}
  if(parts.some(p=>!p||p==='.'||p==='..'||/[\\/\u0000]/.test(p)))throw fail('素材地址无效');
  const file=await fs.realpath(safeChild(storageDir,...parts)),base=await fs.realpath(storageDir),relative=path.relative(base,file);
  if(relative.startsWith('..')||path.isAbsolute(relative))throw fail('素材地址无效');return file;
 }
 const exposed=(a,p)=>({...a,id:key(a),displayName:projectMaterialLabel(a),category:projectMaterialCategory(a),favorite:Boolean(a.favorite),isDefault:p.defaultLogoId===a.id});
 async function readImageForTask(task,assetId){
  if(!task.projectId)throw fail('请先为任务关联项目');
  const project=await projectFor(task.projectId,true),asset=project.assets?.find(a=>key(a)===assetId&&!a.projectLibraryRemovedAt);
  if(!asset)throw fail('素材不在当前项目素材库中，或已被移除',404);
  if(!image(asset)||projectMaterialCategory(asset)==='font')throw fail('请选择项目中的 PNG、JPG 或 WebP 图片');
  const file=await local(asset.url),stat=await fs.stat(file);if(stat.size>25*1048576)throw fail('素材不能超过 25 MB');
  const buffer=await fs.readFile(file),metadata=await sharp(buffer,{limitInputPixels:16000000}).metadata();
  if(!['png','jpeg','webp'].includes(metadata.format))throw fail('请选择 PNG、JPG 或 WebP 图片');
  return {asset:exposed(asset,project),buffer,metadata,sha256:hash(buffer)};
 }
 async function list(id){const p=await projectFor(id),brand=(await read(path.join(runtimeDir,'brands.json'))).find(b=>b.id===p.brandId);return {assets:(p.assets||[]).filter(a=>a.url&&!a.projectLibraryRemovedAt).map(a=>exposed(a,p)),templates:(p.designTemplates||[]).map(({snapshotFile,...t})=>t),colors:p.designColors||brand?.colors||[],project:p};}
 async function sources(id){await projectFor(id);const idx=await sourceIndex();if(idx.missingLinks)throw fail('项目归属暂未加载，请刷新后重试',409);const seen=new Set();return idx.assets.filter(a=>a.projectId===id&&a.taskKey&&!a.libraryDeletedAt&&!seen.has(a.url)&&seen.add(a.url)).map(a=>({...a,displayName:projectMaterialLabel(a),category:projectMaterialCategory(a)}));}
 async function inspect(buffer,name,mime){
  if(!buffer.length||buffer.length>64*1024*1024)throw fail('单个素材不能超过 64MB');
  if(/\.(ttf|otf|woff2?|ttc)$/i.test(name)){
   const signature=buffer.subarray(0,4).toString('latin1');if(!['OTTO','wOFF','wOF2','ttcf','\u0000\u0001\u0000\u0000','true'].includes(signature))throw fail('字体文件无法识别');
   return {buffer,mime:`font/${path.extname(name).slice(1)}`,extension:path.extname(name).slice(1)};
  }
  const meta=await sharp(buffer,{limitInputPixels:50_000_000}).metadata().catch(()=>null);
  if(!meta?.width||!['png','jpeg','webp'].includes(meta.format))throw fail('请使用 PNG、JPG、WebP 或字体文件');
  return {buffer,mime:`image/${meta.format}`,extension:meta.format==='jpeg'?'jpg':meta.format,width:meta.width,height:meta.height};
 }
 async function add(id,input){
  const p=await projectFor(id),kind=input.category?category(input.category):null,pending=[];
  const files=input.sourceUrl?[input]:input.files;
  if(!Array.isArray(files)||!files.length||files.length>20)throw fail('请选择 1–20 个素材');
  const candidates=input.sourceUrl?await sources(id):[];
  for(const f of files){let buffer,name,source;
   if(f.sourceUrl){source=candidates.find(a=>a.url===f.sourceUrl&&(!f.sourceTaskKey||a.taskKey===f.sourceTaskKey));if(!source)throw fail('只能收藏当前项目的已有素材');buffer=await fs.readFile(await local(source.url));name=f.name||projectMaterialLabel(source);}
   else{const m=/^data:[\w.+/-]+;base64,([A-Za-z0-9+/=]+)$/.exec(f.dataUrl||'');if(!m||m[1].length>90*1024*1024)throw fail('素材文件无效');buffer=Buffer.from(m[1],'base64');name=f.name;}
   const info=await inspect(buffer,source?.name||name),assetCategory=info.mime.startsWith('font/')?'font':kind||projectMaterialCategory({...source,name,mime:info.mime});
   pending.push({...info,name:nameOf(name)||'项目素材',source,category:assetCategory,sha256:hash(buffer)});
  }
  const added=[],written=[];
  try{await mutateJson(projectsFile,async rows=>{const current=rows.find(p=>p.id===id);if(!current)throw fail('项目已变更，请刷新重试',409);current.assets||=[];
   for(const item of pending){const existing=current.assets.find(a=>a.sha256===item.sha256&&!a.projectLibraryRemovedAt);if(existing){added.push(exposed(existing,current));continue;}
    const aid=randomUUID(),file=`material-${aid}.${item.extension}`,dest=safeChild(storageDir,'projects',id,file);await fs.mkdir(path.dirname(dest),{recursive:true});await fs.writeFile(dest,item.buffer);written.push(dest);
    const asset={id:aid,name:item.name,displayName:item.name,originalName:item.source?.name||item.name,role:projectMaterialRole({category:item.category,role:item.source?.role}),category:item.category,mime:item.mime,width:item.width,height:item.height,bytes:item.buffer.length,sha256:item.sha256,url:`/storage/projects/${encodeURIComponent(id)}/${file}`,favorite:false,version:1,sourceTaskKey:item.source?.taskKey||'',sourceTaskName:item.source?.taskLabel||'',sourceUrl:item.source?.url||'',createdAt:new Date().toISOString()};
    current.assets.push(asset);if(item.category==='logo')current.defaultLogoId||=aid;added.push(exposed(asset,current));
   }current.updatedAt=new Date().toISOString();});}catch(e){await Promise.all(written.map(file=>fs.unlink(file).catch(()=>{})));throw e;}
  return {added,...await list(id)};
 }
 async function updateAsset(id,aid,input){await projectFor(id);await mutateJson(projectsFile,rows=>{const p=rows.find(p=>p.id===id);if(!p)throw fail('项目不可编辑',409);const a=p.assets?.find(a=>key(a)===aid);if(!a)throw fail('素材不存在',404);
  if('favorite'in input){if(typeof input.favorite!=='boolean')throw fail('收藏设置无效');a.favorite=input.favorite;}
  if('displayName'in input){if(!nameOf(input.displayName))throw fail('素材名称不能为空');a.displayName=nameOf(input.displayName);}
  if('category'in input){a.category=category(input.category);if(a.category==='font'&&!a.fontId&&!String(a.mime).startsWith('font/'))throw fail('图片不能设为字体');if(a.category==='logo'&&!image(a))throw fail('Logo 需要图片');a.role=projectMaterialRole(a);if(p.defaultLogoId===a.id&&a.category!=='logo')p.defaultLogoId='';}
  a.updatedAt=new Date().toISOString();p.updatedAt=a.updatedAt;});return list(id);}
 async function setDefault(id,aid){await projectFor(id);await mutateJson(projectsFile,rows=>{const p=rows.find(p=>p.id===id);if(!p)throw fail('项目不可编辑',409);const a=p.assets?.find(a=>key(a)===aid);if(!a||projectMaterialCategory(a)!=='logo')throw fail('请选择当前项目的 Logo');a.id||=aid;a.role='logo';p.defaultLogoId=a.id;p.updatedAt=new Date().toISOString();});return list(id);}
 async function addFont(id,{fontId,usage='title'}){await projectFor(id);const font=(await readFonts()).fonts.find(f=>f.id===fontId);if(!font)throw fail('字体不在公司字体库中');if(!['title','subtitle'].includes(usage))throw fail('字体用途无效');await mutateJson(projectsFile,rows=>{const p=rows.find(p=>p.id===id);if(!p)throw fail('项目不可编辑',409);p.assets||=[];let a=p.assets.find(a=>a.fontId===fontId);if(!a){a={...font,id:randomUUID(),fontId,category:'font',role:'font',source:'company-library',createdAt:new Date().toISOString()};p.assets.push(a);}a.fontUsage=usage;p.recommendedFontIds=[...new Set([...(p.recommendedFontIds||[]),fontId])];p.updatedAt=new Date().toISOString();});return list(id);}
 async function colors(id,values){await projectFor(id);if(!Array.isArray(values)||values.length>8||values.some(c=>typeof c!=='string'||!/^#[\da-f]{6}$/i.test(c)))throw fail('请设置最多 8 个有效配色');await mutateJson(projectsFile,rows=>{const p=rows.find(p=>p.id===id);if(!p)throw fail('项目不可编辑',409);p.designColors=values;p.updatedAt=new Date().toISOString();});return list(id);}
 async function copyAsset(asset,folder,bucket='assets'){
  if(asset.fontId)return {...asset,id:randomUUID()};
  const buffer=await fs.readFile(await local(asset.url)),info=await inspect(buffer,asset.name),aid=randomUUID(),file=`project-material-${aid}.${info.extension}`,dest=safeChild(storageDir,folder,bucket,file);await fs.mkdir(path.dirname(dest),{recursive:true});await fs.writeFile(dest,buffer);
  return {...asset,id:aid,name:file,originalName:projectMaterialLabel(asset),url:`/storage/${folder}/${bucket}/${file}`,width:info.width,height:info.height,mime:info.mime,projectLibraryAssetId:asset.id,createdAt:new Date().toISOString()};
 }
 async function importIntoTask(task,input){
  const p=await projectFor(input.projectId||task.projectId,true);if(task.projectId!==p.id)throw fail('素材与当前任务不属于同一项目');
  const asset=p.assets?.find(a=>key(a)===input.assetId);if(!asset)throw fail('项目素材不存在',404);
  const mode=input.mode||'original',kind=projectMaterialCategory(asset);if(!['original','reference','font'].includes(mode))throw fail('素材使用方式无效');
  const parameters=task.parameters||={};task.assets||=[];
  if(kind==='font'){
   const textKind=input.textKind||asset.fontUsage||'title';if(!['title','subtitle'].includes(textKind))throw fail('字体用途无效');
   if(asset.fontId){if(!(await readFonts()).fonts.some(f=>f.id===asset.fontId))throw fail('字体当前不可用');parameters[`${textKind}FontId`]=asset.fontId;delete parameters[`${textKind}FontAsset`];(parameters.communityMaterialFontIds||={})[textKind]=asset.fontId;}
   else{await inspect(await fs.readFile(await local(asset.url)),asset.name);parameters[`${textKind}FontAsset`]=asset.name;delete parameters[`${textKind}FontId`];if(parameters.communityMaterialFontIds)delete parameters.communityMaterialFontIds[textKind];}
   parameters[`${textKind}FontSource`]='manual';(parameters.assetByTemplate||={})[task.masterTemplateId]||={};parameters.assetByTemplate[task.masterTemplateId][textKind]=null;
   const box=parameters.layoutByTemplate?.[task.masterTemplateId]?.[textKind];if(box)box.visible=true;
   return;
  }
  if(!image(asset))throw fail('此素材请通过源文件导入');
  if(mode==='original'&&kind==='character'){
   const {data,info}=await sharp(await fs.readFile(await local(asset.url))).resize({width:256,height:256,fit:'inside'}).ensureAlpha().raw().toBuffer({resolveWithObject:true});let transparent=0;for(let i=3;i<data.length;i+=4)if(data[i]<240)transparent++;if(transparent<info.width*info.height*.01)throw fail('角色没有透明背景，请先抠图或改为 AI 参考');
  }
  if(mode==='reference')initializeCommunityMaterialReferences(task);
  const copy=await copyAsset({...asset,id:key(asset)},task.id);copy.role=mode==='reference'?'reference-image':projectMaterialRole(asset);task.assets.push(copy);
  if(mode==='reference'){
   const scope=input.scope||'illustration';if(!['illustration','text'].includes(scope))throw fail('参考图用途无效');
   (parameters.communityMaterialReferences||={})[scope]||=[];parameters.communityMaterialReferences[scope].push(copy.name);parameters.communityMaterialKind=scope==='text'?'title':'illustration';return;
  }
  const master=templateMap.get(task.masterTemplateId);
  if(kind==='character'&&master?.communityMaster){const objects=ensureCommunityObjects(task),character={id:randomUUID(),name:projectMaterialLabel(asset),assetName:copy.name,createdAt:new Date().toISOString()};objects.characters.push(character);objects.revision++;placeCommunityObject(task,master,'character',character.id);}
  else{const element=({background:'background',logo:'logo',button:'button',text:asset.role==='subtitle'?'subtitle':'title',character:'character'})[kind];if(element){(parameters.assetByTemplate||={})[task.masterTemplateId]||={};parameters.assetByTemplate[task.masterTemplateId][element]=copy.name;(parameters.layoutByTemplate||={})[task.masterTemplateId]||={};const layout=parameters.layoutByTemplate[task.masterTemplateId][element];if(layout)layout.visible=true;if(element==='background'){(parameters.backgroundByTemplate||={})[task.masterTemplateId]={focalX:50,focalY:50,scale:100,smartExpand:false,url:''};if(parameters.communityArtworkByTemplate)delete parameters.communityArtworkByTemplate[task.masterTemplateId];}}}
 }
 async function useAsset(id,aid,input){await projectFor(id,true);if(!input.taskId)throw fail('请先创建或打开任务');return mutateJson(tasksFile,async tasks=>{const task=tasks.find(t=>t.id===input.taskId);if(!task)throw fail('任务不存在',404);if(task.status==='已完成'&&task.deliveredPackage)throw fail('已交付任务请先开始新版本',409);if(active(task)||jobs.has(task.id))throw fail('请等待当前生成完成',409);if(input.expectedUpdatedAt!==task.updatedAt)throw fail('任务已更新，请刷新后重试',409);if(task.projectId!==id)throw fail('任务与素材不属于同一项目');const signature=`${id}:${aid}:${input.mode||'original'}:${input.requestId||''}`;if(input.requestId&&task.projectLibraryUses?.includes(signature))return task;await importIntoTask(task,{...input,assetId:aid,projectId:id});if(input.mode!=='reference')invalidate(task,'从项目素材库加入素材');task.projectLibraryUses=[...(task.projectLibraryUses||[]).slice(-50),signature];task.updatedAt=new Date().toISOString();return task;});}
 async function saveTemplate(id,input){
  await projectFor(id,true);if(typeof input.taskKey!=='string'||!input.taskKey.startsWith('core:'))throw fail('请从可编辑的资源位制作任务保存模板');
  const task=(await read(tasksFile)).find(t=>`core:${t.id}`===input.taskKey),idx=await sourceIndex();if(!task||!idx.tasks.some(t=>t.key===input.taskKey&&t.projectId===id))throw fail('只能收藏当前项目的制作任务');if(active(task)||jobs.has(task.id))throw fail('请等待当前制作完成后保存模板',409);if(input.expectedUpdatedAt&&task.updatedAt!==input.expectedUpdatedAt)throw fail('任务已更新，请刷新后重试',409);
  const tid=randomUUID(),folder=`projects/${id}/templates/${tid}`,snapshot={...(task.customCanvas?{customCanvas:structuredClone(task.customCanvas)}:{}),...(task.customTargetSizes?.length?{customTargetSizes:structuredClone(task.customTargetSizes)}:{}),copy:task.copy||'',notes:task.notes||'',businessLineId:task.businessLineId,segmentId:task.segmentId,segmentIds:task.segmentIds,masterTemplateId:task.masterTemplateId,masterCanvasId:task.masterCanvasId,targetTemplateIds:task.targetTemplateIds,parameters:structuredClone(task.parameters||{}),communityObjects:structuredClone(task.communityObjects||null),assets:[]},references=JSON.stringify({parameters:snapshot.parameters,objects:snapshot.communityObjects}),needed=new Set();
  for(const a of task.assets||[])if(references.includes(JSON.stringify(a.name))||references.includes(JSON.stringify(a.url)))needed.add(a);
  for(const role of ['logo','background','master','master-landscape','background-landscape','title','subtitle','character','core-character','button']){const a=task.assets?.find(a=>a.role===role);if(a)needed.add(a);}
  const replacements=new Map();let bytes=0;
  for(const a of needed){const stat=await fs.stat(await local(a.url));bytes+=stat.size;if(bytes>512*1024*1024)throw fail('当前模板素材超过 512MB，请减少参考图后保存');const copy=await copyAsset(a,folder);snapshot.assets.push(copy);replacements.set(a.name,copy.name);replacements.set(a.url,copy.url);}
  snapshot.parameters=mapValues(snapshot.parameters,replacements);snapshot.communityObjects=mapValues(snapshot.communityObjects,replacements);
  delete snapshot.parameters.automaticProduction;delete snapshot.parameters.communityTargetRevisions;
  if(snapshot.communityObjects){delete snapshot.communityObjects.styleCandidate;delete snapshot.communityObjects.uploadRequests;}
  const file=safeChild(storageDir,...folder.split('/'),'snapshot.json');await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,JSON.stringify(snapshot));
  const chosen=task.coverPreview?.url||task.pagePreviews?.at(-1)?.url||task.assets?.find(a=>a.role==='layered-preview')?.url||task.assets?.find(a=>a.name===task.parameters?.assetByTemplate?.[task.masterTemplateId]?.background)?.url;let coverUrl='';
  if(chosen){const cover={name:'preview.png',url:chosen};try{coverUrl=(await copyAsset(cover,folder,'cover')).url;}catch{}}
  const template={id:tid,name:nameOf(input.name)||task.project,width:templateMap.get(task.masterTemplateId)?.width||1920,height:templateMap.get(task.masterTemplateId)?.height||1080,coverUrl,sourceTaskKey:input.taskKey,sourceTaskName:task.project,snapshotFile:folder+'/snapshot.json',createdAt:new Date().toISOString()};
  await mutateJson(projectsFile,rows=>{const p=rows.find(p=>p.id===id);if(!p||p.status==='archived')throw fail('项目已变更，请刷新重试',409);(p.designTemplates||=[]).push(template);p.updatedAt=template.createdAt;});return list(id);
 }
 async function useTemplate(id,tid,input){const p=await projectFor(id,true),template=p.designTemplates?.find(t=>t.id===tid);if(!template)throw fail('模板不存在',404);if(!/^[a-zA-Z0-9-]{8,80}$/.test(input.requestId||''))throw fail('缺少创建请求编号');
  const existing=(await read(tasksFile)).find(t=>t.projectTemplateRequestId===input.requestId&&t.projectId===id);if(existing)return existing;
  const snapshot=await read(safeChild(storageDir,...template.snapshotFile.split('/')),null);if(snapshot?.customCanvas)registerCustomCanvas(snapshot,templateMap);registerCustomTargets(snapshot,templateMap);if(!snapshot||!snapshot.targetTemplateIds?.length||snapshot.targetTemplateIds.some(t=>!templateMap.has(t)))throw fail('模板资源位已变化，请重新保存模板');
  const now=new Date().toISOString(),task={...snapshot,id:randomUUID(),project:nameOf(input.name)||template.name+' 副本',projectId:id,brandId:p.brandId||'',requester:'设计师',mode:'master',status:'草稿',assignee:'',version:1,artifacts:[],pagePreviews:[],annotations:{objects:[],activeType:'core-character',updatedAt:null},history:[{at:now,action:`从项目模板「${template.name}」创建`,by:'设计师',status:'草稿'}],createdAt:now,updatedAt:now,projectTemplateId:tid,projectTemplateRequestId:input.requestId},replacements=new Map(),copies=[];
  for(const a of snapshot.assets){const copy=await copyAsset(a,task.id);copies.push(copy);replacements.set(a.name,copy.name);replacements.set(a.url,copy.url);}task.assets=copies;task.parameters=mapValues(task.parameters,replacements);task.communityObjects=mapValues(task.communityObjects,replacements);
  return mutateJson(tasksFile,rows=>{const prior=rows.find(t=>t.projectTemplateRequestId===input.requestId&&t.projectId===id);if(prior)return prior;rows.unshift(task);return task;});
 }
 return {list,sources,add,updateAsset,setDefault,addFont,colors,importIntoTask,useAsset,saveTemplate,useTemplate,readImageForTask};
}
