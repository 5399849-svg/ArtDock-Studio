import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createRecycleBin} from '../lib/recycle-bin.mjs';
import {createAssetLibraryCleanup} from '../lib/asset-library-cleanup.mjs';
import {assetIndex,taskIndex} from '../public/workbench-model.js';
import {assetLibraryKey} from '../public/asset-library-key.js';
const write=(file,value)=>fs.writeFile(file,JSON.stringify(value));
async function fixture(t,files=fs){
 const runtimeDir=await fs.mkdtemp(path.join(os.tmpdir(),'recycle-test-')),storageDir=path.join(runtimeDir,'storage');await fs.mkdir(storageDir);
 t.after(()=>fs.rm(runtimeDir,{recursive:true,force:true}));
 const state={tasks:[]},bin=await createRecycleBin({runtimeDir,storageDir,files});
 const register=b=>b.register('core',{list:()=>state.tasks.map(data=>({key:'core:'+data.id,folder:data.id,data,label:data.project||data.id,busy:data.busy})),drop:async key=>{state.tasks=state.tasks.filter(t=>'core:'+t.id!==key);},dropAsset:async a=>{for(const t of state.tasks)t.assets=t.assets?.filter(x=>x.url!==a.url);}});register(bin);
 const file=async(relative,content='pixels')=>{const target=path.join(storageDir,relative);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,content);return '/storage/'+relative.split(path.sep).join('/');};
 const sourceIndex=async()=>({assets:assetIndex({},taskIndex({tasks:state.tasks})),projects:[],missing:[]});
 const cleanup=createAssetLibraryCleanup({runtimeDir,storageDir,recycleBin:bin,sourceIndex});
 return {runtimeDir,storageDir,state,bin,register,file,cleanup,sourceIndex};
}
async function trashAssets(f,assets){const ids=assets.map(assetLibraryKey),p=await f.cleanup.preview({ids});return f.cleanup.erase({ids,token:p.token,requestId:'trash-assets-request'});}
async function purge(f,ids,requestId='purge-request-1'){const p=await f.bin.preview({ids});return f.bin.purge({ids,token:p.token,requestId});}
test('soft deletion and restart preserve exact task, all versions and original file bytes',async t=>{
 const f=await fixture(t);const url=await f.file('p/assets/role.png');f.state.tasks=[{id:'p',project:'历史任务',assets:[{url}],version:4,history:[1,2,3,4],versions:[{layout:{x:7},url}]}];const before=structuredClone(f.state.tasks);
 const result=await f.bin.trashTask('core:p');assert.ok(f.bin.isTaskHidden('core:p'));assert.deepEqual(f.state.tasks,before);assert.equal(await fs.readFile(path.join(f.storageDir,'p/assets/role.png'),'utf8'),'pixels');
 const restarted=await createRecycleBin(f);f.register(restarted);assert.ok(restarted.isTaskHidden('core:p'));await restarted.restore({ids:[result.id]});assert.equal(restarted.isTaskHidden('core:p'),false);assert.deepEqual(f.state.tasks,before);
});
test('purge estimates exact unique bytes and protects current, historical, template and trash references',async t=>{
 const f=await fixture(t);for(const name of ['free','used','history','template','trashed'])await f.file(`p/assets/${name}.png`,name);
 const url=n=>`/storage/p/assets/${n}.png`;f.state.tasks=[{id:'p',assets:[]},{id:'q',assets:[{url:url('used')}],versions:[{url:url('history')}]},{id:'r',assets:[{url:url('trashed')}]}];
 await write(path.join(f.runtimeDir,'projects.json'),[{designTemplates:[{snapshotFile:await f.file('project/templates/save.json',JSON.stringify({url:url('template')}))}]}]);
 await f.bin.trashTask('core:r');const {id}=await f.bin.trashTask('core:p'),p=await f.bin.preview({ids:[id]});assert.equal(p.freeBytes,4);assert.equal(p.retainedFiles,4);const result=await f.bin.purge({ids:[id],token:p.token,requestId:'purge-request-1'});assert.equal(result.freedBytes,4);assert.equal(f.state.tasks.length,2);assert.equal(await fs.readFile(path.join(f.storageDir,'p/assets/history.png'),'utf8'),'history');assert.deepEqual(await f.bin.purge({ids:[id],token:p.token,requestId:'purge-request-1'}),result);
});
test('assets are restorable; current/historical ID aliases stay safe while unused files are freed only on purge',async t=>{
 const f=await fixture(t);const asset=async(name,id=name)=>({name,id,url:await f.file(`p/assets/${name}`),mime:'image/png'});const used=await asset('used.png'),unused=await asset('unused.png'),old=await asset('old.png','old-id');
 f.state.tasks=[{id:'p',assets:[used,unused,old,{...old,id:'alias-id'}],parameters:{assetByTemplate:{master:{background:'used.png'}}},versions:[{character:'ALIAS-ID'}]}];
 const before=structuredClone(f.state.tasks),assets=(await f.sourceIndex()).assets;const result=await trashAssets(f,assets);assert.equal(result.freedBytes,0);assert.deepEqual(f.state.tasks,before);
 const p=await f.bin.preview({ids:result.ids});assert.equal(p.purgeFiles,1);assert.equal(p.retainedFiles,2);
 await f.bin.restore({ids:result.ids});assert.equal((await f.cleanup.index()).assets.length,3);assert.deepEqual(f.state.tasks,before);
 const plan=await f.cleanup.preview({ids:assets.map(assetLibraryKey)}),again=await f.cleanup.erase({ids:assets.map(assetLibraryKey),token:plan.token,requestId:'trash-assets-2'});await purge(f,again.ids);assert.equal(f.state.tasks[0].assets.length,3);await fs.access(path.join(f.storageDir,'p/assets/old.png'));await assert.rejects(fs.access(path.join(f.storageDir,'p/assets/unused.png')),{code:'ENOENT'});
});
test('new references, file changes and background jobs block stale purge',async t=>{
 const f=await fixture(t),url=await f.file('p/assets/free.png');f.state.tasks=[{id:'p'},{id:'q'}];const {id}=await f.bin.trashTask('core:p'),ids=[id],preview=await f.bin.preview({ids});f.state.tasks[1].url=url;
 await assert.rejects(f.bin.purge({ids,token:preview.token,requestId:'stale-request-1'}),/已变化/);await fs.access(path.join(f.storageDir,'p/assets/free.png'));
 delete f.state.tasks[1].url;const p=await f.bin.preview({ids});await f.file('p/assets/free.png','changed');await assert.rejects(f.bin.purge({ids,token:p.token,requestId:'stale-request-2'}),/已变化/);
 f.state.tasks[1].busy=true;await assert.rejects(f.bin.preview({ids}),/正在生成/);f.state.tasks[1].busy=false;await write(path.join(f.runtimeDir,'jobs.json'),[{status:'running'}]);await assert.rejects(f.bin.preview({ids}),/正在生成/);
});
test('restoring an asset also restores its task; task purge includes dependent asset entries',async t=>{
 const f=await fixture(t),url=await f.file('p/assets/role.png');f.state.tasks=[{id:'p',assets:[{name:'role.png',url,mime:'image/png'}],versions:[{url}]}];const assets=await trashAssets(f,(await f.sourceIndex()).assets),task=await f.bin.trashTask('core:p');
 const restored=await f.bin.restore({ids:assets.ids});assert.equal(restored.restoredParents,1);assert.equal((await f.bin.list()).items.length,0);
 const p=await f.cleanup.preview({ids:(await f.sourceIndex()).assets.map(assetLibraryKey)});await f.cleanup.erase({ids:(await f.sourceIndex()).assets.map(assetLibraryKey),token:p.token,requestId:'trash-assets-again'});const next=await f.bin.trashTask('core:p');const estimate=await f.bin.preview({ids:[next.id]});assert.equal(estimate.count,2);assert.equal(estimate.purgeFiles,1);await purge(f,[next.id]);assert.equal((await f.bin.list()).items.length,0);
});
test('partial unlink failure retains recovery record and permits safe retry without falsely completing',async t=>{
 let fails=true;const f=await fixture(t,{...fs,unlink:async file=>{if(fails&&file.endsWith('b.png'))throw Error('file is locked');return fs.unlink(file);}});await f.file('p/assets/a.png');await f.file('p/assets/b.png');f.state.tasks=[{id:'p',versions:[1,2]}];const {id}=await f.bin.trashTask('core:p');
 const first=await purge(f,[id]);assert.equal(first.done,false);assert.equal(f.state.tasks.length,1);assert.equal((await f.bin.list()).items[0].status,'purging');await assert.rejects(f.bin.restore({ids:[id]}),/已变化/);fails=false;const second=await purge(f,[id],'purge-retry-2');assert.ok(second.done);assert.equal(f.state.tasks.length,0);
});
test('purge drains in-flight writes without queue deadlock and rejects new writes',async t=>{
 const f=await fixture(t);await f.file('p/assets/a.png');f.state.tasks=[{id:'p'}];const {id}=await f.bin.trashTask('core:p'),ids=[id],p=await f.bin.preview({ids});const finish=f.bin.beginMutation();const running=f.bin.purge({ids,token:p.token,requestId:'purge-request-1'});assert.throws(()=>f.bin.beginMutation(),/正在清空/);await f.bin.trashAssets([], 'pending-write-1');finish();assert.equal((await running).done,true);
});
test('path traversal, symlinks and hard-linked shared files are never unlinked',async t=>{
 const f=await fixture(t),outside=path.join(f.runtimeDir,'outside.png');await fs.writeFile(outside,'outside');await f.file('p/assets/a.png');await fs.link(outside,path.join(f.storageDir,'p/assets/hard.png'));await fs.symlink(path.dirname(outside),path.join(f.storageDir,'p/link'),'junction');f.state.tasks=[{id:'p'}];const {id}=await f.bin.trashTask('core:p');const p=await f.bin.preview({ids:[id]});assert.equal(p.purgeFiles,1);assert.equal(p.retainedFiles,2);await purge(f,[id]);assert.equal(await fs.readFile(outside,'utf8'),'outside');await fs.access(path.join(f.storageDir,'p/assets/hard.png'));
 await f.bin.trashAssets([{url:'/storage/p/assets/%2E%2E%2F%2E%2E%2Foutside.png',recycleAssetId:'bad',name:'bad'}]);const item=(await f.bin.list()).items[0];assert.equal((await f.bin.preview({ids:[item.id]})).purgeFiles,0);
});
test('same batch sibling tasks protect the whole shared directory until the last task is purged',async t=>{
 const f=await fixture(t);await f.file('batch/output/a.png');let rows=[{key:'channel-resources:a:x',folder:'batch',data:{}},{key:'channel-resources:a:y',folder:'batch',data:{}}];f.bin.register('channel-resources',{list:()=>rows,drop:key=>{rows=rows.filter(r=>r.key!==key);}});const a=await f.bin.trashTask(rows[0].key);assert.equal((await f.bin.preview({ids:[a.id]})).freeBytes,0);await purge(f,[a.id]);const b=await f.bin.trashTask(rows[0].key);assert.equal((await f.bin.preview({ids:[b.id]})).freeBytes,6);await purge(f,[b.id],'purge-request-2');
});
test('shared asset can restore via its surviving owner after another owner was purged',async t=>{
 const f=await fixture(t),url=await f.file('p/assets/shared.png');const asset={url,name:'shared.png',mime:'image/png'};f.state.tasks=[{id:'p',assets:[asset]},{id:'q',assets:[asset]}];
 const selected=await trashAssets(f,(await f.sourceIndex()).assets),p=await f.bin.trashTask('core:p');await purge(f,[p.id]);assert.equal((await f.bin.list()).items.length,1);await f.bin.restore({ids:selected.ids});assert.equal((await f.cleanup.index()).assets.length,1);await fs.access(path.join(f.storageDir,'p/assets/shared.png'));
});
test('asset purge retry removes metadata for files already removed during the failed attempt',async t=>{
 let fails=true;const f=await fixture(t,{...fs,unlink:async file=>{if(fails&&file.endsWith('b.png'))throw Error('locked');return fs.unlink(file);}});const asset=async name=>({name,url:await f.file(`p/assets/${name}`),mime:'image/png'});
 f.state.tasks=[{id:'p',assets:[await asset('first.png'),await asset('a.png'),await asset('b.png')],parameters:{assetByTemplate:{master:{background:'first.png'}}}}];const selected=await trashAssets(f,(await f.sourceIndex()).assets.filter(a=>a.name!=='first.png'));assert.equal((await purge(f,selected.ids)).done,false);fails=false;await purge(f,selected.ids,'retry-assets-2');assert.deepEqual(f.state.tasks[0].assets.map(a=>a.name),['first.png']);
});
test('an unrelated candidate awaiting review does not block cleanup; an active writer does',async t=>{
 const f=await fixture(t);await f.file('p/assets/a.png');f.state.tasks=[{id:'p'}];let writing=false;f.bin.register('ad-resources',{list:()=>[{key:'ad-resources:waiting',folder:'ad-resources-waiting',data:{},busy:true,purgeBusy:writing}],drop:()=>{}});const {id}=await f.bin.trashTask('core:p');assert.equal((await f.bin.preview({ids:[id]})).freeBytes,6);writing=true;await assert.rejects(f.bin.preview({ids:[id]}),/正在生成/);
});
