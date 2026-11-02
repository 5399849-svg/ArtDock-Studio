import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {createCommunityPopup,assertPopupPng,assertPopupParameterSave} from '../lib/community-popup.mjs';
import {popupDefaults,popupConfig,COMMUNITY_POPUP_ID as id,normalizePopupConfig} from '../public/community-popup-model.js';
import {communityTargetHasComposition,communityArtworkTargetPending,communityTargetReviewSnapshot,communityTargetReviewMatches} from '../public/community-artwork-state.js';
import {communityPlacements,communityTemplate} from '../lib/community-placements.mjs';
import {propagateCommunityMaster} from '../lib/community-master-propagation.mjs';
import {synchronizeCommunityTargets} from '../lib/community-target-sync.mjs';
import {popupInitialBindings} from '../public/community-popup-panel.js';
const target=communityTemplate(communityPlacements.find(p=>p.id===id)),master={id:'community-banner-master',width:1920,height:1080,communityPlacement:true};
async function fixture(t){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'popup-test-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const tasksFile=path.join(dir,'tasks.json'),folder=path.join(dir,'one','assets');await fs.mkdir(folder,{recursive:true});
 const bg=await sharp({create:{width:960,height:540,channels:3,background:'#aabbef'}}).png().toBuffer();const char=await sharp(Buffer.from('<svg width="400" height="600"><rect x="100" y="50" width="200" height="500" fill="#e42c43"/></svg>')).png().toBuffer();await fs.writeFile(path.join(folder,'bg.png'),bg);await fs.writeFile(path.join(folder,'char.png'),char);
 const task={id:'one',masterTemplateId:master.id,targetTemplateIds:[id,'other'],status:'主图制作',updatedAt:'before',version:3,assets:[{name:'bg.png',role:'background',mime:'image/png',width:960,height:540},{name:'char.png',role:'character',mime:'image/png',width:400,height:600}],parameters:{communityMaterialWorkflow:{version:1},assetByTemplate:{[master.id]:{background:'bg.png',character:'char.png'},other:{background:'bg.png'}},layoutByTemplate:{[master.id]:{title:{x:10,y:10,width:800,height:100}},other:{title:{x:3,y:5,width:100,height:30}}}},copy:'原文案',communityMasterApproval:{fingerprint:'fp'},communityDesign:{versions:[{id:'old'}]},artifacts:[{name:'old.png',url:'/old.png'}],history:[]};await fs.writeFile(tasksFile,JSON.stringify([task,{id:'unrelated'}]));
 const jobs=new Map(),templateMap=new Map([[id,target],[master.id,master]]),apply=createCommunityPopup({tasksFile,storageDir:dir,templateMap,jobs,invalidate:t=>{if(t.artifacts?.length)t.version++;t.artifacts=[];}});return {task,apply,jobs,dir,tasksFile,char,bg,read:async()=>JSON.parse(await fs.readFile(tasksFile,'utf8'))};
}
test('legacy canvas stays opaque until explicit application; assets and other sizes remain unchanged',async t=>{
 const f=await fixture(t);assert.equal(popupConfig(f.task,target),null);assert.equal(target.transparent,false);
 const saved=await f.apply('one',{action:'apply',expectedUpdatedAt:'before',config:popupDefaults()});
 assert.equal(popupConfig(saved,target).shape,'circle');assert.equal(communityTargetHasComposition(saved,target),true);assert.equal(communityArtworkTargetPending(saved,target),false);
 assert.deepEqual(saved.parameters.layoutByTemplate.other,f.task.parameters.layoutByTemplate.other);assert.deepEqual(saved.parameters.assetByTemplate.other,f.task.parameters.assetByTemplate.other);assert.deepEqual(saved.assets,f.task.assets);assert.deepEqual(saved.communityDesign,f.task.communityDesign);assert.deepEqual(saved.communityPopupVersions[0].artifacts,f.task.artifacts);assert.deepEqual((await f.read())[1],{id:'unrelated'});
 const r=saved.parameters.layoutByTemplate[id].character;assert.ok(Math.abs(r.width/r.height-400/600)<1e-10);assert.ok(r.y+50*r.height/600>=0);assert.ok(r.y+550*r.height/600<650);assert.equal(saved.version,4);
});
test('settings preserve manual placement, background focus, and can restore the exact pre-popup parameters',async t=>{
 const f=await fixture(t);let s=await f.apply('one',{action:'apply',expectedUpdatedAt:'before',config:popupDefaults()});
 const original=s.communityPopupVersions[0];s.parameters.layoutByTemplate[id].character.x=44;s.parameters.backgroundByTemplate[id].scale=130;await fs.writeFile(f.tasksFile,JSON.stringify([s]));
 s=await f.apply('one',{action:'apply',expectedUpdatedAt:s.updatedAt,config:{...popupDefaults(),shape:'ellipse',frame:{x:30,y:90,width:440,height:360}}});assert.equal(s.parameters.layoutByTemplate[id].character.x,44);assert.equal(s.parameters.backgroundByTemplate[id].scale,130);
 s=await f.apply('one',{action:'restore',versionId:original.id,expectedUpdatedAt:s.updatedAt});assert.equal(popupConfig(s,target),null);assert.equal(s.parameters.assetByTemplate[id],undefined);assert.equal(s.parameters.layoutByTemplate[id],undefined);assert.equal(s.communityPopupVersions.length,3);assert.deepEqual(s.assets,f.task.assets);
});
test('fake transparency, wrong dimensions, stale requests, foreign assets and busy tasks fail without mutating records',async t=>{
 const f=await fixture(t),before=await fs.readFile(f.tasksFile,'utf8');await assert.rejects(()=>assertPopupPng(f.bg),/透明/);await assertPopupPng(f.char);
 for(const input of [{config:{...popupDefaults(),frame:{x:400,y:100,width:200,height:200}}},{expectedUpdatedAt:'stale'},{bindings:{background:'missing.png'}},{config:{...popupDefaults(),shape:'asset'},bindings:{background:'bg.png'}}]){await assert.rejects(()=>f.apply('one',{action:'apply',expectedUpdatedAt:'before',config:popupDefaults(),...input}));assert.equal(await fs.readFile(f.tasksFile,'utf8'),before);}
 f.jobs.set('one',true);await assert.rejects(()=>f.apply('one',{action:'apply',expectedUpdatedAt:'before'}),/等待/);assert.equal(await fs.readFile(f.tasksFile,'utf8'),before);
});
test('saved delivery and stale parameter PATCH cannot overwrite popup settings',async t=>{
 const f=await fixture(t);let s=await f.apply('one',{action:'apply',expectedUpdatedAt:'before',config:popupDefaults()});
 assert.throws(()=>assertPopupParameterSave(s,{parameters:f.task.parameters,expectedUpdatedAt:s.updatedAt}),/弹窗方案/);
 assert.throws(()=>assertPopupParameterSave(s,{parameters:s.parameters,expectedUpdatedAt:'old'}),/已更新/);
 assert.doesNotThrow(()=>assertPopupParameterSave(s,{parameters:s.parameters,expectedUpdatedAt:s.updatedAt}));
 s.status='已完成';s.deliveredPackage={name:'history.zip'};await fs.writeFile(f.tasksFile,JSON.stringify([s]));await assert.rejects(()=>f.apply('one',{action:'restore',expectedUpdatedAt:s.updatedAt,versionId:s.communityPopupVersions[0].id}),/新版本/);
});
test('review binds to shape and button changes; master changes retain a pending popup',async t=>{
 const f=await fixture(t),s=await f.apply('one',{action:'apply',expectedUpdatedAt:'before',config:popupDefaults()});s.communityTargetReviews={[id]:{snapshot:structuredClone(communityTargetReviewSnapshot(s,target))}};assert.equal(communityTargetReviewMatches(s,target),true);s.parameters.communityPopupByTemplate[id].buttonLabel='新文案';assert.equal(communityTargetReviewMatches(s,target),false);s.communityMasterApproval.fingerprint='new';assert.equal(communityArtworkTargetPending(s,target),true);assert.equal(communityTargetHasComposition(s,target),true);
});
test('opaque character layers cannot sneak into transparent popup; embedded source requires a clean background',async t=>{
 const f=await fixture(t);await assert.rejects(()=>f.apply('one',{action:'apply',expectedUpdatedAt:'before',config:popupDefaults(),bindings:{character:'bg.png'}}),/透明/);
 f.task.assets[1].sourceAssetName='bg.png';await fs.writeFile(f.tasksFile,JSON.stringify([f.task]));await assert.rejects(()=>f.apply('one',{action:'apply',expectedUpdatedAt:'before',config:popupDefaults()}),/双重人物/);
 const s=await f.apply('one',{action:'apply',expectedUpdatedAt:'before',config:{...popupDefaults(),shape:'none'},bindings:{background:null}});assert.equal(communityTargetHasComposition(s,target),true);
});
test('ordinary master propagation and local synchronization retain popup geometry and flag stale master without overwriting',async t=>{
 const f=await fixture(t),s=await f.apply('one',{action:'apply',expectedUpdatedAt:'before',config:popupDefaults()}),before=structuredClone(s.parameters);
 assert.deepEqual(propagateCommunityMaster(s,{templates:[target],masterAssets:{background:'elsewhere.png'},targetLayouts:{},masterFingerprint:'new'}).layoutByTemplate[id],before.layoutByTemplate[id]);
 s.communityMasterApproval.fingerprint='new';const result=await synchronizeCommunityTargets(s,{templates:[target],master,fingerprint:'new',sceneHash:'other',storageDir:f.dir,legacyProof:new Set()});assert.deepEqual(s.parameters,before);assert.deepEqual(result.pending,[id]);
});
test('placed characters keep group offsets instead of stacking at the same centre, and are not auto-bound again',async t=>{
 const f=await fixture(t);delete f.task.parameters.assetByTemplate[master.id].character;f.task.parameters.communityObjectLayersByTemplate={[master.id]:[.3,.7].map((x,i)=>({id:'person'+i,appearance:{kind:'character',groupId:'c'+i,assetName:'char.png',aspect:2/3,name:'人物'},x,y:.5,size:.5}))};await fs.writeFile(f.tasksFile,JSON.stringify([f.task]));
 assert.equal(popupInitialBindings(f.task).character,null);
 const s=await f.apply('one',{action:'apply',config:popupDefaults(),expectedUpdatedAt:'before'}),layers=s.parameters.communityObjectLayersByTemplate[id];assert.equal(layers.length,2);assert.ok(layers[0].x<layers[1].x);assert.equal(layers[0].size,layers[1].size);assert.equal(layers[0].y,layers[1].y);
});
test('restoring a legacy popup preserves its original native copy without rolling back global copy or other sizes',async t=>{
 const f=await fixture(t);let s=await f.apply('one',{action:'apply',expectedUpdatedAt:'before',config:popupDefaults()});const old=s.communityPopupVersions[0].id;s.copy='母稿的新文案';s.parameters.titleFontId='new-font';await fs.writeFile(f.tasksFile,JSON.stringify([s]));
 s=await f.apply('one',{action:'restore',expectedUpdatedAt:s.updatedAt,versionId:old});assert.equal(s.copy,'母稿的新文案');assert.equal(s.parameters.titleFontId,'new-font');assert.deepEqual(s.parameters.communityPopupNativeByTemplate[id].title,{text:'原文案',fontId:'',fontAsset:''});assert.equal(popupConfig(s,target),null);assert.deepEqual(s.parameters.layoutByTemplate.other,f.task.parameters.layoutByTemplate.other);
});
