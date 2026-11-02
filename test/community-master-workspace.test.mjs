import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {communityMasterTemplate,ensureCommunityMasterWorkspace,renderCommunityArtworkEditSource,remapLegacyMasterSnapshot} from '../lib/community-master-workspace.mjs';
import {prepareCommunityArtwork,communityArtworkRequest,fitCommunityArtwork} from '../lib/community-artwork.mjs';
import {renderMasterInputs,renderMasterAi,renderMasterWorkspace} from '../public/community-master-page.js';

const previous={id:'community-official-cover',width:900,height:383,communityPlacement:true};
const fixture=()=>({id:'task',project:'霜降祝福',masterTemplateId:previous.id,targetTemplateIds:[previous.id,'portrait'],copy:'霜降祝福',updatedAt:'before',assets:[{name:'scene.png',role:'mother-candidate',mime:'image/png',url:'/scene.png'},{name:'logo.png',role:'logo',mime:'image/png',url:'/logo.png'}],parameters:{assetByTemplate:{[previous.id]:{background:'scene.png',logo:'logo.png'},portrait:{background:'portrait.png'}},layoutByTemplate:{[previous.id]:{logo:{x:18,y:12,width:180,height:60,visible:true}},portrait:{logo:{x:20,y:30,width:100,height:40}}},backgroundByTemplate:{[previous.id]:{focalX:50,focalY:50,scale:100},portrait:{scale:120}},communityArtworkByTemplate:{[previous.id]:{assetName:'scene.png',copy:'霜降祝福',subtitle:'',mode:'whole-artwork',runId:'old'}}},communityMasterApproval:{fingerprint:'old-approved'},communityDesign:{currentVersionId:'old',versions:[{id:'old',snapshot:{masterTemplateId:previous.id,assets:{background:'scene.png'}}}]},artifacts:[{url:'/old-delivery.png'}],history:[]});

test('opening a legacy workspace creates a separate 1920x1080 master without overwriting any delivery sizes or history',()=>{
  const task=fixture(),before=structuredClone(task);assert.equal(ensureCommunityMasterWorkspace(task,previous,{now:'now'}),true);
  assert.equal(task.masterTemplateId,communityMasterTemplate.id);assert.equal(task.parameters.backgroundByTemplate[task.masterTemplateId].fit,'contain');assert.equal(task.communityMasterApproval,null);
  for(const id of task.targetTemplateIds)for(const key of ['layoutByTemplate','assetByTemplate','backgroundByTemplate','communityArtworkByTemplate'])assert.deepEqual(task.parameters[key][id],before.parameters[key][id]);
  for(const key of ['assets','targetTemplateIds','artifacts','communityDesign'])assert.deepEqual(task[key],before[key]);
  assert.deepEqual(task.communityMasterWorkspace.previousApproval,before.communityMasterApproval);
  const stored=structuredClone(task);assert.equal(ensureCommunityMasterWorkspace(task,communityMasterTemplate),false);assert.deepEqual(task,stored);
  const mapped=task.parameters.layoutByTemplate[task.masterTemplateId].logo;assert.equal(mapped.width/mapped.height,3);
});

test('delivered tasks remain locked and running jobs cannot be silently migrated',()=>{
  const task=fixture();task.status='已完成';task.deliveredPackage={url:'/delivered.zip'};const before=structuredClone(task);
  assert.equal(ensureCommunityMasterWorkspace(task,previous),false);assert.deepEqual(task,before);
  for(const field of ['communityGeneration','outpaint']){const current=fixture();current[field]={status:'running'};assert.throws(()=>ensureCommunityMasterWorkspace(current,previous),e=>e.status===409);}
});

test('fixed master requests are 16:9 and 4K, and copy references guide style without replacing the exact copy',()=>{
  const task=fixture();ensureCommunityMasterWorkspace(task,previous);task.parameters.communityCopyReference='参考图3的金色书法，标题一行排列';
  const run=prepareCommunityArtwork(task,{mode:'concept',prompt:'廊下捧手炉',model:'gpt-image-2',expectedUpdatedAt:task.updatedAt},communityMasterTemplate);
  const refs=[Buffer.from('style'),Buffer.from('character'),Buffer.from('type')];
  const body=communityArtworkRequest({run,template:communityMasterTemplate,references:refs,referenceRoles:['reference-image','reference-image','reference-copy']});
  assert.equal(body.image_size,'4K');assert.equal(body.ratio,'16:9');assert.equal(body.quality,'high');assert.equal(body.images.length,3);
  assert.match(body.prompt,/输入第3张就是界面图3，这是文案参考图/);assert.match(body.prompt,/金色书法，标题一行排列/);assert.match(body.prompt,/主文案："霜降祝福"/);assert.doesNotMatch(body.prompt,/900×383|中心安全区域|旧文字框/);
});

test('master retention and later editing preserve the original 4K pixels',async()=>{
  const raw=await sharp(Buffer.from('<svg width="3840" height="2160"><rect width="3840" height="2160" fill="#c3a7b8"/><circle cx="1920" cy="1080" r="500" fill="#283d72"/><path d="M0 20L3840 20" stroke="#ee3311" stroke-width="12"/></svg>')).png().toBuffer();
  const retained=await fitCommunityArtwork(raw,communityMasterTemplate),edited=await renderCommunityArtworkEditSource(retained,communityMasterTemplate,{scale:100,focalX:50,focalY:50});
  for(const image of [retained,edited]){const m=await sharp(image).metadata();assert.equal(m.width,3840);assert.equal(m.height,2160);assert.deepEqual(await sharp(image).removeAlpha().raw().toBuffer(),await sharp(raw).removeAlpha().raw().toBuffer());}
  const legacy=await sharp({create:{width:1800,height:766,channels:3,background:'#883355'}}).png().toBuffer();
  const contained=await renderCommunityArtworkEditSource(legacy,communityMasterTemplate,{fit:'contain'});const top=await sharp(contained).extract({left:10,top:10,width:1,height:1}).removeAlpha().raw().toBuffer();assert.deepEqual([...top],[238,241,247]);
});

test('references and prompt share the light AI composer; left shows generated materials and targets stay in the second page',()=>{
  const task=fixture();ensureCommunityMasterWorkspace(task,previous);task.assets.push({name:'style.png',role:'reference-image',mime:'image/png',url:'/style.png'},{name:'type.png',role:'reference-copy',mime:'image/png',url:'/type.png'});
  const inputs=renderMasterInputs(task);assert.match(inputs,/素材库/);assert.doesNotMatch(inputs,/reference-upload|文案参考|type.png|style.png/);
  const ai=renderMasterAi(task,{model:'gpt-image-2'});assert.match(ai,/<figcaption>图2<\/figcaption>/);assert.match(ai,/id="community-reference-upload"/);assert.match(ai,/GPT-Image2/);assert.match(ai,/>4K 背景</);assert.doesNotMatch(ai,/width="900"|目标尺寸/);
  const options={canvas:'<canvas></canvas>',inputs,ai,versions:'版本',dock:'TARGET-ONLY',inspector:''};
  const master=renderMasterWorkspace(task,options),targets=renderMasterWorkspace(task,{...options,stage:'sizes',canExtend:true});
  assert.match(master,/确认母版并延展尺寸/);assert.doesNotMatch(master,/TARGET-ONLY/);assert.match(targets,/TARGET-ONLY/);assert.match(targets,/id="community-back-master"/);
});
