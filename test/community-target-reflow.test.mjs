import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {randomUUID} from 'node:crypto';
import {createHash} from 'node:crypto';
import {communityMasterTemplate as master} from '../lib/community-master-workspace.mjs';
import {communityPlacements,communityTemplate} from '../lib/community-placements.mjs';
import {planLayeredCommunityTarget,renderLocalCommunityTarget,communityTargetReflowRequest,normalizeCommunityTargetReflow} from '../lib/community-target-reflow.mjs';
import {createCommunityTargetReflowJobs} from '../lib/community-target-reflow-jobs.mjs';
import {communityArtworkTargetPending} from '../public/community-artwork-state.js';
import {assertCommunityTargetSaveCurrent} from '../lib/community-target-save-guard.mjs';
import {communityExtensionProgress} from '../public/community-extension-progress.js';

const templates=communityPlacements.filter(p=>['official-cover','community-carousel','community-two','wechat-mini-cover','alipay-cover','xiaohongshu-cover'].some(s=>p.id==='community-'+s)).map(communityTemplate),map=new Map([master,...templates].map(t=>[t.id,t]));
const fixture=()=>({id:'fixture',status:'批量生成',copy:'霜降祝福',updatedAt:'before',masterTemplateId:master.id,targetTemplateIds:templates.map(t=>t.id),communityMasterApproval:{fingerprint:'approved',at:'before'},history:[],assets:[{name:'scene.png',role:'mother-candidate',materialKind:'illustration',mime:'image/png',width:1920,height:1080},{name:'title.png',role:'title',mime:'image/png',width:2427,height:962},{name:'logo.png',role:'logo',mime:'image/png',width:585,height:218}],parameters:{communityMaterialWorkflow:{version:1},assetByTemplate:{[master.id]:{background:'scene.png',title:'title.png',logo:'logo.png'}},layoutByTemplate:{[master.id]:{title:{x:141,y:295,width:925,height:367,visible:true,effects:{shadow:{enabled:true,blur:12,offsetX:6,offsetY:8}}},logo:{x:43,y:-7,width:445,height:251,visible:true},subtitle:{visible:false}}},backgroundByTemplate:{},communityArtworkByTemplate:{[templates[0].id]:{assetName:'old-whole'}}}});

test('four compatible targets are local; portrait and near square are recomposed without distorting text',()=>{
 const task=fixture(),before=structuredClone(task),plans=templates.map(t=>planLayeredCommunityTarget(task,master,t));
 assert.equal(plans.filter(p=>p.method==='local').length,4);assert.equal(plans.filter(p=>p.method==='ai').length,2);
 for(const p of plans){for(const k of ['title','logo']){const r=p.layouts[k],a=task.assets.find(a=>a.name===p.assets[k]);assert.ok(Math.abs(r.width/r.height-a.width/a.height)<.000001);assert.ok(r.x>=0&&r.y>=0&&r.x+r.width<=p.width+.01&&r.y+r.height<=p.height+.01);assert.equal(r.scaleBaseWidth,r.width);}assert.equal(p.layouts.title.effects.shadow.enabled,true);}
 const portrait=plans.find(p=>p.width===900&&p.height===1200);assert.ok(portrait.titleZone.y+portrait.titleZone.height<.35,'Title stays above the character, not over the face or bottom');
 assert.deepEqual(task,before,'Planning must not modify the confirmed master or historical targets');
});

test('an automatically displayed master Logo is bound to every target and retains its image aspect',()=>{
 const task=fixture();delete task.parameters.assetByTemplate[master.id].logo;
 task.assets.unshift({name:'source.psd',role:'logo',mime:'image/vnd.adobe.photoshop'});
 const before=structuredClone(task);
 for(const target of templates){const plan=planLayeredCommunityTarget(task,master,target);assert.equal(plan.assets.logo,'logo.png');assert.ok(Math.abs(plan.layouts.logo.width/plan.layouts.logo.height-585/218)<1e-8);}
 assert.deepEqual(task,before,'Resolving automatic selection must not alter the approved master');
 task.parameters.assetByTemplate[master.id].logo=null;
 assert.equal(planLayeredCommunityTarget(task,master,templates[0]).assets.logo,null,'Explicit removal stays removed');
 task.parameters.assetByTemplate[master.id].logo='selected-logo.png';
 assert.equal(planLayeredCommunityTarget(task,master,templates[0]).assets.logo,'selected-logo.png','Manual selection wins over automatic Logo');
 assert.equal(planLayeredCommunityTarget(task,master,{...templates[0],brandLogo:false}).assets.logo,null,'A no-Logo resource stays without Logo');
 task.parameters.layoutByTemplate[master.id].logo.visible=false;
 assert.equal(planLayeredCommunityTarget(task,master,templates[0]).layouts.logo.visible,false,'A hidden master Logo stays hidden');
});

test('recomposition prompt keeps integrated people, excludes text/Logo, and uses only the approved illustration',()=>{
 const task=fixture(),target=templates.find(t=>t.width===900&&t.height===1200),plan=planLayeredCommunityTarget(task,master,target),body=communityTargetReflowRequest({model:'gpt-image-2'},plan,Buffer.from('source'));
 assert.equal(body.ratio,'3:4');assert.equal(body.image_size,'2K');assert.equal(body.images.length,1);assert.match(body.prompt,/人物必须仍在插画中/);assert.match(body.prompt,/禁止放入人脸/);assert.match(body.prompt,/无字插画/);assert.doesNotMatch(body.prompt,/完全没有人|不画新人物|原位保留/);
 assert.equal(planLayeredCommunityTarget(task,master,templates[0],{prompt:'人物往右一点'}).method,'ai','An explicit adjustment actually reaches AI');
});

test('local images cover exact target size without black bars; native ratio correction never stretches',async()=>{
 const task=fixture(),source=await sharp({create:{width:1920,height:1080,channels:3,background:'#e8b86c'}}).png().toBuffer();
 for(const t of templates){const plan=planLayeredCommunityTarget(task,master,t);if(plan.method!=='local')continue;const buffer=await renderLocalCommunityTarget(source,master,plan),m=await sharp(buffer).metadata();assert.equal(m.width,t.width*2);assert.equal(m.height,t.height*2);const px=await sharp(buffer).extract({left:0,top:0,width:1,height:1}).raw().toBuffer();assert.deepEqual([...px],[232,184,108]);}
 const plan=planLayeredCommunityTarget(task,master,templates.find(t=>t.width===500));
 const fourByThree=await sharp({create:{width:800,height:600,channels:3,background:'#ffffff'}}).png().toBuffer();assert.equal((await sharp(await normalizeCommunityTargetReflow(fourByThree,plan)).metadata()).width,1000);
 await assert.rejects(normalizeCommunityTargetReflow(source,{...plan,width:900,height:1200}),/画幅/);
});

test('a valid native 21:9 image fits 984×334 and 977×272 by uniform crop, while unrelated ratios still reject',async()=>{
 const raw=await sharp(Buffer.from('<svg width="2100" height="900"><rect width="2100" height="900" fill="#fff"/><rect x="1900" y="200" width="30" height="500" fill="#123456"/></svg>')).png().toBuffer();
 for(const [width,height]of [[984,334],[977,272]]){
  const output=await normalizeCommunityTargetReflow(raw,{width,height}),m=await sharp(output).metadata();assert.equal(m.width,width*2);assert.equal(m.height,height*2);
  const pixel=await sharp(output).extract({left:Math.round(1915/2100*width*2),top:height,width:1,height:1}).removeAlpha().raw().toBuffer();assert.deepEqual([...pixel],[18,52,86],'right-side subject remains present after uniform center crop');
 }
 const wrong=await sharp({create:{width:1200,height:1600,channels:3,background:'#fff'}}).png().toBuffer();await assert.rejects(normalizeCommunityTargetReflow(wrong,{width:984,height:334}),/画幅/);
});

async function harness({download,submit,poll,invalidate,parallelismCheck=false}={}){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'community-reflow-')),tasksFile=path.join(dir,'tasks.json'),storageDir=path.join(dir,'storage'),task=fixture(),scene=await sharp({create:{width:1920,height:1080,channels:3,background:'#4a78b3'}}).png().toBuffer();await fs.writeFile(tasksFile,JSON.stringify([task]));
 let active=0,maxActive=0,calls=0,release;const both=new Promise(r=>release=r),requests=[];
 const manager=createCommunityTargetReflowJobs({tasksFile,storageDir,templateMap:map,jobs:new Map(),fingerprint:async()=> 'approved',confirmedSource:async()=>({buffer:scene,assetName:'scene.png'}),loadConfig:async()=>({enabled:true}),createCanvas:async()=>1,invalidate:invalidate||(()=>{}),
  submitGeneration:async(c,body,options)=>{calls++;requests.push({body,options});return submit?submit(body,options):String(calls);},
  pollJob:poll||(async()=>{active++;maxActive=Math.max(active,maxActive);if(parallelismCheck){if(active===2)release();await both;}else await new Promise(r=>setTimeout(r,30));active--;}),
  downloadRaw:download||(async(c,id)=>({buffer:await sharp({create:{width:requests[Number(id)-1].body.ratio==='3:4'?600:800,height:requests[Number(id)-1].body.ratio==='3:4'?800:600,channels:3,background:'#5989b4'}}).png().toBuffer()}))});
 return {dir,tasksFile,storageDir,manager,get:async()=>JSON.parse(await fs.readFile(tasksFile,'utf8'))[0],stats:()=>({calls,maxActive,requests})};
}

test('six targets finish with only two parallel provider requests; repeated all-pending submissions reuse completed outputs',async()=>{
 const h=await harness({parallelismCheck:true});try{const request={model:'gpt-image-2',requestId:randomUUID()},saved=await h.manager.submit('fixture',request);await h.manager.wait(saved.communityGeneration.runId);const t=await h.get();assert.equal(t.communityGeneration.status,'done',JSON.stringify(t.communityGeneration));assert.equal(t.communityGeneration.done,6);assert.equal(h.stats().calls,2);assert.equal(h.stats().maxActive,2);assert.deepEqual(t.parameters.layoutByTemplate[master.id],fixture().parameters.layoutByTemplate[master.id]);assert.deepEqual(t.communityMasterApproval,fixture().communityMasterApproval);assert.equal(t.parameters.communityArtworkByTemplate[templates[0].id],undefined);
 for(const template of templates){assert.equal(communityArtworkTargetPending(t,template),false);assert.equal(t.parameters.backgroundByTemplate[template.id].scale,100);assert.equal(t.parameters.assetByTemplate[template.id].title,'title.png');}
 await h.manager.submit('fixture',request);await h.manager.submit('fixture',{model:'gpt-image-2',requestId:randomUUID()});assert.equal(h.stats().calls,2);
 }finally{await fs.rm(h.dir,{recursive:true,force:true});}
});

test('bad ratio and restart processing reuse downloaded raw instead of repeating a paid request',async()=>{
 const bad=await sharp({create:{width:1600,height:900,channels:3,background:'#abcdef'}}).png().toBuffer(),h=await harness({download:async()=>({buffer:bad})});
 try{const input={model:'gpt-image-2',targetTemplateIds:['community-xiaohongshu-cover'],requestId:randomUUID()};const a=await h.manager.submit('fixture',input);await h.manager.wait(a.communityGeneration.runId);assert.equal((await h.get()).communityGeneration.status,'partial');assert.equal(h.stats().calls,1);
 const b=await h.manager.submit('fixture',{...input,requestId:randomUUID()});await h.manager.wait(b.communityGeneration.runId);assert.equal(h.stats().calls,1,'Validation failure must never charge another request');assert.equal(communityArtworkTargetPending(await h.get(),map.get(input.targetTemplateIds[0])),true);
 }finally{await fs.rm(h.dir,{recursive:true,force:true});}
});

test('a master or target changed during generation is never overwritten',async()=>{
 let h;h=await harness({poll:async()=>{const tasks=JSON.parse(await fs.readFile(h.tasksFile));tasks[0].parameters.layoutByTemplate['community-xiaohongshu-cover']={title:{x:99}};await fs.writeFile(h.tasksFile,JSON.stringify(tasks));}});
 try{const saved=await h.manager.submit('fixture',{model:'gpt-image-2',targetTemplateIds:['community-xiaohongshu-cover'],requestId:randomUUID()});await h.manager.wait(saved.communityGeneration.runId);const t=await h.get();assert.equal(t.parameters.layoutByTemplate['community-xiaohongshu-cover'].title.x,99);assert.match(t.communityGeneration.items[0].error,/手动调整/);assert.equal(communityArtworkTargetPending(t,map.get('community-xiaohongshu-cover')),true);}finally{await fs.rm(h.dir,{recursive:true,force:true});}
});

test('an old browser cannot roll generated bindings back, while fresh layout edits remain writable',()=>{
 const task=fixture(),id=templates[0].id;task.updatedAt='fresh';task.communityGeneration={workflow:'layered-reflow-v1',items:[{templateId:id,status:'done',assetName:'generated.png'}]};task.parameters.assetByTemplate[id]={background:'generated.png',title:'title.png'};task.assets.push({name:'generated.png',extensionMode:'layered-reflow-v1'});
 assert.throws(()=>assertCommunityTargetSaveCurrent(task,{parameters:{assetByTemplate:{[id]:{background:'scene.png'}}}}),e=>e.status===409);
 assert.throws(()=>assertCommunityTargetSaveCurrent(task,{expectedUpdatedAt:'old',parameters:task.parameters}),e=>e.status===409);
 assert.doesNotThrow(()=>assertCommunityTargetSaveCurrent(task,{expectedUpdatedAt:'fresh',parameters:task.parameters}));
 assert.doesNotThrow(()=>assertCommunityTargetSaveCurrent(task,{expectedUpdatedAt:'fresh',parameters:{assetByTemplate:{[id]:{background:'manual.png'}}}}));
 assert.doesNotThrow(()=>assertCommunityTargetSaveCurrent(task,{notes:'metadata only'}));
});

test('failed adjustments on an already complete size remain visible; cached native result can be recovered without any provider call',async()=>{
 const h=await harness();try{
  let saved=await h.manager.submit('fixture',{model:'gpt-image-2',requestId:randomUUID()});await h.manager.wait(saved.communityGeneration.runId);
  const id='community-community-carousel',before=await h.get(),layouts=structuredClone(before.parameters.layoutByTemplate[id]),masterLayout=structuredClone(before.parameters.layoutByTemplate[master.id]);
  const plan=planLayeredCommunityTarget(before,master,map.get(id),{prompt:'人物缩小一点'});assert.deepEqual(plan.layouts,layouts);assert.equal(plan.editSource.assetName,before.parameters.assetByTemplate[id].background);
  assert.deepEqual(before.parameters.layoutByTemplate[master.id],masterLayout);
  saved=await h.manager.submit('fixture',{model:'gpt-image-2',targetTemplateIds:[id],prompt:'人物缩小一点',requestId:randomUUID()});await h.manager.wait(saved.communityGeneration.runId);
  const failed=await h.get(),item=failed.communityGeneration.items[0];assert.equal(item.status,'failed');assert.equal(failed.communityGeneration.status,'partial','retained completed size must not turn failed re-edit into success');assert.match(failed.communityGeneration.errors[0],/画幅/);
  assert.equal(communityArtworkTargetPending(failed,map.get(id)),false,'previous output is still usable');
  failed.templates=templates;const html=communityExtensionProgress(failed,map.get(id));assert.match(html,/本次调整未完成/);assert.match(html,/本次调整未应用/);assert.match(html,/画幅/);assert.match(html,/community-resume-target/);assert.doesNotMatch(html,/已完成 6\/6/);
  const requests=h.stats().requests,last=requests.at(-1).body;assert.match(last.prompt,/当前尺寸无字插画/);assert.match(last.prompt,/人物缩小一点/);const inputPixels=await sharp(Buffer.from(last.images[0].data_base64,'base64')).removeAlpha().raw().toBuffer(),originalPixels=await sharp(await fs.readFile(path.join(h.storageDir,'fixture','assets',plan.editSource.assetName))).removeAlpha().raw().toBuffer();assert.equal(createHash('sha256').update(inputPixels).digest('hex'),createHash('sha256').update(originalPixels).digest('hex'),'AI edits the current target image, not the master');
  // Simulate the old stricter checker rejecting a correctly returned 21:9.
  const dir=path.join(h.storageDir,'fixture','target-reflow',item.cacheKey),raw=await sharp({create:{width:2100,height:900,channels:3,background:'#aabbcc'}}).png().toBuffer(),receipt=JSON.parse(await fs.readFile(path.join(dir,'receipt.json'),'utf8'));receipt.rawSha256=createHash('sha256').update(raw).digest('hex');await fs.writeFile(path.join(dir,'raw-image'),raw);await fs.writeFile(path.join(dir,'receipt.json'),JSON.stringify(receipt));
  const calls=h.stats().calls;await assert.rejects(h.manager.resume('fixture',{runId:failed.communityGeneration.runId,templateId:id,expectedUpdatedAt:'outdated'}),e=>e.status===409);
  const stored=await h.get(),manual=structuredClone(stored);manual.updatedAt='manual';manual.parameters.layoutByTemplate[id].title.x+=10;await fs.writeFile(h.tasksFile,JSON.stringify([manual]));
  await assert.rejects(h.manager.resume('fixture',{runId:failed.communityGeneration.runId,templateId:id,expectedUpdatedAt:'manual'}),/手动调整/);assert.equal((await h.get()).parameters.layoutByTemplate[id].title.x,manual.parameters.layoutByTemplate[id].title.x);await fs.writeFile(h.tasksFile,JSON.stringify([stored]));
  await fs.writeFile(path.join(dir,'raw-image'),Buffer.from('changed cache'));await assert.rejects(h.manager.resume('fixture',{runId:failed.communityGeneration.runId,templateId:id,expectedUpdatedAt:stored.updatedAt}),/校验失败/);await fs.writeFile(path.join(dir,'raw-image'),raw);assert.equal(h.stats().calls,calls);
  const resumed=await h.manager.resume('fixture',{runId:failed.communityGeneration.runId,templateId:id,expectedUpdatedAt:failed.updatedAt});await h.manager.wait(resumed.communityGeneration.runId);const result=await h.get();
  assert.equal(h.stats().calls,calls);assert.equal(result.communityGeneration.status,'done',JSON.stringify(result.communityGeneration));assert.equal(result.communityGeneration.items[0].reused,true);assert.equal(result.communityGeneration.reuseCachedOnly,true);
  assert.deepEqual(result.parameters.layoutByTemplate[id],layouts);assert.deepEqual(result.parameters.layoutByTemplate[master.id],masterLayout);assert.notEqual(result.parameters.assetByTemplate[id].background,before.parameters.assetByTemplate[id].background);
  for(const target of templates.filter(t=>t.id!==id))assert.deepEqual(result.parameters.assetByTemplate[target.id],before.parameters.assetByTemplate[target.id]);
 }finally{assert.equal(path.dirname(h.dir),path.resolve(os.tmpdir()));await fs.rm(h.dir,{recursive:true,force:true});}
});
