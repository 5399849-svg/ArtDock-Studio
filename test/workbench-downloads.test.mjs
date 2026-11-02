import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {Readable} from 'node:stream';
import {deflateRawSync} from 'node:zlib';
import sharp from 'sharp';
import {createStoreZip} from '../lib/core.mjs';
import {createWorkbenchDownloads,workbenchZipFiles} from '../lib/workbench-downloads.mjs';
import {createAdResourcesHandler} from '../lib/ad-resources-server.mjs';
import {downloadHomeTasks,dashboardTaskKey} from '../public/home-task-downloads.js';
import {groupAdBatchTasks,taskStatus} from '../public/workbench-model.js';

async function request(handler,url,body,method='POST'){
 const req=Readable.from(body===undefined?[]:[Buffer.from(JSON.stringify(body))]);req.method=method;req.headers={};
 let status,headers,buffer;const res={writeHead(s,h){status=s;headers=h;},end(value){buffer=Buffer.from(value||'');}};
 await handler(req,res,new URL(url,'http://local'));return {status,headers,buffer,json:()=>JSON.parse(buffer)};
}
const respond=(res,status,body,type='application/json',name='')=>{res.writeHead(status,{'Content-Type':type,...(name?{'Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(name)}`}:{})});res.end(Buffer.isBuffer(body)?body:Buffer.from(JSON.stringify(body)));};

function descriptorZip(name,data){
 const filename=Buffer.from(name),stored=deflateRawSync(data),local=Buffer.alloc(30),central=Buffer.alloc(46),end=Buffer.alloc(22),descriptor=Buffer.alloc(16);
 local.writeUInt32LE(0x04034b50);local.writeUInt16LE(0x808,6);local.writeUInt16LE(8,8);local.writeUInt16LE(filename.length,26);
 descriptor.writeUInt32LE(0x08074b50);descriptor.writeUInt32LE(stored.length,8);descriptor.writeUInt32LE(data.length,12);
 central.writeUInt32LE(0x02014b50);central.writeUInt16LE(0x808,8);central.writeUInt16LE(8,10);central.writeUInt32LE(stored.length,20);central.writeUInt32LE(data.length,24);central.writeUInt16LE(filename.length,28);
 const offset=local.length+filename.length+stored.length+descriptor.length;
 end.writeUInt32LE(0x06054b50);end.writeUInt16LE(1,8);end.writeUInt16LE(1,10);end.writeUInt32LE(central.length+filename.length,12);end.writeUInt32LE(offset,16);
 return Buffer.concat([local,filename,stored,descriptor,central,filename,end]);
}

test('ZIP unpacking preserves exact stored/deflated bytes, handles descriptors and refuses traversal or oversized content',()=>{
 const data=Buffer.from('原始成品像素字节'),name='成品/图1.png';
 for(const archive of [createStoreZip([{name,data}]),descriptorZip(name,data)])assert.deepEqual(workbenchZipFiles(archive),[{name,data}]);
 assert.throws(()=>workbenchZipFiles(descriptorZip('../越界.png',data)),/路径/);
 assert.throws(()=>workbenchZipFiles(descriptorZip('图.png',data),2),/分批下载/);
 assert.throws(()=>workbenchZipFiles(Buffer.from('not a zip')),/有效的 ZIP/);
});

test('one archive groups separate current task exports, renamed task names and duplicate folders; failures stay visible',async()=>{
 const calls=[],pixels=Buffer.from('same exact original image bytes');
 const handler=createWorkbenchDownloads({dispatch:async(req,res,url)=>{
   calls.push([req.method,url.pathname]);
   if(url.pathname.endsWith('/prepare-download'))return respond(res,200,{ready:true});
   if(url.pathname.includes('pending'))return respond(res,409,{error:'请先采用或放弃 AI 候选'});
   const name=url.pathname.includes('store')?'同名任务.zip':'同名任务_投放资源位.zip';
   return respond(res,200,createStoreZip([{name:'图_800x800.jpg',data:pixels}]),'application/zip',name);
 }});
 const result=await request(handler,'/api/workbench/task-downloads',{tasks:[{key:'ad-resources:one',label:'旧名称'},{key:'store-preorder:two',label:'同名任务'},{key:'core:pending',label:'尚未确认任务'},{key:'ad-resources:one',label:'重复选择'}]});
 assert.equal(result.status,200);assert.equal(result.headers['X-Workbench-Downloaded'],'2');assert.equal(result.headers['X-Workbench-Skipped'],'1');
 const files=workbenchZipFiles(result.buffer);assert.deepEqual(files.map(f=>f.name),['同名任务/图_800x800.jpg','同名任务_2/图_800x800.jpg','未下载任务.txt']);
 assert.deepEqual(files[0].data,pixels);assert.deepEqual(files[1].data,pixels);assert.match(files[2].data.toString(),/尚未确认任务.*\r\n请先采用或放弃 AI 候选/);
 assert.deepEqual(calls,[['POST','/api/ad-resources/batches/one/prepare-download'],['POST','/api/ad-resources/batches/one/download'],['GET','/api/store-preorder/jobs/two/package'],['GET','/api/tasks/pending/materials-package']]);
});

test('invalid selection is rejected before exports; an entirely blocked selection returns actionable JSON',async()=>{
 let calls=0;const handler=createWorkbenchDownloads({dispatch:async(_req,res)=>{calls++;respond(res,409,{error:'还没有可下载成品'});}});
 for(const tasks of [[],[{key:'ad-resources:../../escape'}],[{key:'not-supported:abc'}]])await assert.rejects(()=>request(handler,'/api/workbench/task-downloads',{tasks}),/任务选择|请选择/);
 assert.equal(calls,0);
 const result=await request(handler,'/api/workbench/task-downloads',{tasks:[{key:'core:empty',label:'空任务'}]});assert.equal(result.status,409);assert.equal(result.json().failures[0].reason,'还没有可下载成品');
});

test('channel selection is scoped to its exact batch/project and exports only reviewed current versions',async()=>{
 let approved=true;const reads=[];
 const handler=createWorkbenchDownloads({dispatch:async(_req,res)=>respond(res,200,{batches:[{id:'batch',items:[{id:'a',project:'甄嬛',taskName:'改过的名称',width:100,height:200,versions:[{file:'old.png',url:'/old.png'},{file:'new.png',url:'/new.png',downloadName:'新名字_100x200.png'}],review:{approved,versionFile:'new.png'}},{id:'other',project:'另一个项目',versions:[]}]}]}),readChannelFile:async(batch,url)=>{reads.push([batch.id,url]);return Buffer.from('latest-only');}});
 const input={tasks:[{key:'channel-resources:batch:'+encodeURIComponent('甄嬛'),label:'甄嬛'}]};
 const result=await request(handler,'/api/workbench/task-downloads',input);assert.deepEqual(workbenchZipFiles(result.buffer),[{name:'改过的名称/新名字_100x200.png',data:Buffer.from('latest-only')}]);assert.deepEqual(reads,[['batch','/new.png']]);
 approved=false;const blocked=await request(handler,'/api/workbench/task-downloads',input);assert.equal(blocked.status,409);assert.match(blocked.json().failures[0].reason,/验收/);assert.equal(reads.length,1);
});

test('bulk ad export completes only delivered tasks and tracks their exact versions without AI calls or duplicate versions',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'home-task-download-')),storageDir=path.join(root,'storage');await fs.mkdir(storageDir);
 t.after(()=>fs.rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:30}));
 const spec={id:'square',number:1,name:'测试资源位',width:100,height:100,format:'JPG',logo:'forbidden',maxBytes:300*1024};
 const ad=await createAdResourcesHandler({root,runtimeDir:root,storageDir,catalogProvider:async()=>({sourceSha256:'bulk-download-test',specs:[spec]}),nanoGenerate:()=>assert.fail('download must never generate images')});
 const ids=[];for(const color of ['#ff2222','#2244ff']){
   const created=await request(ad,'/api/ad-resources/batches',{project:'同名任务'}),id=created.json().batch.id;ids.push(id);
   const image=await sharp({create:{width:100,height:100,channels:3,background:color}}).composite([{input:Buffer.from('<svg width="100" height="100"><rect x="3" y="3" width="8" height="8" fill="white"/></svg>')}]).png().toBuffer();
   await request(ad,`/api/ad-resources/batches/${id}/assets`,{name:'无Logo.png',role:'visual',dataUrl:'data:image/png;base64,'+image.toString('base64')});
   await request(ad,`/api/ad-resources/batches/${id}/auto-generate`,{});
 }
 const view=(await request(ad,'/api/ad-resources',undefined,'GET')).json(),first=view.batches.find(b=>b.id===ids[0]);
 // Preview GETs and exports rejected by the aggregate budget must not complete tasks.
 await request(ad,`/api/ad-resources/batches/${ids[0]}/download`,undefined,'GET');
 for(const options of [{maxPackageBytes:1},{maxPackageFiles:1}])await assert.rejects(()=>request(ad,`/api/ad-resources/batches/${ids[0]}/download`,options),{status:413});
 const uncommitted=(await request(ad,'/api/ad-resources',undefined,'GET')).json();assert.ok(uncommitted.batches.every(b=>!b.downloadedAt));
 await request(ad,`/api/ad-resources/batches/${ids[0]}/items/square/draft`,{...first.items.square.draft,zoom:1.1},'PUT');
 const empty=(await request(ad,'/api/ad-resources/batches',{project:'未生成任务'})).json().batch.id;
 const handler=createWorkbenchDownloads({dispatch:ad}),input={tasks:[...ids.map(id=>({key:'ad-resources:'+id,label:'同名任务'})),{key:'ad-resources:'+empty,label:'未生成任务'}]};
 const result=await request(handler,'/api/workbench/task-downloads',input);assert.equal(result.status,200);
 assert.equal(result.headers['X-Workbench-Downloaded'],'2');assert.equal(result.headers['X-Workbench-Skipped'],'1');
 const files=workbenchZipFiles(result.buffer),images=files.filter(f=>f.name.endsWith('.jpg'));assert.equal(images.length,2);assert.equal(new Set(images.map(f=>f.name)).size,2);
 for(const [i,file]of images.entries()){const rgb=await sharp(file.data).extract({left:50,top:50,width:1,height:1}).raw().toBuffer();assert.ok(i===0?rgb[0]>rgb[2]*2:rgb[2]>rgb[0]*2);}
 for(const file of files.filter(file=>file.name.endsWith('/交付清单.json')))assert.ok(JSON.parse(file.data).outputs.every(output=>output.confirmed));
 const after=(await request(ad,'/api/ad-resources',undefined,'GET')).json();assert.equal(after.batches.find(b=>b.id===ids[0]).items.square.versions.length,2);
 for(const task of groupAdBatchTasks(after).filter(task=>ids.includes(task.id))){assert.equal(taskStatus(task),'已完成');assert.equal(task.deliveredVersions.square,task.items.square.versions.at(-1).number);}
 assert.equal(after.batches.find(b=>b.id===empty).downloadedAt,undefined);
 await request(handler,'/api/workbench/task-downloads',input);const again=(await request(ad,'/api/ad-resources',undefined,'GET')).json();assert.equal(again.batches.find(b=>b.id===ids[0]).items.square.versions.length,2);
 const delivered=again.batches.find(b=>b.id===ids[0]);await request(ad,`/api/ad-resources/batches/${ids[0]}/items/square/draft`,{...delivered.items.square.draft,zoom:1.2},'PUT');
 const edited=(await request(ad,'/api/ad-resources',undefined,'GET')).json();assert.notEqual(taskStatus(groupAdBatchTasks(edited).find(task=>task.id===ids[0])),'已完成');
});

test('browser makes one download request and one ZIP save, retaining group identities and reporting blocked selections',async()=>{
 const calls=[],saved=[],tasks=[{id:'same',module:'core',project:'任务1'},{id:'same',module:'ad-resources',project:'任务2'},{id:'same',module:'core',project:'重复'}];
 assert.equal(dashboardTaskKey({key:'channel-resources:batch:'+encodeURIComponent('甄嬛'),id:'item',module:'channel-resources'}),'channel-resources:batch:'+encodeURIComponent('甄嬛'));
 const result=await downloadHomeTasks(tasks,{fetchImpl:async(url,input)=>{calls.push([url,JSON.parse(input.body)]);return new Response('archive',{headers:{'X-Workbench-Downloaded':'1','X-Workbench-Skipped':'1'}});},save:(blob,name)=>saved.push({blob,name})});
 assert.equal(calls.length,1);assert.equal(calls[0][1].tasks.length,2);assert.equal(saved.length,1);assert.equal(saved[0].name,'任务成品_1项.zip');assert.deepEqual(result,{downloaded:1,skipped:1});
 await assert.rejects(()=>downloadHomeTasks(tasks,{fetchImpl:async()=>Response.json({failures:[{label:'任务1',reason:'请先采用候选'}]},{status:409}),save:()=>assert.fail('blocked tasks cannot download')}),/任务1：请先采用候选/);
});
