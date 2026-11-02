import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {Readable} from 'node:stream';
import {File} from 'node:buffer';
import sharp from 'sharp';
import {createAdBulkSession,adBulkTaskName,AD_BULK_MAX_TASKS} from '../public/ad-bulk-create.js';
import {createAdResourcesHandler} from '../lib/ad-resources-server.mjs';
import {groupAdBatchTasks} from '../public/workbench-model.js';
const file=(name='秋千原图.png')=>new File(['png'],name,{type:'image/png',lastModified:123});
const inputs=()=>({visuals:['秋千原图.png','化妆人原图.png','眉笔原图.png'].map(name=>({file:file(name),taskName:adBulkTaskName(name)})),projectId:'game-a',projectLogoId:'shared-logo'});

test('a selection creates separate workbenches first, then imports one visual per task with one upload at a time',async()=>{
 const calls=[],uploads=[],created=new Map();let inflight=0,maximum=0;
 const session=createAdBulkSession(inputs(),{api:async(url,options)=>{calls.push({url,input:JSON.parse(options.body)});if(url.endsWith('/batches')){const input=JSON.parse(options.body),id='batch-'+created.size;created.set(input.requestId,id);return {batch:{id}};}return {generated:10,total:10,errors:[],pending:[]};},upload:async(id,f,options)=>{assert.equal(created.size,3);maximum=Math.max(maximum,++inflight);uploads.push({id,file:f,options});await new Promise(r=>setTimeout(r,2));inflight--;return {asset:{id:id+'-visual'}};}});
 const run=session.run();assert.equal(session.run(),run);await run;
 assert.equal(session.completed,3);assert.equal(created.size,3);assert.equal(maximum,1);assert.equal(calls.length,6);assert.equal(uploads.length,3);
 assert.ok(calls.slice(0,3).every(c=>c.url.endsWith('/batches')&&c.input.projectId==='game-a'&&c.input.projectLogoId==='shared-logo'));
 assert.equal(new Set(uploads.map(u=>u.id)).size,3);assert.deepEqual(uploads.map(u=>u.file.name),inputs().visuals.map(v=>v.file.name));assert.ok(session.rows.every(r=>r.uploads[0].file===null));
});
test('a lost creation receipt and a failed upload do not stop other tasks; retries retain creation and upload IDs',async()=>{
 const created=new Map(),uploaded=new Map(),calls=[];let lostCreate=false,lostUpload=false;
 const session=createAdBulkSession(inputs(),{api:async(url,options)=>{const input=JSON.parse(options.body);calls.push({url,input});if(url.endsWith('/batches')){if(!created.has(input.requestId))created.set(input.requestId,'batch-'+created.size);if(!lostCreate){lostCreate=true;throw Error('creation reply lost');}return {batch:{id:created.get(input.requestId)}};}return {errors:[],pending:[]};},upload:async(id,f,options)=>{if(!uploaded.has(options.requestId))uploaded.set(options.requestId,id);if(!lostUpload){lostUpload=true;throw Error('upload reply lost');}return {asset:{id:uploaded.get(options.requestId)}};}});
 await session.run();assert.equal(session.failed,2);assert.equal(session.completed,1);const retained=session.rows.map(r=>r.id);await session.run();assert.equal(session.completed,3);assert.equal(created.size,3);assert.equal(uploaded.size,3);assert.deepEqual(session.rows.map(r=>r.id),retained);
 const creations=calls.filter(c=>c.url.endsWith('/batches'));assert.equal(creations[0].input.requestId,creations.at(-1).input.requestId);
});
test('retrying partially generated sizes reuses the task and its uploaded files; pending motion is reported separately',async()=>{
 let creates=0,uploads=0,generations=0;const session=createAdBulkSession({visuals:inputs().visuals.slice(0,1),logos:[{file:file('logo.png')}]},{api:async(url)=>{if(url.endsWith('/batches')){creates++;return {batch:{id:'same-batch'}};}generations++;return generations===1?{errors:['一个尺寸待调整'],pending:[]}:{errors:[],pending:[{specId:'gif'}]};},upload:async()=>({asset:{id:'asset-'+(++uploads)}})});
 await session.run();assert.equal(session.rows[0].stage,'partial');await session.run();assert.equal(session.rows[0].stage,'motion');assert.equal(creates,1);assert.equal(uploads,2);assert.equal(generations,2);assert.match(session.rows[0].message,/动效制作中/);
});
test('invalid bulk input fails before requests and a detached progress listener cannot abort the queue',async()=>{
 const deps={api:()=>assert.fail('must not call'),upload:()=>assert.fail('must not upload')};
 assert.throws(()=>createAdBulkSession({visuals:[]},deps),/1–20/);assert.throws(()=>createAdBulkSession({visuals:Array(AD_BULK_MAX_TASKS+1).fill(inputs().visuals[0])},deps),/1–20/);assert.throws(()=>createAdBulkSession({visuals:[{file:file(),taskName:' '}]},deps),/名称/);assert.throws(()=>createAdBulkSession({...inputs(),logos:[{file:file()},{file:file()}]},deps),/一张/);
 const session=createAdBulkSession({visuals:inputs().visuals.slice(0,1)},{api:async url=>url.endsWith('/batches')?{batch:{id:'one'}}:{errors:[],pending:[]},upload:async()=>({asset:{id:'one'}})});let count=0;session.subscribe(()=>{if(++count>1)throw Error('page detached');});await session.run();assert.equal(session.completed,1);
});

const catalog={sourceName:'isolated.xlsx',sourceSha256:'bulk-test-sheet',specs:[{id:'landscape',number:1,row:3,platform:'测试',name:'横版',width:320,height:180,format:'JPG',maxBytes:null,limitRaw:'无',logo:'forbidden'},{id:'logo',number:2,row:4,platform:'测试',name:'横版带Logo',width:320,height:180,format:'JPG',maxBytes:null,limitRaw:'无',logo:'required'}]};
async function call(handle,method,route,body,{raw=false}={}){
 const req=Readable.from(body?[raw?body:Buffer.from(JSON.stringify(body))]:[]);req.method=method;req.headers=raw?{'content-type':'application/octet-stream','content-length':String(body.length)}:{};let status,headers,data;
 await handle(req,{writeHead(s,h){status=s;headers=h;},end(value){data=value;}},new URL(route,'http://localhost'));
 return {status,headers,body:headers['Content-Type']?.includes('json')?JSON.parse(String(data)):data};
}
async function fixture(t,options={}){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'ad-bulk-test-')),runtimeDir=path.join(root,'runtime'),storageDir=path.join(runtimeDir,'storage');await fs.mkdir(storageDir,{recursive:true});t.after(()=>fs.rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:50}));
 const old={id:'old-task',project:'之前已完成',sourceSha256:catalog.sourceSha256,assets:[],items:{},downloadedAt:'2026-10-20'};await fs.writeFile(path.join(runtimeDir,'ad-resources-jobs.json'),JSON.stringify([old]));
 const logo=await sharp({create:{width:50,height:20,channels:4,background:'#245ca3'}}).png().toBuffer();let copies=0;
 const projectLogos={projects:async()=>[{id:'game-a',name:'游戏A',defaultLogoId:'shared-logo',assets:[]}],copyToTask:async({projectId,logoId,folder,bucket})=>{if(!projectId||logoId==='')return null;if(options.delayLogo)await new Promise(r=>setTimeout(r,10));copies++;const dir=path.join(storageDir,folder,bucket);await fs.mkdir(dir,{recursive:true});const file='shared-logo.png';await fs.writeFile(path.join(dir,file),logo);return {id:'logo-'+folder,name:'项目Logo',role:'logo',url:`/storage/${folder}/${bucket}/${file}`,file,width:50,height:20};}};
 const make=()=>createAdResourcesHandler({root,runtimeDir,storageDir,catalogProvider:async()=>catalog,outputPolicyProvider:()=>null,projectLogos,nanoGenerate:()=>assert.fail('Bulk creation must not initiate real AI in tests'),...options});const handle=await make();
 const api=async(url,options)=>{const result=await call(handle,options?.method||'GET',url,options?JSON.parse(options.body):undefined);return result.body;};
 const upload=async(id,f,options)=>{const result=await call(handle,'POST',`/api/ad-resources/batches/${id}/assets/upload?name=${encodeURIComponent(f.name)}&role=${options.role}&requestId=${options.requestId}`,Buffer.from(await f.arrayBuffer()),{raw:true});return result.body;};
 return {root,runtimeDir,storageDir,handle,make,api,upload,old,get copies(){return copies}};
}
test('real isolated creation produces three task cards, independent sources, versions, project Logos and ZIP names',async t=>{
 const f=await fixture(t),colors=['#cf9f50','#6d98b8','#a478a3'],visuals=[];
 for(const[n,name]of ['秋千原图.png','化妆人原图.png','眉笔原图.png'].entries())visuals.push({taskName:adBulkTaskName(name),file:new File([await sharp({create:{width:320,height:180,channels:3,background:colors[n]}}).png().toBuffer()],name,{type:'image/png'})});
 const session=createAdBulkSession({visuals,projectId:'game-a',projectLogoId:'shared-logo'},{api:f.api,upload:f.upload});await session.run();assert.equal(session.completed,3,JSON.stringify(session.rows.map(r=>r.error)));assert.equal(f.copies,3);
 const data=(await call(f.handle,'GET','/api/ad-resources')).body;assert.equal(data.batches.length,4);assert.deepEqual(data.batches.find(b=>b.id===f.old.id),f.old);const indexed=groupAdBatchTasks(data);assert.equal(indexed.filter(t=>session.rows.some(r=>r.batchId===t.id)).length,3);
 for(const row of session.rows){const batch=data.batches.find(b=>b.id===row.batchId);assert.equal(batch.projectId,'game-a');assert.equal(batch.assets.filter(a=>a.role==='visual').length,1);assert.equal(batch.items.landscape.versions.length,1);assert.equal(batch.items.logo.versions.length,1);const zip=await call(f.handle,'GET',`/api/ad-resources/batches/${batch.id}/download`);assert.equal(zip.status,200);assert.ok(zip.body.includes(Buffer.from(row.name+'_320x180.jpg')));assert.ok(zip.body.includes(Buffer.from(row.name+'_lg_320x180.jpg')));}
 const before=JSON.stringify(data.batches.filter(b=>b.id!==session.rows[0].batchId));await call(f.handle,'PUT',`/api/ad-resources/batches/${session.rows[0].batchId}/items/landscape/draft`,{...data.batches.find(b=>b.id===session.rows[0].batchId).items.landscape.draft,zoom:1.1});assert.equal(JSON.stringify((await call(f.handle,'GET','/api/ad-resources')).body.batches.filter(b=>b.id!==session.rows[0].batchId)),before);
});
test('concurrent creation retries and restart reuse one durable task, rejecting changed names or projects',async t=>{
 const f=await fixture(t,{delayLogo:true}),input={project:'独立任务',projectId:'game-a',projectLogoId:'shared-logo',requestId:'creation-receipt-123',sourceIdentity:'file-1'};
 const results=await Promise.all([call(f.handle,'POST','/api/ad-resources/batches',input),call(f.handle,'POST','/api/ad-resources/batches',input)]);assert.equal(results[0].body.batch.id,results[1].body.batch.id);assert.equal(f.copies,1);
 const restarted=await f.make(),again=await call(restarted,'POST','/api/ad-resources/batches',input);assert.equal(again.body.batch.id,results[0].body.batch.id);await assert.rejects(()=>call(restarted,'POST','/api/ad-resources/batches',{...input,project:'更改名称'}),/内容已变化/);assert.equal((await call(restarted,'GET','/api/ad-resources')).body.batches.length,2);
});
test('binary upload receipts prevent duplicate files after reply loss, concurrency and restart, while changed content rejects',async t=>{
 const f=await fixture(t),batch=(await call(f.handle,'POST','/api/ad-resources/batches',{project:'导入回执'})).body.batch,route=`/api/ad-resources/batches/${batch.id}/assets/upload?name=source.png&role=visual&requestId=upload-receipt-123`,image=await sharp({create:{width:320,height:180,channels:3,background:'#78aacc'}}).png().toBuffer();
 const [a,b]=await Promise.all([call(f.handle,'POST',route,image,{raw:true}),call(f.handle,'POST',route,image,{raw:true})]);assert.equal(a.body.asset.id,b.body.asset.id);const files=await fs.readdir(path.join(f.storageDir,'ad-resources-'+batch.id,'asset'));
 const restarted=await f.make(),again=await call(restarted,'POST',route,image,{raw:true});assert.equal(again.body.asset.id,a.body.asset.id);assert.equal(again.body.deduplicated,true);assert.deepEqual(await fs.readdir(path.join(f.storageDir,'ad-resources-'+batch.id,'asset')),files);
 const changed=await sharp(image).negate().png().toBuffer();await assert.rejects(()=>call(restarted,'POST',route,changed,{raw:true}),/内容已变化/);assert.equal((await call(restarted,'GET','/api/ad-resources')).body.batches.find(b=>b.id===batch.id).assets.length,1);
});
test('overlapping auto-generation requests share one run and cannot overwrite manual work during processing',async t=>{
 const f=await fixture(t),batch=(await call(f.handle,'POST','/api/ad-resources/batches',{project:'自动制作重试'})).body.batch,image=await sharp({create:{width:320,height:180,channels:3,background:'#78aacc'}}).png().toBuffer();await call(f.handle,'POST',`/api/ad-resources/batches/${batch.id}/assets/upload?name=source.png`,image,{raw:true});
 const first=call(f.handle,'POST',`/api/ad-resources/batches/${batch.id}/auto-generate`,{}),second=call(f.handle,'POST',`/api/ad-resources/batches/${batch.id}/auto-generate`,{});await new Promise(r=>setTimeout(r,2));await assert.rejects(()=>call(f.handle,'PUT',`/api/ad-resources/batches/${batch.id}/items/landscape/draft`,{zoom:2}),/正在自动制作/);const [a,b]=await Promise.all([first,second]);assert.deepEqual(a.body,b.body);const result=(await call(f.handle,'GET','/api/ad-resources')).body.batches.find(b=>b.id===batch.id);assert.equal(result.items.landscape.versions.length,1);assert.equal(result.items.logo.versions.length,1);
});
test('UI exposes the mode switch, per-file names, shared Logo and per-task workbench links',async()=>{
 const source=await fs.readFile(new URL('../public/ad-resources.js',import.meta.url),'utf8');for(const part of ['data-ad-create-mode="bulk"','data-ad-bulk-name=','共用 Logo','data-ad-bulk-open=','继续处理未完成任务','收起进度'])assert.ok(source.includes(part),part);assert.match(source,/createMode==='bulk'/);assert.match(source,/startAdBulkSession\(/);
});

test('independent recent-task cards show active automatic creation without combining the tasks',()=>{
 const data={catalog,batches:[{id:'one',project:'秋千',sourceSha256:catalog.sourceSha256,items:{},assets:[]},{id:'two',project:'化妆',sourceSha256:catalog.sourceSha256,items:{},assets:[]}],creationRunningBatchIds:['one']},tasks=groupAdBatchTasks(data);assert.equal(tasks.length,2);assert.equal(tasks[0].status,'running');assert.match(tasks[0].phase,/正在自动制作/);assert.equal(tasks[1].status,'draft');
});
