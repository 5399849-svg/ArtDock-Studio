import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {createAdAiReferences,snapshotAdAiReferences,readAdAiReferenceBuffers,receiveAdAiReference} from '../lib/ad-ai-references.mjs';
import {validateAdAiReference,adAiSameReferences} from '../public/ad-ai-references.js';
import {Readable} from 'node:stream';

async function fixture(t){
  const storageDir=await fs.mkdtemp(path.join(os.tmpdir(),'ad-ai-references-'));t.after(()=>fs.rm(storageDir,{recursive:true,force:true}));
  const item={draft:{sourceAssetId:'original'},versions:[{number:1}]},other={versions:[]},batch={id:'test',assets:[],items:{one:item,two:other}},batches=[batch];let saved=0;
  const manager=createAdAiReferences({storageDir,batches,save:async()=>{saved++;},assertFree:state=>{if(state.aiEditJob?.status==='processing')throw Error('正在 AI 修改');}});
  const image=color=>sharp({create:{width:80,height:120,channels:3,background:color}}).png().toBuffer();
  return {storageDir,item,other,batch,batches,manager,image,saved:()=>saved};
}

test('references are normalized and deduplicated, separate from source assets, and unused files are reclaimed',async t=>{
  const f=await fixture(t),before=structuredClone(f.item),buffer=await f.image('#123456');
  const first=await f.manager.upload(f.batch,f.item,buffer,'构图.png'),ref=first.references[0];
  assert.equal(f.batch.assets.length,0);assert.deepEqual(f.item.draft,before.draft);assert.deepEqual(f.item.versions,before.versions);assert.equal(f.other.aiEditReferenceIds,undefined);
  assert.equal(ref.width,80);assert.equal(ref.height,120);assert.match(ref.url,/\/ai-reference\/reference-[a-f0-9-]+\.png$/);
  assert.equal((await f.manager.upload(f.batch,f.item,buffer,'同一张图.png')).references.length,1);assert.equal(f.batch.aiEditReferenceAssets.length,1);
  const job={referenceImages:snapshotAdAiReferences(f.batch,f.item,[ref.id])},[read]=await readAdAiReferenceBuffers({...f,job});assert.ok(read.equals(await fs.readFile(path.join(f.storageDir,ref.url.slice('/storage/'.length)))));
  await f.manager.remove(f.batch,f.item,ref.id);assert.deepEqual(f.manager.list(f.batch,f.item).references,[]);assert.equal(f.batch.aiEditReferenceAssets.length,0);
  await assert.rejects(()=>fs.stat(path.join(f.storageDir,ref.url.slice('/storage/'.length))),/ENOENT/);
});

test('immutable references survive selection removal, other sizes and restart while a historical receipt needs them',async t=>{
  const f=await fixture(t),buffer=await f.image('#234567');const {references:[ref]}=await f.manager.upload(f.batch,f.item,buffer,'参考.png');
  f.item.aiEditHistory=[{status:'failed',referenceImages:snapshotAdAiReferences(f.batch,f.item,[ref.id])}];
  await f.manager.upload(f.batch,f.other,buffer,'重复上传.png');assert.equal(f.batch.aiEditReferenceAssets.length,1);
  await f.manager.remove(f.batch,f.item,ref.id);await f.manager.remove(f.batch,f.other,ref.id);assert.equal(f.batch.aiEditReferenceAssets.length,1);
  const snapshot=JSON.parse(JSON.stringify(f.batch));const [restored]=await readAdAiReferenceBuffers({storageDir:f.storageDir,batch:snapshot,job:snapshot.items.one.aiEditHistory[0]});assert.equal((await sharp(restored).metadata()).width,80);
  const bad={referenceImages:[{...ref,url:'/storage/ad-resources-other/ai-reference/'+ref.storageName}]};await assert.rejects(()=>readAdAiReferenceBuffers({...f,job:bad}),/来源无效/);
  await fs.writeFile(path.join(f.storageDir,ref.url.slice('/storage/'.length)),await f.image('#fefefe'));
  await assert.rejects(()=>readAdAiReferenceBuffers({...f,job:snapshot.items.one.aiEditHistory[0]}),/文件已变化/);
});

test('bad formats, cross-size IDs, duplicate IDs, oversize uploads and concurrent over-limit additions are rejected',async t=>{
  const f=await fixture(t),buffer=await f.image('#123456');
  await assert.rejects(()=>f.manager.upload(f.batch,f.item,Buffer.from('<svg/>'),'fake.png'),/有效/);
  await assert.rejects(()=>f.manager.upload(f.batch,f.item,Buffer.alloc(10*1024*1024+1),'large.png'),/10MB/);
  const attempts=await Promise.allSettled(['#111111','#222222','#333333','#444444'].map(async color=>f.manager.upload(f.batch,f.item,await f.image(color),'并发.png')));
  assert.equal(attempts.filter(a=>a.status==='fulfilled').length,3);assert.equal(f.item.aiEditReferenceIds.length,3);assert.equal(f.batch.aiEditReferenceAssets.length,3);
  const id=f.item.aiEditReferenceIds[0];assert.throws(()=>snapshotAdAiReferences(f.batch,f.other,[id]),/不属于当前尺寸/);assert.throws(()=>snapshotAdAiReferences(f.batch,f.item,[id,id]),/不同/);assert.throws(()=>snapshotAdAiReferences(f.batch,f.item,'url'),/最多/);
  f.item.aiEditJob={status:'processing'};await assert.rejects(()=>f.manager.remove(f.batch,f.item,id),/正在 AI/);await assert.rejects(()=>f.manager.upload(f.batch,f.item,buffer,'test.png'),/正在 AI/);
  await assert.rejects(()=>receiveAdAiReference(Readable.from([Buffer.alloc(10*1024*1024),Buffer.from('x')])),/10MB/);
});

test('frontend validates reference files and request matching includes reference ordering',()=>{
  assert.equal(validateAdAiReference({type:'image/png',size:20,name:'图.png'}),'');assert.equal(validateAdAiReference({type:'',size:20,name:'图.JPG'}),'');assert.match(validateAdAiReference({type:'image/svg+xml',size:20,name:'图.svg'}),/仅支持/);assert.match(validateAdAiReference({type:'image/png',size:11*1024*1024}),/10MB/);
  assert.equal(adAiSameReferences(undefined,[]),true);assert.equal(adAiSameReferences(['a'],['a']),true);assert.equal(adAiSameReferences(['a'],['b']),false);assert.equal(adAiSameReferences(['a','b'],['b','a']),false);
});
