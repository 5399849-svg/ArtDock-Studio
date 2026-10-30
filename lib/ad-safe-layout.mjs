import sharp from 'sharp';
import {assertNanoBlankFilled} from './nano-outpaint-input.mjs';

export const safeLayoutMethod='proportional-generated-edges-v5';

export async function prepareAdSafeLayoutInput(sourceBuffer,spec){
  const source=await sharp(sourceBuffer).metadata();
  if(!source.width||!source.height||!spec.safeInsetX)throw Error('保护区重排参数无效');
  const scale=Math.min(spec.width/source.width,spec.height/source.height);
  const width=Math.round(source.width*scale),height=Math.round(source.height*scale);
  const left=Math.round((spec.width-width)/2),right=spec.width-left-width;
  const top=Math.round((spec.height-height)/2),bottom=spec.height-top-height;
  const original=await sharp(sourceBuffer).resize(width,height).png().toBuffer();
  const buffer=await sharp({create:{width:spec.width,height:spec.height,channels:3,background:'#e6e6e6'}}).composite([{input:original,left,top}]).png().toBuffer();
  return {buffer,original,pixelRect:{left,top,width,height},sourceRect:{x:left/spec.width,y:top/spec.height,width:width/spec.width,height:height/spec.height},gaps:{left,right,top,bottom}};
}

// Keep the original art proportional and intact. Only genuine generated scenery
// may fill the missing area; copied, mirrored or stretched pixels are not a fallback.
export async function reframeAdSafeLayout(sourceBuffer,spec,{generate,generatedBuffer}={}){
  const prepared=await prepareAdSafeLayoutInput(sourceBuffer,spec);
  if(!Object.values(prepared.gaps).some(Boolean))return prepared.original;
  if(!generatedBuffer){
    if(!generate)throw Error('此尺寸需要自然扩展背景，不能用拉伸或复制边缘像素补齐');
    generatedBuffer=await generate({sourceBuffer:prepared.buffer,targetWidth:spec.width,targetHeight:spec.height,layoutMode:'background-extension',sourceRect:prepared.sourceRect});
  }
  const meta=await sharp(generatedBuffer).metadata();
  if(!meta.width||!meta.height||Math.abs(Math.log((meta.width/meta.height)/(spec.width/spec.height)))>.02)throw Error('背景扩展结果的画面比例不符合目标尺寸');
  await assertNanoBlankFilled(generatedBuffer,prepared.sourceRect);
  const {left,top,width,height}=prepared.pixelRect,gaps=prepared.gaps;
  const art=await sharp(prepared.original).toColourspace('srgb').removeAlpha().raw().toBuffer();
  const background=await sharp(generatedBuffer).resize(spec.width,spec.height).toColourspace('srgb').removeAlpha().raw().toBuffer();
  // Match only the added scenery to the original edge lighting. Keep the whole
  // original opaque: even its outermost text/UI pixels must remain unchanged.
  const matchEdge=(side,gap)=>{
    if(!gap)return;
    const vertical=side==='top'||side==='bottom',length=vertical?width:height;
    const point=(i,d)=>vertical?{x:left+i,y:side==='top'?top-d:top+height-1+d}:{x:side==='left'?left-d:left+width-1+d,y:top+i};
    const artIndex=i=>vertical?((side==='top'?0:height-1)*width+i)*3:(i*width+(side==='left'?0:width-1))*3;
    const delta=Array.from({length},(_,i)=>{const p=point(i,1),k=(p.y*spec.width+p.x)*3,a=artIndex(i);return [0,1,2].map(c=>art[a+c]-background[k+c])});
    const smooth=delta.map((_,i)=>[0,1,2].map(c=>{let total=0,count=0;for(let j=Math.max(0,i-6);j<=Math.min(length-1,i+6);j++){total+=delta[j][c];count++}return total/count}));
    for(let d=1;d<=gap;d++)for(let i=0;i<length;i++){
      const p=point(i,d),k=(p.y*spec.width+p.x)*3,a=artIndex(i),fade=gap===1?1:(gap-d)/(gap-1),join=Math.min(1,(d-1)/3);
      for(let c=0;c<3;c++){const corrected=background[k+c]+smooth[i][c]*fade;background[k+c]=Math.max(0,Math.min(255,Math.round(art[a+c]*(1-join)+corrected*join)))}
    }
  };
  for(const side of ['top','bottom','left','right'])matchEdge(side,gaps[side]);
  for(let y=0;y<height;y++)art.copy(background,((top+y)*spec.width+left)*3,y*width*3,(y+1)*width*3);
  return sharp(background,{raw:{width:spec.width,height:spec.height,channels:3}}).png().toBuffer();
}
