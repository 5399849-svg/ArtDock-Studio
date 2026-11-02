import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {communityMasterTemplate as template} from '../lib/community-master-workspace.mjs';
import {prepareCommunityMaterial,communityMaterialRequest,normalizeCommunityMaterial,selectCommunityMaterial} from '../lib/community-materials.mjs';
import {createCommunityMaterialJobs} from '../lib/community-material-jobs.mjs';
import {communityMaterialGroups} from '../public/community-material-state.js';
import {renderMasterInputs,renderMasterAi,renderMasterWorkspace} from '../public/community-master-page.js';
import {writeJson} from '../lib/json-store.mjs';

const fixture=()=>({id:'task',project:'素材测试',masterTemplateId:template.id,targetTemplateIds:['target'],copy:'霜降祝福',updatedAt:'initial',status:'主图制作',assets:[{name:'scene.png',mime:'image/png',role:'mother-candidate',materialKind:'illustration',width:384,height:216,url:'/scene.png'},{name:'reference.png',mime:'image/png',role:'reference-image',url:'/ref.png'},{name:'copy.png',mime:'image/png',role:'reference-copy',url:'/copy.png'},{name:'old-title.png',mime:'image/png',role:'title',width:200,height:70,url:'/title.png'}],parameters:{subtitleText:'',assetByTemplate:{[template.id]:{background:'scene.png',title:'old-title.png'},target:{background:'untouched'}},layoutByTemplate:{[template.id]:{title:{x:80,y:130,width:700,height:250,visible:true}},target:{title:{x:10,y:20,width:30,height:40}}},backgroundByTemplate:{[template.id]:{scale:110,focalX:40}},communityMaterialKind:'title'},communityDesign:{versions:[]},history:[]});
const input=(task,kind='title',extra={})=>({kind,model:'gpt-image-2',prompt:'参考图1的风格，图2的金色书法，两行排列',requestId:'request-material-123',expectedUpdatedAt:task.updatedAt,...extra});
const png=async(color='#345678')=>sharp({create:{width:384,height:216,channels:3,background:color}}).png().toBuffer();
const textPng=async()=>sharp(Buffer.from('<svg width="400" height="200"><rect width="400" height="200" fill="#ff00ff"/><rect x="100" y="60" width="200" height="80" fill="#f6d670"/><rect x="90" y="50" width="220" height="100" fill="none" stroke="#ffe0a0" opacity=".4" stroke-width="4"/></svg>')).png().toBuffer();

test('independent requests retain numbered reference order and append only the clean scene for text styling',()=>{
 const task=fixture(),run=prepareCommunityMaterial(task,input(task),template),body=communityMaterialRequest(run,[Buffer.from('ref'),Buffer.from('copy'),Buffer.from('scene')]);
 assert.deepEqual(run.referenceNames,['reference.png','copy.png']);assert.equal(run.sceneName,'scene.png');assert.equal(body.model,'gpt-image-2');assert.equal(body.image_size,'2K');assert.match(body.prompt,/"霜降祝福"/);assert.match(body.prompt,/输入第2张对应界面图2/);assert.match(body.prompt,/最后一张是当前无字插画/);assert.match(body.prompt,/#FF00FF/);assert.equal(body.images.length,3);
 const art=communityMaterialRequest(prepareCommunityMaterial(task,input(task,'illustration'),template));assert.equal(art.image_size,'4K');assert.equal(art.ratio,'16:9');assert.match(art.prompt,/人物与场景在同一张插画内/);assert.match(art.prompt,/不含任何主标/);assert.doesNotMatch(art.prompt,/准确文案为/);
 assert.equal(prepareCommunityMaterial(task,input(task,'title',{prompt:'粉色可爱文字'}),template).matte,'green');
});

test('matte conversion produces real alpha while preserving gold, antialiasing and partial opacity',async()=>{
 const output=await normalizeCommunityMaterial(await textPng(),'title','magenta'),meta=await sharp(output).metadata();assert.equal(meta.hasAlpha,true);assert.ok(meta.width<400);assert.ok(meta.height<200);
 const {data}=await sharp(output).raw().toBuffer({resolveWithObject:true});let empty=0,partial=0,gold=0;for(let i=0;i<data.length;i+=4){if(!data[i+3])empty++;else if(data[i+3]<250)partial++;if(data[i+3]===255&&data[i]>200&&data[i+1]>150&&data[i+2]<150)gold++;}assert.ok(empty>0);assert.ok(partial>0);assert.ok(gold>1000);
 const green=await sharp(Buffer.from('<svg width="200" height="100"><rect width="200" height="100" fill="#00ff00"/><rect x="30" y="20" width="140" height="60" fill="#f06fbd"/></svg>')).png().toBuffer();assert.equal((await sharp(await normalizeCommunityMaterial(green,'title','green')).metadata()).hasAlpha,true);
});

test('generated matte brightness noise and its frame disappear instead of forming red rectangular residue',async()=>{
 const noisy=await sharp(Buffer.from('<svg width="400" height="200"><rect width="400" height="200" fill="#f802f5"/><rect width="400" height="200" fill="none" stroke="#e017eb" stroke-width="10"/><path d="M30 0V200M350 0V200" stroke="#c918d4" stroke-width="6"/><rect x="80" y="50" width="240" height="100" fill="#efd050"/></svg>')).png().toBuffer();
 const image=await normalizeCommunityMaterial(noisy,'title','magenta'),meta=await sharp(image).metadata();assert.ok(meta.width<=242);assert.ok(meta.height<=102);
 const {data}=await sharp(image).raw().toBuffer({resolveWithObject:true});for(let p=0;p<data.length;p+=4)if(data[p+3]>0)assert.ok(data[p+1]>data[p+2],'No magenta/red plate noise should remain around golden text');
});

test('opaque scenes, checkerboards, empty text and unrelated illustration ratios cannot pass as independent material',async()=>{
 const opaque=await png();await assert.rejects(()=>normalizeCommunityMaterial(opaque,'title'),/透明/);await assert.rejects(()=>normalizeCommunityMaterial(opaque,'title','magenta'),/底色/);
 const blank=await sharp({create:{width:200,height:100,channels:4,background:'#00000000'}}).png().toBuffer();await assert.rejects(()=>normalizeCommunityMaterial(blank,'title'),/有效字形/);
 const square=await sharp({create:{width:100,height:100,channels:3,background:'#777'}}).png().toBuffer();await assert.rejects(()=>normalizeCommunityMaterial(square,'illustration'),/比例/);
});

test('choosing independent assets preserves other sizes and every previous version; legacy whole artwork is explicit',()=>{
 const task=fixture(),before=structuredClone(task);task.assets.push({name:'new.png',role:'title',materialKind:'title',width:500,height:180,exactText:task.copy,mime:'image/png',url:'/new.png'});
 selectCommunityMaterial(task,{name:'new.png',expectedUpdatedAt:task.updatedAt},template,{now:'new-time'});assert.equal(task.parameters.assetByTemplate[template.id].title,'new.png');assert.deepEqual(task.parameters.assetByTemplate.target,before.parameters.assetByTemplate.target);assert.deepEqual(task.parameters.layoutByTemplate.target,before.parameters.layoutByTemplate.target);assert.equal(task.communityDesign.versions.length,2);assert.ok(task.assets.some(a=>a.name==='old-title.png'));
 const ratio=task.parameters.layoutByTemplate[template.id].title;assert.ok(Math.abs(ratio.width/ratio.height-500/180)<.001);
 task.parameters.communityArtworkByTemplate={[template.id]:{assetName:'whole.png'}};const saved=structuredClone(task);assert.throws(()=>selectCommunityMaterial(task,{name:'new.png',expectedUpdatedAt:task.updatedAt},template),/历史整稿/);assert.deepEqual(task,saved);
 selectCommunityMaterial(task,{name:'scene.png',expectedUpdatedAt:task.updatedAt},template);assert.equal(task.parameters.communityArtworkByTemplate[template.id],undefined);assert.equal(task.parameters.layoutByTemplate[template.id].character.visible,false);
});

test('library includes all versions but no reference images; AI reference composer stays light and controls stay on the right',()=>{
 const task=fixture();task.assets.push({name:'scene2.png',mime:'image/png',role:'mother-candidate',materialKind:'illustration',url:'/scene2.png'});
 assert.equal(communityMaterialGroups(task).find(g=>g.kind==='illustration').assets.length,2);
 const left=renderMasterInputs(task),right=renderMasterAi(task);assert.match(left,/scene2.png/);assert.match(left,/scene.png/);assert.doesNotMatch(left,/reference.png|copy.png/);assert.match(right,/reference.png/);assert.match(right,/<figcaption>图2<\/figcaption>/);assert.match(right,/community-material-prompt/);assert.doesNotMatch(right,/#1b1b|background:black|继续修改/);
 const workspace=renderMasterWorkspace(task,{canvas:'CANVAS',inputs:left,ai:right,versions:'HISTORY',adjustments:'ADJUST-CONTROLS'});assert.doesNotMatch(workspace,/ADJUST-CONTROLS|HISTORY|母版组合历史/);assert.doesNotMatch(workspace,/<main[^>]*>[^]*master-canvas-tools[^]*<\/main>/);assert.match(workspace,/下载独立素材/);
});

async function jobsFixture(t,{raw,submitted,gate}={}){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'community-material-')),tasksFile=path.join(root,'tasks.json'),storageDir=path.join(root,'storage'),task=fixture();t.after(()=>fs.rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:30}));
 const directory=path.join(storageDir,'task','assets');await fs.mkdir(directory,{recursive:true});for(const a of task.assets)await fs.writeFile(path.join(directory,a.name),await png());await writeJson(tasksFile,[task]);
 const calls=[],jobs=new Map();let output=raw||await textPng();
 const options={tasksFile,storageDir,templateMap:new Map([[template.id,template]]),jobs,loadConfig:async()=>({enabled:true}),createCanvas:async()=>12,submitGeneration:async(config,body,settings)=>{calls.push({body,settings});if(submitted)await submitted();return 'provider-one';},pollJob:async()=>{if(gate)await gate;},downloadRaw:async()=>({buffer:output}),invalidate:()=>{}};
 const make=()=>createCommunityMaterialJobs(options),manager=make(),get=async()=>JSON.parse(await fs.readFile(tasksFile,'utf8'))[0];
 const poll=async()=>{for(let n=0;n<300;n++){const current=await get();if(current.communityGeneration?.status!=='running')return current;await new Promise(r=>setTimeout(r,10));}assert.fail('material did not finish');};
 return {root,tasksFile,storageDir,task,manager,make,get,poll,calls,setOutput:value=>{output=value}};
}

test('one text generation creates a real independent PNG, keeps old assets, and duplicate receipts never resubmit',async t=>{
 const f=await jobsFixture(t);await f.manager.submit('task',input(f.task));const after=await f.poll();assert.equal(after.communityGeneration.status,'done');assert.equal(f.calls.length,1);assert.equal(after.assets.length,5);assert.equal(after.parameters.assetByTemplate[template.id].background,'scene.png');assert.notEqual(after.parameters.assetByTemplate[template.id].title,'old-title.png');
 const asset=after.assets.at(-1);assert.equal(asset.materialKind,'title');assert.equal(asset.exactText,'霜降祝福');const meta=await sharp(await fs.readFile(path.join(f.storageDir,'task','assets',asset.name))).metadata();assert.equal(meta.hasAlpha,true);
 await f.manager.submit('task',input(f.task));assert.equal(f.calls.length,1);assert.equal((await f.get()).assets.length,5);
});

test('a manual layout change while generating saves the paid result without covering the users current design',async t=>{
 let release;const gate=new Promise(r=>release=r),f=await jobsFixture(t,{gate});await f.manager.submit('task',input(f.task));
 const tasks=JSON.parse(await fs.readFile(f.tasksFile));tasks[0].parameters.layoutByTemplate[template.id].title.x=300;await writeJson(f.tasksFile,tasks);release();const after=await f.poll();assert.equal(after.communityGeneration.status,'done');assert.equal(after.communityGeneration.applied,false);assert.equal(after.parameters.assetByTemplate[template.id].title,'old-title.png');assert.equal(after.parameters.layoutByTemplate[template.id].title.x,300);assert.equal(after.assets.length,5);
});

test('bad output retains the original and raw result, and resume reuses the same provider job without new credits',async t=>{
 const f=await jobsFixture(t,{raw:await png()}),before=f.task;await f.manager.submit('task',input(f.task));const failed=await f.poll();assert.equal(failed.communityGeneration.status,'failed');assert.equal(failed.communityGeneration.rawFile,'raw-image');assert.deepEqual(failed.parameters,before.parameters);assert.equal(failed.assets.length,4);
 await f.manager.resume('task');const retried=await f.poll();assert.equal(retried.communityGeneration.status,'failed');assert.equal(f.calls.length,1);
});

test('legacy whole-artwork receives independent generated text only as a library asset until a pure illustration is chosen',async t=>{
 const f=await jobsFixture(t),tasks=JSON.parse(await fs.readFile(f.tasksFile));tasks[0].parameters.communityArtworkByTemplate={[template.id]:{assetName:'whole.png'}};await writeJson(f.tasksFile,tasks);await f.manager.submit('task',input(tasks[0]));const result=await f.poll();assert.equal(result.communityGeneration.status,'done');assert.equal(result.communityGeneration.applied,false);assert.match(result.communityGeneration.applyWarning,/历史整稿/);assert.equal(result.assets.length,5);
});

test('restart reprocesses cached raw material once without another provider submission',async t=>{
 const f=await jobsFixture(t);await f.manager.submit('task',input(f.task));const finished=await f.poll(),run=finished.communityGeneration;
 const restored={...structuredClone(f.task),communityGeneration:{...run,status:'running',stage:'saving'}};await writeJson(f.tasksFile,[restored]);const next=f.make();await next.restore();const after=await f.poll();assert.equal(after.communityGeneration.status,'done');assert.equal(f.calls.length,1);assert.equal(after.assets.length,5);
});
