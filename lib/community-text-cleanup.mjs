import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {safeChild} from './core.mjs';
import {mutateJson} from './json-store.mjs';
import {eraseTextPixels} from '../public/text-erase.js';
import {commitCommunityTextCleanup,materialKind} from './community-materials.mjs';

const fail=(message,status=422)=>{throw Object.assign(Error(message),{status});};
const hash=value=>createHash('sha256').update(value).digest('hex');
export async function eraseCommunityTextPng(source,strokes){
 let decoded;try{decoded=await sharp(source,{limitInputPixels:40000000}).toColourspace('srgb').ensureAlpha().raw().toBuffer({resolveWithObject:true});}catch{fail('文案图片无法读取或尺寸过大，请重新选择透明 PNG 素材');}
 const {width,height}=decoded.info;let result;try{result=eraseTextPixels(decoded.data,width,height,strokes);}catch(error){fail(error.message);}
 if(!result.changedPixels)fail('还没有擦除到可见像素，请清理后再保存');
 if(!result.visiblePixels)fail('全部文字已被擦除，请撤销部分操作后再保存');
 const buffer=await sharp(result.data,{raw:{width,height,channels:4}}).png().toBuffer();
 return {buffer,width,height,changedPixels:result.changedPixels};
}
export function createCommunityTextCleanup({tasksFile,storageDir,templateMap,jobs,invalidate}){
 return {save:async(id,input)=>{
  if(!input||typeof input!=='object')fail('保存内容无效');
  if(!/^[a-zA-Z0-9-]{8,80}$/.test(input.requestId||''))fail('缺少保存操作编号');
  const signature=hash(JSON.stringify({kind:input.kind,sourceName:input.sourceName,strokes:input.strokes}));
  return mutateJson(tasksFile,async tasks=>{
   const task=tasks.find(t=>t.id===id);if(!task)fail('任务不存在',404);
   const duplicate=task.assets.find(a=>a.cleanupRequestId===input.requestId);
   if(duplicate){if(duplicate.cleanupInputSha256!==signature)fail('保存编号对应的擦除内容已变化，请重新打开清理工具',409);return task;}
   if(!templateMap.get(task.masterTemplateId)?.communityMaster||!['title','subtitle'].includes(input.kind))fail('请选择母版中的独立主标或副标素材');
   if(task.status==='已完成'&&task.deliveredPackage)fail('请先开始新版本再清理文案',409);
   if(jobs.has(id)||task.communityGeneration?.status==='running'||task.outpaint?.status==='running')fail('请等待当前生成完成后再清理文案',409);
   if(input.expectedUpdatedAt!==task.updatedAt)fail('画面已更新，原素材未覆盖；请返回画布后重新打开清理工具',409);
   const source=task.assets.find(a=>a.name===input.sourceName);
   if(!source||source.libraryDeletedAt||materialKind(source)!==input.kind||!source.mime?.startsWith('image/')||task.parameters?.assetByTemplate?.[task.masterTemplateId]?.[input.kind]!==source.name||task.parameters?.communityArtworkByTemplate?.[task.masterTemplateId])fail('当前文案素材已变化，请重新选中主标或副标',409);
   const sourceBytes=await fs.readFile(safeChild(storageDir,id,source.bucket||'assets',source.name));
   const result=await eraseCommunityTextPng(sourceBytes,input.strokes),name=`文案清理-${input.kind}-${input.requestId}.png`,now=new Date().toISOString();
   const dir=safeChild(storageDir,id,'assets');await fs.mkdir(dir,{recursive:true});await fs.writeFile(safeChild(dir,name),result.buffer);
   const asset={name,mime:'image/png',role:input.kind,materialKind:input.kind,width:result.width,height:result.height,bytes:result.buffer.length,url:`/storage/${id}/assets/${encodeURIComponent(name)}`,createdAt:now,generatorModel:'local-eraser',exactText:source.exactText||String(input.kind==='title'?task.copy:task.parameters.subtitleText||''),cleanupOf:source.name,cleanupRequestId:input.requestId,cleanupInputSha256:signature,cleanupSourceSha256:hash(sourceBytes),cleanupChangedPixels:result.changedPixels,cleanupOperation:'alpha-erase-v1',...(source.fontProvenance?{fontProvenance:structuredClone(source.fontProvenance)}:{})};
   commitCommunityTextCleanup(task,asset,input.kind,now);invalidate(task,'局部清理文案，待确认母版');return task;
  });
 }};
}
