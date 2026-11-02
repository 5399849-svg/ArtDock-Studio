import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createWorkbenchProjectLinks,parseWorkbenchTaskKey} from '../lib/workbench-project-links.mjs';
import {taskIndex,assetIndex,groupAdBatchTasks,groupChannelBatchTasks,taskBelongsToProject} from '../public/workbench-model.js';

const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
async function fixture(t){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'workbench-project-links-'));
 t.after(()=>fs.rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:30}));
 const files={
  'projects.json':[{id:'active',status:'active'},{id:'archived',status:'archived'}],
  'tasks.json':[{id:id(1),status:'已完成',projectId:'old',deliveredPackage:{name:'已交付.zip'},artifacts:[{url:'/final.png'}],communityMasterApproval:{fingerprint:'approved'}}],
  'ad-resources-jobs.json':[{id:id(2),downloadedAt:'2026-10-20T00:00:00Z',deliveredVersions:{one:2},assets:[{url:'/source.psd'}],items:{one:{draft:{zoom:1.2,logoScale:.45},versions:[{number:1},{number:2,review:{contentChecked:true}}]}}}],
  'channel-resource-jobs.json':[{id:id(3),items:[{id:'imported-1',project:'游戏 A / 宣传:图'},{id:'imported-2',project:'另一个游戏'}]}],
  'store-preorder-jobs.json':[{id:id(4),status:'running'}],
  'store-launch-jobs.json':[{id:id(5),status:'complete'}],
  'icon-preorder-jobs.json':[{id:id(6)}],
  'icon-launch-jobs.json':[{id:id(7)}],
  'workbench-project-links.json':{[`store-launch:${id(5)}`]:'active'}
 };
 for(const [name,value]of Object.entries(files))await fs.writeFile(path.join(dir,name),JSON.stringify(value));
 const snapshot=async()=>Object.fromEntries(await Promise.all(Object.keys(files).filter(n=>n!=='workbench-project-links.json').map(async n=>[n,await fs.readFile(path.join(dir,n),'utf8')])));
 return {dir,snapshot,store:createWorkbenchProjectLinks({runtimeDir:dir})};
}

test('all modules can be filed together, including delivered work and archived destination projects, without changing production data',async t=>{
 const f=await fixture(t),before=await f.snapshot();
 const keys=[`core:${id(1)}`,`ad-resources:${id(2)}`,`channel-resources:${id(3)}:${encodeURIComponent('游戏 A / 宣传:图')}`,`store-preorder:${id(4)}`,`store-launch:${id(5)}`,`icon-preorder:${id(6)}`,`icon-launch:${id(7)}`];
 const result=await f.store.assign({keys,projectId:'archived'});
 for(const key of keys)assert.equal(result[key],'archived');
 assert.deepEqual(await f.snapshot(),before,'Assets, drafts, approvals, jobs and deliveries must be byte-identical');
 assert.deepEqual(await createWorkbenchProjectLinks({runtimeDir:f.dir}).read(),result,'Filing persists across server restarts');
 await f.store.assign({key:keys[1],projectId:''});assert.equal((await f.store.read())[keys[1]],'');
});

test('invalid project or any missing/malformed task rejects the entire batch before saving',async t=>{
 const f=await fixture(t),before=await f.store.read(),valid=`ad-resources:${id(2)}`;
 for(const input of [
  {keys:[valid,`ad-resources:${id(99)}`],projectId:'active'},
  {keys:[valid],projectId:'missing'},
  {keys:[valid,`channel-resources:${id(3)}:${encodeURIComponent('不存在')}`],projectId:'active'},
  {keys:[valid,'ad-resources:../../tasks.json'],projectId:'active'},
  {keys:[],projectId:'active'},{keys:Array(501).fill(valid),projectId:'active'},
  {keys:[valid],projectId:{}},{keys:[null],projectId:'active'}
 ]){await assert.rejects(()=>f.store.assign(input));assert.deepEqual(await f.store.read(),before);}
 assert.throws(()=>parseWorkbenchTaskKey(`channel-resources:${id(3)}:%zz`),/标识无效/);
});

test('concurrent requests retain every association and legacy channel item keys still work',async t=>{
 const f=await fixture(t);
 await Promise.all([f.store.assign({key:`ad-resources:${id(2)}`,projectId:'active'}),f.store.assign({key:`core:${id(1)}`,projectId:'archived'}),f.store.assign({key:'channel-resources:imported-1',projectId:'active'})]);
 const links=await f.store.read();assert.equal(links[`ad-resources:${id(2)}`],'active');assert.equal(links[`core:${id(1)}`],'archived');assert.equal(links['channel-resources:imported-1'],'active');assert.equal(links[`store-launch:${id(5)}`],'active');
});

test('historical channel sample groups resolve through the live module instead of a missing imported-jobs file',async t=>{
 const f=await fixture(t),group=`channel-resources:huawei-0922:${encodeURIComponent('赘婿')}`;
 const store=createWorkbenchProjectLinks({runtimeDir:f.dir,readChannelBatches:async()=>[{id:'huawei-0922',items:[{id:'HW0922-01',project:'赘婿'}]}]});
 await store.assign({key:group,projectId:'active'});assert.equal((await store.read())[group],'active');
 await assert.rejects(()=>store.assign({key:`channel-resources:huawei-0922:${encodeURIComponent('已删除项目')}`,projectId:'active'}),/任务不存在/);
});

test('filing moves the task and every source/history/delivery asset to one project, then supports unfiling',()=>{
 const core={tasks:[{id:id(1),project:'母版任务',status:'已完成',projectId:'old',assets:[{url:'/core.png',projectId:'old'}],artifacts:[{url:'/core-final.png'}]}],projects:[]};
 const ads={catalog:{sourceSha256:'s',specs:[{id:'one'}]},batches:[{id:id(2),project:'投放',sourceSha256:'s',assets:[{url:'/ad-source.png',projectId:'old'}],items:{one:{versions:[{number:1,url:'/v1.jpg'},{number:2,url:'/v2.jpg'}]}}}]};
 const channel={batches:[{id:id(3),items:[{id:'one',project:'组名',projectId:'old',sourceImages:[{url:'/channel.png'}],versions:[{url:'/channel-final.jpg'}]}]}]};
 const groupKey=`channel-resources:${id(3)}:${encodeURIComponent('组名')}`;
 const links={[`core:${id(1)}`]:'active',[`ad-resources:${id(2)}`]:'active',[groupKey]:'active'};
 const get=()=>taskIndex(core,[...groupAdBatchTasks(ads,links),...groupChannelBatchTasks(channel,links)],links);
 for(const task of get())assert.equal(taskBelongsToProject(task,'active'),true);
 assert.equal(assetIndex(core,get()).length,7);assert.ok(assetIndex(core,get()).every(a=>a.projectId==='active'&&a.sources.every(s=>s.projectId==='active')));
 links[`core:${id(1)}`]='';links[`ad-resources:${id(2)}`]='';links[groupKey]='';
 for(const task of get())assert.equal(taskBelongsToProject(task,'unfiled'),true);
 assert.ok(assetIndex(core,get()).every(a=>a.projectId===''));
});
