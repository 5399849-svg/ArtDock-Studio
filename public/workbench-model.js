export const modules = Object.freeze(['store-preorder','store-launch','icon-preorder','icon-launch']);
export const taskModules = Object.freeze([...modules,'channel-resources','ad-resources']);
export const escapeHtml = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const statusLabels = Object.freeze({all:'全部',draft:'草稿',running:'制作中',review:'待检查',done:'已完成',issue:'需要处理'});
export function taskStatusBucket(task={}) {
 const status=task.status;
 if(['failed','生成失败','paused','已暂停','需要处理'].includes(status))return 'issue';
 if(['running','主图制作','批量生成','制作中'].includes(status))return 'running';
 if(['成套审核','待检查'].includes(status)||(status==='complete'&&!task.reviewed))return 'review';
 if(['complete','已完成'].includes(status))return 'done';
 return 'draft';
}
export const taskStatus=task=>statusLabels[taskStatusBucket(task)];
const latestDate=dates=>dates.filter(Boolean).reduce((best,value)=>(Date.parse(value)||0)>(Date.parse(best)||0)?value:best,'');
const own=(object,key)=>Object.prototype.hasOwnProperty.call(object||{},key);
const linkedProject=(links,keys,fallback='')=>{for(const key of keys)if(own(links,key))return links[key]||'';return fallback||'';};
const mimeTypes={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',gif:'image/gif',psd:'image/vnd.adobe.photoshop',psb:'image/vnd.adobe.photoshop',ttf:'font/ttf',otf:'font/otf',woff:'font/woff',woff2:'font/woff2'};
const extension=value=>String(value||'').split('?')[0].split('.').at(-1).toLowerCase();
// Uploaded PSD assets expose a PNG preview URL; infer the served file before the source name.
const fileMime=asset=>asset.mime||mimeTypes[extension(asset.format)]||mimeTypes[extension(asset.url)]||mimeTypes[extension(asset.name||asset.file)]||'image/png';

/** A channel task is one project in one demand batch, regardless of delivery count. */
export function groupChannelBatchTasks(data={},links={}) {
 const channelNames=new Map((data.channels||[]).map(channel=>[channel.id,channel.name]));
 const groups=[];
 for(const batch of data.batches||[]){
  const byProject=new Map();
  for(const item of batch.items||[]){const project=String(item.project||'未命名项目').trim();if(!byProject.has(project))byProject.set(project,[]);byProject.get(project).push(item);}
  for(const [project,items] of byProject){
   const key=`channel-resources:${batch.id}:${encodeURIComponent(project)}`;
   const reviewed=items.filter(item=>item.review?.approved&&item.review.versionFile===item.versions?.at(-1)?.file).length;
   const candidates=items.filter(item=>item.versions?.length).length;
   const status=items.some(item=>taskStatusBucket(item)==='issue')?'failed':reviewed===items.length?'complete':candidates===items.length?'成套审核':candidates?'running':'draft';
   const coverItem=items.find(item=>item.versions?.at(-1)?.url)||items.find(item=>item.sourceImages?.[0]?.url);
   const groupProject=linkedProject(links,[key],batch.projectId);
   const resolvedItems=items.map(item=>({...item,projectId:linkedProject(links,[key,`channel-resources:${item.id}`],item.projectId||groupProject)}));
   const projectIds=[...new Set(resolvedItems.map(item=>item.projectId).filter(Boolean))];
   const sources=resolvedItems.flatMap(item=>(item.sourceImages||[]).map(asset=>({...asset,projectId:item.projectId,itemId:item.id,channelId:batch.channel,resource:item.resource})));
   const outputs=resolvedItems.flatMap(item=>(item.versions||[]).map(version=>({...version,projectId:item.projectId,itemId:item.id,channelId:batch.channel,resource:item.resource,width:item.width,height:item.height,mime:fileMime({...version,format:item.format})})));
   groups.push({module:'channel-resources',key,id:items[0].id,batchId:batch.id,channelId:batch.channel,projectKey:project,project:items[0].taskName||`${project} · ${batch.name||batch.id}`,
    projectId:projectIds.length===1?projectIds[0]:groupProject,projectIds,items:resolvedItems,sources,outputs,status,reviewed:reviewed===items.length,
    channelName:channelNames.get(batch.channel)||batch.channel,itemCount:items.length,progress:candidates,total:items.length,
    phase:`${reviewed}/${items.length} 已验收 · ${candidates}/${items.length} 有候选`,createdAt:batch.createdAt,
    updatedAt:latestDate([batch.createdAt,...items.flatMap(item=>[item.updatedAt,item.editor?.updatedAt,item.review?.at,...(item.versions||[]).map(version=>version.createdAt)])]),
    cover:coverItem?.versions?.at(-1)?.url||coverItem?.sourceImages?.[0]?.url});
  }
 }
 return groups;
}

/** Ads use the same batch identity as the production module and retain every version. */
export function groupAdBatchTasks(data={},links={}) {
 const specs=data.catalog?.specs||[];
 const specById=new Map(specs.map(spec=>[spec.id,spec]));
 return (data.batches||[]).map(batch=>{
  const placements=specs.map(spec=>batch.items?.[spec.id]);
  const motionIncomplete=item=>Boolean(item?.motionJob&&item.motionJob.status!=='completed');
  const invalidated=placements.find(item=>item?.versions?.at(-1)?.invalidatedReason);
  const total=specs.length,candidates=placements.filter(item=>item?.versions?.length&&!item.versions.at(-1).invalidatedReason&&!motionIncomplete(item)).length;
  const delivered=Boolean(total&&batch.downloadedAt&&!invalidated&&!placements.some(motionIncomplete)&&!placements.some(item=>item?.draftDirty)&&specs.every((spec,index)=>placements[index]?.versions?.at(-1)?.number===batch.deliveredVersions?.[spec.id]));
  const outdated=Boolean(data.catalog?.sourceSha256&&batch.sourceSha256!==data.catalog.sourceSha256);
  const motionFailure=placements.find(item=>['failed','cancelled','result_uncertain'].includes(item?.motionJob?.status));
  const motionRunning=placements.some(item=>motionIncomplete(item)&&!['failed','cancelled','result_uncertain'].includes(item.motionJob.status));
  const failed=outdated||Boolean(invalidated)||Boolean(motionFailure)||placements.some(item=>item?.autoError&&!item.versions?.length);
    const automaticRunning=data.creationRunningBatchIds?.includes(batch.id);
    const status=failed?'failed':delivered?'complete':automaticRunning||motionRunning?'running':total&&candidates===total?'成套审核':candidates?'running':'draft';
  const latest=placements.map(item=>item?.versions?.at(-1)).filter(Boolean);
  const key=`ad-resources:${batch.id}`,projectId=linkedProject(links,[key],batch.projectId);
  const outputs=Object.entries(batch.items||{}).flatMap(([specId,item])=>(item.versions||[]).map(version=>({...version,specId,resource:(specById.get(specId)||batch.retiredSpecs?.find(spec=>spec.id===specId))?.name,mime:fileMime(version)})));
  return {...batch,module:'ad-resources',key,projectId,line:'performance-marketing',id:batch.id,project:batch.project||'未命名投放任务',status,reviewed:delivered,
     outputs,itemCount:total,progress:candidates,total,phase:automaticRunning?`正在自动制作 · ${candidates}/${total}`:`${candidates}/${total} 已生成${delivered?' · 已成套下载':' · 待成套下载'}`,
    error:outdated?'尺寸表已更新，请核对任务':invalidated?.versions.at(-1).invalidatedReason||motionFailure?.motionJob?.error||placements.find(item=>item?.autoError&&!item.versions?.length)?.autoError||'',
    updatedAt:latestDate([batch.updatedAt,batch.createdAt,batch.autoGeneratedAt,batch.downloadedAt,...placements.map(item=>item?.motionJob?.updatedAt),...outputs.map(version=>version.createdAt)]),
   cover:latest[0]?.url||batch.assets?.find(asset=>asset.role==='visual'&&!asset.nanoSourceAssetId)?.url||''};
 });
}

export function taskIndex(data={},jobs=[],links={},names={}) {
 const core=(data.tasks||[]).map(task=>({...task,key:`core:${task.id}`,projectId:linkedProject(links,[`core:${task.id}`],task.archiveProjectId??task.projectId),projectAssignmentExplicit:own(links,`core:${task.id}`),module:'core',label:task.project||task.name||'未命名任务',stage:'',line:task.businessLineId}));
 const external=jobs.map(task=>{const key=task.key||`${task.module}:${task.id}`;return {...task,key,label:task.project||task.name||'未命名任务',projectId:linkedProject(links,[key],task.projectId),projectAssignmentExplicit:own(links,key),
  line:task.line||(task.module==='ad-resources'?'performance-marketing':'channel-distribution'),stage:task.module==='channel-resources'?task.channelName||'':task.module==='ad-resources'?'投放资源位':task.module.endsWith('launch')?'测试和首发期':'预约期'};});
 return [...core,...external].map(task=>({...task,...(typeof names[task.key]==='string'&&names[task.key]?{sourceProject:task.project,project:names[task.key],label:names[task.key]}:{}),statusLabel:taskStatus(task)})).sort((a,b)=>(Date.parse(b.updatedAt||b.createdAt)||0)-(Date.parse(a.updatedAt||a.createdAt)||0));
}

export function taskBelongsToProject(task,projectId) {
 return projectId==='unfiled'?!task.projectId&&!task.projectIds?.length:task.projectId===projectId||task.projectIds?.includes(projectId);
}

/** Prefer the channel rule record when a core template explicitly cites that same record. */
export function specIndex(data={},index={}) {
 const rules=index.channelRules?.rules||[];
 const canonicalNumbers=new Set(rules.map(rule=>String(rule.编号??'')).filter(Boolean));
 const core=(data.templates||[]).filter(spec=>!(spec.sourceSpec?.channel==='huawei'&&canonicalNumbers.has(String(spec.sourceSpec.number??''))))
  .map(spec=>({...spec,module:'core',specId:spec.id,label:spec.name}));
 const stage=(index.sets||[]).flatMap(set=>(set.config.specs||[]).map((spec,number)=>({...spec,module:set.module,specId:spec.id??String(number),
  label:`${spec.channel} ${spec.width}×${spec.height} ${set.module.startsWith('store')?'商店图':'ICON'} · ${set.module.endsWith('launch')?'测试和首发期':'预约期'}`})));
 const channel=rules.map((rule,number)=>({...rule,module:'channel-resources',channelId:'huawei',specId:String(rule.编号??number),label:`华为 ${rule.资源位||''} ${rule.尺寸||''}`}));
 const ad=(index.ad?.catalog?.specs||[]).map(spec=>({...spec,module:'ad-resources',specId:spec.id,label:`${spec.platform||''} ${spec.name} ${spec.width}×${spec.height} 投放资源位`}));
 return [...core,...stage,...channel,...ad];
}

export function assetIndex(data={},tasks=[]) {
 const rows=[];
 const add=(asset,task,kind)=>{
  if(!asset?.url||asset.libraryDeletedAt||asset.projectLibraryRemovedAt)return;
  const projectId=task?.projectAssignmentExplicit?task.projectId||'':own(asset,'projectId')?asset.projectId:task?.projectId||'';
  const source={taskKey:task?.key||'',module:task?.module||'',taskId:task?.id||'',itemId:asset.itemId||'',channelId:asset.channelId||task?.channelId||'',specId:asset.specId||'',projectId};
  rows.push({...asset,name:asset.name||asset.file||asset.label||`${kind} ${asset.width||''}×${asset.height||''}`,taskKey:source.taskKey,taskLabel:task?.label||task?.project||'',projectId,kind,mime:fileMime(asset),sources:[source]});
  if(asset.originalUrl&&asset.originalUrl!==asset.url)add({...asset,url:asset.originalUrl,originalUrl:undefined,name:asset.originalName||asset.name,mime:asset.originalMime},task,'源素材');
 };
 for(const project of data.projects||[])for(const asset of project.assets||[])add({...asset,projectId:project.id},null,'源素材');
 for(const task of tasks){
  for(const asset of task.assets||[])add(asset,task,'源素材');
  for(const asset of task.sources||[])add(asset,task,'源素材');
  if(task.source)add(task.source,task,'源素材');
  for(const asset of task.localAi?.outputs||[])add(asset,task,'拆分素材');
  for(const set of Object.values(task.layerSets||{}))for(const asset of set?.manifest?.layers||[])add(asset,task,'拆分素材');
  for(const asset of task.artifacts||[])add(asset,task,'成品');
  for(const asset of task.outputs||[])add(asset,task,'成品');
 }
 // One visual entry per file/project/kind; retain every task/item source for navigation.
 const seen=new Map();
 for(const row of rows){const key=`${row.projectId}|${row.url}|${row.kind}`;if(!seen.has(key)){seen.set(key,row);continue;}const existing=seen.get(key);for(const source of row.sources)if(!existing.sources.some(value=>JSON.stringify(value)===JSON.stringify(source)))existing.sources.push(source);if(!existing.taskKey&&row.taskKey){existing.taskKey=row.taskKey;existing.taskLabel=row.taskLabel;}}
 return [...seen.values()];
}

/** Fetch once for all views. Failed optional modules stay visible as a warning. */
export async function loadWorkbenchIndex(data,api) {
 const moduleRequests=taskModules.map(async module=>{
  if(modules.includes(module)){
   const [jobs,config]=await Promise.allSettled([api(`/api/${module}/jobs`),api(`/api/${module}/specs`)]);
   if(jobs.status==='rejected')throw jobs.reason;
   return {module,jobs:jobs.value,config:config.status==='fulfilled'?config.value:{specs:[]},specsMissing:config.status==='rejected'};
  }
  const value=await api(`/api/${module}`);return {module,value};
 });
 const [outcomes,linksResult]=await Promise.all([Promise.allSettled(moduleRequests),Promise.allSettled([api('/api/workbench/project-links'),api('/api/channel-resources/rules'),api('/api/workbench/task-names')])]);
 const links=linksResult[0].status==='fulfilled'?linksResult[0].value:{};
 const fulfilled=outcomes.filter(result=>result.status==='fulfilled').map(result=>result.value);
 const sets=fulfilled.filter(result=>modules.includes(result.module));
 const channel=fulfilled.find(result=>result.module==='channel-resources')?.value||{};
 const ad=fulfilled.find(result=>result.module==='ad-resources')?.value||{};
 const jobs=[...sets.flatMap(set=>set.jobs.map(job=>({...job,module:set.module,cover:job.outputs?.[0]?.url||job.source?.url||job.sources?.[0]?.url||''}))),...groupChannelBatchTasks(channel,links),...groupAdBatchTasks(ad,links)];
 const tasks=taskIndex(data,jobs,links,linksResult[2].status==='fulfilled'?linksResult[2].value:{});
 return {tasks,assets:assetIndex(data,tasks),sets,channel,ad,channelRules:linksResult[1].status==='fulfilled'?linksResult[1].value:null,
  missingSpecs:sets.filter(set=>set.specsMissing).map(set=>set.module),missingLinks:linksResult[0].status==='rejected',
  missing:taskModules.filter(module=>!fulfilled.some(result=>result.module===module))};
}
