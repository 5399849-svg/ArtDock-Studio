import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {createCanvas,submitGeneration,pollJob,downloadRaw,nearestBananaRatio} from './ai-huabu.mjs';
import {nativeAdAiFrame,padAdAiInput,normalizeAdAiOutput} from './ad-ai-frame.mjs';
import {writeJson} from './json-store.mjs';
import {nativeNanoChannel} from './ad-ai-edit.mjs';
import {loadCanvasConfig} from '../platform/canvas.mjs';

const hash=b=>createHash('sha256').update(b).digest('hex');
// Expand the removal mask to include antialiasing and small contact shadows.
export async function sourceRemovalMask(sourceBuffer,cutouts,selections=[]){
 const {data,info}=await sharp(sourceBuffer).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const {width:w,height:h}=info,mask=Buffer.alloc(w*h);
 for(let i=0;i<mask.length;i++)if(data[i*4+3]<240)mask[i]=255;
 for(const selection of selections){
  const [x1,y1,x2,y2]=selection.box.map((n,i)=>Math.max(0,Math.min(i%2?h:w,Math.round(n*(i%2?h:w)))));
  for(let y=y1;y<y2;y++)mask.fill(255,y*w+x1,y*w+x2);
 }
 for(const cutout of cutouts){
  const {data:alpha,info:m}=await sharp(cutout.buffer).ensureAlpha().extractChannel(3).raw().toBuffer({resolveWithObject:true});
  for(let y=0;y<m.height;y++)for(let x=0;x<m.width;x++)if(alpha[y*m.width+x]>8){
   const px=x+cutout.bounds.left,py=y+cutout.bounds.top;if(px>=0&&py>=0&&px<w&&py<h)mask[py*w+px]=255;
  }
 }
 const radius=Math.max(3,Math.round(Math.max(w,h)*.006)),horizontal=Buffer.alloc(w*h),expanded=Buffer.alloc(w*h);
 for(let y=0;y<h;y++){let n=0;for(let x=-radius;x<w;x++){const add=x+radius;if(add<w&&add>=0)n+=mask[y*w+add]>0;const remove=x-radius-1;if(remove>=0)n-=mask[y*w+remove]>0;if(x>=0)horizontal[y*w+x]=n?255:0;}}
 for(let x=0;x<w;x++){let n=0;for(let y=-radius;y<h;y++){const add=y+radius;if(add<h&&add>=0)n+=horizontal[add*w+x]>0;const remove=y-radius-1;if(remove>=0)n-=horizontal[remove*w+x]>0;if(y>=0)expanded[y*w+x]=n?255:0;}}
 return sharp(expanded,{raw:{width:w,height:h,channels:1}}).png().toBuffer();
}

export async function prepareSourceRepairInput(sourceBuffer,maskBuffer){
 const {data,info}=await sharp(sourceBuffer).flatten({background:'#ffffff'}).removeAlpha().raw().toBuffer({resolveWithObject:true});
 const mask=await sharp(maskBuffer).greyscale().raw().toBuffer();
 if(mask.length!==info.width*info.height)throw Error('背景修补遮罩尺寸不一致');
 for(let i=0;i<mask.length;i++)if(mask[i]){data[i*3]=255;data[i*3+1]=0;data[i*3+2]=255;}
 return sharp(data,{raw:info}).png().toBuffer();
}

export async function finishSourceRepair(sourceBuffer,generated,maskBuffer){
 const [source,result]=await Promise.all([sourceBuffer,generated].map(b=>sharp(b).flatten({background:'#ffffff'}).removeAlpha().raw().toBuffer({resolveWithObject:true})));
 if(source.info.width!==result.info.width||source.info.height!==result.info.height)throw Error('补全背景尺寸不一致');
 const mask=await sharp(maskBuffer).greyscale().raw().toBuffer(),soft=await sharp(maskBuffer).greyscale().blur(1.2).raw().toBuffer();
 let area=0,magenta=0,difference=0;
 for(let i=0;i<mask.length;i++){
  if(mask[i]){area++;if(result.data[i*3]>235&&result.data[i*3+1]<35&&result.data[i*3+2]>235)magenta++;for(let c=0;c<3;c++)difference+=Math.abs(source.data[i*3+c]-result.data[i*3+c]);}
  const a=Math.max(mask[i],soft[i])/255;if(a)for(let c=0;c<3;c++)source.data[i*3+c]=Math.round(source.data[i*3+c]*(1-a)+result.data[i*3+c]*a);
 }
 if(!area||magenta/area>.01||difference/(area*3)<1)throw Error('背景补全未通过检查，原稿和已保存的结果仍保留，可继续处理');
 return sharp(source.data,{raw:source.info}).png().toBuffer();
}

// Receipts and the paid raw image survive retries/restarts. Retrying the same
// source and mask reuses its result and never creates another generation intent.
export function createSourceSceneRepair(provider={createCanvas,submitGeneration,pollJob,downloadRaw,resolveChannel:config=>nativeNanoChannel(config,fetch,'banana_pro')}){
 const running=new Map();
 return async function repair({root,storageDir,task,sourceBuffer,maskBuffer}){
  const config=await loadCanvasConfig(task,{root});
  const meta=await sharp(sourceBuffer).metadata(),spec={width:meta.width,height:meta.height},frame=nativeAdAiFrame(spec),ratio=frame?.ratio||nearestBananaRatio(meta.width,meta.height);
  const masked=await prepareSourceRepairInput(sourceBuffer,maskBuffer),input=await padAdAiInput(masked,frame);
  const key=hash(Buffer.concat([Buffer.from('source-background-v1:banana_pro:'+hash(Buffer.from(config.apiRoot+(config.accountId||config.token)))),sourceBuffer,maskBuffer]));
  const directory=path.join(storageDir,task.id,'source-background-jobs',key);
  if(running.has(directory))return running.get(directory);
  const operation=(async()=>{
   await fs.mkdir(directory,{recursive:true});const receiptFile=path.join(directory,'receipt.json'),rawFile=path.join(directory,'raw.png'),resultFile=path.join(directory,'background.png');
   const read=async file=>fs.readFile(file).catch(e=>{if(e.code!=='ENOENT')throw e;return null;});
   const cached=await read(resultFile);if(cached)return cached;
   const saved=await read(receiptFile),receipt=saved?JSON.parse(saved):{idempotencyKey:key.slice(0,32),sourceHash:task.sourceAdaptation.sourceHash,maskHash:hash(maskBuffer),createdAt:new Date().toISOString()};
   const save=async()=>{receipt.updatedAt=new Date().toISOString();await writeJson(receiptFile,receipt);};
   try{
    let raw=await read(rawFile);
    if(!raw){
     if(receipt.channel===undefined){receipt.channel=provider.resolveChannel?await provider.resolveChannel(config):'';await save();}
     if(!receipt.canvasId){receipt.canvasId=await provider.createCanvas(config,{title:'源稿人物分离 · 完整场景补全'});await save();}
     if(!receipt.jobId){
      if(receipt.submittedAt&&Date.now()-Date.parse(receipt.submittedAt)>23*3600000)throw Error('上次背景补全回执待核对，请检查原服务任务，避免重复生成');
      receipt.submittedAt||=new Date().toISOString();await save();
      const prompt='这是原稿人物移除后的背景修补。图中纯紫红色（RGB 255,0,255）是待补全遮罩，原先被人物、服饰和头发遮挡的环境全部要补上。依据周围原画延续建筑、天空、花草、道路等结构与透视，形成一张完整、清晰、没有任何人物的纯场景背景。必须一并移除人物所属的帽子、头饰、发簪、珠串、耳饰、衣袖、裙摆、飘带、鞋子、手持物以及秋千的绳索、座椅和附属装饰；不能把这些部件当成背景留下。不要人物、人体、脸、衣服、人形残影、重复角色、文字、Logo、水印或紫红色残留。遮罩外的构图、物体尺度、位置、色彩、光照与绘画风格保持不变，不放大局部、不模糊填充、不镜像、不做新构图；仅自然补绘空缺。若外围有灰色临时留边也延续环境。返回同一画幅的完整背景。';
      receipt.jobId=await provider.submitGeneration(config,{model:'banana_pro',task_type:'image',bot_id:'canvas',canvas_id:receipt.canvasId,...(receipt.channel?{channel:receipt.channel}:{}),prompt,images:[{data_base64:input.toString('base64')}],ratio,image_size:'2K'},{idempotencyKey:receipt.idempotencyKey});receipt.status='submitted';await save();
     }
     await provider.pollJob(config,receipt.jobId);raw=(await provider.downloadRaw(config,receipt.jobId)).buffer;await sharp(raw).metadata();await fs.writeFile(rawFile,raw);receipt.status='downloaded';await save();
    }
    const normalized=await normalizeAdAiOutput(raw,spec,frame),buffer=await finishSourceRepair(sourceBuffer,normalized.buffer,maskBuffer);
    await fs.writeFile(resultFile,buffer);receipt.status='completed';receipt.error='';await save();return buffer;
   }catch(e){receipt.status='interrupted';receipt.error=e.message;await save();throw e;}
  })();running.set(directory,operation);try{return await operation;}finally{running.delete(directory);}
 };
}
export const repairSourceScene=createSourceSceneRepair();
