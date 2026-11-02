import test from 'node:test';
import assert from 'node:assert/strict';
import {approveCommunityTargetDrafts} from '../lib/community-target-review.mjs';
import {communityArtworkTargetPending,communityTargetReviewMatches} from '../public/community-artwork-state.js';
const template={id:'target',communityPlacement:true,width:977,height:272};
const fixture=()=>({id:'task',status:'批量生成',updatedAt:'before',masterTemplateId:'community-banner-master',targetTemplateIds:['target'],communityMasterApproval:{fingerprint:'new-master',at:'now'},copy:'标题',assets:[{name:'old.png',role:'generated-background',sourceTemplateId:'target',extensionMode:'confirmed-master-outpaint-v2',sourceMasterFingerprint:'old-master',bytes:1234},{name:'type.png',role:'title',bytes:456}],parameters:{communityMaterialWorkflow:{version:1},assetByTemplate:{target:{background:'old.png',title:'type.png',subtitle:null}},layoutByTemplate:{target:{title:{x:12,y:34,width:200,height:50},character:{x:510,y:-39,width:408,height:408}}},backgroundByTemplate:{target:{focalX:70,focalY:36,scale:160}},subtitleText:'副标',subtitleFontId:'licensed'},history:[]});
test('explicit review accepts the exact existing draft without regenerating, replacing or moving any artwork',()=>{
 const task=fixture(),p=structuredClone(task.parameters),assets=structuredClone(task.assets);assert.equal(communityArtworkTargetPending(task,template),true);
 approveCommunityTargetDrafts(task,{confirmed:true,expectedUpdatedAt:'before'},[template]);
 assert.equal(communityArtworkTargetPending(task,template),false);assert.equal(communityTargetReviewMatches(task,template),true);assert.deepEqual(task.parameters,p);assert.deepEqual(task.assets,assets);assert.equal(task.assets[0].extensionMode,'confirmed-master-outpaint-v2');
});
test('review expires when the master, copy, font, source file or this exact composition changes',()=>{
 for(const edit of [t=>t.communityMasterApproval.fingerprint='changed',t=>t.copy='新文案',t=>t.parameters.subtitleFontId='another-font',t=>t.parameters.layoutByTemplate.target.title.x++,t=>t.parameters.backgroundByTemplate.target.scale=200,t=>t.assets[0].bytes++]){
  const task=fixture();approveCommunityTargetDrafts(task,{confirmed:true,expectedUpdatedAt:'before'},[template]);edit(task);assert.equal(communityTargetReviewMatches(task,template),false);assert.equal(communityArtworkTargetPending(task,template),true);
 }
});
test('unreviewed, stale, running and missing-size requests never make a master reference deliverable',()=>{
 for(const [mutate,input,match]of [[()=>{},{expectedUpdatedAt:'before'},/检查/],[()=>{},{confirmed:true,expectedUpdatedAt:'stale'},/更新/],[t=>{t.communityGeneration={status:'running'}},{confirmed:true,expectedUpdatedAt:'before'},/等待/],[t=>{t.parameters.assetByTemplate.target.background='mother.png'},{confirmed:true,expectedUpdatedAt:'before'},/没有尺寸稿/]]){
  const task=fixture();mutate(task);const before=structuredClone(task);assert.throws(()=>approveCommunityTargetDrafts(task,input,[template]),match);assert.deepEqual(task,before);
 }
});
test('reordering JSON keys and unrelated notes do not invalidate a designer review',()=>{
 const task=fixture();approveCommunityTargetDrafts(task,{confirmed:true,expectedUpdatedAt:'before'},[template]);task.parameters.assetByTemplate.target={subtitle:null,title:'type.png',background:'old.png'};task.notes='note';assert.equal(communityTargetReviewMatches(task,template),true);
});
