import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {Readable} from 'node:stream';
import sharp from 'sharp';
import {createAdResourcesHandler,defaultAdLogoPlacement} from '../lib/ad-resources-server.mjs';
import {buildAdNanoLayoutPrompt} from '../lib/ad-nano-layout.mjs';

const nativeLogo={originalBounds:[1066,13,1260,107],sourceWidth:1280,sourceHeight:720};
test('landscape follows the PSD size while square and portrait keep their larger defaults',()=>{
  for(const [width,height] of [[1080,1920],[720,1280]]){
    const placement=defaultAdLogoPlacement(nativeLogo,{width,height,logo:'required'});
    assert.equal(placement.logoScale,.45);assert.equal(placement.logoX,.275);assert.equal(placement.logoY,.025);
    assert.equal(Math.round(placement.logoScale*width),width===1080?486:324);
  }
  for(const [width,height,scale] of [[1280,720,194/1280],[800,800,.34]]){
    const placement=defaultAdLogoPlacement(nativeLogo,{width,height,logo:'required'});
    assert.equal(placement.logoScale,scale);assert.equal(placement.logoY,13/720);
    assert.ok(Math.abs(placement.logoX+scale-1260/1280)<1e-12,'keep the original right margin instead of clipping a larger logo');
  }
  assert.equal(defaultAdLogoPlacement(null,{width:1280,height:720,logo:'required'}).logoScale,.18,'no source geometry uses the previous conservative fallback');
  assert.equal(defaultAdLogoPlacement(null,{width:800,height:800,logo:'required'}).logoScale,.34);
  assert.deepEqual(defaultAdLogoPlacement(null,{width:800,height:800,logo:'forbidden'}),{});
  assert.equal(defaultAdLogoPlacement({...nativeLogo,originalBounds:[24,20,600,150]},{width:1280,height:720,logo:'required'}).logoScale,.45,'a large original logo must not shrink');
});

test('portrait generation reserves a large brand area and requests semantic two-row headlines',()=>{
  const portrait=buildAdNanoLayoutPrompt({sourceName:'水果没有闪原图',targetWidth:1080,targetHeight:1920});
  assert.match(portrait,/9:16/);assert.match(portrait,/拆为两行/);assert.match(portrait,/画宽45%/);assert.match(portrait,/独立 Logo 由工作台后续在本地叠加/);assert.match(portrait,/保持字序、文字内容与原有字效/);
  const square=buildAdNanoLayoutPrompt({sourceName:'水果没有闪原图',targetWidth:800,targetHeight:800});assert.doesNotMatch(square,/拆为两行|画宽45%/);
});

const request=async(handler,method,pathname,body)=>{
  const req=Readable.from(body===undefined?[]:[Buffer.from(JSON.stringify(body))]);req.method=method;
  let status,result;const res={writeHead(code){status=code;},end(chunk){result=JSON.parse(String(chunk));}};
  await handler(req,res,new URL(pathname,'http://localhost'));return {status,body:result};
};
test('new portrait tasks render large logos and later automatic work preserves manual branding edits',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'ad-portrait-logo-')),storageDir=path.join(root,'storage');await fs.mkdir(storageDir);
  t.after(()=>fs.rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:30}));
  const specs=[{id:'ad-05',number:5,width:1080,height:1920,format:'JPG',logo:'required',maxBytes:null},{id:'ad-07',number:7,width:720,height:1280,format:'JPG',logo:'required',maxBytes:300*1024}];
  let nanoCalls=0;
  const handler=await createAdResourcesHandler({root,runtimeDir:root,storageDir,catalogProvider:async()=>({sourceSha256:'isolated-portrait-logo',specs}),nanoGenerate:async()=>{
    nanoCalls++;return sharp({create:{width:1080,height:1920,channels:3,background:'#233957'}}).png().toBuffer();
  }});
  const batch=(await request(handler,'POST','/api/ad-resources/batches',{project:'新任务竖版 Logo'})).body.batch;
  for(const [role,name,width,height,color] of [['visual','原图_纯图.png',1280,720,'#233957'],['logo','独立Logo.png',194,94,'#ef271e']]){
    const buffer=await sharp({create:{width,height,channels:4,background:color}}).png().toBuffer();
    assert.equal((await request(handler,'POST',`/api/ad-resources/batches/${batch.id}/assets`,{role,name,dataUrl:`data:image/png;base64,${buffer.toString('base64')}`})).status,201);
  }
  assert.equal((await request(handler,'POST',`/api/ad-resources/batches/${batch.id}/auto-generate`,{})).body.generated,2);
  let current=(await request(handler,'GET','/api/ad-resources')).body.batches[0];assert.equal(nanoCalls,1);
  for(const id of ['ad-05','ad-07'])assert.equal(current.items[id].draft.logoScale,.45);
  const candidate=await fs.readFile(path.join(storageDir,`ad-resources-${batch.id}`,'candidate',current.items['ad-05'].versions[0].storageName));
  const pixel=await sharp(candidate).extract({left:500,top:120,width:1,height:1}).raw().toBuffer();assert.ok(pixel[0]>pixel[2]*2,'the full-size brand area is actually rendered');
  const draft={...current.items['ad-05'].draft,logoScale:.38,logoX:.1,logoY:.045};
  await request(handler,'PUT',`/api/ad-resources/batches/${batch.id}/items/ad-05/draft`,draft);
  await request(handler,'POST',`/api/ad-resources/batches/${batch.id}/auto-generate`,{force:true});
  current=(await request(handler,'GET','/api/ad-resources')).body.batches[0];assert.equal(current.items['ad-05'].draft.logoScale,.38);assert.equal(current.items['ad-05'].draft.logoX,.1);assert.equal(current.items['ad-05'].draft.logoY,.045);assert.equal(nanoCalls,1);
});

test('landscape fallback returns to the earlier size and square stays larger; regeneration retains manual edits',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'ad-readable-logo-')),storageDir=path.join(root,'storage');await fs.mkdir(storageDir);
  t.after(()=>fs.rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:30}));
  const specs=[{id:'wide',number:1,width:1280,height:720,format:'JPG',logo:'required'},{id:'square',number:2,width:800,height:800,format:'JPG',logo:'required'}];
  const handler=await createAdResourcesHandler({root,runtimeDir:root,storageDir,catalogProvider:async()=>({sourceSha256:'readable-logo',specs}),nanoGenerate:async({targetWidth,targetHeight})=>sharp({create:{width:targetWidth,height:targetHeight,channels:3,background:'#556677'}}).png().toBuffer()});
  const batch=(await request(handler,'POST','/api/ad-resources/batches',{project:'大 Logo 默认值'})).body.batch;
  for(const [role,name,width,height]of[['visual','原图_纯图.png',1280,720],['logo','独立Logo.png',224,83]]){
    const buffer=await sharp({create:{width,height,channels:4,background:role==='logo'?'#ff2222':'#556677'}}).png().toBuffer();
    await request(handler,'POST',`/api/ad-resources/batches/${batch.id}/assets`,{role,name,dataUrl:`data:image/png;base64,${buffer.toString('base64')}`});
  }
  await request(handler,'POST',`/api/ad-resources/batches/${batch.id}/auto-generate`,{});
  let current=(await request(handler,'GET','/api/ad-resources')).body.batches[0];
  assert.equal(current.items.wide.draft.logoScale,.18);assert.equal(current.items.square.draft.logoScale,.34);
  const logo=await fs.readFile(path.join(storageDir,`ad-resources-${batch.id}`,'candidate',current.items.square.versions[0].storageName));
  const pixel=await sharp(logo).extract({left:650,top:80,width:1,height:1}).raw().toBuffer();assert.ok(pixel[0]>pixel[2]*2,'the square output actually contains the larger logo');
  await request(handler,'PUT',`/api/ad-resources/batches/${batch.id}/items/square/draft`,{...current.items.square.draft,logoScale:.23,logoX:.12});
  await request(handler,'PUT',`/api/ad-resources/batches/${batch.id}/items/wide/draft`,{...current.items.wide.draft,logoScale:.21,logoX:.1});
  await request(handler,'POST',`/api/ad-resources/batches/${batch.id}/auto-generate`,{force:true});
  current=(await request(handler,'GET','/api/ad-resources')).body.batches[0];assert.equal(current.items.square.draft.logoScale,.23);assert.equal(current.items.square.draft.logoX,.12);
  assert.equal(current.items.wide.draft.logoScale,.21);assert.equal(current.items.wide.draft.logoX,.1);
});

test('using a project logo still inherits the current source PSD horizontal size',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'ad-source-logo-')),storageDir=path.join(root,'storage'),folder=path.join(storageDir,'ad-resources-batch','asset');await fs.mkdir(folder,{recursive:true});
  t.after(()=>fs.rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:30}));
  const art=await sharp({create:{width:1280,height:720,channels:3,background:'#eeeeee'}}).png().toBuffer(),brand=await sharp({create:{width:224,height:83,channels:4,background:'#2244ff'}}).png().toBuffer();
  await fs.writeFile(path.join(folder,'art.png'),art);await fs.writeFile(path.join(folder,'brand.png'),brand);
  const assets=[{id:'clean',derivedFrom:'original',role:'visual',name:'源文件_纯图.png',width:1280,height:720,logoFree:true,hasEmbeddedLogo:false,sourceFormat:'PSD',url:'/storage/ad-resources-batch/asset/art.png'},{id:'source-brand',derivedFrom:'original',role:'logo',originalBounds:[24,20,248,103],sourceWidth:1280,sourceHeight:720,width:224,height:83,url:'/storage/ad-resources-batch/asset/brand.png'},{id:'project-brand',role:'logo',width:224,height:83,url:'/storage/ad-resources-batch/asset/brand.png'}];
  await fs.writeFile(path.join(root,'ad-resources-jobs.json'),JSON.stringify([{id:'batch',project:'使用项目Logo的PSD',sourceSha256:'source-placement',activeLogoAssetId:'project-brand',assets,items:{}}]));
  const spec={id:'wide',number:1,name:'横版',width:1280,height:720,format:'JPG',logo:'required'};
  const handler=await createAdResourcesHandler({root,runtimeDir:root,storageDir,catalogProvider:async()=>({sourceSha256:'source-placement',specs:[spec]}),nanoGenerate:()=>assert.fail('same-ratio source needs no generation')});
  assert.equal((await request(handler,'POST','/api/ad-resources/batches/batch/auto-generate',{})).body.generated,1);
  const current=(await request(handler,'GET','/api/ad-resources')).body.batches[0],draft=current.items.wide.draft;
  assert.equal(draft.logoAssetId,'project-brand');assert.equal(draft.logoScale,224/1280);assert.equal(draft.logoX,24/1280);
  const output=await fs.readFile(path.join(storageDir,'ad-resources-batch','candidate',current.items.wide.versions[0].storageName));
  const inside=await sharp(output).extract({left:240,top:40,width:1,height:1}).raw().toBuffer(),outside=await sharp(output).extract({left:300,top:40,width:1,height:1}).raw().toBuffer();
  assert.ok(inside[2]>inside[0]*2,'source-sized project logo is actually rendered');assert.ok(outside[0]>200&&outside[1]>200,'the horizontal logo is not enlarged to 28%');
});
