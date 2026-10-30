import fs from 'node:fs/promises';
import sharp from 'sharp';
import {randomUUID} from 'node:crypto';
import {mutateJson} from './json-store.mjs';
import {safeChild,artifactName,qcArtifact} from './core.mjs';
import {customCanvasTemplate} from '../public/custom-canvas-model.js';
const fail=(message,status=422)=>Object.assign(Error(message),{status});
export function createCustomCanvasExporter({tasksFile,storageDir,jobs=new Map()}){
 return async(id,input)=>{
  if(!/^[\w-]{8,80}$/.test(input.requestId||''))throw fail('缺少有效的导出请求编号');
  const match=/^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(input.dataUrl||'');if(!match||match[2].length>90*1048576)throw fail('导出图片无效');
  const buffer=Buffer.from(match[2],'base64'),meta=await sharp(buffer,{limitInputPixels:32_000_000}).metadata().catch(()=>null);if(!meta)throw fail('导出图片无法读取');
  let written;
  try{return await mutateJson(tasksFile,async tasks=>{
   const task=tasks.find(t=>t.id===id);if(!task)throw fail('任务不存在',404);if(!task.customCanvas)throw fail('此任务不是自定义尺寸任务');
   if(task.customCanvasExport?.requestId===input.requestId&&task.artifacts?.length)return task;
   if(jobs.has(id)||task.communityGeneration?.status==='running'||task.communityObjectJob?.status==='running'||task.outpaint?.status==='running')throw fail('请等待当前生成完成后再导出',409);
   if(input.expectedUpdatedAt!==task.updatedAt)throw fail('画布已更新，请保存后重新导出',409);
   const template=customCanvasTemplate(task.customCanvas),format=template.format==='PNG'?'png':'jpeg';
   if(meta.width!==template.width||meta.height!==template.height||meta.format!==format||match[1]!==format||buffer.length>template.maxBytes)throw fail(`成品须为 ${template.width}×${template.height} ${template.format}，且不超过 64MB`);
   const name=artifactName(task.project,template,task.version||1),directory=safeChild(storageDir,id,'artifacts');await fs.mkdir(directory,{recursive:true});
   // A unique physical name prevents a failed/stale request overwriting an earlier export.
   const physical=`custom-${randomUUID()}.${format==='png'?'png':'jpg'}`;written=safeChild(directory,physical);await fs.writeFile(written,buffer);
   const at=new Date().toISOString(),artifact={name:physical,displayName:name,mime:`image/${format}`,url:`/storage/${encodeURIComponent(id)}/artifacts/${physical}`,bytes:buffer.length,templateId:template.id,width:meta.width,height:meta.height,format:template.format,templateApplied:true,createdAt:at};artifact.qc=qcArtifact(artifact,template);
   task.artifacts=[artifact];task.qc={passed:true,checkedAt:at};task.status='已完成';task.visualReview={status:'approved',note:'设计师导出当前自定义画布'};task.customCanvasExport={requestId:input.requestId,at,version:task.version||1};task.updatedAt=at;
   (task.history||=[]).push({at,action:`导出自定义画布 ${template.width}×${template.height} ${template.format}`,by:'设计师',status:task.status});return task;
  });}catch(e){if(written)await fs.unlink(written).catch(()=>{});throw e;}
 };
}
