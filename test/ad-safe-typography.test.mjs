import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Readable} from 'node:stream';
import sharp from 'sharp';
import {adSafeTypographyInset,renderAdSafeTypography,AD_SAFE_TYPOGRAPHY_METHOD} from '../lib/ad-safe-typography.mjs';
import {createAdResourcesHandler} from '../lib/ad-resources-server.mjs';

const spec={id:'ad-03',number:3,name:'B站图片',width:640,height:400,format:'JPG',logo:'forbidden',safeInsetX:40,maxBytes:null};
const request=async(handler,method,url,body)=>{
  const req=Readable.from(body===undefined?[]:[Buffer.from(JSON.stringify(body))]);req.method=method;
  let status,value;const res={writeHead(s){status=s;},end(v){value=JSON.parse(String(v));}};
  await handler(req,res,new URL(url,'http://local'));return {status,body:value};
};
async function fixture(t){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'ad-type-safe-')),storageDir=path.join(root,'storage'),folder=path.join(storageDir,'ad-resources-batch','asset');await fs.mkdir(folder,{recursive:true});
  t.after(()=>fs.rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:30}));
  const scene=await sharp(Buffer.from('<svg width="640" height="400"><rect width="640" height="400" fill="#d7a3c8"/><circle cx="320" cy="200" r="65" fill="#79abb3"/></svg>')).png().toBuffer();
  const type=await sharp(Buffer.from('<svg width="640" height="400"><g fill="#8a1931"><path d="M500 14h129v45H500zM8 350h120v25H8zM260 350h120v25H260zM510 350h120v25H510z"/></g></svg>')).png().toBuffer();
  const sourceBuffer=await sharp(scene).composite([{input:type}]).png().toBuffer();
  for(const [name,buffer]of[['scene.png',scene],['type.png',type],['art.png',sourceBuffer]])await fs.writeFile(path.join(folder,name),buffer);
  const prefix='/storage/ad-resources-batch/asset/',source={id:'art',role:'visual',name:'设计_纯图.png',width:640,height:400,url:prefix+'art.png',sourceFormat:'PSD',logoFree:true,hasEmbeddedLogo:false,motionSceneUrl:prefix+'scene.png',motionOverlayUrl:prefix+'type.png'};
  const draft={sourceAssetId:'art',logoAssetId:'',zoom:1.12,offsetX:0,offsetY:0,logoX:.78,logoY:.06,logoScale:.18};
  const batch={id:'batch',project:'原文字安全区',sourceSha256:'type-fixture',assets:[source],items:{'ad-03':{draft,versions:[{number:1,name:'before.jpg',storageName:'before.jpg',url:'/storage/ad-resources-batch/candidate/before.jpg'}]}}};
  await fs.mkdir(path.join(storageDir,'ad-resources-batch','candidate'));await fs.writeFile(path.join(storageDir,'ad-resources-batch','candidate','before.jpg'),await sharp(sourceBuffer).jpeg().toBuffer());
  const file=path.join(root,'ad-resources-jobs.json');await fs.writeFile(file,JSON.stringify([batch]));
  const assetBuffer=(_b,a)=>fs.readFile(path.join(folder,a.url.split('/').at(-1)));
  let calls=0;
  const make=()=>createAdResourcesHandler({root,runtimeDir:root,storageDir,catalogProvider:async()=>({sourceSha256:batch.sourceSha256,specs:[spec]}),aiEditGenerate:async()=>{calls++;throw Error('native lettering must not call a provider');}});
  const poll=async handler=>{for(let i=0;i<100;i++){const r=await request(handler,'GET','/api/ad-resources/batches/batch/items/ad-03/ai-edit');if(!r.body.pending)return r.body;await new Promise(r=>setTimeout(r,10));}throw Error('local typography did not finish');};
  return {root,storageDir,folder,file,batch,source,draft,scene,type,assetBuffer,make,poll,calls:()=>calls};
}

test('margin-only requests honor the policy and do not swallow other requested edits',()=>{
  for(const p of ['文案不要超出左右两侧40PX的区域','文字移入左右安全区','标题不能超出左右边距，保持原图色调'])assert.equal(adSafeTypographyInset(p,spec),40);
  assert.equal(adSafeTypographyInset('文案不要超出左右两侧60像素的区域',spec),60);
  assert.equal(adSafeTypographyInset('文案不要超出左右两侧20px的区域',spec),40);
  for(const p of ['人物放大一点','文案不要超出左右两侧40PX的区域，人物放大一点','标题改为新标题','颜色改成红色'])assert.equal(adSafeTypographyInset(p,spec),null);
});

test('native lettering stays inside the margins after art zoom; original scene pixels and type colors survive',async t=>{
  const f=await fixture(t),result=await renderAdSafeTypography({...f,spec,draft:{...f.draft,zoom:1},insetX:40});
  assert.equal(result.assessment.outsidePixels,0);assert.equal(result.assessment.components.length,2);
  const {data,info}=await sharp(result.buffer).removeAlpha().raw().toBuffer({resolveWithObject:true});
  const scenery=await sharp(f.scene).removeAlpha().raw().toBuffer();
  for(let y=0;y<400;y++)for(let x=0;x<640;x++){
    const i=(y*info.width+x)*3;
    if(x<40||x>=600||y>=100&&y<300)assert.deepEqual(data.subarray(i,i+3),scenery.subarray(i,i+3),'no color wash or original cropped text remains');
  }
  assert.ok(result.assessment.components.every(c=>c.left>=40&&c.left+c.width<=600));
  const zoomed=await renderAdSafeTypography({...f,spec,insetX:40});assert.equal(zoomed.assessment.outsidePixels,0);
  assert.ok(zoomed.assessment.components.every(c=>c.left>=40&&c.left+c.width<=600));
  assert.equal(await renderAdSafeTypography({...f,source:{...f.source,sourceFormat:'Nano'},spec}),null,'native layers cannot be pasted over an unrelated AI composition');
});

test('PSD margin correction produces a reviewable candidate without provider calls or extra saved versions',async t=>{
  const f=await fixture(t),handler=await f.make();
  await request(handler,'POST','/api/ad-resources/batches/batch/items/ad-03/ai-edit',{requestId:'native-safe-area-request',prompt:'文案不要超出左右两侧40PX的区域',expectedVersion:1,draft:f.draft,reviewBeforeApply:true});
  const result=await f.poll(handler);assert.equal(result.editJob.status,'awaiting_review');assert.equal(result.editJob.model,'local-typography');assert.equal(f.calls(),0);
  let after=(await request(handler,'GET','/api/ad-resources')).body.batches[0];assert.deepEqual(after.items['ad-03'].draft,f.draft);assert.equal(after.items['ad-03'].versions.length,1);
  assert.equal(after.items['ad-03'].aiEditJob.safeTypography.verified,true);
  await request(handler,'POST','/api/ad-resources/batches/batch/items/ad-03/ai-edit/accept',{candidateId:result.candidate.id});
  after=(await request(handler,'GET','/api/ad-resources')).body.batches[0];assert.equal(after.items['ad-03'].versions.length,2);assert.equal(after.items['ad-03'].draft.zoom,1);
});

test('restart repairs only an unadopted legacy margin candidate and leaves saved drafts and versions intact',async t=>{
  const f=await fixture(t),handler=await f.make();
  await request(handler,'POST','/api/ad-resources/batches/batch/items/ad-03/ai-edit',{requestId:'legacy-safe-area-request',prompt:'文案不要超出左右两侧40PX的区域',expectedVersion:1,draft:f.draft,reviewBeforeApply:true});
  const initial=await f.poll(handler),saved=JSON.parse(await fs.readFile(f.file,'utf8')),job=saved[0].items['ad-03'].aiEditJob;
  delete job.safeTypography;job.model='banana_pro';await fs.writeFile(f.file,JSON.stringify(saved));
  const restarted=await f.make(),current=(await request(restarted,'GET','/api/ad-resources')).body.batches[0];
  assert.equal(current.items['ad-03'].aiEditJob.status,'awaiting_review');assert.equal(current.items['ad-03'].aiEditJob.safeTypography.method,AD_SAFE_TYPOGRAPHY_METHOD);
  assert.notEqual(current.items['ad-03'].aiEditJob.candidate.url,initial.candidate.url,'preview cache must not keep showing the rejected image');
  assert.deepEqual(current.items['ad-03'].versions,saved[0].items['ad-03'].versions);assert.deepEqual(current.items['ad-03'].draft,f.draft);assert.equal(f.calls(),0);
  const settled=await fs.readFile(f.file,'utf8');await f.make();assert.equal(await fs.readFile(f.file,'utf8'),settled,'a repaired preview is not repeatedly regenerated on startup');
});
