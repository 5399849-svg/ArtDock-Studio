import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {adAiProportionRepair} from './ad-ai-proportion.mjs';

function cleanOriginal(batch,original){
  if(!original?.hasEmbeddedLogo)return original;
  // PSD import saves the clean composite alongside the logo-bearing original.
  // Use only its exact sibling, never another artwork in the same task.
  return batch.assets.find(a=>a.role==='visual'&&a.derivedFrom===original.id&&a.sourceFormat===original.sourceFormat&&a.hasEmbeddedLogo===false&&a.width===original.width&&a.height===original.height)||original;
}

// Follow only this artwork's lineage. Another upload in the same batch can be
// an unrelated design or a logo and must never become an implicit reference.
export function adAiOriginalReference(batch,source,instruction=''){
  const colourReference=batch.assets.find(a=>a.id===source?.toneReferenceAssetId&&a.role==='visual');
  if(colourReference&&colourReference.id!==source.id&&!adAiProportionRepair(instruction))return cleanOriginal(batch,colourReference);
  if(!/(?:原图|原始图|原稿|源图)/.test(instruction)&&!adAiProportionRepair(instruction))return null;
  const seen=new Set();let original=source;
  while(original&&!seen.has(original.id)){
    seen.add(original.id);
    const parentId=original.aiSourceAssetId||original.nanoSourceAssetId||original.safeSourceAssetId||original.portraitSourceAssetId||original.derivedFrom;
    const parent=batch.assets.find(a=>a.id===parentId&&a.role==='visual');
    if(!parent||seen.has(parent.id))break;
    original=parent;
  }
  original=cleanOriginal(batch,original);
  return original&&original.id!==source.id?original:null;
}

export async function readAdAiOriginalReference({batch,job,workDir,assetBuffer}){
  if(!job.originalReferenceAssetId)return null;
  const file=path.join(workDir,'original-reference.png');
  try{return await fs.readFile(file)}catch(error){if(error.code!=='ENOENT')throw error}
  const asset=batch.assets.find(a=>a.id===job.originalReferenceAssetId&&a.role==='visual');
  if(!asset)throw new Error('本次修改引用的原图不存在，请恢复原图后再生成');
  const buffer=await sharp(await assetBuffer(batch,asset)).rotate().resize({width:2048,height:2048,fit:'inside',withoutEnlargement:true}).png().toBuffer();
  await fs.writeFile(file,buffer);return buffer;
}
