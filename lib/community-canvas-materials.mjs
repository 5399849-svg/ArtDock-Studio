import fs from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {safeChild} from './core.mjs';
import {mutateJson} from './json-store.mjs';
import {isSourceAdaptation} from '../public/source-adaptation-model.js';
import {validateCommunityObjectLayers} from '../public/community-object-layers.js';
const fail=(message,status=422)=>Object.assign(Error(message),{status});
export function createCommunityCanvasMaterials({tasksFile,storageDir,templateMap,jobs,readProjectMaterial,invalidate}){
 return async(id,input)=>{let written;try{return await mutateJson(tasksFile,async tasks=>{
  const task=tasks.find(t=>t.id===id),template=templateMap.get(input.templateId);
  if(!task)throw fail('任务不存在',404);
  if(isSourceAdaptation(task)||!task.targetTemplateIds.includes(input.templateId)||!template?.communityPlacement)throw fail('请选择当前任务的尺寸画布');
  if(task.status==='已完成'&&task.deliveredPackage)throw fail('请先开始新版本',409);
  if(input.expectedUpdatedAt!==task.updatedAt)throw fail('任务已更新，请刷新后重试',409);
  if(jobs.has(id)||['communityGeneration','communityObjectJob','outpaint'].some(k=>task[k]?.status==='running'))throw fail('请等待当前生成完成',409);
  const p=task.parameters||={},layers=p.communityObjectLayersByTemplate?.[template.id]||[];
  if(layers.length>=32)throw fail('当前画布最多放入 32 个独立素材');
  let buffer,label,origin;
  if(input.projectAssetId){const material=await readProjectMaterial(task,input.projectAssetId);buffer=material.buffer;label=material.asset.displayName||material.asset.name;origin={projectId:task.projectId,assetId:input.projectAssetId};}
  else {const match=/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(input.dataUrl||'');if(!match)throw fail('请选择 PNG、JPG 或 WebP 图片');buffer=Buffer.from(match[2],'base64');label=input.name||'新增素材';}
  if(buffer.length>25*1048576)throw fail('素材不能超过 25 MB');
  const image=sharp(buffer,{limitInputPixels:40000000}),meta=await image.metadata();if(!['png','jpeg','webp'].includes(meta.format))throw fail('素材格式无效');
  // Normalize orientation once so thumbnail, browser canvas and export share dimensions.
  const normalized=await image.rotate().png().toBuffer({resolveWithObject:true}),name=`画布素材-${randomUUID()}.png`,groupId=randomUUID(),time=new Date().toISOString();
  const asset={name,label:String(label).slice(0,150),role:'supplement',canvasTemplateId:template.id,mime:'image/png',width:normalized.info.width,height:normalized.info.height,bytes:normalized.data.length,url:`/storage/${id}/assets/${encodeURIComponent(name)}`,createdAt:time,...(origin?{projectLibrarySource:origin}:{})};
  const layer={id:`material:${groupId}`,appearance:{kind:'material',groupId,name:asset.label,assetName:name,aspect:asset.width/asset.height},x:.5,y:.5,size:.4};
  task.assets.push(asset);(p.communityObjectLayersByTemplate||={})[template.id]=[...layers,layer];validateCommunityObjectLayers(task,{[template.id]:p.communityObjectLayersByTemplate[template.id]},[template.id]);
  const folder=safeChild(storageDir,id,'assets');await fs.mkdir(folder,{recursive:true});written=safeChild(folder,name);await fs.writeFile(written,normalized.data,{flag:'wx'});
  if(task.communityTargetReviews)delete task.communityTargetReviews[template.id];invalidate(task,'新增画布素材');task.updatedAt=time;
  (task.history||=[]).push({at:time,action:`为 ${template.width}×${template.height} 新增素材：${asset.label}`,by:'设计师',status:task.status});return task;
 });}catch(e){if(written)await fs.unlink(written).catch(()=>{});throw e;}};
}
