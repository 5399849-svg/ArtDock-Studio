import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Readable} from 'node:stream';
import sharp from 'sharp';
import {createAdResourcesHandler,renderAdJpg} from '../lib/ad-resources-server.mjs';
import {isAdImageUrl} from '../public/ad-image-url.js';

const spec={id:'one',number:1,name:'测试资源位',width:640,height:400,format:'JPG',logo:'required',maxBytes:300*1024};
const draft={sourceAssetId:'art',logoAssetId:'logo',zoom:1,offsetX:0,offsetY:0,logoScale:.2,logoX:.05,logoY:.05};
const base='/api/ad-resources/batches/batch/items/one';
async function request(handle,method,url,body){
  const req=Readable.from(body?[Buffer.from(JSON.stringify(body))]:[]);req.method=method;
  let status,headers,buffer;await handle(req,{writeHead(s,h){status=s;headers=h},end(v){buffer=Buffer.from(v)}},new URL(url,'http://localhost'));
  return {status,headers,buffer,body:headers['Content-Type'].includes('application/json')?JSON.parse(buffer):null};
}
async function fixture(t,alter){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'ad-versions-')),storageDir=path.join(root,'storage'),folder=path.join(storageDir,'ad-resources-batch'),candidates=path.join(folder,'candidate');
  t.after(()=>fs.rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:30}));await fs.mkdir(path.join(folder,'asset'),{recursive:true});await fs.mkdir(candidates);
  const art=await sharp({create:{width:640,height:400,channels:3,background:'#234567'}}).png().toBuffer(),logo=await sharp({create:{width:80,height:40,channels:4,background:'#ec2020'}}).png().toBuffer();
  await fs.writeFile(path.join(folder,'asset/art.png'),art);await fs.writeFile(path.join(folder,'asset/logo.png'),logo);
  const jpg=await renderAdJpg(art,spec,draft,logo);await fs.writeFile(path.join(candidates,'old.jpg'),jpg);
  const batch={id:'batch',project:'保留方案测试',sourceSha256:'version-sheet',assets:[{id:'art',role:'visual',width:640,height:400,url:'/storage/ad-resources-batch/asset/art.png',logoFree:true},{id:'logo',role:'logo',width:80,height:40,url:'/storage/ad-resources-batch/asset/logo.png'}],items:{one:{draft:{...draft},versions:[{number:1,name:'old.jpg',storageName:'old.jpg',url:'/storage/ad-resources-batch/candidate/old.jpg'}]}}};
  alter?.(batch);const file=path.join(root,'ad-resources-jobs.json');await fs.writeFile(file,JSON.stringify([batch]));
  const make=()=>createAdResourcesHandler({root,runtimeDir:root,storageDir,catalogProvider:async()=>({sourceSha256:'version-sheet',specs:[spec]}),nanoGenerate:()=>assert.fail('version operations must never call AI'),aiEditGenerate:()=>assert.fail('version operations must never call AI')});
  const handle=await make(),get=async(h=handle)=>(await request(h,'GET','/api/ad-resources')).body.batches[0];
  return {root,file,folder,candidates,handle,make,get,batch,jpg};
}
const entries=buffer=>{const result=[];let offset=0;while(buffer.readUInt32LE(offset)===0x04034b50){const size=buffer.readUInt32LE(offset+18),n=buffer.readUInt16LE(offset+26),extra=buffer.readUInt16LE(offset+28),start=offset+30+n+extra;result.push({name:buffer.subarray(offset+30,offset+30+n).toString(),data:buffer.subarray(start,start+size)});offset=start+size;}return result;};

test('many Logo micro-adjustments save parameters only, support bounded undo/redo and survive restart',async t=>{
  const f=await fixture(t),files=await fs.readdir(f.candidates);
  for(let n=1;n<=35;n++)await request(f.handle,'PUT',base+'/draft',{...draft,logoX:(5+n)/100});
  let item=(await f.get()).items.one;assert.equal(item.versions.length,1);assert.equal(item.draftDirty,true);assert.equal(item.draftUndo.length,30);assert.deepEqual(await fs.readdir(f.candidates),files);
  const undo=(await request(f.handle,'POST',base+'/draft/undo',{draft:item.draft})).body;assert.equal(undo.draft.logoX,.39);assert.equal(undo.canRedo,true);
  const redo=(await request(f.handle,'POST',base+'/draft/redo',{draft:undo.draft})).body;assert.equal(redo.draft.logoX,.4);assert.equal(redo.canRedo,false);
  item=(await f.get(await f.make())).items.one;assert.equal(item.draft.logoX,.4);assert.equal(item.draftDirty,true);assert.equal(item.versions.length,1);assert.ok((await fs.readFile(path.join(f.candidates,'old.jpg'))).equals(f.jpg));
});

test('explicit retention stores only a thumbnail and immutable composition, deduplicates and renders exact full size',async t=>{
  const f=await fixture(t),next={...draft,logoScale:.35,logoX:.55};await request(f.handle,'PUT',base+'/draft',next);
  const v=(await request(f.handle,'POST',base+'/snapshots',{expectedVersion:1,draft:next})).body.version;
  assert.equal(v.number,2);assert.equal(v.kind,'composition');assert.equal(v.storageName,undefined);assert.deepEqual(v.draftSnapshot,next);
  assert.deepEqual((await fs.readdir(f.candidates)).sort(),['old.jpg',v.thumbnailStorageName].sort());
  const thumb=(await request(f.handle,'GET',base+'/versions/2/thumbnail')).buffer,meta=await sharp(thumb).metadata();assert.ok(meta.width<=360&&meta.height<=240);
  const image=(await request(f.handle,'GET',v.url)).buffer,full=await sharp(image).metadata();assert.equal(full.width,640);assert.equal(full.height,400);assert.ok(thumb.length<image.length);
  const same=(await request(f.handle,'POST',base+'/snapshots',{expectedVersion:2,draft:next})).body;assert.equal(same.deduplicated,true);assert.equal((await f.get()).items.one.versions.length,2);
  await request(f.handle,'PUT',base+'/draft',{...next,logoX:.1});assert.ok((await request(f.handle,'GET',v.url)).buffer.equals(image),'history snapshots must not follow later working edits');
  await assert.rejects(()=>request(f.handle,'POST',base+'/snapshots',{expectedVersion:1}),/版本列表已更新/);
});

test('suite export freezes a changed working composition once and repeat output adds no versions',async t=>{
  const f=await fixture(t);await request(f.handle,'PUT',base+'/draft',{...draft,logoX:.6});
  const expected=(await request(f.handle,'GET',base+'/preview')).buffer;
  const zip=await request(f.handle,'POST','/api/ad-resources/batches/batch/download');assert.equal(zip.status,200);assert.ok(entries(zip.buffer).find(e=>e.name.endsWith('.jpg')).data.equals(expected));
  let batch=await f.get();assert.equal(batch.items.one.versions.length,2);assert.equal(batch.items.one.draftDirty,false);assert.equal(batch.deliveredVersions.one,2);
  await request(f.handle,'POST','/api/ad-resources/batches/batch/download');batch=await f.get();assert.equal(batch.items.one.versions.length,2);
});

test('deleting any history snapshot preserves the working draft, releases only unreferenced files and never reuses numbers',async t=>{
  const f=await fixture(t);await request(f.handle,'PUT',base+'/draft',{...draft,logoX:.6});
  const v=(await request(f.handle,'POST',base+'/snapshots',{})).body.version,working=(await f.get()).items.one.draft;
  await request(f.handle,'DELETE',base+'/versions/1',{expectedVersion:2});await assert.rejects(()=>fs.stat(path.join(f.candidates,'old.jpg')),/ENOENT/);
  const removed=(await request(f.handle,'DELETE',base+'/versions/2',{expectedVersion:2})).body;assert.deepEqual(removed.draft,working);assert.equal(removed.draftDirty,true);assert.equal(removed.versions.length,0);
  await assert.rejects(()=>fs.stat(path.join(f.candidates,v.thumbnailStorageName)),/ENOENT/);assert.ok(await fs.stat(path.join(f.folder,'asset/art.png')));assert.ok(await fs.stat(path.join(f.folder,'asset/logo.png')));
  const restarted=await f.make(),newVersion=(await request(restarted,'POST',base+'/snapshots',{expectedVersion:0})).body.version;assert.equal(newVersion.number,3);
  assert.deepEqual((await f.get(restarted)).items.one.draft,working);
});

test('delivered and shared files stay referenced while deletion stays absent after restart',async t=>{
  const f=await fixture(t,b=>{b.downloadedAt='2026-10-21';b.deliveredVersions={one:1};b.items.one.aiEditJob={id:'job-old',status:'completed',versionNumber:1,basePreviewUrl:b.items.one.versions[0].url};});
  const result=(await request(f.handle,'DELETE',base+'/versions/1',{})).body;assert.equal(result.retainedForDelivery,true);assert.equal(result.removedFiles,0);assert.ok(await fs.stat(path.join(f.candidates,'old.jpg')));
  const b=await f.get(await f.make());assert.equal(b.items.one.versions.length,0);assert.equal(b.items.one.aiEditJob.status,'version_deleted');assert.equal(b.items.one.aiEditJob.basePreviewUrl,'');assert.equal(b.deliveryArchive[0].number,1);
  assert.ok((await request(f.handle,'GET',base+'/versions/1/image')).buffer.equals(f.jpg));
  const shared=await fixture(t,b=>{b.items.other={draft:{...draft},versions:[{...b.items.one.versions[0]}]};});
  assert.equal((await request(shared.handle,'DELETE',base+'/versions/1',{})).body.removedFiles,0);assert.ok(await fs.stat(path.join(shared.candidates,'old.jpg')));
});

test('invalid filenames and active jobs reject deletion without mutating history',async t=>{
  for(const alter of [b=>b.items.one.versions[0].storageName='../asset/art.png',b=>b.items.one.aiEditJob={id:'running',status:'result_uncertain'}]){
    const f=await fixture(t,alter),before=await fs.readFile(f.file,'utf8');await assert.rejects(()=>request(f.handle,'DELETE',base+'/versions/1',{}),/路径无效|正在 AI 修改/);assert.equal(await fs.readFile(f.file,'utf8'),before);
  }
});

test('only safe local artwork and version URLs are rendered',()=>{
  for(const url of ['/storage/batch/candidate/art.jpg','/api/ad-resources/batches/batch/items/one/versions/12/image','/api/ad-resources/batches/batch/items/one/versions/12/thumbnail'])assert.equal(isAdImageUrl(url),true);
  for(const url of ['javascript:alert(1)','https://remote.example/a.jpg','/api/ad-resources/batches/batch/items/one/versions/1/delete','/storage/a.jpg" onload="bad'])assert.equal(isAdImageUrl(url),false);
});
