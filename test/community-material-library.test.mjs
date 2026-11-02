import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {communityMaterialReferences} from '../public/community-references.js';
import {initializeCommunityMaterialReferences,addCommunityMaterialReferences,removeCommunityMaterialReference} from '../lib/community-material-references.mjs';
import {prepareCommunityMaterial,removeCommunityMaterial,selectCommunityMaterial} from '../lib/community-materials.mjs';
import {communityMaterialGroups} from '../public/community-material-state.js';
import {renderMasterInputs,renderMasterAi,renderMasterWorkspace} from '../public/community-master-page.js';
import {communityMasterTemplate as template} from '../lib/community-master-workspace.mjs';

const image=(name,role='reference-image',extra={})=>({name,role,mime:'image/png',url:'/'+name,width:400,height:200,...extra});
const fixture=()=>({id:'task',copy:'霜降祝福',updatedAt:'before',masterTemplateId:template.id,targetTemplateIds:['target'],communityMasterApproval:{fingerprint:'approved'},assets:[image('reference.png'),image('scene.png','mother-candidate',{materialKind:'illustration'}),image('title.png','title'),image('unused.png','title'),image('old-whole.png','mother-candidate',{artworkMode:'whole-artwork'})],parameters:{communityMaterialKind:'illustration',communityMaterialDrafts:{illustration:'插画草稿',title:'文案草稿'},assetByTemplate:{[template.id]:{background:'scene.png',title:'title.png'},target:{title:'title.png'}},layoutByTemplate:{[template.id]:{title:{x:50,y:100,width:700,height:350,visible:true}},target:{title:{x:10,y:20,width:100,height:50}}},backgroundByTemplate:{}},communityDesign:{versions:[]},history:[]});
const names=(t,k)=>communityMaterialReferences(t,k).map(a=>a.name);

test('legacy references become two independent lists and removal never deletes the other list or file metadata',()=>{
 const task=fixture(),drafts=structuredClone(task.parameters.communityMaterialDrafts);initializeCommunityMaterialReferences(task);
 assert.notEqual(task.parameters.communityMaterialReferences.illustration,task.parameters.communityMaterialReferences.text);
 removeCommunityMaterialReference(task,{name:'reference.png',scope:'illustration',expectedUpdatedAt:'before'},'removed');
 assert.deepEqual(names(task,'illustration'),[]);assert.deepEqual(names(task,'title'),['reference.png']);assert.deepEqual(names(task,'subtitle'),['reference.png']);assert.ok(task.assets.some(a=>a.name==='reference.png'));
 addCommunityMaterialReferences(task,{scope:'illustration',assets:[image('character.png')],expectedUpdatedAt:'removed'},'uploaded');
 assert.deepEqual(names(task,'illustration'),['character.png']);assert.deepEqual(names(task,'title'),['reference.png']);assert.deepEqual(task.parameters.communityMaterialDrafts,drafts);
 assert.throws(()=>removeCommunityMaterialReference(task,{name:'reference.png',scope:'text',expectedUpdatedAt:'stale'}),e=>e.status===409);
});

test('AI requests and visible reference numbers use the selected group, while title/subtitle share their text reference list',()=>{
 const task=fixture();task.parameters.communityMaterialReferences={illustration:['reference.png'],text:[]};
 addCommunityMaterialReferences(task,{scope:'text',assets:[image('gold.png'),image('palette.png')],expectedUpdatedAt:'before'},'new');
 for(const kind of ['illustration','title','subtitle']){
  task.parameters.subtitleText='节气祝福';task.parameters.communityMaterialKind=kind;
  const run=prepareCommunityMaterial(task,{kind,model:'gpt-image-2',prompt:'按当前参考设计',requestId:'scope-123456',expectedUpdatedAt:task.updatedAt},template),html=renderMasterAi(task);
  assert.deepEqual(run.referenceNames,kind==='illustration'?['reference.png']:['gold.png','palette.png']);
  assert.match(html,new RegExp(kind==='illustration'?'reference.png':'gold.png'));assert.doesNotMatch(html,new RegExp(kind==='illustration'?'gold.png':'/reference.png'));
  assert.equal(run.sceneName,kind==='illustration'?null:'scene.png');
 }
});

test('unused material removal hides only that thumbnail; deleting a used material detaches the master but preserves target layers and history',()=>{
 const task=fixture(),targets=structuredClone(task.parameters.assetByTemplate.target),layouts=structuredClone(task.parameters.layoutByTemplate.target);
 assert.equal(removeCommunityMaterial(task,{name:'unused.png',expectedUpdatedAt:'before'},template,{now:'unused-removed'}).masterChanged,false);
 assert.deepEqual(task.communityMasterApproval,{fingerprint:'approved'});assert.ok(!communityMaterialGroups(task).some(g=>g.assets.some(a=>a.name==='unused.png')));
 assert.throws(()=>selectCommunityMaterial(task,{name:'unused.png',expectedUpdatedAt:task.updatedAt},template),/已从素材库移除/);
 assert.equal(removeCommunityMaterial(task,{name:'title.png',expectedUpdatedAt:task.updatedAt},template,{now:'used-removed'}).masterChanged,true);
 assert.equal(task.parameters.assetByTemplate[template.id].title,null);assert.equal(task.parameters.layoutByTemplate[template.id].title.visible,false);assert.equal(task.communityMasterApproval,null);
 assert.deepEqual(task.parameters.assetByTemplate.target,targets);assert.deepEqual(task.parameters.layoutByTemplate.target,layouts);assert.ok(task.assets.some(a=>a.name==='title.png'));
 assert.ok(task.communityDesign.versions.some(v=>v.snapshot.assets.title==='title.png'));
});

test('cleaned workspace has hover delete controls, no historical-whole group or quality label, and a named download action without the trailing arrow',async()=>{
 const task=fixture(),left=renderMasterInputs(task),ai=renderMasterAi(task),html=renderMasterWorkspace(task,{inputs:left,ai,canvas:'CANVAS',inspector:'PROPERTIES',adjustments:'VIEW-CONTROLS'});
 assert.doesNotMatch(left,/历史整稿|old-whole.png/);assert.match(left,/data-master-remove-material="scene.png"/);assert.match(left,/data-master-remove-material="title.png"/);assert.doesNotMatch(ai,/高质量/);
 assert.match(html,/master-download-materials[^>]*>下载独立素材<\/a>/);assert.doesNotMatch(html,/确认母版并延展尺寸[^<]*→|class="master-adjustments"/);assert.doesNotMatch(html,/VIEW-CONTROLS|母版组合历史|master-history/);
 const css=await fs.readFile('public/community-master-page.css','utf8');assert.match(css,/\.master-material-card:hover>\.master-material-remove/);assert.match(css,/a\.button\.ghost[^{}]*\{[^{}]*color:#7057ef/);
});
