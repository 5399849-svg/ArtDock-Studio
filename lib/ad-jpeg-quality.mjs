import sharp from 'sharp';

const fail=message=>Object.assign(Error(message),{status:422});
export const adMaximumBytes=spec=>spec.maxBytes?spec.maxBytes-(spec.maxBytesInclusive?0:1):Infinity;

// Keep full chroma detail, then choose the highest JPEG quality within the limit.
// No padding, added noise, rescaling or color changes are used to inflate a file.
export async function encodeDetailAdJpeg(pixels,spec){
  const encode=quality=>sharp(pixels).jpeg({quality,mozjpeg:true,chromaSubsampling:'4:4:4'}).toBuffer();
  const minimum=spec.minBytes||0,maximum=adMaximumBytes(spec);
  const highest=await encode(100);
  if(highest.length<minimum)throw fail(`当前源图以最高质量导出仅 ${(highest.length/1024).toFixed(1)}KB，低于 ${Math.ceil(minimum/1024)}KB；请提供细节更完整的高清源图`);
  if(highest.length<=maximum)return highest;
  let low=1,high=99,best=null;
  while(low<=high){const quality=Math.floor((low+high)/2),candidate=await encode(quality);if(candidate.length<=maximum){best=candidate;low=quality+1;}else high=quality-1;}
  if(best&&best.length>=minimum)return best;
  throw fail(`当前画面无法以有效 JPEG 编码满足 ${spec.limitRaw}，请检查源图后再导出`);
}
