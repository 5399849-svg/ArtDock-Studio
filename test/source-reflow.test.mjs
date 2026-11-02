import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import {planSourceComposition,validateSourceComposition,sourceTargetPending,assertSourceExport} from '../public/source-adaptation-model.js';
import {createSourceAdaptation,sourceFingerprint} from '../lib/source-adaptation.mjs';
import {chooseSourceBackground} from '../lib/source-reflow.mjs';
const popup={id:'community-community-popup',width:500,height:650},banner={id:'wide',width:900,height:383};
function scene(){const layers=[{id:'bg',assetName:'bg.png',role:'background',width:750,height:1012,x:0,y:0},{id:'person',assetName:'person.png',role:'character',width:510,height:600,x:100,y:200},{id:'title',assetName:'title.png',role:'title',width:649,height:283,x:58,y:637},{id:'logo',assetName:'logo.png',role:'logo',width:105,height:115,x:630,y:180}];return {id:'task',mode:'adapt',masterTemplateId:'source-master-task',targetTemplateIds:[banner.id,popup.id],sourceAdaptation:{sourceHash:'source',width:750,height:1012,layers},parameters:{sourceCompositionByTemplate:{'source-master-task':{fit:'contain',background:'transparent',layers:structuredClone(layers)}}},communityMasterApproval:{fingerprint:'confirmed'},assets:[]};}
test('wide banners reflow the original groups independently, cover the target and preserve aspect ratios',()=>{
 const t=scene(),master=structuredClone(t.parameters),c=planSourceComposition(t,banner),bg=c.layers.find(l=>l.id==='bg'),person=c.layers.find(l=>l.id==='person'),title=c.layers.find(l=>l.id==='title');
 assert.ok(bg.x<=0&&bg.y<=0&&bg.x+bg.width>=900&&bg.y+bg.height>=383);
 assert.ok(title.x+title.width<=person.x+10,'title and character occupy separate columns');
 for(const l of c.layers){const original=t.sourceAdaptation.layers.find(o=>o.id===l.id);assert.ok(Math.abs(l.width/l.height-original.width/original.height)<1e-8);}
 assert.deepEqual(t.parameters,master);assert.notEqual(bg.width/750,person.width/510);
});
test('popup uses a clipped background with a separate breakout character, text and button',()=>{
 const t=scene(),c=planSourceComposition(t,popup);assert.equal(c.background,'transparent');assert.equal(c.popup.shape,'circle');assert.equal(c.popup.buttonVisible,true);
 const person=c.layers.find(l=>l.role==='character');assert.ok(person.y<c.popup.frame.y,'character protrudes above the circular background');
 assert.deepEqual(validateSourceComposition(t,c,popup.id).popup,c.popup);
 const corrupt=structuredClone(c);corrupt.background='#ffffff';assert.throws(()=>validateSourceComposition(t,corrupt,popup.id),/透明/);
 corrupt.background='transparent';corrupt.layers[1].width*=2;assert.throws(()=>validateSourceComposition(t,corrupt,popup.id),/比例/);
});
test('complete characters touching the source top keep cut rope ends at the target edge and retain group proportions',()=>{
 const t=scene();t.sourceAdaptation.reflow={version:4,backgroundMode:'full-scene',sourceHash:'source',layers:[
  {id:'swing',assetName:'swing.png',role:'character',width:800,height:674,sourceBounds:{left:478,top:0,width:800,height:674}},
  {id:'small',assetName:'small.png',role:'character',width:362,height:420,sourceBounds:{left:120,top:230,width:362,height:420}}
 ]};
 t.sourceAdaptation.layers=t.sourceAdaptation.layers.filter(l=>l.role!=='character');
 const c=planSourceComposition(t,banner),swing=c.layers.find(l=>l.id==='swing'),small=c.layers.find(l=>l.id==='small');
 assert.equal(swing.y,0);assert.ok(Math.abs(swing.width/800-small.width/362)<1e-8);
 assert.ok(Math.abs(small.y-230*swing.width/800)<1e-8);
});
test('old contain drafts remain available but cannot be treated as completed targets or exported',()=>{
 const t=scene();t.parameters.sourceCompositionByTemplate.wide={fit:'contain',sourceFingerprint:'confirmed',layers:[]};assert.equal(sourceTargetPending(t,'wide'),true);assert.throws(()=>assertSourceExport(t,banner,new Uint8ClampedArray(16)),/尚未/);
 t.parameters.sourceCompositionByTemplate.wide=planSourceComposition(t,banner);assert.equal(sourceTargetPending(t,'wide'),false);assert.throws(()=>assertSourceExport(t,banner,new Uint8ClampedArray(16)),/留白/);
 t.sourceAdaptation.layers[0].role='source-group';assert.throws(()=>planSourceComposition(t,banner),/分离人物/);
});
test('background crops stay in the original image and reject invalid or unusable samples',()=>{
 const r=chooseSourceBackground(750,1000,{left:120,top:170,width:530,height:610});assert.ok(r.width*r.height>=30000);assert.ok(r.top+r.height<=1000&&r.left+r.width<=750);
 assert.throws(()=>chooseSourceBackground(750,1000,{},[0,0,2,.2]),/有效/);assert.throws(()=>chooseSourceBackground(750,1000,{},[0,0,.01,.01]),/足够/);
});
test('separation keeps RGB, originals, history and unrelated tasks; restore revives the previous scene',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'source-reflow-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const assetDir=path.join(dir,'task','assets');await fs.mkdir(assetDir,{recursive:true});
 const original=await sharp({create:{width:200,height:240,channels:4,background:'#6030a0'}}).png().toBuffer();await fs.writeFile(path.join(assetDir,'scene.png'),original);
 const mask=await sharp(Buffer.from('<svg width="200" height="240"><rect x="60" y="70" width="80" height="120" fill="white"/></svg>')).png().toBuffer();
 let task=scene();task.updatedAt='first';task.sourceAdaptation={sourceHash:'source',width:200,height:240,layers:[{id:'merged',assetName:'scene.png',role:'source-group',width:200,height:240,x:0,y:0}]};task.parameters.sourceCompositionByTemplate[task.masterTemplateId].layers=structuredClone(task.sourceAdaptation.layers);task.assets=[{name:'scene.png',mime:'image/png'}];
 const before=structuredClone(task),tasksFile=path.join(dir,'tasks.json');await fs.writeFile(tasksFile,JSON.stringify([task,{id:'other'}]));
 const jobs=new Map(),api=createSourceAdaptation({root:process.cwd(),storageDir:dir,tasksFile,templateMap:new Map([[banner.id,banner],[popup.id,popup]]),jobs,segment:async()=>mask,repairBackground:async()=>sharp({create:{width:200,height:240,channels:3,background:'#403050'}}).png().toBuffer()});
 task=await api('task',{action:'separate',expectedUpdatedAt:'first',selection:{box:[.2,.2,.8,.9],points:[{x:.5,y:.5,label:1}]},backgroundRegion:[0,0,1,.2]});
 assert.deepEqual(await fs.readFile(path.join(assetDir,'scene.png')),original);assert.deepEqual(task.parameters,before.parameters);assert.equal(task.sourceAdaptation.reflow.layers.length,2);assert.equal(jobs.size,0);
 const person=task.sourceAdaptation.reflow.layers.find(l=>l.role==='character'),pixels=await sharp(path.join(assetDir,person.assetName)).raw().toBuffer();assert.deepEqual([...pixels.subarray(0,3)],[96,48,160]);
 assert.equal(JSON.parse(await fs.readFile(tasksFile))[1].id,'other');
 task=await api('task',{action:'confirm',expectedUpdatedAt:task.updatedAt});assert.equal(sourceFingerprint(task),task.communityMasterApproval.fingerprint);
 task=await api('task',{action:'adapt',templateIds:['wide'],expectedUpdatedAt:task.updatedAt});assert.equal(sourceTargetPending(task,'wide'),false);assert.equal(task.sourceAdaptation.reflow.backgroundMode,'full-scene');
 const sceneBackground=await sharp({create:{width:900,height:383,channels:3,background:'#403050'}}).png().toBuffer();
 task=await api('task',{action:'scene-background',dataUrl:'data:image/png;base64,'+sceneBackground.toString('base64'),expectedUpdatedAt:task.updatedAt});
 assert.equal(task.sourceAdaptation.reflow.backgroundMode,'full-scene');
 task=await api('task',{action:'adapt',templateIds:['wide'],expectedUpdatedAt:task.updatedAt});assert.equal(sourceTargetPending(task,'wide'),false);
 task=await api('task',{action:'restore',versionId:task.sourceAdaptationVersions[0].id,expectedUpdatedAt:task.updatedAt});assert.deepEqual(task.sourceAdaptation,before.sourceAdaptation);assert.equal(task.assets.length,4);
});
