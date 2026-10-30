import sharp from "sharp";

// Preserve real generated scenery outside the registered original. Never
// manufacture extensions by scaling, mirroring or blurring the source.
export async function createSafeOutpaint({ sourceBuffer, generatedBuffer, width, height, sourceRect }) {
  if (!generatedBuffer) throw new Error("缺少真实扩图结果，禁止使用模糊背景代替");
  const metadata = await sharp(generatedBuffer).metadata();
  if (metadata.width !== width || metadata.height !== height) throw new Error("扩图尺寸与登记尺寸不一致");
  if (!sourceRect || !["x","y","width","height"].every(k => Number.isFinite(sourceRect[k]))) throw new Error("原图位置无效");
  const x = Math.round(sourceRect.x * width), y = Math.round(sourceRect.y * height);
  const placedWidth = Math.round(sourceRect.width * width), placedHeight = Math.round(sourceRect.height * height);
  if (x < 0 || y < 0 || placedWidth < 1 || placedHeight < 1 || x + placedWidth > width || y + placedHeight > height) throw new Error("原图超出扩图范围");
  const feather = Math.min(32, Math.max(8, Math.round(Math.min(placedWidth,placedHeight)*.012)));
  const {data,info}=await sharp(sourceBuffer).resize(placedWidth, placedHeight, {fit:"fill",kernel:"lanczos3"})
    .ensureAlpha().raw().toBuffer({resolveWithObject:true});
  for(let row=0;row<placedHeight;row++) for(let column=0;column<placedWidth;column++) {
    const distance=Math.min(column,row,placedWidth-1-column,placedHeight-1-row);
    const opacity=Math.min(1,distance/feather);
    data[(row*placedWidth+column)*info.channels+3]=Math.round(255*opacity);
  }
  const sourceLayer=await sharp(data,{raw:{width:placedWidth,height:placedHeight,channels:info.channels}}).png().toBuffer();
  const buffer = await sharp(generatedBuffer).composite([{input:sourceLayer,left:x,top:y}]).png({compressionLevel:9}).toBuffer();
  return {buffer,format:"png",mime:"image/png",width,height,
    sourceRect:{x:x/width,y:y/height,width:placedWidth/width,height:placedHeight/height},
    transitionFeather:feather,safetyMethod:"generated-extension-edge-blend-v4"};
}
