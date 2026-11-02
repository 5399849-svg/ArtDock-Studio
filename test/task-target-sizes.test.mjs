import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createTaskTargetSizes} from '../lib/task-target-sizes.mjs';
import {customTargetTemplate,registerCustomTargets} from '../public/custom-target-sizes.js';
import {qcArtifact} from '../lib/core.mjs';
import {communityMasterTemplate} from '../lib/community-master-workspace.mjs';
import {nextTargetAfterRemoval} from '../public/target-size-actions.js';
async function fixture(t){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'target-sizes-')),tasksFile=path.join(dir,'tasks.json');t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const task={id:'one',businessLineId:'platform-community',segmentId:'community',status:'主图制作',masterTemplateId:communityMasterTemplate.id,targetTemplateIds:['old'],updatedAt:'before',version:2,assets:[{name:'role.png'}],parameters:{layoutByTemplate:{old:{character:{x:50,y:40,width:100,height:200}}}},communityMasterApproval:{fingerprint:'keep'},communityDesign:{versions:[{id:'history',snapshot:{layout:{}}}]},artifacts:[{url:'/old.png'}],history:[{action:'existing'}]};
 await fs.writeFile(tasksFile,JSON.stringify([task,{id:'other',history:[1,2,3]}]));
 const templateMap=new Map([[communityMasterTemplate.id,communityMasterTemplate],...['old','common'].map(id=>[id,{id,width:900,height:383,format:'PNG',businessLineId:'platform-community',segmentId:'community'}])]),jobs=new Map();
 const add=createTaskTargetSizes({tasksFile,templateMap,jobs,invalidate:t=>{t.artifacts=[];}});return {task,tasksFile,templateMap,jobs,add,read:async()=>JSON.parse(await fs.readFile(tasksFile,'utf8'))};
}
test('custom and common targets persist across reload/copy while keeping existing layouts, assets and history',async t=>{
 const f=await fixture(t),spec={width:1234,height:567,format:'JPG'},target=customTargetTemplate(spec),saved=await f.add('one',{templateIds:['common'],customSizes:[spec,spec],expectedUpdatedAt:'before'});
 assert.deepEqual(saved.targetTemplateIds,['old','common',target.id]);assert.equal(saved.customTargetSizes.length,1);
 for(const key of ['parameters','assets','communityDesign','communityMasterApproval'])assert.deepEqual(saved[key],f.task[key]);
 assert.deepEqual(saved.targetSizeChanges[0].artifacts,f.task.artifacts);assert.deepEqual(saved.history[0],f.task.history[0]);assert.deepEqual((await f.read())[1],{id:'other',history:[1,2,3]});
 const restarted=new Map();registerCustomTargets(JSON.parse(JSON.stringify(saved)),restarted);assert.equal(restarted.get(target.id).width,1234);assert.equal(restarted.get(target.id).communityMaster,false);
 assert.equal(qcArtifact({width:1234,height:567,format:'JPG',bytes:2000},restarted.get(target.id)).passed,true);
 const before=await fs.readFile(f.tasksFile,'utf8');await f.add('one',{customSizes:[spec],expectedUpdatedAt:saved.updatedAt});assert.equal(await fs.readFile(f.tasksFile,'utf8'),before);
});
test('invalid dimensions, foreign presets, stale edits and active generation reject without changing the task',async t=>{
 const f=await fixture(t),before=await fs.readFile(f.tasksFile,'utf8');
 for(const input of [{customSizes:[{width:1,height:500}]},{customSizes:[{width:8192,height:8192}]},{customSizes:[{width:300.5,height:500}]},{templateIds:['foreign']},{customSizes:[{width:300,height:500,format:'GIF'}]},{customSizes:[{width:300,height:500}],expectedUpdatedAt:'stale'}]){
  await assert.rejects(()=>f.add('one',{expectedUpdatedAt:'before',...input}));assert.equal(await fs.readFile(f.tasksFile,'utf8'),before);
 }
 f.jobs.set('one',true);await assert.rejects(()=>f.add('one',{customSizes:[{width:300,height:500}],expectedUpdatedAt:'before'}),/等待/);assert.equal(await fs.readFile(f.tasksFile,'utf8'),before);
});
test('completed deliveries and single custom canvases cannot silently change target sets',async t=>{
 const f=await fixture(t);for(const changes of [{status:'已完成',deliveredPackage:{name:'history.zip'}},{customCanvas:{width:300,height:500}}]){
  await fs.writeFile(f.tasksFile,JSON.stringify([{...f.task,...changes}]));const before=await fs.readFile(f.tasksFile,'utf8');await assert.rejects(()=>f.add('one',{customSizes:[{width:300,height:500}],expectedUpdatedAt:'before'}));assert.equal(await fs.readFile(f.tasksFile,'utf8'),before);
 }
});
test('removing and re-adding a target retains source and new-design layouts, shared assets and history',async t=>{
 const f=await fixture(t),spec={width:100,height:100},id=customTargetTemplate(spec).id;
 let saved=await f.add('one',{customSizes:[spec],expectedUpdatedAt:'before'});
 saved.parameters.sourceCompositionByTemplate={[id]:{layers:[{assetName:'role.png',x:17}]}};
 saved.parameters.layoutByTemplate[id]={character:{x:35}};saved.parameters.communityArtworkByTemplate={[id]:{assetName:'role.png'}};
 saved.sourceAdaptationVersions=[{id:'old-source',snapshot:{parameters:structuredClone(saved.parameters)}}];
 saved.artifacts=[{templateId:id,url:'/saved-100.png'},{templateId:'old',url:'/saved-old.png'}];
 await fs.writeFile(f.tasksFile,JSON.stringify([saved,{id:'other',history:[1,2,3]}]));const before=structuredClone(saved);
 saved=await f.add('one',{action:'remove',templateIds:[id],expectedUpdatedAt:saved.updatedAt});
 assert.deepEqual(saved.targetTemplateIds,['old']);
 for(const key of ['parameters','assets','sourceAdaptationVersions','communityDesign','communityMasterApproval','customTargetSizes'])assert.deepEqual(saved[key],before[key]);
 assert.deepEqual(saved.targetSizeChanges.at(-1).artifacts,before.artifacts);assert.deepEqual(saved.targetSizeChanges.at(-1).previousTargetTemplateIds,before.targetTemplateIds);
 assert.deepEqual((await f.read())[1],{id:'other',history:[1,2,3]});
 saved=await f.add('one',{customSizes:[spec],expectedUpdatedAt:saved.updatedAt});assert.deepEqual(saved.targetTemplateIds,before.targetTemplateIds);assert.deepEqual(saved.parameters,before.parameters);
});
test('removal rejects stale, foreign, duplicate, last-size, busy and delivered requests without writes',async t=>{
 const f=await fixture(t);let s=await f.add('one',{templateIds:['common'],expectedUpdatedAt:'before'});
 const before=await fs.readFile(f.tasksFile,'utf8');
 for(const input of [{templateIds:['old','common']},{templateIds:['foreign']},{templateIds:['old','old']},{templateIds:[]},{templateIds:['common'],expectedUpdatedAt:'stale'}]){
  await assert.rejects(()=>f.add('one',{action:'remove',expectedUpdatedAt:s.updatedAt,...input}));assert.equal(await fs.readFile(f.tasksFile,'utf8'),before);
 }
 f.jobs.set('one',true);await assert.rejects(()=>f.add('one',{action:'remove',templateIds:['common'],expectedUpdatedAt:s.updatedAt}),/等待/);f.jobs.clear();
 s.status='已完成';s.deliveredPackage={name:'old.zip'};await fs.writeFile(f.tasksFile,JSON.stringify([s]));await assert.rejects(()=>f.add('one',{action:'remove',templateIds:['common'],expectedUpdatedAt:s.updatedAt}),/新版本/);
});
test('active removal selects the next or previous target; inactive removal keeps current selection',()=>{
 assert.equal(nextTargetAfterRemoval(['a','b','c'],'b','b'),'c');
 assert.equal(nextTargetAfterRemoval(['a','b','c'],'c','c'),'b');
 assert.equal(nextTargetAfterRemoval(['a','b','c'],'b','a'),'b');
});
