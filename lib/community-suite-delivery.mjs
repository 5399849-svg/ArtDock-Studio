import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {mutateJson} from './json-store.mjs';
import {safeChild,createStoreZip,sanitizeFileName,qcArtifact} from './core.mjs';
import {taskArtifactExportName} from './task-export-names.mjs';
import {communityTargetReviewSnapshot} from '../public/community-artwork-state.js';
const fail=message=>Object.assign(Error(message),{status:409});
// Confirming the complete set and creating its immutable archive are one operation.
// Merely previewing, generating or downloading one image never completes a task.
export function createCommunitySuiteDelivery({tasksFile,storageDir,templateMap,jobs,assertReady}){
 return async(id,input)=>{
  let written;
  try{return await mutateJson(tasksFile,async tasks=>{
   const task=tasks.find(t=>t.id===id);if(!task)throw Object.assign(Error('任务不存在'),{status:404});
   if(input.confirmed!==true)throw fail('请确认当前整套尺寸稿后下载');
   if(input.expectedUpdatedAt!==task.updatedAt)throw fail('尺寸稿已更新，请刷新后再确认下载');
   if(jobs.has(id)||['communityGeneration','communityObjectJob','outpaint'].some(k=>task[k]?.status==='running'))throw fail('请等待当前处理完成');
   if(task.status==='已完成'&&task.deliveredPackage){await fs.access(safeChild(storageDir,id,'deliveries',task.deliveredPackage.name));return task;}
   const ids=task.targetTemplateIds||[],templates=ids.map(id=>templateMap.get(id)),artifacts=task.artifacts||[];
   if(task.customCanvas||!ids.length||templates.some(t=>!t?.communityPlacement))throw fail('此操作用于平台社区整套素材');
   if(task.qc?.passed!==true||artifacts.length!==ids.length||new Set(artifacts.map(a=>a.templateId)).size!==ids.length||ids.some(id=>!artifacts.some(a=>a.templateId===id)))throw fail('请先生成全部尺寸并通过技术质检');
   await assertReady(task,templates);
   const files=[];
   for(const artifact of artifacts){
    const template=templateMap.get(artifact.templateId),buffer=await fs.readFile(safeChild(storageDir,id,'artifacts',artifact.name)),m=await sharp(buffer,{limitInputPixels:40000000}).metadata();
    const checked={...artifact,width:m.width,height:m.height,format:m.format==='jpeg'?'JPG':m.format.toUpperCase(),bytes:buffer.length};
    if(!qcArtifact(checked,template).passed)throw fail(`${template.name} 成品不符合当前尺寸规范，请重新输出`);
    files.push({name:'01_Banner成品/'+taskArtifactExportName(task,artifact,template),data:buffer});
   }
   for(const preview of task.pagePreviews||[])files.push({name:'02_页面效果预览/'+preview.name,data:await fs.readFile(safeChild(storageDir,id,'previews',preview.name))});
   const at=new Date().toISOString(),review={status:'approved',at,by:'设计师',note:'设计师确认整套尺寸稿并下载'};
   const report={packageType:'confirmed-materials',taskId:id,project:task.project,version:task.version,status:'已完成',qc:task.qc,visualReview:review,artifacts:artifacts.map(a=>({...a,name:taskArtifactExportName(task,a,templateMap.get(a.templateId))})),pagePreviews:task.pagePreviews||[]};
   files.push({name:'03_生产与质检报告/生产与质检报告.json',data:Buffer.from(JSON.stringify(report,null,2))});
   const zip=createStoreZip(files),name=`${sanitizeFileName(task.project)}_成套素材_v${task.version}.zip`,destination=safeChild(storageDir,id,'deliveries',name);await fs.mkdir(path.dirname(destination),{recursive:true});
   await fs.writeFile(destination,zip,{flag:'wx'});written=destination;
   task.deliveredPackage={name,version:task.version,bytes:zip.length,sha256:createHash('sha256').update(zip).digest('hex'),at,targetTemplateIds:[...ids]};
   task.status='已完成';task.visualReview=review;task.unreleasedChanges=false;task.updatedAt=at;
   for(const template of templates)(task.communityTargetReviews||={})[template.id]={at,by:'设计师',snapshot:structuredClone(communityTargetReviewSnapshot(task,template))};
   (task.history||=[]).push({at,action:`确认并下载整套素材（${ids.length} 张），归档当前版本`,by:'设计师',status:task.status});return task;
  });}catch(error){if(written)await fs.unlink(written).catch(()=>{});throw error;}
 };
}
