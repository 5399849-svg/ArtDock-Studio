import test from 'node:test';
import assert from 'node:assert/strict';
import { remapCommunityLayer, remapCommunitySubtitleBacking } from '../public/community-auto-layout.js';

test('community master adjustments follow each target composition', () => {
  const master = { width: 984, height: 562 };
  const portrait = { width: 900, height: 1200 };
  const sourceDefault = { x: 44, y: 84, width: 522, height: 242, visible: true };
  const targetDefault = { x: 54, y: 180, width: 792, height: 276, visible: true };
  const actual = { x: 64, y: 99, width: 470, height: 218, visible: true, effects: { stroke: { enabled: true } } };
  const result = remapCommunityLayer(master, portrait, sourceDefault, targetDefault, actual);
  assert.ok(result.x > targetDefault.x && result.y > targetDefault.y);
  assert.ok(result.width < targetDefault.width && result.height < targetDefault.height);
  assert.equal(result.effects.stroke.enabled, true);
  assert.ok(result.x >= 0 && result.x + result.width <= portrait.width);
  assert.ok(result.y >= 0 && result.y + result.height <= portrait.height);
});

test('community layout keeps tall and narrow targets inside the canvas', () => {
  const result = remapCommunityLayer(
    { width: 984, height: 562 }, { width: 120, height: 120 },
    { x: 500, y: 30, width: 400, height: 500 },
    { x: 70, y: 70, width: 80, height: 90 },
    { x: 900, y: 400, width: 600, height: 600, visible: false },
  );
  assert.equal(result.visible, false);
  assert.ok(result.x >= 0 && result.x + result.width <= 120);
  assert.ok(result.y >= 0 && result.y + result.height <= 120);
});

test('independent backing follows the subtitle composition while retaining its own offsets, size and paint', () => {
  const sourceSize={width:1000,height:500},targetSize={width:500,height:400};
  const sourceSubtitle={x:100,y:300,width:400,height:40};
  const targetSubtitle={x:50,y:260,width:200,height:32};
  const source={x:80,y:290,width:440,height:60,visible:false,backing:{enabled:true,shape:'capsule',fill:'#fff1d8',opacity:88,radius:12}};
  const before=structuredClone(source);
  const actual=remapCommunitySubtitleBacking(sourceSize,targetSize,sourceSubtitle,targetSubtitle,source);
  assert.deepEqual(actual,{...source,x:40,y:252,width:220,height:48});
  assert.deepEqual(source,before);
  actual.backing.fill='#000000';
  assert.equal(source.backing.fill,'#fff1d8');
  const moved=remapCommunitySubtitleBacking(sourceSize,targetSize,sourceSubtitle,targetSubtitle,{...source,x:120,y:310});
  assert.equal(moved.x,60);
  assert.equal(moved.y,268);
});

test('native backing remapping stays within narrow target canvases', () => {
  const actual=remapCommunitySubtitleBacking(
    {width:1000,height:500},{width:120,height:100},
    {x:80,y:300,width:400,height:40},{x:5,y:60,width:110,height:30},
    {x:800,y:430,width:800,height:120,visible:true,backing:{enabled:true,shape:'rect',fill:'#abcdef',opacity:65,radius:0}},
  );
  assert.ok(actual.x>=0 && actual.x+actual.width<=120);
  assert.ok(actual.y>=0 && actual.y+actual.height<=100);
  assert.equal(actual.backing.shape,'rect');
  assert.equal(actual.backing.opacity,65);
});

test('absent or disabled native backings never create a layer during remapping', () => {
  const sizes=[{width:1000,height:500},{width:500,height:400}];
  for(const source of [undefined,null,{}, {backing:{enabled:false}}]) {
    assert.equal(remapCommunitySubtitleBacking(...sizes,null,null,source),null);
  }
});
test('generated backing artwork keeps its natural ratio across target shapes',()=>{
  const source={x:30,y:230,width:480,height:96,visible:true,backing:{enabled:true,assetName:'paper.png',contentRect:{x:.1,y:.2,width:.8,height:.6}}};
  const mapped=remapCommunitySubtitleBacking({width:900,height:383},{width:500,height:400},{x:50,y:250,width:430,height:40},{x:30,y:170,width:320,height:30},source);
  assert.ok(Math.abs(mapped.width/mapped.height-5)<.000001);
  assert.equal(mapped.backing.assetName,'paper.png');
});
