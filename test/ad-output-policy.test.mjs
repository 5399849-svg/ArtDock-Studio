import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {Readable} from 'node:stream';
import sharp from 'sharp';
import {readAdOutputPolicy} from '../lib/ad-output-policy.mjs';
import {adCatalogWithOutputPolicy,adWorkspaceCatalog} from '../public/ad-output-policy.js';
import {createAdResourcesHandler,renderAdJpg,validateAdCandidate} from '../lib/ad-resources-server.mjs';
import {encodeDetailAdJpeg} from '../lib/ad-jpeg-quality.mjs';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('..',import.meta.url)),policy=await readAdOutputPolicy(root);
const original=JSON.parse(await fs.readFile(new URL('../config/ad-resources-v1.json',import.meta.url),'utf8'));
const catalog={...original,specs:original.specs.filter(spec=>['ad-03','ad-05'].includes(spec.id))};
const newCatalog=adCatalogWithOutputPolicy(catalog,policy);
async function request(handle,method,url,body){
  const req=Readable.from(body?[Buffer.from(JSON.stringify(body))]:[]);req.method=method;let status,headers,buffer;
  await handle(req,{writeHead(code,h){status=code;headers=h},end(chunk){buffer=Buffer.from(chunk||'')}},new URL(url,'http://localhost'));
  return {status,headers,buffer,body:headers['Content-Type'].includes('json')?JSON.parse(buffer):null};
}
const at=(sheet,id)=>sheet.specs.find(spec=>spec.id===id);
function art(width,height){
  const pixels=Buffer.alloc(width*height*3);let seed=17;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;const noise=((seed>>>24)/255-.5)*24,i=(y*width+x)*3;
    pixels[i]=Math.max(0,Math.min(255,115+50*Math.sin(x/18)+noise));pixels[i+1]=Math.max(0,Math.min(255,140+50*Math.cos(y/29)+noise));pixels[i+2]=Math.max(0,Math.min(255,170+40*Math.sin((x+y)/39)+noise));
  }
  return sharp(pixels,{raw:{width,height,channels:3}}).png().toBuffer();
}

test('only the two specified placements get new inclusive bounds; old workspace rules remain original',()=>{
  const before=JSON.stringify(original),all=adCatalogWithOutputPolicy(original,policy);
  assert.equal(at(all,'ad-03').minBytes,200*1024);assert.equal(at(all,'ad-03').maxBytes,300*1024);
  assert.equal(at(all,'ad-05').minBytes,300*1024);assert.equal(at(all,'ad-05').maxBytes,400*1024);
  assert.equal(at(all,'ad-03').limitRaw,'200–300KB');assert.equal(at(all,'ad-05').limitRaw,'300–400KB');
  for(const spec of original.specs.filter(spec=>!['ad-03','ad-05'].includes(spec.id)))assert.deepEqual(at(all,spec.id),spec);
  const data={catalog:all,baseCatalog:original};assert.equal(adWorkspaceCatalog(data,{}),original);assert.equal(adWorkspaceCatalog(data,null),all);
  assert.equal(at(adWorkspaceCatalog(data,{outputPolicy:policy}),'ad-03').minBytes,204800);
  assert.equal(JSON.stringify(original),before);assert.equal(all.sourceSha256,original.sourceSha256,'file-size policy must not trigger old catalog migration');
});

test('both range endpoints are accepted while uploads outside either bound are rejected',async()=>{
  for(const spec of newCatalog.specs){
    const jpg=await sharp({create:{width:spec.width,height:spec.height,channels:3,background:'#647598'}}).jpeg().toBuffer();
    const sized=size=>Buffer.concat([jpg,Buffer.alloc(size-jpg.length)]); // Synthetic boundary fixture; the production encoder never pads files.
    await assert.rejects(()=>validateAdCandidate(spec,sized(spec.minBytes-1)),/不能小于/);
    assert.equal((await validateAdCandidate(spec,sized(spec.minBytes))).bytes,spec.minBytes);
    assert.equal((await validateAdCandidate(spec,sized(spec.maxBytes))).bytes,spec.maxBytes);
    await assert.rejects(()=>validateAdCandidate(spec,sized(spec.maxBytes+1)),/不大于/);
  }
  const old=at(catalog,'ad-03'),jpg=await sharp({create:{width:640,height:400,channels:3,background:'#647598'}}).jpeg().toBuffer();
  assert.ok((await validateAdCandidate(old,jpg)).bytes<200*1024,'old tasks can retain earlier small files');
  await assert.rejects(()=>validateAdCandidate(old,Buffer.concat([jpg,Buffer.alloc(old.maxBytes-jpg.length)])),/小于/);
});

test('a flat source is rejected instead of inflated with padding, noise or unrelated image changes',async()=>{
  const spec=at(newCatalog,'ad-03'),flat=await sharp({create:{width:640,height:400,channels:3,background:'#647598'}}).png().toBuffer();
  await assert.rejects(()=>encodeDetailAdJpeg(flat,spec),/最高质量.*低于 200KB/);
});

test('new tasks freeze their own size policy and enforce it through saving and ZIP export; old tasks stay byte-identical',async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'ad-output-policy-')),storageDir=path.join(dir,'storage');await fs.mkdir(storageDir);
  t.after(()=>fs.rm(dir,{recursive:true,force:true,maxRetries:6,retryDelay:50}));
  const old={id:'old',project:'原有任务',sourceSha256:catalog.sourceSha256,assets:[],items:{}};
  const folder=path.join(storageDir,'ad-resources-old','candidate');await fs.mkdir(folder,{recursive:true});
  for(const spec of catalog.specs){const buffer=await sharp({create:{width:spec.width,height:spec.height,channels:3,background:'#647598'}}).jpeg({quality:94,mozjpeg:true}).toBuffer(),name=`原有任务${spec.logo==='required'?'_lg':''}_${spec.width}x${spec.height}.jpg`;await fs.writeFile(path.join(folder,name),buffer);old.items[spec.id]={draft:{},versions:[{number:1,name,storageName:name,bytes:buffer.length,review:{logoChecked:true,contentChecked:true,safeAreaChecked:true}}]};}
  const jobsFile=path.join(dir,'ad-resources-jobs.json');await fs.writeFile(jobsFile,JSON.stringify([old]));const oldSnapshot=structuredClone(old);
  let currentPolicy=structuredClone(policy);
  const make=()=>createAdResourcesHandler({root:dir,runtimeDir:dir,storageDir,catalogProvider:async()=>catalog,outputPolicyProvider:async()=>currentPolicy,nanoGenerate:()=>assert.fail('size rules do not trigger AI generation')});
  let handler=await make();const listed=(await request(handler,'GET','/api/ad-resources')).body;
  assert.equal(at(listed.catalog,'ad-03').minBytes,204800);assert.equal(at(adWorkspaceCatalog(listed,listed.batches[0]),'ad-03').minBytes,undefined);
  assert.equal((await request(handler,'GET','/api/ad-resources/batches/old/download')).status,200);
  const batch=(await request(handler,'POST','/api/ad-resources/batches',{project:'新任务'})).body.batch;
  assert.deepEqual(batch.outputPolicy,policy);assert.equal(batch.sourceSha256,old.sourceSha256);
  const endpoint=id=>`/api/ad-resources/batches/${batch.id}/items/${id}`;
  for(const spec of catalog.specs){
    const source=await art(spec.width,spec.height),asset=(await request(handler,'POST',`/api/ad-resources/batches/${batch.id}/assets`,{role:'visual',name:`纯图_${spec.id}.png`,dataUrl:'data:image/png;base64,'+source.toString('base64')})).body.asset;
    await request(handler,'PUT',endpoint(spec.id)+'/draft',{sourceAssetId:asset.id,zoom:1,offsetX:0,offsetY:0});
    const saved=await request(handler,'POST',endpoint(spec.id)+'/render',{});assert.equal(saved.status,201);
    const bounds=at(newCatalog,spec.id),version=saved.body.version;assert.ok(version.bytes>=bounds.minBytes&&version.bytes<=bounds.maxBytes,`${spec.id}: ${version.bytes} bytes`);
    const image=await request(handler,'GET',endpoint(spec.id)+`/versions/${version.number}/image`);assert.equal((await sharp(image.buffer).metadata()).chromaSubsampling,'4:4:4');assert.equal(image.buffer.readUInt16BE(image.buffer.length-2),0xffd9,'no trailing filler is added');
  }
  const zip=await request(handler,'GET',`/api/ad-resources/batches/${batch.id}/download`);assert.equal(zip.status,200);
  const undersized=await sharp({create:{width:640,height:400,channels:3,background:'#647598'}}).jpeg().toBuffer();
  await assert.rejects(()=>request(handler,'POST',endpoint('ad-03')+'/versions',{dataUrl:'data:image/jpeg;base64,'+undersized.toString('base64')}),/不能小于 200KB/,'the upload endpoint must enforce the task policy too');
  currentPolicy={...currentPolicy,version:'future-rule',rules:currentPolicy.rules.map(rule=>({...rule,minBytes:rule.minBytes+1024}))};
  handler=await make();const after=(await request(handler,'GET','/api/ad-resources')).body,retained=after.batches.find(row=>row.id===batch.id);
  assert.equal(retained.outputPolicy.version,policy.version);assert.equal(at(adWorkspaceCatalog(after,retained),'ad-03').minBytes,204800);
  assert.equal(at(after.catalog,'ad-03').minBytes,205824);
  assert.deepEqual(JSON.parse(await fs.readFile(jobsFile,'utf8')).find(row=>row.id==='old'),oldSnapshot);
  for(const spec of catalog.specs)assert.equal((await fs.stat(path.join(folder,old.items[spec.id].versions[0].name))).size,old.items[spec.id].versions[0].bytes);
  const persisted=JSON.parse(await fs.readFile(jobsFile,'utf8')),row=persisted.find(row=>row.id===batch.id),version=row.items['ad-03'].versions.at(-1),small=await sharp({create:{width:640,height:400,channels:3,background:'#647598'}}).jpeg().toBuffer();
  await fs.writeFile(path.join(storageDir,`ad-resources-${batch.id}`,'candidate',version.storageName),small);
  await assert.rejects(()=>request(handler,'GET',`/api/ad-resources/batches/${batch.id}/download`),/不能小于 200KB/,'ZIP export rechecks actual bytes even if saved metadata claims a valid size');
});
