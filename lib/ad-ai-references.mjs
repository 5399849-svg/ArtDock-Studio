import fs from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {safeChild} from './core.mjs';

export const AD_AI_REFERENCE_LIMIT=3;
export const AD_AI_REFERENCE_MAX_BYTES=10*1024*1024;
const fail=(message,status=422)=>Object.assign(Error(message),{status});
const hash=buffer=>createHash('sha256').update(buffer).digest('hex');
const selected=(batch,item)=>(item.aiEditReferenceIds||[]).map(id=>(batch.aiEditReferenceAssets||[]).find(a=>a.id===id)).filter(Boolean);
const filePath=(storageDir,batch,reference)=>{
  if(!/^reference-[a-f0-9-]{36}\.png$/.test(reference.storageName||'')||reference.url!==`/storage/ad-resources-${batch.id}/ai-reference/${reference.storageName}`)throw fail('修改参考图来源无效');
  return safeChild(storageDir,`ad-resources-${batch.id}`,'ai-reference',reference.storageName);
};

// Jobs hold immutable metadata, never a mutable pointer to the current selection.
export function snapshotAdAiReferences(batch,item,ids=[]){
  if(!Array.isArray(ids)||ids.length>AD_AI_REFERENCE_LIMIT||ids.some(id=>typeof id!=='string')||new Set(ids).size!==ids.length)throw fail('最多选择 3 张不同的修改参考图');
  const available=selected(batch,item);
  return ids.map(id=>{const ref=available.find(a=>a.id===id);if(!ref)throw fail('修改参考图已移除或不属于当前尺寸，请重新添加');return {...ref}});
}

export async function readAdAiReferenceBuffers({storageDir,batch,job}){
  return Promise.all((job.referenceImages||[]).map(async ref=>{
    const buffer=await fs.readFile(filePath(storageDir,batch,ref));
    if(hash(buffer)!==ref.sha256)throw fail('修改参考图文件已变化，请重新添加后生成');
    return buffer;
  }));
}

export function createAdAiReferences({storageDir,batches,save,assertFree}){
  // Serialize only uploads/removals; generation and other tasks remain independent.
  const queues=new Map();
  const serial=(batch,operation)=>{const pending=(queues.get(batch.id)||Promise.resolve()).catch(()=>{}).then(operation);queues.set(batch.id,pending);pending.finally(()=>{if(queues.get(batch.id)===pending)queues.delete(batch.id)}).catch(()=>{});return pending;};
  const check=(batch,item)=>{if(!batches.includes(batch))throw fail('投放任务已删除',409);assertFree(item);};
  const upload=(batch,item,buffer,name)=>serial(batch,async()=>{
    check(batch,item);
    if(!Buffer.isBuffer(buffer)||!buffer.length||buffer.length>AD_AI_REFERENCE_MAX_BYTES)throw fail('参考图须为 10MB 以内的 JPG、PNG 或 WebP',413);
    let normalized,meta;
    try{
      const image=sharp(buffer,{limitInputPixels:40000000});meta=await image.metadata();
      if(!['jpeg','png','webp'].includes(meta.format)||(meta.pages||1)>1)throw Error('format');
      normalized=await image.rotate().resize({width:2048,height:2048,fit:'inside',withoutEnlargement:true}).png().toBuffer({resolveWithObject:true});
    }catch{throw fail('参考图须为有效的 JPG、PNG 或 WebP 静态图片（不超过 4000 万像素）');}
    check(batch,item);
    const digest=hash(normalized.data),existing=(batch.aiEditReferenceAssets||[]).find(a=>a.sha256===digest);
    if(existing&&(item.aiEditReferenceIds||[]).includes(existing.id))return {references:selected(batch,item)};
    if((item.aiEditReferenceIds||[]).length>=AD_AI_REFERENCE_LIMIT)throw fail('最多添加 3 张修改参考图，请先移除一张');
    const id=randomUUID(),storageName=`reference-${id}.png`,reference=existing||{id,storageName,url:`/storage/ad-resources-${batch.id}/ai-reference/${storageName}`,name:String(name||'参考图.png').replace(/[\x00-\x1f]/g,'').slice(0,120),width:normalized.info.width,height:normalized.info.height,bytes:normalized.data.length,sha256:digest};
    if(!existing){await fs.mkdir(safeChild(storageDir,`ad-resources-${batch.id}`,'ai-reference'),{recursive:true});await fs.writeFile(filePath(storageDir,batch,reference),normalized.data);}
    try{check(batch,item);}catch(error){if(!existing)await fs.rm(filePath(storageDir,batch,reference),{force:true});throw error;}
    if(!existing)(batch.aiEditReferenceAssets||=[]).push(reference);
    (item.aiEditReferenceIds||=[]).push(reference.id);
    try{await save();}catch(error){item.aiEditReferenceIds=item.aiEditReferenceIds.filter(value=>value!==reference.id);if(!existing){batch.aiEditReferenceAssets=batch.aiEditReferenceAssets.filter(a=>a!==reference);await fs.rm(filePath(storageDir,batch,reference),{force:true});}throw error;}
    return {references:selected(batch,item)};
  });
  const remove=(batch,item,id)=>serial(batch,async()=>{
    check(batch,item);
    const previous=item.aiEditReferenceIds||[];item.aiEditReferenceIds=previous.filter(value=>value!==id);
    try{await save();}catch(error){item.aiEditReferenceIds=previous;throw error;}
    // A provider receipt may still need its exact input after restart. Retain one
    // shared file while any current selection or historical job references it.
    const used=Object.values(batch.items||{}).some(state=>(state.aiEditReferenceIds||[]).includes(id)||[state.aiEditJob,...(state.aiEditHistory||[])].some(job=>job?.referenceImages?.some(ref=>ref.id===id)));
    const reference=(batch.aiEditReferenceAssets||[]).find(a=>a.id===id);
    if(reference&&!used){batch.aiEditReferenceAssets=batch.aiEditReferenceAssets.filter(a=>a.id!==id);await save();await fs.rm(filePath(storageDir,batch,reference),{force:true});}
    return {references:selected(batch,item)};
  });
  return {list:(batch,item)=>({references:selected(batch,item)}),upload,remove};
}

export async function receiveAdAiReference(req){
  const chunks=[];let size=0;
  for await(const chunk of req){size+=chunk.length;if(size>AD_AI_REFERENCE_MAX_BYTES)throw fail('参考图不能超过 10MB',413);chunks.push(chunk);}
  return Buffer.concat(chunks);
}
