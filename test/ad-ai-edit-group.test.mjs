import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Readable} from 'node:stream';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {createAdResourcesHandler,renderAdJpg} from '../lib/ad-resources-server.mjs';
import {adAiSameTypeSpecs,adAiTypeLabel,adAiDefaultScope} from '../public/ad-ai-scope.js';

const specs=[
 {id:'large',width:180,height:320,logo:'required',platform:'广点通'},
 {id:'clean',width:90,height:160,logo:'forbidden',platform:'广点通'},
 {id:'small',width:90,height:160,logo:'required',platform:'头条搜索'},
 {id:'square',width:160,height:160,logo:'required',platform:'头条搜索'},
 {id:'protected',width:90,height:160,logo:'forbidden',safeInsetX:10,platform:'测试'},
].map((s,i)=>({format:'JPG',number:i+1,name:s.platform,maxBytes:300*1024,...s}));
const request=async(handle,method,url,body)=>{
 const req=Readable.from(body?[Buffer.from(JSON.stringify(body))]:[]);req.method=method;
 let status,result;await handle(req,{writeHead(s){status=s},end(v){result=v}},new URL(url,'http://localhost'));
 return {status,body:JSON.parse(String(result))};
};
async function fixture(t,generate){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'ad-ai-group-')),storageDir=path.join(root,'storage'),folder=path.join(storageDir,'ad-resources-batch');
 t.after(()=>fs.rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:30}));
 await fs.mkdir(path.join(folder,'asset'),{recursive:true});await fs.mkdir(path.join(folder,'candidate'));
 const art=await sharp({create:{width:180,height:320,channels:3,background:'#234567'}}).png().toBuffer(),logo=await sharp({create:{width:80,height:40,channels:4,background:'#ee1111'}}).png().toBuffer();
 const changed=await sharp({create:{width:360,height:640,channels:3,background:'#376d84'}}).png().toBuffer();
 await fs.writeFile(path.join(folder,'asset/art.png'),art);await fs.writeFile(path.join(folder,'asset/logo.png'),logo);
 const sheet={sourceSha256:'group-sheet',specs:structuredClone(specs)},batch={id:'batch',project:'同类测试',sourceSha256:'group-sheet',assets:[{id:'art',role:'visual',name:'纯图.png',width:180,height:320,logoFree:true,hasEmbeddedLogo:false,url:'/storage/ad-resources-batch/asset/art.png'},{id:'logo',role:'logo',name:'Logo.png',width:80,height:40,url:'/storage/ad-resources-batch/asset/logo.png'}],items:{}};
 for(const spec of sheet.specs){
  const draft={sourceAssetId:'art',logoAssetId:spec.logo==='required'?'logo':'',zoom:spec.id==='small'?1.2:1,offsetX:0,offsetY:0,logoScale:spec.id==='small'?.25:.2,logoX:spec.id==='small'?.55:.05,logoY:.05};
  const file=spec.id+'-before.jpg';await fs.writeFile(path.join(folder,'candidate',file),await renderAdJpg(art,spec,draft,spec.logo==='required'?logo:null));
  batch.items[spec.id]={draft,versions:[{number:1,storageName:file,url:`/storage/ad-resources-batch/candidate/${file}`,review:{contentChecked:true,logoChecked:true,safeAreaChecked:true}}]};
 }
 const jobsFile=path.join(root,'ad-resources-jobs.json');await fs.writeFile(jobsFile,JSON.stringify([batch]));const calls=[];
 const makeHandle=()=>createAdResourcesHandler({root,runtimeDir:root,storageDir,catalogProvider:async()=>sheet,nanoGenerate:async()=>assert.fail('must not run automatic layouts'),aiEditGenerate:async input=>{calls.push(input);return generate?generate(input,changed):changed}});
 const handle=await makeHandle(),get=async(h=handle)=>(await request(h,'GET','/api/ad-resources')).body.batches[0];
 const route=id=>`/api/ad-resources/batches/batch/items/${id}/ai-edit`;
 const payload=(b,id='small',extra={})=>({scope:'same-ratio',requestId:'group-request-123',prompt:'把人物居中',expectedVersion:b.items[id].versions.at(-1).number,draft:{...b.items[id].draft},targets:adAiSameTypeSpecs(sheet.specs.find(s=>s.id===id),sheet.specs).map(s=>({specId:s.id,expectedVersion:b.items[s.id].versions.at(-1).number,draft:{...b.items[s.id].draft}})),...extra});
 const submit=async(id='small',extra={},h=handle)=>request(h,'POST',route(id),payload(await get(h),id,extra));
 const poll=async(id='small',h=handle)=>{const end=Date.now()+10000;while(Date.now()<end){const result=(await request(h,'GET',route(id))).body;if(!result.pending)return result;await new Promise(r=>setTimeout(r,10))}assert.fail('group did not finish')};
 return {root,storageDir,folder,sheet,batch,art,changed,logo,jobsFile,makeHandle,handle,get,route,payload,submit,poll,calls};
}

test('legacy reference-copy group candidates are withdrawn on restart and no member can adopt them',async t=>{
 const f=await fixture(t),reference=await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="180" height="320"><rect width="180" height="320" fill="#fff2de"/><circle cx="130" cy="90" r="50" fill="#88172b"/><rect x="10" y="140" width="50" height="160" fill="#123429"/></svg>')).png().toBuffer(),route=f.route('small'),req=Readable.from([reference]);req.method='POST';let refs;await f.handle(req,{writeHead(){},end(v){refs=JSON.parse(String(v)).references}},new URL(route+'/references','http://localhost'));const before=await f.get();
 await f.submit('small',{reviewBeforeApply:true,referenceIds:[refs[0].id],prompt:'参考图1的衔接方式'});const ready=await f.poll();assert.equal(ready.editJob.status,'awaiting_review');await fs.writeFile(path.join(f.folder,'ai-edit',ready.candidate.id,'result.png'),reference);
 const restarted=await f.makeHandle(),blocked=(await request(restarted,'GET',route)).body;assert.equal(blocked.editJob.status,'needs_revision');assert.equal(f.calls.length,1);const after=await f.get(restarted);for(const id of ['large','small','clean']){assert.equal(after.items[id].aiEditJob.status,'needs_revision');assert.equal(after.items[id].aiEditJob.candidate,undefined);assert.deepEqual(after.items[id].draft,before.items[id].draft);assert.deepEqual(after.items[id].versions,before.items[id].versions);}
 await assert.rejects(()=>request(restarted,'POST',f.route('clean')+'/accept',{candidateId:ready.candidate.id}),/没有可采用/);assert.equal(f.calls.length,1);
});

test('same-ratio modifications submit the selected references once and preserve every current draft until adoption',async t=>{
 const f=await fixture(t),reference=await sharp({create:{width:75,height:130,channels:3,background:'#abcdef'}}).png().toBuffer(),route=f.route('small');
 const req=Readable.from([reference]);req.method='POST';let refs;await f.handle(req,{writeHead(status){assert.equal(status,201)},end(value){refs=JSON.parse(String(value)).references}},new URL(route+'/references?name=衔接参考.png','http://localhost'));
 const before=await f.get();await f.submit('small',{reviewBeforeApply:true,referenceIds:[refs[0].id],prompt:'参考图1的衔接方式，把上下衔接自然'});const ready=await f.poll();assert.equal(ready.editJob.status,'awaiting_review');assert.equal(f.calls.length,1);assert.equal(f.calls[0].referenceBuffers.length,1);assert.equal((await sharp(f.calls[0].referenceBuffers[0]).metadata()).width,75);
 for(const result of ready.groupJobs)assert.equal(result.editJob.referenceImages[0].id,refs[0].id);
 const after=await f.get();for(const id of ['large','clean','small']){assert.deepEqual(after.items[id].draft,before.items[id].draft);assert.deepEqual(after.items[id].versions,before.items[id].versions);}
 await request(f.handle,'POST',route+'/accept',{candidateId:ready.candidate.id});assert.equal(f.calls.length,1);const adopted=await f.get();for(const id of ['large','clean','small'])assert.equal(adopted.items[id].versions.length,2);
});

test('group model selection is shared by every candidate and invalid models never begin a group',async t=>{
 const f=await fixture(t),before=await f.get();
 await assert.rejects(()=>f.submit('small',{model:'invalid-model'}),/有效的改图模型/);assert.deepEqual(await f.get(),before);assert.equal(f.calls.length,0);
 await f.submit('small',{model:'gpt-image-2',reviewBeforeApply:true});const ready=await f.poll();assert.equal(ready.editJob.status,'awaiting_review');assert.equal(f.calls.length,1);assert.equal(f.calls[0].job.model,'gpt-image-2');
 for(const child of ready.groupJobs)assert.equal(child.editJob.model,'gpt-image-2');
});

test('reviewed group candidates are staged together and adoption from a sibling creates only lightweight snapshots',async t=>{
 const f=await fixture(t),before=await f.get();await f.submit('small',{reviewBeforeApply:true});const ready=await f.poll();assert.equal(ready.editJob.status,'awaiting_review');assert.equal(ready.groupJobs.length,3);
 let batch=await f.get();for(const id of ['large','clean','small']){assert.deepEqual(batch.items[id].draft,before.items[id].draft);assert.deepEqual(batch.items[id].versions,before.items[id].versions);}
 const restarted=await f.makeHandle(),accepted=(await request(restarted,'POST',f.route('clean')+'/accept',{candidateId:ready.candidate.id})).body;assert.equal(accepted.editJob.status,'completed');
 await request(restarted,'POST',f.route('small')+'/accept',{candidateId:ready.candidate.id});batch=await f.get(restarted);
 for(const id of ['large','clean','small']){assert.equal(batch.items[id].versions.length,2);assert.equal(batch.items[id].versions[1].kind,'composition');assert.equal(batch.items[id].versions[1].storageName,undefined);assert.equal(batch.items[id].draftDirty,false);}
 assert.deepEqual(batch.items.square,before.items.square);assert.equal(f.calls.length,1);
});

test('discarding group candidates preserves all current versions; grouped Logo adjustments create none',async t=>{
 const f=await fixture(t),before=await f.get();await f.submit('small',{reviewBeforeApply:true});const ready=await f.poll();await request(f.handle,'POST',f.route('clean')+'/discard',{candidateId:ready.candidate.id});
 let batch=await f.get();for(const id of ['large','clean','small']){assert.deepEqual(batch.items[id].versions,before.items[id].versions);assert.deepEqual(batch.items[id].draft,before.items[id].draft);assert.equal(batch.items[id].aiEditJob.status,'discarded');}
 const local=await f.submit('clean',{reviewBeforeApply:true,requestId:'group-logo-working',prompt:'Logo 放大20%'});assert.equal(local.body.localDraft,true);batch=await f.get();
 for(const id of ['large','small']){assert.equal(batch.items[id].draft.logoScale,before.items[id].draft.logoScale*1.2);assert.equal(batch.items[id].versions.length,1);assert.equal(batch.items[id].draftDirty,true);}assert.equal(f.calls.length,1);
});

test('AI picture edits default to the full same-ratio group, while an explicit choice or pending job keeps its scope',()=>{
 assert.equal(adAiDefaultScope(specs[0],specs),'same-ratio');assert.equal(adAiDefaultScope(specs[3],specs),'current');assert.equal(adAiDefaultScope(specs[0],specs,{storedScope:'current'}),'current');
 assert.equal(adAiDefaultScope(specs[0],specs,{job:{status:'awaiting_review'}}),'current');assert.equal(adAiDefaultScope(specs[0],specs,{job:{status:'awaiting_review',groupId:'group'}}),'same-ratio');
});

test('a single paid review result can become linked candidates using the same artwork and each own Logo, then adopted atomically',async t=>{
 const f=await fixture(t),initial=await f.get(),requestId='single-to-shared-candidate';
 await request(f.handle,'POST',f.route('small'),{requestId,prompt:'去掉左下角的印章',expectedVersion:1,draft:initial.items.small.draft,reviewBeforeApply:true});
 const ready=await f.poll('small');assert.equal(ready.editJob.status,'awaiting_review');assert.equal(f.calls.length,1);
 const before=await f.get(),assetsBefore=before.assets.length,body={candidateId:ready.candidate.id};
 const shared=await Promise.all([request(f.handle,'POST',f.route('small')+'/synchronize',body),request(f.handle,'POST',f.route('small')+'/synchronize',body)]);
 assert.equal(shared[0].body.groupJobs.length,3);assert.equal(shared[0].body.editJob.groupId,ready.editJob.id);assert.equal(f.calls.length,1);
 let batch=await f.get();assert.equal(batch.assets.length,assetsBefore);assert.equal(batch.items.small.aiEditJob.requestId,requestId);const sourceId=ready.candidate.draft.sourceAssetId;
 for(const id of ['large','clean','small']){const item=batch.items[id];assert.deepEqual(item.draft,before.items[id].draft);assert.deepEqual(item.versions,before.items[id].versions);assert.equal(item.aiEditJob.candidate.draft.sourceAssetId,sourceId);assert.equal(item.aiEditJob.candidate.draft.logoAssetId,before.items[id].draft.logoAssetId);assert.equal(item.aiEditJob.candidate.draft.logoX,before.items[id].draft.logoX);const candidate=await fs.readFile(path.join(f.storageDir,item.aiEditJob.candidate.url.replace('/storage/','')));assert.equal((await sharp(candidate).metadata()).width,f.sheet.specs.find(s=>s.id===id).width);}
 assert.deepEqual(batch.items.square,before.items.square);assert.deepEqual(batch.items.protected,before.items.protected);
 const restarted=await f.makeHandle();await request(restarted,'POST',f.route('clean')+'/synchronize',body);assert.equal((await f.poll('clean',restarted)).groupJobs.length,3);await request(restarted,'POST',f.route('large')+'/accept',body);batch=await f.get(restarted);
 for(const id of ['large','clean','small']){assert.equal(batch.items[id].versions.length,2);assert.equal(batch.items[id].versions.at(-1).kind,'composition');assert.equal(batch.items[id].draft.sourceAssetId,sourceId);assert.equal(batch.items[id].draft.logoAssetId,before.items[id].draft.logoAssetId);}
 assert.equal(f.calls.length,1);await assert.rejects(()=>fs.stat(path.join(f.folder,'ai-edit',ready.candidate.id,'candidate.jpg')),/ENOENT/);
});

test('sharing refuses to replace an unresolved sibling result and dropping shared candidates changes no historical version',async t=>{
 const f=await fixture(t),before=await f.get();await request(f.handle,'POST',f.route('small'),{requestId:'single-share-guard',prompt:'去掉印章',expectedVersion:1,draft:before.items.small.draft,reviewBeforeApply:true});const ready=await f.poll('small'),jobs=await f.get();
 jobs.items.large.aiEditJob={id:'other-candidate',status:'awaiting_review'};await fs.writeFile(f.jobsFile,JSON.stringify([jobs]));let handler=await f.makeHandle(),snapshot=await fs.readFile(f.jobsFile,'utf8');
 await assert.rejects(()=>request(handler,'POST',f.route('small')+'/synchronize',{candidateId:ready.candidate.id}),/其它修改待处理/);assert.equal(await fs.readFile(f.jobsFile,'utf8'),snapshot);
 delete jobs.items.large.aiEditJob;await fs.writeFile(f.jobsFile,JSON.stringify([jobs]));handler=await f.makeHandle();await request(handler,'POST',f.route('small')+'/synchronize',{candidateId:ready.candidate.id});await request(handler,'POST',f.route('clean')+'/discard',{candidateId:ready.candidate.id});
 const after=await f.get(handler);for(const id of ['large','clean','small']){assert.deepEqual(after.items[id].draft,before.items[id].draft);assert.deepEqual(after.items[id].versions,before.items[id].versions);assert.equal(after.items[id].aiEditJob.status,'discarded');}assert.equal(f.calls.length,1);
});

test('an already adopted single result updates its peers, preserves Logos and the original approved version, and deduplicates repeats',async t=>{
 const f=await fixture(t),initial=await f.get();await request(f.handle,'POST',f.route('small'),{requestId:'approved-single-share',prompt:'去掉印章',expectedVersion:1,draft:initial.items.small.draft,reviewBeforeApply:true});const ready=await f.poll('small');await request(f.handle,'POST',f.route('small')+'/accept',{candidateId:ready.candidate.id});
 const before=await f.get(),requestBody={candidateId:ready.candidate.id},output=(await request(f.handle,'POST',f.route('small')+'/synchronize',requestBody)).body;
 assert.deepEqual(output.sharedSpecIds,['large','clean']);const after=await f.get();assert.deepEqual(after.items.small,before.items.small);assert.deepEqual(after.items.square,before.items.square);
 for(const id of ['large','clean']){assert.equal(after.items[id].draft.sourceAssetId,before.items.small.draft.sourceAssetId);assert.equal(after.items[id].draft.logoAssetId,before.items[id].draft.logoAssetId);assert.equal(after.items[id].draft.logoX,before.items[id].draft.logoX);assert.equal(after.items[id].versions.length,2);assert.equal(after.items[id].versions[1].kind,'composition');assert.equal(after.items[id].versions[1].aiEdit.sharedFromJobId,ready.candidate.id);}
 const repeated=(await request(f.handle,'POST',f.route('small')+'/synchronize',requestBody)).body;assert.deepEqual(repeated.sharedSpecIds,[]);assert.deepEqual(await f.get(),after);assert.equal(f.calls.length,1);
});

test('same-type grouping crosses platforms and Logo requirements but excludes different ratios and protected zones',()=>{
 assert.deepEqual(adAiSameTypeSpecs(specs[0],specs).map(s=>s.id),['large','clean','small']);
 assert.equal(adAiTypeLabel(specs[0]),'竖版 9:16');assert.equal(adAiTypeLabel(specs[3]),'方版 1:1');
 assert.equal(adAiSameTypeSpecs({...specs[0],format:'GIF'},specs).length,0);
});

test('one paid group edit locks all members, generates at largest size, keeps own Logos and allows undo from a sibling',async t=>{
 let release,entered;const gate=new Promise(r=>release=r),called=new Promise(r=>entered=r);
 const f=await fixture(t,async(input,changed)=>{await input.onUpdate({status:'processing',providerJobId:'one-paid-group'});entered();await gate;return changed});
 const before=await f.get(),submitted=await f.submit('small',{prompt:'把人物居中，Logo 放大20%'});assert.equal(submitted.status,202);assert.equal(submitted.body.groupJobs.length,3);await called;
 assert.equal(f.calls.length,1);assert.equal(f.calls[0].spec.id,'large');assert.equal(f.calls[0].instruction,'把人物居中');assert.equal(f.calls[0].embeddedLogo,false);
 const modelInput=await sharp(f.calls[0].sourceBuffer).metadata();assert.equal(modelInput.width,180);assert.equal(modelInput.height,320);
 await f.submit('small',{prompt:'把人物居中，Logo 放大20%'});assert.equal(f.calls.length,1);
 for(const id of ['large','clean','small'])await assert.rejects(()=>request(f.handle,'PUT',`/api/ad-resources/batches/batch/items/${id}/draft`,before.items[id].draft),/正在 AI 修改/);
 release();const result=await f.poll();assert.equal(result.editJob.status,'completed');assert.equal(result.groupJobs.length,3);
 const after=await f.get();assert.deepEqual(after.items.square,before.items.square);assert.deepEqual(after.items.protected,before.items.protected);assert.equal(after.assets.length,before.assets.length+1);
 const sourceIds=new Set();
 for(const id of ['large','clean','small']){
  const state=after.items[id],spec=f.sheet.specs.find(s=>s.id===id);sourceIds.add(state.draft.sourceAssetId);assert.equal(state.versions.length,2);assert.deepEqual(state.versions[0],before.items[id].versions[0]);assert.equal(state.versions[1].review.contentChecked,false);
  const image=await fs.readFile(path.join(f.folder,'candidate',state.versions[1].storageName)),meta=await sharp(image).metadata();assert.equal(meta.width,spec.width);assert.equal(meta.height,spec.height);assert.ok(image.length<spec.maxBytes);
  const x=Math.round(state.draft.logoX*spec.width+5),y=Math.round(state.draft.logoY*spec.height+3),pixel=await sharp(image).extract({left:x,top:y,width:1,height:1}).raw().toBuffer();
  if(id==='clean'){assert.equal(state.draft.logoAssetId,'');assert.ok(pixel[0]<pixel[2]);}else{assert.equal(state.draft.logoScale,before.items[id].draft.logoScale*1.2);assert.equal(state.draft.logoX,before.items[id].draft.logoX);assert.ok(pixel[0]>pixel[2]*2);}
 }
 assert.equal(sourceIds.size,1);
 const undone=await request(f.handle,'POST',f.route('clean')+'/undo',{expectedVersion:2});assert.equal(undone.body.editJob.status,'reverted');
 const restored=await f.get();for(const id of ['large','clean','small']){assert.deepEqual(restored.items[id].draft,before.items[id].draft);assert.equal(restored.items[id].versions.length,3);const latest=restored.items[id].versions.at(-1);assert.ok((await fs.readFile(path.join(f.folder,'candidate',latest.storageName))).equals(await fs.readFile(path.join(f.folder,'candidate',before.items[id].versions[0].storageName))));}
 assert.equal(f.calls.length,1);
});

test('Logo-only grouped edit works from a no-Logo member with no paid call',async t=>{
 const f=await fixture(t),before=await f.get();await f.submit('clean',{prompt:'Logo 放大20%'});assert.equal((await f.poll('clean')).editJob.status,'completed');assert.equal(f.calls.length,0);
 const after=await f.get();for(const id of ['large','small']){assert.equal(after.items[id].draft.logoScale,before.items[id].draft.logoScale*1.2);assert.equal(after.items[id].draft.sourceAssetId,'art');}assert.equal(after.items.clean.draft.logoAssetId,'');
});

test('a mixed image and Logo edit initiated from the no-Logo member still applies each rule',async t=>{
 const f=await fixture(t),before=await f.get();await f.submit('clean',{prompt:'把人物居中，Logo 放大20%'});assert.equal((await f.poll('clean')).editJob.status,'completed');assert.equal(f.calls.length,1);assert.equal(f.calls[0].instruction,'把人物居中');
 const after=await f.get();assert.equal(after.items.clean.draft.logoAssetId,'');for(const id of ['large','small'])assert.equal(after.items[id].draft.logoScale,before.items[id].draft.logoScale*1.2);
});

test('an embedded-Logo source is rejected before it can contaminate the no-Logo variants',async t=>{
 const f=await fixture(t),jobs=JSON.parse(await fs.readFile(f.jobsFile));jobs[0].assets[0].hasEmbeddedLogo=true;await fs.writeFile(f.jobsFile,JSON.stringify(jobs));const handle=await f.makeHandle();
 await assert.rejects(()=>f.submit('small',{},handle),/无 Logo 底图/);assert.equal(f.calls.length,0);
});

test('stale sibling, missing members, wrong ratio and locked sibling all reject before generation',async t=>{
 const f=await fixture(t),before=await f.get(),base=f.payload(before);
 for(const alter of [p=>{p.targets[0].expectedVersion=99},p=>{p.targets.pop()},p=>{p.targets[0].specId='square'},p=>{p.targets[0].draft.offsetX=.2}]){
  const payload=structuredClone(base);alter(payload);await assert.rejects(()=>request(f.handle,'POST',f.route('small'),payload));
 }
 assert.equal(f.calls.length,0);assert.deepEqual((await f.get()).items,before.items);
 const jobs=JSON.parse(await fs.readFile(f.jobsFile));jobs[0].items.large.aiEditJob={id:'busy',status:'result_uncertain'};await fs.writeFile(f.jobsFile,JSON.stringify(jobs));const handle=await f.makeHandle();
 await assert.rejects(()=>f.submit('small',{},handle),/正在 AI 修改/);assert.equal(f.calls.length,0);
});

test('wrong-ratio output retains all original candidates and raw result for a free resume',async t=>{
 const f=await fixture(t,()=>sharp({create:{width:100,height:100,channels:3,background:'#777'}}).png().toBuffer()),before=await f.get();
 await f.submit();const failed=await f.poll();assert.equal(failed.editJob.status,'failed');assert.equal(failed.editJob.rawReady,true);assert.equal(failed.editJob.canResume,true);
 const after=await f.get();for(const id of ['large','clean','small']){assert.deepEqual(after.items[id].versions,before.items[id].versions);assert.deepEqual(after.items[id].draft,before.items[id].draft);}
 await request(f.handle,'POST',f.route('large')+'/resume',{});await f.poll('large');assert.equal(f.calls.length,1);
});

test('unchanged overall recomposition is not committed to any group member',async t=>{
 const f=await fixture(t,input=>input.sourceBuffer),before=await f.get();await f.submit('small',{prompt:'四周留空太多，请重新排版'});assert.equal((await f.poll()).editJob.status,'needs_revision');
 const after=await f.get();for(const id of ['large','clean','small'])assert.deepEqual(after.items[id].versions,before.items[id].versions);
});

test('group distortion repair uses its clean original once and never adopts unchanged geometry',async t=>{
 const f=await fixture(t,input=>input.sourceBuffer),jobs=JSON.parse(await fs.readFile(f.jobsFile,'utf8'));
 jobs[0].assets.push({id:'original',role:'visual',width:180,height:320,hasEmbeddedLogo:false,url:'/storage/ad-resources-batch/asset/art.png'});jobs[0].assets.find(a=>a.id==='art').nanoSourceAssetId='original';
 await fs.writeFile(f.jobsFile,JSON.stringify(jobs));const handle=await f.makeHandle();
 await f.submit('small',{prompt:'整张竖版被拉伸了，请恢复原图比例',reviewBeforeApply:true},handle);const blocked=await f.poll('small',handle);
 assert.equal(blocked.editJob.status,'needs_revision');assert.match(blocked.editJob.error,/未明显纠正画面比例/);assert.equal(f.calls.length,1);assert.equal(f.calls[0].job.inputMethod,'original-proportion-v1');assert.equal(f.calls[0].job.originalReferenceAssetId,'original');
 const after=await f.get(handle);for(const id of ['large','clean','small']){assert.equal(after.items[id].aiEditJob.status,'needs_revision');assert.equal(after.items[id].aiEditJob.candidate,undefined);assert.deepEqual(after.items[id].draft,jobs[0].items[id].draft);assert.deepEqual(after.items[id].versions,jobs[0].items[id].versions);}
});

test('legacy unadopted distortion candidates are blocked on restart without another paid request',async t=>{
 const f=await fixture(t),before=await f.get();await f.submit('small',{reviewBeforeApply:true});const ready=await f.poll(),jobs=JSON.parse(await fs.readFile(f.jobsFile,'utf8')),job=jobs[0].items.small.aiEditJob;
 job.prompt=job.plan.imageInstruction='画面被拉伸了，恢复正常比例';const work=path.join(f.folder,'ai-edit',job.id);await fs.copyFile(path.join(work,'input.png'),path.join(work,'result.png'));await fs.writeFile(f.jobsFile,JSON.stringify(jobs));
 const restarted=await f.makeHandle(),blocked=await f.poll('small',restarted);assert.equal(blocked.editJob.status,'needs_revision');assert.match(blocked.editJob.error,/未明显纠正画面比例/);assert.equal(f.calls.length,1);
 const after=await f.get(restarted);for(const id of ['large','clean','small']){assert.equal(after.items[id].aiEditJob.candidate,undefined);assert.deepEqual(after.items[id].draft,before.items[id].draft);assert.deepEqual(after.items[id].versions,before.items[id].versions);}
 await assert.rejects(()=>request(restarted,'POST',f.route('clean')+'/accept',{candidateId:ready.candidate.id}),/没有可采用/);
});

test('a late validation failure publishes none of the staged group candidates',async t=>{
 const f=await fixture(t),before=await f.get();f.sheet.specs.find(s=>s.id==='small').maxBytes=1;
 await f.submit();assert.equal((await f.poll()).editJob.status,'failed');const after=await f.get();assert.equal(after.assets.length,before.assets.length);
 for(const id of ['large','clean','small']){assert.deepEqual(after.items[id].versions,before.items[id].versions);assert.deepEqual(after.items[id].draft,before.items[id].draft);}
});

test('further work on one member blocks whole-group undo without touching the others',async t=>{
 const f=await fixture(t);await f.submit();await f.poll();const after=await f.get();
 await request(f.handle,'POST','/api/ad-resources/batches/batch/items/large/render',{});
 await assert.rejects(()=>request(f.handle,'POST',f.route('small')+'/undo',{expectedVersion:2}),/已继续修改/);
 const current=await f.get();for(const id of ['clean','small']){assert.deepEqual(current.items[id].versions,after.items[id].versions);assert.deepEqual(current.items[id].draft,after.items[id].draft);}
});

test('restart resumes the parent once from persisted raw output and sibling queries do not regenerate',async t=>{
 const f=await fixture(t);await f.submit();await f.poll();let jobs;
 for(let n=0;n<100;n++){jobs=JSON.parse(await fs.readFile(f.jobsFile));if(jobs[0].items.small.versions.length===2)break;await new Promise(r=>setTimeout(r,10));}
 const parent=jobs[0].items.small.aiEditJob;
 for(const id of parent.groupSpecIds){const item=jobs[0].items[id];item.versions.pop();item.draft=parent.members.find(m=>m.specId===id).baseDraft;Object.assign(item.aiEditJob,{status:'downloading',versionNumber:undefined});}
 jobs[0].assets=jobs[0].assets.filter(a=>a.id!==parent.assetId);parent.resultReady=false;
 for(const m of parent.members){const item=jobs[0].items[m.specId],key=['sourceAssetId','logoAssetId','zoom','offsetX','offsetY','logoScale','logoX','logoY'].map(k=>item.draft[k]??null);assert.equal(createHash('sha256').update(JSON.stringify([jobs[0].sourceSha256,item.versions.at(-1)?.number||0,key])).digest('hex'),m.baseToken,JSON.stringify({member:m,current:item}));}
 await fs.writeFile(f.jobsFile,JSON.stringify(jobs));const handle=await f.makeHandle(),result=await f.poll('clean',handle);assert.equal(result.editJob.status,'completed',JSON.stringify(result));assert.equal(f.calls.length,1);
 await request(handle,'GET',f.route('large'));await request(handle,'GET',f.route('clean'));assert.equal(f.calls.length,1);const after=await f.get(handle);for(const id of parent.groupSpecIds)assert.equal(after.items[id].versions.length,2);
});
