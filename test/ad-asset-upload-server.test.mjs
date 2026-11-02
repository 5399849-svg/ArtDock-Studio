import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {Readable} from 'node:stream';
import sharp from 'sharp';
import {createAdResourcesHandler} from '../lib/ad-resources-server.mjs';
import {adUploadType,receiveAdAssetUpload,validateAdUploadSize} from '../lib/ad-asset-upload.mjs';
import {PSD_UPLOAD_MAX_BYTES,IMAGE_UPLOAD_MAX_BYTES} from '../public/ad-upload-policy.js';

const MiB=1024*1024;
const sheet={sourceName:'test.xlsx',sourceSha256:'upload-test',specs:[]};
const psdHeader=()=>{const h=Buffer.alloc(26);h.write('8BPS');h.writeUInt16BE(1,4);h.writeUInt16BE(3,12);h.writeUInt32BE(20,14);h.writeUInt32BE(40,18);h.writeUInt16BE(8,22);h.writeUInt16BE(3,24);return h};
async function* sizedPsd(bytes){
  const header=psdHeader();yield header;
  const chunk=Buffer.alloc(MiB);let left=bytes-header.length;
  while(left>0){const count=Math.min(left,chunk.length);yield chunk.subarray(0,count);left-=count}
}
async function call(handle,method,pathname,body,{raw=false,headers={}}={}){
  const req=raw?Readable.from(body):Readable.from(body?[Buffer.from(JSON.stringify(body))]:[]);
  req.method=method;req.headers=headers;
  let status=0,payload;
  const res={writeHead(value){status=value},end(value){payload=JSON.parse(Buffer.from(value).toString())}};
  await handle(req,res,new URL(pathname,'http://localhost'));
  return {status,body:payload};
}
async function setup(t,options={}){
  const runtimeDir=await fs.mkdtemp(path.join(os.tmpdir(),'ad-upload-test-')),storageDir=path.join(runtimeDir,'storage');
  t.after(()=>fs.rm(runtimeDir,{recursive:true,force:true}));await fs.mkdir(storageDir);
  const handle=await createAdResourcesHandler({root:runtimeDir,runtimeDir,storageDir,catalogProvider:async()=>sheet,...options});
  const batch=(await call(handle,'POST','/api/ad-resources/batches',{project:'大 PSD'})).body.batch;
  return {handle,batch,runtimeDir,storageDir,endpoint:`/api/ad-resources/batches/${batch.id}/assets/upload`};
}
async function entries(directory){return fs.readdir(directory).catch(error=>{if(error.code==='ENOENT')return [];throw error})}
async function noStaging(runtimeDir){assert.deepEqual(await entries(path.join(runtimeDir,'ad-uploads')),[])}
async function noAssetFiles(storageDir,batch){assert.deepEqual(await entries(path.join(storageDir,`ad-resources-${batch.id}`,'asset')),[])}
const noRecords=async(handle)=>assert.equal((await call(handle,'GET','/api/ad-resources')).body.batches[0].assets.length,0);

test('PSD limit is inclusive 500 MiB while raster images retain 20 MiB',()=>{
  assert.equal(PSD_UPLOAD_MAX_BYTES,500*MiB);assert.equal(IMAGE_UPLOAD_MAX_BYTES,20*MiB);
  assert.doesNotThrow(()=>validateAdUploadSize(500*MiB,true));
  assert.throws(()=>validateAdUploadSize(500*MiB+1,true),error=>error.status===413&&/500MB/.test(error.message));
  assert.doesNotThrow(()=>validateAdUploadSize(20*MiB,false));
  assert.throws(()=>validateAdUploadSize(20*MiB+1,false),error=>error.status===413);
  assert.equal(adUploadType('主图.PSD','application/octet-stream').isPsd,true);
  assert.throws(()=>adUploadType('主图.psd','image/png'),/文件名与格式/);
  assert.throws(()=>adUploadType('主图.psb','application/octet-stream'),/仅支持/);
});

test('81 MiB binary PSD is streamed and an unverified clean background is flagged',async t=>{
  let observedBytes=0;
  const png=await sharp({create:{width:40,height:20,channels:4,background:'#d9af73'}}).png().toBuffer();
  const logo=await sharp({create:{width:8,height:4,channels:4,background:'#223344'}}).png().toBuffer();
  const {handle,batch,runtimeDir,storageDir,endpoint}=await setup(t,{psdExtractor:async({original,target,cleanTarget,logoTarget})=>{
    observedBytes=(await fs.stat(original)).size;
    await fs.writeFile(target,png);await fs.writeFile(cleanTarget,png);await fs.writeFile(logoTarget,logo);
    return {logoSeparated:true,logoVisible:true,logoRemaining:true,logoFree:false,logoBounds:[3,2,11,6]};
  }});
  const result=await call(handle,'POST',`${endpoint}?name=${encodeURIComponent('主视觉.PSD')}&role=visual`,sizedPsd(81*MiB),{raw:true,headers:{'content-type':'application/octet-stream','content-length':String(81*MiB)}});
  assert.equal(result.status,201);assert.equal(observedBytes,81*MiB);
  assert.equal(result.body.asset.sourceFormat,'PSD');assert.equal(result.body.asset.hasEmbeddedLogo,true);
  assert.equal(result.body.derivedAssets.length,2);
  assert.equal(result.body.derivedAssets[0].logoFree,false);
  assert.match(result.body.derivedAssets[0].name,/背景待清理/);
  assert.match(result.body.warnings[0],/底图仍含原 Logo/);
  const current=(await call(handle,'GET','/api/ad-resources')).body.batches[0];
  assert.equal(current.assets.length,3);assert.equal(current.activeLogoAssetId,result.body.derivedAssets[1].id);
  const assetDir=path.join(storageDir,`ad-resources-${batch.id}`,'asset');
  const files=await fs.readdir(assetDir);assert.equal(files.length,4);
  assert.equal((await fs.stat(path.join(assetDir,files.find(name=>name.endsWith('.psd'))))).size,81*MiB);
  await noStaging(runtimeDir);
});

test('500 MiB header limit rejects immediately without reading request bytes',async t=>{
  const {handle,runtimeDir,storageDir,batch,endpoint}=await setup(t);
  let read=false;
  async function* bytes(){read=true;yield psdHeader()}
  await assert.rejects(()=>call(handle,'POST',`${endpoint}?name=large.psd`,bytes(),{raw:true,headers:{'content-length':String(500*MiB+1)}}),error=>error.status===413&&/500MB/.test(error.message));
  assert.equal(read,false);await noStaging(runtimeDir);await noAssetFiles(storageDir,batch);await noRecords(handle);
});

test('chunked PSD rejects the actual 500 MiB plus one byte and removes its partial file',async t=>{
  const {handle,runtimeDir,storageDir,batch,endpoint}=await setup(t);
  await assert.rejects(()=>call(handle,'POST',`${endpoint}?name=large.psd`,sizedPsd(500*MiB+1),{raw:true}),error=>error.status===413&&/500MB/.test(error.message));
  await noStaging(runtimeDir);await noAssetFiles(storageDir,batch);await noRecords(handle);
});

test('interrupted stream, incomplete body and invalid PSD leave no files or records',async t=>{
  let calls=0;
  const {handle,runtimeDir,storageDir,batch,endpoint}=await setup(t,{psdExtractor:()=>{calls++;throw new Error('should not parse')}});
  async function* interrupted(){yield psdHeader();throw new Error('connection reset')}
  await assert.rejects(()=>call(handle,'POST',`${endpoint}?name=partial.psd`,interrupted(),{raw:true}),/connection reset/);
  await noStaging(runtimeDir);
  await assert.rejects(()=>call(handle,'POST',`${endpoint}?name=short.psd`,[psdHeader()],{raw:true,headers:{'content-length':'1000'}}),/不完整/);
  await noStaging(runtimeDir);
  const png=await sharp({create:{width:10,height:10,channels:3,background:'#fff'}}).png().toBuffer();
  await assert.rejects(()=>call(handle,'POST',`${endpoint}?name=fake.psd`,[png],{raw:true}),/PSD 文件无效/);
  assert.equal(calls,0);await noStaging(runtimeDir);await noAssetFiles(storageDir,batch);await noRecords(handle);
});

test('PSD extraction failure removes partial outputs without publishing a task asset',async t=>{
  const {handle,runtimeDir,storageDir,batch,endpoint}=await setup(t,{psdExtractor:async({target,cleanTarget})=>{
    await fs.writeFile(target,'partial');await fs.writeFile(cleanTarget,'partial');throw new Error('PSD damaged');
  }});
  await assert.rejects(()=>call(handle,'POST',`${endpoint}?name=broken.psd`,[psdHeader()],{raw:true}),/PSD damaged/);
  await noStaging(runtimeDir);await noAssetFiles(storageDir,batch);await noRecords(handle);
});

test('parallel PSD imports serialize extraction and a failed parser does not block later uploads',async t=>{
  const png=await sharp({create:{width:40,height:20,channels:4,background:'#abc'}}).png().toBuffer();
  let calls=0,active=0,maxActive=0,releaseFirst,startFirst;
  const firstStarted=new Promise(resolve=>{startFirst=resolve}),gate=new Promise(resolve=>{releaseFirst=resolve});
  const {handle,runtimeDir,endpoint}=await setup(t,{psdExtractor:async({target})=>{
    calls++;active++;maxActive=Math.max(maxActive,active);
    try{if(calls===1){startFirst();await gate;throw new Error('first PSD damaged')}await fs.writeFile(target,png);return {logoSeparated:false}}
    finally{active--}
  }});
  const first=call(handle,'POST',`${endpoint}?name=first.psd`,[psdHeader()],{raw:true}).then(()=>null,error=>error);
  await firstStarted;
  const second=call(handle,'POST',`${endpoint}?name=second.psd`,[psdHeader()],{raw:true});
  const image=await call(handle,'POST',`${endpoint}?name=independent.png`,[png],{raw:true});
  assert.equal(image.status,201);assert.equal(calls,1);releaseFirst();
  assert.match((await first).message,/first PSD damaged/);assert.equal((await second).status,201);
  assert.equal(calls,2);assert.equal(maxActive,1);
  const records=(await call(handle,'GET','/api/ad-resources')).body.batches[0].assets;
  assert.deepEqual(records.map(entry=>entry.name),['independent.png','second.psd']);
  const saved=JSON.parse(await fs.readFile(path.join(runtimeDir,'ad-resources-jobs.json'),'utf8'));
  assert.equal(saved[0].assets.length,2);await noStaging(runtimeDir);
});

test('mislabeled image content rejects cleanly and legacy JSON image upload remains usable',async t=>{
  const {handle,runtimeDir,storageDir,batch,endpoint}=await setup(t);
  const png=await sharp({create:{width:32,height:24,channels:4,background:'#eeddaa'}}).png().toBuffer();
  await assert.rejects(()=>call(handle,'POST',`${endpoint}?name=fake.jpg`,[png],{raw:true}),/文件内容与格式/);
  await noStaging(runtimeDir);await noAssetFiles(storageDir,batch);await noRecords(handle);
  const result=await call(handle,'POST',`/api/ad-resources/batches/${batch.id}/assets`,{name:'旧客户端.png',role:'visual',dataUrl:`data:image/png;base64,${png.toString('base64')}`});
  assert.equal(result.status,201);assert.equal(result.body.asset.width,32);assert.equal(result.body.asset.sourceFormat,'PNG');
  await noStaging(runtimeDir);
});

test('binary image overlimit returns JSON 413 over HTTP and removes staged bytes',async t=>{
  const state=await setup(t);
  const server=http.createServer(async(req,res)=>{
    try{await state.handle(req,res,new URL(req.url,'http://localhost'))}
    catch(error){res.writeHead(error.status||500,{'Content-Type':'application/json'});res.end(JSON.stringify({error:error.message}))}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve)}));
  const response=await new Promise((resolve,reject)=>{
    const req=http.request({hostname:'127.0.0.1',port:server.address().port,path:`${state.endpoint}?name=large.png`,method:'POST',headers:{'Content-Type':'application/octet-stream'}},res=>{
      const parts=[];res.on('data',part=>parts.push(part));res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(Buffer.concat(parts))}));
    });req.on('error',reject);
    const chunk=Buffer.alloc(MiB);let count=0;
    const write=()=>{while(count<21){count++;if(!req.write(chunk)){req.once('drain',write);return}}req.end()};write();
  });
  assert.equal(response.status,413);assert.match(response.body.error,/20MB/);
  await noStaging(state.runtimeDir);await noRecords(state.handle);
});

test('zero-byte and malformed length headers reject before extraction',async t=>{
  const runtimeDir=await fs.mkdtemp(path.join(os.tmpdir(),'ad-empty-upload-test-'));t.after(()=>fs.rm(runtimeDir,{recursive:true,force:true}));
  const req=Readable.from([]);req.headers={'content-length':'0'};
  await assert.rejects(()=>receiveAdAssetUpload(req,{runtimeDir,name:'empty.psd'}),/为空/);
  const malformed=Readable.from([]);malformed.headers={'content-length':'not-a-number'};
  await assert.rejects(()=>receiveAdAssetUpload(malformed,{runtimeDir,name:'empty.psd'}),error=>error.status===400);
  await noStaging(runtimeDir);
});
