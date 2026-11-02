import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import {createSafeOutpaint} from "../lib/safe-outpaint.mjs";

test("扩展区逐像素保留生成细节，原图完整回填且不模糊", async () => {
  const pixels=Buffer.alloc(200*120*3);
  for(let y=0;y<120;y++) for(let x=0;x<200;x++) {
    const i=(y*200+x)*3; pixels[i]=x%2?255:0; pixels[i+1]=y%2?255:0; pixels[i+2]=(x+y)%256;
  }
  const generated=await sharp(pixels,{raw:{width:200,height:120,channels:3}}).png().toBuffer();
  const source=await sharp({create:{width:120,height:80,channels:3,background:"#845722"}}).png().toBuffer();
  const result=await createSafeOutpaint({sourceBuffer:source,generatedBuffer:generated,width:200,height:120,sourceRect:{x:.2,y:1/6,width:.6,height:2/3}});
  const raw=await sharp(result.buffer).removeAlpha().raw().toBuffer();
  for(let y=0;y<120;y++) for(let x=0;x<200;x++) {
    if(x>=40&&x<160&&y>=20&&y<100) continue;
    const i=(y*200+x)*3;
    assert.deepEqual(raw.subarray(i,i+3),pixels.subarray(i,i+3));
  }
  const restored=await sharp(result.buffer).extract({left:64,top:44,width:72,height:32}).removeAlpha().raw().toBuffer();
  assert.deepEqual(restored,await sharp(source).extract({left:24,top:24,width:72,height:32}).removeAlpha().raw().toBuffer());
  const seam=(44*200+42)*3;
  assert.ok(raw[seam]>pixels[seam] && raw[seam]<132);
  assert.ok(result.transitionFeather>0 && result.transitionFeather<=32);
});
test("无生成图时明确失败，不再制造模糊替代图", async()=>{
  await assert.rejects(createSafeOutpaint({}),/缺少真实扩图/);
});
