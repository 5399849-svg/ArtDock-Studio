import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {prepareCommunityArtwork,communityArtworkRequest,fitCommunityArtwork,saveCommunityArtwork,applyCommunityArtwork,bindCommunityArtwork} from '../lib/community-artwork.mjs';
import {bannerMasterSnapshot,restoreBannerVersion} from '../lib/community-banner-session.mjs';
import {renderCommunityComposer} from '../public/community-composer.js';
import {communityArtworkTargetPending} from '../public/community-artwork-state.js';

const template={id:'master',width:900,height:383};
const fixture=()=>({id:'task',masterTemplateId:'master',copy:'霜降祝福',updatedAt:'2026-10-20T01:00:00Z',assets:[{name:'scene.png',mime:'image/png',role:'mother-candidate'},{name:'logo.png',mime:'image/png',role:'logo'}],parameters:{subtitleText:'',titleFontId:'old-company-font',layoutByTemplate:{master:{title:{x:100,y:100,width:300,height:90,visible:true}},target:{title:{x:10,y:10,width:20,height:30}}},assetByTemplate:{master:{background:'scene.png',title:null,logo:'logo.png'},target:{background:'target.png'}},backgroundByTemplate:{master:{url:'old-outpaint'}}},communityMasterApproval:{fingerprint:'old'},history:[]});
const prepare=(task,extra={})=>({...prepareCommunityArtwork(task,{mode:'concept',prompt:'参考图1的绘画风格和版式，用图2的角色设定，捧手炉',model:'gpt-image-2',expectedUpdatedAt:task.updatedAt,...extra},template),runId:'new-run'});
const proposal=run=>({run,asset:{name:'whole.png',mime:'image/png',role:'mother-candidate',artworkMode:'whole-artwork'}});

test('whole artwork directly uses numbered user references, without old masks, fonts or layout guides',()=>{
  const task=fixture(),run=prepare(task),refs=[Buffer.from('style'),Buffer.from('character-sheet')];
  const body=communityArtworkRequest({run,template,references:refs});
  assert.equal(body.images.length,2);assert.equal(body.images[0].data_base64,refs[0].toString('base64'));
  assert.match(body.prompt,/输入第1张就是界面图1/);assert.match(body.prompt,/输入第2张就是界面图2/);
  assert.match(body.prompt,/只取身份、服装与造型/);assert.match(body.prompt,/副文案为空，不得添加/);
  assert.match(body.prompt,/主文案："霜降祝福"/);assert.match(body.prompt,/禁止画游戏Logo/);
  assert.doesNotMatch(body.prompt,/old-company-font|"x":100|titleMask|guideDataUrl/);
  assert.equal(body.ratio,'21:9');assert.equal(body.model,'gpt-image-2');assert.equal(body.quality,'high');
});

test('editing is a whole image request, not a restricted layer-command parser; internal assets do not shift reference numbers',()=>{
  const task=fixture(),run=prepare(task,{mode:'concept-edit',prompt:'左侧色彩太淡，让画面更有霜降清晨的感觉，标题更醒目'});
  const body=communityArtworkRequest({run,template,references:[Buffer.from('ref')],characters:[Buffer.from('character')],current:Buffer.from('current')});
  assert.match(body.prompt,/输入第1张就是界面图1/);assert.match(body.prompt,/输入第2张是独立角色素材/);assert.match(body.prompt,/输入第3张.*不属于参考图编号/);
  assert.equal(Buffer.from(body.images.at(-1).data_base64,'base64').toString(),'current');
  assert.match(body.prompt,/左侧色彩太淡/);
});

test('unchanged master applies an unapproved artwork, hides duplicated text/characters and leaves other sizes untouched',()=>{
  const task=fixture(),before=structuredClone(task),run=prepare(task);
  assert.deepEqual(saveCommunityArtwork(task,proposal(run)),{applied:true});
  assert.equal(task.communityMasterApproval,null);assert.equal(task.parameters.assetByTemplate.master.background,'whole.png');
  for(const kind of ['title','subtitle','character','character2','foreground']){
    assert.equal(task.parameters.assetByTemplate.master[kind],null);assert.equal(task.parameters.layoutByTemplate.master[kind].visible,false);
  }
  assert.equal(task.parameters.assetByTemplate.master.logo,'logo.png');assert.equal(task.parameters.layoutByTemplate.master.logo.visible,true);
  assert.deepEqual(task.parameters.layoutByTemplate.target,before.parameters.layoutByTemplate.target);
  assert.deepEqual(task.parameters.assetByTemplate.target,before.parameters.assetByTemplate.target);
  assert.deepEqual(task.assets.slice(0,2),before.assets);
  assert.equal(task.parameters.communityArtworkByTemplate.master.copy,'霜降祝福');
  assert.equal(task.communityDesign.versions.length,2);
});

test('paid candidate survives concurrent font or layout edits without overwriting them, and may be explicitly applied',()=>{
  const task=fixture(),run=prepare(task);task.parameters.layoutByTemplate.master.title.x=120;task.parameters.titleFontId='manually-changed';
  const before=bannerMasterSnapshot(task);
  assert.deepEqual(saveCommunityArtwork(task,proposal(run)),{applied:false});
  assert.deepEqual(bannerMasterSnapshot(task),before);assert.equal(task.communityArtworkProposals[0].asset.name,'whole.png');assert.ok(task.assets.some(a=>a.name==='whole.png'));
  assert.throws(()=>applyCommunityArtwork(task,proposal(run),{expectedUpdatedAt:'stale'}),error=>error.status===409);
  applyCommunityArtwork(task,proposal(run),{expectedUpdatedAt:task.updatedAt});assert.equal(task.parameters.assetByTemplate.master.background,'whole.png');
});

test('changed final copy cannot silently apply a paid old-copy candidate',()=>{
  const task=fixture(),run=prepare(task);task.copy='立冬祝福';
  assert.deepEqual(saveCommunityArtwork(task,proposal(run)),{applied:false});
  assert.throws(()=>applyCommunityArtwork(task,proposal(run)),/最终文案已变化/);assert.equal(task.copy,'立冬祝福');assert.equal(task.parameters.assetByTemplate.master.background,'scene.png');
});

test('history restores whole-artwork metadata and legacy native text states together',()=>{
  const task=fixture(),before=bannerMasterSnapshot(task),run=prepare(task);saveCommunityArtwork(task,proposal(run));
  const whole=bannerMasterSnapshot(task);restoreBannerVersion(task,'before-new-run');assert.deepEqual(bannerMasterSnapshot(task),before);
  restoreBannerVersion(task,'new-run');assert.deepEqual(bannerMasterSnapshot(task),whole);
});

test('manual adjustments after an earlier saved version receive their own recovery snapshot',()=>{
  const task=fixture();task.communityDesign={versions:[{id:'old',snapshot:bannerMasterSnapshot(task)}],currentVersionId:'old'};
  task.parameters.layoutByTemplate.master.title.x=170;const manual=bannerMasterSnapshot(task),run=prepare(task);
  saveCommunityArtwork(task,proposal(run));restoreBannerVersion(task,'before-new-run');assert.deepEqual(bannerMasterSnapshot(task),manual);
});

test('whole-image edits preserve a manually positioned independent Logo, while no-Logo placements suppress it',()=>{
  const task=fixture();task.parameters.layoutByTemplate.master.logo={x:35,y:17,width:180,height:60,visible:true};
  assert.deepEqual(prepare(task,{mode:'concept-edit'}).logoLayout,task.parameters.layoutByTemplate.master.logo);
  const noLogo=prepareCommunityArtwork(task,{mode:'concept',prompt:'重排',model:'gpt-image-2',expectedUpdatedAt:task.updatedAt},{...template,brandLogo:false});assert.equal(noLogo.logo,null);
});

test('target reflow binds the entire design and suppresses duplicated native titles, including no-Logo sizes',()=>{
  const task=fixture(),run=prepare(task);run.logo=null;run.logoLayout.visible=false;
  bindCommunityArtwork(task,{run,asset:proposal(run).asset,templateId:'target'});
  assert.equal(task.parameters.assetByTemplate.target.logo,null);assert.equal(task.parameters.layoutByTemplate.target.title.visible,false);
  assert.equal(task.parameters.communityArtworkByTemplate.target.mode,'whole-artwork');assert.equal(task.parameters.assetByTemplate.master.background,'scene.png');
});

test('exact output dimensions preserve aspect and reject incompatible provider outputs',async()=>{
  const full=await sharp({create:{width:2800,height:1200,channels:3,background:'#bb8855'}}).png().toBuffer();
  const result=await fitCommunityArtwork(full,template),meta=await sharp(result).metadata();assert.equal(meta.width,1800);assert.equal(meta.height,766);
  await assert.rejects(fitCommunityArtwork(full,{width:900,height:1200}),/比例不符合/);
  const wide={id:'wide',width:984,height:334},body=communityArtworkRequest({run:prepare(fixture()),template:wide});
  assert.match(body.prompt,/中心安全区域/);assert.match(body.prompt,/高79.2%/);
  const wideOutput=await sharp(await fitCommunityArtwork(full,wide)).metadata();assert.equal(wideOutput.width,1968);assert.equal(wideOutput.height,668);
});

test('composer defaults to whole design and exposes original-font production separately; conflicts have a real apply action',()=>{
  const task=fixture(),html=renderCommunityComposer(task,{model:'gpt-image-2'});
  assert.match(html,/<option value="concept" selected/);assert.match(html,/分层制作（固定字体）/);
  task.communityGeneration={phase:'artwork',status:'candidate-ready',runId:'new-run'};task.communityArtworkProposals=[proposal(prepare(task))];
  assert.match(renderCommunityComposer(task,{model:'gpt-image-2'}),/id="community-apply-artwork"/);
  assert.equal(prepareCommunityArtwork(task,{mode:'concept',prompt:'风格',model:'gpt-image-2',expectedUpdatedAt:task.updatedAt},{...template,width:984,height:334},{logoAspect:2}).logoLayout.width/prepareCommunityArtwork(task,{mode:'concept',prompt:'风格',model:'gpt-image-2',expectedUpdatedAt:task.updatedAt},{...template,width:984,height:334},{logoAspect:2}).logoLayout.height,2);
});

test('target trials are a separate composition from the master; approval and master history remain intact',()=>{
  const task=fixture();task.targetTemplateIds=['master','target'];saveCommunityArtwork(task,proposal(prepare(task)));task.communityMasterApproval={fingerprint:'confirmed'};
  const before=bannerMasterSnapshot(task),version=task.communityDesign.currentVersionId,target={id:'target',width:900,height:1200,communityPlacement:true,brandLogo:true};
  assert.equal(communityArtworkTargetPending(task,target),true);
  const run={...prepareCommunityArtwork(task,{mode:'adapt',model:'gpt-image-2',expectedUpdatedAt:task.updatedAt},target),runId:'portrait'};
  const body=communityArtworkRequest({run,template:target,current:Buffer.from('master')});
  assert.equal(body.images.length,1);assert.match(body.prompt,/重新组织上中下布局/);assert.match(body.prompt,/时段、天气、人物/);assert.match(body.prompt,/原有文字的笔触与材质/);
  const asset={name:'portrait.png',mime:'image/png',role:'generated-background',sourceBackgroundName:'whole.png'};
  assert.deepEqual(saveCommunityArtwork(task,{run,asset}),{applied:true});assert.deepEqual(bannerMasterSnapshot(task),before);assert.equal(task.communityDesign.currentVersionId,version);assert.equal(task.communityMasterApproval.fingerprint,'confirmed');
  assert.equal(communityArtworkTargetPending(task,target),false);assert.equal(task.parameters.layoutByTemplate.target.title.visible,false);assert.equal(task.communityDesign.targetVersions.target.length,1);
});

test('target edits in flight keep paid adaptation as a candidate, and a later changed master cannot accept an old adaptation',()=>{
  const task=fixture();task.targetTemplateIds=['master','target'];saveCommunityArtwork(task,proposal(prepare(task)));
  const target={id:'target',width:900,height:1200,communityPlacement:true};
  const run={...prepareCommunityArtwork(task,{mode:'adapt',model:'gpt-image-2',expectedUpdatedAt:task.updatedAt},target),runId:'portrait'};
  task.parameters.layoutByTemplate.target.title.x=99;
  const p={run,asset:{name:'portrait.png',mime:'image/png',role:'generated-background'}};
  assert.deepEqual(saveCommunityArtwork(task,p),{applied:false});assert.equal(task.parameters.layoutByTemplate.target.title.x,99);
  task.parameters.communityArtworkByTemplate.master.assetName='new-daylight-master.png';
  assert.throws(()=>applyCommunityArtwork(task,p),/母版已变化/);assert.equal(communityArtworkTargetPending(task,target),true);
});

test('inherited and stale crops never count as a completed target; fresh targets are linked to the exact master artwork',()=>{
  const task=fixture(),target={id:'target',communityPlacement:true};
  assert.equal(communityArtworkTargetPending(task,target),false);
  task.parameters.communityArtworkByTemplate={master:{assetName:'whole.png'},target:{assetName:'target.png'}};
  assert.equal(communityArtworkTargetPending(task,target),true);
  task.parameters.communityArtworkByTemplate.target.sourceArtworkName='old-night.png';assert.equal(communityArtworkTargetPending(task,target),true);
  task.parameters.communityArtworkByTemplate.target.sourceArtworkName='whole.png';assert.equal(communityArtworkTargetPending(task,target),false);
  assert.equal(communityArtworkTargetPending(task,{id:'master',communityPlacement:true}),false);
});
