import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {measureBannerBackingContent,centerSubtitleInBacking,fitBannerBackingArtwork} from '../lib/banner-backing-content.mjs';
test('text uses the pale label body rather than a decorative knot or glow',async()=>{
  const image=await sharp(Buffer.from('<svg width="600" height="100"><circle cx="40" cy="50" r="35" fill="#704b20"/><path d="M100 20H560L590 50L560 80H100Z" fill="#fff0c9"/></svg>')).png().toBuffer();
  const content=await measureBannerBackingContent(image);
  assert.ok(content.x>.16);assert.ok(content.x+content.width<.98);
  const sub={x:0,y:0,width:1,height:1,textColor:'#302015'};
  const rect=centerSubtitleInBacking(sub,{x:10,y:20,width:600,height:100},content);
  assert.equal(rect.align,'center');assert.equal(rect.verticalAlign,'middle');assert.equal(rect.textColor,sub.textColor);
  assert.ok(rect.x>106);assert.ok(rect.width>300);
});

test('generated artwork retains aspect instead of being flattened into a thin caption bar',()=>{
  const result=fitBannerBackingArtwork({x:25,y:230,width:485,height:58},{width:2048,height:414},{width:900,height:383});
  assert.ok(result.height>90);assert.ok(Math.abs(result.width/result.height-2048/414)<.0001);
  assert.ok(result.y+result.height<383);assert.equal(result.scaleBaseHeight,result.height);
});

test('a sloping paper body controls the subtitle angle without following its rope or accent marks',async()=>{
  const image=await sharp(Buffer.from('<svg width="640" height="160"><circle cx="45" cy="110" r="38" fill="#80501e"/><path d="M45 45L90 6L104 52Z" fill="#ffe249"/><g transform="rotate(-3 350 90)"><path d="M110 54H580L608 90L580 126H110Z" fill="#fff0c9"/></g></svg>')).png().toBuffer();
  const content=await measureBannerBackingContent(image);
  assert.equal(content.method,'central-solid-body-v2');
  assert.ok(Math.abs(content.rotation+3)<.3,`measured ${content.rotation}`);
  const source={x:0,y:0,width:1,height:1,textColor:'#674025',rotation:0};
  const result=centerSubtitleInBacking(source,{x:10,y:20,width:640,height:160},content);
  assert.ok(Math.abs(result.rotation-content.rotation)<.05);
  assert.equal(result.textColor,source.textColor);
  assert.equal(result.backingAligned,true);
  const centerX=result.x+result.width/2-10,centerY=result.y+result.height/2-20;
  const expectedCenterY=90+Math.tan(-3*Math.PI/180)*(centerX-350);
  assert.ok(Math.abs(centerY-expectedCenterY)<2);
  assert.ok(result.height<72&&result.height>25);
});

test('horizontal paper resets a previous subtitle angle and legacy content retains its saved angle',async()=>{
  const image=await sharp(Buffer.from('<svg width="600" height="120"><rect x="70" y="30" width="480" height="70" fill="#fff0c9"/></svg>')).png().toBuffer();
  const measured=await measureBannerBackingContent(image);
  assert.equal(measured.rotation,0);
  const subtitle={x:0,y:0,width:30,height:10,rotation:-5};
  assert.equal(centerSubtitleInBacking(subtitle,{x:0,y:0,width:600,height:120},measured).rotation,0);
  assert.equal(centerSubtitleInBacking(subtitle,{x:0,y:0,width:600,height:120},{x:.1,y:.2,width:.8,height:.5}).rotation,-5);
  assert.equal(subtitle.rotation,-5);
});

test('transparent artwork does not invent a paper angle',async()=>{
  const image=await sharp({create:{width:600,height:120,channels:4,background:'#00000000'}}).png().toBuffer();
  const content=await measureBannerBackingContent(image);
  assert.equal(content.method,'conservative-inset');
  assert.equal(content.rotation,undefined);
});

test('subtitle follows the drawn slope when raster backing is stretched',()=>{
  const content={x:.1,y:.2,width:.8,height:.5,rotation:-4,sourceAspect:5};
  const preserved=centerSubtitleInBacking({}, {x:0,y:0,width:500,height:100},content);
  assert.equal(preserved.rotation,-4);
  const taller=centerSubtitleInBacking({}, {x:0,y:0,width:500,height:200},content);
  const expected=Math.atan(Math.tan(-4*Math.PI/180)*2)*180/Math.PI;
  assert.ok(Math.abs(taller.rotation-expected)<1e-10);
  assert.ok(taller.rotation<-7.9&&taller.rotation>-8);
  const legacy=centerSubtitleInBacking({}, {x:0,y:0,width:500,height:200},{x:.1,y:.2,width:.8,height:.5,rotation:-4});
  assert.equal(legacy.rotation,-4);
});
