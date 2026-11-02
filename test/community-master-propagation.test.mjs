import test from 'node:test';
import assert from 'node:assert/strict';
import { assertCommunityMasterReady, validateCommunityMasterSelections, propagateCommunityMaster, communityMasterLayerKinds, communityNativeLayerKinds } from '../lib/community-master-propagation.mjs';
import { remapCommunityLayer } from '../public/community-auto-layout.js';
import { communityPlacements, communityTemplate } from '../lib/community-placements.mjs';

const fingerprint = 'approved-master-v2';
const asset = (name, role, extra = {}) => ({ name, role, mime: 'image/png', url: `/storage/task/assets/${name}`, ...extra });
const makeTemplate = suffix => communityTemplate(communityPlacements.find(item => item.id === `community-${suffix}`));
const master = makeTemplate('official-cover');
const wide = makeTemplate('community-one');
const square = makeTemplate('wechat-mini-cover');
const portrait = makeTemplate('xiaohongshu-cover');
const hero = makeTemplate('community-hero-library');
const small = makeTemplate('community-five');
const layout = (extra = {}) => ({ x: 20, y: 30, width: 220, height: 110, visible: true, ...extra });

function fixture(templates = [master, wide, square, portrait]) {
  const masterAssets = {
    background: 'new-master.png', character: 'new-character.png', character2: 'new-character-2.png',
    foreground: 'new-foreground.png', title: 'new-title.png', subtitle: 'new-subtitle.png',
    logo: 'new-logo.png', 'ip-copyright': 'new-copyright.png',
  };
  const targetLayouts = Object.fromEntries(templates.filter(t => t.id !== master.id).map(t => [t.id,
    Object.fromEntries(communityMasterLayerKinds.map(kind => [kind, layout({ flipX: kind === 'character', effects: { stroke: { color: '#815633', width: 2 } } })])),
  ]));
  const task = {
    id: 'task', masterTemplateId: master.id, communityMasterApproval: { fingerprint, at: '2026-10-14T00:00:00.000Z' },
    communityGeneration: { phase: 'master', status: 'done' },
    assets: Object.entries(masterAssets).map(([role, name]) => asset(name, role === 'background' ? 'mother-candidate' : role)),
    parameters: {
      subtitleText: '辅助说明', assetByRole: { title: 'old-title.png' },
      assetByTemplate: Object.fromEntries(templates.map(t => [t.id, t.id === master.id ? structuredClone(masterAssets) : {
        background: 'old-background.png', title: 'old-title.png', subtitle: 'old-subtitle.png', character: 'old-character.png',
        logo: 'old-logo.png', 'ip-copyright': 'old-copyright.png',
      }])),
      layoutByTemplate: Object.fromEntries(templates.map(t => [t.id, Object.fromEntries(communityMasterLayerKinds.map(kind => [kind, layout()]))])),
      backgroundByTemplate: Object.fromEntries(templates.map(t => [t.id, t.id === master.id ? {
        focalX: 61, focalY: 44, scale: 112, smartExpand: false, url: '',
      } : {
        focalX: 75, focalY: 30, scale: 120, smartExpand: true, url: '/storage/task/outpaint/obsolete.png',
        pipelineVersion: 2, sourceAssetName: 'old-background.png', modelUsed: 'banana_pro', originalPlacement: { scale: 90 },
      }])),
      communityAutoLayoutAt: '2026-10-13T00:00:00.000Z', communityAutoLayoutMasterFingerprint: 'old-master',
    },
  };
  return { task, options: { templates, masterAssets, targetLayouts, backgroundName: 'approved-background-snapshot.png', masterFingerprint: fingerprint, isIpProject: true, now: '2026-10-14T01:00:00.000Z' } };
}

test('reflow replaces explicit old target assets with the approved master layers and background snapshot', () => {
  const { task, options } = fixture();
  const result = propagateCommunityMaster(task, options);
  for (const template of options.templates.filter(t => t.id !== master.id)) {
    for (const kind of communityMasterLayerKinds) assert.equal(result.assetByTemplate[template.id][kind], options.masterAssets[kind]);
    assert.equal(result.assetByTemplate[template.id].background, options.backgroundName);
    assert.deepEqual(result.layoutByTemplate[template.id].character, options.targetLayouts[template.id].character);
  }
  assert.equal(result.communityAutoLayoutAt, options.now);
  assert.equal(result.communityAutoLayoutMasterFingerprint, fingerprint);
});

test('a completed artwork trial from this exact master survives confirmation and bulk reflow with its manual geometry',()=>{
  const {task,options}=fixture([master,portrait]),p=task.parameters;
  task.assets.push(asset('portrait-trial.png','generated-background',{sourceTemplateId:portrait.id,sourceBackgroundName:'new-master.png'}));
  p.communityArtworkByTemplate={[master.id]:{assetName:'new-master.png'},[portrait.id]:{assetName:'portrait-trial.png',sourceArtworkName:'new-master.png'}};
  p.assetByTemplate[portrait.id].background='portrait-trial.png';
  p.backgroundByTemplate[portrait.id]={focalX:52,focalY:48,scale:104,url:''};
  const geometry=structuredClone(p.layoutByTemplate[portrait.id]),background=structuredClone(p.backgroundByTemplate[portrait.id]);
  const result=propagateCommunityMaster(task,options);
  assert.equal(result.assetByTemplate[portrait.id].background,'portrait-trial.png');assert.deepEqual(result.layoutByTemplate[portrait.id],geometry);assert.deepEqual(result.backgroundByTemplate[portrait.id],background);
  assert.equal(result.assetByTemplate[portrait.id].logo,'new-logo.png');assert.equal(result.communityAutoLayoutMasterFingerprint,fingerprint);
});

test('a trial from an old artwork is withdrawn when the master artwork changes',()=>{
  const {task,options}=fixture([master,portrait]),p=task.parameters;
  task.assets.push(asset('old-night-trial.png','generated-background',{sourceTemplateId:portrait.id,sourceBackgroundName:'old-night.png'}));
  p.communityArtworkByTemplate={[master.id]:{assetName:'new-master.png'},[portrait.id]:{assetName:'old-night-trial.png',sourceArtworkName:'old-night.png'}};
  p.assetByTemplate[portrait.id].background='old-night-trial.png';
  const result=propagateCommunityMaster(task,options);assert.equal(result.assetByTemplate[portrait.id].background,options.backgroundName);
});

test('an artwork master with targets that have no generated artwork yet can still be propagated',()=>{
  const {task,options}=fixture();task.parameters.communityArtworkByTemplate={[master.id]:{assetName:'new-master.png'}};
  const result=propagateCommunityMaster(task,options);
  for(const template of options.templates.filter(t=>t.id!==master.id))assert.equal(result.assetByTemplate[template.id].background,options.backgroundName);
});

test('reflow clears obsolete outpaint URLs and registration so an old generated image cannot override the master', () => {
  const { task, options } = fixture();
  const result = propagateCommunityMaster(task, options);
  for (const template of options.templates.filter(t => t.id !== master.id)) {
    assert.deepEqual(result.backgroundByTemplate[template.id], { focalX: 50, focalY: 50, scale: 100, smartExpand: false, url: '' });
    assert.equal(result.backgroundByTemplate[template.id].sourceAssetName, undefined);
    assert.equal(result.backgroundByTemplate[template.id].originalPlacement, undefined);
  }
});

test('reflow preserves a target extension from this master version and this exact target', () => {
  const { task, options } = fixture();
  task.assets.push(asset('current-extension.png', 'generated-background', { sourceMasterFingerprint: fingerprint, sourceTemplateId: wide.id }));
  task.parameters.assetByTemplate[wide.id].background = 'current-extension.png';
  const result = propagateCommunityMaster(task, options);
  assert.equal(result.assetByTemplate[wide.id].background, 'current-extension.png');
  assert.deepEqual(result.backgroundByTemplate[wide.id], { focalX: 75, focalY: 30, scale: 120, smartExpand: false, url: '' });
  assert.equal(result.assetByTemplate[wide.id].character, 'new-character.png');
});

test('extensions from an older master or another target are withdrawn without deleting the original assets', () => {
  const { task, options } = fixture();
  task.assets.push(asset('old-extension.png', 'generated-background', { sourceMasterFingerprint: 'old-master', sourceTemplateId: wide.id }));
  task.assets.push(asset('wrong-target-extension.png', 'generated-background', { sourceMasterFingerprint: fingerprint, sourceTemplateId: portrait.id }));
  task.parameters.assetByTemplate[wide.id].background = 'old-extension.png';
  task.parameters.assetByTemplate[square.id].background = 'wrong-target-extension.png';
  const beforeAssets = structuredClone(task.assets);
  const result = propagateCommunityMaster(task, options);
  assert.equal(result.assetByTemplate[wide.id].background, options.backgroundName);
  assert.equal(result.assetByTemplate[square.id].background, options.backgroundName);
  assert.deepEqual(task.assets, beforeAssets);
});

test('reflow does not change the master selection, manual geometry, or background framing', () => {
  const { task, options } = fixture();
  task.parameters.layoutByTemplate[master.id].character = layout({ x: 413, y: 8, width: 351, height: 351, flipX: true, visible: false, effects: { shadow: { enabled: true } } });
  const before = structuredClone(task);
  const result = propagateCommunityMaster(task, options);
  assert.deepEqual(result.assetByTemplate[master.id], before.parameters.assetByTemplate[master.id]);
  assert.deepEqual(result.layoutByTemplate[master.id], before.parameters.layoutByTemplate[master.id]);
  assert.deepEqual(result.backgroundByTemplate[master.id], before.parameters.backgroundByTemplate[master.id]);
  assert.deepEqual(task, before);
  result.layoutByTemplate[wide.id].character.effects.stroke.color = '#000000';
  assert.equal(options.targetLayouts[wide.id].character.effects.stroke.color, '#815633');
});

test('master explicit null copy selections overwrite stale bitmap bindings while native copy stays available', () => {
  const { task, options } = fixture();
  task.parameters.assetByTemplate[master.id].title = options.masterAssets.title = null;
  task.parameters.assetByTemplate[master.id].subtitle = options.masterAssets.subtitle = null;
  const validated = validateCommunityMasterSelections(task, options.masterAssets);
  assert.equal(validated.title, null);
  assert.equal(validated.subtitle, null);
  const result = propagateCommunityMaster(task, { ...options, masterAssets: validated });
  assert.equal(result.assetByTemplate[wide.id].title, null);
  assert.equal(result.assetByTemplate[wide.id].subtitle, null);
  assert.equal(result.layoutByTemplate[wide.id].title.visible, true);
  assert.equal(result.layoutByTemplate[wide.id].subtitle.visible, true);
});

test('an explicitly added subtitle backing propagates as an independent native shape without an asset', () => {
  const {task,options}=fixture();
  const backing={enabled:true,shape:'capsule',fill:'#f0d5b0',opacity:82,radius:14};
  const source=task.parameters.layoutByTemplate[master.id]['subtitle-backing']=layout({x:70,y:210,width:350,height:54,backing});
  for(const template of options.templates.filter(t=>t.id!==master.id)) {
    options.targetLayouts[template.id]['subtitle-backing']=layout({x:44,y:90,width:260,height:48,backing:{...backing,fill:'#000000'}});
    task.parameters.assetByTemplate[template.id]['subtitle-backing']='obsolete-shape.png';
  }
  const before=structuredClone(task);
  const result=propagateCommunityMaster(task,options);
  assert.deepEqual(communityNativeLayerKinds,['subtitle-backing']);
  assert.equal(communityMasterLayerKinds.includes('subtitle-backing'),false);
  assert.equal(Object.hasOwn(validateCommunityMasterSelections(task,options.masterAssets),'subtitle-backing'),false);
  for(const template of options.templates.filter(t=>t.id!==master.id)) {
    const actual=result.layoutByTemplate[template.id]['subtitle-backing'];
    assert.deepEqual(actual,{...source,x:44,y:90,width:260,height:48});
    assert.equal(Object.hasOwn(result.assetByTemplate[template.id],'subtitle-backing'),false);
  }
  assert.deepEqual(task,before);
  result.layoutByTemplate[wide.id]['subtitle-backing'].backing.fill='#ffffff';
  assert.equal(result.layoutByTemplate[square.id]['subtitle-backing'].backing.fill,backing.fill);
  assert.equal(task.parameters.layoutByTemplate[master.id]['subtitle-backing'].backing.fill,backing.fill);
});

test('hidden subtitle backing stays hidden on every target even when a client sends an old visible layout', () => {
  const {task,options}=fixture();
  task.parameters.layoutByTemplate[master.id]['subtitle-backing']=layout({visible:false,backing:{enabled:true,shape:'rect',fill:'#fff1d8',opacity:76,radius:0}});
  for(const template of options.templates.filter(t=>t.id!==master.id))options.targetLayouts[template.id]['subtitle-backing']=layout();
  const result=propagateCommunityMaster(task,options);
  for(const template of options.templates.filter(t=>t.id!==master.id))assert.equal(result.layoutByTemplate[template.id]['subtitle-backing'].visible,false);
});

test('removed and disabled master backings clear stale target shape layouts and bindings', () => {
  for(const disabled of [false,true]) {
    const {task,options}=fixture();
    if(disabled)task.parameters.layoutByTemplate[master.id]['subtitle-backing']=layout({backing:{enabled:false}});
    for(const template of options.templates.filter(t=>t.id!==master.id)) {
      task.parameters.layoutByTemplate[template.id]['subtitle-backing']=layout({backing:{enabled:true}});
      task.parameters.assetByTemplate[template.id]['subtitle-backing']='old.png';
      options.targetLayouts[template.id]['subtitle-backing']=layout({backing:{enabled:true}});
    }
    const result=propagateCommunityMaster(task,options);
    for(const template of options.templates.filter(t=>t.id!==master.id)) {
      assert.equal(Object.hasOwn(result.layoutByTemplate[template.id],'subtitle-backing'),false);
      assert.equal(Object.hasOwn(result.assetByTemplate[template.id],'subtitle-backing'),false);
    }
  }
});

test('reflow does not add subtitle backing layers to existing work that never had one', () => {
  const {task,options}=fixture();
  const result=propagateCommunityMaster(task,options);
  for(const template of options.templates) {
    assert.equal(Object.hasOwn(result.layoutByTemplate[template.id],'subtitle-backing'),false);
    assert.equal(Object.hasOwn(result.assetByTemplate[template.id],'subtitle-backing'),false);
  }
});

test('explicit subtitle backing requires valid remapped geometry and fails without changing the task', () => {
  for(const invalid of [undefined,null,[],layout({x:NaN}),layout({height:0}),layout({width:'120'})]) {
    const {task,options}=fixture();
    task.parameters.layoutByTemplate[master.id]['subtitle-backing']=layout({backing:{enabled:true}});
    options.targetLayouts[wide.id]['subtitle-backing']=invalid;
    const before=structuredClone(task);
    assert.throws(()=>propagateCommunityMaster(task,options),error=>error.status===422 && /承托布局/.test(error.message));
    assert.deepEqual(task,before);
  }
});

test('hidden master layers stay hidden and an absent second character does not resurrect old target characters', () => {
  const { task, options } = fixture();
  task.parameters.layoutByTemplate[master.id].character.visible = false;
  task.parameters.assetByTemplate[master.id].character2 = options.masterAssets.character2 = null;
  const result = propagateCommunityMaster(task, options);
  assert.equal(result.layoutByTemplate[wide.id].character.visible, false);
  assert.equal(result.assetByTemplate[wide.id].character2, null);
  assert.equal(result.layoutByTemplate[wide.id].character2.visible, false);
  assert.equal(result.layoutByTemplate[wide.id].character.flipX, true);
  assert.deepEqual(result.layoutByTemplate[wide.id].character.effects, options.targetLayouts[wide.id].character.effects);
});

test('each placement still enforces its own Logo and IP copyright requirements', () => {
  const { task, options } = fixture([master, hero, small, square]);
  const result = propagateCommunityMaster(task, options);
  assert.equal(result.assetByTemplate[hero.id].logo, null);
  assert.equal(result.layoutByTemplate[hero.id].logo, undefined);
  assert.equal(result.assetByTemplate[hero.id]['ip-copyright'], 'new-copyright.png');
  assert.equal(result.assetByTemplate[small.id].logo, null);
  assert.equal(result.assetByTemplate[small.id]['ip-copyright'], null);
  assert.equal(result.layoutByTemplate[small.id]['ip-copyright'], undefined);
  assert.equal(result.assetByTemplate[square.id].logo, 'new-logo.png');
  const nonIp = propagateCommunityMaster(task, { ...options, isIpProject: false });
  assert.equal(nonIp.assetByTemplate[hero.id]['ip-copyright'], null);
  assert.equal(nonIp.layoutByTemplate[hero.id]['ip-copyright'], undefined);
});

test('reflow leaves unrelated non-community templates intact', () => {
  const other = { id: 'unrelated', width: 1920, height: 550, communityPlacement: false };
  const { task, options } = fixture([master, wide, other]);
  delete options.targetLayouts[other.id];
  const result = propagateCommunityMaster(task, options);
  assert.deepEqual(result.assetByTemplate[other.id], task.parameters.assetByTemplate[other.id]);
  assert.deepEqual(result.layoutByTemplate[other.id], task.parameters.layoutByTemplate[other.id]);
  assert.deepEqual(result.backgroundByTemplate[other.id], task.parameters.backgroundByTemplate[other.id]);
});

test('unconfirmed and stale master fingerprints cannot authorize reflow', () => {
  const { task } = fixture();
  assert.doesNotThrow(() => assertCommunityMasterReady(task, fingerprint, fingerprint));
  for (const [approval, expected, current] of [[null, fingerprint, fingerprint], [{ fingerprint: 'old-master' }, fingerprint, fingerprint], [task.communityMasterApproval, fingerprint, 'changed-master'], [task.communityMasterApproval, '', fingerprint]]) {
    assert.throws(() => assertCommunityMasterReady({ ...task, communityMasterApproval: approval }, expected, current), error => error.status === 409);
  }
});

test('master confirmation and reflow wait for all pending layer generation and outpaint jobs', () => {
  const { task } = fixture();
  for (const phase of ['master', 'background', 'typography', 'targets']) {
    assert.throws(() => assertCommunityMasterReady({ ...task, communityGeneration: { phase, status: 'running' } }, fingerprint, fingerprint), error => error.status === 409 && /生成尚未结束/.test(error.message));
  }
  assert.throws(() => assertCommunityMasterReady({ ...task, outpaint: { status: 'running' } }, fingerprint, fingerprint), error => error.status === 409);
  assert.doesNotThrow(() => assertCommunityMasterReady({ ...task, outpaint: { status: 'completed' } }, fingerprint, fingerprint));
});

test('asset selections are checked against current explicit master bindings instead of stale client state', () => {
  const { task, options } = fixture();
  assert.deepEqual(validateCommunityMasterSelections(task, options.masterAssets), options.masterAssets);
  const before = structuredClone(task);
  assert.throws(() => validateCommunityMasterSelections(task, { ...options.masterAssets, background: 'old-background.png' }), error => error.status === 409);
  assert.throws(() => validateCommunityMasterSelections(task, { ...options.masterAssets, character: null }), error => error.status === 409);
  assert.deepEqual(task, before);
});

test('missing and undecodable Photoshop selections cannot become independent canvas layers', () => {
  const { task, options } = fixture();
  delete task.parameters.assetByTemplate[master.id].foreground;
  assert.throws(() => validateCommunityMasterSelections(task, { ...options.masterAssets, foreground: 'missing.png' }), error => error.status === 422);
  task.assets.push({ name: 'source.psb', role: 'foreground', mime: 'image/vnd.adobe.photoshop', url: '/storage/task/assets/source.psb' });
  assert.throws(() => validateCommunityMasterSelections(task, { ...options.masterAssets, foreground: 'source.psb' }), error => error.status === 422);
});

test('a malformed target layout fails atomically without partially changing task parameters', () => {
  for (const invalid of [null, [], { title: { x: NaN, y: 1, width: 100, height: 50 } }, { character: { x: 1, y: 2, width: 0, height: 50 } }, { title: { x: 1, y: 2, width: 100, height: Infinity } }, { subtitle: { x: '1', y: 2, width: 100, height: 50 } }]) {
    const { task, options } = fixture();
    options.targetLayouts[square.id] = invalid;
    const before = structuredClone(task);
    assert.throws(() => propagateCommunityMaster(task, options), error => error.status === 422);
    assert.deepEqual(task, before);
  }
});

for (const target of [wide, small, square, portrait]) {
  test(`character remapping preserves aspect, flip, visibility and effects within ${target.width}x${target.height}`, () => {
    const sourceDefault = { x: 420, y: 10, width: 360, height: 360, visible: true };
    const [x, y, width, height] = target.communityLayout.character;
    const targetDefault = { x: x * target.width, y: y * target.height, width: width * target.width, height: height * target.height, visible: true };
    const sourceLayout = { x: 890, y: 300, width: 428, height: 520, visible: false, flipX: true, effects: { stroke: { enabled: true, color: '#795841' } } };
    const before = structuredClone(sourceLayout);
    const result = remapCommunityLayer(master, target, sourceDefault, targetDefault, sourceLayout, { preserveAspect: true });
    assert.ok(Math.abs(result.width - result.height * (sourceLayout.width / sourceLayout.height)) <= 1, '人物比例应仅存在整数像素舍入误差');
    assert.ok(result.x >= 0 && result.x + result.width <= target.width);
    assert.ok(result.y >= 0 && result.y + result.height <= target.height);
    assert.equal(result.flipX, true);
    assert.equal(result.visible, false);
    assert.deepEqual(result.effects, sourceLayout.effects);
    assert.deepEqual(sourceLayout, before);
  });
}
