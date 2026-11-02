import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {createCommunityCanvasMaterials} from '../lib/community-canvas-materials.mjs';
import {validateCommunityObjectLayers,drawCommunityObjectLayers,communityObjectLayerImageKey,changeCommunityObjectLayer} from '../public/community-object-layers.js';
import {belongsToCommunityMaster} from '../lib/community-master-assets.mjs';
test('size-only materials and AI references do not alter master approval inputs, but explicit master reuse does',()=>{
 const task={masterTemplateId:'master',parameters:{assetByTemplate:{master:{}},communityObjectLayersByTemplate:{master:[]}}},legacy={name:'original'},scoped={name:'size.png',canvasTemplateId:'popup'},reference={name:'ref.png',role:'popup-button-reference',canvasTemplateId:'popup'};
 assert.equal(belongsToCommunityMaster(task,legacy),true);assert.equal(belongsToCommunityMaster(task,scoped),false);assert.equal(belongsToCommunityMaster(task,reference),false);assert.equal(belongsToCommunityMaster(task,{name:'button.png',popupUpload:true}),false);
 task.parameters.assetByTemplate.master.button=scoped.name;assert.equal(belongsToCommunityMaster(task,scoped),true);delete task.parameters.assetByTemplate.master.button;
 task.parameters.communityObjectLayersByTemplate.master.push({appearance:{assetName:scoped.name}});assert.equal(belongsToCommunityMaster(task,scoped),true);
});
test('uploaded and project materials are independent layers on only the selected size, persist and draw with exact aspect',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'size-materials-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const tasksFile=path.join(dir,'tasks.json'),storageDir=path.join(dir,'storage'),id='t',template={id:'popup',communityPlacement:true,width:500,height:650},buffer=await sharp({create:{width:120,height:60,channels:4,background:'#ff0000'}}).png().toBuffer();
 const task={id,projectId:'project',mode:'master',masterTemplateId:'master',targetTemplateIds:['popup','banner'],updatedAt:'before',status:'批量生成',assets:[],parameters:{assetByTemplate:{master:{title:'original'},popup:{title:'keep'}},communityObjectLayersByTemplate:{banner:[]}},history:[]};await fs.writeFile(tasksFile,JSON.stringify([task]));
 const add=createCommunityCanvasMaterials({tasksFile,storageDir,templateMap:new Map([['popup',template]]),jobs:new Map(),readProjectMaterial:async(t,id)=>{assert.equal(t.projectId,'project');if(id!=='library-one')throw Error('foreign project');return {buffer,asset:{displayName:'项目底板'}};},invalidate:t=>{t.artifacts=[];}});
 let saved=await add(id,{templateId:'popup',expectedUpdatedAt:'before',name:'贴图',dataUrl:'data:image/png;base64,'+buffer.toString('base64')});saved=await add(id,{templateId:'popup',expectedUpdatedAt:saved.updatedAt,projectAssetId:'library-one'});
 assert.deepEqual(saved.parameters.assetByTemplate,task.parameters.assetByTemplate);assert.deepEqual(saved.parameters.communityObjectLayersByTemplate.banner,[]);
 const layers=saved.parameters.communityObjectLayersByTemplate.popup;assert.equal(layers.length,2);assert.equal(layers[1].appearance.kind,'material');assert.equal(saved.assets[1].projectLibrarySource.assetId,'library-one');
 changeCommunityObjectLayer(saved,'popup',layers[1].id,{x:.7,y:.6,size:.6});validateCommunityObjectLayers(saved,saved.parameters.communityObjectLayersByTemplate,task.targetTemplateIds);
 const calls=[],images=new Map(layers.map(l=>[communityObjectLayerImageKey(saved,l),{}]));drawCommunityObjectLayers({drawImage:(...a)=>calls.push(a)},saved,template,images,{kinds:['material']});assert.equal(calls.length,2);assert.equal(calls[1][3]/calls[1][4],2);
 const persisted=JSON.parse(await fs.readFile(tasksFile,'utf8'))[0];assert.equal(persisted.parameters.communityObjectLayersByTemplate.popup.length,2);for(const asset of saved.assets)assert.ok((await fs.stat(path.join(storageDir,id,'assets',asset.name))).size>0);
 const before=await fs.readFile(tasksFile,'utf8');for(const input of [{projectAssetId:'foreign'},{expectedUpdatedAt:'old'},{templateId:'master'},{dataUrl:'bad'}])await assert.rejects(()=>add(id,{templateId:'popup',expectedUpdatedAt:persisted.updatedAt,...input}));assert.equal(await fs.readFile(tasksFile,'utf8'),before);
 persisted.status='已完成';persisted.deliveredPackage={name:'done.zip'};await fs.writeFile(tasksFile,JSON.stringify([persisted]));await assert.rejects(()=>add(id,{templateId:'popup',expectedUpdatedAt:persisted.updatedAt,projectAssetId:'library-one'}),/新版本/);
});
