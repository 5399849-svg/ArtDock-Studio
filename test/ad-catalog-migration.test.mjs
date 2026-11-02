import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {Readable} from 'node:stream';
import sharp from 'sharp';
import {migrateAdBatchesToCatalog} from '../lib/ad-catalog-migration.mjs';
import {createAdResourcesHandler,renderAdJpg} from '../lib/ad-resources-server.mjs';
import {safeLayoutMethod} from '../lib/ad-safe-layout.mjs';

const oldPortrait={id:'ad-07',number:7,name:'广点通',platform:'广点通',width:720,height:1280,format:'JPG',logo:'required',maxBytes:null,safeInsetX:0,requirements:'有logo'};
const oldGif={id:'ad-04',number:4,name:'B站GIF动图',platform:'B站',width:640,height:400,format:'GIF',logo:'forbidden',maxBytes:700*1024,safeInsetX:40,requirements:'无logo'};
const previous={sourceName:'old.xlsx',sourceSha256:'old-eight',sheet:'投放资源位',specs:[oldGif,oldPortrait]};
const next={sourceName:'投放资源位尺寸表.xlsx',sourceSha256:'new-ten',sheet:'投放资源位',previousCatalogs:[previous],specs:[{...oldPortrait,number:6,logo:'forbidden',requirements:'无logo'},{...oldPortrait,id:'ad-11',number:10,name:'头条搜索',platform:'头条搜索'}]};

test('catalog migration preserves approved historical GIFs and marks changed-logo versions for replacement',()=>{
  const gif={draft:{},versions:[{number:4,review:{contentChecked:true},url:'/old-approved.gif'}]};
  const batch={id:'batch',sourceSha256:previous.sourceSha256,activeLogoAssetId:'logo',items:{'ad-04':gif,'ad-07':{draft:{sourceAssetId:'art',logoAssetId:'logo',zoom:1.2},versions:[{number:2,name:'old_lg.jpg',review:{logoChecked:true,contentChecked:true}}]}}};
  const oldGifBytes=JSON.stringify(gif),report=migrateAdBatchesToCatalog([batch],next);
  assert.equal(report.length,1);assert.equal(batch.sourceSha256,next.sourceSha256);
  assert.equal(JSON.stringify(batch.items['ad-04']),oldGifBytes);
  assert.equal(batch.retiredSpecs[0].id,'ad-04');
  assert.equal(batch.items['ad-07'].draft.logoAssetId,'');
  assert.match(batch.items['ad-07'].versions[0].invalidatedReason,/现要求无 Logo/);
  assert.equal(batch.items['ad-07'].versions[0].review.contentChecked,true);
  assert.equal(batch.items['ad-07'].versions[0].specSnapshot.logo,'required');
  assert.equal(batch.items['ad-11'].versions.length,0);
  assert.equal(batch.items['ad-11'].draft.logoAssetId,'logo');assert.equal(batch.items['ad-11'].draft.zoom,1.2);
  assert.deepEqual(migrateAdBatchesToCatalog([batch],next),[]);
  const unknown={id:'unknown',sourceSha256:'unrecognised',items:{}};
  assert.deepEqual(migrateAdBatchesToCatalog([unknown],next),[]);assert.equal(unknown.sourceSha256,'unrecognised');
});

async function request(handle,method,url,body){
  const req=Readable.from(body?[Buffer.from(JSON.stringify(body))]:[]);req.method=method;
  let status,result;const res={writeHead(code){status=code},end(value){result=value}};
  await handle(req,res,new URL(url,'http://localhost'));
  return {status,body:Buffer.isBuffer(result)&&result[0]===0x50?result:JSON.parse(String(result))};
}

test('a real migrated task blocks outdated delivery and regenerates only new or invalid JPGs without calling any AI',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'ad-catalog-migrate-')),storageDir=path.join(root,'storage'),folder=path.join(storageDir,'ad-resources-batch');
  t.after(()=>fs.rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:30}));
  await fs.mkdir(path.join(folder,'asset'),{recursive:true});await fs.mkdir(path.join(folder,'candidate'));
  const art=await sharp({create:{width:720,height:1280,channels:3,background:'#6490b0'}}).png().toBuffer();
  const logo=await sharp({create:{width:100,height:40,channels:4,background:'#e02030'}}).png().toBuffer();
  const oldJpg=await sharp(art).composite([{input:logo,left:20,top:20}]).jpeg().toBuffer();
  await fs.writeFile(path.join(folder,'asset','art.png'),art);await fs.writeFile(path.join(folder,'asset','logo.png'),logo);await fs.writeFile(path.join(folder,'candidate','old.jpg'),oldJpg);
  const batch={id:'batch',project:'规范更新测试',sourceSha256:previous.sourceSha256,activeLogoAssetId:'logo',assets:[{id:'art',role:'visual',name:'纯图.png',width:720,height:1280,url:'/storage/ad-resources-batch/asset/art.png',sourceFormat:'PNG',logoFree:true},{id:'logo',role:'logo',name:'Logo.png',width:100,height:40,url:'/storage/ad-resources-batch/asset/logo.png'}],items:{'ad-07':{draft:{sourceAssetId:'art',logoAssetId:'logo',zoom:1,offsetX:0,offsetY:0},versions:[{number:1,name:'test_lg_720x1280.jpg',storageName:'old.jpg',width:720,height:1280,format:'JPG',frames:1,bytes:oldJpg.length,review:{contentChecked:true}}]},'ad-04':{draft:{},versions:[{number:4,url:'/old-approved.gif',review:{contentChecked:true}}]}}};
  await fs.writeFile(path.join(root,'ad-resources-jobs.json'),JSON.stringify([batch]));
  const noAi=async()=>{throw Error('No paid AI operation is authorised by catalog migration')};
  const handle=await createAdResourcesHandler({root,runtimeDir:root,storageDir,catalogProvider:async()=>next,nanoGenerate:noAi,videoGenerate:noAi,videoToGif:noAi});
  await assert.rejects(()=>request(handle,'GET','/api/ad-resources/batches/batch/download'),/现要求无 Logo/);
  const made=await request(handle,'POST','/api/ad-resources/batches/batch/auto-generate',{});
  assert.equal(made.body.generated,2);assert.deepEqual(made.body.errors,[]);
  const state=(await request(handle,'GET','/api/ad-resources')).body.batches[0];
  assert.equal(state.items['ad-07'].versions.length,2);assert.equal(state.items['ad-07'].versions.at(-1).invalidatedReason,undefined);
  assert.equal(state.items['ad-11'].versions.length,1);assert.equal(state.items['ad-04'].versions[0].number,4);
  assert.deepEqual(await fs.readFile(path.join(folder,'candidate','old.jpg')),oldJpg);
  const output=await request(handle,'GET','/api/ad-resources/batches/batch/download');assert.equal(output.status,200);
});

test('refreshing a no-logo candidate preserves the existing crop without AI and rejects stale bulk writes',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'ad-no-logo-refresh-')),storageDir=path.join(root,'storage'),folder=path.join(storageDir,'ad-resources-batch');
  t.after(()=>fs.rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:30}));
  await fs.mkdir(path.join(folder,'asset'),{recursive:true});await fs.mkdir(path.join(folder,'candidate'));
  const spec={...oldPortrait,id:'square',width:800,height:800,logo:'forbidden',maxBytes:300*1024};
  const sheet={sourceSha256:'current',specs:[spec]};
  const art=await sharp({create:{width:1920,height:1080,channels:3,background:'#446688'}}).png().toBuffer();
  const logo=await sharp({create:{width:100,height:40,channels:4,background:'#ff1111'}}).png().toBuffer();
  const draft={sourceAssetId:'art',logoAssetId:'logo',zoom:1.27,offsetX:.12,offsetY:-.18,logoX:.08,logoY:.06,logoScale:.3};
  const old=await renderAdJpg(art,spec,draft,logo);
  await fs.writeFile(path.join(folder,'asset','art.png'),art);await fs.writeFile(path.join(folder,'asset','logo.png'),logo);await fs.writeFile(path.join(folder,'candidate','old.jpg'),old);
  const version={number:1,name:'old_lg.jpg',storageName:'old.jpg',invalidatedReason:'现要求无 Logo',review:{contentChecked:true}};
  const batch={id:'batch',project:'无 Logo 批量更新',sourceSha256:'current',activeLogoAssetId:'logo',assets:[{id:'art',role:'visual',name:'纯图.png',width:1920,height:1080,url:'/storage/ad-resources-batch/asset/art.png',logoFree:true},{id:'logo',role:'logo',name:'Logo.png',width:100,height:40,url:'/storage/ad-resources-batch/asset/logo.png'}],items:{square:{draft,versions:[version],autoWarning:'现要求无 Logo',autoError:'old error'}}};
  await fs.writeFile(path.join(root,'ad-resources-jobs.json'),JSON.stringify([batch]));
  const noAi=async()=>{assert.fail('Refreshing an existing crop must not run any image or video model')};
  const handle=await createAdResourcesHandler({root,runtimeDir:root,storageDir,catalogProvider:async()=>sheet,nanoGenerate:noAi,videoGenerate:noAi,videoToGif:noAi});
  const result=await request(handle,'POST','/api/ad-resources/batches/batch/items/square/render',{preserveLayout:true,expectedVersion:1,draft});
  assert.equal(result.status,201);assert.equal(result.body.version.number,2);
  const state=(await request(handle,'GET','/api/ad-resources')).body.batches[0].items.square;
  assert.deepEqual(state.draft,{...draft,logoAssetId:''});assert.equal(state.autoError,'');assert.equal(state.autoWarning,'');
  assert.deepEqual(state.versions[0],version);assert.equal(state.versions[1].invalidatedReason,undefined);
  const candidate=await fs.readFile(path.join(folder,'candidate',result.body.version.storageName));
  assert.deepEqual(candidate,await renderAdJpg(art,spec,{...draft,logoAssetId:''}));
  assert.deepEqual(await fs.readFile(path.join(folder,'candidate','old.jpg')),old);
  await assert.rejects(()=>request(handle,'POST','/api/ad-resources/batches/batch/items/square/render',{preserveLayout:true,expectedVersion:1,draft}),/候选稿已更新/);
});

test('rendering and automatic regeneration use the latest corrected Bilibili layout instead of the earlier cached one',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'ad-layout-revision-')),storageDir=path.join(root,'storage'),folder=path.join(storageDir,'ad-resources-batch');
  t.after(()=>fs.rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:30}));
  await fs.mkdir(path.join(folder,'asset'),{recursive:true});await fs.mkdir(path.join(folder,'candidate'));
  const spec={id:'ad-03',number:3,name:'B站图片',platform:'B站',width:640,height:400,format:'JPG',logo:'forbidden',maxBytes:300*1024,safeInsetX:40};
  const sheet={sourceSha256:'current',specs:[spec]};
  const original=await sharp({create:{width:1280,height:720,channels:3,background:'#446688'}}).png().toBuffer();
  const old=await sharp({create:{width:640,height:400,channels:3,background:'#cc2233'}}).png().toBuffer();
  const corrected=await sharp({create:{width:640,height:400,channels:3,background:'#338855'}}).png().toBuffer();
  for(const [name,buffer] of [['original',original],['old',old],['corrected',corrected]])await fs.writeFile(path.join(folder,'asset',name+'.png'),buffer);
  const asset=(id,width,height)=>({id,role:'visual',name:`${id}_纯图.png`,width,height,url:`/storage/ad-resources-batch/asset/${id}.png`,logoFree:true,hasEmbeddedLogo:false});
  const layout=id=>({...asset(id,640,400),sourceFormat:'Layout',safeSourceAssetId:'original',safeInsetX:40,safeWidth:640,safeHeight:400,safeMethod:safeLayoutMethod});
  const draft={sourceAssetId:'original',logoAssetId:'',zoom:1,offsetX:0,offsetY:0};
  const batch={id:'batch',project:'补景修订',sourceSha256:'current',assets:[asset('original',1280,720),layout('old'),layout('corrected')],items:{'ad-03':{draft,versions:[]}}};
  await fs.writeFile(path.join(root,'ad-resources-jobs.json'),JSON.stringify([batch]));
  const noAi=async()=>{assert.fail('The corrected layout must be reused without generating another image')};
  const handle=await createAdResourcesHandler({root,runtimeDir:root,storageDir,catalogProvider:async()=>sheet,nanoGenerate:noAi,videoGenerate:noAi});
  const first=await request(handle,'POST','/api/ad-resources/batches/batch/items/ad-03/render',{draft});
  assert.equal(first.status,201);
  const expected=await renderAdJpg(corrected,spec,draft);
  assert.deepEqual(await fs.readFile(path.join(folder,'candidate',first.body.version.storageName)),expected);
  const regenerated=await request(handle,'POST','/api/ad-resources/batches/batch/auto-generate',{force:true});
  assert.equal(regenerated.body.generated,1);assert.deepEqual(regenerated.body.errors,[]);
  const state=(await request(handle,'GET','/api/ad-resources')).body.batches[0];
  assert.equal(state.items['ad-03'].draft.sourceAssetId,'corrected');
  assert.equal(state.items['ad-03'].versions.length,2);
  assert.deepEqual(await fs.readFile(path.join(folder,'candidate',state.items['ad-03'].versions.at(-1).storageName)),expected);
  assert.deepEqual(await fs.readFile(path.join(folder,'asset','old.png')),old);
});
