import {getRecycleBin} from '../lib/recycle-bin.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {existsSync} from 'node:fs';
// 样例 PSD 是本机文件，不在代码里；没有就跳过。
const samplePsd=fileURLToPath(new URL('../渠道资源位/华为资源位/34游戏中心-动态ICON.psd',import.meta.url));
import {Readable} from 'node:stream';
import sharp from 'sharp';
import {chooseAdMotion,createAdResourcesHandler,renderAdGif,validateAdCandidate} from '../lib/ad-resources-server.mjs';
import {reframeAdSafeLayout} from '../lib/ad-safe-layout.mjs';
import {renderDreamFlowerFrame} from '../lib/ad-dream-motion.mjs';

const catalog={sourceName:'投放资源位尺寸表.xlsx',sourceSha256:'test-sheet',sheet:'投放资源位',specs:[
  {id:'ad-01',number:1,row:3,platform:'TapTap',name:'taptap',width:1280,height:720,format:'JPG',maxBytes:null,limitRaw:'无',logo:'required',reference:'row-0003-01.jpeg'},
  {id:'ad-03',number:3,row:5,platform:'B站',name:'B站图片',width:640,height:400,format:'JPG',maxBytes:300*1024,limitRaw:'＜300KB',logo:'forbidden',reference:null},
  {id:'ad-04',number:4,row:6,platform:'B站',name:'B站GIF动图',width:640,height:400,format:'GIF',maxBytes:700*1024,limitRaw:'＜700KB',logo:'forbidden',reference:null}
]};
function request(handler,method,pathname,body){const req=Readable.from(body?[Buffer.from(JSON.stringify(body))]:[]);req.method=method;let status=0,result='';const res={writeHead(code){status=code},end(chunk){result=Buffer.isBuffer(chunk)?chunk.toString():String(chunk||'')}};return handler(req,res,new URL(pathname,'http://localhost')).then(()=>({status,body:JSON.parse(result)}))}
function requestZip(handler,pathname,method='GET'){const req=Readable.from([]);req.method=method;let status=0,result;const res={writeHead(code){status=code},end(chunk){result=chunk}};return handler(req,res,new URL(pathname,'http://localhost')).then(()=>({status,body:result}))}
function zipEntries(buffer){const entries=[];let offset=0;while(offset+30<=buffer.length&&buffer.readUInt32LE(offset)===0x04034b50){const bytes=buffer.readUInt16LE(offset+26),dataBytes=buffer.readUInt32LE(offset+18),name=buffer.subarray(offset+30,offset+30+bytes).toString('utf8');entries.push({name,data:buffer.subarray(offset+30+bytes,offset+30+bytes+dataBytes)});offset+=30+bytes+dataBytes}return entries}
const zipNames=buffer=>zipEntries(buffer).map(entry=>entry.name);
function stubKlingMotion(){
  const calls=[];
  return {calls,videoGenerate:async({sourceBuffer,receipt,onStatus})=>{
    calls.push({sourceBuffer,receipt});await onStatus({status:'submitted',jobId:`offline-kling-${calls.length}`});
    return {buffer:Buffer.from('isolated test video; never an external request'),jobId:`offline-kling-${calls.length}`,contentType:'video/mp4'};
  },videoToGif:async({spec})=>{
    const frames=await Promise.all(Array.from({length:10},(_,i)=>sharp({create:{width:spec.width,height:spec.height,channels:3,background:{r:140+i*10,g:70+i*6,b:20+i*3}}}).png().toBuffer()));
    return {buffer:await sharp(frames,{join:{animated:true}}).gif({delay:Array(10).fill(100),loop:0}).toBuffer(),motion:{offlineFixture:true}};
  }};
}
async function completedMotion(handle,id,specId='ad-04'){
  const end=Date.now()+15000;
  while(Date.now()<end){
    const result=await request(handle,'GET',`/api/ad-resources/batches/${id}/items/${specId}/motion-job`);
    if(result.body.motionJob?.status==='completed')return result.body;
    assert.ok(!['failed','cancelled','result_uncertain'].includes(result.body.motionJob?.status),JSON.stringify(result.body));
    await new Promise(resolve=>setTimeout(resolve,20));
  }
  assert.fail('isolated Kling job did not finish');
}

test('ad catalog contains only the ten current rows from 投放资源位',async()=>{
  const parsed=JSON.parse(await fs.readFile(new URL('../config/ad-resources-v1.json',import.meta.url),'utf8'));
  assert.equal(parsed.sheet,'投放资源位');
  assert.equal(parsed.specs.length,10);
  assert.equal(Object.hasOwn(parsed,'supplemental'),false);
  assert.ok(parsed.specs.every(spec=>spec.cautions.length===0));
  assert.deepEqual(parsed.specs.map(spec=>spec.safeInsetX),[0,0,40,0,0,0,0,0,0,0]);
  assert.deepEqual(parsed.specs.map(spec=>spec.logo),['required','forbidden','forbidden','required','required','forbidden','forbidden','required','required','required']);
  assert.deepEqual(parsed.specs.map(spec=>spec.outputRule.includes('lg')),[true,false,false,true,true,false,false,true,true,true]);
  assert.ok(parsed.specs.every(spec=>spec.format==='JPG'));
  assert.deepEqual(parsed.specs.slice(-3).map(s=>s.platform),['头条搜索','头条搜索','头条搜索']);
});

test('uploading a replacement logo updates every working size without duplicating history and leaves no-logo sizes alone',async()=>{
  const runtimeDir=await fs.mkdtemp(path.join(os.tmpdir(),'ad-logo-batch-test-')),storageDir=path.join(runtimeDir,'storage');await fs.mkdir(storageDir);
  const sheet={...catalog,specs:[
    {...catalog.specs[0],id:'ad-01'},
    {...catalog.specs[0],id:'ad-02',number:2,width:640,height:360},
    {...catalog.specs[0],id:'ad-03',number:3,logo:'forbidden'}
  ]};
  const handle=await createAdResourcesHandler({root:runtimeDir,runtimeDir,storageDir,catalogProvider:async()=>sheet});
  const batch=(await request(handle,'POST','/api/ad-resources/batches',{project:'Logo 批量同步'})).body.batch;
  const visual=await sharp({create:{width:1280,height:720,channels:3,background:'#eee0c0'}}).jpeg().toBuffer();
  await request(handle,'POST',`/api/ad-resources/batches/${batch.id}/assets`,{role:'visual',name:'纯图.jpg',dataUrl:`data:image/jpeg;base64,${visual.toString('base64')}`});
  const makeLogo=async color=>sharp({create:{width:40,height:20,channels:4,background:color}}).png().toBuffer();
  const first=await makeLogo('#dd2222');
  const initialLogo=await request(handle,'POST',`/api/ad-resources/batches/${batch.id}/assets`,{role:'logo',name:'旧Logo.png',dataUrl:`data:image/png;base64,${first.toString('base64')}`});
  const generated=await request(handle,'POST',`/api/ad-resources/batches/${batch.id}/auto-generate`,{});
  assert.equal(generated.body.generated,3);
  const second=await makeLogo('#2244dd');
  const replaced=await request(handle,'POST',`/api/ad-resources/batches/${batch.id}/assets`,{role:'logo',name:'新Logo.png',dataUrl:`data:image/png;base64,${second.toString('base64')}`});
  assert.deepEqual(replaced.body.logoUpdate.updated,['ad-01','ad-02']);
  const current=(await request(handle,'GET','/api/ad-resources')).body.batches[0];
  assert.equal(current.activeLogoAssetId,replaced.body.asset.id);
  for(const id of ['ad-01','ad-02']){
    assert.equal(current.items[id].draft.logoAssetId,replaced.body.asset.id);
    assert.equal(current.items[id].versions.length,1);
    assert.equal(current.items[id].draftDirty,true);
  }
  assert.equal(current.items['ad-03'].versions.length,1);
  assert.equal(current.items['ad-03'].draft.logoAssetId,'');
  const candidate=(await requestZip(handle,`/api/ad-resources/batches/${batch.id}/items/ad-01/preview`)).body;
  const pixel=await sharp(candidate).extract({left:1050,top:60,width:1,height:1}).removeAlpha().raw().toBuffer();
  assert.ok(pixel[2]>pixel[0]*2,'the refreshed candidate uses the new blue logo');
  const switched=await request(handle,'POST',`/api/ad-resources/batches/${batch.id}/apply-logo`,{logoAssetId:initialLogo.body.asset.id});
  assert.deepEqual(switched.body.updated,['ad-01','ad-02']);
  const switchedBatch=(await request(handle,'GET','/api/ad-resources')).body.batches[0];
  assert.equal(switchedBatch.items['ad-01'].versions.length,1);
  assert.equal(switchedBatch.items['ad-01'].draftDirty,false,'returning to the retained logo should be clean again');
  assert.equal(switchedBatch.items['ad-03'].versions.length,1);
});

test('ad batch recycle and restore preserve records; purge removes only unshared files',async()=>{
  const runtimeDir=await fs.mkdtemp(path.join(os.tmpdir(),'ad-delete-test-')),storageDir=path.join(runtimeDir,'storage');await fs.mkdir(storageDir);
  const handle=await createAdResourcesHandler({root:runtimeDir,runtimeDir,storageDir,catalogProvider:async()=>catalog});
  const first=(await request(handle,'POST','/api/ad-resources/batches',{project:'待删除任务'})).body.batch;
  const second=(await request(handle,'POST','/api/ad-resources/batches',{project:'保留任务'})).body.batch;
  const firstDir=path.join(storageDir,`ad-resources-${first.id}`),secondDir=path.join(storageDir,`ad-resources-${second.id}`);
  await fs.mkdir(firstDir);await fs.mkdir(secondDir);
  await fs.writeFile(path.join(firstDir,'marker.txt'),'delete');await fs.writeFile(path.join(secondDir,'marker.txt'),'keep');
  const removed=await request(handle,'DELETE',`/api/ad-resources/batches/${first.id}`);
  assert.equal(removed.status,200);assert.equal(removed.body.ok,true);
  assert.deepEqual((await request(handle,'GET','/api/ad-resources')).body.batches.map(batch=>batch.id),[second.id]);
  assert.equal(await fs.readFile(path.join(firstDir,'marker.txt'),'utf8'),'delete');
  const bin=await getRecycleBin({runtimeDir,storageDir});await bin.restore({ids:[removed.body.id]});assert.equal((await request(handle,'GET','/api/ad-resources')).body.batches.length,2);
  const again=await request(handle,'DELETE',`/api/ad-resources/batches/${first.id}`),ids=[again.body.id],plan=await bin.preview({ids});await bin.purge({ids,token:plan.token,requestId:'purge-ad-batch-1'});await assert.rejects(fs.stat(path.join(firstDir,'marker.txt')),{code:'ENOENT'});
  assert.equal(await fs.readFile(path.join(secondDir,'marker.txt'),'utf8'),'keep');
});

test('ad deliverables retain separate logo versions and validate exact output',async()=>{
  const runtimeDir=await fs.mkdtemp(path.join(os.tmpdir(),'ad-resources-test-')),storageDir=path.join(runtimeDir,'storage');await fs.mkdir(storageDir);
  const handle=await createAdResourcesHandler({root:runtimeDir,runtimeDir,storageDir,catalogProvider:async()=>catalog});
  const listing=await request(handle,'GET','/api/ad-resources');
  assert.equal(listing.body.catalog.specs.length,3);
  assert.equal(listing.body.catalog.specs[0].referenceUrl,'/ad-reference/row-0003-01.jpeg');
  const created=await request(handle,'POST','/api/ad-resources/batches',{project:'测试投放系列'});
  assert.equal(created.status,201);const id=created.body.batch.id;
  const image=await sharp({create:{width:1280,height:720,channels:3,background:'#5644aa'}}).jpeg({quality:70}).toBuffer();
  const uploaded=await request(handle,'POST',`/api/ad-resources/batches/${id}/assets`,{role:'visual',name:'KV.jpg',dataUrl:`data:image/jpeg;base64,${image.toString('base64')}`});
  assert.equal(uploaded.status,201);
  const draft=await request(handle,'PUT',`/api/ad-resources/batches/${id}/items/ad-01/draft`,{sourceAssetId:uploaded.body.asset.id,zoom:1.2,offsetX:.1});
  assert.equal(draft.body.draft.sourceAssetId,uploaded.body.asset.id);
  const version=await request(handle,'POST',`/api/ad-resources/batches/${id}/items/ad-01/versions`,{dataUrl:`data:image/jpeg;base64,${image.toString('base64')}`,logoChecked:true,contentChecked:true,safeAreaChecked:true});
  assert.equal(version.status,201);assert.equal(version.body.version.name,'测试投放系列_lg_1280x720.jpg');assert.equal(version.body.version.review.logoChecked,true);
  const reviewed=await request(handle,'PUT',`/api/ad-resources/batches/${id}/items/ad-01/versions/1/review`,{logoChecked:true,contentChecked:true,safeAreaChecked:false});
  assert.equal(reviewed.body.version.review.safeAreaChecked,false);
  await assert.rejects(()=>request(handle,'GET',`/api/ad-resources/batches/${id}/download`),/资源位没有候选稿/);
  const reloaded=await request(handle,'GET','/api/ad-resources');assert.equal(reloaded.body.batches[0].items['ad-01'].versions.length,1);
  await assert.rejects(()=>request(handle,'POST',`/api/ad-resources/batches/${id}/items/ad-03/versions`,{dataUrl:`data:image/jpeg;base64,${image.toString('base64')}`}),/尺寸应为 640×400/);
  const still=await sharp({create:{width:640,height:400,channels:3,background:'#222'}}).gif().toBuffer();
  await assert.rejects(()=>validateAdCandidate(catalog.specs[2],still),/至少需要 2 帧/);
});

test('a source already containing a Logo never receives a second overlay and cannot render into no-Logo sizes',async()=>{
  const runtimeDir=await fs.mkdtemp(path.join(os.tmpdir(),'ad-embedded-logo-test-')),storageDir=path.join(runtimeDir,'storage');await fs.mkdir(storageDir);
  try{
    const handle=await createAdResourcesHandler({root:runtimeDir,runtimeDir,storageDir,catalogProvider:async()=>catalog});
    const batch=(await request(handle,'POST','/api/ad-resources/batches',{project:'Logo 去重'})).body.batch;
    const background=await sharp({create:{width:1280,height:720,channels:3,background:'#777777'}}).composite([{input:Buffer.from('<svg width="36" height="22"><rect width="36" height="22" fill="#cc2222"/></svg>'),left:24,top:18}]).png().toBuffer();
    const source=await request(handle,'POST',`/api/ad-resources/batches/${batch.id}/assets`,{role:'visual',name:'KV_带Logo.png',dataUrl:`data:image/png;base64,${background.toString('base64')}`});
    const separateLogo=await sharp({create:{width:40,height:20,channels:4,background:'#2244dd'}}).png().toBuffer();
    const logo=await request(handle,'POST',`/api/ad-resources/batches/${batch.id}/assets`,{role:'logo',name:'独立Logo.png',dataUrl:`data:image/png;base64,${separateLogo.toString('base64')}`});
    assert.equal(source.body.asset.hasEmbeddedLogo,true);
    assert.equal(source.body.asset.logoFree,false);
    await request(handle,'PUT',`/api/ad-resources/batches/${batch.id}/items/ad-01/draft`,{sourceAssetId:source.body.asset.id,logoAssetId:logo.body.asset.id});
    const rendered=await request(handle,'POST',`/api/ad-resources/batches/${batch.id}/items/ad-01/render`,{});
    assert.equal(rendered.status,201);
    const output=await fs.readFile(path.join(storageDir,`ad-resources-${batch.id}`,'candidate',rendered.body.version.storageName));
    const bakedMark=await sharp(output).extract({left:30,top:24,width:1,height:1}).removeAlpha().raw().toBuffer();
    const wouldBeSecondMark=await sharp(output).extract({left:1190,top:680,width:1,height:1}).removeAlpha().raw().toBuffer();
    assert.ok(bakedMark[0]>bakedMark[2]*2,'the embedded red brand mark is preserved');
    assert.ok(Math.abs(wouldBeSecondMark[0]-wouldBeSecondMark[2])<15,'the independent blue Logo is not composited');
    const saved=(await request(handle,'GET','/api/ad-resources')).body.batches[0];
    assert.equal(saved.items['ad-01'].draft.logoAssetId,'');
    await request(handle,'PUT',`/api/ad-resources/batches/${batch.id}/items/ad-03/draft`,{sourceAssetId:source.body.asset.id});
    await assert.rejects(()=>request(handle,'POST',`/api/ad-resources/batches/${batch.id}/items/ad-03/render`,{}),/要求无 Logo/);
  }finally{await fs.rm(runtimeDir,{recursive:true,force:true})}
});

test('batch delivery refuses a candidate explicitly invalidated for a logo violation',async()=>{
  const runtimeDir=await fs.mkdtemp(path.join(os.tmpdir(),'ad-invalid-logo-test-')),storageDir=path.join(runtimeDir,'storage');await fs.mkdir(storageDir);
  try{
    const staticCatalog={...catalog,specs:catalog.specs.filter(spec=>spec.format!=='GIF')};
    const handle=await createAdResourcesHandler({root:runtimeDir,runtimeDir,storageDir,catalogProvider:async()=>staticCatalog});
    const batch=(await request(handle,'POST','/api/ad-resources/batches',{project:'不可交付候选'})).body.batch;
    for(const spec of staticCatalog.specs){
      const image=await sharp({create:{width:spec.width,height:spec.height,channels:3,background:'#888'}}).jpeg().toBuffer();
      await request(handle,'POST',`/api/ad-resources/batches/${batch.id}/items/${spec.id}/versions`,{dataUrl:`data:image/jpeg;base64,${image.toString('base64')}`});
    }
    const jobsFile=path.join(runtimeDir,'ad-resources-jobs.json'),saved=JSON.parse(await fs.readFile(jobsFile,'utf8'));
    saved[0].items['ad-03'].versions.at(-1).invalidatedReason='候选稿源图内含 Logo';
    await fs.writeFile(jobsFile,JSON.stringify(saved,null,2)+'\n');
    const reloaded=await createAdResourcesHandler({root:runtimeDir,runtimeDir,storageDir,catalogProvider:async()=>staticCatalog});
    await assert.rejects(()=>requestZip(reloaded,`/api/ad-resources/batches/${batch.id}/download`),/当前候选稿不可交付/);
  }finally{await fs.rm(runtimeDir,{recursive:true,force:true})}
});

test('GIF versions preserve the actual loop duration from unequal frame delays',async()=>{
  const runtimeDir=await fs.mkdtemp(path.join(os.tmpdir(),'ad-gif-duration-test-')),storageDir=path.join(runtimeDir,'storage');
  try{
    await fs.mkdir(storageDir);
    const handle=await createAdResourcesHandler({root:runtimeDir,runtimeDir,storageDir,catalogProvider:async()=>catalog});
    const batch=(await request(handle,'POST','/api/ad-resources/batches',{project:'真实动图时长'})).body.batch;
    const frames=await Promise.all(['#ff0000','#00ff00','#0000ff'].map(background=>sharp({create:{width:640,height:400,channels:3,background}}).png().toBuffer()));
    const gif=await sharp(frames,{join:{animated:true}}).gif({delay:[120,250,630],loop:0}).toBuffer();
    const check=await validateAdCandidate(catalog.specs[2],gif);
    assert.equal(check.frames,3);
    assert.equal(check.durationMs,1000,'the loop takes one second, rather than three assumed 100ms frames');
    const result=await request(handle,'POST',`/api/ad-resources/batches/${batch.id}/items/ad-04/versions`,{dataUrl:`data:image/gif;base64,${gif.toString('base64')}`});
    assert.equal(result.status,201);
    assert.equal(result.body.version.durationMs,1000);
    const saved=JSON.parse(await fs.readFile(path.join(runtimeDir,'ad-resources-jobs.json'),'utf8'));
    assert.equal(saved[0].items['ad-04'].versions[0].durationMs,1000);
    const jpg=await sharp(frames[0]).jpeg().toBuffer();
    assert.equal(Object.hasOwn(await validateAdCandidate(catalog.specs[1],jpg),'durationMs'),false,'still-image metadata stays unchanged');
  }finally{
    await fs.rm(runtimeDir,{recursive:true,force:true});
  }
});

test('batch download confirms every latest candidate only after the full set is available',async()=>{
  const runtimeDir=await fs.mkdtemp(path.join(os.tmpdir(),'ad-zip-test-')),storageDir=path.join(runtimeDir,'storage');await fs.mkdir(storageDir);
  const one={...catalog,specs:[catalog.specs[0]]};
  const handle=await createAdResourcesHandler({root:runtimeDir,runtimeDir,storageDir,catalogProvider:async()=>one});
  const created=await request(handle,'POST','/api/ad-resources/batches',{project:'成套测试'}),id=created.body.batch.id;
  await assert.rejects(()=>requestZip(handle,`/api/ad-resources/batches/${id}/download`,'POST'),/没有候选稿/);
  const image=await sharp({create:{width:1280,height:720,channels:3,background:'#eee'}}).jpeg().toBuffer();
  const candidate=await request(handle,'POST',`/api/ad-resources/batches/${id}/items/ad-01/versions`,{dataUrl:`data:image/jpeg;base64,${image.toString('base64')}`});
  assert.equal(candidate.body.version.review.logoChecked,false);
  const draftZip=await requestZip(handle,`/api/ad-resources/batches/${id}/download`);
  assert.equal(draftZip.status,200);
  assert.ok(zipNames(draftZip.body).includes('成套测试_lg_1280x720.jpg'));
  assert.ok(draftZip.body.includes(Buffer.from('"confirmed": false')));
  const zip=await requestZip(handle,`/api/ad-resources/batches/${id}/download`,'POST');
  assert.equal(zip.status,200);assert.equal(zip.body.subarray(0,4).toString('latin1'),'PK\x03\x04');
  assert.ok(zip.body.includes(Buffer.from('"confirmed": true')));
  const after=(await request(handle,'GET','/api/ad-resources')).body.batches[0];
  assert.equal(after.items['ad-01'].versions[0].review.logoChecked,true);
  assert.equal(after.items['ad-01'].versions[0].review.contentChecked,true);
  assert.equal(after.items['ad-01'].versions[0].review.safeAreaChecked,true);
  assert.ok(after.downloadedAt);
  assert.equal(after.deliveredVersions['ad-01'],1);
  await request(handle,'POST',`/api/ad-resources/batches/${id}/items/ad-01/versions`,{dataUrl:`data:image/jpeg;base64,${image.toString('base64')}`});
  assert.equal((await request(handle,'GET','/api/ad-resources')).body.batches[0].items['ad-01'].versions.at(-1).review.logoChecked,false);
});

test('existing candidates keep their stored file while downloads use the new filename order',async()=>{
  const runtimeDir=await fs.mkdtemp(path.join(os.tmpdir(),'ad-rename-test-')),storageDir=path.join(runtimeDir,'storage');await fs.mkdir(storageDir);
  const id='legacy-batch',oldName='旧任务_1280x720_lg.jpg',newName='旧任务_lg_1280x720.jpg';
  const image=await sharp({create:{width:1280,height:720,channels:3,background:'#aabbcc'}}).jpeg().toBuffer();
  const candidateDir=path.join(storageDir,`ad-resources-${id}`,'candidate');await fs.mkdir(candidateDir,{recursive:true});await fs.writeFile(path.join(candidateDir,oldName),image);
  await fs.writeFile(path.join(runtimeDir,'ad-resources-jobs.json'),JSON.stringify([{id,project:'旧任务',sourceSha256:catalog.sourceSha256,assets:[],items:{'ad-01':{versions:[{number:1,name:oldName,review:{}}]}}}]));
  const handle=await createAdResourcesHandler({root:runtimeDir,runtimeDir,storageDir,catalogProvider:async()=>({...catalog,specs:[catalog.specs[0]]})});
  const version=(await request(handle,'GET','/api/ad-resources')).body.batches[0].items['ad-01'].versions[0];
  assert.equal(version.name,newName);assert.equal(version.storageName,oldName);
  const zip=await requestZip(handle,`/api/ad-resources/batches/${id}/download`);
  assert.deepEqual(zipEntries(zip.body).find(entry=>entry.name===newName).data,image);
  assert.equal(JSON.parse(await fs.readFile(path.join(runtimeDir,'ad-resources-jobs.json'),'utf8'))[0].items['ad-01'].versions[0].storageName,oldName);
});

test('static source uses the configured Kling pipeline for a real multi-frame GIF within the delivery limit',async()=>{
  const runtimeDir=await fs.mkdtemp(path.join(os.tmpdir(),'ad-gif-test-')),storageDir=path.join(runtimeDir,'storage');await fs.mkdir(storageDir);
  const kling=stubKlingMotion();
  const handle=await createAdResourcesHandler({root:runtimeDir,runtimeDir,storageDir,catalogProvider:async()=>catalog,...kling});
  const created=await request(handle,'POST','/api/ad-resources/batches',{project:'动图测试'}),id=created.body.batch.id;
  const visual=await sharp({create:{width:1280,height:720,channels:3,background:'#d2bce9'}}).jpeg().toBuffer();
  const uploaded=await request(handle,'POST',`/api/ad-resources/batches/${id}/assets`,{role:'visual',name:'纯图.jpg',dataUrl:`data:image/jpeg;base64,${visual.toString('base64')}`});
  const assetId=uploaded.body.asset.id;
  await request(handle,'PUT',`/api/ad-resources/batches/${id}/items/ad-04/draft`,{sourceAssetId:assetId,zoom:1});
  const accepted=await request(handle,'POST',`/api/ad-resources/batches/${id}/items/ad-04/generate-gif`,{draft:{sourceAssetId:assetId,zoom:1}});
  assert.equal(accepted.status,202);assert.equal(accepted.body.motionJob.model,'kling_v3');
  const generated={body:await completedMotion(handle,id)};
  assert.equal(kling.calls.length,1);
  assert.equal(generated.body.version.format,'GIF');
  assert.equal(generated.body.version.name,'动图测试_动_640x400.gif');
  assert.equal(generated.body.version.width,640);
  assert.equal(generated.body.version.height,400);
  assert.ok(generated.body.version.frames>=2);
  assert.ok(generated.body.version.bytes<catalog.specs[2].maxBytes);
  const output=await fs.readFile(path.join(storageDir,`ad-resources-${id}`,'candidate',generated.body.version.storageName));
  const metadata=await sharp(output,{animated:true}).metadata();
  assert.equal(metadata.pageHeight,400);
  assert.ok(metadata.pages>=2);
  assert.equal(metadata.pages,10);
  assert.deepEqual(metadata.delay,Array(10).fill(100));
  assert.equal(metadata.delay.reduce((sum,delay)=>sum+delay,0),1000);
  const first=await sharp(output,{page:0}).raw().toBuffer();
  const middle=await sharp(output,{page:Math.floor(metadata.pages/2)}).raw().toBuffer();
  assert.notDeepEqual(first,middle);
});

test('GIF motion follows the source scene and material theme',async()=>{
  const water=await sharp(Buffer.from('<svg width="640" height="400"><rect width="640" height="400" fill="#cdeabb"/><rect y="210" width="640" height="190" fill="#75cbd5"/></svg>')).png().toBuffer();
  const warm=await sharp({create:{width:640,height:400,channels:3,background:'#dc7b32'}}).png().toBuffer();
  assert.equal((await chooseAdMotion(water,'桃园喝茶')).profile,'tea-water');
  assert.equal((await chooseAdMotion(warm,'夏日活动')).profile,'warm');
  assert.equal((await chooseAdMotion(warm,'派饭原图')).profile,'game-rewards');
  assert.equal((await chooseAdMotion(warm,'葱花饼')).profile,'food');
  const dream=await sharp({create:{width:640,height:400,channels:3,background:'#ba89d5'}}).png().toBuffer();
  assert.equal((await chooseAdMotion(dream,'送花')).profile,'dream-flowers');
});

test('dream flower motion moves the painted right side while keeping the character area still',async()=>{
  const art=await sharp(Buffer.from('<svg width="640" height="400"><rect width="640" height="400" fill="#ba89d5"/><rect x="320" y="190" width="320" height="210" fill="#8063bc"/><path d="M320 280 Q450 200 640 300" fill="none" stroke="#ffe6f8" stroke-width="18"/></svg>')).png().toBuffer();
  const first=await sharp(await renderDreamFlowerFrame(art,640,400,0,8)).removeAlpha().raw().toBuffer();
  const later=await sharp(await renderDreamFlowerFrame(art,640,400,2,8)).removeAlpha().raw().toBuffer();
  const delta=(x,y)=>{const i=(y*640+x)*3;return Math.abs(first[i]-later[i])+Math.abs(first[i+1]-later[i+1])+Math.abs(first[i+2]-later[i+2])};
  assert.equal(delta(170,200),0,'the portrait must not move');
  let changed=0;for(let y=210;y<390;y++)for(let x=330;x<630;x++)if(delta(x,y)>20)changed++;
  assert.ok(changed>400,`the silk and butterflies need perceptible motion, changed ${changed} pixels`);
});

test('uploaded motion reference remains the source when an ad GIF is rendered again',async()=>{
  const runtimeDir=await fs.mkdtemp(path.join(os.tmpdir(),'ad-motion-ref-test-')),storageDir=path.join(runtimeDir,'storage');await fs.mkdir(storageDir);
  const handle=await createAdResourcesHandler({root:runtimeDir,runtimeDir,storageDir,catalogProvider:async()=>catalog});
  const batch=(await request(handle,'POST','/api/ad-resources/batches',{project:'送花'})).body.batch;
  const source=await sharp({create:{width:640,height:400,channels:3,background:'#ba89d5'}}).png().toBuffer();
  const uploaded=(await request(handle,'POST',`/api/ad-resources/batches/${batch.id}/assets`,{role:'visual',name:'送花_纯图.png',dataUrl:`data:image/png;base64,${source.toString('base64')}`})).body.asset;
  await request(handle,'PUT',`/api/ad-resources/batches/${batch.id}/items/ad-04/draft`,{sourceAssetId:uploaded.id,zoom:1,offsetX:0,offsetY:0});
  const gif=await renderAdGif(source,catalog.specs[2],{themeHint:'送花'});
  const endpoint=`/api/ad-resources/batches/${batch.id}/items/ad-04`;
  const reference=await request(handle,'POST',`${endpoint}/versions`,{dataUrl:`data:image/gif;base64,${gif.toString('base64')}`,motionReference:true});
  assert.equal(reference.status,201);
  const rerendered=await request(handle,'POST',`${endpoint}/render`,{});
  assert.equal(rerendered.body.version.bytes,gif.length,'unchanged draft must retain the reference motion');
  const saved=await fs.readFile(path.join(storageDir,`ad-resources-${batch.id}`,'candidate',rerendered.body.version.storageName));
  assert.deepEqual(saved,gif);
  await request(handle,'PUT',`${endpoint}/draft`,{sourceAssetId:uploaded.id,zoom:1.1,offsetX:0,offsetY:0});
  const adjusted=await request(handle,'POST',`${endpoint}/render`,{});
  assert.equal(adjusted.status,201);
  assert.equal(adjusted.body.version.frames,(await sharp(gif,{animated:true}).metadata()).pages);
  assert.notEqual(adjusted.body.version.bytes,gif.length);
});

test('B站保护区适配保留等比原画，使用真实背景延展并拒绝空白或复制补边',async()=>{
  const source=await sharp(Buffer.from('<svg width="1280" height="720"><rect width="1280" height="720" fill="#a87945"/><rect width="640" height="30" fill="#f9d79b"/><rect x="640" width="640" height="30" fill="#a1c1d8"/><rect y="690" width="640" height="30" fill="#401010"/><rect x="640" y="690" width="640" height="30" fill="#103040"/><rect x="120" y="220" width="50" height="50" fill="red"/><rect x="1110" y="220" width="50" height="50" fill="blue"/></svg>')).png().toBuffer();
  const spec={width:640,height:400,safeInsetX:40};
  const generated=await sharp(Buffer.from('<svg width="640" height="400"><defs><linearGradient id="ground" x2="0" y2="1"><stop stop-color="#bb9850"/><stop offset="1" stop-color="#163253"/></linearGradient></defs><rect width="640" height="400" fill="url(#ground)"/><path d="M0 2L640 7M0 8L640 17M0 381L640 386M0 390L640 399" stroke="#7a6743" stroke-width="2"/></svg>')).png().toBuffer();
  let calls=0;
  const image=await reframeAdSafeLayout(source,spec,{generate:async input=>{calls++;assert.equal(input.layoutMode,'background-extension');assert.deepEqual(input.sourceRect,{x:0,y:.05,width:1,height:.9});return generated}});
  assert.equal(calls,1);
  const {data,info}=await sharp(image).raw().toBuffer({resolveWithObject:true});
  assert.equal(info.width,640);assert.equal(info.height,400);
  const pixel=(x,y)=>[...data.subarray((y*info.width+x)*info.channels,(y*info.width+x)*info.channels+3)];
  assert.ok(pixel(70,140)[0]>200,'左侧红色内容应位于保护区内');
  assert.ok(pixel(565,140)[2]>200,'右侧蓝色内容应位于保护区内');
  const center=await sharp(image).extract({left:0,top:20,width:640,height:360}).removeAlpha().raw().toBuffer();
  assert.deepEqual(center,await sharp(source).resize(640,360).removeAlpha().raw().toBuffer(),'整张原图应等比缩小、完整且逐像素保留');
  assert.notDeepEqual(pixel(10,0),pixel(10,10),'顶部应有新的景物变化，不能把边缘像素拉成条纹');
  assert.notDeepEqual(pixel(10,399),pixel(10,389),'底部应有新的景物变化，不能把边缘像素拉成条纹');
  await assert.rejects(()=>reframeAdSafeLayout(source,spec),/需要自然扩展背景/);
  const blank=await sharp({create:{width:640,height:400,channels:3,background:'#e6e6e6'}}).png().toBuffer();
  await assert.rejects(()=>reframeAdSafeLayout(source,spec,{generatedBuffer:blank}),/浅灰画布/);
});

test('game reward GIF has visible local frame changes while retaining the scene',async()=>{
  const source=await sharp({create:{width:1280,height:720,channels:3,background:'#e7d6b1'}}).png().toBuffer();
  const gif=await renderAdGif(source,catalog.specs[2],{themeHint:'派饭原图'});
  const meta=await sharp(gif,{animated:true}).metadata();
  assert.ok(meta.pages>=8);
  assert.ok(gif.length<catalog.specs[2].maxBytes);
  const first=await sharp(gif,{page:0}).removeAlpha().raw().toBuffer();
  const later=await sharp(gif,{page:6}).removeAlpha().raw().toBuffer();
  let changed=0;
  for(let pixel=0;pixel<first.length;pixel+=3)
    if(Math.abs(first[pixel]-later[pixel])+Math.abs(first[pixel+1]-later[pixel+1])+Math.abs(first[pixel+2]-later[pixel+2])>30)changed++;
  assert.ok(changed>1500,`only ${changed} pixels changed between frames`);
});

test('menu GIF visibly animates the tea area while keeping the menu body still',async()=>{
  const source=await sharp({create:{width:640,height:400,channels:3,background:'#e7d6b1'}}).png().toBuffer();
  const gif=await renderAdGif(source,catalog.specs[2],{themeHint:'葱花饼'});
  const first=await sharp(gif,{page:0}).removeAlpha().raw().toBuffer();
  const later=await sharp(gif,{page:6}).removeAlpha().raw().toBuffer();
  let changed=0;
  for(let pixel=0;pixel<first.length;pixel+=3)
    if(Math.abs(first[pixel]-later[pixel])+Math.abs(first[pixel+1]-later[pixel+1])+Math.abs(first[pixel+2]-later[pixel+2])>50)changed++;
  assert.ok(changed>1000,`menu motion changed only ${changed} pixels`);
  const center=(200*640+320)*3;
  assert.deepEqual([...first.subarray(center,center+3)],[...later.subarray(center,center+3)]);
});

test('automatic GIF presets have perceptible frame changes',async()=>{
  for(const [color,hint] of [['#dc7b32','夏日活动'],['#1f2230','夜景'],['#d7efc9','春日风景']]){
    const source=await sharp({create:{width:640,height:400,channels:3,background:color}}).png().toBuffer();
    const gif=await renderAdGif(source,catalog.specs[2],{themeHint:hint});
    const first=await sharp(gif,{page:0}).removeAlpha().raw().toBuffer();
    const later=await sharp(gif,{page:6}).removeAlpha().raw().toBuffer();
    let changed=0;
    for(let pixel=0;pixel<first.length;pixel+=3)
      if(Math.abs(first[pixel]-later[pixel])+Math.abs(first[pixel+1]-later[pixel+1])+Math.abs(first[pixel+2]-later[pixel+2])>50)changed++;
    assert.ok(changed>500,`${hint} changed only ${changed} pixels`);
  }
});

test('the current catalog automatically produces ten JPGs without an obsolete GIF and supports later adjustments',async()=>{
  const fullCatalog=JSON.parse(await fs.readFile(new URL('../config/ad-resources-v1.json',import.meta.url),'utf8'));
  const runtimeDir=await fs.mkdtemp(path.join(os.tmpdir(),'ad-auto-test-')),storageDir=path.join(runtimeDir,'storage');await fs.mkdir(storageDir);
  const nanoCalls=[];
  const kling=stubKlingMotion();
  const handle=await createAdResourcesHandler({root:runtimeDir,runtimeDir,storageDir,catalogProvider:async()=>fullCatalog,...kling,nanoGenerate:async({sourceBuffer,targetWidth,targetHeight,layoutMode})=>{nanoCalls.push(`${targetWidth}x${targetHeight}`);if(layoutMode==='background-extension')return sharp({create:{width:targetWidth,height:targetHeight,channels:3,background:'#ddba99'}}).png().toBuffer();return sharp(sourceBuffer).resize(targetWidth,targetHeight,{fit:'contain',background:'#e6e6e6'}).png().toBuffer()}});
  const created=await request(handle,'POST','/api/ad-resources/batches',{project:'自动适配'}),id=created.body.batch.id;
  const source=await sharp({create:{width:1280,height:720,channels:3,background:'#f8dbd3'}}).jpeg({quality:85}).toBuffer();
  const uploaded=await request(handle,'POST',`/api/ad-resources/batches/${id}/assets`,{role:'visual',name:'设计师主图.jpg',dataUrl:`data:image/jpeg;base64,${source.toString('base64')}`});
  assert.equal(uploaded.status,201);
  const made=await request(handle,'POST',`/api/ad-resources/batches/${id}/auto-generate`,{});
  assert.equal(made.status,200);assert.equal(made.body.generated,10,JSON.stringify(made.body.errors));assert.deepEqual(made.body.errors,[]);
  assert.equal(made.body.pending.length,0);assert.equal(kling.calls.length,0);
  assert.deepEqual(nanoCalls,['640x400','1080x1920','800x800']);
  const batch=(await request(handle,'GET','/api/ad-resources')).body.batches[0];
  for(const spec of fullCatalog.specs){const item=batch.items[spec.id];assert.equal(item.versions.length,1);assert.equal(item.versions[0].width,spec.width);assert.equal(item.versions[0].height,spec.height);assert.equal(item.versions[0].review.contentChecked,false)}
  assert.equal(batch.items['ad-02'].versions[0].name,'自动适配_1280x720.jpg');
  assert.equal(batch.items['ad-03'].versions[0].name,'自动适配_640x400.jpg');
  assert.equal(batch.items['ad-04'],undefined);
  const allZip=await requestZip(handle,`/api/ad-resources/batches/${id}/download`);
  assert.equal(allZip.status,200);
  const names=zipNames(allZip.body);assert.equal(names.length,9);assert.equal(new Set(names).size,9);
  assert.ok(names.every(name=>!name.includes('/')));
  assert.equal(names.filter(name=>name==='自动适配_lg_1280x720.jpg').length,1);
  const replacement=await fs.readFile(path.join(storageDir,`ad-resources-${id}`,'candidate',batch.items['ad-09'].versions[0].storageName));
  assert.deepEqual(zipEntries(allZip.body).find(entry=>entry.name==='自动适配_lg_1280x720.jpg').data,replacement);
  for(const spec of fullCatalog.specs)assert.ok(names.includes(batch.items[spec.id].versions[0].name));
  const draft={...batch.items['ad-03'].draft,offsetX:.2};
  await request(handle,'PUT',`/api/ad-resources/batches/${id}/items/ad-03/draft`,draft);
  const adjusted=await request(handle,'POST',`/api/ad-resources/batches/${id}/items/ad-03/render`,{});
  assert.equal(adjusted.body.version.number,2);
  assert.equal(adjusted.body.version.review.contentChecked,false);
  const afterAdjust=(await request(handle,'GET','/api/ad-resources')).body.batches[0];
  for(const specId of ['ad-03']){
    const layout=afterAdjust.assets.find(asset=>asset.id===afterAdjust.items[specId].draft.sourceAssetId);
    assert.ok(layout.safeSourceAssetId,`${specId} should use a protected-area layout`);
    assert.ok(!afterAdjust.assets.find(asset=>asset.id===layout.safeSourceAssetId)?.safeSourceAssetId,`${specId} must not reframe an existing layout`);
  }
  const remade=await request(handle,'POST',`/api/ad-resources/batches/${id}/auto-generate`,{force:true});
  assert.equal(remade.body.generated,10,JSON.stringify(remade.body.errors));
  assert.equal(kling.calls.length,0,'a JPG-only catalog must never invoke a video model');
  assert.deepEqual(nanoCalls,['640x400','1080x1920','800x800']);
});

test('PSD source is flattened to a preview image before automatic adaptation',{skip:existsSync(samplePsd)?false:'本机没有样例 PSD：渠道资源位/华为资源位/34游戏中心-动态ICON.psd'},async()=>{
  const root=fileURLToPath(new URL('../',import.meta.url));
  const runtimeDir=await fs.mkdtemp(path.join(os.tmpdir(),'ad-psd-test-')),storageDir=path.join(runtimeDir,'storage');await fs.mkdir(storageDir);
  const handle=await createAdResourcesHandler({root,runtimeDir,storageDir,catalogProvider:async()=>catalog});
  const created=await request(handle,'POST','/api/ad-resources/batches',{project:'PSD导入'}),id=created.body.batch.id;
  const psd=await fs.readFile(path.join(root,'渠道资源位','华为资源位','34游戏中心-动态ICON.psd'));
  const result=await request(handle,'POST',`/api/ad-resources/batches/${id}/assets`,{role:'visual',name:'设计源稿.psd',dataUrl:`data:application/x-photoshop;base64,${psd.toString('base64')}`});
  assert.equal(result.status,201);assert.equal(result.body.asset.sourceFormat,'PSD');
  assert.ok(result.body.asset.width>0&&result.body.asset.height>0);
  const image=await fs.readFile(path.join(storageDir,`ad-resources-${id}`,'asset',result.body.asset.url.split('/').at(-1)));
  assert.equal((await sharp(image).metadata()).format,'png');
});
