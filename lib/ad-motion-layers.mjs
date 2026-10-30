import sharp from 'sharp';

// Both native PSD layers use exactly the same transform. Transparent typography
// never receives the copied edge pixels used to extend opaque artwork.
export async function reframeAdMotionLayers({sceneBuffer,overlayBuffer,spec,safeLayout=false,draft={}}){
  if(safeLayout){
    const source=await sharp(sceneBuffer).metadata();
    const scale=Math.min(spec.width/source.width,spec.height/source.height);
    const width=Math.round(source.width*scale),naturalHeight=Math.round(source.height*scale);
    const height=naturalHeight+Math.min(20,Math.max(0,spec.height-naturalHeight));
    const left=Math.round((spec.width-width)/2),right=spec.width-left-width;
    const top=Math.round((spec.height-height)/2),bottom=spec.height-top-height;
    sceneBuffer=await sharp(sceneBuffer).resize(width,height,{fit:'fill'}).extend({left,right,top,bottom,extendWith:'copy'}).png().toBuffer();
    overlayBuffer=await sharp(overlayBuffer).resize(width,height,{fit:'fill'}).extend({left,right,top,bottom,background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer();
  }
  const meta=await sharp(sceneBuffer).metadata();
  const scale=Math.max(spec.width/meta.width,spec.height/meta.height)*Math.max(1,Math.min(2.5,Number(draft.zoom)||1));
  const width=Math.max(spec.width,Math.ceil(meta.width*scale)),height=Math.max(spec.height,Math.ceil(meta.height*scale));
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
  const left=-clamp(Math.round((spec.width-width)/2+(Number(draft.offsetX)||0)*spec.width),spec.width-width,0);
  const top=-clamp(Math.round((spec.height-height)/2+(Number(draft.offsetY)||0)*spec.height),spec.height-height,0);
  const transform=buffer=>sharp(buffer).resize(width,height).extract({left,top,width:spec.width,height:spec.height}).png().toBuffer();
  const [scene,overlay]=await Promise.all([transform(sceneBuffer),transform(overlayBuffer)]);
  return {sourceBuffer:scene,overlayBuffer:overlay};
}
