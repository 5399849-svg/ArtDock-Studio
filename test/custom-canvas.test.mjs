import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {customCanvasSpec,customCanvasTemplate,registerCustomCanvas,canvasRatio} from '../public/custom-canvas-model.js';
import {createCustomCanvasExporter} from '../lib/custom-canvas-export.mjs';
import {prepareCommunityMaterial,normalizeCommunityMaterial,communityMaterialRequest} from '../lib/community-materials.mjs';
import {layeredBackgroundRequest,illustrationPlacementGuide} from '../lib/community-layered-illustration.mjs';
import {ensureCommunityMasterWorkspace} from '../lib/community-master-workspace.mjs';
test('custom canvases validate dimensions and restore their own template without catalog changes or legacy remapping',()=>{
 for(const value of [{width:0,height:1080},{width:1080.5,height:1920},{width:9000,height:100},{width:8192,height:8192},{width:100,height:100,format:'GIF'}])assert.throws(()=>customCanvasSpec(value));
 const spec=customCanvasSpec({width:'1080',height:'1920',format:'JPG'}),template=customCanvasTemplate(spec),task={customCanvas:spec,masterTemplateId:template.id,targetTemplateIds:[template.id],parameters:{}},map=new Map();
 assert.equal(canvasRatio(1080,1920),'9:16');assert.equal(registerCustomCanvas(task,map).width,1080);assert.equal(map.size,1);assert.equal(map.get(template.id).format,'JPG');assert.equal(ensureCommunityMasterWorkspace(task,template),false);assert.equal(task.masterTemplateId,template.id);
 assert.throws(()=>registerCustomCanvas({...task,targetTemplateIds:['other']},map),/不一致/);
});
test('illustration requests, ratio validation and placement guides follow the saved custom canvas',async()=>{
 const template=customCanvasTemplate({width:320,height:640}),task={customCanvas:{width:320,height:640},masterTemplateId:template.id,assets:[],parameters:{},updatedAt:'v1'};
 const run=prepareCommunityMaterial(task,{kind:'illustration',model:'gpt-image-2',prompt:'角色放右侧，竖版活动场景',expectedUpdatedAt:'v1',requestId:'custom-request-1'},template);
 assert.deepEqual(run.canvas,{width:320,height:640,ratio:'1:2',custom:true,providerRatio:'1:2'});assert.equal(layeredBackgroundRequest(run,[]).ratio,'1:2');assert.match(layeredBackgroundRequest(run,[]).prompt,/320×640/);assert.equal(communityMaterialRequest(run).ratio,'1:2');
 const role=await sharp({create:{width:50,height:100,channels:4,background:'#e9b03d'}}).png().toBuffer(),guide=await illustrationPlacementGuide(role,run),metadata=await sharp(guide).metadata();assert.equal(metadata.width,320);assert.equal(metadata.height,640);
 const background=await sharp({create:{width:320,height:640,channels:4,background:'#92bddd'}}).png().toBuffer();assert.ok(await normalizeCommunityMaterial(background,'illustration',undefined,run.canvas));await assert.rejects(()=>normalizeCommunityMaterial(background,'illustration'),/比例不符/);
});
test('single-canvas export checks saved revision and actual image bytes, completes only this task, and preserves earlier files',async t=>{
 const runtime=await fs.mkdtemp(path.join(os.tmpdir(),'custom-canvas-test-')),tasksFile=path.join(runtime,'tasks.json'),storageDir=path.join(runtime,'storage');t.after(()=>fs.rm(runtime,{recursive:true,force:true,maxRetries:5,retryDelay:80}));
 const customCanvas={width:320,height:640,format:'JPG'},template=customCanvasTemplate(customCanvas),old={id:'old',status:'已完成',artifacts:[{name:'historical.png'}]},task={id:'custom',project:'竖版设计',customCanvas,masterTemplateId:template.id,targetTemplateIds:[template.id],updatedAt:'revision-1',status:'草稿',version:1,artifacts:[],history:[]};await fs.writeFile(tasksFile,JSON.stringify([old,task]));
 const jobs=new Map(),save=createCustomCanvasExporter({tasksFile,storageDir,jobs}),png=await sharp({create:{width:320,height:640,channels:4,background:'#8cadde'}}).png().toBuffer(),jpeg=await sharp(png).jpeg().toBuffer(),body={dataUrl:'data:image/jpeg;base64,'+jpeg.toString('base64'),requestId:'custom-export-1',expectedUpdatedAt:'revision-1'};
 await assert.rejects(()=>save('custom',{...body,dataUrl:'data:image/png;base64,'+png.toString('base64')}),/成品须/);await assert.rejects(()=>save('custom',{...body,expectedUpdatedAt:'stale'}),/已更新/);jobs.set('custom',true);await assert.rejects(()=>save('custom',body),/等待/);jobs.clear();
 const result=await save('custom',body);assert.equal(result.status,'已完成');assert.equal(result.artifacts.length,1);assert.equal(result.artifacts[0].width,320);assert.equal(result.artifacts[0].format,'JPG');assert.equal(result.qc.passed,true);assert.deepEqual(await fs.readFile(path.join(storageDir,'custom','artifacts',result.artifacts[0].name)),jpeg);
 const bytes=await fs.readFile(tasksFile,'utf8');await save('custom',body);assert.equal(await fs.readFile(tasksFile,'utf8'),bytes);assert.deepEqual(JSON.parse(bytes)[0],old);await assert.rejects(()=>save('old',body),/不是自定义/);
});
test('nonstandard background ratios crop the provider frame without stretching scene details',async()=>{
 const raw=await sharp(Buffer.from('<svg width="1400" height="600"><rect width="1400" height="600" fill="white"/><rect x="600" width="20" height="600" fill="#ff0000"/><rect x="800" width="20" height="600" fill="#0000ff"/></svg>')).png().toBuffer();
 const output=await normalizeCommunityMaterial(raw,'illustration',undefined,{width:1234,height:567,ratio:'1234:567',providerRatio:'21:9',custom:true}),{data,info}=await sharp(output).removeAlpha().raw().toBuffer({resolveWithObject:true});
 assert.ok(Math.abs(info.width/info.height-1234/567)<.005);const colors=[];for(let x=0;x<info.width;x++){const p=(Math.floor(info.height/2)*info.width+x)*3;if(data[p]===255&&data[p+1]===0&&data[p+2]===0)colors[0]??=x;if(data[p]===0&&data[p+1]===0&&data[p+2]===255)colors[1]??=x;}assert.equal(colors[1]-colors[0],200);
});
