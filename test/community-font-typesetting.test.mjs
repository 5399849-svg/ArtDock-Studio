import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {renderCommunityFontText} from '../lib/community-material-font.mjs';
import {createCommunityFontTypesetting,fitCommunityFontText} from '../lib/community-font-typesetting.mjs';
import {communityMasterTemplate as template} from '../lib/community-master-workspace.mjs';
import {renderMaterialFontControl} from '../public/community-material-fonts.js';
import {useLocalPython,withoutLocalPython} from './helpers/local-python.mjs';

// 字形由 Python 生成：本机有 local-ai/.venv 就直接用它跑，没有就跳过（平台上这一步在使用者的浏览器里算）。
useLocalPython();

const fonts=JSON.parse(await fs.readFile('data/fonts/company-library/catalog.json','utf8')).fonts.slice(0,2);
const fixture=()=>({id:'test-font',status:'主图制作',copy:'天工谜影\n谁是百晓生？',masterTemplateId:template.id,updatedAt:'before',parameters:{subtitleText:'慧眼识物，有惊喜掉落！',communityMaterialFontIds:{title:fonts[0].id,subtitle:fonts[1].id},assetByTemplate:{[template.id]:{title:'title.png',subtitle:'old-subtitle.png',logo:'logo.png',background:'scene.png'},target:{subtitle:'target.png'}},layoutByTemplate:{[template.id]:{title:{x:10,y:20,width:500,height:200},subtitle:{x:20,y:30,width:300,height:130,rotation:5,effects:{stroke:{enabled:true},shadow:{enabled:true}}},'subtitle-backing':{x:200,y:550,width:800,height:160,visible:true,backing:{enabled:true,fill:'#fff1d8'}}},target:{subtitle:{x:4,y:5,width:6,height:7}}},backgroundByTemplate:{[template.id]:{focalX:2,scale:110}}},assets:[{name:'old-subtitle.png',role:'subtitle',materialKind:'subtitle',mime:'image/png'}],history:[],communityMasterApproval:{at:'confirmed'}});

test('direct text uses exact fonts and a single fill on actual transparent pixels, without automatic wrapping',{skip:withoutLocalPython},async()=>{
 const task=fixture(),first=await renderCommunityFontText(task,'subtitle',{color:'#674025'}),other=await renderCommunityFontText({...task,parameters:{...task.parameters,communityMaterialFontIds:{subtitle:fonts[0].id}}},'subtitle',{color:'#674025'});
 assert.notDeepEqual(first.buffer,other.buffer,'selected fonts must not silently fall back');
 assert.equal(first.font.id,fonts[1].id);
 const {data,info}=await sharp(first.buffer).raw().toBuffer({resolveWithObject:true});assert.equal(info.channels,4);assert.ok(info.width/info.height>8,'sentence remains one line');
 let transparent=0,ink=0;for(let i=0;i<data.length;i+=4){if(data[i+3]===0)transparent++;else{ink++;assert.deepEqual([...data.subarray(i,i+3)],[103,64,37]);}}
 assert.ok(transparent>100&&ink>100);
 await assert.rejects(renderCommunityFontText({...task,parameters:{...task.parameters,communityMaterialFontIds:{}}},'subtitle'),/选择版权字/);
});

test('fitting preserves glyph aspect and centers a baked angle consistently for preview and export',async()=>{
 const source=await sharp({create:{width:1000,height:100,channels:4,background:'#674025'}}).png().toBuffer(),box={x:100,y:200,width:600,height:70};
 const fitted=await fitCommunityFontText(source,box,{rotation:-3});
 assert.equal(fitted.layout.rotation,0);assert.equal(fitted.layout.effects.stroke.enabled,false);assert.equal(fitted.layout.effects.shadow.enabled,false);
 assert.ok(Math.abs(fitted.layout.x+fitted.layout.width/2-400)<1e-6);assert.ok(Math.abs(fitted.layout.y+fitted.layout.height/2-235)<1e-6);
 assert.ok(Math.abs(fitted.layout.width/fitted.width-fitted.layout.height/fitted.height)<1e-10);
 const unrotated=await fitCommunityFontText(source,box);assert.ok(unrotated.layout.width<=box.width);assert.ok(unrotated.layout.height<=box.height);assert.equal(unrotated.layout.width/unrotated.layout.height,10);
});

test('one local save fits the paper, keeps other layers and all targets, versions the old material and is retry safe',{skip:withoutLocalPython},async t=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'workbench-direct-font-'));t.after(async()=>{assert.equal(path.dirname(directory),path.resolve(os.tmpdir()));await fs.rm(directory,{recursive:true,force:true});});
 const task=fixture(),tasksFile=path.join(directory,'tasks.json'),storageDir=path.join(directory,'storage');await fs.writeFile(tasksFile,JSON.stringify([task]));
 const original=structuredClone(task);let renders=0,invalidations=0;
 const manager=createCommunityFontTypesetting({tasksFile,storageDir,templateMap:new Map([[template.id,template]]),jobs:new Map(),invalidate:()=>invalidations++,renderFont:async(...args)=>{renders++;return renderCommunityFontText(...args);}});
 const input={kind:'subtitle',fontId:fonts[1].id,color:'#674025',expectedUpdatedAt:'before',requestId:'direct-font-request-1234'};
 const saved=await manager.save(task.id,input),layout=saved.parameters.layoutByTemplate[template.id].subtitle,backing=saved.parameters.layoutByTemplate[template.id]['subtitle-backing'];
 assert.equal(layout.backingAligned,true);assert.equal(saved.communityMasterApproval,null);assert.ok(layout.x>backing.x&&layout.y>backing.y&&layout.x+layout.width<backing.x+backing.width&&layout.y+layout.height<backing.y+backing.height);
 assert.deepEqual(saved.parameters.assetByTemplate.target,original.parameters.assetByTemplate.target);assert.deepEqual(saved.parameters.layoutByTemplate.target,original.parameters.layoutByTemplate.target);assert.deepEqual(saved.parameters.backgroundByTemplate,original.parameters.backgroundByTemplate);
 for(const key of ['title','logo','background'])assert.equal(saved.parameters.assetByTemplate[template.id][key],original.parameters.assetByTemplate[template.id][key]);
 assert.deepEqual(backing,original.parameters.layoutByTemplate[template.id]['subtitle-backing']);
 assert.equal(saved.assets[0].name,'old-subtitle.png');assert.equal(saved.assets.at(-1).fontProvenance.method,'licensed-font-typeset-v1');assert.equal(saved.assets.at(-1).exactText,task.parameters.subtitleText);
 assert.equal(saved.communityDesign.versions[0].snapshot.assets.subtitle,'old-subtitle.png');assert.equal(saved.communityDesign.versions.at(-1).snapshot.assets.subtitle,saved.assets.at(-1).name);
 const retry=await manager.save(task.id,input);assert.equal(retry.assets.length,2);assert.equal(renders,1);assert.equal(invalidations,1);
 await assert.rejects(manager.save(task.id,{...input,color:'#000000'}),e=>e.status===409);
 await assert.rejects(manager.save(task.id,{...input,requestId:'different-request-1234'}),e=>e.status===409);
});

test('busy tasks and missing fonts do not replace assets; either text kind offers direct typesetting',async t=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'workbench-direct-font-'));t.after(async()=>{assert.equal(path.dirname(directory),path.resolve(os.tmpdir()));await fs.rm(directory,{recursive:true,force:true});});
 const task=fixture(),tasksFile=path.join(directory,'tasks.json');task.communityGeneration={status:'running'};await fs.writeFile(tasksFile,JSON.stringify([task]));
 const manager=createCommunityFontTypesetting({tasksFile,storageDir:directory,templateMap:new Map([[template.id,template]]),jobs:new Map(),invalidate:()=>{},renderFont:()=>assert.fail('busy task cannot render')});
 await assert.rejects(manager.save(task.id,{kind:'subtitle',fontId:fonts[1].id,color:'#674025',expectedUpdatedAt:'before',requestId:'busy-request-1234'}),e=>e.status===409);
 assert.equal(JSON.parse(await fs.readFile(tasksFile,'utf8'))[0].assets.length,1);
 delete task.communityGeneration;for(const kind of ['title','subtitle'])assert.match(renderMaterialFontControl(task,kind,fonts),/直接使用版权字/);
 assert.match(renderMaterialFontControl(task,'subtitle',fonts),/适配副标底板/);assert.doesNotMatch(renderMaterialFontControl(task,'title',fonts),/适配副标底板/);
 task.parameters.communityMaterialFontIds.subtitle=null;assert.doesNotMatch(renderMaterialFontControl(task,'subtitle',fonts),/community-typeset-font/);
});
