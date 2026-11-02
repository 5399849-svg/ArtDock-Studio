import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {nativeAdAiFrame,padAdAiInput,normalizeAdAiOutput} from '../lib/ad-ai-frame.mjs';

test('native frames retain the complete delivery rectangle and leave native catalog ratios alone',()=>{
  for(const [width,height] of [[1280,720],[1080,1920],[720,1280],[800,800]])assert.equal(nativeAdAiFrame({width,height}),null);
  assert.deepEqual(nativeAdAiFrame({width:640,height:400}),{ratio:'3:2',width:642,height:428,left:1,top:14,targetWidth:640,targetHeight:400});
});

test('native padding and removal preserve artwork geometry and every original pixel',async()=>{
  const spec={width:640,height:400},frame=nativeAdAiFrame(spec);
  const source=await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400"><rect width="640" height="400" fill="#c4ba98"/><circle cx="320" cy="200" r="90" fill="#72364a"/><rect x="0" y="398" width="640" height="2" fill="#123456"/></svg>')).png().toBuffer();
  const padded=await padAdAiInput(source,frame),result=await normalizeAdAiOutput(padded,spec,frame);
  assert.equal(result.adaptation.method,'native-frame-crop-v1');
  assert.ok((await sharp(source).removeAlpha().raw().toBuffer()).equals(await sharp(result.buffer).removeAlpha().raw().toBuffer()));
  const high=await sharp(padded).resize(frame.width*3,frame.height*3,{kernel:'nearest'}).png().toBuffer();
  const scaled=await normalizeAdAiOutput(high,spec,frame),meta=await sharp(scaled.buffer).metadata();assert.equal(meta.width,640);assert.equal(meta.height,400);
});

test('legacy 3:2 results for Bilibili recover with an equal scale and retain the lower information board',async()=>{
  const raw=await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="2528" height="1696"><rect width="2528" height="1696" fill="#acbdce"/><circle cx="1264" cy="850" r="250" fill="#f02020"/><rect x="0" y="1630" width="2528" height="66" fill="#205090"/></svg>')).png().toBuffer();
  const result=await normalizeAdAiOutput(raw,{width:640,height:400});assert.equal(result.adaptation.method,'legacy-8x5-native-cover-v1');assert.ok(result.adaptation.removedFraction<.09);
  const {data,info}=await sharp(result.buffer).raw().toBuffer({resolveWithObject:true});let x0=640,y0=400,x1=0,y1=0;
  for(let y=0;y<400;y++)for(let x=0;x<640;x++){const i=(y*640+x)*info.channels;if(data[i]>200&&data[i+1]<90&&data[i+2]<90){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y)}}
  assert.ok(Math.abs((x1-x0)-(y1-y0))<=1,'A circle must remain circular');
  const lower=(399*640+320)*info.channels;assert.ok(data[lower+2]>100&&data[lower]<60,'Keep the lower information board');
});

test('unrelated output ratios remain rejected instead of being stretched into delivery',async()=>{
  const square=await sharp({create:{width:100,height:100,channels:3,background:'#f00'}}).png().toBuffer();
  await assert.rejects(()=>normalizeAdAiOutput(square,{width:640,height:400}),/尺寸比例/);
  await assert.rejects(()=>normalizeAdAiOutput(square,{width:640,height:400},nativeAdAiFrame({width:640,height:400})),/生成请求不符/);
});
