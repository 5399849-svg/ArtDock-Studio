import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {createSourcePopupButtonJobs,sourcePopupButtonRequest,normalizeButtonBacking} from '../lib/source-popup-button-jobs.mjs';
import {normalizePopupConfig,popupDefaults,popupButtonRect,drawPopupOutline} from '../public/community-popup-model.js';
import {sourceButtonElement,constrainSourceButton} from '../public/source-popup-button.js';
const target='community-community-popup';
async function fixture(t,overrides={}){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'popup-button-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const tasksFile=path.join(dir,'tasks.json'),storageDir=path.join(dir,'storage'),popup={...popupDefaults(),buttonLabel:'立即参与',buttonLayout:{x:80,y:530,width:340,height:90}};
 const task={id:'one',project:'测试',mode:'adapt',masterTemplateId:'source-master-one',targetTemplateIds:[target],assets:[],history:[],updatedAt:'before',status:'批量生成',sourceAdaptation:{version:1,layers:[]},parameters:{sourceCompositionByTemplate:{[target]:{popup,layers:[{id:'kept',x:2}]},other:{layers:[{id:'other'}]}}}};
 await fs.writeFile(tasksFile,JSON.stringify([task,{id:'unrelated'}]));
 const buffer=await sharp({create:{width:300,height:100,channels:4,background:'#dd4400'}}).extend({top:5,bottom:5,left:5,right:5,background:'#00000000'}).png().toBuffer(),calls=[];
 const jobs=new Map(),api=createSourcePopupButtonJobs({tasksFile,storageDir,jobs,loadConfig:async()=>({enabled:true}),createCanvas:async()=>{calls.push('canvas');return 'canvas';},submitGeneration:async(c,b,o)=>{calls.push({body:b,key:o.idempotencyKey});return 'job';},pollJob:async()=>{},downloadRaw:async()=>({buffer}),invalidate:t=>{t.artifacts=[];},...overrides});
 return {api,calls,task,jobs,tasksFile,buffer,read:async()=>JSON.parse(await fs.readFile(tasksFile,'utf8')),input:{templateId:target,prompt:'金色描边红色按钮',requestId:'request-12345678',expectedUpdatedAt:'before'}};
}
test('button geometry keeps artwork ratio and bounds; stroke options survive save',()=>{
 const c=normalizePopupConfig({...popupDefaults(),outline:true,outlineWidth:8,buttonLayout:{x:60,y:520,width:380,height:100}});
 const box=popupButtonRect(c,{}, {width:300,height:100});assert.equal(box.width/box.height,3);assert.equal(c.outlineWidth,8);
 const enlarged=constrainSourceButton({x:-80,y:600,width:960,height:320});assert.equal(enlarged.width,480);assert.equal(enlarged.y+enlarged.height,650);
 const old=sourceButtonElement(popupDefaults(),new Map());assert.equal(old.width,310);assert.equal(old.y,586);
 assert.throws(()=>normalizePopupConfig({...c,outlineWidth:0}),/粗细/);assert.throws(()=>normalizePopupConfig({...c,buttonLayout:{...c.buttonLayout,x:499}}),/画布/);
 const events=[],ctx=new Proxy({},{get:(_,k)=> (...v)=>events.push([k,...v]),set:(_,k,v)=>{events.push([k,v]);return true;}});drawPopupOutline(ctx,c);assert.ok(events.some(([k,v])=>k==='lineWidth'&&v===8));events.length=0;drawPopupOutline(ctx,{...c,shape:'none'});assert.equal(events.length,0);
});
test('AI request contains only an optional explicitly selected reference and no button lettering',()=>{
 const body=sourcePopupButtonRequest('紫金魔法风格');assert.equal(body.images,undefined);assert.equal(body.background,'transparent');assert.equal(body.output_format,'png');assert.match(body.prompt,/不要文字/);
 assert.equal(sourcePopupButtonRequest('test',Buffer.from('ref')).images.length,1);
});
test('successful generation applies only backing; geometry, text, other size and unrelated task survive; repeated request is free',async t=>{
 const f=await fixture(t);await f.api.submit('one',f.input);await f.api.settled();let [saved,other]=await f.read();
 assert.equal(saved.communityGeneration.status,'done');const popup=saved.parameters.sourceCompositionByTemplate[target].popup;assert.ok(popup.buttonBackingAsset.endsWith('.png'));assert.deepEqual({...popup,buttonBackingAsset:''},f.task.parameters.sourceCompositionByTemplate[target].popup);
 assert.deepEqual(saved.parameters.sourceCompositionByTemplate.other,f.task.parameters.sourceCompositionByTemplate.other);assert.deepEqual(other,{id:'unrelated'});
 await f.api.submit('one',f.input);await f.api.settled();assert.equal(f.calls.filter(c=>c.body).length,1);
});
test('opaque output is retained for diagnosis and never replaces the current button',async t=>{
 const raw=await sharp({create:{width:300,height:100,channels:3,background:'red'}}).png().toBuffer();await assert.rejects(()=>normalizeButtonBacking(raw),/透明/);
 const f=await fixture(t,{downloadRaw:async()=>({buffer:raw})});await f.api.submit('one',f.input);await f.api.settled();const [saved]=await f.read();assert.equal(saved.communityGeneration.status,'failed');assert.equal(saved.communityGeneration.rawFile,true);assert.deepEqual(saved.parameters,f.task.parameters);assert.equal(saved.assets.length,0);
});
test('uncertain submission resumes the same request key rather than creating a second generation',async t=>{
 const keys=[];const f=await fixture(t,{submitGeneration:async(c,b,o)=>{keys.push(o.idempotencyKey);if(keys.length===1)throw Error('connection lost');return 'same-job';}});
 await f.api.submit('one',f.input);await f.api.settled();let [saved]=await f.read();assert.equal(saved.communityGeneration.status,'interrupted');
 await assert.rejects(()=>f.api.submit('one',{...f.input,requestId:'request-second',expectedUpdatedAt:saved.updatedAt}),/上次/);
 await f.api.resume('one',{...f.input,expectedUpdatedAt:saved.updatedAt});await f.api.settled();[saved]=await f.read();assert.equal(saved.communityGeneration.status,'done');assert.equal(keys[0],keys[1]);assert.equal(f.calls.filter(c=>c==='canvas').length,1);
});
test('stale, foreign-reference, non-popup and delivered tasks cannot generate or mutate data',async t=>{
 const f=await fixture(t),before=await fs.readFile(f.tasksFile,'utf8');
 for(const input of [{expectedUpdatedAt:'old'},{referenceName:'foreign.png'},{templateId:'other'},{prompt:''}])await assert.rejects(()=>f.api.submit('one',{...f.input,...input}));
 assert.equal(await fs.readFile(f.tasksFile,'utf8'),before);assert.equal(f.calls.length,0);
 f.task.status='已完成';f.task.deliveredPackage={name:'old.zip'};await fs.writeFile(f.tasksFile,JSON.stringify([f.task]));await assert.rejects(()=>f.api.submit('one',f.input),/新版本/);
});

test('multiple uploaded references reach the provider in designer order and retry reuses exactly those images',async t=>{
 const bodies=[];const f=await fixture(t,{submitGeneration:async(c,body)=>{bodies.push(body);if(bodies.length===1)throw Error('lost receipt');return 'job';}});
 const second=await sharp({create:{width:40,height:30,channels:3,background:'blue'}}).png().toBuffer(),references=[f.buffer,second].map((b,i)=>({name:`图${i+1}.png`,dataUrl:'data:image/png;base64,'+b.toString('base64')}));
 await f.api.submit('one',{...f.input,references});await f.api.settled();let [saved]=await f.read();assert.equal(saved.communityGeneration.referenceNames.length,2);
 assert.deepEqual(bodies[0].images.map(i=>i.data_base64),[f.buffer,second].map(b=>b.toString('base64')));assert.match(bodies[0].prompt,/图1至图2/);
 await f.api.resume('one',{...f.input,expectedUpdatedAt:saved.updatedAt});await f.api.settled();assert.deepEqual(bodies[1],bodies[0]);[saved]=await f.read();assert.equal(saved.communityGeneration.status,'done');assert.equal(saved.assets.filter(a=>a.role==='popup-button-reference').length,2);
});

test('new-design popup applies generated backing without changing text, fonts, geometry, master or other targets',async t=>{
 const f=await fixture(t),task=f.task,popup=structuredClone(task.parameters.sourceCompositionByTemplate[target].popup);task.mode='master';task.masterTemplateId='community-master';delete task.sourceAdaptation;
 task.parameters={communityPopupByTemplate:{[target]:popup},assetByTemplate:{[target]:{button:null,background:'scene'},'community-master':{background:'master'}},layoutByTemplate:{[target]:{button:{x:50,y:500,width:400,height:80},title:{x:20,y:100}}},communityObjectLayersByTemplate:{[target]:[]}};
 const before=structuredClone(task.parameters);await fs.writeFile(f.tasksFile,JSON.stringify([task]));await f.api.submit('one',f.input);await f.api.settled();const [saved]=await f.read();assert.equal(saved.communityGeneration.applied,true);
 assert.equal(saved.parameters.assetByTemplate[target].button,saved.communityGeneration.assetName);assert.deepEqual({...saved.parameters.communityPopupByTemplate[target],buttonBackingAsset:''},popup);
 assert.deepEqual(saved.parameters.layoutByTemplate,before.layoutByTemplate);assert.deepEqual(saved.parameters.assetByTemplate['community-master'],before.assetByTemplate['community-master']);assert.equal(saved.communityPopupVersions.length,1);
});

test('reference count, malformed uploads and foreign assets reject before job creation',async t=>{
 const f=await fixture(t),before=await fs.readFile(f.tasksFile,'utf8');for(const references of [Array(6).fill({}),[{dataUrl:'data:image/png;base64,aGVsbG8='}],[{assetName:'elsewhere.png'}]])await assert.rejects(()=>f.api.submit('one',{...f.input,references}));assert.equal(await fs.readFile(f.tasksFile,'utf8'),before);assert.equal(f.calls.length,0);
});
