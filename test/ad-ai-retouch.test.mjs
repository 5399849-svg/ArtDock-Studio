import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {planAdAiRetouch,maskAdAiRetouchInput,finishAdAiRetouch} from '../lib/ad-ai-retouch.mjs';

test('directional seams select an edge while open-ended edits remain full-scene requests',()=>{
  const spec={width:640,height:400};
  assert.equal(planAdAiRetouch('修复上面背景接缝',spec).side,'top');assert.equal(planAdAiRetouch('修复左边的拼接',spec).side,'left');
  assert.equal(planAdAiRetouch('修复背景接缝',spec),null);assert.equal(planAdAiRetouch('人物放大一点',spec),null);
  assert.equal(planAdAiRetouch('人物放大一点；修复顶部接缝',spec),null,'Mixed composition requests must not silently become edge-only edits');
  assert.equal(planAdAiRetouch('修复顶部10%背景的接缝',spec).depth,40);
});

test('a full scene provides repair context and all pixels outside the feathered edge remain unchanged',async()=>{
  const spec={width:640,height:400},plan=planAdAiRetouch('修复上面背景接缝',spec);
  const source=await sharp({create:{...spec,channels:3,background:'#345678'}}).png().toBuffer(),changed=await sharp({create:{...spec,channels:3,background:'#abc123'}}).png().toBuffer();
  const masked=await maskAdAiRetouchInput(source,plan),mask=await sharp(masked).raw().toBuffer();
  assert.deepEqual([...mask.slice(0,3)],[255,0,255]);assert.deepEqual([...mask.slice(200*640*3,200*640*3+3)],[52,86,120]);
  const finished=await finishAdAiRetouch(source,changed,plan),a=await sharp(source).raw().toBuffer(),b=await sharp(finished).raw().toBuffer();
  assert.deepEqual([...b.slice(0,3)],[171,193,35]);assert.ok(a.slice((plan.depth+plan.feather)*640*3).equals(b.slice((plan.depth+plan.feather)*640*3)));
});

test('unchanged results and unfilled masks do not become successful repairs',async()=>{
  const spec={width:640,height:400},plan=planAdAiRetouch('修复上面背景接缝',spec),source=await sharp({create:{...spec,channels:3,background:'#345678'}}).png().toBuffer();
  await assert.rejects(()=>finishAdAiRetouch(source,source,plan),e=>e.editStatus==='needs_revision');
  await assert.rejects(async()=>finishAdAiRetouch(source,await maskAdAiRetouchInput(source,plan),plan),e=>e.editStatus==='needs_revision');
});
