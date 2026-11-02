import test from 'node:test';
import assert from 'node:assert/strict';
import { communityImageRequest, communityTypographyRequest, communityReferenceAssets } from '../lib/community-ai-generation.mjs';
import { analyzeCommunityTone, assessCommunityTone, communityToneGuide } from '../lib/community-tone.mjs';
import sharp from 'sharp';
import { renderCommunityComposer } from '../public/community-composer.js';

test('mixed legacy and new references keep UI numbers in both generation phases', () => {
  const task = {masterTemplateId:'m',parameters:{assetByTemplate:{m:{background:'scene'}}},assets:[
    ref('person','character'),ref('font-old','reference-copy'),ref('scene','background'),
    ref('palette','reference-image'),ref('style-old','reference-tone')
  ]};
  const html = renderCommunityComposer(task,{model:'gpt-image-2'});
  assert.deepEqual([...html.matchAll(/<figcaption>(.*?)<\/figcaption>/g)].map(match=>match[1]),['图1','图2','图3']);
  assert.doesNotMatch(html,/community-reference-kind|风格参考|字形参考/);
  for (const phase of ['background','typography']) {
    const selected = communityReferenceAssets(task,phase);
    assert.deepEqual(selected.slice(0,3).map(asset=>asset.name),['font-old','palette','style-old']);
    const options = {model:'gpt-image-2',kind:'title',text:'测试标题',prompt:'参考图1的风格、图2的色调、图3的字体设计',direction:'参考图1的风格、图2的色调、图3的字体设计',template:{width:900,height:383},images:selected.map(asset=>Buffer.from(asset.name)),imageRoles:selected.map(asset=>asset.role)};
    const body = phase==='typography' ? communityTypographyRequest(options) : communityImageRequest(options);
    assert.match(body.prompt,/输入第 1 张：参考图1/);
    assert.match(body.prompt,/输入第 2 张：参考图2/);
    assert.match(body.prompt,/输入第 3 张：参考图3/);
    assert.match(body.prompt,/输入第 4 张：工作台角色素材/);
    assert.equal(body.images[2].data_base64,Buffer.from('style-old').toString('base64'));
  }
});

test('both 画布 image models receive reference images and clean-layer constraints', () => {
  for (const model of ['banana_pro', 'gpt-image-2']) {
    const body = communityImageRequest({ model, prompt:'明亮童话森林', template:{width:984,height:562}, images:[Buffer.from('reference')] });
    assert.equal(body.model, model);
    assert.equal(body.bot_id, 'canvas');
    assert.equal(body.images.length, 1);
    assert.match(body.prompt, /透明素材图层独立叠加/);
    assert.match(body.prompt, /不得复制到结果/);
    assert.match(body.prompt, /绝不可把人物画进背景/);
  }
});

test('target generation protects the confirmed background and only extends its edges', () => {
  const body = communityImageRequest({model:'gpt-image-2',prompt:'',template:{width:500,height:650},phase:'targets',images:[Buffer.from('mother')]});
  assert.match(body.prompt,/已确认母版的背景/);
  assert.match(body.prompt,/仅沿中央画面的边缘向外补出/);
  assert.match(body.prompt,/不重画、不移动、不裁掉母版内容/);
  assert.match(body.prompt,/不要用另一幅相似场景代替母版/);
  assert.match(body.prompt,/翻转、镜像/);
  assert.doesNotMatch(body.prompt,/优先级依次为|角色趴在书本上|各方案都须满足/);
  assert.equal(body.quality,'high');
});

test('typography request keeps confirmed copy exact and returns a separate transparent layer', () => {
  const body = communityTypographyRequest({kind:'title',text:'返工状态大赏',template:{width:984,height:562},images:[Buffer.from('copy-style')]});
  assert.equal(body.model,'gpt-image-2');
  assert.equal(body.background,'transparent');
  assert.equal(body.output_format,'png');
  assert.equal(body.images.length,1);
  assert.match(body.prompt,/返工状态大赏/);
  assert.match(body.prompt,/逐字准确/);
  assert.match(body.prompt,/不要照抄参考图上的旧文字/);
});

test('tone comparison flags a dull candidate without changing its pixels', async () => {
  const reference = await analyzeCommunityTone(await sharp({ create: { width: 40, height: 20, channels: 3, background: '#1caff5' } }).png().toBuffer());
  const candidate = await analyzeCommunityTone(await sharp({ create: { width: 40, height: 20, channels: 3, background: '#7c8990' } }).png().toBuffer());
  assert.deepEqual(assessCommunityTone(reference, candidate), ['偏灰']);
  assert.match(communityToneGuide(reference), /亮度/);
  const body = communityImageRequest({model:'gpt-image-2',prompt:'参考图片设计一张 banner',template:{width:900,height:383},images:[Buffer.from('reference')],toneGuide:communityToneGuide(reference)});
  assert.match(body.prompt, /围绕角色重新配色/);
  assert.doesNotMatch(body.prompt, /最高优先级依据|严格沿用参考图/);
  assert.match(body.prompt, /灰褐滤镜/);
});

const ref = (name, role) => ({ name, role, url:`/assets/${name}.png`, mime:'image/png' });
test('new backgrounds get the selected character and style, without inheriting old scenery', () => {
  const task = {masterTemplateId:'master',parameters:{assetByTemplate:{master:{character:'selected',background:'old-scene'}}},assets:[ref('unused','character'),ref('selected','character'),ref('old-scene','background'),ref('style1','reference-tone'),ref('style2','reference-tone'),ref('type','reference-copy')]};
  const selected = communityReferenceAssets(task,'background');
  assert.deepEqual(selected.slice(0,3).map(asset=>asset.name),['style1','style2','type']);
  assert.ok(selected.some(asset=>asset.name==='selected'));
  assert.ok(selected.some(asset=>asset.name==='style1'));
  assert.ok(!selected.some(asset=>asset.name==='old-scene'));
  const request = communityImageRequest({model:'gpt-image-2',prompt:'为鲛人设计清透水下空间',template:{width:900,height:383},images:selected.map(asset=>Buffer.from(asset.name)),imageRoles:selected.map(asset=>asset.role)});
  assert.match(request.prompt,/工作台角色素材（不属于参考图编号）/);
  assert.match(request.prompt,/参考图3（界面图3）/);
  assert.match(request.prompt,/不要照抄其中的背景/);
  assert.match(request.prompt,/原创环境/);
  assert.equal(request.images[0].data_base64,Buffer.from('style1').toString('base64'));
  assert.deepEqual(communityReferenceAssets(task,'targets').map(asset=>asset.name),['old-scene']);
});

test('hidden characters and Photoshop documents are not sent as style references', () => {
  const task={masterTemplateId:'m',parameters:{layoutByTemplate:{m:{character:{visible:false},character2:{visible:false}}}},assets:[ref('c','character'),{name:'source.psb',mime:'image/vnd.adobe.photoshop',url:'/source.psb',role:'character'},ref('s','reference-tone')]};
  assert.deepEqual(communityReferenceAssets(task,'master').map(asset=>asset.name),['s']);
});

test('unified creative direction reaches typography while exact copy stays authoritative', () => {
  const body=communityTypographyRequest({kind:'title',text:'创作者中心上线',template:{width:900,height:383},direction:'根据鲛人的青蓝色设计清透字形',copyReference:'不要古风建筑装饰'});
  assert.match(body.prompt,/根据鲛人的青蓝色/);
  assert.match(body.prompt,/不要古风建筑装饰/);
  assert.match(body.prompt,/最终文字仍严格以「创作者中心上线」为准/);
});

test('both copy layers keep explicit simplicity and pure-text instructions above the references', () => {
  for (const kind of ['title','subtitle']) {
    const body=communityTypographyRequest({kind,text:'天工谜影',template:{width:900,height:383},direction:'参考图2的文字设计，纯文字、无装饰'});
    assert.match(body.prompt,/默认克制地设计字组/);
    assert.match(body.prompt,/不要把人物道具或场景主题变成标题周围的挂件/);
    assert.match(body.prompt,/严格只保留字形和文字自身效果，优先于参考图里的装饰/);
    assert.match(body.prompt,/不添加底条、边框或挂件/);
    assert.match(body.prompt,/要求“简洁”时降低细节、效果和装饰负担/);
    assert.doesNotMatch(body.prompt,/可用轻量图形衬托|做成有设计感/);
    assert.equal(body.background,'transparent');
  }
});

test('explicit decorative requests stay available without making them the default', () => {
  const body=communityTypographyRequest({kind:'title',text:'春日活动',template:{width:900,height:383},direction:'借鉴图2的装饰，只在标题旁加一片叶子'});
  assert.match(body.prompt,/【创作说明】借鉴图2的装饰，只在标题旁加一片叶子/);
  assert.match(body.prompt,/借鉴整套文案设计或明确要求装饰时/);
  assert.match(body.prompt,/按所要求的种类与数量少量添加/);
  assert.match(body.prompt,/仅参考字体、风格或色调不等于要求复制周边装饰/);
  assert.match(body.prompt,/最终文字仍严格以「春日活动」为准/);
});

test('typography references guide glyphs and effects without fixing every topic to the same style', () => {
  for(const direction of ['参考图1的童趣字形与描边','参考图2的书法笔势，不要厚描边','参考图3的金色高光和光晕，保留字形和排版']){
    const body=communityTypographyRequest({kind:'title',text:'祥龙贺新春',template:{width:900,height:383},direction});
    for(const heading of ['主题与字形','字组组织','主副层级','功能承托','轮廓效果与配色','语义装饰'])assert.ok(body.prompt.includes(`【${heading}】`));
    assert.match(body.prompt,/不要求每个字等大/);
    assert.match(body.prompt,/不固定两行/);
    assert.match(body.prompt,/保留没有厚描边的效果/);
    assert.match(body.prompt,/不得统一套多重粗描边/);
    assert.ok(body.prompt.includes(`【创作说明】${direction}`));
    assert.match(body.prompt,/要求保留字形、排版或换行时，不擅自更换/);
  }
});

test('subtitle allows a local support strip while remaining a separate transparent layer', () => {
  const body=communityTypographyRequest({kind:'subtitle',text:'全新潮流季',template:{width:984,height:334},direction:'参考图1的整套文案设计，副标使用简洁蓝色胶囊条',companionText:'沙滩乐园'});
  assert.match(body.prompt,/功能性底条可以有填色/);
  assert.match(body.prompt,/不要求每条副标都有底条/);
  assert.match(body.prompt,/副标采用更规整、更轻的笔画与效果/);
  assert.match(body.prompt,/不生成填满整张画布的实色底板/);
  assert.match(body.prompt,/获准承托区域之外保持真实透明/);
  assert.match(body.prompt,/「沙滩乐园」仅用于理解题材、配色与层级，禁止将这段文字绘入当前副标题图层/);
  assert.match(body.prompt,/唯一允许出现的文案是「全新潮流季」/);
  assert.equal(body.background,'transparent');
});

test('selected primary title reaches subtitle requests without changing user reference numbers', () => {
  const task={masterTemplateId:'m',parameters:{assetByTemplate:{m:{title:'selected-title',background:'scene',character:'person'}}},assets:[ref('old-title','title'),ref('user-style','reference-image'),ref('person','character'),ref('selected-title','title'),ref('user-palette','reference-image'),ref('scene','mother-candidate')]};
  const before=structuredClone(task);
  const selected=communityReferenceAssets(task,'typography','subtitle');
  assert.deepEqual(selected.map(a=>a.name),['user-style','user-palette','person','scene','selected-title']);
  const body=communityTypographyRequest({kind:'subtitle',text:'参与活动',template:{width:900,height:383},images:selected.map(a=>Buffer.from(a.name)),imageRoles:selected.map(a=>a.role)});
  assert.equal(body.images.at(-1).data_base64,Buffer.from('selected-title').toString('base64'));
  assert.match(body.prompt,/输入第 1 张：参考图1/);
  assert.match(body.prompt,/输入第 2 张：参考图2/);
  assert.match(body.prompt,/输入第 5 张：当前主标图层（内部参考，不属于参考图编号）/);
  assert.doesNotMatch(body.prompt,/参考图3/);
  for(const phase of ['master','background','targets'])assert.ok(!communityReferenceAssets(task,phase,'subtitle').some(a=>a.name==='selected-title'));
  assert.ok(!communityReferenceAssets(task,'typography','title').some(a=>a.name==='selected-title'));
  assert.deepEqual(task,before);
});

test('hidden, detached and already-numbered primary titles do not add an obsolete internal reference', () => {
  for(const parameters of [
    {assetByTemplate:{m:{title:null}},assetByRole:{title:'title'}},
    {assetByTemplate:{m:{title:'title'}},layoutByTemplate:{m:{title:{visible:false}}}},
    {},
  ]){
    const task={masterTemplateId:'m',parameters,assets:[ref('style','reference-image'),ref('title','title')]};
    assert.deepEqual(communityReferenceAssets(task,'typography','subtitle').map(a=>a.name),['style']);
  }
  const task={masterTemplateId:'m',parameters:{assetByTemplate:{m:{title:'style'}}},assets:[ref('style','reference-image'),ref('palette','reference-image')]};
  const selected=communityReferenceAssets(task,'typography','subtitle');
  assert.deepEqual(selected.map(a=>a.role),['reference-image','reference-image']);
  assert.equal(selected.length,2);
});

test('paired copy and saved text frames inform requests without changing the designer layout', () => {
  const template={width:900,height:383,communityLayout:{subtitle:[.055,.58,.49,.2]}},layout={x:74,y:300,width:360,height:34,visible:true};
  const before=structuredClone(layout);
  const body=communityTypographyRequest({kind:'subtitle',text:'慧眼识物，有惊喜掉落！',template,layout,companionText:'天工谜影\n谁是百晓生？'});
  assert.match(body.prompt,/副标可用框约 360×34 px/);
  assert.match(body.prompt,/已有手工位置与缩放由工作台保留/);
  assert.match(body.prompt,/禁止将这段文字绘入当前副标题图层/);
  assert.deepEqual(layout,before);
  const fallback=communityTypographyRequest({kind:'subtitle',text:'参与活动',template});
  assert.match(fallback.prompt,/副标可用框约 441×77 px/);
  const invalid=communityTypographyRequest({kind:'subtitle',text:'参与活动',template:{width:900,height:383},layout:{width:NaN,height:-1}});
  assert.doesNotMatch(invalid.prompt,/【可用区域】/);
});

test('new scenes follow character pose and prop support rather than a generic ground plane', () => {
  const body=communityImageRequest({model:'gpt-image-2',prompt:'参考图1的排版、风格和整体色调，人物趴在书本上',template:{width:900,height:383},images:[Buffer.from('reference'),Buffer.from('character')],imageRoles:['reference-image','character']});
  assert.match(body.prompt,/设计师的明确要求、角色姿态与道具的物理空间兼容、被指定用途的参考图/);
  assert.match(body.prompt,/站立、坐姿、趴卧还是悬浮/);
  assert.match(body.prompt,/同一机位、视平线、俯仰角、近远尺度、光源方向和色温/);
  assert.match(body.prompt,/优先安排近景桌面、台面或相应承托面/);
  assert.match(body.prompt,/不要把近景书本和趴卧角色悬贴在远处地板、广场或通道上/);
  assert.match(body.prompt,/不额外重画、复制该道具/);
  assert.match(body.prompt,/标题区域保持简洁、低干扰/);
  assert.match(body.prompt,/只有指定构图、排版或场景时才借鉴相应空间安排/);
  assert.match(body.prompt,/绝不可把人物画进背景/);
  assert.doesNotMatch(body.prompt,/光照方向和地面透视要能容纳角色/);
});
