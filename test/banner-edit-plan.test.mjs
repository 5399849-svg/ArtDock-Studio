import test from 'node:test';
import {shouldGenerateBannerBacking} from '../public/banner-edit-plan.js';
import assert from 'node:assert/strict';
import { BANNER_LAYER_KINDS, planBannerEdit, applyBannerLayoutOperations } from '../public/banner-edit-plan.js';

test('the proposed one-sentence edit touches only character geometry and backing design', () => {
  const plan = planBannerEdit('人物小一点，副标底板做成纸质题签，其余保留');
  assert.deepEqual(plan.operations, [
    { type: 'scale', kind: 'character', factor: .9, anchor: 'center' },
    { type: 'design', kind: 'subtitle-backing', prompt: '副标底板做成纸质题签' },
  ]);
  assert.deepEqual(plan.affectedKinds, ['character', 'subtitle-backing']);
  for (const kind of ['title', 'subtitle', 'background', 'logo']) assert.ok(plan.preserveKinds.includes(kind));
  assert.deepEqual(plan.constraints, ['其余保留']);
  assert.deepEqual(plan.unresolved, []);
  assert.equal(plan.requiresAi, true);
  assert.equal(plan.canApplyLocally, false);
});

test('initial design is an explicit whole-composition request', () => {
  const instruction = '参考图1的排版，搭配提供的人物，设计一张简洁banner';
  const plan = planBannerEdit(instruction, { mode: 'design' });
  assert.deepEqual(plan.operations, [{ type: 'compose', prompt: instruction }]);
  assert.deepEqual(plan.affectedKinds, BANNER_LAYER_KINDS);
  assert.deepEqual(plan.preserveKinds, []);
  assert.equal(plan.requiresAi, true);
  assert.equal(plan.canApplyLocally, false);
});

test('percentage deltas and absolute scale percentages have distinct meanings', () => {
  const examples = [
    ['人物缩小10%', .9], ['人物放大15％', 1.15], ['人物缩小到80%', .8],
    ['人物放大至120%', 1.2], ['人物变为原来的80%', null], ['人物放大1.5倍', 1.5],
    ['人物大一点', 1.1], ['人物小很多', .8],
  ];
  for (const [text, factor] of examples) {
    const plan = planBannerEdit(text);
    if (factor === null) { assert.equal(plan.canApplyLocally, false); continue; }
    assert.equal(plan.operations[0].factor, factor, text);
    assert.equal(plan.canApplyLocally, true, text);
  }
});

test('moves understand canvas percentages, pixels and continuing the same subject', () => {
  const plan = planBannerEdit('人物缩小10%，再右移20像素，然后向上5%');
  assert.deepEqual(plan.operations, [
    { type: 'scale', kind: 'character', factor: .9, anchor: 'center' },
    { type: 'move', kind: 'character', dx: 20, dy: 0, unit: 'px' },
    { type: 'move', kind: 'character', dx: 0, dy: -5, unit: 'percent' },
  ]);
  assert.equal(plan.canApplyLocally, true);
  const defaultMove = planBannerEdit('Logo往左一点');
  assert.deepEqual(defaultMove.operations, [{ type: 'move', kind: 'logo', dx: -2, dy: 0, unit: 'percent' }]);
});

test('multiple subjects share one action but distinct subjects retain their own scope', () => {
  assert.deepEqual(planBannerEdit('主标和副标放大10%').operations.map(operation => operation.kind), ['title', 'subtitle']);
  const plan = planBannerEdit('人物小一点背景更写实');
  assert.deepEqual(plan.operations.map(operation => [operation.type, operation.kind]), [['scale', 'character'], ['design', 'background']]);
  assert.ok(!plan.operations.some(operation => operation.kind === 'background' && operation.type === 'scale'));
  assert.deepEqual(planBannerEdit('第二个人物左移12px').operations, [{ type: 'move', kind: 'character2', dx: -12, dy: 0, unit: 'px' }]);
});

test('a brighter background is a scoped AI design request, not whole-art regeneration', () => {
  const plan = planBannerEdit('背景亮一点，其他内容都保持不变');
  assert.deepEqual(plan.affectedKinds, ['background']);
  assert.deepEqual(plan.operations, [{ type: 'design', kind: 'background', prompt: '背景亮一点' }]);
  assert.ok(plan.preserveKinds.includes('character'));
  assert.deepEqual(plan.unresolved, []);
});

test('the reported title edit and subtitle tilt request preserve the backing and other artwork', () => {
  const plan = planBannerEdit('主标参考图2的颜色和字效做修改，其它保留不变。副标文字要跟着底板的倾斜做调整。');
  assert.deepEqual(plan.operations, [
    { type: 'design', kind: 'title', prompt: '主标参考图2的颜色和字效做修改' },
    { type: 'follow-backing', kind: 'subtitle', target: 'subtitle-backing', followTilt: true, align: 'center' },
  ]);
  assert.deepEqual(plan.affectedKinds, ['title', 'subtitle']);
  assert.deepEqual(plan.constraints, ['其它保留不变']);
  assert.deepEqual(plan.unresolved, []);
  for (const kind of ['background', 'character', 'logo', 'subtitle-backing']) assert.ok(plan.preserveKinds.includes(kind));
  assert.equal(plan.requiresAi, true);
});

test('following an existing backing angle is a local subtitle operation with a bounded scope', () => {
  const operation = { type: 'follow-backing', kind: 'subtitle', target: 'subtitle-backing', followTilt: true, align: 'center' };
  for (const text of [
    '副标文字跟随底板倾斜',
    '请让副标题的文字按照底板的角度旋转',
    '副标文字的倾斜角度与底板保持一致',
    '小标题要顺着承托区域的斜向排版',
  ]) {
    const plan = planBannerEdit(text);
    assert.deepEqual(plan.operations, [operation], text);
    assert.deepEqual(plan.affectedKinds, ['subtitle'], text);
    assert.equal(plan.requiresAi, false, text);
    assert.equal(plan.canApplyLocally, true, text);
    assert.deepEqual(plan.unresolved, [], text);
  }
  const preserved = planBannerEdit('底板不变，副标文字跟随底板倾斜');
  assert.deepEqual(preserved.operations, [operation]);
  assert.deepEqual(preserved.unresolved, []);
  for (const text of ['副标和底板一起倾斜', '副标文字不要跟随底板倾斜', '副标文字跟随底板倾斜并改成蓝色']) {
    assert.ok(!planBannerEdit(text).operations.some(item => item.type === 'follow-backing'), text);
  }
  const missing = planBannerEdit('副标文字跟随底板倾斜', { availableKinds: ['subtitle', 'title'] });
  assert.deepEqual(missing.operations, []);
  assert.deepEqual(missing.unresolved, ['副标文字跟随底板倾斜']);
  const conflict = planBannerEdit('副标不动，副标文字跟随底板倾斜');
  assert.ok(conflict.unresolved.some(text => text.includes('同时要求修改和保留')));
});

test('subtitle tilt alignment awaits actual backing analysis without claiming a geometry change', () => {
  const layouts = {
    subtitle: { x: 40, y: 105, width: 260, height: 30, fontId: 'company-font-id' },
    'subtitle-backing': { x: 20, y: 100, width: 300, height: 40, backing: { assetName: 'paper-label.png' } },
  };
  const plan = planBannerEdit('副标文字跟随底板倾斜');
  const result = applyBannerLayoutOperations(layouts, { width: 500, height: 300 }, plan.operations);
  assert.deepEqual(result.layouts, layouts);
  assert.deepEqual(result.applied, []);
  assert.deepEqual(result.skipped, [{ operation: plan.operations[0], reason: 'requires-backing-analysis' }]);
});

test('negative instructions and glyph constraints do not mutate preserved layers', () => {
  const plan = planBannerEdit('人物不要缩小，主标字形不变，主标改成浅金色，不要添加装饰');
  assert.deepEqual(plan.affectedKinds, ['title']);
  assert.ok(plan.preserveKinds.includes('character'));
  assert.deepEqual(plan.constraints, ['人物不要缩小', '字形不变', '不要添加装饰']);
  assert.deepEqual(plan.unresolved, []);
  assert.ok(!plan.operations.some(operation => operation.type === 'scale'));
});

test('inline attribute constraints preserve the requested geometry or style edit', () => {
  const scale = planBannerEdit('人物小一点但比例不变');
  assert.deepEqual(scale.operations, [{ type: 'scale', kind: 'character', factor: .9, anchor: 'center' }]);
  assert.deepEqual(scale.constraints, ['比例不变']);
  assert.equal(scale.canApplyLocally, true);
  const color = planBannerEdit('主标字形不变但颜色改成浅金色');
  assert.deepEqual(color.affectedKinds, ['title']);
  assert.deepEqual(color.constraints, ['字形不变']);
  assert.equal(color.operations[0].type, 'design');
  const inline = planBannerEdit('人物小一点比例不变');
  assert.equal(inline.operations[0].factor, .9);
  assert.deepEqual(inline.constraints, ['比例不变']);
});

test('explicit contradictory preserve and change requests block local application', () => {
  const plan = planBannerEdit('人物缩小10%，人物不动');
  assert.equal(plan.canApplyLocally, false);
  assert.equal(plan.requiresAi, true);
  assert.ok(plan.unresolved.some(text => text.includes('同时要求修改和保留')));
});

test('unknown layer scope never silently widens to all layers or partially applies', () => {
  for (const text of ['更有设计感一点', '重新设计一下', '那个换一下', '人物缩小10%，让它更高级']) {
    const plan = planBannerEdit(text);
    assert.equal(plan.canApplyLocally, false, text);
    assert.equal(plan.requiresAi, true, text);
    assert.ok(plan.unresolved.length > 0 || plan.operations.some(operation => operation.type === 'design'), text);
    assert.ok(plan.affectedKinds.length < BANNER_LAYER_KINDS.length, text);
    assert.ok(!plan.operations.some(operation => operation.type === 'compose'), text);
  }
});

test('ambiguous copy edits and invalid geometry remain unresolved', () => {
  for (const text of ['副标改成欢迎加入', '主标改成“立即领取”', '人物缩小20像素', '人物缩小100%', '人物放大1000%', '人物右移500%']) {
    const plan = planBannerEdit(text);
    assert.ok(plan.unresolved.length > 0, text);
    assert.equal(plan.canApplyLocally, false, text);
  }
  assert.equal(planBannerEdit('主标改成蓝色').operations[0].type, 'design');
});

test('removing or showing the backing leaves subtitle text untouched', () => {
  for (const text of ['去掉副标底板', '副标底板移除', '不要底板', '不要底板了', '隐藏承托区域']) {
    const plan = planBannerEdit(text);
    assert.deepEqual(plan.operations, [{ type: 'visibility', kind: 'subtitle-backing', visible: false }], text);
    assert.ok(plan.preserveKinds.includes('subtitle'));
  }
  assert.deepEqual(planBannerEdit('恢复副标底板').operations, [{ type: 'visibility', kind: 'subtitle-backing', visible: true }]);
});

test('available layers constrain the plan and empty input never initiates generation', () => {
  const plan = planBannerEdit('副标底板改成纸质题签', { availableKinds: ['background', 'title'] });
  assert.deepEqual(plan.operations, []);
  assert.deepEqual(plan.preserveKinds, ['background', 'title']);
  assert.ok(plan.unresolved.length > 0);
  const empty = planBannerEdit('  \n ');
  assert.equal(empty.requiresAi, false);
  assert.equal(empty.canApplyLocally, false);
  assert.ok(empty.unresolved.length > 0);
});

test('geometry application preserves source, unaffected layers, assets and effects', () => {
  const layouts = {
    character: { x: 600, y: 80, width: 300, height: 350, assetName: 'original-character.png', effects: { shadow: { enabled: true } } },
    background: { x: 0, y: 0, width: 1000, height: 500, assetName: 'approved-scene.png' },
    subtitle: { x: 100, y: 350, width: 300, height: 30, fontId: 'company-font-id' },
  };
  const before = structuredClone(layouts);
  const result = applyBannerLayoutOperations(layouts, { width: 1000, height: 500 }, planBannerEdit('人物缩小20%，再左移25像素').operations);
  assert.deepEqual(layouts, before);
  assert.deepEqual(result.layouts.character, { ...before.character, x: 605, y: 115, width: 240, height: 280 });
  assert.deepEqual(result.layouts.background, before.background);
  assert.deepEqual(result.layouts.subtitle, before.subtitle);
  assert.equal(result.applied.length, 2);
  assert.deepEqual(result.skipped, []);
  result.layouts.character.effects.shadow.enabled = false;
  assert.equal(layouts.character.effects.shadow.enabled, true);
});

test('scaling retains aspect and keeps artwork inside the canvas; percentages use canvas dimensions', () => {
  const layouts = { character: { x: 800, y: 300, width: 200, height: 200 } };
  const result = applyBannerLayoutOperations(layouts, { width: 1000, height: 500 }, [
    { type: 'scale', kind: 'character', factor: 4 },
    { type: 'move', kind: 'character', dx: -10, dy: -10, unit: 'percent' },
  ]);
  assert.deepEqual(result.layouts.character, { x: 400, y: 0, width: 500, height: 500 });
});

test('applying a plan never invents missing layers or runs AI design operations', () => {
  const layouts = { subtitle: { x: 10, y: 20, width: 100, height: 30 } };
  const result = applyBannerLayoutOperations(layouts, { width: 500, height: 300 }, [
    { type: 'visibility', kind: 'subtitle-backing', visible: true },
    { type: 'design', kind: 'subtitle', prompt: '副标换成黑体' },
    { type: 'move', kind: 'not-a-layer', dx: 5, dy: 5, unit: 'px' },
    { type: 'scale', kind: 'subtitle', factor: Infinity },
  ]);
  assert.deepEqual(result.layouts, layouts);
  assert.deepEqual(result.applied, []);
  assert.deepEqual(result.skipped.map(item => item.reason), ['missing-layout', 'requires-design', 'unknown-layer', 'invalid-scale']);
  assert.throws(() => applyBannerLayoutOperations(layouts, { width: 0, height: 500 }, []), /positive canvas/);
});

test('showing an inspector-disabled backing restores its saved paint and hiding preserves style', () => {
  const layouts = {
    'subtitle-backing': { x: 20, y: 100, width: 300, height: 40, visible: true, backing: { enabled: false, assetName: 'paper-label.png', fill: '#fdeabc', opacity: 88, radius: 4 } },
    subtitle: { x: 40, y: 105, width: 260, height: 30 },
  };
  const before = structuredClone(layouts);
  const shown = applyBannerLayoutOperations(layouts, { width: 500, height: 300 }, planBannerEdit('恢复副标底板').operations);
  assert.equal(shown.layouts['subtitle-backing'].visible, true);
  assert.deepEqual(shown.layouts['subtitle-backing'].backing, { ...before['subtitle-backing'].backing, enabled: true });
  assert.deepEqual(shown.layouts.subtitle, before.subtitle);
  assert.deepEqual(layouts, before);
  const hidden = applyBannerLayoutOperations(shown.layouts, { width: 500, height: 300 }, planBannerEdit('隐藏副标底板').operations);
  assert.equal(hidden.layouts['subtitle-backing'].visible, false);
  assert.deepEqual(hidden.layouts['subtitle-backing'].backing, shown.layouts['subtitle-backing'].backing);
});
test('a functional backing follows explicit requests independently from title decoration',()=>{
  assert.equal(shouldGenerateBannerBacking('主标简洁，不要加装饰','副标内容'),true);
  assert.equal(shouldGenerateBannerBacking('副标不要底板','副标内容'),false);
  assert.equal(shouldGenerateBannerBacking('不用副标承托，文字直接排在背景上','副标内容'),false);
  assert.equal(shouldGenerateBannerBacking('背景明亮',''),false);
});
