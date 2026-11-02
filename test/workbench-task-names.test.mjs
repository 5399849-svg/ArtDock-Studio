import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createWorkbenchTaskNames} from '../lib/workbench-task-names.mjs';
import {loadWorkbenchIndex,taskIndex} from '../public/workbench-model.js';

const id='00000000-0000-4000-8000-000000000001';
const modules={core:'tasks.json','ad-resources':'ad-resources-jobs.json','channel-resources':'channel-resource-jobs.json','store-preorder':'store-preorder-jobs.json','store-launch':'store-launch-jobs.json','icon-preorder':'icon-preorder-jobs.json','icon-launch':'icon-launch-jobs.json'};
async function fixture(t){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'task-names-'));t.after(()=>fs.rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:30}));
  const originals={};
  for(const [module,file]of Object.entries(modules)){
    const row={id,project:'原素材名称',projectId:'project',status:'complete',downloadedAt:'today',deliveredVersions:{one:3},assets:[{url:'/source.png'}],items:module==='channel-resources'?[{id:'child',project:'原素材名称'}]:{one:{draft:{logoY:.8},versions:[{number:3,storageName:'original.jpg'}]}}};
    originals[file]=JSON.stringify([row]);await fs.writeFile(path.join(dir,file),originals[file]);
  }
  return {dir,originals,store:createWorkbenchTaskNames({runtimeDir:dir})};
}

test('renames every task type independently and survives reload without changing production files',async t=>{
  const f=await fixture(t);assert.deepEqual(await f.store.read(),{});
  const keys=Object.keys(modules).map(module=>`${module}:${id}${module==='channel-resources'?':'+encodeURIComponent('原素材名称'):''}`);
  await Promise.all(keys.map((key,index)=>f.store.rename({key,name:` 新任务 ${index} `})));
  const names=await createWorkbenchTaskNames({runtimeDir:f.dir}).read();
  keys.forEach((key,index)=>assert.equal(names[key],`新任务 ${index}`));
  for(const [file,original]of Object.entries(f.originals))assert.equal(await fs.readFile(path.join(f.dir,file),'utf8'),original,'assets, approvals, versions and files retain their original identities');
  await f.store.rename({key:keys[2],name:'再次修改渠道任务'});
  assert.equal((await f.store.read())[keys[2]],'再次修改渠道任务','renaming must not change the channel grouping key');
});

test('invalid names and missing tasks fail without writing metadata',async t=>{
  const f=await fixture(t),key=`ad-resources:${id}`;
  for(const input of [{key,name:''},{key,name:'  '},{key,name:'a'.repeat(101)},{key,name:'a\nb'},{key,name:5},{key:'ad-resources:../../x',name:'x'},{key:`icon-launch:${id.replace(/1$/,'9')}`,name:'x'},{key:`channel-resources:${id}:missing`,name:'x'}])await assert.rejects(()=>f.store.rename(input));
  assert.deepEqual(await f.store.read(),{});await assert.rejects(fs.stat(path.join(f.dir,'workbench-task-names.json')),{code:'ENOENT'});
});

test('task and asset labels use persisted names while navigation, filing and delivery state stay intact',async()=>{
  const batch={id,project:'原素材名称',projectId:'p',status:'complete',reviewed:true,source:{url:'/source.png'},outputs:[{url:'/final.jpg'}]};
  const data={tasks:[],projects:[]},key=`store-launch:${id}`;
  const calls=[];
  const api=async url=>{
    calls.push(url);
    if(url==='/api/workbench/task-names')return {[key]:'修改后的名称'};
    if(url==='/api/workbench/project-links')return {[key]:'chosen-project'};
    if(url==='/api/store-launch/jobs')return [batch];
    if(url.endsWith('/jobs'))return [];
    if(url.endsWith('/specs'))return {specs:[]};
    return {};
  };
  const before=JSON.stringify(batch),index=await loadWorkbenchIndex(data,api),row=index.tasks[0];
  assert.equal(row.label,'修改后的名称');assert.equal(row.project,'修改后的名称');assert.equal(row.sourceProject,'原素材名称');
  assert.equal(row.key,key);assert.equal(row.id,id);assert.equal(row.projectId,'chosen-project');assert.equal(row.statusLabel,'已完成');
  assert.equal(index.assets[0].taskLabel,'修改后的名称');assert.equal(JSON.stringify(batch),before);
  assert.equal(calls.filter(url=>url==='/api/workbench/task-names').length,1);
  assert.equal(taskIndex({tasks:[{id,project:'旧任务'}]},[],{}, {[`core:${id}`]:'新任务'})[0].project,'新任务');
});
