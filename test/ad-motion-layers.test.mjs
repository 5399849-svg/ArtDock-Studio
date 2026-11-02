import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {reframeAdMotionLayers} from '../lib/ad-motion-layers.mjs';

test('PSD typography follows the artwork transform while its canvas extensions stay transparent',async()=>{
  const sceneBuffer=await sharp({create:{width:128,height:72,channels:3,background:'#804060'}}).png().toBuffer();
  const overlayBuffer=await sharp({create:{width:128,height:72,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input:await sharp({create:{width:48,height:10,channels:4,background:'#ffd020'}}).png().toBuffer(),left:70,top:20}]).png().toBuffer();
  const result=await reframeAdMotionLayers({sceneBuffer,overlayBuffer,spec:{width:640,height:400},safeLayout:true});
  const {data,info}=await sharp(result.overlayBuffer).raw().toBuffer({resolveWithObject:true});
  assert.equal(info.channels,4);assert.equal(info.width,640);assert.equal(info.height,400);
  for(const [x,y] of [[0,0],[639,399],[400,20],[200,180]])assert.equal(data[(y*640+x)*4+3],0);
  assert.equal(data[(140*640+400)*4+3],255);
  const scene=await sharp(result.sourceBuffer).removeAlpha().raw().toBuffer();assert.equal(scene[0],128);assert.equal(scene[1],64);
});
