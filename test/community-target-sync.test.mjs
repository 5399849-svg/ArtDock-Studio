import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {communityMasterTemplate as master} from '../lib/community-master-workspace.mjs';
import {communityPlacements,communityTemplate} from '../lib/community-placements.mjs';
import {planLayeredCommunityTarget} from '../lib/community-target-reflow.mjs';
import {synchronizeCommunityTargets,rememberCommunityTargetRevision,recoverLegacySceneProof,sceneDigest} from '../lib/community-target-sync.mjs';
import {bannerMasterSnapshot} from '../lib/community-banner-session.mjs';
import {communityArtworkTargetPending,communityTargetHasComposition} from '../public/community-artwork-state.js';
import {communityExtensionProgress} from '../public/community-extension-progress.js';
import {assertCommunityTargetSaveCurrent} from '../lib/community-target-save-guard.mjs';

const templates=communityPlacements.filter(p=>['official-cover','community-carousel','community-two','wechat-mini-cover','alipay-cover','xiaohongshu-cover'].some(s=>p.id==='community-'+s)).map(communityTemplate);
function fixture(){
 const task={id:'task',copy:'霜降祝福',masterTemplateId:master.id,targetTemplateIds:templates.map(t=>t.id),templates:[...templates],communityMasterApproval:{fingerprint:'before'},assets:[{name:'scene.png',mime:'image/png',width:1920,height:1080},{name:'title.png',mime:'image/png',width:800,height:300},{name:'clean.png',mime:'image/png',width:800,height:300},{name:'logo.png',mime:'image/png',width:600,height:200}],parameters:{communityMaterialWorkflow:{version:1},assetByTemplate:{[master.id]:{background:'scene.png',title:'title.png',logo:'logo.png'}},layoutByTemplate:{[master.id]:{title:{x:140,y:280,width:800,height:300,visible:true,effects:{shadow:{enabled:true,blur:12,offsetX:4,offsetY:8}}},logo:{x:50,y:30,width:300,height:100,visible:true}}},backgroundByTemplate:{}},communityGeneration:{phase:'targets',workflow:'layered-reflow-v1',fingerprint:'before',status:'done',done:6,total:6,items:[]},history:[]};
 const snapshot=bannerMasterSnapshot(task);
 for(const template of templates){const plan=planLayeredCommunityTarget(task,master,template),name=template.id+'.png';task.assets.push({name,role:'generated-background',extensionMode:'layered-reflow-v1',sourceTemplateId:template.id,sourceMasterFingerprint:'before',sourceSceneHash:'same-scene'});task.parameters.assetByTemplate[template.id]={...plan.assets,background:name};task.parameters.layoutByTemplate[template.id]=structuredClone(plan.layouts);task.parameters.layoutByTemplate[template.id].title.x+=3;task.parameters.backgroundByTemplate[template.id]={focalX:37,focalY:44,scale:115,url:''};rememberCommunityTargetRevision(task,template,{fingerprint:'before',sceneHash:'same-scene',masterSnapshot:snapshot,plan});task.communityGeneration.items.push({templateId:template.id,status:'done',assetName:name,plan});}
 return task;
}
const sync=(task,extra={})=>synchronizeCommunityTargets(task,{templates,master,fingerprint:task.communityMasterApproval.fingerprint,sceneHash:'same-scene',legacyProof:new Set(),...extra});

test('cleaning text reuses all six compositions and preserves every manual geometry and background value; repeated sync is idempotent',async()=>{
 const task=fixture(),before=structuredClone(task.parameters);task.parameters.assetByTemplate[master.id].title='clean.png';task.communityMasterApproval.fingerprint='after';
 assert.ok(templates.every(t=>communityArtworkTargetPending(task,t)&&communityTargetHasComposition(task,t)));
 const result=await sync(task);assert.equal(result.updated.length,6);assert.equal(result.pending.length,0);
 for(const t of templates){assert.equal(task.parameters.assetByTemplate[t.id].background,before.assetByTemplate[t.id].background);assert.equal(task.parameters.assetByTemplate[t.id].title,'clean.png');assert.deepEqual(task.parameters.layoutByTemplate[t.id],before.layoutByTemplate[t.id]);assert.deepEqual(task.parameters.backgroundByTemplate[t.id],before.backgroundByTemplate[t.id]);assert.equal(communityArtworkTargetPending(task,t),false);}
 assert.equal(task.communityTargetVersions.length,6);assert.equal((await sync(task)).retained.length,6);assert.equal(task.communityTargetVersions.length,6);assert.match(communityExtensionProgress(task,templates[0]),/已同步 6\/6/);
});

test('changing the scene keeps old backgrounds and overlays visible, marks only synchronization pending and does not claim current completion',async()=>{
 const task=fixture(),before=structuredClone(task.parameters);task.communityMasterApproval.fingerprint='new-scene';const result=await sync(task,{sceneHash:'different-scene'});assert.equal(result.updated.length,0);assert.equal(result.pending.length,6);assert.deepEqual(task.parameters,before);
 for(const t of templates){assert.equal(communityTargetHasComposition(task,t),true);assert.equal(communityArtworkTargetPending(task,t),true);}
 const html=communityExtensionProgress(task,templates[0]);assert.match(html,/已保留 6 张尺寸稿 · 6 张待同步/);assert.doesNotMatch(html,/已完成 6\/6/);
});

test('master layout and effect deltas update only the changed layer while retaining target-specific offsets and scene framing',async()=>{
 const task=fixture(),target=templates[0],p=task.parameters,before=structuredClone(p),r=p.layoutByTemplate[master.id].title;r.x+=50;r.y+=20;r.effects.shadow.blur=20;task.communityMasterApproval.fingerprint='adjusted';await sync(task);
 const actual=p.layoutByTemplate[target.id].title,old=before.layoutByTemplate[target.id].title;assert.ok(Math.abs(actual.x-old.x-50*target.width/master.width)<.0001);assert.ok(Math.abs(actual.y-old.y-20*target.height/master.height)<.0001);assert.equal(actual.effects.shadow.blur,20*actual.width/r.width);assert.deepEqual(p.backgroundByTemplate,before.backgroundByTemplate);assert.deepEqual(p.layoutByTemplate[target.id].logo,before.layoutByTemplate[target.id].logo);
});

test('one new size remains pending while previously completed sizes stay current',async()=>{
 const task=fixture(),newTemplate={...templates[0],id:'new-size'};task.targetTemplateIds.push(newTemplate.id);task.templates.push(newTemplate);const result=await sync(task,{templates:[...templates,newTemplate]});assert.deepEqual(result.pending,['new-size']);assert.equal(result.updated.length,0);assert.equal(result.retained.length,6);assert.equal(communityTargetHasComposition(task,newTemplate),false);
});

function legacyAutomaticLogoFixture(){
 const task=fixture(),p=task.parameters;delete p.assetByTemplate[master.id].logo;task.assets.find(a=>a.name==='logo.png').role='logo';
 for(const target of templates){p.assetByTemplate[target.id].logo=null;const revision=p.communityTargetRevisions[target.id];delete revision.masterSnapshot.assets.logo;revision.plan.assets.logo=null;}
 return task;
}

test('existing completed sizes recover a proven omitted automatic Logo without changing manual composition, and repair runs only once',async()=>{
 const task=legacyAutomaticLogoFixture(),p=task.parameters;
 p.layoutByTemplate[templates[0].id].logo.x+=20;p.layoutByTemplate[templates[0].id].logo.width*=1.2;
 const before=structuredClone(task),result=await sync(task);
 assert.equal(result.updated.length,6);assert.deepEqual(result.pending,[]);
 assert.deepEqual(p.layoutByTemplate,before.parameters.layoutByTemplate,'All manually adjusted positions and sizes are unchanged');
 assert.deepEqual(p.backgroundByTemplate,before.parameters.backgroundByTemplate);assert.deepEqual(p.assetByTemplate[master.id],before.parameters.assetByTemplate[master.id]);assert.deepEqual(task.communityMasterApproval,before.communityMasterApproval);
 for(const target of templates){assert.equal(p.assetByTemplate[target.id].logo,'logo.png');const expected={...before.parameters.assetByTemplate[target.id],logo:'logo.png'};assert.deepEqual(p.assetByTemplate[target.id],expected);assert.equal(communityArtworkTargetPending(task,target),false);}
 const repaired=structuredClone(p);assert.equal((await sync(task)).updated.length,0);assert.deepEqual(p,repaired,'Repeat sync is idempotent');
});

test('legacy Logo recovery preserves hidden Logos, explicit master removal, no-Logo resources and subsequent manual target removal',async()=>{
 const task=legacyAutomaticLogoFixture(),p=task.parameters,first=templates[0];p.layoutByTemplate[first.id].logo.visible=false;
 const disabled={...templates[1],brandLogo:false};await sync(task,{templates:[first,disabled]});assert.equal(p.assetByTemplate[first.id].logo,null);assert.equal(p.assetByTemplate[disabled.id].logo,null);
 p.assetByTemplate[master.id].logo=null;assert.equal((await sync(task)).updated.length,0);assert.ok(templates.every(t=>p.assetByTemplate[t.id].logo===null));
 delete p.assetByTemplate[master.id].logo;await sync(task);const target=templates[2];p.assetByTemplate[target.id].logo=null;
 assert.equal((await sync(task)).updated.length,0);assert.equal(p.assetByTemplate[target.id].logo,null,'A removal after the repaired plan must not be undone');
});

test('legacy provider input proves an unchanged scene before migration; unrelated or changed scene requests never authorize reuse',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'target-sync-proof-'));t.after(async()=>{assert.equal(path.dirname(dir),path.resolve(os.tmpdir()));await fs.rm(dir,{recursive:true,force:true});});const task=fixture(),target=templates[0],asset=task.assets.find(a=>a.name===task.parameters.assetByTemplate[target.id].background);asset.sourceJobId='job-old';delete asset.sourceSceneHash;delete task.parameters.communityTargetRevisions;
 const source=Buffer.from('actual-scene'),hash=sceneDigest(source),entry=path.join(dir,task.id,'target-reflow','a'.repeat(64));await fs.mkdir(entry,{recursive:true});await fs.writeFile(path.join(entry,'receipt.json'),JSON.stringify({providerJobId:'job-old'}));await fs.writeFile(path.join(entry,'request.json'),JSON.stringify({images:[{data_base64:source.toString('base64')}]}));assert.ok((await recoverLegacySceneProof(task,dir,hash)).has('before'));assert.equal((await recoverLegacySceneProof(task,dir,'changed')).size,0);
 task.communityMasterApproval.fingerprint='after';task.parameters.assetByTemplate[master.id].title='clean.png';const result=await synchronizeCommunityTargets(task,{templates,master,fingerprint:'after',sceneHash:hash,storageDir:dir});assert.equal(result.updated.length,6);assert.equal(task.parameters.assetByTemplate[target.id].title,'clean.png');
});

test('stale browsers cannot roll synchronized overlays back even when the most recent job generated a material',()=>{
 const task=fixture(),target=templates[0];task.updatedAt='current';task.communityGeneration={phase:'materials',status:'done'};const parameters=structuredClone(task.parameters);parameters.assetByTemplate[target.id].title='old.png';assert.throws(()=>assertCommunityTargetSaveCurrent(task,{parameters}),e=>e.status===409);assert.doesNotThrow(()=>assertCommunityTargetSaveCurrent(task,{expectedUpdatedAt:'current',parameters}));
});

test('replanning one already-complete size reports the new job progress rather than claiming the old six outputs finished it',()=>{
 const task=fixture();task.communityGeneration.status='running';task.communityGeneration.items=task.communityGeneration.items.slice(0,2);task.communityGeneration.items[1].status='pending';task.communityGeneration.total=2;task.communityGeneration.done=1;const html=communityExtensionProgress(task,templates[1]);assert.match(html,/更新进度 1\/2/);assert.match(html,/已保留 6 张尺寸稿/);assert.doesNotMatch(html,/已完成 6\/6/);
});
