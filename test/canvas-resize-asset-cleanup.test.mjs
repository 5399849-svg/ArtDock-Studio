import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createCustomCanvasResizer,remapCustomCanvasSnapshot} from '../lib/custom-canvas-resize.mjs';
import {customCanvasTemplate} from '../public/custom-canvas-model.js';
import {communityObjectLayerRect} from '../public/community-object-layers.js';
import {createAssetLibraryCleanup} from '../lib/asset-library-cleanup.mjs';
import {assetIndex,taskIndex} from '../public/workbench-model.js';
import {assetLibraryKey} from '../public/asset-library-key.js';
const write=(file,value)=>fs.writeFile(file,JSON.stringify(value));
async function fixture(t){const runtimeDir=await fs.mkdtemp(path.join(os.tmpdir(),'resize-cleanup-')),storageDir=path.join(runtimeDir,'storage');await fs.mkdir(path.join(storageDir,'p','assets'),{recursive:true});t.after(()=>fs.rm(runtimeDir,{recursive:true,force:true,maxRetries:5,retryDelay:80}));return {runtimeDir,storageDir,tasksFile:path.join(runtimeDir,'tasks.json')};}
test('resizing keeps task identity, scales each layer uniformly, preserves object aspect and does not edit source files',async t=>{
 const f=await fixture(t),spec={width:1200,height:600,format:'PNG'},old=customCanvasTemplate(spec),layout={x:600,y:100,width:240,height:400,scaleBaseWidth:240,scaleBaseHeight:400},layer={id:'role',x:.72,y:.55,size:.8,appearance:{kind:'character',aspect:.6}},task={id:'p',customCanvas:spec,masterTemplateId:old.id,targetTemplateIds:[old.id],masterCanvasId:'custom',updatedAt:'old',status:'已完成',version:1,assets:[],artifacts:[{name:'old.png'}],parameters:{layoutByTemplate:{[old.id]:{character:layout}},assetByTemplate:{[old.id]:{background:'bg.png'}},communityObjectLayersByTemplate:{[old.id]:[layer]}}},other={id:'untouched',status:'已完成'};
 await write(f.tasksFile,[task,other]);const file=path.join(f.storageDir,'p','assets','bg.png');await fs.writeFile(file,'original pixels');const jobs=new Map(),map=new Map([[old.id,old]]),resize=createCustomCanvasResizer({...f,templateMap:map,jobs});
 await assert.rejects(()=>resize('p',{width:600,height:1200,expectedUpdatedAt:'stale'}),/已更新/);jobs.set('p',true);await assert.rejects(()=>resize('p',{width:600,height:1200,expectedUpdatedAt:'old'}),/等待/);jobs.clear();
 const saved=await resize('p',{width:600,height:1200,expectedUpdatedAt:'old'}),id=saved.masterTemplateId,next=saved.parameters.layoutByTemplate[id].character;assert.equal(saved.id,'p');assert.deepEqual(saved.customCanvas,{width:600,height:1200,format:'PNG'});assert.equal(next.width/next.height,layout.width/layout.height);assert.equal(next.width,120);assert.equal(next.height,200);
 const before=communityObjectLayerRect(layer,old),after=communityObjectLayerRect(saved.parameters.communityObjectLayersByTemplate[id][0],map.get(id));assert.ok(Math.abs(after.width/before.width-.5)<1e-8);assert.ok(Math.abs(after.height/before.height-.5)<1e-8);assert.equal(saved.status,'主图制作');assert.equal(saved.version,2);assert.equal(saved.artifacts.length,0);assert.deepEqual(JSON.parse(await fs.readFile(f.tasksFile,'utf8'))[1],other);assert.equal(await fs.readFile(file,'utf8'),'original pixels');
 const historical=remapCustomCanvasSnapshot({masterTemplateId:old.id,layout:{character:layout},objectLayers:[layer]},map.get(id));assert.equal(historical.masterTemplateId,id);assert.equal(historical.layout.character.width,120);
});
test('asset library deletion is reversible and does not mutate task/history or unlink files',async t=>{
 const f=await fixture(t),a={name:'free.png',url:'/storage/p/assets/free.png',mime:'image/png'},task={id:'p',assets:[a],versions:[{url:a.url}],version:3};await write(f.tasksFile,[task]);await fs.writeFile(path.join(f.storageDir,'p/assets/free.png'),'pixels');
 const sourceIndex=async()=>({assets:assetIndex({},taskIndex({tasks:[task]})),projects:[],missing:[]}),cleanup=createAssetLibraryCleanup({...f,sourceIndex}),ids=(await sourceIndex()).assets.map(assetLibraryKey),plan=await cleanup.preview({ids});assert.equal(plan.freeBytes,0);
 const result=await cleanup.erase({ids,token:plan.token,requestId:'asset-trash-1'});assert.ok(result.recycled);assert.equal(result.deletedFiles,0);assert.equal((await cleanup.index()).assets.length,0);assert.deepEqual(JSON.parse(await fs.readFile(f.tasksFile,'utf8')),[task]);assert.equal(await fs.readFile(path.join(f.storageDir,'p/assets/free.png'),'utf8'),'pixels');assert.deepEqual(await cleanup.erase({ids,token:plan.token,requestId:'asset-trash-1'}),result);
});
test('missing modules block bulk asset mutation and old hidden entries remain hidden',async t=>{
 const f=await fixture(t),a={name:'free.png',url:'/storage/p/assets/free.png',mime:'image/png'};let missing=['ad-resources'];const sourceIndex=async()=>({assets:[a],missing}),cleanup=createAssetLibraryCleanup({...f,sourceIndex}),ids=[assetLibraryKey(a)];await assert.rejects(cleanup.preview({ids}),/暂未加载/);
 missing=[];await write(path.join(f.runtimeDir,'workbench-asset-library.json'),{removed:{[ids[0]]:{url:a.url}},operations:{}});assert.equal((await cleanup.index()).assets.length,0);assert.deepEqual((await cleanup.status()).removedIds,ids);
});
