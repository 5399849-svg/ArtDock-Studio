import test from 'node:test';
import assert from 'node:assert/strict';
import {resizeLayerFromCorner,scaleLayerAtPoint} from '../public/source-canvas-transform.js';
import {normalizePopupConfig,popupDefaults} from '../public/community-popup-model.js';
test('mouse corner resizing locks opposite corner and aspect ratio, including crossing the anchor',()=>{
 const l={x:40,y:60,width:300,height:150};
 for(const corner of ['nw','ne','sw','se'])for(const p of [{x:400,y:300},{x:-1000,y:-500}]){
  const r=resizeLayerFromCorner(l,corner,p);assert.equal(r.width/r.height,2);assert.ok(r.width>=1&&r.height>=1);
  assert.equal(corner.includes('e')?r.x:r.x+r.width,corner.includes('e')?l.x:l.x+l.width);
  assert.equal(corner.includes('s')?r.y:r.y+r.height,corner.includes('s')?l.y:l.y+l.height);
 }
});
test('wheel scaling keeps the point beneath the mouse stable without stretching',()=>{
 const l={x:10,y:20,width:400,height:200},p={x:90,y:50};const r=scaleLayerAtPoint(l,1.4,p);
 assert.equal(r.width/r.height,2);assert.ok(Math.abs((p.x-r.x)/r.width-(p.x-l.x)/l.width)<1e-10);assert.ok(Math.abs((p.y-r.y)/r.height-(p.y-l.y)/l.height)<1e-10);
});
test('new popup bottom clipping is opt-in for legacy history; font and backing survive normalization',()=>{
 const c=popupDefaults();assert.equal(normalizePopupConfig(c).clipCharacterBottom,true);delete c.clipCharacterBottom;assert.equal(normalizePopupConfig(c).clipCharacterBottom,false);
 const saved=normalizePopupConfig({...popupDefaults(),buttonFontId:'source-han-sans',buttonBackingAsset:'按钮.png'});assert.equal(saved.buttonFontId,'source-han-sans');assert.equal(saved.buttonBackingAsset,'按钮.png');
});
