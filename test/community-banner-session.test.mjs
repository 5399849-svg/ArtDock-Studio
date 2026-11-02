import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {
  bannerSourceToken, bannerMasterSnapshot, validateBannerDesignInput,
  commitBannerDesign, restoreBannerVersion,
} from '../lib/community-banner-session.mjs';
import { runBannerDesign } from '../lib/community-banner-design.mjs';
import { communityImageModels } from '../lib/community-ai-generation.mjs';

const template = { id: 'master', width: 1000, height: 500 };
const fonts = {
  fonts: [
    { id: 'font-title', name: '字魂主标', sha256: 'a'.repeat(64) },
    { id: 'font-subtitle', name: '字小魂黑体', sha256: 'b'.repeat(64) },
  ],
};
const created = '2026-10-15T00:00:00.000Z';
const committed = '2026-10-15T00:01:00.000Z';

function fixture() {
  return {
    id: 'task-test', masterTemplateId: 'master', copy: '天工谜影\n谁是百晓生？', updatedAt: created,
    assets: ['scene.png', 'character.png', 'title.png', 'subtitle.png', 'logo.png', 'backing.png', 'target.png'].map(name => ({ name, mime: 'image/png', role: name === 'backing.png' ? 'subtitle-backing' : 'fixture' })),
    communityMasterApproval: { fingerprint: 'approved-original' },
    parameters: {
      subtitleText: '慧眼识物，有惊喜掉落！', titleFontId: 'font-title', subtitleFontId: 'font-subtitle',
      communityDesignDraft: '', tone: 'keep-existing',
      layoutByTemplate: {
        master: {
          background: { x: 0, y: 0, width: 1000, height: 500 },
          character: { x: 650, y: 80, width: 300, height: 350, assetName: 'character.png' },
          title: { x: 50, y: 100, width: 550, height: 200, effects: { stroke: { color: '#35455b', enabled: true } } },
          subtitle: { x: 100, y: 330, width: 420, height: 35 },
          logo: { x: 30, y: 20, width: 100, height: 70 },
          'subtitle-backing': { x: 80, y: 323, width: 460, height: 50, backing: { enabled: true, assetName: 'backing.png' } },
        },
        target: { character: { x: 450, y: 100, width: 250, height: 300 } },
      },
      assetByTemplate: {
        master: { background: 'scene.png', character: 'character.png', title: 'title.png', subtitle: 'subtitle.png', logo: 'logo.png', foreground: null },
        target: { background: 'target.png', title: 'title.png' },
      },
      backgroundByTemplate: { master: { focalX: 40, focalY: 60, scale: 110, url: '/old-outpaint.png' }, target: { url: '/target.png' } },
    },
  };
}
function input(task, prompt = '人物缩小10%，其余保留', extra = {}) {
  return { mode: 'edit', prompt, expectedUpdatedAt: task.updatedAt, layouts: structuredClone(task.parameters.layoutByTemplate.master), ...extra };
}
function runFor(task, prompt, extra = {}) {
  return { ...validateBannerDesignInput(task, input(task, prompt, extra), template, fonts), runId: 'run-test', masterAssets: {} };
}

test('pure geometry requires no font library, font choice, model credentials or AI work', () => {
  const task = fixture(), before = structuredClone(task);
  const run = validateBannerDesignInput(task, input(task), template);
  assert.deepEqual(run.aiKinds, []);
  assert.equal(run.titleFont, undefined);
  assert.equal(run.subtitleFont, undefined);
  assert.equal(run.layouts.character.width, 270);
  assert.deepEqual(run.layouts.title, before.parameters.layoutByTemplate.master.title);
  assert.deepEqual(task, before);
});

test('unresolved edits cannot save the successfully parsed part of a request', () => {
  const task = fixture(), before = structuredClone(task);
  assert.throws(() => validateBannerDesignInput(task, input(task, '人物缩小10%，副标改成欢迎加入'), template), error => error.status === 422 && error.message.includes('还不能明确执行'));
  assert.deepEqual(task, before);
  assert.throws(() => validateBannerDesignInput(task, input(task, '人物缩小10%，人物不动'), template), /还不能明确执行/);
  assert.deepEqual(task, before);
});

test('missing local geometry is rejected while AI design skips are accepted correctly', () => {
  const task = fixture();
  const missing = input(task, '第二个人物左移10像素');
  assert.throws(() => validateBannerDesignInput(task, missing, template), /部分图层没有可修改的位置/);
  const design = validateBannerDesignInput(task, input(task, '背景亮一点'), template);
  assert.deepEqual(design.aiKinds, ['background']);
  assert.deepEqual(design.layouts, task.parameters.layoutByTemplate.master);
});

test('title design and full design require actual company fonts, local movement does not', () => {
  const task = fixture();
  assert.throws(() => validateBannerDesignInput(task, input(task, '主标改成金色'), template, fonts), /选择主标字体/);
  const title = validateBannerDesignInput(task, input(task, '主标改成金色', { titleFontId: 'font-title' }), template, fonts);
  assert.deepEqual(title.aiKinds, ['title']);
  assert.equal(title.titleFont.id, 'font-title');
  assert.throws(() => validateBannerDesignInput(task, input(task, '完整设计', { mode: 'design', titleFontId: 'font-title' }), template, fonts), /副标缺少可用的公司字体/);
  const design = validateBannerDesignInput(task, input(task, '完整设计', { mode: 'design', titleFontId: 'font-title', subtitleFontId: 'font-subtitle' }), template, fonts);
  assert.deepEqual(design.aiKinds, ['background', 'title', 'subtitle-backing']);
  assert.equal(design.subtitleFont.id, 'font-subtitle');
});

test('backing generation requires subtitle text and its own placement before paid work', () => {
  const task = fixture(), noBox = input(task, '副标底板改成纸质题签');
  delete noBox.layouts['subtitle-backing'];
  assert.throws(() => validateBannerDesignInput(task, noBox, template), /缺少独立图层布局/);
  task.parameters.subtitleText = '';
  assert.throws(() => validateBannerDesignInput(task, input(task, '副标底板改成纸质题签'), template), /填写副标文字/);
});

test('commit changes requested geometry atomically and preserves every unrelated binding, font and target', () => {
  const task = fixture(), before = structuredClone(task), run = runFor(task, '人物缩小10%，再左移10像素，其余保留');
  commitBannerDesign(task, { run, assets: [], bindings: {}, now: committed });
  assert.deepEqual(task.parameters.assetByTemplate, before.parameters.assetByTemplate);
  assert.deepEqual(task.parameters.backgroundByTemplate, before.parameters.backgroundByTemplate);
  assert.deepEqual(task.assets, before.assets);
  for (const key of ['titleFontId', 'subtitleFontId', 'tone']) assert.equal(task.parameters[key], before.parameters[key]);
  for (const kind of ['background', 'title', 'subtitle', 'logo', 'subtitle-backing']) assert.deepEqual(task.parameters.layoutByTemplate.master[kind], before.parameters.layoutByTemplate.master[kind]);
  assert.deepEqual(task.parameters.layoutByTemplate.target, before.parameters.layoutByTemplate.target);
  assert.equal(task.parameters.layoutByTemplate.master.character.width, 270);
  assert.equal(task.parameters.layoutByTemplate.master.character.x, 655);
  assert.equal(task.communityMasterApproval, null);
  assert.equal(task.updatedAt, committed);
  assert.equal(task.communityDesign.versions.length, 2);
});

test('source token tolerates drafting and progress updates but detects art, copy and font changes', () => {
  const task = fixture(), token = bannerSourceToken(task);
  task.parameters.communityDesignDraft = '下一次改成暖色';
  task.updatedAt = committed;
  task.communityGeneration = { status: 'running', stage: 'background' };
  assert.equal(bannerSourceToken(task), token);
  for (const change of [
    value => { value.copy = '其他主标'; },
    value => { value.parameters.subtitleText = '其他副标'; },
    value => { value.parameters.titleFontId = 'other-font'; },
    value => { value.parameters.layoutByTemplate.master.character.x += 1; },
    value => { value.parameters.assetByTemplate.master.title = 'other-title.png'; },
    value => { value.parameters.backgroundByTemplate.master.url = '/new.png'; },
    value => { value.assets.push({ name: 'new-art.png' }); },
  ]) {
    const altered = structuredClone(task); change(altered);
    assert.notEqual(bannerSourceToken(altered), token);
  }
});

test('stale source fails before any commit mutation; changed prompt draft does not block completion', () => {
  const task = fixture(), run = runFor(task, '人物小一点');
  task.parameters.layoutByTemplate.master.title.x += 10;
  const changed = structuredClone(task);
  assert.throws(() => commitBannerDesign(task, { run, assets: [{ name: 'generated.png' }], bindings: { title: 'generated.png' } }), error => error.status === 409);
  assert.deepEqual(task, changed);
  const fresh = fixture(), prepared = runFor(fresh, '人物小一点');
  fresh.parameters.communityDesignDraft = '另外一个草稿'; fresh.updatedAt = committed;
  assert.doesNotThrow(() => commitBannerDesign(fresh, { run: prepared, assets: [], bindings: {}, now: committed }));
});

test('design commit binds new generated layers while retaining original character and Logo', () => {
  const task = fixture(), original = structuredClone(task);
  const run = runFor(task, '完整设计', { mode: 'design', titleFontId: 'font-title', subtitleFontId: 'font-subtitle' });
  run.masterAssets = structuredClone(task.parameters.assetByTemplate.master);
  run.layouts['subtitle-backing'].backing = { enabled: true, assetName: 'new-backing.png' };
  commitBannerDesign(task, {
    run, now: committed,
    assets: [{ name: 'new-scene.png' }, { name: 'new-title.png' }, { name: 'new-backing.png', role: 'subtitle-backing' }],
    bindings: { background: 'new-scene.png', title: 'new-title.png' },
  });
  assert.equal(task.parameters.assetByTemplate.master.background, 'new-scene.png');
  assert.equal(task.parameters.assetByTemplate.master.title, 'new-title.png');
  assert.equal(task.parameters.assetByTemplate.master.subtitle, null);
  assert.equal(task.parameters.assetByTemplate.master.character, 'character.png');
  assert.equal(task.parameters.assetByTemplate.master.logo, 'logo.png');
  assert.deepEqual(task.parameters.layoutByTemplate.master.character, original.parameters.layoutByTemplate.master.character);
  assert.deepEqual(task.parameters.backgroundByTemplate.master, { focalX: 50, focalY: 50, scale: 100, smartExpand: false, url: '' });
  assert.equal(task.communityDesign.currentVersionId, run.runId);
});

test('restoring a saved version restores exact copy, layouts, bindings, background and fonts', () => {
  const task = fixture(), before = bannerMasterSnapshot(task), run = runFor(task, '人物小一点');
  commitBannerDesign(task, { run, assets: [], bindings: {}, now: committed });
  task.copy = 'later-title'; task.parameters.subtitleText = 'later-subtitle';
  task.parameters.titleFontId = 'changed-font'; task.parameters.titleFontAsset = 'legacy-font.ttf';
  const restoredAt = '2026-10-15T00:02:00.000Z';
  restoreBannerVersion(task, `before-${run.runId}`, restoredAt);
  assert.deepEqual(bannerMasterSnapshot(task), before);
  assert.equal(task.parameters.titleFontAsset, undefined);
  assert.equal(task.communityMasterApproval, null);
  assert.equal(task.communityDesign.currentVersionId, `before-${run.runId}`);
  assert.equal(task.updatedAt, restoredAt);
});

test('restore verifies all original assets, including backing, before changing the current mother', () => {
  for (const name of ['character.png', 'backing.png']) {
    const task = fixture(), run = runFor(task, '人物小一点');
    commitBannerDesign(task, { run, assets: [], bindings: {}, now: committed });
    task.assets = task.assets.filter(asset => asset.name !== name);
    const before = structuredClone(task);
    assert.throws(() => restoreBannerVersion(task, `before-${run.runId}`), /原素材已移除|底板素材已移除/);
    assert.deepEqual(task, before);
  }
});

test('a later AI stage failure exposes no partial layers to the commit boundary', async () => {
  const task = fixture(), before = structuredClone(task), run = runFor(task, '背景亮一点，副标底板改成纸质题签');
  const image = await sharp({ create: { width: 100, height: 50, channels: 4, background: '#ddb98c' } }).png().toBuffer();
  let commits = 0;
  const stages = [];
  await assert.rejects(async () => {
    const result = await runBannerDesign({
      mode: 'edit', prompt: run.prompt, template, model: communityImageModels.banana,
      affectedKinds: run.aiKinds,
      inputs: { current: image, copy: task.copy, subtitle: task.parameters.subtitleText, layouts: run.layouts },
      generate: async (_body, { stage }) => {
        stages.push(stage);
        if (stage === 'subtitle-backing') throw new Error('simulated provider interruption');
        return image;
      },
    });
    commits += 1;
    commitBannerDesign(task, { run, assets: result.layers, bindings: {} });
  }, /simulated provider interruption/);
  assert.deepEqual([...stages].sort(), ['background', 'subtitle-backing']);
  assert.equal(commits, 0);
  assert.deepEqual(task, before);
});
