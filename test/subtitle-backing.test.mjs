import test from 'node:test';
import assert from 'node:assert/strict';
import { createSubtitleBackingLayout, drawSubtitleBacking, normalizeSubtitleBacking } from '../public/subtitle-backing.js';

test('subtitle backing is opt-in and malformed paint cannot leak invalid values', () => {
  assert.equal(normalizeSubtitleBacking().enabled, false);
  assert.equal(normalizeSubtitleBacking(null).enabled, false);
  const paint = normalizeSubtitleBacking({ enabled: true, shape: 'ribbon', fill: 'url(bad)', opacity: Infinity, radius: NaN });
  assert.equal(paint.enabled, true);
  assert.equal(paint.shape, 'round-rect');
  assert.match(paint.fill, /^#[0-9a-f]{6}$/);
  assert.ok(Number.isFinite(paint.opacity) && Number.isFinite(paint.radius));
  assert.equal(normalizeSubtitleBacking({ opacity: -5, radius: -1 }).opacity, 0);
  assert.equal(normalizeSubtitleBacking({ opacity: 150, radius: -1 }).radius, 0);
});

test('explicit add surrounds the subtitle and creates independently editable state', () => {
  const subtitle = { x: 70, y: 180, width: 320, height: 30, visible: true };
  const before = structuredClone(subtitle);
  const first = createSubtitleBackingLayout(subtitle, { width: 500, height: 400 });
  const second = createSubtitleBackingLayout(subtitle, { width: 500, height: 400 });
  assert.deepEqual(subtitle, before);
  assert.equal(first.visible, true);
  assert.equal(first.backing.enabled, true);
  assert.ok(first.x < subtitle.x && first.y < subtitle.y);
  assert.ok(first.x + first.width > subtitle.x + subtitle.width);
  assert.ok(first.y + first.height > subtitle.y + subtitle.height);
  first.x = 10;
  first.backing.fill = '#123456';
  assert.deepEqual(subtitle, before);
  assert.notEqual(second.backing.fill, first.backing.fill);
  assert.notEqual(second.x, first.x);
});

test('add stays inside small canvases even when subtitle or padding are invalid', () => {
  for (const size of [{ width: 12, height: 8 }, { width: .5, height: .25 }, { width: 500, height: 400 }, {}]) {
    const canvasWidth = size.width || 1, canvasHeight = size.height || 1;
    for (const source of [{ x: -200, y: 700, width: 1000, height: 900 }, { x: NaN, y: Infinity, width: -1, height: 0 }, null]) {
      const layout = createSubtitleBackingLayout(source, size, { paddingX: 9999, paddingY: Infinity });
      for (const key of ['x', 'y', 'width', 'height']) assert.ok(Number.isFinite(layout[key]), key);
      assert.ok(layout.x >= 0 && layout.y >= 0);
      assert.ok(layout.width > 0 && layout.height > 0);
      assert.ok(layout.x + layout.width <= canvasWidth);
      assert.ok(layout.y + layout.height <= canvasHeight);
    }
  }
});

function recordingContext() {
  const calls = [], snapshots = [];
  const ctx = { globalAlpha: .5, fillStyle: '#abcdef', shadowColor: '#000000', shadowBlur: 20, shadowOffsetX: 10, shadowOffsetY: 10 };
  const keys = Object.keys(ctx);
  ctx.save = () => snapshots.push(Object.fromEntries(keys.map((key) => [key, ctx[key]])));
  ctx.restore = () => Object.assign(ctx, snapshots.pop());
  for (const method of ['beginPath', 'moveTo', 'lineTo', 'quadraticCurveTo', 'closePath', 'fill', 'fillRect']) {
    ctx[method] = (...args) => calls.push({ method, args, alpha: ctx.globalAlpha, fill: ctx.fillStyle, shadow: ctx.shadowBlur });
  }
  return { ctx, calls };
}

test('drawing is opt-in, respects hidden state and restores canvas paint', () => {
  const { ctx, calls } = recordingContext();
  const rect = { x: 10, y: 20, width: 180, height: 30 };
  assert.equal(drawSubtitleBacking(ctx, rect), false);
  assert.equal(drawSubtitleBacking(ctx, { ...rect, visible: false }, { enabled: true }), false);
  assert.equal(drawSubtitleBacking(ctx, rect, { enabled: true, opacity: 0 }), false);
  assert.equal(calls.length, 0);
  assert.equal(drawSubtitleBacking(ctx, rect, { enabled: true, shape: 'rect', fill: '#fff', opacity: 80 }), true);
  const fill = calls.find((call) => call.method === 'fillRect');
  assert.deepEqual(fill.args, [10, 20, 180, 30]);
  assert.equal(fill.alpha, .4);
  assert.equal(fill.fill, '#ffffff');
  assert.equal(fill.shadow, 0);
  assert.equal(ctx.globalAlpha, .5);
  assert.equal(ctx.fillStyle, '#abcdef');
  assert.equal(ctx.shadowBlur, 20);
});

test('rounded and capsule paths stay within the independent backing bounds', () => {
  const rect = { x: 10, y: 20, width: 18, height: 30 };
  for (const shape of ['round-rect', 'capsule']) {
    const { ctx, calls } = recordingContext();
    assert.equal(drawSubtitleBacking(ctx, rect, { enabled: true, shape, radius: 1000 }), true);
    for (const call of calls.filter((item) => ['moveTo', 'lineTo', 'quadraticCurveTo'].includes(item.method))) {
      for (let index = 0; index < call.args.length; index += 2) {
        assert.ok(call.args[index] >= rect.x && call.args[index] <= rect.x + rect.width);
        assert.ok(call.args[index + 1] >= rect.y && call.args[index + 1] <= rect.y + rect.height);
      }
    }
    assert.equal(calls.filter((call) => call.method === 'fill').length, 1);
    assert.equal(calls.filter((call) => call.method === 'fillRect').length, 0);
  }
});
