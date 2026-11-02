import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Readable} from 'node:stream';
import http from 'node:http';
import sharp from 'sharp';
import {createAdResourcesHandler,renderAdJpg} from '../lib/ad-resources-server.mjs';
import {planAdAiEdit,buildAdAiEditPrompt,generateAdAiEdit,adAiEditMode,assessAdAiRecomposition} from '../lib/ad-ai-edit.mjs';
import {adAiOriginalReference} from '../lib/ad-ai-original-reference.mjs';
import {adAiPreservationOnly} from '../public/ad-ai-preservation.js';
import {createAdAiPreviewHandler} from '../lib/ad-ai-preview-server.mjs';
import {AD_AI_PROPORTION_METHOD,adAiProportionRepair,buildAdAiProportionPrompt} from '../lib/ad-ai-proportion.mjs';

const draft={sourceAssetId:'art',logoAssetId:'logo',zoom:1,offsetX:0,offsetY:0,logoX:.05,logoY:.05,logoScale:.2};
const spec={id:'required',number:1,name:'带标图片',platform:'测试',width:640,height:400,format:'JPG',logo:'required',safeInsetX:0,maxBytes:300*1024};
const cleanSpec={...spec,id:'ad-03',number:3,name:'B站图片',logo:'forbidden',safeInsetX:40};
const request=async(handle,method,url,body)=>{
  const req=Readable.from(body?[Buffer.from(JSON.stringify(body))]:[]);req.method=method;
  let status,result;const res={writeHead(s){status=s},end(value){result=value}};
  await handle(req,res,new URL(url,'http://localhost'));
  return {status,body:JSON.parse(String(result))};
};
async function fixture(t,generate){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'ad-ai-edit-')),storageDir=path.join(root,'storage'),folder=path.join(storageDir,'ad-resources-batch');
  t.after(()=>fs.rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:30}));
  await fs.mkdir(path.join(folder,'asset'),{recursive:true});await fs.mkdir(path.join(folder,'candidate'));
  const art=await sharp({create:{width:640,height:400,channels:3,background:'#234567'}}).png().toBuffer();
  const logo=await sharp({create:{width:80,height:40,channels:4,background:'#ed2020'}}).png().toBuffer();
  const changed=await sharp({create:{width:1280,height:800,channels:3,background:'#376d84'}}).png().toBuffer();
  await fs.writeFile(path.join(folder,'asset/art.png'),art);await fs.writeFile(path.join(folder,'asset/logo.png'),logo);
  const assets=[{id:'art',role:'visual',name:'纯图.png',width:640,height:400,url:'/storage/ad-resources-batch/asset/art.png',logoFree:true,hasEmbeddedLogo:false},{id:'logo',role:'logo',name:'Logo.png',width:80,height:40,url:'/storage/ad-resources-batch/asset/logo.png'}];
  const sheet={sourceSha256:'ai-edit-sheet',specs:[spec,cleanSpec]};
  const batch={id:'batch',project:'AI改图测试',sourceSha256:sheet.sourceSha256,assets,items:{}};
  for(const entry of sheet.specs){
    const d={...draft,logoAssetId:entry.logo==='required'?'logo':''},jpg=await renderAdJpg(art,entry,d,entry.logo==='required'?logo:null),storageName=entry.id+'-before.jpg';
    await fs.writeFile(path.join(folder,'candidate',storageName),jpg);
    batch.items[entry.id]={draft:d,versions:[{number:1,name:storageName,storageName,url:`/storage/ad-resources-batch/candidate/${storageName}`,review:{contentChecked:true,logoChecked:true,safeAreaChecked:true}}]};
  }
  await fs.writeFile(path.join(root,'ad-resources-jobs.json'),JSON.stringify([batch]));
  const calls=[];
  const makeHandle=()=>createAdResourcesHandler({root,runtimeDir:root,storageDir,catalogProvider:async()=>sheet,nanoGenerate:async()=>assert.fail('AI edits must not run automatic layout'),aiEditGenerate:async input=>{calls.push(input);return generate?generate(input,changed):changed}});
  const handle=await makeHandle();
  const get=async()=>((await request(handle,'GET','/api/ad-resources')).body.batches[0]);
  const submit=(id,prompt='人物放大一点',extra={})=>request(handle,'POST',`/api/ad-resources/batches/batch/items/${id}/ai-edit`,{requestId:'request-test-123',prompt,expectedVersion:1,draft:{...draft,logoAssetId:id==='required'?'logo':''},...extra});
  const poll=async(id,handler=handle)=>{
    const end=Date.now()+6000;
    while(Date.now()<end){const result=(await request(handler,'GET',`/api/ad-resources/batches/batch/items/${id}/ai-edit`)).body;if(!result.pending)return result;await new Promise(r=>setTimeout(r,10))}
    assert.fail('AI edit did not finish');
  };
  return {root,storageDir,folder,art,logo,changed,sheet,batch,handle,makeHandle,get,submit,poll,calls};
}

test('AI candidates require adoption, survive restart and only create one lightweight version when adopted',async t=>{
  const f=await fixture(t),before=await f.get();await f.submit('required','人物放大一点',{reviewBeforeApply:true});
  const ready=await f.poll('required');assert.equal(ready.editJob.status,'awaiting_review');assert.ok(ready.candidate.url);assert.equal(ready.version,undefined);
  let batch=await f.get();assert.deepEqual(batch.items.required.draft,before.items.required.draft);assert.deepEqual(batch.items.required.versions,before.items.required.versions);assert.equal(f.calls.length,1);
  await assert.rejects(()=>request(f.handle,'PUT','/api/ad-resources/batches/batch/items/required/draft',draft),/先采用或放弃/);
  const restarted=await f.makeHandle(),route='/api/ad-resources/batches/batch/items/required/ai-edit';
  const persisted=(await request(restarted,'GET',route)).body;assert.deepEqual(persisted.candidate,ready.candidate);assert.equal(persisted.pending,false);
  const done=(await request(restarted,'POST',route+'/accept',{candidateId:ready.candidate.id})).body;assert.equal(done.editJob.status,'completed');assert.equal(done.version.kind,'composition');assert.equal(done.version.number,2);assert.equal(done.version.storageName,undefined);assert.equal(done.draftDirty,false);
  await request(restarted,'POST',route+'/accept',{candidateId:ready.candidate.id});batch=(await request(restarted,'GET','/api/ad-resources')).body.batches[0];assert.equal(batch.items.required.versions.length,2);assert.equal(f.calls.length,1);
  await assert.rejects(()=>fs.stat(path.join(f.folder,'ai-edit',ready.candidate.id,'candidate.jpg')),/ENOENT/);
  const req=Readable.from([]);req.method='GET';let buffer;await restarted(req,{writeHead(){},end(v){buffer=Buffer.from(v)}},new URL(done.version.url,'http://localhost'));assert.equal((await sharp(buffer).metadata()).width,640);
});

test('discarding a paid candidate leaves history untouched, and Logo-only review edits save no image or version',async t=>{
  const f=await fixture(t),before=await f.get(),files=await fs.readdir(path.join(f.folder,'candidate'));
  const local=await f.submit('required','Logo 放大20%',{reviewBeforeApply:true});assert.equal(local.body.localDraft,true);assert.equal(f.calls.length,0);assert.equal((await f.get()).items.required.versions.length,1);assert.deepEqual(await fs.readdir(path.join(f.folder,'candidate')),files);
  const current=(await f.get()).items.required.draft,route='/api/ad-resources/batches/batch/items/required/ai-edit';
  await request(f.handle,'POST',route,{requestId:'paid-candidate-discard',prompt:'人物放大一点',expectedVersion:1,draft:current,reviewBeforeApply:true});const ready=await f.poll('required');assert.equal(ready.editJob.status,'awaiting_review');
  await request(f.handle,'POST',route+'/discard',{candidateId:ready.candidate.id});await request(f.handle,'POST',route+'/discard',{candidateId:ready.candidate.id});
  const after=await f.get();assert.deepEqual(after.items.required.draft,current);assert.deepEqual(after.items.required.versions,before.items.required.versions);assert.equal(after.items.required.aiEditJob.status,'discarded');assert.equal(f.calls.length,1);
  await assert.rejects(()=>request(f.handle,'POST',route+'/accept',{candidateId:ready.candidate.id}),/没有可采用/);await assert.rejects(()=>fs.stat(path.join(f.folder,'ai-edit',ready.candidate.id,'candidate.jpg')),/ENOENT/);
});

test('an awaiting-review job is actually viewable over HTTP without adoption or a second generation',async t=>{
  const f=await fixture(t),current={...draft,logoX:.3};await request(f.handle,'PUT','/api/ad-resources/batches/batch/items/required/draft',current);
  await f.submit('required','人物放大一点',{draft:current,reviewBeforeApply:true});const ready=await f.poll('required');assert.equal(ready.editJob.status,'awaiting_review');
  const previews=createAdAiPreviewHandler({storageDir:f.storageDir}),server=http.createServer(async(req,res)=>{if(!await previews(req,res,new URL(req.url,'http://localhost'))){res.writeHead(404);res.end();}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));});
  const base=`http://127.0.0.1:${server.address().port}`;
  for(const url of [ready.candidate.url,ready.editJob.basePreviewUrl]){const r=await fetch(base+url);assert.equal(r.status,200);const buffer=Buffer.from(await r.arrayBuffer()),meta=await sharp(buffer).metadata();assert.equal(meta.width,640);assert.equal(meta.height,400);assert.ok(buffer.equals(await fs.readFile(path.join(f.storageDir,url.replace('/storage/','')))));}
  assert.equal(f.calls.length,1);const batch=await f.get();assert.equal(batch.items.required.aiEditJob.status,'awaiting_review');assert.equal(batch.items.required.versions.length,1);assert.deepEqual(batch.items.required.draft,current);
});

test('AI prompt locks color, copy and safe zones while local logo commands preserve independent artwork',()=>{
  const plan=planAdAiEdit('人物放大一点，Logo 放大20%，Logo 移到右上角',{spec,draft,independentLogo:true});
  assert.equal(plan.imageInstruction,'人物放大一点');assert.equal(plan.nextDraft.logoScale,.24);assert.equal(plan.nextDraft.logoX,.72);assert.equal(plan.nextDraft.logoY,.04);
  const prompt=buildAdAiEditPrompt({instruction:plan.imageInstruction,spec:cleanSpec});
  for(const rule of ['640×400','40px','保持原有色相','每一个字','不贴矩形补丁','不要生成、添加或重绘任何品牌 Logo'])assert.ok(prompt.includes(rule));
  assert.throws(()=>planAdAiEdit('加一个 Logo',{spec:cleanSpec,draft}),/要求无 Logo/);
  assert.throws(()=>planAdAiEdit('Logo 放大一点',{spec,draft}),/上传独立 Logo/);
  assert.throws(()=>planAdAiEdit('Logo 换成红色',{spec,draft,independentLogo:true}),/原 Logo/);
  assert.throws(()=>planAdAiEdit('  ',{spec,draft}),/修改要求/);
  assert.throws(()=>planAdAiEdit('字'.repeat(2001),{spec,draft}),/2000/);
});

test('requests to reduce empty space allow a full recomposition without locking the original layout',()=>{
  const instruction='人物和物品排放太过于集中在中间了，四周留空太多，你重新排版';
  assert.equal(adAiEditMode(instruction),'recompose');
  assert.equal(adAiEditMode('人物放大一点，保持脸部和文字清楚'),'local');
  const logoBounds={x:.36,y:.06,width:.28,height:.12},prompt=buildAdAiEditPrompt({instruction,spec,logoBounds});
  for(const text of ['整体重新排版','原位置、原大小、原来的空白面积不锁定','70%至85%','每个原有构图单元各保留一次','不按角色身份去重','不合并场景或抹去一侧色彩','独立 Logo 的叠加区域',JSON.stringify(logoBounds)])assert.ok(prompt.includes(text));
  assert.ok(!prompt.includes('场景和信息关系保持原样。不因修复一处而重做整张设计'));
});

test('preservation constraints alone never submit a paid redraw or add a candidate',async t=>{
  const f=await fixture(t),before=await f.get();
  for(const prompt of ['不要改变原来图片的色调','保持原图的配色不变','请保留原有风格','图片颜色不变','保持色调不变，保持构图不变']){
    assert.equal(adAiPreservationOnly(prompt),true,prompt);
    await assert.rejects(()=>f.submit('required',prompt),/这是保留要求/);
  }
  assert.equal(f.calls.length,0);assert.deepEqual(await f.get(),before);
  for(const prompt of ['人物放大一点，色调不变','把人物缩小但不要改变原来图片的色调','颜色改成红色','恢复原图色调','去掉杂色','人物不要挡住标题',''])assert.equal(adAiPreservationOnly(prompt),false,prompt);
  await f.submit('required','人物放大一点，色调不变');assert.equal((await f.poll('required')).editJob.status,'completed');assert.equal(f.calls.length,1);
});

test('restoring missing copy permits requested text and follows only the current artwork lineage',()=>{
  const original={id:'original',role:'visual'},derived={id:'square',role:'visual',nanoSourceAssetId:'original'},current={id:'current',role:'visual',aiSourceAssetId:'square'};
  const batch={assets:[{id:'unrelated',role:'visual'},original,derived,current]};
  assert.equal(adAiOriginalReference(batch,current,'参考原图，把角色名称加回去'),original);
  assert.equal(adAiOriginalReference(batch,current,'人物缩小一点'),null);
  assert.equal(adAiOriginalReference(batch,original,'参考原图'),null);
  const prompt=buildAdAiEditPrompt({instruction:'参考原图，补回“沈眉庄”',spec,originalReference:true});
  assert.match(prompt,/图1是需要修改的当前尺寸稿，图2是同一素材的原始参考图/);
  assert.match(prompt,/添加、补回或修改的文字必须执行/);
  assert.doesNotMatch(prompt,/水印或新文字/);
  assert.equal(adAiOriginalReference({assets:[{...original,aiSourceAssetId:'current'},current]},current,'参考原图'),null,'a broken/cyclic lineage must not loop or pick an unrelated upload');
});

test('an original-image restoration supplies the uncropped original alongside the current size',async t=>{
  const f=await fixture(t),file=path.join(f.root,'ad-resources-jobs.json'),jobs=JSON.parse(await fs.readFile(file,'utf8'));
  const original=await sharp({create:{width:1280,height:720,channels:3,background:'#edccaa'}}).png().toBuffer();
  await fs.writeFile(path.join(f.folder,'asset/original.png'),original);
  jobs[0].assets.push({id:'original',role:'visual',url:'/storage/ad-resources-batch/asset/original.png',width:1280,height:720});
  jobs[0].assets.find(a=>a.id==='art').nanoSourceAssetId='original';
  await fs.writeFile(file,JSON.stringify(jobs));const handle=await f.makeHandle();
  await request(handle,'POST','/api/ad-resources/batches/batch/items/required/ai-edit',{requestId:'restore-original-name',prompt:'参考原图，把角色名称加回去',expectedVersion:1,draft});
  const done=await f.poll('required',handle);assert.equal(done.editJob.status,'completed');
  assert.equal(f.calls.length,1);assert.ok(f.calls[0].originalReferenceBuffer);
  const meta=await sharp(f.calls[0].originalReferenceBuffer).metadata();assert.equal(meta.width,1280);assert.equal(meta.height,720);
  const batch=(await request(handle,'GET','/api/ad-resources')).body.batches[0];assert.equal(batch.items.required.aiEditJob.originalReferenceAssetId,'original');
});

test('an anchored original palette rejects a purple repaint and keeps both the current candidate and the paid result',async t=>{
  const repaint=await sharp({create:{width:1280,height:800,channels:3,background:'#b030e0'}}).png().toBuffer();
  const f=await fixture(t,async()=>repaint),file=path.join(f.root,'ad-resources-jobs.json'),jobs=JSON.parse(await fs.readFile(file,'utf8'));
  const reference=await sharp({create:{width:1280,height:720,channels:3,background:'#4030e0'}}).png().toBuffer();
  await fs.writeFile(path.join(f.folder,'asset/reference.png'),reference);
  jobs[0].assets.push({id:'original-colour',role:'visual',url:'/storage/ad-resources-batch/asset/reference.png',width:1280,height:720});
  jobs[0].assets.find(a=>a.id==='art').toneReferenceAssetId='original-colour';
  await fs.writeFile(file,JSON.stringify(jobs));const handle=await f.makeHandle();
  await request(handle,'POST','/api/ad-resources/batches/batch/items/required/ai-edit',{requestId:'locked-palette-request',prompt:'人物大一点',expectedVersion:1,draft});
  const result=await f.poll('required',handle);assert.equal(result.editJob.status,'needs_revision');assert.match(result.editJob.error,/配色偏离/);
  const after=(await request(handle,'GET','/api/ad-resources')).body.batches[0];
  assert.deepEqual(after.items.required.versions,jobs[0].items.required.versions);assert.deepEqual(after.items.required.draft,draft);
  assert.equal(after.items.required.aiEditJob.rawReady,true);assert.equal(after.items.required.aiEditJob.resultReady,true);assert.equal(after.items.required.aiEditJob.paletteAssessment.consistent,false);
  assert.equal(f.calls.length,1);assert.ok(f.calls[0].originalReferenceBuffer);
});

test('recomposition check rejects near-copies, repainting small details or brightness-only changes but accepts a materially different layout',async()=>{
  const scene=left=>Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400"><rect width="640" height="400" fill="#a6b899"/><rect x="${left}" y="90" width="120" height="230" fill="#303b77"/><circle cx="${left+220}" cy="180" r="75" fill="#e8d184"/><rect x="${left+140}" y="280" width="210" height="60" fill="#67384b"/></svg>`);
  const source=await sharp(scene(80)).png().toBuffer(),relit=await sharp(source).linear(1.1,6).png().toBuffer(),moved=await sharp(scene(230)).png().toBuffer();
  const repainted=await sharp(source).composite([{input:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="45" height="45"><rect width="45" height="45" fill="#d16c59"/></svg>'),left:120,top:120}]).png().toBuffer();
  assert.equal((await assessAdAiRecomposition(source,source)).changed,false);
  assert.equal((await assessAdAiRecomposition(source,relit)).changed,false);
  assert.equal((await assessAdAiRecomposition(source,repainted)).changed,false);
  assert.equal((await assessAdAiRecomposition(source,moved)).changed,true);
});

test('an unchanged recomposition is retained for diagnosis and never replaces the current candidate',async t=>{
  const f=await fixture(t,async input=>input.sourceBuffer),before=await f.get();
  await f.submit('required','四周留空太多，请重新排版');const result=await f.poll('required');
  assert.equal(result.editJob.status,'needs_revision');assert.match(result.editJob.error,/未明显改变主体排版/);
  const after=await f.get();assert.deepEqual(after.items.required.draft,before.items.required.draft);assert.deepEqual(after.items.required.versions,before.items.required.versions);assert.deepEqual(after.assets,before.assets);
  assert.equal(after.items.required.aiEditJob.assessment.reason,'near-copy');assert.equal(after.items.required.aiEditJob.resultReady,true);
});

test('a first AI candidate has a before preview, and the next explicit modification submits a new job',async t=>{
  const f=await fixture(t),file=path.join(f.root,'ad-resources-jobs.json'),jobs=JSON.parse(await fs.readFile(file,'utf8'));
  jobs[0].items.required.versions=[];await fs.writeFile(file,JSON.stringify(jobs));const handle=await f.makeHandle();
  const route='/api/ad-resources/batches/batch/items/required/ai-edit';
  await request(handle,'POST',route,{requestId:'first-request-123',prompt:'人物大一点',expectedVersion:0,draft});
  const first=await f.poll('required',handle);assert.equal(first.editJob.status,'completed');assert.equal(first.editJob.baseVersion,0);assert.match(first.editJob.basePreviewUrl,/\/before\.jpg$/);
  assert.ok((await fs.readFile(path.join(f.root,first.editJob.basePreviewUrl.slice(1)))).length>0);
  const batch=(await request(handle,'GET','/api/ad-resources')).body.batches[0];
  await request(handle,'POST',route,{requestId:'next-request-456',prompt:'人物再大一点',expectedVersion:1,draft:batch.items.required.draft});
  const second=await f.poll('required',handle);assert.equal(second.editJob.status,'completed');assert.equal(second.version.number,2);assert.notEqual(first.editJob.id,second.editJob.id);assert.equal(f.calls.length,2);
});

test('AI modification changes only the selected size, keeps one local logo, deduplicates submissions and supports undo',async t=>{
  let release,called;const entered=new Promise(resolve=>{called=resolve}),gate=new Promise(resolve=>{release=resolve});
  const f=await fixture(t,async(input,changed)=>{called();await input.onUpdate({status:'processing',providerJobId:'known-job'});await gate;return changed});
  const before=await f.get(),submitted=await f.submit('required','人物放大一点，Logo 放大20%');assert.equal(submitted.status,202);await entered;
  const input=f.calls[0];assert.equal(input.instruction,'人物放大一点');assert.equal(input.embeddedLogo,false);
  const pixel=await sharp(input.sourceBuffer).extract({left:40,top:35,width:1,height:1}).removeAlpha().raw().toBuffer();assert.ok(pixel[0]<pixel[2],'The image model must never receive the separate red logo');
  await f.submit('required','人物放大一点，Logo 放大20%');assert.equal(f.calls.length,1);
  await assert.rejects(()=>request(f.handle,'PUT','/api/ad-resources/batches/batch/items/required/draft',draft),/正在 AI 修改/);
  await assert.rejects(()=>request(f.handle,'POST','/api/ad-resources/batches/batch/apply-logo',{logoAssetId:'logo'}),/正在 AI 修改/);
  release();const result=await f.poll('required');assert.equal(result.editJob.status,'completed');assert.equal(result.version.number,2);assert.equal(result.version.review.contentChecked,false);
  const after=await f.get(),item=after.items.required,source=after.assets.find(a=>a.id===item.draft.sourceAssetId);
  assert.equal(source.logoFree,true);assert.equal(source.hasEmbeddedLogo,false);assert.equal(item.draft.logoAssetId,'logo');assert.equal(item.draft.logoScale,.24);
  assert.deepEqual(after.items['ad-03'],before.items['ad-03']);assert.deepEqual(item.versions[0],before.items.required.versions[0]);
  const saved=await fs.readFile(path.join(f.folder,'candidate',result.version.storageName));assert.ok(saved.length<300*1024);
  const logoPixel=await sharp(saved).extract({left:45,top:35,width:1,height:1}).raw().toBuffer();assert.ok(logoPixel[0]>logoPixel[2]*2);
  const repeated=await f.submit('required','人物放大一点，Logo 放大20%');assert.equal(repeated.body.editJob.id,result.editJob.id);assert.equal(f.calls.length,1);
  const undo=await request(f.handle,'POST','/api/ad-resources/batches/batch/items/required/ai-edit/undo',{expectedVersion:2});assert.equal(undo.body.version.number,3);
  const restored=await f.get();assert.deepEqual(restored.items.required.draft,before.items.required.draft);
  assert.ok((await fs.readFile(path.join(f.folder,'candidate',undo.body.version.storageName))).equals(await fs.readFile(path.join(f.folder,'candidate',before.items.required.versions[0].storageName))));
  assert.ok((await fs.readFile(path.join(f.folder,'candidate',result.version.storageName))).equals(saved));
});

test('logo-only instructions render locally without a paid model call',async t=>{
  const f=await fixture(t);await f.submit('required','Logo 放大20%，Logo 左移5%');const result=await f.poll('required');
  assert.equal(result.editJob.status,'completed');assert.equal(result.editJob.model,'local-logo');assert.equal(f.calls.length,0);
  const item=(await f.get()).items.required;assert.equal(item.draft.sourceAssetId,'art');assert.equal(item.draft.logoScale,.24);assert.equal(item.draft.logoX,0);
});

test('invalid, stale and wrong-ratio edits never overwrite the current image or create candidates',async t=>{
  const f=await fixture(t,async()=>sharp({create:{width:100,height:100,channels:3,background:'#eee'}}).png().toBuffer());const before=await f.get();
  await assert.rejects(()=>f.submit('ad-03','Logo 放大20%'),/要求无 Logo/);
  await assert.rejects(()=>f.submit('required','人物大一点',{expectedVersion:0}),/候选稿已更新/);
  assert.equal(f.calls.length,0);
  await f.submit('required');const result=await f.poll('required');assert.equal(result.editJob.status,'failed');assert.match(result.editJob.error,/比例/);
  assert.equal(result.editJob.rawReady,true);assert.equal(result.editJob.canResume,true);
  const after=await f.get();assert.deepEqual(after.items.required.draft,before.items.required.draft);assert.deepEqual(after.items.required.versions,before.items.required.versions);assert.deepEqual(after.assets,before.assets);
  assert.ok((await fs.readFile(path.join(f.folder,'ai-edit',result.editJob.id,'raw-image'))).length>0);
  await request(f.handle,'POST','/api/ad-resources/batches/batch/items/required/ai-edit/resume',{});await f.poll('required');assert.equal(f.calls.length,1,'Reprocessing stored output must not call the model again');
});

test('a legacy failed Bilibili request reuses its provider result and creates a correctly sized candidate',async t=>{
  const f=await fixture(t,async input=>{assert.equal(input.job.providerJobId,'paid-legacy-job');return sharp({create:{width:2528,height:1696,channels:3,background:'#345678'}}).png().toBuffer()});
  const file=path.join(f.root,'ad-resources-jobs.json'),jobs=JSON.parse(await fs.readFile(file,'utf8')),item=jobs[0].items['ad-03'];
  item.aiEditJob={id:'legacy-ratio-job',assetId:'recovered-asset',requestId:'legacy-request-id',prompt:'修复上面背景接缝',plan:{imageInstruction:'修复上面背景接缝',nextDraft:item.draft},project:'测试',status:'failed',model:'banana_pro',baseDraft:item.draft,baseVersion:1,basePreviewUrl:item.versions[0].url,catalogSha:jobs[0].sourceSha256,providerJobId:'paid-legacy-job',error:'AI 返回了不符合当前尺寸比例的画面，原稿已保留'};
  const {createHash}=await import('node:crypto');
  const keys=['sourceAssetId','logoAssetId','zoom','offsetX','offsetY','logoScale','logoX','logoY'];item.aiEditJob.baseToken=createHash('sha256').update(JSON.stringify([jobs[0].sourceSha256,1,keys.map(k=>item.draft[k]??null)])).digest('hex');
  await fs.writeFile(file,JSON.stringify(jobs));const handle=await f.makeHandle(),route='/api/ad-resources/batches/batch/items/ad-03/ai-edit';
  assert.equal((await request(handle,'GET',route)).body.editJob.canResume,true);
  await request(handle,'POST',route+'/resume',{});const done=await f.poll('ad-03',handle);assert.equal(done.editJob.status,'completed');assert.equal(done.version.width,640);assert.equal(done.version.height,400);assert.equal(f.calls.length,1);
  const after=(await request(handle,'GET','/api/ad-resources')).body.batches[0];assert.equal(after.items['ad-03'].aiEditJob.outputAdaptation.method,'legacy-8x5-native-cover-v1');assert.deepEqual(after.items.required,jobs[0].items.required);
});

test('known provider task survives service restart and read-only polling never starts generation',async t=>{
  let count=0;
  const f=await fixture(t,async(input,changed)=>{
    count++;
    if(count===1){await input.onUpdate({status:'processing',providerJobId:'existing-provider-job'});throw Object.assign(Error('暂未完成'),{editStatus:'result_uncertain'})}
    assert.equal(input.job.providerJobId,'existing-provider-job');return changed;
  });
  await f.submit('ad-03');const uncertain=await f.poll('ad-03');assert.equal(uncertain.editJob.status,'result_uncertain');
  for(let i=0;i<3;i++)await request(f.handle,'GET','/api/ad-resources/batches/batch/items/ad-03/ai-edit');assert.equal(count,1);
  const file=path.join(f.root,'ad-resources-jobs.json'),jobs=JSON.parse(await fs.readFile(file,'utf8'));jobs[0].items['ad-03'].aiEditJob.status='processing';await fs.writeFile(file,JSON.stringify(jobs));
  const restarted=await f.makeHandle(),done=await f.poll('ad-03',restarted);assert.equal(done.editJob.status,'completed');assert.equal(done.version.number,2);assert.equal(count,2);
  const state=(await request(restarted,'GET','/api/ad-resources')).body.batches[0],item=state.items['ad-03'];
  const render=await request(restarted,'POST','/api/ad-resources/batches/batch/items/ad-03/render',{draft:item.draft});assert.equal(render.status,201);assert.equal(count,2);
  const current=(await request(restarted,'GET','/api/ad-resources')).body.batches[0].items['ad-03'];assert.equal(current.draft.sourceAssetId,item.draft.sourceAssetId);
});

test('ambiguous submission is not automatically resubmitted after a restart',async t=>{
  const f=await fixture(t,async input=>{await input.onUpdate({status:'submitting',submittedAt:new Date().toISOString()});throw Object.assign(Error('提交未知'),{editStatus:'result_uncertain'})});
  await f.submit('required');await f.poll('required');
  const file=path.join(f.root,'ad-resources-jobs.json'),jobs=JSON.parse(await fs.readFile(file,'utf8'));jobs[0].items.required.aiEditJob.status='submitting';await fs.writeFile(file,JSON.stringify(jobs));
  const restarted=await f.makeHandle();const result=(await request(restarted,'GET','/api/ad-resources/batches/batch/items/required/ai-edit')).body;
  assert.equal(result.editJob.status,'result_uncertain');assert.equal(f.calls.length,1);
});

test('provider uses Nano Banana Pro with an idempotent request and only queries a known job on resume',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'ad-ai-provider-'));t.after(()=>fs.rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:30}));
  await fs.mkdir(path.join(root,'config'));await fs.writeFile(path.join(root,'config/ai-huabu.json'),JSON.stringify({apiRoot:'https://canvas.test/api',token:'test-only-placeholder'}));
  const image=await sharp({create:{width:640,height:400,channels:3,background:'#456789'}}).png().toBuffer(),calls=[],job={id:'test-job',project:'测试'};
  const fake=async(url,init={})=>{
    calls.push({url,init});
    if(url.endsWith('/RH_ComfyUI/models/image'))return Response.json({models:[{name:'banana_pro',available:true,channels:[{name:'gemini',available:true,vendor_model:'gemini-3-pro-image'}]}]});
    if(url.endsWith('/canvases'))return Response.json({status:0,data:{id:10}});
    if(url.endsWith('/generate'))return Response.json({status:0,data:{job_id:'provider-123'}});
    if(url.endsWith('/raw'))return new Response(image,{headers:{'content-type':'image/png'}});
    return Response.json({status:0,data:{status:'done'}});
  };
  const run=()=>generateAdAiEdit({root,sourceBuffer:image,spec:cleanSpec,instruction:'修复背景接缝',job,onUpdate:async v=>Object.assign(job,v),fetchImpl:fake,pollIntervalMs:1});
  assert.ok((await run()).equals(image));
  const submission=calls.find(c=>c.url.endsWith('/generate')),body=JSON.parse(submission.init.body);assert.equal(body.model,'banana_pro');assert.equal(body.channel,'gemini');assert.equal(body.ratio,'3:2');assert.ok(submission.init.headers['Idempotency-Key']);
  const modelInput=await sharp(Buffer.from(body.images[0].data_base64,'base64')).metadata();assert.equal(modelInput.width,642);assert.equal(modelInput.height,428);assert.equal(job.generationFrame.targetHeight,400);assert.match(body.prompt,/临时画幅/);
  const firstCount=calls.length;assert.ok((await run()).equals(image));assert.ok(calls.slice(firstCount).every(c=>!c.init.method||c.init.method==='GET'));
  const uncertainJob={id:'same-request',project:'测试'},keys=[];
  const uncertainFetch=async(url,init)=>{if(url.endsWith('/generate')){keys.push(init.headers['Idempotency-Key']);throw Error('lost reply')}return fake(url,init)};
  const ambiguous=()=>generateAdAiEdit({root,sourceBuffer:image,spec:cleanSpec,instruction:'修复背景接缝',job:uncertainJob,onUpdate:async v=>Object.assign(uncertainJob,v),fetchImpl:uncertainFetch});
  await assert.rejects(ambiguous,e=>e.editStatus==='result_uncertain');await assert.rejects(ambiguous,e=>e.editStatus==='result_uncertain');assert.equal(keys.length,2);assert.equal(keys[0],keys[1]);
  await assert.rejects(()=>generateAdAiEdit({root,sourceBuffer:image,spec:cleanSpec,instruction:'代码升级后改了提示词',job:uncertainJob,onUpdate:async v=>Object.assign(uncertainJob,v),fetchImpl:uncertainFetch}),e=>e.editStatus==='result_uncertain');
  assert.equal(keys[2],keys[0],'Resuming a submission must reuse its saved prompt/key after code updates');
});

test('a reference-copy result is blocked before review or adoption and the original draft stays intact',async t=>{
  const reference=await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400"><rect width="640" height="400" fill="#fff2de"/><circle cx="450" cy="130" r="100" fill="#88172b"/><rect x="40" y="40" width="100" height="330" fill="#151515"/></svg>')).png().toBuffer(),f=await fixture(t,async()=>reference),route='/api/ad-resources/batches/batch/items/required/ai-edit';
  const req=Readable.from([reference]);req.method='POST';let refs;await f.handle(req,{writeHead(){},end(v){refs=JSON.parse(String(v)).references}},new URL(route+'/references','http://localhost'));
  const before=await f.get();await f.submit('required','参考图1的版式，保留当前人物和文案',{reviewBeforeApply:true,referenceIds:[refs[0].id]});const blocked=await f.poll('required');assert.equal(blocked.editJob.status,'needs_revision');assert.match(blocked.editJob.error,/误用了参考图内容/);assert.equal(blocked.candidate,undefined);assert.equal(blocked.editJob.resultReady,true);
  const after=await f.get();assert.deepEqual(after.items.required.draft,before.items.required.draft);assert.deepEqual(after.items.required.versions,before.items.required.versions);assert.deepEqual(after.assets,before.assets);assert.equal(f.calls[0].job.referenceInputMethod,'layout-guide-v1');assert.equal(f.calls.length,1);
  await assert.rejects(()=>request(f.handle,'POST',route+'/accept',{candidateId:blocked.editJob.id}),/没有可采用/);assert.equal(f.calls.length,1);
});

test('old unadopted single candidates are rechecked on restart without generation or altering retained versions',async t=>{
  const f=await fixture(t),reference=await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400"><rect width="640" height="400" fill="#fff2de"/><circle cx="450" cy="130" r="100" fill="#88172b"/></svg>')).png().toBuffer(),route='/api/ad-resources/batches/batch/items/required/ai-edit';
  const req=Readable.from([reference]);req.method='POST';let refs;await f.handle(req,{writeHead(){},end(v){refs=JSON.parse(String(v)).references}},new URL(route+'/references','http://localhost'));const before=await f.get();
  await f.submit('required','参考图1的衔接方式',{reviewBeforeApply:true,referenceIds:[refs[0].id]});const ready=await f.poll('required');assert.equal(ready.editJob.status,'awaiting_review');await fs.writeFile(path.join(f.folder,'ai-edit',ready.candidate.id,'result.png'),reference);
  const restarted=await f.makeHandle(),blocked=(await request(restarted,'GET',route)).body;assert.equal(blocked.editJob.status,'needs_revision');assert.equal(blocked.candidate,undefined);assert.equal(f.calls.length,1);const after=(await request(restarted,'GET','/api/ad-resources')).body.batches[0];assert.deepEqual(after.items.required.draft,before.items.required.draft);assert.deepEqual(after.items.required.versions,before.items.required.versions);
});

test('new provider requests send layout guides instead of raw reference artwork and ambiguous retries keep the same bytes/key',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'ad-ai-layout-provider-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));await fs.mkdir(path.join(root,'config'));await fs.writeFile(path.join(root,'config/ai-huabu.json'),JSON.stringify({apiRoot:'https://canvas.test/api',token:'test-placeholder'}));
  const image=await sharp({create:{width:640,height:400,channels:3,background:'#234567'}}).png().toBuffer(),reference=await sharp({create:{width:100,height:160,channels:3,background:'#ff0000'}}).png().toBuffer(),job={id:'new-layout-test',referenceInputMethod:'layout-guide-v1'},submissions=[];
  const fake=async(url,init={})=>{if(url.endsWith('/RH_ComfyUI/models/image'))return Response.json({models:[{name:'banana_pro',available:true,channels:[{name:'gemini',available:true}]}]});if(url.endsWith('/canvases'))return Response.json({status:0,data:{id:20}});if(url.endsWith('/generate')){submissions.push({key:init.headers['Idempotency-Key'],body:JSON.parse(init.body)});throw Error('lost response');}assert.fail('Unexpected request '+url);};
  const run=()=>generateAdAiEdit({root,sourceBuffer:image,referenceBuffers:[reference],spec,instruction:'参考图1的版式',job,onUpdate:async v=>Object.assign(job,v),fetchImpl:fake});await assert.rejects(run,e=>e.editStatus==='result_uncertain');await assert.rejects(run,e=>e.editStatus==='result_uncertain');assert.equal(submissions.length,2);assert.deepEqual(submissions[0],submissions[1]);
  const body=submissions[0].body;assert.equal(body.images.length,2);assert.match(body.prompt,/内容来源锁定/);assert.match(body.prompt,/灰度布局示意/);const actual=Buffer.from(body.images[1].data_base64,'base64');assert.equal(actual.equals(reference),false);const raw=await sharp(actual).removeAlpha().raw().toBuffer();for(let i=0;i<raw.length;i+=3)assert.ok(raw[i]===raw[i+1]&&raw[i+1]===raw[i+2]);
});

test('user references reach a single edit, persist through restart, and cannot be removed during review',async t=>{
  const f=await fixture(t),route='/api/ad-resources/batches/batch/items/required/ai-edit',reference=await sharp({create:{width:90,height:160,channels:3,background:'#90aabb'}}).png().toBuffer();
  const upload=Readable.from([reference]);upload.method='POST';let uploaded;await f.handle(upload,{writeHead(status){assert.equal(status,201)},end(value){uploaded=JSON.parse(String(value))}},new URL(route+'/references?name=构图参考.png','http://localhost'));
  const ref=uploaded.references[0];assert.equal((await request(f.handle,'GET',route+'/references')).body.references[0].id,ref.id);
  const before=await f.get();await f.submit('required','参考图1的上下衔接方式，修复背景接缝',{reviewBeforeApply:true,referenceIds:[ref.id]});const ready=await f.poll('required');assert.equal(ready.editJob.status,'awaiting_review');assert.equal(f.calls.length,1);
  assert.equal(f.calls[0].referenceBuffers.length,1);assert.equal((await sharp(f.calls[0].referenceBuffers[0]).metadata()).height,160);assert.equal(ready.editJob.referenceImages[0].id,ref.id);
  assert.deepEqual((await f.get()).items.required.versions,before.items.required.versions);assert.deepEqual((await f.get()).items.required.draft,before.items.required.draft);
  await assert.rejects(()=>request(f.handle,'DELETE',route+'/references/'+ref.id),/先采用或放弃/);
  const restarted=await f.makeHandle();assert.equal((await request(restarted,'GET',route+'/references')).body.references[0].id,ref.id);
  await request(restarted,'POST',route+'/discard',{candidateId:ready.candidate.id});await request(restarted,'DELETE',route+'/references/'+ref.id);assert.deepEqual((await request(restarted,'GET',route+'/references')).body.references,[]);
  const persisted=(await request(restarted,'GET','/api/ad-resources')).body.batches[0];assert.equal(persisted.aiEditReferenceAssets[0].id,ref.id,'Receipt must retain the exact file even after selection removal');
  await assert.rejects(()=>request(restarted,'POST',route,{requestId:'invalid-reference-request',prompt:'修复接缝',expectedVersion:1,draft:before.items.required.draft,referenceIds:[ref.id]}),/已移除/);assert.equal(f.calls.length,1);
});

test('user references follow current/original inputs in order; frozen requests remain idempotent',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'ad-ai-user-provider-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));await fs.mkdir(path.join(root,'config'));await fs.writeFile(path.join(root,'config/ai-huabu.json'),JSON.stringify({apiRoot:'https://canvas.test/api',token:'test-placeholder'}));
  const image=await sharp({create:{width:800,height:800,channels:3,background:'#345678'}}).png().toBuffer(),original=Buffer.from('original-test-image'),refs=[Buffer.from('user-reference-1'),Buffer.from('user-reference-2')],submissions=[];
  const fake=async(url,init={})=>{if(url.endsWith('/RH_ComfyUI/models/image'))return Response.json({models:[{name:'banana_pro',available:true,channels:[{name:'gemini',available:true}]}]});if(url.endsWith('/canvases'))return Response.json({status:0,data:{id:10}});if(url.endsWith('/generate')){submissions.push({body:JSON.parse(init.body),key:init.headers['Idempotency-Key']});return Response.json({status:0,data:{job_id:'existing-job'}});}if(url.endsWith('/raw'))return new Response(image);return Response.json({status:0,data:{status:'done'}});};
  for(const hasOriginal of [true,false]){
    const job={id:'same-id',project:'测试'},run=()=>generateAdAiEdit({root,sourceBuffer:image,originalReferenceBuffer:hasOriginal?original:null,referenceBuffers:refs,spec:{...cleanSpec,width:800,height:800},instruction:'参考图1的衔接方式',job,onUpdate:async values=>Object.assign(job,values),fetchImpl:fake,pollIntervalMs:1});
    await run();const submitted=submissions.at(-1),offset=hasOriginal?2:1;assert.equal(submitted.body.images.length,offset+2);
    if(hasOriginal)assert.ok(Buffer.from(submitted.body.images[1].data_base64,'base64').equals(original));
    for(let i=0;i<2;i++){assert.ok(Buffer.from(submitted.body.images[offset+i].data_base64,'base64').equals(refs[i]));assert.ok(submitted.body.prompt.includes(`参考图${i+1}对应输入图${offset+i+1}`));}
    assert.match(submitted.body.prompt,/参考图不是色彩基准/);assert.match(submitted.body.prompt,/不要把参考图整张替换/);const count=submissions.length;await run();assert.equal(submissions.length,count);
  }
});

test('an unavailable native Nano route fails before submitting a paid request',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'ad-ai-native-unavailable-'));t.after(()=>fs.rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:30}));
  await fs.mkdir(path.join(root,'config'));await fs.writeFile(path.join(root,'config/ai-huabu.json'),JSON.stringify({apiRoot:'https://canvas.test/api',token:'test-only-placeholder'}));
  const calls=[];
  await assert.rejects(()=>generateAdAiEdit({root,sourceBuffer:Buffer.from('unused'),spec,instruction:'重新排版',job:{id:'unavailable-route'},onUpdate:async()=>{},fetchImpl:async(url,init)=>{
    calls.push({url,method:init?.method||'GET'});
    return Response.json({models:[{name:'banana_pro',available:true,channels:[{name:'aifoundation',available:true,vendor_model:'NBP'}]}]});
  }}),/原生改图通道暂不可用/);
  assert.deepEqual(calls,[{url:'https://canvas.test/api/RH_ComfyUI/models/image',method:'GET'}]);
});

test('selected GPT model persists with the candidate; invalid model names never submit',async t=>{
  const f=await fixture(t),before=await f.get();
  await assert.rejects(()=>f.submit('required','人物放大一点',{model:'unknown-model'}),/有效的改图模型/);
  assert.deepEqual(await f.get(),before);assert.equal(f.calls.length,0);
  await f.submit('required','人物放大一点',{model:'gpt-image-2',reviewBeforeApply:true});
  const ready=await f.poll('required');assert.equal(ready.editJob.status,'awaiting_review');assert.equal(ready.editJob.model,'gpt-image-2');assert.equal(f.calls[0].job.model,'gpt-image-2');
  const restarted=await f.makeHandle();const shown=(await request(restarted,'GET','/api/ad-resources/batches/batch/items/required/ai-edit')).body;assert.equal(shown.editJob.model,'gpt-image-2');assert.equal(f.calls.length,1);
});

test('GPT selection uses the configured canvas image route and resumes the same provider result',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'ad-gpt-edit-provider-'));t.after(()=>fs.rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:30}));
  await fs.mkdir(path.join(root,'config'));await fs.writeFile(path.join(root,'config','ai-huabu.json'),JSON.stringify({apiRoot:'https://canvas.test/api',token:'test-only-placeholder'}));
  const art=await sharp({create:{width:800,height:800,channels:3,background:'#345678'}}).png().toBuffer(),job={id:'gpt-selection',model:'gpt-image-2'},submissions=[];
  const fake=async(url,init={})=>{
    if(url.endsWith('/models/image'))return Response.json({models:[{name:'gpt-image-2',available:true,channels:[{name:'openai',available:true}]}]});
    if(url.endsWith('/canvases'))return Response.json({status:0,data:{id:9}});
    if(url.endsWith('/generate')){submissions.push({body:JSON.parse(init.body),key:init.headers['Idempotency-Key']});return Response.json({status:0,data:{job_id:'same-gpt-image'}});}
    if(url.endsWith('/raw'))return new Response(art);
    return Response.json({status:0,data:{status:'done'}});
  };
  const run=()=>generateAdAiEdit({root,sourceBuffer:art,spec:{...spec,width:800,height:800},instruction:'人物放大一点',job,onUpdate:async value=>Object.assign(job,value),fetchImpl:fake,pollIntervalMs:1});
  await run();await run();assert.equal(submissions.length,1);assert.equal(submissions[0].body.model,'gpt-image-2');assert.equal(submissions[0].body.channel,'openai');assert.equal(submissions[0].body.output_format,'png');assert.equal(submissions[0].body.images.length,1);assert.equal(job.providerJobId,'same-gpt-image');
});

test('provider submits current image first, original reference second and resumes without another generation',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'ad-ai-original-provider-'));t.after(()=>fs.rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:30}));
  await fs.mkdir(path.join(root,'config'));await fs.writeFile(path.join(root,'config/ai-huabu.json'),JSON.stringify({apiRoot:'https://canvas.test/api',token:'test-only-placeholder'}));
  const image=await sharp({create:{width:800,height:800,channels:3,background:'#456789'}}).png().toBuffer(),original=await sharp({create:{width:1280,height:720,channels:3,background:'#edccaa'}}).png().toBuffer(),job={id:'reference-job'},submissions=[];
  const fake=async(url,init={})=>{
    if(url.endsWith('/RH_ComfyUI/models/image'))return Response.json({models:[{name:'banana_pro',available:true,channels:[{name:'gemini',available:true}]}]});
    if(url.endsWith('/canvases'))return Response.json({status:0,data:{id:10}});
    if(url.endsWith('/generate')){submissions.push(JSON.parse(init.body));return Response.json({status:0,data:{job_id:'reference-provider'}})}
    if(url.endsWith('/raw'))return new Response(image);
    return Response.json({status:0,data:{status:'done'}});
  };
  const run=()=>generateAdAiEdit({root,sourceBuffer:image,originalReferenceBuffer:original,spec:{...cleanSpec,width:800,height:800},instruction:'参考原图补回“沈眉庄”',job,onUpdate:async v=>Object.assign(job,v),fetchImpl:fake,pollIntervalMs:1});
  await run();await run();assert.equal(submissions.length,1);assert.equal(submissions[0].images.length,2);
  assert.equal((await sharp(Buffer.from(submissions[0].images[0].data_base64,'base64')).metadata()).width,800);
  assert.ok(Buffer.from(submissions[0].images[1].data_base64,'base64').equals(original));
  assert.match(submissions[0].prompt,/图2是同一素材的原始参考图/);
});

test('distortion feedback rebuilds geometry while ordinary size and style adjustments remain local',()=>{
  for(const prompt of ['横改竖后画面被拉伸了，参考横版原图修复','房子被压窄变形了','恢复原图的人物比例','房屋太窄，请纠正比例']){
    assert.equal(adAiProportionRepair(prompt),true,prompt);assert.equal(adAiEditMode(prompt),'recompose');
  }
  for(const prompt of ['人物放大一点，画风不变','把画面向下移一点','参考图1的上下衔接','人物下移一点，不要拉伸','人物放大20%，不要改变原图比例'])assert.equal(adAiEditMode(prompt),'local');
  const prompt=buildAdAiProportionPrompt({instruction:'恢复原图比例',spec:{width:1080,height:1920},referenceCount:2});
  for(const rule of ['未经尺寸重构的设计师原画','图1已经换成原始素材','横纵相同比例','相连的房屋、楼层、管道与人物','输出必须无品牌 Logo','不是本次模型输入编号'])assert.ok(prompt.includes(rule));
  assert.doesNotMatch(prompt,/只编辑图1，保持图1的尺寸和人物/);
});

test('proportion repair follows its own clean PSD composite rather than a branded root or unrelated upload',()=>{
  const root={id:'root',role:'visual',sourceFormat:'PSD',width:1672,height:941,hasEmbeddedLogo:true};
  const clean={id:'clean',role:'visual',sourceFormat:'PSD',width:1672,height:941,hasEmbeddedLogo:false,derivedFrom:'root'};
  const current={id:'portrait',role:'visual',nanoSourceAssetId:'clean',toneReferenceAssetId:'root'};
  const batch={assets:[{...clean,id:'unrelated',derivedFrom:'other'},root,clean,current]};
  assert.equal(adAiOriginalReference(batch,current,'画面被拉伸了'),clean);
  assert.equal(adAiOriginalReference(batch,current,'参考原图补回文字'),clean);
  assert.equal(adAiOriginalReference({assets:[root,current]},current,'恢复正常比例'),null,'never borrow an unrelated original when lineage is broken');
});

test('both image models receive the uncropped original first for proportion repair and resume the same job',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'ad-proportion-provider-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  await fs.mkdir(path.join(root,'config'));await fs.writeFile(path.join(root,'config/ai-huabu.json'),JSON.stringify({apiRoot:'https://canvas.test/api',token:'test-placeholder'}));
  const source=await sharp({create:{width:180,height:320,channels:3,background:'#ff0000'}}).png().toBuffer();
  const original=await sharp({create:{width:1672,height:941,channels:3,background:'#123456'}}).png().toBuffer();
  for(const model of ['banana_pro','gpt-image-2']){
    const submissions=[],job={id:'repair-'+model,model,inputMethod:AD_AI_PROPORTION_METHOD,referenceInputMethod:'layout-guide-v1'};
    const fake=async(url,init={})=>{
      if(url.endsWith('/models/image'))return Response.json({models:[{name:model,available:true,channels:[{name:model==='banana_pro'?'gemini':'gpt-route',available:true}]}]});
      if(url.endsWith('/canvases'))return Response.json({status:0,data:{id:1}});
      if(url.endsWith('/generate')){submissions.push({body:JSON.parse(init.body),key:init.headers['Idempotency-Key']});return Response.json({status:0,data:{job_id:'paid-repair'}});}
      if(url.endsWith('/raw'))return new Response(source);
      return Response.json({status:0,data:{status:'done'}});
    };
    const run=()=>generateAdAiEdit({root,sourceBuffer:source,originalReferenceBuffer:original,referenceBuffers:[source],spec:{width:1080,height:1920},instruction:'竖稿拉伸了，按横版原图恢复比例',job,onUpdate:async v=>Object.assign(job,v),fetchImpl:fake,pollIntervalMs:1});
    await run();await run();assert.equal(submissions.length,1);
    const body=submissions[0].body,first=Buffer.from(body.images[0].data_base64,'base64'),meta=await sharp(first).metadata();
    assert.equal(meta.width,1672);assert.equal(meta.height,941);assert.equal(body.ratio,'9:16');assert.equal(body.images.length,2);
    assert.deepEqual(await sharp(first).raw().toBuffer(),await sharp(original).raw().toBuffer());
    assert.equal(Buffer.from(body.images[1].data_base64,'base64').equals(source),false,'a screenshot stays a coarse layout guide, never the main artwork');
    assert.match(body.prompt,/恢复原图比例后重新适配画幅/);assert.ok(submissions[0].key);
  }
});

test('single proportion repair anchors the original and retains a failed redraw without changing versions',async t=>{
  const f=await fixture(t,input=>input.sourceBuffer),jobs=JSON.parse(await fs.readFile(path.join(f.root,'ad-resources-jobs.json'),'utf8'));
  jobs[0].assets.push({id:'original',role:'visual',name:'原图.png',width:640,height:400,url:'/storage/ad-resources-batch/asset/art.png'});
  jobs[0].assets.find(a=>a.id==='art').nanoSourceAssetId='original';await fs.writeFile(path.join(f.root,'ad-resources-jobs.json'),JSON.stringify(jobs));
  const handle=await f.makeHandle(),route='/api/ad-resources/batches/batch/items/required/ai-edit';
  await request(handle,'POST',route,{requestId:'proportion-repair-single',prompt:'横改竖后拉伸了，请恢复原图比例',expectedVersion:1,draft,reviewBeforeApply:true});
  const blocked=await f.poll('required',handle);assert.equal(blocked.editJob.status,'needs_revision');assert.match(blocked.editJob.error,/未明显纠正画面比例/);assert.equal(blocked.candidate,undefined);
  assert.equal(f.calls.length,1);assert.equal(f.calls[0].job.inputMethod,AD_AI_PROPORTION_METHOD);assert.equal(f.calls[0].job.originalReferenceAssetId,'original');assert.equal(f.calls[0].job.plan.retouch,undefined);
  const after=(await request(handle,'GET','/api/ad-resources')).body.batches[0];assert.deepEqual(after.items.required.draft,jobs[0].items.required.draft);assert.deepEqual(after.items.required.versions,jobs[0].items.required.versions);assert.equal(after.items.required.aiEditJob.rawReady,true);
});
