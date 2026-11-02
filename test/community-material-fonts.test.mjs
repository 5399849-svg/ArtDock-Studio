import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {prepareCommunityMaterialFont,missingCompanyFontCharacters} from '../lib/community-material-font.mjs';
import {communityMaterialRequest,prepareCommunityMaterial} from '../lib/community-materials.mjs';
import {createCommunityMaterialJobs} from '../lib/community-material-jobs.mjs';
import {communityMasterTemplate as template} from '../lib/community-master-workspace.mjs';
import {bannerSourceToken,bannerMasterSnapshot,restoreBannerVersion} from '../lib/community-banner-session.mjs';
import {renderMaterialFontControl} from '../public/community-material-fonts.js';
import {renderMasterAi} from '../public/community-master-page.js';
import {useLocalPython,withoutLocalPython} from './helpers/local-python.mjs';

// 字形由 Python 生成：本机有 local-ai/.venv 就直接用它跑，没有就跳过（平台上这一步在使用者的浏览器里算）。
useLocalPython();

const fonts=JSON.parse(await fs.readFile('data/fonts/company-library/catalog.json','utf8')).fonts.slice(0,2);
const fixture=()=>({id:'task',project:'字体测试',status:'主图制作',copy:'霜降祝福',updatedAt:'before',masterTemplateId:template.id,targetTemplateIds:['target'],parameters:{communityMaterialKind:'title',subtitleText:'吉祥如意',communityMaterialFontIds:{title:fonts[0].id,subtitle:fonts[1].id},assetByTemplate:{[template.id]:{},target:{title:'keep.png'}},layoutByTemplate:{},backgroundByTemplate:{}},assets:[],history:[],communityDesign:{versions:[]}});
const input=task=>({kind:'title',model:'gpt-image-2',prompt:'金色字效，两行排版',expectedUpdatedAt:task.updatedAt,requestId:'font-guide-request-1234'});

test('real files produce distinct literal glyph guides, and each copy kind reads only its own font choice',{skip:withoutLocalPython},async()=>{
 const task=fixture(),first=await prepareCommunityMaterialFont(task,'title'),second=await prepareCommunityMaterialFont(task,'subtitle');
 assert.equal(first.font.id,fonts[0].id);assert.equal(second.font.id,fonts[1].id);
 const sameText=await prepareCommunityMaterialFont({...task,parameters:{...task.parameters,communityMaterialFontIds:{title:fonts[1].id}}},'title');assert.notDeepEqual(first.guide,sameText.guide,'different fonts must never silently render with one OS fallback');
 for(const guide of [first.guide,second.guide]){const meta=await sharp(guide).metadata();assert.equal(meta.format,'png');assert.ok(meta.width>100);assert.ok(meta.height>100);assert.ok(meta.width<=2304&&meta.height<=1536);}
 assert.equal(await prepareCommunityMaterialFont(task,'illustration'),null);assert.equal(await prepareCommunityMaterialFont({...task,parameters:{}},'title'),null);
});

test('unavailable fonts and missing glyphs fail before paid generation instead of silently substituting another font',async()=>{
 const task=fixture();task.parameters.communityMaterialFontIds.title='missing';await assert.rejects(prepareCommunityMaterialFont(task,'title'),e=>e.status===422&&/不可用/.test(e.message));
 task.parameters.communityMaterialFontIds.title=fonts[0].id;task.copy='霜降'+String.fromCodePoint(0x10ffff);await assert.rejects(prepareCommunityMaterialFont(task,'title'),e=>e.status===422&&/不含这些字/.test(e.message));
 const file=await fs.readFile(path.join('data/fonts/company-library',fonts[0].file));assert.deepEqual(missingCompanyFontCharacters(file,'霜降祝福\n '),[]);assert.deepEqual(missingCompanyFontCharacters(file,String.fromCodePoint(0x10ffff)),[String.fromCodePoint(0x10ffff)]);
});

test('copyright glyph reference is internal, numbered after user images, before the scene, with no font file transmitted',()=>{
 const task=fixture();task.assets=[{name:'ref.png',role:'reference-image',mime:'image/png',url:'/ref.png'}];const run=prepareCommunityMaterial(task,input(task),template);run.licensedFont={id:fonts[0].id,name:fonts[0].name};run.sceneName='scene.png';
 const body=communityMaterialRequest(run,[Buffer.from('user-image'),Buffer.from('glyph-png'),Buffer.from('scene-image')]);assert.equal(body.image_size,'2K');assert.equal(body.quality,'high');assert.match(body.prompt,/输入第1张对应界面图1/);assert.match(body.prompt,/输入第2张是工作台用公司版权字体/);assert.match(body.prompt,/最后一张是当前无字插画/);assert.match(body.prompt,/不改用其他字体/);assert.match(body.prompt,/#FF00FF/);assert.equal(body.images[1].data_base64,Buffer.from('glyph-png').toString('base64'));
});

test('font controls are per copy kind; optional/no-font keeps AI freedom and output constraints remain server-side',()=>{
 const task=fixture();for(const kind of ['title','subtitle']){task.parameters.communityMaterialKind=kind;const html=renderMasterAi(task,{fonts});assert.match(html,/选择版权字/);assert.ok(html.includes(fonts[kind==='title'?0:1].name));assert.doesNotMatch(html,/master-material-tags|透明背景<|2K<|参考素材/);}
 assert.equal(renderMaterialFontControl(task,'illustration',fonts),'');task.parameters.communityMaterialFontIds.title=null;assert.match(renderMaterialFontControl(task,'title',fonts),/不指定，由 AI 设计/);
 task.parameters.communityMaterialKind='illustration';assert.doesNotMatch(renderMasterAi(task,{fonts}),/community-choose-font/);
});

test('changing or clearing a font invalidates in-flight source identity and history restores both selections',()=>{
 const task=fixture(),before=bannerSourceToken(task),snapshot=bannerMasterSnapshot(task);task.parameters.communityMaterialFontIds.title=null;assert.notEqual(bannerSourceToken(task),before);assert.equal(snapshot.fonts.communityMaterialFontIds.title,fonts[0].id);
 task.communityDesign.versions=[{id:'version',snapshot}];restoreBannerVersion(task,'version');assert.equal(task.parameters.communityMaterialFontIds.title,fonts[0].id);assert.equal(task.parameters.communityMaterialFontIds.subtitle,fonts[1].id);
});

test('durable material jobs send the cached glyph PNG once, persist provenance and keep other target bindings',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'workbench-font-job-'));t.after(async()=>{assert.equal(path.dirname(root),path.resolve(os.tmpdir()));await fs.rm(root,{recursive:true,force:true});});
 const tasksFile=path.join(root,'tasks.json'),storageDir=path.join(root,'storage'),task=fixture();await fs.writeFile(tasksFile,JSON.stringify([task]));
 const guide=await sharp({create:{width:80,height:40,channels:3,background:'#ffffff'}}).png().toBuffer(),raw=await sharp(Buffer.from('<svg width="400" height="200"><rect width="400" height="200" fill="#ff00ff"/><rect x="50" y="50" width="300" height="100" fill="#efd45d"/></svg>')).png().toBuffer();const calls=[];let preparations=0;
 const options={tasksFile,storageDir,templateMap:new Map([[template.id,template]]),jobs:new Map(),loadConfig:async()=>({enabled:true}),prepareFont:async(t,kind)=>{preparations++;assert.equal(t.parameters.communityMaterialFontIds[kind],fonts[0].id);return {font:fonts[0],guide};},createCanvas:async()=>1,submitGeneration:async(c,b)=>{calls.push(b);return 'one';},pollJob:async()=>{},downloadRaw:async()=>({buffer:raw}),invalidate:()=>{}};
 const manager=createCommunityMaterialJobs(options);await manager.submit(task.id,input(task));
 const read=async()=>JSON.parse(await fs.readFile(tasksFile,'utf8'))[0],wait=async()=>{for(let i=0;i<200;i++){const current=await read();if(current.communityGeneration?.status!=='running')return current;await new Promise(r=>setTimeout(r,15));}assert.fail('job timeout');};
 const saved=await wait();assert.equal(saved.communityGeneration.status,'done',saved.communityGeneration.error);assert.equal(calls.length,1);assert.equal(calls[0].images.length,1);assert.equal(calls[0].images[0].data_base64,guide.toString('base64'));assert.equal(saved.assets.at(-1).fontProvenance.fontId,fonts[0].id);assert.equal(saved.parameters.assetByTemplate.target.title,'keep.png');
 await manager.submit(task.id,input(task));assert.equal(calls.length,1);assert.equal(preparations,1);
 saved.communityGeneration.status='running';await fs.writeFile(tasksFile,JSON.stringify([saved]));const restarted=createCommunityMaterialJobs({...options,prepareFont:()=>assert.fail('cached raw does not rerender fonts')});await restarted.restore();const restored=await wait();assert.equal(restored.communityGeneration.status,'done');assert.equal(calls.length,1);assert.equal(restored.assets.length,1);assert.equal(restored.assets[0].fontProvenance.fontId,fonts[0].id);
});
