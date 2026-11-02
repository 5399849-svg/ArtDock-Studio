import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {expandAdGifHolds} from '../lib/ad-gif-encoding.mjs';

test('optimized endpoint holds remain ten exact 100 ms frames with unchanged compositing',async()=>{
  const frames=await Promise.all(Array.from({length:7},(_,index)=>sharp({create:{width:12,height:8,channels:3,background:{r:20+index*30,g:200-index*20,b:40+index*15}}}).png().toBuffer()));
  const input=await sharp(frames,{join:{animated:true}}).gif({delay:[200,100,100,300,100,100,100],loop:0}).toBuffer();
  const before=Buffer.from(input),output=expandAdGifHolds(input),meta=await sharp(output,{animated:true}).metadata();
  assert.equal(meta.width,12);assert.equal(meta.pageHeight,8);assert.equal(meta.pages,10);assert.equal(meta.loop,0);assert.deepEqual(meta.delay,Array(10).fill(100));assert.deepEqual(input,before);
  for(const [page,sourcePage] of [0,0,1,2,3,3,3,4,5,6].entries())assert.deepEqual(await sharp(output,{page}).removeAlpha().raw().toBuffer(),await sharp(input,{page:sourcePage}).removeAlpha().raw().toBuffer());
  assert.throws(()=>expandAdGifHolds(Buffer.from('bad data')),/GIF/);
  assert.throws(()=>expandAdGifHolds(input.subarray(0,-1)),/GIF/);
});
