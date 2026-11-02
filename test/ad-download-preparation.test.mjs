import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Readable} from 'node:stream';
import sharp from 'sharp';
import {createAdResourcesHandler} from '../lib/ad-resources-server.mjs';

async function request(handler,method,pathname,body){
  const req=Readable.from(body?[Buffer.from(JSON.stringify(body))]:[]);req.method=method;
  let status,result;const res={writeHead(value){status=value},end(chunk){result=chunk}};
  await handler(req,res,new URL(pathname,'http://localhost'));
  return {status,body:pathname.endsWith('/download')?result:JSON.parse(result)};
}

async function fixture(t,{blocked=false}={}){
  const runtimeDir=await fs.mkdtemp(path.join(os.tmpdir(),'ad-download-')),storageDir=path.join(runtimeDir,'storage');
  t.after(()=>fs.rm(runtimeDir,{recursive:true,force:true}));
  const baseSpec={format:'JPG',maxBytes:300*1024,limitRaw:'300KB',safeInsetX:0,logo:'required',platform:'头条搜索'};
  const specs=[{...baseSpec,id:'old',number:1,name:'已制作',width:160,height:90},
    ...[[160,90],[128,128],[90,160]].map(([width,height],i)=>({...baseSpec,id:'ad-'+(9+i),number:8+i,name:'头条搜索',width,height}))];
  if(blocked)specs.push({...baseSpec,id:'motion',number:11,name:'GIF',width:160,height:90,format:'GIF'});
  const sheet={sourceName:'spec.xlsx',sourceSha256:'sheet-current',specs},batch={id:'download-fixture',project:'下载补齐',sourceSha256:sheet.sourceSha256,downloadedAt:'2026-01-01',deliveredVersions:{old:2},assets:[],items:{}};
  const dir=path.join(storageDir,'ad-resources-'+batch.id,'asset');await fs.mkdir(dir,{recursive:true});await fs.mkdir(path.join(storageDir,'ad-resources-'+batch.id,'candidate'));
  for(const [index,[width,height]] of [[160,90],[128,128],[90,160]].entries()){
    const name=`source${index}.png`,buffer=await sharp({create:{width,height,channels:3,background:'#d4b58b'}}).png().toBuffer();await fs.writeFile(path.join(dir,name),buffer);
    batch.assets.push({id:'source'+index,role:'visual',name:'纯图'+index+'.png',width,height,logoFree:true,url:`/storage/ad-resources-${batch.id}/asset/${name}`});
  }
  const logo=await sharp({create:{width:40,height:20,channels:4,background:'#da2222'}}).png().toBuffer();await fs.writeFile(path.join(dir,'logo.png'),logo);
  batch.assets.push({id:'logo',role:'logo',name:'Logo.png',width:40,height:20,url:`/storage/ad-resources-${batch.id}/asset/logo.png`});batch.activeLogoAssetId='logo';
  for(const spec of specs){
    const index=spec.id==='ad-10'?1:spec.id==='ad-11'?2:0;
    batch.items[spec.id]={draft:{sourceAssetId:'source'+index,logoAssetId:'logo',zoom:1.15,offsetX:.03,offsetY:-.02,logoX:.65,logoY:.08,logoScale:.24},versions:[]};
  }
  const old=await sharp({create:{width:160,height:90,channels:3,background:'#999999'}}).jpeg().toBuffer();await fs.writeFile(path.join(storageDir,'ad-resources-'+batch.id,'candidate','old.jpg'),old);
  batch.items.old.versions=[{number:2,storageName:'old.jpg',name:'下载补齐_lg_160x90.jpg',review:{logoChecked:true,contentChecked:true,safeAreaChecked:true}}];
  if(blocked){
    batch.items['ad-9'].versions=[{number:1,invalidatedReason:'规范已更新，请重新排版'}];
    batch.items['ad-10'].draft.sourceAssetId='source0';
    batch.items['ad-11'].aiEditJob={status:'result_uncertain'};
  }
  await fs.writeFile(path.join(runtimeDir,'ad-resources-jobs.json'),JSON.stringify([batch]));
  const handle=await createAdResourcesHandler({root:runtimeDir,runtimeDir,storageDir,catalogProvider:async()=>sheet,nanoGenerate:async()=>{assert.fail('Download preparation must never submit a paid layout request')},videoGenerate:async()=>{assert.fail('Download preparation must never submit video generation')}});
  const route=`/api/ad-resources/batches/${batch.id}`;
  return {handle,batch,route,storageDir,sheet};
}

test('materializes the three seeded new placements locally and preserves manual layout, existing versions and delivery history',async t=>{
  const {handle,batch,route,storageDir}=await fixture(t),before=structuredClone(batch);
  const result=await request(handle,'POST',route+'/prepare-download',{});
  assert.equal(result.status,200);assert.equal(result.body.ready,true);assert.deepEqual(result.body.created,['ad-9','ad-10','ad-11']);assert.deepEqual(result.body.blocked,[]);
  const current=(await request(handle,'GET','/api/ad-resources')).body.batches[0];
  assert.deepEqual(current.items.old,before.items.old);assert.equal(current.downloadedAt,before.downloadedAt);assert.deepEqual(current.deliveredVersions,before.deliveredVersions);
  for(const id of result.body.created){
    assert.deepEqual(current.items[id].draft,before.items[id].draft);assert.equal(current.items[id].versions.length,1);
    assert.deepEqual(current.items[id].versions[0].review,{logoChecked:false,safeAreaChecked:false,contentChecked:false,note:''});
    const bytes=await fs.readFile(path.join(storageDir,'ad-resources-'+batch.id,'candidate',current.items[id].versions[0].storageName));
    const meta=await sharp(bytes).metadata();assert.equal(meta.format,'jpeg');assert.equal(meta.width,current.items[id].versions[0].width);assert.ok(bytes.length<300*1024);
    const pixel=await sharp(bytes).extract({left:Math.round(meta.width*.69),top:Math.round(meta.height*.11),width:1,height:1}).removeAlpha().raw().toBuffer();assert.ok(pixel[0]>pixel[1]*2,'original independent Logo is composed into the new required slot');
  }
  const repeated=await request(handle,'POST',route+'/prepare-download',{});assert.deepEqual(repeated.body.created,[]);
  const zip=await request(handle,'GET',route+'/download');assert.equal(zip.status,200);assert.ok(Buffer.isBuffer(zip.body));assert.equal(zip.body.readUInt32LE(),0x04034b50);
});

test('concurrent preparation requests do not create duplicate candidate versions',async t=>{
  const {handle,route}=await fixture(t);await Promise.all([request(handle,'POST',route+'/prepare-download',{}),request(handle,'POST',route+'/prepare-download',{})]);
  const current=(await request(handle,'GET','/api/ad-resources')).body.batches[0];for(const id of ['ad-9','ad-10','ad-11'])assert.equal(current.items[id].versions.length,1);
});

test('outdated work, missing ratio adaptation, active AI and missing GIFs remain explicit and are never approved or generated at download',async t=>{
  const {handle,batch,route}=await fixture(t,{blocked:true});
  const result=await request(handle,'POST',route+'/prepare-download',{});assert.equal(result.body.ready,false);assert.deepEqual(result.body.created,[]);
  assert.deepEqual(result.body.blocked.map(b=>b.specId),['ad-9','ad-10','ad-11','motion']);
  assert.match(result.body.blocked[0].reason,/规范已更新/);assert.match(result.body.blocked[1].reason,/适配/);assert.match(result.body.blocked[2].reason,/AI 修改/);assert.match(result.body.blocked[3].reason,/可灵/);
  const current=(await request(handle,'GET','/api/ad-resources')).body.batches[0];assert.deepEqual(current.items,batch.items);assert.equal(current.downloadedAt,batch.downloadedAt);
});
