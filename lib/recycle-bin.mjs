import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {writeJson} from './json-store.mjs';

const fail=(message,status=409)=>Object.assign(Error(message),{status});
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const read=async(file,fallback)=>{try{return JSON.parse(await fs.readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')return structuredClone(fallback);throw e;}};
const normalize=value=>{try{value=decodeURIComponent(value);}catch{}return value.replaceAll('\\','/').toLowerCase();};
const collect=(value,result=new Set())=>{
 if(typeof value==='string'){if(!value.startsWith('data:')&&!(value.length>65536&&/^[A-Za-z0-9+/=\r\n]+$/.test(value)))result.add(normalize(value));}
 else if(value&&typeof value==='object')for(const child of Object.values(value))collect(child,result);
 return result;
};
const validIds=input=>{if(!Array.isArray(input.ids)||!input.ids.length||input.ids.length>10000||input.ids.some(id=>typeof id!=='string'))throw fail('请选择要处理的项目',422);return [...new Set(input.ids)].sort();};
const instances=new Map();
export function getRecycleBin(options){const key=path.resolve(options.runtimeDir);if(!instances.has(key))instances.set(key,createRecycleBin(options).catch(e=>{instances.delete(key);throw e;}));return instances.get(key);}

// Task records and files stay in place until an explicit, reference-checked purge.
// Nothing schedules automatic expiry or migrates existing production records.
export async function createRecycleBin({runtimeDir,storageDir,files=fs}){
 const registryFile=path.join(runtimeDir,'workbench-recycle-bin.json');
 let state=await read(registryFile,{version:1,items:{},operations:{}}),queue=Promise.resolve(),purging=false,activeWrites=0;
 const adapters=new Map(),drain=[];
 const serial=work=>{const next=queue.catch(()=>{}).then(work);queue=next;return next;};
 const save=async next=>{await writeJson(registryFile,next);state=next;};
 const taskHidden=key=>Object.values(state.items).some(item=>item.type==='task'&&item.key===key);
 const assetHidden=url=>Object.values(state.items).some(item=>item.type==='asset'&&normalize(item.asset.url||'')===normalize(url||''));
 const universe=async()=>{const result=[];for(const [module,adapter]of adapters)for(const row of await adapter.list())result.push({...row,module});return result;};
 const relativeFile=url=>{
  if(typeof url!=='string'||!url.startsWith('/storage/'))return null;
  let parts;try{parts=url.split(/[?#]/)[0].slice(9).split('/').flatMap(part=>decodeURIComponent(part).replaceAll('\\','/').split('/'));}catch{return null;}
  return parts.length>1&&parts.every(part=>part&&part!=='.'&&part!=='..'&&!/[\0:]/.test(part))?parts.join(path.sep):null;
 };
 async function inspect(relative){
  const root=path.resolve(storageDir),file=path.resolve(root,relative);
  if(!file.startsWith(root+path.sep))throw fail('文件路径超出素材目录',422);
  const stat=await files.lstat(file).catch(e=>{if(e.code==='ENOENT')return null;throw e;});if(!stat)return null;
  const realRoot=await files.realpath(root),real=await files.realpath(file);
  if(stat.isSymbolicLink()||!normalize(real).startsWith(normalize(realRoot)+'/'))return {relative,bytes:0,protected:true,reason:'链接文件保留'};
  if(!stat.isFile())return null;
  return {relative,bytes:stat.size,mtimeMs:stat.mtimeMs,ino:stat.ino,protected:stat.nlink>1,reason:stat.nlink>1?'共用硬链接保留':''};
 }
 async function tree(folder){
  if(!folder||folder==='.'||folder==='..'||/[\\/\0:]/.test(folder))return [];
  const root=path.resolve(storageDir),base=path.resolve(root,folder);if(!base.startsWith(root+path.sep))throw fail('素材目录无效',422);
  const result=[];
  async function visit(relative){const target=path.join(root,relative),stat=await files.lstat(target).catch(e=>{if(e.code==='ENOENT')return null;throw e;});if(!stat)return;
   if(stat.isSymbolicLink()){result.push({relative,bytes:0,protected:true,reason:'链接目录保留'});return;}
   const real=await files.realpath(target),realRoot=await files.realpath(root);if(!normalize(real).startsWith(normalize(realRoot)+'/'))throw fail('素材目录指向工作台以外',422);
   if(stat.isDirectory())for(const name of await files.readdir(target))await visit(path.join(relative,name));else if(stat.isFile())result.push(await inspect(relative));
  }
  await visit(folder);return result.filter(Boolean);
 }
 function entryView(item){return {id:item.id,type:item.type,module:item.module,label:item.label,deletedAt:item.deletedAt,status:item.status,projectId:item.projectId||'',bytes:(item.files||[]).reduce((sum,file)=>sum+file.bytes,0),fileCount:(item.files||[]).length,parentKeys:item.parentKeys||[],parentInTrash:(item.parentKeys||[]).some(taskHidden)};}
 async function addTask(key){return serial(async()=>{
  const existing=Object.values(state.items).find(item=>item.type==='task'&&item.key===key);if(existing){if(existing.status==='purged')throw fail('任务已彻底删除',404);return {ok:true,recycled:true,id:existing.id};}
  const row=(await universe()).find(row=>row.key===key);if(!row)throw fail('任务不存在',404);if(row.busy)throw fail('任务正在生成或导入，请完成后再移入回收站');
  const entry={id:randomUUID(),type:'task',key,module:row.module,label:row.label||'未命名任务',projectId:row.projectId||'',deletedAt:new Date().toISOString(),status:'trashed',folder:row.folder||'',snapshot:structuredClone(row.data),files:await tree(row.folder)};
  const next=structuredClone(state);next.items[entry.id]=entry;await save(next);return {ok:true,recycled:true,id:entry.id};
 });}
 async function addAssets(assets,requestId){return serial(async()=>{
  if(requestId&&state.operations[requestId])return state.operations[requestId];
  const next=structuredClone(state),at=new Date().toISOString(),ids=[];
  for(const asset of assets){if(!asset?.url)throw fail('素材地址无效',422);const existing=Object.values(next.items).find(item=>item.type==='asset'&&item.assetId===asset.recycleAssetId);if(existing){ids.push(existing.id);continue;}
   const relative=relativeFile(asset.url),file=relative?await inspect(relative):null;
   const id=randomUUID(),parentKeys=[...new Set((asset.sources||[]).map(source=>source.taskKey||source.key||(source.module&&source.id?`${source.module}:${source.id}`:'')).filter(Boolean))];
   next.items[id]={id,type:'asset',assetId:asset.recycleAssetId,module:asset.sources?.[0]?.module||'assets',label:asset.name||'素材',projectId:asset.projectId||'',deletedAt:at,status:'trashed',asset:structuredClone(asset),parentKeys,files:file?[file]:[]};ids.push(id);
  }
  const result={done:true,recycled:true,removedCount:assets.length,deletedFiles:0,freedBytes:0,retainedCount:assets.length,ids};
  if(requestId){next.operations[requestId]=result;for(const key of Object.keys(next.operations).slice(0,-100))delete next.operations[key];}
  await save(next);return result;
 });}
 async function restore(input){return serial(async()=>{
  const ids=validIds(input),items=ids.map(id=>state.items[id]);if(items.some(item=>!item||item.status!=='trashed'))throw fail('回收站内容已变化，请刷新');
  const all=await universe(),expanded=new Map(items.map(item=>[item.id,item]));
  for(const item of items){
   if(item.type==='asset'&&item.parentKeys?.length&&!item.parentKeys.some(key=>all.some(row=>row.key===key)&&!Object.values(state.items).some(row=>row.type==='task'&&row.key===key&&row.status==='purged')))throw fail('所属任务已彻底删除，无法恢复该素材');
   for(const key of item.parentKeys||[]){const parent=Object.values(state.items).find(row=>row.type==='task'&&row.key===key);if(parent?.status==='purged')continue;if(parent){if(parent.status!=='trashed')throw fail('所属任务正在清理');expanded.set(parent.id,parent);}}
  }
  for(const item of expanded.values()){
   if(item.type==='task'&&!all.some(row=>row.key===item.key))throw fail('任务原记录缺失，已保留回收站记录，请先检查备份');
   for(const previous of item.files||[])if(!await inspect(previous.relative))throw fail('原素材文件缺失，已保留回收站记录，请先检查备份');
  }
  const next=structuredClone(state);for(const id of expanded.keys())delete next.items[id];await save(next);
  return {ok:true,restored:expanded.size,restoredParents:expanded.size-items.length};
 });}
 async function externalReferences(all,selected,selectedAssets){
  const selectedKeys=new Set(selected.filter(item=>item.type==='task').map(item=>item.key)),refs=new Set(),records=[];
  for(const row of all){if(selectedKeys.has(row.key))continue;let data=row.data;
   if(row.module==='core'&&Array.isArray(data.assets)){
    const removed=selectedAssets.filter(item=>item.parentKeys.includes(row.key));
    const match=asset=>removed.some(item=>normalize(item.asset.url)===normalize(asset.url||`/storage/${data.id}/assets/${encodeURIComponent(asset.name)}`));
    const kept=data.assets.filter(asset=>!match(asset));data={...data,assets:kept};
    if(!Object.values(data.parameters?.assetByTemplate||{}).some(value=>value?.background)){
     const first=row.data.assets.find(asset=>/^image\//.test(asset.mime||''));if(first&&match(first))collect(first,refs);
    }
   }
   records.push({key:row.key,data});collect(data,refs);
  }
  const retainedItems=Object.values(state.items).filter(item=>item.status!=='purged'&&!selected.some(selected=>selected.id===item.id));
  for(const item of retainedItems)collect(item.type==='asset'?item.asset:item.snapshot,refs);
  const metadata=['projects.json','references.json','specifications.json','resource-profiles.json','resource-rules.json','layout-regions.json','brands.json'];
  for(const name of metadata){const data=await read(path.join(runtimeDir,name),[]);records.push({name,data});collect(data,refs);}
  const jobs=await read(path.join(runtimeDir,'jobs.json'),[]);collect(jobs.filter(job=>!selectedKeys.has(`core:${job.taskId}`)),refs);records.push({name:'jobs.json',data:jobs});
  // Include modules that failed to register and long-form documents from the other local editor.
  const stores={'core':'tasks.json','ad-resources':'ad-resources-jobs.json','channel-resources':'channel-resource-jobs.json','store-preorder':'store-preorder-jobs.json','store-launch':'store-launch-jobs.json','icon-preorder':'icon-preorder-jobs.json','icon-launch':'icon-launch-jobs.json'};
  for(const [module,name]of Object.entries(stores))if(!adapters.has(module)){const data=await read(path.join(runtimeDir,name),[]);collect(data,refs);for(const row of data)if(row.id)refs.add(normalize(module==='core'?row.id:`${module}-${row.id}`));records.push({name,data});}
  async function jsonDirectory(dir){for(const entry of await fs.readdir(dir,{withFileTypes:true}).catch(e=>{if(e.code==='ENOENT')return [];throw e;})){if(entry.isSymbolicLink())continue;const file=path.join(dir,entry.name);if(entry.isDirectory())await jsonDirectory(file);else if(entry.name.endsWith('.json')){const data=await read(file,null);collect(data,refs);records.push({name:file,data});}}}
  await jsonDirectory(path.join(runtimeDir,'longform'));
  // Saved layer manifests and snapshots may hold references not repeated in task JSON.
  for(const folder of new Set(all.filter(row=>!selectedKeys.has(row.key)).map(row=>row.folder).filter(Boolean)))for(const file of await tree(folder))if(!file.protected&&file.relative.endsWith('.json')){
   const data=await read(path.join(storageDir,file.relative),null);collect(data,refs);records.push({name:file.relative,data});
  }
  // Project templates may keep their complete layer snapshot in a separate JSON file.
  const followed=new Set();for(const value of refs){if(!value.endsWith('.json'))continue;const relative=relativeFile(value)||(value.startsWith(normalize(path.resolve(storageDir))+'/')?path.relative(storageDir,value):null);if(!relative||followed.has(relative))continue;followed.add(relative);const file=await inspect(relative);if(file&&!file.protected){const data=await read(path.join(storageDir,relative),null);collect(data,refs);records.push({name:relative,data});}}
  return {refs,records};
 }
 async function plan(input){
  const ids=validIds(input),items=ids.map(id=>state.items[id]);if(items.some(item=>!item||!['trashed','purging'].includes(item.status)))throw fail('回收站内容已变化，请刷新');
  if(items.some(item=>item.type==='task'&&!adapters.has(item.module)))throw fail('所属业务暂未加载，已保留文件，请恢复服务后再清理');
  const all=await universe(),workerJobs=await read(path.join(runtimeDir,'jobs.json'),[]);
  if(all.some(row=>row.purgeBusy??row.busy)||workerJobs.some(job=>['running','queued','processing'].includes(job.status)))throw fail('有任务正在生成或导入，请完成后再清空回收站');
  const keys=new Set(items.filter(item=>item.type==='task').map(item=>item.key));
  const purgedKeys=new Set(Object.values(state.items).filter(item=>item.type==='task'&&item.status==='purged').map(item=>item.key));
  for(const item of Object.values(state.items))if(item.type==='asset'&&item.status==='trashed'&&item.parentKeys.length&&item.parentKeys.some(key=>keys.has(key))&&item.parentKeys.every(key=>keys.has(key)||purgedKeys.has(key))&&!items.includes(item))items.push(item);
  const assetItems=items.filter(item=>item.type==='asset'),{refs,records}=await externalReferences(all,items,assetItems),candidates=new Map();
  for(const item of items){
   if(item.type==='task')for(const file of await tree(item.folder))candidates.set(normalize(file.relative),{...file,ownerIds:[...(candidates.get(normalize(file.relative))?.ownerIds||[]),item.id]});
   else for(const previous of item.files||[]){const file=await inspect(previous.relative);if(file)candidates.set(normalize(file.relative),{...file,ownerIds:[...(candidates.get(normalize(file.relative))?.ownerIds||[]),item.id]});}
  }
  const referenceValues=[...refs],retained=[],deletable=[];
  for(const file of candidates.values()){
   let reason=file.reason||'';const relative=normalize(file.relative),absolute=normalize(path.join(storageDir,file.relative)),url='/storage/'+relative,basename=path.posix.basename(relative),folder=relative.split('/')[0];
   const owners=file.ownerIds.map(id=>items.find(item=>item.id===id)),assetOnly=owners.every(item=>item.type==='asset');
   if(!reason&&assetOnly&&owners.some(item=>!adapters.has(item.module)))reason='所属业务暂未加载，文件保留';
   if(!reason&&all.some(row=>row.folder===folder&&!keys.has(row.key)&&!(assetOnly&&row.module==='core'&&assetItems.some(item=>item.parentKeys.includes(row.key)))))reason='所属任务或同批次其他任务仍使用此目录';
   const aliasIds=all.flatMap(row=>(row.data.assets||[]).filter(asset=>normalize(asset.url||`/storage/${row.data.id}/assets/${encodeURIComponent(asset.name)}`)===url).map(asset=>asset.id).filter(Boolean).map(normalize));
   const parentPaths=new Set();for(let parent=path.posix.dirname(url);parent.startsWith('/storage/');parent=path.posix.dirname(parent))parentPaths.add(parent);for(let parent=path.posix.dirname(absolute);parent.startsWith(normalize(path.resolve(storageDir))+'/');parent=path.posix.dirname(parent))parentPaths.add(parent);
   if(!reason&&referenceValues.some(value=>value.includes(url)||value.includes(absolute)||value===relative||value===basename||parentPaths.has(value)||(!assetOnly&&value===folder)||aliasIds.includes(value)))reason='当前画布、共用素材或历史版本仍在引用';
   if(!reason&&assetOnly&&!owners.every(item=>item.module==='core'&&file.relative.split(path.sep)[1]==='assets'))reason='所属业务仍保存该素材与版本';
   if(reason||file.protected)retained.push({...file,reason:reason||'文件保留'});else deletable.push(file);
  }
  const token=digest({ids:items.map(item=>item.id).sort(),items,records,all:all.map(row=>({key:row.key,data:row.data,busy:row.busy})),candidates:[...candidates.values()],retained});
  return {items,all,files:deletable,retained,token,summary:{count:items.length,taskCount:items.filter(item=>item.type==='task').length,assetCount:assetItems.length,requestedCount:ids.length,dependentCount:items.length-ids.length,purgeFiles:deletable.length,freeBytes:deletable.reduce((sum,file)=>sum+file.bytes,0),retainedFiles:retained.length,retainedBytes:retained.reduce((sum,file)=>sum+file.bytes,0)}};
 }
 async function purge(input){
  if(purging)throw fail('正在清空回收站，请稍后再操作',423);
  purging=true;try{
   // Drain HTTP writes before entering the metadata queue, so queued trash writes
   // can finish instead of deadlocking behind a purge waiting for those writes.
   if(activeWrites)await new Promise(resolve=>drain.push(resolve));
   return await serial(async()=>{
  if(!/^[a-zA-Z0-9-]{8,80}$/.test(input.requestId||''))throw fail('缺少有效操作编号',422);if(state.operations[input.requestId])return state.operations[input.requestId];
   const work=await plan(input);if(input.token!==work.token)throw fail('引用或文件已变化，请重新查看释放空间后确认');
   let next=structuredClone(state);for(const item of work.items)next.items[item.id].status='purging';await save(next);
   const failed=[],deleted=[];
   for(const file of work.files){try{const current=await inspect(file.relative);if(!current)continue;if(current.protected||current.ino!==file.ino||current.bytes!==file.bytes||current.mtimeMs!==file.mtimeMs)throw Error('文件已变化');await files.unlink(path.join(storageDir,file.relative));deleted.push(file);}catch(error){failed.push({relative:file.relative,message:error.message});}}
   // A partial failure stays visible and cannot be restored as an incomplete task.
   if(failed.length){next=structuredClone(state);for(const item of work.items)next.items[item.id].lastError='部分文件未清理完成，请重新检查后重试';await save(next);return {done:false,retryable:true,freedBytes:deleted.reduce((s,f)=>s+f.bytes,0),failed};}
   for(const item of work.items)if(item.type==='task')await adapters.get(item.module)?.drop(item.key,item.snapshot);
   // A retry must also detach files unlinked by the previous interrupted attempt.
   for(const item of work.items)if(item.type==='asset'&&item.module==='core'&&item.files?.length&&!(await Promise.all(item.files.map(file=>inspect(file.relative)))).some(Boolean))await adapters.get('core')?.dropAsset?.(item.asset);
   next=structuredClone(state);for(const item of work.items)next.items[item.id]={...next.items[item.id],status:'purged',purgedAt:new Date().toISOString(),files:[],snapshot:undefined,lastError:undefined};
   const result={done:true,purged:work.items.length,deletedFiles:deleted.length,freedBytes:deleted.reduce((s,file)=>s+file.bytes,0),retainedFiles:work.retained.length,retainedBytes:work.summary.retainedBytes};next.operations[input.requestId]=result;await save(next);return result;
   });
  }finally{purging=false;}
 }
 return {
  register(module,adapter){adapters.set(module,adapter);},isTaskHidden:taskHidden,isAssetHidden:assetHidden,
  operation:id=>state.operations[id],
  assetStatus:()=>({removedIds:Object.values(state.items).filter(item=>item.type==='asset').map(item=>item.assetId),removedUrls:Object.values(state.items).filter(item=>item.type==='asset').map(item=>item.asset.url)}),
  list:async()=>({items:Object.values(state.items).filter(item=>item.status!=='purged').map(entryView).sort((a,b)=>b.deletedAt.localeCompare(a.deletedAt)),manualOnly:true}),
  trashTask:addTask,trashAssets:addAssets,restore,preview:async input=>{const work=await plan(input);return {...work.summary,token:work.token};},purge,
  beginMutation(){if(purging)throw fail('正在清空回收站，请稍后再操作',423);activeWrites++;let finished=false;return ()=>{if(finished)return;finished=true;if(--activeWrites===0)for(const resolve of drain.splice(0))resolve();};},
 };
}
