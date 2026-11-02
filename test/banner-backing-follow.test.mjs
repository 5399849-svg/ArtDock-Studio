import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {resolveBannerBackingFollow} from '../lib/banner-backing-follow.mjs';
import {validateBannerDesignInput,commitBannerDesign,bannerSourceToken} from '../lib/community-banner-session.mjs';

const prompt='主标参考图2的颜色和字效做修改，其它保留不变。副标文字要跟着底板的倾斜做调整。';
function task(){return {masterTemplateId:'master',updatedAt:'before',copy:'天工谜影\n谁是百晓生？',assets:[{name:'paper.png',role:'subtitle-backing'}],parameters:{subtitleText:'慧眼识物，有惊喜掉落！',assetByTemplate:{master:{subtitle:null,title:'old-title.png'}},layoutByTemplate:{master:{
  title:{x:70,y:70,width:480,height:170},subtitle:{x:80,y:280,width:440,height:40,textColor:'#674025',effects:{stroke:{enabled:false}}},character:{x:600,y:20,width:350,height:350},logo:{x:20,y:10,width:100,height:60},'subtitle-backing':{x:80,y:250,width:460,height:90,visible:true,backing:{enabled:true,assetName:'paper.png'}},
}}}};}
function prepare(value,instruction=prompt){return validateBannerDesignInput(value,{mode:'edit',prompt:instruction,expectedUpdatedAt:value.updatedAt,layouts:structuredClone(value.parameters.layoutByTemplate.master),titleFontId:'licensed'},{width:1000,height:500},{fonts:[{id:'licensed'}]});}
const paper=()=>sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="200"><path d="M30 70L970 25L970 135L30 180Z" fill="#fff0c9"/></svg>')).png().toBuffer();

test('exact mixed request changes only title design plus measured native subtitle, leaving backing and other layers intact',async()=>{
  const value=task(),before=structuredClone(value),run=prepare(value),buffer=await paper();
  assert.deepEqual(run.aiKinds,['title']);
  await resolveBannerBackingFollow(run,{readBacking:async name=>{assert.equal(name,'paper.png');return buffer;}});
  assert.ok(run.layouts.subtitle.rotation < -1);
  assert.equal(run.layouts.subtitle.textColor,'#674025');
  assert.equal(run.layouts.subtitle.align,'center');
  assert.equal(run.layouts.subtitle.backingAlignment.assetName,'paper.png');
  for(const kind of ['character','logo','title','subtitle-backing'])assert.deepEqual(run.layouts[kind],before.parameters.layoutByTemplate.master[kind]);
  assert.deepEqual(value,before,'resolution cannot mutate live task before AI succeeds');
  commitBannerDesign(value,{run:{...run,runId:'test',masterAssets:{}},assets:[{name:'new-title.png'}],bindings:{title:'new-title.png'}});
  assert.equal(value.parameters.assetByTemplate.master.title,'new-title.png');
  assert.deepEqual(value.parameters.layoutByTemplate.master['subtitle-backing'],before.parameters.layoutByTemplate.master['subtitle-backing']);
});

test('local-only following needs no model or font, and failures leave original task unchanged',async()=>{
  const value=task(),before=structuredClone(value),run=prepare(value,'副标跟随底板倾斜');
  assert.deepEqual(run.aiKinds,[]);
  assert.equal(bannerSourceToken(value),run.sourceToken);
  await assert.rejects(resolveBannerBackingFollow(run,{readBacking:async()=>{throw Error('素材读取失败');}}),/素材读取失败/);
  assert.deepEqual(value,before);
  await resolveBannerBackingFollow(run,{readBacking:paper});
  assert.ok(run.layouts.subtitle.rotation < 0);
});

test('missing backing and rasterized subtitle reject before any generation',()=>{
  const value=task();
  value.parameters.layoutByTemplate.master['subtitle-backing'].visible=false;
  assert.throws(()=>prepare(value),/先添加并显示/);
  value.parameters.layoutByTemplate.master['subtitle-backing'].visible=true;
  value.parameters.assetByTemplate.master.subtitle='old-text.png';
  assert.throws(()=>prepare(value),/整张图片/);
});
