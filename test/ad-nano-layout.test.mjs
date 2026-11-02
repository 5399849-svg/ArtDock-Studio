import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import {Readable} from 'node:stream';
import {buildAdNanoLayoutPrompt,createAdNanoLayoutGenerator,prepareAdNanoLayoutRequest} from '../lib/ad-nano-layout.mjs';
import {prepareAdSafeLayoutInput,reframeAdSafeLayout} from '../lib/ad-safe-layout.mjs';
import {createAdResourcesHandler,validateAdCandidate} from '../lib/ad-resources-server.mjs';

const spec={width:640,height:400,safeInsetX:40};
async function setup(t){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'ad-native-layout-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:50}));
  await fs.mkdir(path.join(root,'config'));
  await fs.writeFile(path.join(root,'config/ai-huabu.json'),JSON.stringify({enabled:true,token:'fake-local-test',apiRoot:'https://test.invalid/api'}));
  return root;
}
const fixture=height=>sharp(Buffer.from(`<svg width="1280" height="${height}"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="#567890"/><stop offset="1" stop-color="#ad8c67"/></linearGradient></defs><rect width="1280" height="${height}" fill="url(#g)"/><circle cx="640" cy="350" r="160" fill="#903040"/><rect x="580" y="100" width="120" height="30" fill="#e0c090"/></svg>`)).png().toBuffer();
const rawResult=()=>sharp(Buffer.from('<svg width="2528" height="1696"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="#567890"/><stop offset="1" stop-color="#ad8c67"/></linearGradient></defs><rect width="2528" height="1696" fill="url(#g)"/></svg>')).png().toBuffer();
async function receipts(root){
  const top=path.join(root,'data/runtime/ad-layout-jobs'),list=[];
  for(const account of await fs.readdir(top))for(const key of await fs.readdir(path.join(top,account))){const dir=path.join(top,account,key);list.push({dir,...JSON.parse(await fs.readFile(path.join(dir,'receipt.json')))});}
  return list;
}

test('clean artwork never requests a generated brand, including grouped panels and square layouts',()=>{
  for(const [sourceName,targetWidth,targetHeight] of [['卡牌甄嬛',1080,1920],['派饭',720,1280],['卡牌甄嬛',800,800]]){
    const prompt=buildAdNanoLayoutPrompt({sourceName,targetWidth,targetHeight,sourceHasLogo:false});
    assert.match(prompt,/输出必须继续无品牌 Logo/);
    assert.match(prompt,/不能仅保留原意后改写/);
    assert.match(prompt,/禁止根据任务名、人物名、题材或画风猜写/);
    assert.match(prompt,/原图没有宣传标题时，输出也不得增加宣传标题/);
    assert.match(prompt,/保留原有角色姓名和字母评级/);
    assert.doesNotMatch(prompt,/Logo 只在最上方出现一次/,'A layout branch must not reintroduce a brand into clean artwork');
  }
  const embedded=buildAdNanoLayoutPrompt({targetWidth:720,targetHeight:1280,sourceHasLogo:true});
  assert.match(embedded,/只保留原来这一个/);assert.doesNotMatch(embedded,/输出必须继续无品牌 Logo/);
});

test('recomposition preserves repeated appearances of the same character and their paired scenes instead of deduplicating identity',()=>{
 for(const [name,width,height]of [['冷暖沈梅原图',1080,1920],['普通KV',800,800],['派饭原图',720,1280]]){
  const prompt=buildAdNanoLayoutPrompt({sourceName:name,targetWidth:width,targetHeight:height});
  assert.match(prompt,/按画面中的实际出现次数清点人物形象，不按角色身份去重/);
  assert.match(prompt,/每次表现都是必须保留的独立构图单元/);
  assert.match(prompt,/保留各单元的原有动作和关键道具/);
  assert.match(prompt,/保留每组场景与对应人物的配对及色彩分区/);
  assert.match(prompt,/禁止拉长人物、压窄房屋、加高楼层或门窗/);
  assert.match(prompt,/相连的房屋、楼层与人物保留原始宽高和透视关系/);
  assert.doesNotMatch(prompt,/同一人物、面板或信息组只出现一次/);
 }
});

test('source logo status reaches the model and a reviewed layout supersedes its faulty cached predecessor',async t=>{
  const root=await setup(t),storageDir=path.join(root,'storage'),sheet={sourceSha256:'text-boundary-regression',specs:[{id:'portrait',number:1,name:'竖版',width:720,height:1280,format:'JPG',logo:'required',maxBytes:null}]};
  const portrait=await sharp({create:{width:720,height:1280,channels:3,background:'#cba77e'}}).png().toBuffer();
  const batches=[];
  for(const [id,sourceHasLogo,cached] of [['clean',false,false],['embedded',true,false],['corrected',false,true]]){
    const folder=path.join(storageDir,'ad-resources-'+id,'asset');await fs.mkdir(folder,{recursive:true});
    await fs.writeFile(path.join(folder,'original.png'),await fixture(720));
    const original={id:'original',role:'visual',name:'原图.png',width:1280,height:720,url:`/storage/ad-resources-${id}/asset/original.png`,hasEmbeddedLogo:sourceHasLogo,logoFree:!sourceHasLogo};
    const assets=[original];
    if(cached)for(const suffix of ['faulty','reviewed']){
      await fs.writeFile(path.join(folder,suffix+'.png'),portrait);
      assets.push({id:suffix,role:'visual',name:suffix+'.png',width:720,height:1280,url:`/storage/ad-resources-${id}/asset/${suffix}.png`,logoFree:true,nanoSourceAssetId:'original',nanoRatio:'0.56250',nanoMethod:'recompose-v2'});
    }
    batches.push({id,project:id,sourceSha256:sheet.sourceSha256,assets,items:{portrait:{draft:{sourceAssetId:'original',logoAssetId:'',zoom:1,offsetX:0,offsetY:0},versions:[]}}});
  }
  await fs.writeFile(path.join(root,'ad-resources-jobs.json'),JSON.stringify(batches));
  const calls=[];
  const handle=await createAdResourcesHandler({root,runtimeDir:root,storageDir,catalogProvider:async()=>sheet,nanoGenerate:async input=>{calls.push(input.sourceHasLogo);return portrait;}});
  const request=async(method,url,body)=>{
    const req=Readable.from(body?[Buffer.from(JSON.stringify(body))]:[]);req.method=method;let value;
    await handle(req,{writeHead(){},end(chunk){value=JSON.parse(String(chunk));}},new URL(url,'http://local.test'));return value;
  };
  for(const batch of batches)await request('POST',`/api/ad-resources/batches/${batch.id}/items/portrait/render`,{expectedVersion:0});
  assert.deepEqual(calls,[false,true],'Only uncached artwork calls the model, with original logo status');
  const after=await request('GET','/api/ad-resources');
  const corrected=after.batches.find(b=>b.id==='corrected');
  assert.equal(corrected.items.portrait.draft.sourceAssetId,'reviewed');
  assert.ok(corrected.assets.some(a=>a.id==='faulty'),'Historical source remains available');
});

test('Bilibili background requests use a native frame with the original rectangle translated into it',async()=>{
  const prepared=await prepareAdSafeLayoutInput(await fixture(720),spec);
  const input=await prepareAdNanoLayoutRequest({sourceBuffer:prepared.buffer,targetWidth:640,targetHeight:400,layoutMode:'background-extension',sourceRect:prepared.sourceRect});
  assert.equal(input.ratio,'3:2');
  assert.equal((await sharp(input.buffer).metadata()).width,642);
  assert.match(input.prompt,new RegExp(`"x":${1/642}`));
  assert.match(input.prompt,new RegExp(`"y":${34/428}`));
  assert.match(input.prompt,new RegExp(`"height":${360/428}`));
  const retained=await sharp(input.buffer).extract({left:1,top:14,width:640,height:400}).raw().toBuffer();
  assert.deepEqual(retained,await sharp(prepared.buffer).raw().toBuffer());
});

test('native provider rounding repairs both source heights and reuses saved jobs after a new process',async t=>{
  const root=await setup(t),calls={canvas:0,submit:0,poll:0,download:0};
  const raw=await rawResult();
  const provider={
    async createCanvas(){return 'canvas-'+ ++calls.canvas;},
    async submitGeneration(_config,body){calls.submit++;assert.equal(body.ratio,'3:2');assert.ok(body.canvas_id);return 'job-'+calls.submit;},
    async pollJob(){calls.poll++;},
    async downloadRaw(){calls.download++;return {buffer:raw};}
  };
  const generate=createAdNanoLayoutGenerator(provider);
  for(const height of [714,720]){
    const source=await fixture(height),prepared=await prepareAdSafeLayoutInput(source,spec);
    const args={root,idempotencySeed:'source-'+height,sourceName:'native-ratio'};
    const make=()=>reframeAdSafeLayout(source,spec,{generate:input=>generate({...input,...args})});
    const [first,duplicate]=await Promise.all([make(),make()]);assert.deepEqual(first,duplicate);
    const meta=await sharp(first).metadata();assert.equal(meta.width,640);assert.equal(meta.height,400);
    assert.deepEqual(await sharp(first).extract(prepared.pixelRect).removeAlpha().raw().toBuffer(),await sharp(prepared.original).removeAlpha().raw().toBuffer(),'The whole original, including circles and text, stays unchanged');
    const fresh=createAdNanoLayoutGenerator({async createCanvas(){assert.fail('A saved result must not create or submit another paid job');}});
    assert.deepEqual(await reframeAdSafeLayout(source,spec,{generate:input=>fresh({...input,...args})}),first);
  }
  assert.deepEqual(calls,{canvas:2,submit:2,poll:2,download:2});
  for(const receipt of await receipts(root)){assert.equal(receipt.status,'completed');assert.equal(receipt.rawWidth,2528);assert.equal(receipt.rawHeight,1696);assert.equal(receipt.adaptation.method,'native-frame-crop-v1');}
});

test('poll interruptions resume the same canvas and paid job instead of triggering a conflicting submission',async t=>{
  const root=await setup(t),input=await prepareAdSafeLayoutInput(await fixture(720),spec),raw=await rawResult();
  let canvas=0,submit=0,polls=0;
  const provider={async createCanvas(){canvas++;return 'persisted-canvas';},async submitGeneration(){submit++;return 'persisted-job';},async pollJob(_config,id){assert.equal(id,'persisted-job');if(++polls===1)throw Error('temporary network timeout');},async downloadRaw(){return {buffer:raw};}};
  const args={root,sourceBuffer:input.buffer,targetWidth:640,targetHeight:400,layoutMode:'background-extension',sourceRect:input.sourceRect};
  await assert.rejects(()=>createAdNanoLayoutGenerator(provider)(args),/temporary network timeout/);
  await createAdNanoLayoutGenerator(provider)(args);
  assert.deepEqual({canvas,submit,polls},{canvas:1,submit:1,polls:2});
});

test('unfilled margins and unrelated ratios remain rejected with raw outputs retained for recovery',async t=>{
  const root=await setup(t),input=await prepareAdSafeLayoutInput(await fixture(720),spec);
  for(const [key,width,height,color,error] of [['blank',2528,1696,'#e6e6e6',/浅灰画布/],['mask',2528,1696,'#ff00ff',/标记画布/],['square',2048,2048,'#567890',/画幅与生成请求不符/]]){
    let submits=0,downloads=0;const raw=await sharp({create:{width,height,channels:3,background:color}}).png().toBuffer();
    const provider={async createCanvas(){return key;},async submitGeneration(){submits++;return key;},async pollJob(){},async downloadRaw(){downloads++;return {buffer:raw};}};
    const args={root,idempotencySeed:key,sourceBuffer:input.buffer,targetWidth:640,targetHeight:400,layoutMode:'background-extension',sourceRect:input.sourceRect};
    await assert.rejects(()=>createAdNanoLayoutGenerator(provider)(args),error);
    await assert.rejects(()=>createAdNanoLayoutGenerator(provider)(args),error);
    assert.equal(submits,key==='square'?1:2);assert.equal(downloads,key==='square'?1:2,'At most one explicit-mask repair; repeated requests reuse both raw results');
  }
  for(const receipt of await receipts(root)){assert.equal(receipt.status,'interrupted');assert.ok((await fs.stat(path.join(receipt.dir,'raw.png'))).size>0);await assert.rejects(()=>fs.stat(path.join(receipt.dir,'result.png')),e=>e.code==='ENOENT');}
});

test('new tasks auto-generate a downloadable 640x400 candidate through the native model pipeline',async t=>{
  const root=await setup(t),runtimeDir=path.join(root,'data/runtime'),storageDir=path.join(runtimeDir,'storage');await fs.mkdir(storageDir,{recursive:true});
  const spec={id:'ad-03',number:3,name:'B站图片',platform:'B站',width:640,height:400,safeInsetX:40,format:'JPG',maxBytes:300*1024,logo:'forbidden'};
  const sheet={sourceName:'test.xlsx',sourceSha256:'native-task-regression',specs:[spec]},raw=await rawResult();let submitted=0;
  const blank=await sharp({create:{width:2528,height:1696,channels:3,background:'#e6e6e6'}}).png().toBuffer();
  const nanoGenerate=createAdNanoLayoutGenerator({async createCanvas(){return 'canvas-'+submitted;},async submitGeneration(_config,body){
    assert.equal(body.ratio,'3:2');submitted++;
    if(submitted===2){
      assert.match(body.prompt,/纯紫红色/);
      const input=Buffer.from(body.images[0].data_base64,'base64');
      assert.deepEqual([...await sharp(input).extract({left:0,top:0,width:1,height:1}).removeAlpha().raw().toBuffer()],[255,0,255]);
    }
    return 'job-'+submitted;
  },async pollJob(){},async downloadRaw(_config,id){return {buffer:id==='job-1'?blank:raw};}});
  const handle=await createAdResourcesHandler({root,runtimeDir,storageDir,catalogProvider:async()=>sheet,nanoGenerate});
  async function request(method,url,body){
    const req=Readable.from(body?[Buffer.from(JSON.stringify(body))]:[]);req.method=method;let status,value;
    await handle(req,{writeHead(code){status=code;},end(chunk){value=chunk;}},new URL(url,'http://local.test'));
    return {status,body:Buffer.isBuffer(value)&&value.readUInt32LE(0)===0x04034b50?value:JSON.parse(String(value))};
  }
  for(const height of [714,720]){
    const batch=(await request('POST','/api/ad-resources/batches',{project:'new-task-'+height})).body.batch;
    await request('POST',`/api/ad-resources/batches/${batch.id}/assets`,{role:'visual',name:'纯图.png',dataUrl:'data:image/png;base64,'+(await fixture(height)).toString('base64')});
    const result=await request('POST',`/api/ad-resources/batches/${batch.id}/auto-generate`,{});
    assert.equal(result.body.generated,1,JSON.stringify(result.body));assert.deepEqual(result.body.errors,[]);
    const current=(await request('GET','/api/ad-resources')).body.batches.find(b=>b.id===batch.id),item=current.items['ad-03'];
    assert.equal(item.autoError,'');assert.equal(item.draft.logoAssetId,'');
    const file=path.join(storageDir,'ad-resources-'+batch.id,'candidate',item.versions[0].storageName);
    const check=await validateAdCandidate(spec,await fs.readFile(file));assert.equal(check.width,640);assert.equal(check.height,400);assert.ok(check.bytes<spec.maxBytes);
    const again=await request('POST',`/api/ad-resources/batches/${batch.id}/auto-generate`,{});assert.equal(again.body.generated,0);
    const zip=await request('GET',`/api/ad-resources/batches/${batch.id}/download`);assert.equal(zip.status,200);assert.equal(zip.body.readUInt32LE(),0x04034b50);
  }
  assert.equal(submitted,3,'Two fresh tasks plus one explicit-mask repair; repeating automatic generation never submits again');
});
