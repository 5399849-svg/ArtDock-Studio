import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { confirmedMasterBackground, communityContainPlacement, cropCommunityExtension, composeCommunityExtension } from '../lib/community-background-extension.mjs';

async function pixel(buffer, x, y) {
  const {data,info} = await sharp(buffer).removeAlpha().raw().toBuffer({resolveWithObject:true});
  const offset = (y * info.width + x) * info.channels;
  return [...data.subarray(offset,offset+3)];
}

test('approved master background is captured at its visible placement', async () => {
  const source = await sharp({create:{width:100,height:50,channels:3,background:'#ff0000'}}).png().toBuffer();
  const snapshot = await confirmedMasterBackground(source,200,100,{focalX:50,focalY:50,scale:100});
  assert.deepEqual(await pixel(snapshot,100,50),[255,0,0]);
  assert.equal((await sharp(snapshot).metadata()).width,200);
  assert.deepEqual(communityContainPlacement(200,100,100,100),{scale:50,focalX:50,focalY:50});
});

test('extension crops a new aspect around the original instead of replacing the scene', async () => {
  const extended = await sharp({create:{width:100,height:100,channels:3,background:'#0000ff'}})
    .composite([{input:await sharp({create:{width:100,height:50,channels:3,background:'#ff0000'}}).png().toBuffer(),left:0,top:25}])
    .png().toBuffer();
  const result = await cropCommunityExtension(extended,{x:0,y:.25,width:1,height:.5},100,50,100,100);
  assert.deepEqual(await pixel(result,50,50),[255,0,0]);
  assert.deepEqual(await pixel(result,50,5),[0,0,255]);
  assert.deepEqual(await pixel(result,50,95),[0,0,255]);
});

test('mild model axis stretch is rectified before the original is overlaid in the final target aspect',async()=>{
  const source=await sharp({create:{width:200,height:100,channels:3,background:'#ff0000'}})
    .composite([{input:await sharp({create:{width:60,height:40,channels:3,background:'#00ff00'}}).png().toBuffer(),left:70,top:30}]).png().toBuffer();
  // The model's protected area is 2.8% wider. Its contents are deliberately
  // wrong: only genuine new blue scenery may survive outside the source.
  const raw=await sharp({create:{width:400,height:300,channels:3,background:'#0000ff'}})
    .composite([{input:await sharp({create:{width:206,height:100,channels:3,background:'#ffff00'}}).png().toBuffer(),left:97,top:100}]).png().toBuffer();
  const result=await composeCommunityExtension(source,raw,{x:97/400,y:100/300,width:206/400,height:100/300},200,180);
  assert.deepEqual(await pixel(result.buffer,100,90),[0,255,0]);
  assert.deepEqual(await pixel(result.buffer,40,90),[255,0,0]);
  assert.deepEqual(await pixel(result.buffer,100,5),[0,0,255]);
  assert.ok(Math.abs(result.sourceRect.width/result.sourceRect.height*200/180-2)<.001,'The approved source must retain its original 2:1 ratio');
  assert.equal(result.width,200);assert.equal(result.height,180);
});

test('a locally matching but insufficiently extended result cannot replace a target background',async()=>{
  const source=await sharp({create:{width:200,height:100,channels:3,background:'#ff0000'}}).png().toBuffer();
  await assert.rejects(composeCommunityExtension(source,source,{x:0,y:0,width:1,height:1},200,200),/扩图范围不足/);
});
