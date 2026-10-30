import {mutateJson} from './json-store.mjs';
import {customCanvasSpec} from '../public/custom-canvas-model.js';
import {customTargetTemplate,registerCustomTargets} from '../public/custom-target-sizes.js';
const fail=(message,status=422)=>{throw Object.assign(Error(message),{status});};
export function createTaskTargetSizes({tasksFile,templateMap,jobs=new Map(),invalidate=()=>{},reconcile=()=>{}}){
 return (id,input)=>mutateJson(tasksFile,tasks=>{
  const task=tasks.find(t=>t.id===id);if(!task)fail('任务不存在',404);
  if(task.customCanvas)fail('自定义画布任务请使用修改画布尺寸');
  if(jobs.has(id)||task.communityGeneration?.status==='running'||task.communityObjectJob?.status==='running'||task.outpaint?.status==='running')fail('请等待当前生成完成后再调整尺寸',409);
  if(task.status==='已完成'&&task.deliveredPackage)fail('请先开始新版本再调整尺寸',409);
  if(!input||input.expectedUpdatedAt!==task.updatedAt)fail('任务已更新，请刷新后再调整尺寸',409);
  if(input.action==='remove'){
   const removed=input.templateIds;
   if(!Array.isArray(removed)||!removed.length||new Set(removed).size!==removed.length||removed.some(tid=>!task.targetTemplateIds.includes(tid)))fail('请选择当前任务中的目标尺寸');
   if(removed.includes(task.masterTemplateId))fail('母版尺寸不能移除');
   if(removed.length>=task.targetTemplateIds.length)fail('请至少保留一个目标尺寸');
   const at=new Date().toISOString();
   (task.targetSizeChanges||=[]).push({at,removed:[...removed],previousTargetTemplateIds:[...task.targetTemplateIds],version:task.version,artifacts:structuredClone(task.artifacts||[]),pagePreviews:structuredClone(task.pagePreviews||[]),qc:structuredClone(task.qc??null)});
   // Keep per-size layouts, definitions and every asset reference for history and re-adding.
   task.targetTemplateIds=task.targetTemplateIds.filter(tid=>!removed.includes(tid));
   invalidate(task,'移除目标尺寸，保留源素材、排版与历史成品');
   if(templateMap.get(task.masterTemplateId)?.communityPlacement)reconcile(task);
   task.updatedAt=at;(task.history||=[]).push({at,action:`移除 ${removed.length} 个目标尺寸，保留素材及历史`,by:'设计师',status:task.status});
   return task;
  }
  if(input.action&&input.action!=='add')fail('尺寸操作无效');
  const selected=input.templateIds??[],custom=input.customSizes??[];
  if(!Array.isArray(selected)||!Array.isArray(custom)||selected.length+custom.length>100)fail('添加尺寸数量无效');
  const master=templateMap.get(task.masterTemplateId);
  if(custom.length&&!master?.communityPlacement)fail('请在 Banner 尺寸延展中添加自定义尺寸');
  let specs;try{specs=custom.map(customCanvasSpec);}catch(error){fail(error.message);}
  const newTemplates=specs.map(customTargetTemplate);
  for(const id of selected){const t=templateMap.get(id);if(!t||t.communityMaster||t.customTarget||t.businessLineId!==task.businessLineId||!(task.segmentIds?.includes(t.segmentId)||task.segmentId===t.segmentId))fail('请选择当前业务的常用尺寸');}
  const existing=new Set(task.targetTemplateIds),added=[...new Set([...selected,...newTemplates.map(t=>t.id)])].filter(id=>!existing.has(id));
  if(!added.length){if(!selected.length&&!specs.length)fail('请选择常用尺寸或填写自定义尺寸');return task;}
  const at=new Date().toISOString();
  (task.targetSizeChanges||=[]).push({at,added,previousTargetTemplateIds:[...task.targetTemplateIds],version:task.version,artifacts:structuredClone(task.artifacts||[]),pagePreviews:structuredClone(task.pagePreviews||[])});
  const savedSpecs=new Map((task.customTargetSizes||[]).map(s=>[customTargetTemplate(s).id,s]));
  for(const spec of specs)savedSpecs.set(customTargetTemplate(spec).id,spec);
  if(savedSpecs.size)task.customTargetSizes=[...savedSpecs.values()];
  registerCustomTargets(task,templateMap);task.targetTemplateIds=[...task.targetTemplateIds,...added];
  invalidate(task,'添加目标尺寸，保留原尺寸构图与历史成品');
  if(master?.communityPlacement)reconcile(task);
  task.updatedAt=at;(task.history||=[]).push({at,action:`添加 ${added.length} 个目标尺寸`,by:'设计师',status:task.status});
  return task;
 });
}
