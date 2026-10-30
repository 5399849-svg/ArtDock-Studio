import sharp from 'sharp';

// The canvas catalog exposes 8:5, but its Gemini Pro channel uses native
// Gemini image ratios. Keep the delivery rectangle inside a temporary frame;
// crop that frame away after generation instead of stretching the artwork.
const ratios=['1:1','2:3','3:2','3:4','4:3','4:5','5:4','9:16','16:9','21:9'];
const value=ratio=>{const [w,h]=ratio.split(':').map(Number);return w/h};
const mismatch=(a,b)=>Math.abs(Math.log(a/b));
const invalid=message=>Object.assign(Error(message),{status:422});

export function nativeAdAiFrame(spec){
  const target=spec.width/spec.height;
  const ratio=ratios.reduce((best,r)=>mismatch(value(r),target)<mismatch(value(best),target)?r:best);
  if(mismatch(value(ratio),target)<.001)return null;
  const [rw,rh]=ratio.split(':').map(Number),unit=Math.ceil(Math.max(spec.width/rw,spec.height/rh));
  const width=rw*unit,height=rh*unit;
  return {ratio,width,height,left:Math.floor((width-spec.width)/2),top:Math.floor((height-spec.height)/2),targetWidth:spec.width,targetHeight:spec.height};
}

export async function padAdAiInput(buffer,frame){
  if(!frame)return buffer;
  const meta=await sharp(buffer).metadata();
  if(meta.width!==frame.targetWidth||meta.height!==frame.targetHeight)throw invalid('改图输入尺寸与当前画布不一致');
  return sharp(buffer).extend({left:frame.left,right:frame.width-frame.targetWidth-frame.left,top:frame.top,bottom:frame.height-frame.targetHeight-frame.top,background:'#d9dce3'}).png().toBuffer();
}

export async function normalizeAdAiOutput(buffer,spec,frame=null){
  const meta=await sharp(buffer).metadata();
  if(!meta.width||!meta.height)throw invalid('AI 返回的图片无法解码，原稿已保留');
  const rawRatio=meta.width/meta.height,target=spec.width/spec.height;
  let image,adaptation;
  if(frame){
    if(mismatch(rawRatio,frame.width/frame.height)>.03)throw invalid('AI 返回的画幅与生成请求不符，原始结果已保存，原稿已保留');
    const multiple=Math.max(1,Math.floor(Math.min(meta.width/frame.width,meta.height/frame.height)));
    const framed=await sharp(buffer).resize(frame.width*multiple,frame.height*multiple,{fit:'cover',position:'centre'}).png().toBuffer();
    image=sharp(framed).extract({left:frame.left*multiple,top:frame.top*multiple,width:spec.width*multiple,height:spec.height*multiple});
    adaptation={method:'native-frame-crop-v1',rawWidth:meta.width,rawHeight:meta.height,frame};
  }else if(mismatch(rawRatio,target)<=.03){
    image=sharp(buffer);adaptation={method:'matching-ratio',rawWidth:meta.width,rawHeight:meta.height};
  }else if(mismatch(target,8/5)<.001&&mismatch(rawRatio,3/2)<.03){
    // Recover existing 8:5 requests that the native channel returned as 3:2.
    // Keep the lower information boards and remove only the excess sky above.
    const removedFraction=1-rawRatio/target;
    if(removedFraction<0||removedFraction>.09)throw invalid('AI 返回了不符合当前尺寸比例的画面，原始结果已保存，原稿已保留');
    image=sharp(buffer);adaptation={method:'legacy-8x5-native-cover-v1',rawWidth:meta.width,rawHeight:meta.height,removedFraction,position:'south'};
  }else throw invalid('AI 返回了不符合当前尺寸比例的画面，原始结果已保存，原稿已保留');
  const result=await image.resize(spec.width,spec.height,{fit:'cover',position:adaptation.position||'centre'}).flatten({background:'#ffffff'}).png().toBuffer();
  return {buffer:result,adaptation};
}
