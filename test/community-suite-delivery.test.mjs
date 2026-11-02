import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import {createCommunitySuiteDelivery} from '../lib/community-suite-delivery.mjs';
import {workbenchZipFiles} from '../lib/workbench-downloads.mjs';
import {taskStatus} from '../public/workbench-model.js';
async function fixture(t){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'suite-delivery-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const storageDir=path.join(dir,'storage'),tasksFile=path.join(dir,'tasks.json'),template={id:'target',name:'测试尺寸',width:90,height:38,format:'PNG',maxBytes:1048576,communityPlacement:true};
 const buffer=await sharp({create:{width:90,height:38,channels:4,background:'#ffdd88'}}).png().toBuffer();await fs.mkdir(path.join(storageDir,'one','artifacts'),{recursive:true});await fs.writeFile(path.join(storageDir,'one','artifacts','old.png'),buffer);
 const task={id:'one',project:'测试banner',status:'成套审核',updatedAt:'before',version:3,targetTemplateIds:['target'],qc:{passed:true},parameters:{assetByTemplate:{target:{}}},history:[],artifacts:[{templateId:'target',name:'old.png',width:90,height:38,format:'PNG',bytes:buffer.length}],communityMasterApproval:{fingerprint:'current'}};
 const write=()=>fs.writeFile(tasksFile,JSON.stringify([task,{id:'other',status:'草稿'}]));await write();const jobs=new Map();let ready=true;
 const deliver=createCommunitySuiteDelivery({tasksFile,storageDir,templateMap:new Map([[template.id,template]]),jobs,assertReady:async()=>{if(!ready)throw Error('稿件已过期');}});
 return {dir,storageDir,tasksFile,task,buffer,deliver,jobs,write,stale:()=>ready=false,read:async()=>JSON.parse(await fs.readFile(tasksFile,'utf8')),input:{confirmed:true,expectedUpdatedAt:'before'}};
}
test('confirming a complete suite archives exact image bytes and sets the card, review and task to completed',async t=>{
 const f=await fixture(t),saved=await f.deliver('one',f.input);assert.equal(taskStatus(saved),'已完成');assert.equal(saved.visualReview.status,'approved');assert.ok(saved.communityTargetReviews.target);assert.equal(saved.history.length,1);
 const archive=await fs.readFile(path.join(f.storageDir,'one','deliveries',saved.deliveredPackage.name)),files=workbenchZipFiles(archive);assert.deepEqual(files.find(f=>f.name.endsWith('测试banner_90x38.png')).data,f.buffer);
 assert.equal(JSON.parse(files.find(f=>f.name.endsWith('.json')).data).status,'已完成');assert.deepEqual((await f.read())[1],{id:'other',status:'草稿'});
 const again=await f.deliver('one',{...f.input,expectedUpdatedAt:saved.updatedAt});assert.deepEqual(again,saved);assert.equal((await fs.readdir(path.join(f.storageDir,'one','deliveries'))).length,1);
});
test('missing confirmation, stale version, incomplete suite and failed QC never mark complete',async t=>{
 const f=await fixture(t),before=await fs.readFile(f.tasksFile,'utf8');await assert.rejects(()=>f.deliver('one',{...f.input,confirmed:false}));await assert.rejects(()=>f.deliver('one',{...f.input,expectedUpdatedAt:'stale'}));assert.equal(await fs.readFile(f.tasksFile,'utf8'),before);
 f.task.targetTemplateIds.push('missing');await f.write();await assert.rejects(()=>f.deliver('one',f.input));f.task.targetTemplateIds=['target'];f.task.qc.passed=false;await f.write();await assert.rejects(()=>f.deliver('one',f.input));assert.equal((await f.read())[0].status,'成套审核');
});
test('in-progress jobs, stale compositions and missing files preserve review status',async t=>{
 const f=await fixture(t);f.jobs.set('one',true);await assert.rejects(()=>f.deliver('one',f.input));f.jobs.delete('one');await fs.unlink(path.join(f.storageDir,'one','artifacts','old.png'));await assert.rejects(()=>f.deliver('one',f.input));f.stale();await assert.rejects(()=>f.deliver('one',f.input),/过期/);assert.equal((await f.read())[0].status,'成套审核');
});
test('actual wrong-sized bytes and an archive path collision cannot overwrite earlier files or complete a task',async t=>{
 const f=await fixture(t),file=path.join(f.storageDir,'one','artifacts','old.png');await fs.writeFile(file,await sharp(f.buffer).resize(80,38).png().toBuffer());await assert.rejects(()=>f.deliver('one',f.input),/规范/);await fs.writeFile(file,f.buffer);
 const archives=path.join(f.storageDir,'one','deliveries');await fs.mkdir(archives,{recursive:true});const archive=path.join(archives,'测试banner_成套素材_v3.zip');await fs.writeFile(archive,'keep');await assert.rejects(()=>f.deliver('one',f.input));assert.equal(await fs.readFile(archive,'utf8'),'keep');assert.equal((await f.read())[0].status,'成套审核');
});
