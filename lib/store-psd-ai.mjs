import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {buildOutpaintRequest, submitGeneration, pollJob, downloadRaw, nearestBananaRatio, BANANA_RATIOS} from './ai-huabu.mjs';
import {layerGeometry} from '../public/store-layer-geometry.js';
import {loadCanvasConfig} from '../platform/canvas.mjs';

export async function protectedExpansionPlan(buffer,layer,manifest,spec,adjustment={},canvasRect=null) {
  const meta=await sharp(buffer).metadata(),g=layerGeometry(layer,manifest,spec,adjustment);
  const pixelScale=g.width/meta.width;
  let left=Math.max(0,Math.ceil(g.left/pixelScale)),top=Math.max(0,Math.ceil(g.top/pixelScale));
  const right=Math.max(0,Math.ceil((spec.width-g.left-g.width)/pixelScale));
  const bottom=Math.max(0,Math.ceil((spec.height-g.top-g.height)/pixelScale));
  let width=meta.width+left+right,height=meta.height+top+bottom;
  let ratio=nearestBananaRatio(width,height);const r=BANANA_RATIOS[ratio];
  if(width/height<r) {const extra=Math.ceil(height*r)-width;width+=extra;left+=Math.floor(extra/2);}
  else {const extra=Math.ceil(width/r)-height;height+=extra;top+=Math.floor(extra/2);}
  const unit=layer.rect.width/meta.width;
  if(canvasRect) {
    width=Math.round(canvasRect.width/unit);height=Math.round(canvasRect.height/unit);
    left=Math.round((layer.rect.x-canvasRect.x)/unit);top=Math.round((layer.rect.y-canvasRect.y)/unit);
    if(left<0||top<0||width<left+meta.width||height<top+meta.height)throw new Error('旧候选画布与原始素材不匹配');
    ratio=nearestBananaRatio(width,height);
  }
  // A flattened cover may include hidden pixels outside its PSD artboard.
  // Those are not part of the approved artwork (often neighbouring fragments).
  // Independent character layers still retain all their outside-artboard pixels.
  const cropLeft=Math.max(0,Math.ceil(-layer.rect.x/unit)),cropTop=Math.max(0,Math.ceil(-layer.rect.y/unit));
  const cropRight=Math.min(meta.width,Math.floor((manifest.width-layer.rect.x)/unit));
  const cropBottom=Math.min(meta.height,Math.floor((manifest.height-layer.rect.y)/unit));
  if(cropRight<=cropLeft||cropBottom<=cropTop)throw new Error('首图没有位于 PSD 画板内的有效内容');
  const protectedSource=await sharp(buffer).extract({left:cropLeft,top:cropTop,width:cropRight-cropLeft,height:cropBottom-cropTop}).png().toBuffer();
  const protectedLeft=left+cropLeft,protectedTop=top+cropTop;
  const canvas=await sharp({create:{width,height,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input:protectedSource,left:protectedLeft,top:protectedTop}]).png().toBuffer();
  return {canvas,width,height,left,top,ratio,protectedSource,protectedLeft,protectedTop,rect:{x:layer.rect.x-left*unit,y:layer.rect.y-top*unit,width:width*unit,height:height*unit}};
}

// Opaque source pixels are byte-exact. Transparent boundary pixels show the
// extension underneath instead of punching a pale seam through the result.
export async function restoreProtectedPixels(generated,source,left,top) {
  const dst=await sharp(generated).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const src=await sharp(source).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  for(let y=0;y<src.info.height;y++) for(let x=0;x<src.info.width;x++) {
    const s=(y*src.info.width+x)*4,d=((y+top)*dst.info.width+x+left)*4,a=src.data[s+3]/255;
    if(a===1){src.data.copy(dst.data,d,s,s+4);continue;}
    if(a===0)continue;
    const b=dst.data[d+3]/255,total=a+b*(1-a);
    for(let c=0;c<3;c++) dst.data[d+c]=Math.round((src.data[s+c]*a+dst.data[d+c]*b*(1-a))/total);
    dst.data[d+3]=Math.round(total*255);
  }
  return sharp(dst.data,{raw:dst.info}).png().toBuffer();
}

// Correct low-frequency edge color only on the extension. Source pixels are
// restored afterwards; generated texture is retained instead of blurring it.
export async function matchExtensionEdges(generated,source,left,top) {
  const dst=await sharp(generated).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const src=await sharp(source).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const {width:w,height:h}=src.info,W=dst.info.width,H=dst.info.height;
  const sides=[{length:w,extent:top,point:(i,d)=>[left+i,top-d],sample:(i,k)=>[i,k]},
    {length:w,extent:H-top-h,point:(i,d)=>[left+i,top+h-1+d],sample:(i,k)=>[i,h-1-k]},
    {length:h,extent:left,point:(i,d)=>[left-d,top+i],sample:(i,k)=>[k,i]},
    {length:h,extent:W-left-w,point:(i,d)=>[left+w-1+d,top+i],sample:(i,k)=>[w-1-k,i]}];
  for(const side of sides) {
    if(side.extent<=0)continue;
    let field=new Float32Array(side.length*3);
    for(let i=0;i<side.length;i++) {
      for(let k=0;k<Math.min(32,w,h);k++) {
        const [x,y]=side.sample(i,k),s=(y*w+x)*4,d=((top+y)*W+left+x)*4;
        if(src.data[s+3]<250)continue;
        for(let c=0;c<3;c++)field[i*3+c]=src.data[s+c]-dst.data[d+c];
        break;
      }
    }
    const band=Math.min(side.extent,Math.max(24,Math.round(Math.min(w,h)*.18)));
    for(let distance=-12;distance<=band;distance++) {
      // Match fine edge detail exactly at the join, then diffuse the correction
      // into the generated area. This changes neither the source nor its hue.
      if(distance>1) for(let step=0;step<3;step++) {
        const next=new Float32Array(field.length);
        for(let i=0;i<side.length;i++)for(let c=0;c<3;c++)next[i*3+c]=(field[Math.max(0,i-1)*3+c]+2*field[i*3+c]+field[Math.min(side.length-1,i+1)*3+c])/4;
        field=next;
      }
      const t=Math.max(0,distance)/band,weight=(1-t)*(1-t)*(1+2*t);
      for(let i=0;i<side.length;i++) {
        const [x,y]=side.point(i,distance);if(x<0||x>=W||y<0||y>=H)continue;
        const d=(y*W+x)*4;
        for(let c=0;c<3;c++)dst.data[d+c]=Math.max(0,Math.min(255,Math.round(dst.data[d+c]+field[i*3+c]*weight)));
      }
    }
  }
  return sharp(dst.data,{raw:dst.info}).png().toBuffer();
}

// Only border-connected green is removed, so green clothing inside a subject survives.
export async function removeGreenScreen(buffer) {
  const {data,info}=await sharp(buffer).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const seen=new Uint8Array(info.width*info.height), queue=new Int32Array(seen.length);let head=0,tail=0;
  const add=i=>{if(seen[i])return;const p=i*4,r=data[p],g=data[p+1],b=data[p+2];if(g>80&&g>r*1.25&&g>b*1.25){seen[i]=1;queue[tail++]=i;}};
  for(let x=0;x<info.width;x++){add(x);add((info.height-1)*info.width+x);}
  for(let y=0;y<info.height;y++){add(y*info.width);add(y*info.width+info.width-1);}
  while(head<tail){const i=queue[head++],x=i%info.width,y=Math.floor(i/info.width);if(x)add(i-1);if(x<info.width-1)add(i+1);if(y)add(i-info.width);if(y<info.height-1)add(i+info.width);}
  if(tail<seen.length*.05) throw new Error('AI 未返回可分离的纯色背景，已保留原人物；请重试');
  for(let i=0;i<seen.length;i++) if(seen[i]) data[i*4+3]=0;
  return sharp(data,{raw:info}).png().toBuffer();
}

export async function generateElementCandidate({buffer,layer,manifest,spec,prompt,root,onSubmitted,adjustment={},existingJobId,canvasRect=null}) {
  const config=await loadCanvasConfig(undefined,{root});
  const character=layer.id==='character';
  const protectedPlan=layer.compositeArtwork?await protectedExpansionPlan(buffer,layer,manifest,spec,adjustment,canvasRect):null;
  const meta=await sharp(buffer).metadata();let canvas,desiredWidth,desiredHeight,offsetX=0,offsetY=0;
  if(character) {
    desiredWidth=meta.width+Math.round(meta.width*.2);desiredHeight=Math.round(meta.height*1.5);
    offsetX=Math.round((desiredWidth-meta.width)/2);offsetY=16;desiredHeight+=offsetY;
  } else {
    const ratio=spec.width/spec.height;
    desiredWidth=Math.max(meta.width,Math.ceil(meta.height*ratio));desiredHeight=Math.max(meta.height,Math.ceil(meta.width/ratio));
  }
  let ratio=nearestBananaRatio(desiredWidth,desiredHeight);const supportedRatio=BANANA_RATIOS[ratio];
  if(desiredWidth/desiredHeight<supportedRatio) desiredWidth=Math.ceil(desiredHeight*supportedRatio);
  else desiredHeight=Math.ceil(desiredWidth/supportedRatio);
  if(character) {
    offsetX=Math.round((desiredWidth-meta.width)/2);
    canvas=await sharp({create:{width:desiredWidth,height:desiredHeight,channels:4,background:'#00ff00'}}).composite([{input:buffer,left:offsetX,top:offsetY}]).png().toBuffer();
  } else canvas=await sharp(buffer).resize(desiredWidth,desiredHeight,{fit:'contain',background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer();
  if(protectedPlan) {canvas=protectedPlan.canvas;desiredWidth=protectedPlan.width;desiredHeight=protectedPlan.height;ratio=protectedPlan.ratio;}
  const instruction=protectedPlan
    ? `只扩展原图外围的透明区域。中央整张原图为受保护区，原有人物、脸部、身体、服装、文字、明暗、饱和度和色调完全不改。新增区域只自然延续背景的云纹、花枝和环境，不允许新增或复制人物、文字、Logo。不出现边框和接缝。用户要求：${prompt}`
    : character
    ? `这是单独的人物素材。仅向下补全身体或衣服，保持已有头部、脸、发型、姿态、服饰和已有像素的坐标大小不变。人物外必须是纯绿 #00ff00 无阴影背景，用于透明抠图。不得生成文案、Logo、截图或第二个人。下方预留空间用于补全。用户要求：${prompt}`
    : `这是独立的纯背景素材，没有人物、截图、文案或Logo。补全透明区域和背景中缺失区域，延续建筑、云纹、花枝、光线与细节。整个背景连续自然，消除横向或纵向拼接切痕，不要模糊涂抹、拉伸或生成矩形画框。禁止生成人物、界面、文字或Logo。用户要求：${prompt}`;
  const body=buildOutpaintRequest({model:'banana_pro',base64:canvas.toString('base64'),prompt:instruction,ratio,imageSize:'2K'});
  const jobId=existingJobId||await submitGeneration(config,body);
  await onSubmitted?.(jobId);
  await pollJob(config,jobId);
  const raw=await downloadRaw(config,jobId);
  const resultMeta=await sharp(raw.buffer).metadata();
  if(Math.abs(Math.log((resultMeta.width/resultMeta.height)/(desiredWidth/desiredHeight)))>.02) throw new Error('AI 改变了素材比例，候选未应用，请重试');
  let result=await sharp(raw.buffer).resize(desiredWidth,desiredHeight,{fit:'fill'}).png().toBuffer();
  let rect;
  if(protectedPlan) {
    result=await matchExtensionEdges(result,protectedPlan.protectedSource,protectedPlan.protectedLeft,protectedPlan.protectedTop);
    result=await restoreProtectedPixels(result,protectedPlan.protectedSource,protectedPlan.protectedLeft,protectedPlan.protectedTop);
    rect=protectedPlan.rect;
  } else if(character) {
    result=await removeGreenScreen(result);
    // Keep the PSD's existing face/body pixels; generated pixels only fill uncovered space.
    result=await sharp(result).composite([{input:buffer,left:offsetX,top:offsetY}]).png().toBuffer();
    rect={x:layer.rect.x-offsetX,y:layer.rect.y-offsetY,width:desiredWidth,height:desiredHeight};
  } else {
    // Describe the expanded image in source-artboard coordinates, without stretching it.
    const cover=Math.max(spec.width/manifest.width,spec.height/manifest.height);
    const fit=Math.max(spec.width/desiredWidth,spec.height/desiredHeight)/cover;
    rect={x:(manifest.width-desiredWidth*fit)/2,y:(manifest.height-desiredHeight*fit)/2,width:desiredWidth*fit,height:desiredHeight*fit};
  }
  return {buffer:result,jobId,layer:{rect,bbox:null,aiCandidate:true,...(protectedPlan?{protectedExpansion:true,seamVersion:2}:{}),...(character&&layer.foregroundClipY?{foregroundClipY:layer.foregroundClipY+offsetY}:{})}};
}
