import sharp from 'sharp';
import {objectFail,objectHash,readCommunityCurrentSource,readCommunityObjectAsset} from './community-object-assets.mjs';

// Old cutouts were trimmed without recording their origin. Locate them using
// unchanged, opaque source pixels, never a guessed scale or a regenerated image.
export function locateCutout(source,sourceInfo,cutout,cutoutInfo){
 const sw=sourceInfo.width,sh=sourceInfo.height,cw=cutoutInfo.width,ch=cutoutInfo.height;
 if(cw>sw||ch>sh)throw objectFail('人物素材尺寸与原图不一致，请重新提取');
 if(cw===sw&&ch===sh)return {left:0,top:0};
 const samples=[],colors=new Set(),stepX=Math.max(1,Math.floor(cw/18)),stepY=Math.max(1,Math.floor(ch/18));
 for(let y=Math.floor(stepY/2);y<ch;y+=stepY)for(let x=Math.floor(stepX/2);x<cw;x+=stepX){
  const i=(y*cw+x)*4,key=cutout[i]*65536+cutout[i+1]*256+cutout[i+2];
  if(cutout[i+3]<240||colors.has(key))continue;
  colors.add(key);samples.push({x,y,r:cutout[i],g:cutout[i+1],b:cutout[i+2]});
 }
 if(samples.length<4)throw objectFail('旧人物素材缺少可定位的原图细节，请重新提取');
 const anchor=samples[Math.floor(samples.length/2)],checks=samples.filter((_,i)=>i%Math.max(1,Math.floor(samples.length/24))===0);let found;
 for(let top=0;top<=sh-ch;top++)for(let left=0;left<=sw-cw;left++){
  const i=((top+anchor.y)*sw+left+anchor.x)*4;
  if(source[i]!==anchor.r||source[i+1]!==anchor.g||source[i+2]!==anchor.b)continue;
  if(!checks.every(p=>{const j=((top+p.y)*sw+left+p.x)*4;return source[j]===p.r&&source[j+1]===p.g&&source[j+2]===p.b;}))continue;
  if(found)throw objectFail('旧人物素材的原图位置不明确，请重新提取');
  found={left,top};
 }
 if(!found)throw objectFail('人物素材与原图像素不匹配，请重新提取');
 return found;
}

export async function readEditableCutout({task,storageDir,templateMap,characterId,assetName}){
 const character=task.communityObjects?.characters?.find(c=>c.id===characterId);
 if(!character)throw objectFail('人物素材不存在',404);
 if(assetName&&character.assetName!==assetName)throw objectFail('人物素材已更新，请重新打开修边',409);
 const asset=task.assets.find(a=>a.name===character.assetName&&!a.libraryDeletedAt),run=[task.communityObjectJob,...(task.communityObjectRuns||[])].find(r=>r?.runId===asset?.objectRunId);
 const sourceRef=asset?.cutoutSource||run?.source;
 if(!asset||!sourceRef)throw objectFail('未找到这份人物素材的原图，请重新提取');
  const source=sourceRef.mode==='asset'?await readCommunityObjectAsset(storageDir,task,sourceRef.name):await readCommunityCurrentSource({storageDir,task,source:sourceRef,template:templateMap.get(run?.templateId||task.masterTemplateId)});
 const sourceSha256=objectHash(source);
 if((asset.sourceSha256||run?.sourceSha256)&&sourceSha256!==(asset.sourceSha256||run.sourceSha256))throw objectFail('人物来源图已变化，未修改原素材',409);
 const buffer=await readCommunityObjectAsset(storageDir,task,asset.name);
 const [a,b]=await Promise.all([source,buffer].map(image=>sharp(image).toColourspace('srgb').ensureAlpha().raw().toBuffer({resolveWithObject:true})));
 const offset=asset.cutoutBounds||locateCutout(a.data,a.info,b.data,b.info);
 if(!Number.isInteger(offset.left)||!Number.isInteger(offset.top)||offset.left<0||offset.top<0||offset.left+b.info.width>a.info.width||offset.top+b.info.height>a.info.height)throw objectFail('人物素材的定位信息无效');
 const aligned=await sharp({create:{width:a.info.width,height:a.info.height,channels:4,background:'#00000000'}}).composite([{input:buffer,left:offset.left,top:offset.top}]).png().toBuffer();
 return {character,asset,source,aligned,sourceRef,sourceSha256,width:a.info.width,height:a.info.height};
}

export function validateCutoutStrokes(strokes){
 if(!Array.isArray(strokes)||!strokes.length||strokes.length>200)throw objectFail('请先修整需要补回或擦除的区域，最多 200 笔');
 let total=0;
 for(const stroke of strokes){
  if(!['restore','erase'].includes(stroke?.tool)||!Number.isFinite(stroke.radius)||stroke.radius<.001||stroke.radius>.2||!Array.isArray(stroke.points)||!stroke.points.length||stroke.points.length>4000)throw objectFail('修边笔画无效');
  total+=stroke.points.length;if(total>20000)throw objectFail('修边笔画过多，请分次保存');
  if(stroke.points.some(p=>!p||![p.x,p.y].every(n=>Number.isFinite(n)&&n>=0&&n<=1)))throw objectFail('修边笔画超出原图范围');
 }
 return strokes;
}

export async function applyCutoutStrokes(source,aligned,strokes){
 validateCutoutStrokes(strokes);
 const original=await sharp(source).toColourspace('srgb').ensureAlpha().raw().toBuffer({resolveWithObject:true}),{width,height}=original.info;
 const maskMeta=await sharp(aligned).metadata();if(maskMeta.width!==width||maskMeta.height!==height)throw objectFail('修边遮罩未对齐原图');
 const number=n=>Number(n.toFixed(3)),shapes=strokes.map(stroke=>{
  const radius=number(stroke.radius*Math.min(width,height)),color=stroke.tool==='restore'?'white':'black',points=stroke.points.map(p=>[number(p.x*width),number(p.y*height)]);
  return points.length===1?`<circle cx="${points[0][0]}" cy="${points[0][1]}" r="${radius}" fill="${color}"/>`:`<polyline points="${points.map(p=>p.join(',')).join(' ')}" fill="none" stroke="${color}" stroke-width="${radius*2}" stroke-linecap="round" stroke-linejoin="round"/>`;
 }).join('');
 const alphaImage=await sharp(aligned).extractChannel(3).png().toBuffer(),overlay=Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${shapes}</svg>`);
 const alpha=await sharp(alphaImage).composite([{input:overlay}]).greyscale().removeAlpha().raw().toBuffer();let ink=0;
 for(let i=0;i<alpha.length;i++){const p=i*4;original.data[p+3]=Math.min(original.data[p+3],alpha[i]);if(original.data[p+3]>32)ink++;if(!original.data[p+3])original.data[p]=original.data[p+1]=original.data[p+2]=0;}
 if(ink<8)throw objectFail('人物已被全部擦除，请撤销后重试');
 const result=await sharp(original.data,{raw:original.info}).trim({background:'#00000000',threshold:5}).png().toBuffer({resolveWithObject:true});
 return {buffer:result.data,bounds:{left:-result.info.trimOffsetLeft||0,top:-result.info.trimOffsetTop||0,width:result.info.width,height:result.info.height}};
}
