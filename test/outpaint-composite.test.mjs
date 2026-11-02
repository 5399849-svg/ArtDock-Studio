import test from 'node:test';
import assert from 'node:assert/strict';
import {protectedComposition} from '../public/outpaint-composite.js';
test('已定位的AI背景与原图使用同一变换，扩展范围不足时不可交付',()=>{
  const rect={x:.12,y:0,width:.76,height:1};
  const bad=protectedComposition(1920,550,1920,1080,{scale:55,focalX:50,focalY:50},rect);
  assert.equal(bad.covered,false);
  const good=protectedComposition(1920,550,1920,1080,{scale:80,focalX:50,focalY:10},rect);
  assert.equal(good.covered,true);
  assert.ok(Math.abs(good.generated.x+rect.x*good.generated.width-good.original.x)<1e-8);
  assert.ok(Math.abs(good.generated.y+rect.y*good.generated.height-good.original.y)<1e-8);
  const zoom=protectedComposition(1920,550,1920,1080,{scale:80,focalX:50,focalY:10},rect,{scale:120,focalX:30,focalY:70});
  assert.ok(Math.abs(zoom.original.width/good.original.width-1.2)<1e-8);
  assert.ok(Math.abs(zoom.generated.x+rect.x*zoom.generated.width-zoom.original.x)<1e-8);
});


test('55%偏心构图在模型宽度少4像素时仍有足够扩展余量', async () => {
  const {placementPixelGaps} = await import('../lib/ai-huabu.mjs');
  const placement={scale:55,focalX:63.872832369942195,focalY:50};
  const gaps=placementPixelGaps(1920,1080,1920,550,placement);
  const width=1920+gaps.left+gaps.right-4;
  const rect={x:gaps.left/width,y:0,width:1920/width,height:1};
  assert.equal(protectedComposition(1920,550,1920,1080,placement,rect).covered,true);
  assert.equal(gaps.top,0);
  assert.equal(gaps.bottom,0);
  assert.equal(placementPixelGaps(1920,1080,1920,550,{scale:100}).gaps,0);
});
