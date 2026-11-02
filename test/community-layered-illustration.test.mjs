import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import {writeJson} from '../lib/json-store.mjs';
import {communityMasterTemplate as template} from '../lib/community-master-workspace.mjs';
import {createCommunityMaterialJobs} from '../lib/community-material-jobs.mjs';
import {prepareCommunityMaterial,selectCommunityMaterial} from '../lib/community-materials.mjs';
import {layeredCharacterRequest,layeredBackgroundRequest,normalizeLayeredCharacter,illustrationPlacementGuide} from '../lib/community-layered-illustration.mjs';
import {communityObjectLayerRect} from '../public/community-object-layers.js';
import {renderMasterAi,renderMasterWorkspace} from '../public/community-master-page.js';
import {readEditableCutout} from '../lib/community-cutout-edit.mjs';
import {planLayeredCommunityTarget,communityTargetReflowRequest} from '../lib/community-target-reflow.mjs';
import {restoreBannerVersion} from '../lib/community-banner-session.mjs';
import {illustrationOptions} from '../public/community-illustration-state.js';
import {removeCommunityMaterialReference} from '../lib/community-material-references.mjs';

const character=async()=>sharp(Buffer.from('<svg width="240" height="320"><path d="M80 30H140V90H180V210H140V285H110V230H80V285H50V110H80Z" fill="#e69030"/><circle cx="110" cy="65" r="18" fill="#ffe9ca"/></svg>')).png().toBuffer();
const scene=async()=>sharp({create:{width:384,height:216,channels:3,background:'#7dbbea'}}).png().toBuffer();
const fixture=()=>({id:'task',project:'分层验证',masterTemplateId:template.id,targetTemplateIds:[template.id],copy:'每日福利',updatedAt:'initial',status:'主图制作',assets:[{name:'role.png',mime:'image/png',role:'reference-image',url:'/role.png'},{name:'style.png',mime:'image/png',role:'reference-image',url:'/style.png'},{name:'old.png',mime:'image/png',materialKind:'illustration',role:'mother-candidate',width:384,height:216,url:'/old.png'}],parameters:{subtitleText:'',assetByTemplate:{[template.id]:{background:'old.png',title:null},target:{background:'untouched'}},layoutByTemplate:{[template.id]:{},target:{title:{x:10,y:10,width:200,height:100}}},backgroundByTemplate:{[template.id]:{focalX:50,focalY:50,scale:100}}},communityDesign:{versions:[]},history:[]});
const input=(task,extra={})=>({kind:'illustration',model:'gpt-image-2',prompt:'用图1角色，参考图2画风，春日每日福利banner，左侧留标题',requestId:'layered-request-123',expectedUpdatedAt:task.updatedAt,illustration:{characterMode:'theme',characterSourceName:'role.png',action:'',side:'auto'},...extra});
async function setup(t,{onSubmit,onPoll}={}){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'layered-illustration-')),tasksFile=path.join(root,'tasks.json'),storageDir=path.join(root,'storage'),task=fixture();
  t.after(()=>fs.rm(root,{recursive:true,force:true,maxRetries:6,retryDelay:50}));
  const dir=path.join(storageDir,'task','assets');await fs.mkdir(dir,{recursive:true});
  await fs.writeFile(path.join(dir,'role.png'),await character());await fs.writeFile(path.join(dir,'style.png'),await scene());await fs.writeFile(path.join(dir,'old.png'),await scene());await writeJson(tasksFile,[task]);
  const calls=[],jobs=new Map(),outputs=new Map();let backgroundBad=false;
  const options={tasksFile,storageDir,templateMap:new Map([[template.id,template]]),jobs,loadConfig:async()=>({enabled:true}),createCanvas:async()=>77,
    submitGeneration:async(c,body,settings)=>{const kind=body.ratio==='16:9'?'background':'character';calls.push({kind,body,settings});if(onSubmit)await onSubmit(kind,body);const id=`${kind}-job`;outputs.set(id,kind==='character'?await character():backgroundBad?await character():await scene());return id;},
    pollJob:async(c,id)=>{if(onPoll)await onPoll(id);},downloadRaw:async(c,id)=>({buffer:outputs.get(id)}),invalidate:t=>{t.artifacts=[];t.communityMasterApproval=null;}};
  const make=()=>createCommunityMaterialJobs(options),manager=make(),get=async()=>JSON.parse(await fs.readFile(tasksFile,'utf8'))[0];
  const poll=async()=>{for(let n=0;n<800;n++){const v=await get();if(v.communityGeneration?.status!=='running')return v;await new Promise(r=>setTimeout(r,10));}assert.fail('layered task timed out');};
  return {root,tasksFile,storageDir,task,manager,make,get,poll,calls,outputs,jobs,setBad:v=>backgroundBad=v};
}

test('single entry prepares a two-stage batch with stable references and all three character modes',()=>{
  const task=fixture(),run=prepareCommunityMaterial(task,input(task),template);
  assert.equal(run.workflow,'layered-illustration-v1');assert.deepEqual(run.steps.map(s=>s.kind),['character','background']);assert.deepEqual(run.referenceNames,['role.png','style.png']);
  const body=layeredCharacterRequest(run,[Buffer.from('role'),Buffer.from('style')]);assert.match(body.prompt,/界面图1/);assert.match(body.prompt,/根据活动主题/);assert.match(body.prompt,/手持道具/);assert.equal(body.background,'transparent');
  const directed=prepareCommunityMaterial(task,input(task,{illustration:{characterMode:'directed',characterSourceName:'role.png',action:'坐在书上看向左侧',side:'left'}}),template);
  assert.match(layeredCharacterRequest(directed,[]).prompt,/坐在书上看向左侧/);assert.equal(directed.composition.titleSide,'right');
  assert.throws(()=>prepareCommunityMaterial(task,input(task,{illustration:{characterMode:'original'}}),template),/透明角色/);
  assert.throws(()=>prepareCommunityMaterial(task,input(task,{illustration:{characterMode:'directed'}}),template),/填写角色动作/);
  assert.throws(()=>prepareCommunityMaterial(task,input(task,{illustration:{characterMode:'theme',characterSourceName:'foreign.png'}}),template),/不属于/);
  const bg=layeredBackgroundRequest(run,[Buffer.from('role'),Buffer.from('style'),Buffer.from('actual'),Buffer.from('layout')]);assert.match(bg.prompt,/最后两张/);assert.match(bg.prompt,/绝不绘制人/);assert.match(bg.prompt,/角色区域后方也要绘制完整环境/);assert.equal(bg.images.length,4);
});

test('prompt-driven batches ignore hidden legacy choices, keep reference purposes, and prioritize explicit actions and character placement',()=>{
 const task=fixture();task.parameters.communityIllustrationOptions={characterMode:'directed',characterSourceName:'removed.png',action:'旧任务动作：躺着睡觉',side:'right'};
 const before=structuredClone(task),prompt='保留图1角色的身份和画风，图2只参考动作，右手举旗、左手招手。人物放在画面左侧，右侧留文案。';
 for(const illustration of [undefined,{version:2,characterMode:'prompt',characterSourceName:'foreign.png',action:'旧任务动作：躺着睡觉',side:'right'}]){
  const run=prepareCommunityMaterial(task,input(task,{prompt,illustration}),template),body=layeredCharacterRequest(run,[Buffer.from('identity'),Buffer.from('pose')]);
  assert.equal(run.illustration.characterMode,'prompt');assert.equal(run.illustration.characterSourceName,'');assert.equal(run.illustration.action,'');assert.equal(run.illustration.side,'left');assert.equal(run.composition.titleSide,'right');assert.deepEqual(run.referenceNames,['role.png','style.png']);
  assert.ok(body.prompt.includes(prompt));assert.match(body.prompt,/只有设计师既未描述动作、也未指定动作参考图时/);assert.match(body.prompt,/动作参考图只参考姿势/);assert.match(body.prompt,/不得替换角色身份/);assert.match(body.prompt,/文字要求与动作参考有冲突时，以明确的文字要求为准/);assert.doesNotMatch(body.prompt,/旧任务动作|removed\.png|foreign\.png/);
 }
 assert.deepEqual(task,before,'Preparing a new batch must not rewrite old task settings or assets');
 const defaultRun=prepareCommunityMaterial(task,input(task,{prompt:'图1角色，左侧留标题',illustration:undefined}),template);assert.equal(defaultRun.illustration.side,'right','Leaving title space on the left does not place the character there');
 const negative=prepareCommunityMaterial(task,input(task,{prompt:'不要把人物放在左侧，人物放在画面右侧',illustration:undefined}),template);assert.equal(negative.illustration.side,'right');
});

test('only an explicit new reuse choice survives as a visible original mode; removing its illustration reference clears it without affecting text refs',()=>{
 const task=fixture();task.parameters.communityIllustrationOptions={characterMode:'original',characterSourceName:'role.png'};assert.equal(illustrationOptions(task).characterMode,'prompt');
 task.parameters.communityIllustrationOptions={version:2,characterMode:'original',characterSourceName:'role.png'};assert.equal(illustrationOptions(task).characterMode,'original');
 removeCommunityMaterialReference(task,{scope:'text',name:'role.png',expectedUpdatedAt:task.updatedAt},'text-removed');assert.equal(illustrationOptions(task).characterMode,'original');
 removeCommunityMaterialReference(task,{scope:'illustration',name:'role.png',expectedUpdatedAt:task.updatedAt},'illustration-removed');assert.equal(illustrationOptions(task).characterMode,'prompt');assert.equal(illustrationOptions(task).characterSourceName,'');assert.ok(task.assets.some(a=>a.name==='role.png'));
});

test('true alpha and flat matte give independent characters; opaque original and cropped/invalid outputs fail',async()=>{
  const raw=await character(),normalized=await normalizeLayeredCharacter(raw,{original:true});
  const original=await sharp(raw).extract(normalized.bounds).raw().toBuffer(),copy=await sharp(normalized.buffer).raw().toBuffer();assert.deepEqual(copy,original);
  const keyed=await sharp(Buffer.from('<svg width="240" height="320"><rect width="240" height="320" fill="#ff00ff"/><rect x="60" y="30" width="100" height="260" fill="#ffda55"/><circle cx="90" cy="80" r="10" fill="#ff00ff"/></svg>')).png().toBuffer();
  const out=await normalizeLayeredCharacter(keyed);assert.equal((await sharp(out.buffer).metadata()).hasAlpha,true);assert.equal((await sharp(out.buffer).ensureAlpha().raw().toBuffer())[(50*100+30)*4+3],0,'internal gap is transparent');
  await assert.rejects(async()=>normalizeLayeredCharacter(await scene(),{original:true}),/透明/);
  await assert.rejects(()=>normalizeLayeredCharacter(Buffer.from('bad')),/unsupported|corrupt|Input/i);
  const edge=await sharp(Buffer.from('<svg width="100" height="100"><rect x="0" y="10" width="80" height="80" fill="red"/></svg>')).png().toBuffer();await assert.rejects(()=>normalizeLayeredCharacter(edge),/边缘/);
});

test('one submit saves both layers, auto-composes, retains history/other sizes, and opens generated character for repair',async t=>{
  const f=await setup(t);await f.manager.submit('task',input(f.task));const result=await f.poll();assert.equal(result.communityGeneration.status,'done',result.communityGeneration.error);assert.equal(result.communityGeneration.applied,true);assert.deepEqual(f.calls.map(c=>c.kind),['character','background']);assert.equal(f.calls[0].body.canvas_id,f.calls[1].body.canvas_id);
  const bg=result.assets.find(a=>a.name===result.communityGeneration.assetName),char=result.assets.find(a=>a.name===result.communityGeneration.characterAssetName),layers=result.parameters.communityObjectLayersByTemplate[template.id];
  assert.ok(bg.layeredIllustration);assert.equal(bg.sceneCharacters.mode,'independent-character');assert.equal(layers.length,1);assert.equal(layers[0].appearance.assetName,char.name);assert.equal(result.parameters.assetByTemplate.target.background,'untouched');
  assert.equal(result.assets.filter(a=>a.name==='old.png').length,1);assert.ok(result.communityDesign.versions.at(-1).snapshot.objectLayers.length);
  const edit=await readEditableCutout({task:result,storageDir:f.storageDir,templateMap:new Map([[template.id,template]]),characterId:result.communityObjects.characters[0].id});assert.equal(edit.width,240);assert.equal(edit.height,320);
  await f.manager.submit('task',input(f.task));assert.equal(f.calls.length,2);
  const target={id:'portrait',width:720,height:1280};const plan=planLayeredCommunityTarget(result,template,target);assert.equal(plan.embeddedCharacter,false);assert.match(communityTargetReflowRequest({model:'gpt-image-2'},plan,await scene()).prompt,/无人物环境背景/);
  const before=result.communityDesign.versions.find(v=>!v.snapshot.objectLayers?.length);restoreBannerVersion(result,before.id);assert.equal(result.parameters.communityObjectLayersByTemplate[template.id].length,0);
  selectCommunityMaterial(result,{name:bg.name,expectedUpdatedAt:result.updatedAt},template);assert.equal(result.parameters.communityObjectLayersByTemplate[template.id].length,1);
  selectCommunityMaterial(result,{name:'old.png',expectedUpdatedAt:result.updatedAt},template);assert.equal(result.parameters.communityObjectLayersByTemplate[template.id].length,0,'old flattened scenes do not duplicate new character');
});

test('original character reuses source pixels and only generates its background',async t=>{
  const f=await setup(t);await f.manager.submit('task',input(f.task,{illustration:{version:2,characterMode:'original',characterSourceName:'role.png',side:'auto'}}));const result=await f.poll();assert.equal(result.communityGeneration.status,'done',result.communityGeneration.error);assert.deepEqual(f.calls.map(c=>c.kind),['background']);
  const asset=result.assets.find(a=>a.name===result.communityGeneration.characterAssetName),expected=await normalizeLayeredCharacter(await character(),{original:true});assert.deepEqual(await fs.readFile(path.join(f.storageDir,'task','assets',asset.name)),expected.buffer);assert.equal(result.communityGeneration.steps[0].reusedSource,true);
});

test('invalid original stops before any paid background call and keeps current composition',async t=>{
  const f=await setup(t);await f.manager.submit('task',input(f.task,{illustration:{characterMode:'original',characterSourceName:'style.png',side:'auto'}}));const result=await f.poll();assert.equal(result.communityGeneration.status,'failed');assert.match(result.communityGeneration.error,/真实透明/);assert.equal(f.calls.length,0);assert.deepEqual(result.parameters,f.task.parameters);
});

test('failed background keeps both raw receipts; resume and restart never repeat a completed paid stage',async t=>{
  const f=await setup(t);f.setBad(true);await f.manager.submit('task',input(f.task));const failed=await f.poll();assert.equal(failed.communityGeneration.status,'failed');assert.equal(failed.communityGeneration.steps[0].status,'done');assert.equal(failed.communityGeneration.steps[1].rawFile,'background-raw.png');assert.equal(failed.assets.length,3);assert.equal(f.calls.length,2);
  await f.manager.resume('task');await f.poll();assert.equal(f.calls.length,2);
  const tasks=JSON.parse(await fs.readFile(f.tasksFile));tasks[0].communityGeneration.status='running';await writeJson(f.tasksFile,tasks);await f.make().restore();await f.poll();assert.equal(f.calls.length,2);
});

test('unknown submit receipt resumes with the same idempotency key and frozen request',async t=>{
  let lost=true;const f=await setup(t,{onSubmit:async kind=>{if(kind==='background'&&lost){lost=false;throw Error('network receipt lost');}}});await f.manager.submit('task',input(f.task));const interrupted=await f.poll();assert.equal(interrupted.communityGeneration.status,'interrupted');assert.equal(f.calls.length,2);
  await f.manager.resume('task');const done=await f.poll();assert.equal(done.communityGeneration.status,'done',done.communityGeneration.error);assert.equal(f.calls.length,3);assert.equal(f.calls[1].settings.idempotencyKey,f.calls[2].settings.idempotencyKey);assert.deepEqual(f.calls[1].body,f.calls[2].body);
});

test('manual edit during generation retains paid pair in library and does not overwrite current composition',async t=>{
  let release,reached;const gate=new Promise(r=>release=r),ready=new Promise(r=>reached=r);const f=await setup(t,{onPoll:async id=>{if(id==='background-job'){reached();await gate;}}});await f.manager.submit('task',input(f.task));await ready;
  const tasks=JSON.parse(await fs.readFile(f.tasksFile));tasks[0].parameters.backgroundByTemplate[template.id].scale=123;await writeJson(f.tasksFile,tasks);release();const result=await f.poll();assert.equal(result.communityGeneration.status,'done');assert.equal(result.communityGeneration.applied,false);assert.equal(result.parameters.assetByTemplate[template.id].background,'old.png');assert.equal(result.parameters.backgroundByTemplate[template.id].scale,123);assert.ok(result.assets.find(a=>a.layeredIllustration));assert.equal(result.parameters.communityObjectLayersByTemplate,undefined);
});

test('UI keeps one prompt entry, reference menus and distinct preview tabs without legacy role dropdowns',()=>{
  const task=fixture();let html=renderMasterAi(task);assert.doesNotMatch(html,/id="community-character-(mode|source|action)"/);assert.match(html,/data-character-menu=/);assert.equal((html.match(/id="community-generate-material"/g)||[]).length,1);assert.match(html,/生成配套背景与角色/);
  task.parameters.communityIllustrationOptions={characterMode:'directed',action:'旧动作'};html=renderMasterAi(task);assert.doesNotMatch(html,/旧动作|community-character-action/);
  task.parameters.communityIllustrationOptions={version:2,characterMode:'original',characterSourceName:'role.png'};html=renderMasterAi(task);assert.match(html,/原样使用 · 图1/);assert.match(html,/data-character-reuse-clear/);
  task.communityGeneration={workflow:'layered-illustration-v1',phase:'materials',status:'failed',steps:[{kind:'character',status:'done'},{kind:'background',status:'failed'}]};assert.match(renderMasterAi(task),/继续处理本批素材/);
  const workspace=renderMasterWorkspace(task,{canvas:'CANVAS',inputs:'INPUTS',ai:'AI'});assert.match(workspace,/角色素材/);
});
