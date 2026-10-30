import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import sharp from 'sharp';
import {safeChild} from './core.mjs';
import {PSD_UPLOAD_MAX_BYTES,IMAGE_UPLOAD_MAX_BYTES} from '../public/ad-upload-policy.js';

const invalid=(message,status=422)=>Object.assign(new Error(message),{status});
const logoFreeName=/(?:无\s*logo|不含\s*logo|no[-_ ]?logo|纯图|clean)/i;
const logoName=/(?:^|[-_ ])lg(?:[-_. ]|$)|logo|带标语|带\s*logo|含\s*logo/i;
const namedAsLogoBearing=name=>!logoFreeName.test(String(name||''))&&logoName.test(String(name||''));
const formats={'.psd':'application/x-photoshop','.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.webp':'image/webp'};
const photoshopTypes=new Set(['application/x-photoshop','application/vnd.adobe.photoshop','image/vnd.adobe.photoshop','image/photoshop']);
const emptyTypes=new Set(['','application/octet-stream']);
const limitMessage=isPsd=>isPsd?'PSD 素材不能超过 500MB':'图片素材不能超过 20MB';

export function adUploadType(name,contentType=''){
  const mime=formats[path.extname(String(name||'')).toLowerCase()];
  if(!mime)throw invalid('仅支持 JPG、PNG、WebP 或 PSD 文件');
  const declared=String(contentType||'').split(';')[0].trim().toLowerCase();
  const isPsd=mime==='application/x-photoshop';
  if(!emptyTypes.has(declared)&&!(isPsd?photoshopTypes.has(declared):declared===mime))throw invalid('素材文件名与格式不一致');
  return {mime,isPsd,maxBytes:isPsd?PSD_UPLOAD_MAX_BYTES:IMAGE_UPLOAD_MAX_BYTES};
}

export function validateAdUploadSize(bytes,isPsd){
  if(!Number.isSafeInteger(bytes)||bytes<1)throw invalid('上传素材为空');
  if(bytes>(isPsd?PSD_UPLOAD_MAX_BYTES:IMAGE_UPLOAD_MAX_BYTES))throw invalid(limitMessage(isPsd),413);
}

// Keep request bytes on disk rather than retaining a base64 string and decoded
// copy in memory. The random staging directory belongs only to this request.
export async function receiveAdAssetUpload(req,{runtimeDir,name,mime}){
  const type=adUploadType(name,mime);
  const header=req.headers?.['content-length'];
  let expected=null;
  if(header!==undefined){
    if(!/^\d+$/.test(String(header))||!Number.isSafeInteger(Number(header)))throw invalid('上传文件大小无效',400);
    expected=Number(header);validateAdUploadSize(expected,type.isPsd);
  }
  const parent=safeChild(runtimeDir,'ad-uploads');
  await fs.mkdir(parent,{recursive:true});
  const directory=await fs.mkdtemp(path.join(parent,'upload-'));
  const sourcePath=path.join(directory,'source');
  let file=null,bytes=0;const digest=createHash('sha256');
  try{
    file=await fs.open(sourcePath,'wx');
    const chunks=typeof req.iterator==='function'?req.iterator({destroyOnReturn:false}):req;
    for await(const chunk of chunks){
      bytes+=chunk.length;
      digest.update(chunk);
      if(bytes>type.maxBytes)throw invalid(limitMessage(type.isPsd),413);
      await file.writeFile(chunk);
    }
    if(req.aborted||req.complete===false)throw invalid('素材上传已中断',400);
    validateAdUploadSize(bytes,type.isPsd);
    if(expected!==null&&bytes!==expected)throw invalid('上传文件不完整，请重试',400);
    await file.close();file=null;
    return {...type,name,directory,sourcePath,bytes,sha256:digest.digest('hex'),cleanup:()=>fs.rm(directory,{recursive:true,force:true})};
  }catch(error){
    await file?.close().catch(()=>{});
    await fs.rm(directory,{recursive:true,force:true});
    // A size rejection must still be able to send a JSON 413 response.
    if(!req.destroyed)req.resume?.();
    throw error;
  }
}

export async function stageLegacyAdAsset(buffer,{runtimeDir,name,mime}){
  const isPsd=mime==='application/x-photoshop';
  if(!isPsd&&!['image/jpeg','image/png','image/webp'].includes(mime))throw invalid('源图请使用 JPG、PNG、WebP 或 PSD；GIF 成品可在对应交付稿上传');
  validateAdUploadSize(buffer.length,isPsd);
  const parent=safeChild(runtimeDir,'ad-uploads');await fs.mkdir(parent,{recursive:true});
  const directory=await fs.mkdtemp(path.join(parent,'upload-')),sourcePath=path.join(directory,'source');
  try{await fs.writeFile(sourcePath,buffer);return {isPsd,mime,name,bytes:buffer.length,directory,sourcePath,cleanup:()=>fs.rm(directory,{recursive:true,force:true})}}
  catch(error){await fs.rm(directory,{recursive:true,force:true});throw error}
}

async function validatePsdHeader(sourcePath){
  const file=await fs.open(sourcePath,'r'),header=Buffer.alloc(26);
  let count;
  try{({bytesRead:count}=await file.read(header,0,26,0))}finally{await file.close()}
  const height=header.readUInt32BE(14),width=header.readUInt32BE(18),channels=header.readUInt16BE(12),depth=header.readUInt16BE(22);
  if(count!==26||header.toString('ascii',0,4)!=='8BPS'||header.readUInt16BE(4)!==1||!width||!height||width>30000||height>30000||width*height>30000000||channels<1||channels>56||![8,16,32].includes(depth))throw invalid('PSD 文件无效、尺寸过大或为不支持的 PSB');
}

// Extraction and content checks finish in staging before files or asset records
// become visible to the task. The source is passed to Python as a file path.
export async function prepareAdAssetUpload(upload,{batchId,role='visual',storageDir,extractPsd}){
  const {isPsd,mime,name,sourcePath,directory}=upload;
  validateAdUploadSize(upload.bytes,isPsd);
  const ext=isPsd?'png':mime==='image/jpeg'?'jpg':mime.split('/').at(-1);
  const file=`${role}-${randomUUID()}.${ext}`,folder=`ad-resources-${batchId}`;
  const target=path.join(directory,file),entries=[];
  let psdInfo={logoSeparated:false},cleanFile='',logoFile='',motionSceneFile='',motionOverlayFile='';
  if(isPsd){
    await validatePsdHeader(sourcePath);
    cleanFile=`visual-clean-${randomUUID()}.png`;logoFile=`logo-${randomUUID()}.png`;
    motionSceneFile=`motion-scene-${randomUUID()}.png`;motionOverlayFile=`motion-type-${randomUUID()}.png`;
    psdInfo=await extractPsd({original:sourcePath,target,cleanTarget:path.join(directory,cleanFile),logoTarget:path.join(directory,logoFile),motionSceneTarget:path.join(directory,motionSceneFile),motionOverlayTarget:path.join(directory,motionOverlayFile)});
    entries.push({source:sourcePath,file:`original-${randomUUID()}.psd`});
  }else await fs.copyFile(sourcePath,target);
  const meta=await sharp(target).metadata().catch(()=>null);
  if(!meta?.width||!meta?.height||meta.width*meta.height>30000000)throw invalid('素材尺寸无效或过大');
  if(meta.format!==(isPsd?'png':mime.split('/').at(-1)))throw invalid('素材文件内容与格式不一致');
  entries.push({source:target,file});
  const embeddedLogo=Boolean(isPsd&&psdInfo.logoSeparated&&(psdInfo.logoVisible||psdInfo.logoRemaining)||namedAsLogoBearing(name));
  const verifiedLogoFree=Boolean(isPsd&&psdInfo.logoSeparated&&psdInfo.logoFree);
  const asset={id:randomUUID(),role,name:String(name||'上传素材').slice(0,100),width:meta.width,height:meta.height,url:`/storage/${folder}/asset/${file}`,sourceFormat:isPsd?'PSD':meta.format.toUpperCase(),hasEmbeddedLogo:role==='visual'&&embeddedLogo,logoFree:role==='visual'&&(isPsd?verifiedLogoFree:!embeddedLogo&&logoFreeName.test(String(name||'')))};
  const derivedAssets=[];
  let motionLayers={};
  if(role==='visual'&&psdInfo.motionLayersSeparated){
    for(const file of [motionSceneFile,motionOverlayFile]){
      const source=path.join(directory,file),info=await sharp(source).metadata();
      if(info.format!=='png'||info.width!==meta.width||info.height!==meta.height)throw invalid('PSD 动效原生分层尺寸无效');
      entries.push({source,file});
    }
    motionLayers={motionSceneUrl:`/storage/${folder}/asset/${motionSceneFile}`,motionOverlayUrl:`/storage/${folder}/asset/${motionOverlayFile}`};
    Object.assign(asset,motionLayers);
  }
  if(role==='visual'&&psdInfo.logoSeparated){
    const cleanPath=path.join(directory,cleanFile),logoPath=path.join(directory,logoFile);
    const [cleanMeta,logoMeta]=await Promise.all([sharp(cleanPath).metadata(),sharp(logoPath).metadata()]);
    if(cleanMeta.format!=='png'||cleanMeta.width!==meta.width||cleanMeta.height!==meta.height||logoMeta.format!=='png'||!logoMeta.width||!logoMeta.height)throw invalid('PSD 纯图或 Logo 导出无效');
    const base=asset.name.replace(/\.psd$/i,'');
    derivedAssets.push({id:randomUUID(),role:'visual',name:`${base}_${verifiedLogoFree?'纯图':'背景待清理'}.png`,width:meta.width,height:meta.height,url:`/storage/${folder}/asset/${cleanFile}`,sourceFormat:'PSD',logoFree:verifiedLogoFree,hasEmbeddedLogo:Boolean(psdInfo.logoRemaining),derivedFrom:asset.id,...motionLayers});
    derivedAssets.push({id:randomUUID(),role:'logo',name:`${base}_Logo.png`,width:logoMeta.width,height:logoMeta.height,url:`/storage/${folder}/asset/${logoFile}`,sourceFormat:'PSD',derivedFrom:asset.id,originalBounds:psdInfo.logoBounds,sourceWidth:meta.width,sourceHeight:meta.height});
    entries.push({source:cleanPath,file:cleanFile},{source:logoPath,file:logoFile});
  }
  const published=[];
  const warnings=role==='visual'&&isPsd&&psdInfo.logoSeparated&&!verifiedLogoFree?['PSD 的底图仍含原 Logo，导出的背景不能作为无 Logo 素材；带 Logo 尺寸将保留底图中的 Logo，不再叠加第二个。']:[];
  return {asset,derivedAssets,warnings,
    async publish(){
      const targetDir=safeChild(storageDir,folder,'asset');await fs.mkdir(targetDir,{recursive:true});
      try{for(const entry of entries){const dest=safeChild(targetDir,entry.file);await fs.copyFile(entry.source,dest,fs.constants.COPYFILE_EXCL);published.push(dest)}}
      catch(error){await this.rollback();throw error}
    },
    async rollback(){await Promise.all(published.splice(0).map(filePath=>fs.rm(filePath,{force:true})))}
  };
}
