import sharp from "sharp";
import {placementPixelGaps, nearestBananaRatio} from "./ai-huabu.mjs";

export async function prepareNanoOutpaintInput(sourceBuffer, targetWidth, targetHeight, placement) {
  const source=await sharp(sourceBuffer).metadata();
  const gaps=placementPixelGaps(source.width,source.height,targetWidth,targetHeight,placement);
  // Nano tends to enlarge the protected source by roughly 1–2% compared with
  // its input position. Leave enough real scenery on every extended side so
  // the registered result still covers the selected canvas after that drift.
  const spareX=Math.ceil(source.width*.06),spareY=Math.ceil(source.height*.06);
  const leftGap=gaps.left ? gaps.left+spareX : 0;
  const rightGap=gaps.right ? gaps.right+spareX : 0;
  const topGap=gaps.top ? gaps.top+spareY : 0;
  const bottomGap=gaps.bottom ? gaps.bottom+spareY : 0;
  let width=source.width+leftGap+rightGap, height=source.height+topGap+bottomGap;
  const ratio=nearestBananaRatio(width,height);
  const [rw,rh]=ratio.split(":").map(Number), aspect=rw/rh;
  const fullWidth=Math.ceil(Math.max(width,height*aspect));
  const fullHeight=Math.ceil(Math.max(height,width/aspect));
  const left=leftGap+Math.floor((fullWidth-width)/2), top=topGap+Math.floor((fullHeight-height)/2);
  const scale=Math.min(1,2048/Math.max(fullWidth,fullHeight));
  const outWidth=Math.round(fullWidth*scale),outHeight=Math.round(fullHeight*scale);
  const x=Math.round(left*scale),y=Math.round(top*scale);
  const sw=Math.round(source.width*scale),sh=Math.round(source.height*scale);
  const original=await sharp(sourceBuffer).resize(sw,sh,{fit:"fill"}).png().toBuffer();
  const buffer=await sharp({create:{width:outWidth,height:outHeight,channels:3,background:"#e6e6e6"}})
    .composite([{input:original,left:x,top:y}]).png().toBuffer();
  return {buffer,ratio,width:outWidth,height:outHeight,sourceRect:{x:x/outWidth,y:y/outHeight,width:sw/outWidth,height:sh/outHeight}};
}

export async function assertNanoBlankFilled(buffer, rect) {
  const {data,info}=await sharp(buffer).resize(256,256,{fit:"fill"}).removeAlpha().raw().toBuffer({resolveWithObject:true});
  let outside=0,blank=0,marked=0;
  for(let y=0;y<info.height;y++) for(let x=0;x<info.width;x++) {
    const nx=x/info.width,ny=y/info.height;
    if(nx>=rect.x&&nx<=rect.x+rect.width&&ny>=rect.y&&ny<=rect.y+rect.height) continue;
    outside++;
    const i=(y*info.width+x)*info.channels;
    if([data[i],data[i+1],data[i+2]].every(v=>Math.abs(v-230)<5)) blank++;
    if(data[i]>235&&data[i+1]<35&&data[i+2]>235) marked++;
  }
  if(outside>0&&(blank/outside>.1||marked/outside>.01)) throw Object.assign(new Error(marked/outside>.01?"扩展区仍存在未填补的标记画布，请重新生成":"扩展区仍存在未填补的浅灰画布，请重新生成"),{code:'NANO_UNFILLED'});
}
