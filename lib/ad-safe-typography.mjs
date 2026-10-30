import fs from 'node:fs/promises';
import sharp from 'sharp';
import {safeChild} from './core.mjs';

export const AD_SAFE_TYPOGRAPHY_METHOD='native-type-safe-area-v1';
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

// This local operation only handles a margin request. Other design changes and
// reference-led layouts must continue through their own editing flow.
export function adSafeTypographyInset(instruction,spec){
  if(!spec.safeInsetX||spec.format!=='JPG')return null;
  const clauses=String(instruction||'').split(/[，,；;。\n]+/).map(s=>s.trim()).filter(Boolean);
  let found=false,inset=spec.safeInsetX;
  for(const clause of clauses){
    if(/^(?:保持|保留|不要改变|不改).*(?:色调|颜色|配色|字效|文字内容|文案内容|原图)/.test(clause))continue;
    if(!/文案|文字|标题/.test(clause)||!/左右|两侧|保护区|安全区|边距/.test(clause)||!/不(?:要)?超|不能超|不超过|移入|收进|留出|留足|放在|位于/.test(clause))return null;
    const explicit=clause.match(/(\d+(?:\.\d+)?)\s*(?:px|像素)/i);
    if(explicit)inset=Math.max(inset,Number(explicit[1]));
    found=true;
  }
  return found&&inset<spec.width*.4?Math.ceil(inset):null;
}

function nativeProjection(batch,source,seen=new Set()){
  if(!source||seen.has(source.id))return null;
  seen.add(source.id);
  if(source.sourceFormat==='PSD'&&source.motionSceneUrl&&source.motionOverlayUrl)
    return {root:source,rect:{left:0,top:0,width:source.width,height:source.height}};
  // Only this proportional layout preserves a known mapping to the PSD layers.
  // Never put old PSD lettering over a subsequently redrawn AI composition.
  if(!source.safeSourceAssetId||source.safeMethod!=='proportional-generated-edges-v5')return null;
  const parent=batch.assets.find(a=>a.id===source.safeSourceAssetId),native=nativeProjection(batch,parent,seen);
  if(!native)return null;
  const scale=Math.min(source.width/parent.width,source.height/parent.height);
  const w=Math.round(parent.width*scale),h=Math.round(parent.height*scale);
  const x=Math.round((source.width-w)/2),y=Math.round((source.height-h)/2),r=native.rect;
  return {root:native.root,rect:{left:x+Math.round(r.left*scale),top:y+Math.round(r.top*scale),width:Math.round(r.width*scale),height:Math.round(r.height*scale)}};
}

function textBands(data,info){
  const rows=[];
  for(let y=0;y<info.height;y++){
    let left=info.width,right=-1;
    for(let x=0;x<info.width;x++)if(data[(y*info.width+x)*4+3]>0){left=Math.min(left,x);right=x;}
    if(right>=left)rows.push({y,left,right});
  }
  const bands=[],gap=Math.max(4,Math.round(info.height*.025));
  for(const row of rows){
    let band=bands.at(-1);
    if(!band||row.y-band.bottom>gap){band={left:row.left,right:row.right,top:row.y,bottom:row.y};bands.push(band);}
    else{band.left=Math.min(band.left,row.left);band.right=Math.max(band.right,row.right);band.bottom=row.y;}
  }
  return bands.map(b=>({left:b.left,top:b.top,width:b.right-b.left+1,height:b.bottom-b.top+1}));
}

// Composite the native, transparent PSD lettering over the same scenery and
// viewport. Text is fitted separately, so zooming the art cannot crop a headline.
export async function renderAdSafeTypography({batch,source,spec,draft={},storageDir,assetBuffer,sourceBuffer,insetX=spec.safeInsetX}){
  const native=nativeProjection(batch,source);
  if(!native||source.hasEmbeddedLogo||!insetX)return null;
  const prefix=`/storage/ad-resources-${batch.id}/asset/`;
  const readLayer=async url=>{
    if(typeof url!=='string'||!url.startsWith(prefix))throw Error('PSD 文字分层地址无效');
    const name=url.slice(prefix.length);if(!name||/[\\/?#]/.test(name))throw Error('PSD 文字分层地址无效');
    return fs.readFile(safeChild(storageDir,`ad-resources-${batch.id}`,'asset',name));
  };
  const [scene,overlay,base]=await Promise.all([readLayer(native.root.motionSceneUrl),readLayer(native.root.motionOverlayUrl),sourceBuffer||assetBuffer(batch,source)]);
  const [sceneMeta,typeMeta,baseMeta]=await Promise.all([scene,overlay,base].map(b=>sharp(b).metadata()));
  if(sceneMeta.width!==native.root.width||sceneMeta.height!==native.root.height||typeMeta.width!==sceneMeta.width||typeMeta.height!==sceneMeta.height||baseMeta.width!==source.width||baseMeta.height!==source.height)throw Error('PSD 文字分层尺寸不一致');
  if((await sharp(scene).ensureAlpha().stats()).channels[3].min!==255)return null;
  const {data,info}=await sharp(overlay).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const bands=textBands(data,info);if(!bands.length)return null;
  // The two layers must reconstruct this task's exact clean PSD. This also
  // rejects old scene exports that accidentally retained a nested brand mark.
  const original=await assetBuffer(batch,native.root);
  const [expected,reconstructed]=await Promise.all([
    sharp(original).toColourspace('srgb').removeAlpha().raw().toBuffer(),
    sharp(scene).composite([{input:overlay}]).toColourspace('srgb').removeAlpha().raw().toBuffer()
  ]);
  if(expected.length!==reconstructed.length)return null;
  let mismatches=0;
  for(let i=0;i<expected.length;i+=3)if([0,1,2].some(c=>Math.abs(expected[i+c]-reconstructed[i+c])>4))mismatches++;
  if(mismatches>info.width*info.height*.001)return null;
  const r=native.rect;
  const clean=await sharp(base).composite([{input:await sharp(scene).resize(r.width,r.height).png().toBuffer(),left:r.left,top:r.top}]).png().toBuffer();
  const scale=Math.max(spec.width/source.width,spec.height/source.height)*clamp(Number(draft.zoom)||1,1,2.5);
  const width=Math.max(spec.width,Math.ceil(source.width*scale)),height=Math.max(spec.height,Math.ceil(source.height*scale));
  const left=clamp(Math.round((spec.width-width)/2+(Number(draft.offsetX)||0)*spec.width),spec.width-width,0);
  const top=clamp(Math.round((spec.height-height)/2+(Number(draft.offsetY)||0)*spec.height),spec.height-height,0);
  const background=await sharp(clean).resize(width,height).extract({left:-left,top:-top,width:spec.width,height:spec.height}).png().toBuffer();
  const sx=width/source.width,sy=height/source.height,available=spec.width-2*insetX-4,components=[],layers=[];
  if(available<1)throw Error('文字安全区过窄');
  for(const band of bands){
    const naturalWidth=band.width*r.width/info.width*sx,naturalHeight=band.height*r.height/info.height*sy;
    const fit=Math.min(1,available/naturalWidth,(spec.height-4)/naturalHeight);
    const w=Math.max(1,Math.min(available,Math.round(naturalWidth*fit))),h=Math.max(1,Math.min(spec.height-4,Math.round(naturalHeight*fit)));
    const center=left+(r.left+(band.left+band.width/2)*r.width/info.width)*sx;
    const y=top+(r.top+(band.top+band.height/2)*r.height/info.height)*sy-h/2;
    const x=clamp(Math.round(center-w/2),insetX+2,spec.width-insetX-w-2);
    const layer={input:await sharp(overlay).extract(band).resize(w,h).png().toBuffer(),left:x,top:clamp(Math.round(y),2,spec.height-h-2)};
    layers.push(layer);components.push({left:layer.left,top:layer.top,width:w,height:h});
  }
  const type=await sharp({create:{width:spec.width,height:spec.height,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite(layers).png().toBuffer();
  const alpha=await sharp(type).ensureAlpha().raw().toBuffer();
  let outsidePixels=0;
  for(let y=0;y<spec.height;y++)for(let x=0;x<spec.width;x++)if((x<insetX||x>=spec.width-insetX)&&alpha[(y*spec.width+x)*4+3])outsidePixels++;
  if(outsidePixels)throw Error('文字仍超出保护区，未采用排版结果');
  return {buffer:await sharp(background).composite([{input:type}]).png().toBuffer(),assessment:{method:AD_SAFE_TYPOGRAPHY_METHOD,insetX,outsidePixels,components,reconstructionMismatchPixels:mismatches,verified:true}};
}
