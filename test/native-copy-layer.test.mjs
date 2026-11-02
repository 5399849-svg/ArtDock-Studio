import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultNativeCopyEffects, drawNativeCopy, measureNativeCopy } from '../public/native-copy-layer.js';

function context(canvas = {}) {
  const calls = [], stack = [];
  const ctx = {
    canvas, font: '10px sans-serif', textBaseline: 'alphabetic', textAlign: 'center',
    fillStyle: '#abcdef', strokeStyle: '#fedcba', lineJoin: 'miter', lineWidth: 1,
    globalAlpha: 1, shadowColor: 'transparent', shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0,
  };
  const keys = Object.keys(ctx).filter((key) => key !== 'canvas');
  ctx.save = () => stack.push(Object.fromEntries(keys.map((key) => [key, ctx[key]])));
  ctx.restore = () => Object.assign(ctx, stack.pop());
  ctx.measureText = (text) => {
    const size = Number(ctx.font.match(/([\d.]+)px/)?.[1] || 10);
    return { width: text.length * size * .5, actualBoundingBoxLeft: 2, actualBoundingBoxRight: text.length * size * .5 + 1,
      actualBoundingBoxAscent: size * .4, actualBoundingBoxDescent: size * .4 };
  };
  for (const method of ['strokeText', 'fillText', 'drawImage', 'fillRect', 'translate', 'rotate', 'scale']) {
    ctx[method] = (...args) => calls.push({ method, args, font: ctx.font, baseline: ctx.textBaseline, align: ctx.textAlign,
      fill: ctx.fillStyle, stroke: ctx.strokeStyle, width: ctx.lineWidth, shadowColor: ctx.shadowColor, shadowBlur: ctx.shadowBlur });
  }
  return { ctx, calls };
}

function withCanvasDocument(run) {
  const previous = globalThis.document, canvases = [];
  const document = { fonts: { size: 1 }, createElement(tag) {
    assert.equal(tag, 'canvas');
    const canvas = { width: 0, height: 0, ownerDocument: document };
    const drawing = context(canvas);
    canvas.getContext = () => drawing.ctx;
    canvases.push({ canvas, ...drawing });
    return canvas;
  } };
  globalThis.document = document;
  try { return run({ document, canvases }); }
  finally { if (previous === undefined) delete globalThis.document; else globalThis.document = previous; }
}

test('native copy measures the old single-line shrink rule and preserves caller text state', () => {
  const { ctx } = context();
  const result = measureNativeCopy(ctx, { text: '  ABCDEFGH  ', rect: { width: 80, height: 100 },
    fontFamily: 'LicensedFamily', preferred: 30 });
  assert.equal(result.fontSize, 20);
  assert.equal(result.font, '400 20px LicensedFamily');
  assert.equal(result.textWidth, 80);
  assert.equal(result.textMetrics.actualBoundingBoxAscent, 8);
  assert.equal(ctx.font, '10px sans-serif');
  assert.equal(ctx.textBaseline, 'alphabetic');
  assert.equal(ctx.textAlign, 'center');
  assert.equal(measureNativeCopy(ctx, { text: 'cannot fit', rect: { width: 1, height: 1 }, preferred: 100 }).fontSize, 12);
});

test('untouched native copy keeps direct stroke/fill at exact fractional coordinates', () => withCanvasDocument(({ canvases }) => {
  const { ctx, calls } = context();
  drawNativeCopy(ctx, { text: '副标', rect: { x: 6.25, y: 10.125, width: 200, height: 41 },
    fontFamily: 'LicensedFamily', preferred: 20.5 });
  assert.equal(canvases.length, 0);
  assert.deepEqual(calls.map((call) => call.method), ['strokeText', 'fillText']);
  assert.deepEqual(calls[0].args, ['副标', 6.25, 30.625]);
  assert.equal(calls[0].font, '400 21px LicensedFamily');
  assert.equal(calls[0].stroke, '#14314a');
  assert.equal(calls[0].width, Math.max(2, 20.5 * .13));
  assert.equal(calls[1].fill, '#ffffff');
  assert.equal(ctx.fillStyle, '#abcdef');
  assert.equal(ctx.lineWidth, 1);
  assert.equal(ctx.textBaseline, 'alphabetic');
}));

test('explicitly disabling effects removes the legacy stroke and caches the text while moving', () => withCanvasDocument(({ canvases }) => {
  const { ctx, calls } = context();
  const options = { text: 'plain subtitle cache', rect: { x: 10, y: 20, width: 400, height: 40 },
    fontFamily: 'LicensedFamily', preferred: 20, effects: { stroke: { enabled: false }, shadow: { enabled: false } } };
  drawNativeCopy(ctx, options);
  drawNativeCopy(ctx, { ...options, rect: { ...options.rect, x: 80, y: 90 }, effects: {} });
  assert.equal(canvases.length, 1);
  assert.deepEqual(canvases[0].calls.map((call) => call.method), ['fillText']);
  assert.deepEqual(calls.map((call) => call.method), ['drawImage', 'drawImage']);
  assert.equal(calls[0].args[0], calls[1].args[0]);
  assert.equal(calls[1].args[1] - calls[0].args[1], 70);
  assert.equal(calls[1].args[2] - calls[0].args[2], 70);
}));

test('explicit outline and shadow use the shared element renderer and keep its paint local', () => withCanvasDocument(({ canvases }) => {
  const { ctx, calls } = context();
  ctx.shadowColor = '#ababab'; ctx.shadowBlur = 99;
  drawNativeCopy(ctx, { text: 'native effect controls', rect: { x: 10, y: 20, width: 400, height: 40 }, preferred: 20,
    kind: 'title', effects: { stroke: { enabled: true, color: '#123456', width: 3 },
      shadow: { enabled: true, color: '#000000', opacity: 40, blur: 5, offsetX: 2, offsetY: 3 } } });
  assert.equal(canvases[0].calls.find((call) => call.method === 'fillText').fill, '#ffe190');
  assert.equal(canvases[0].calls.some((call) => call.method === 'strokeText'), false);
  assert.equal(calls.filter((call) => call.method === 'drawImage').length, 3);
  assert.equal(calls.find((call) => call.method === 'drawImage').shadowColor, 'rgba(0,0,0,0.4)');
  assert.equal(ctx.shadowColor, '#ababab');
  assert.equal(ctx.shadowBlur, 99);
}));

test('text masks include brush overhang rather than cropping at the subtitle rectangle', () => withCanvasDocument(({ canvases }) => {
  const { ctx } = context();
  ctx.measureText = () => ({ width: 30, actualBoundingBoxLeft: 14, actualBoundingBoxRight: 43,
    actualBoundingBoxAscent: 26, actualBoundingBoxDescent: 18 });
  drawNativeCopy(ctx, { text: 'overhanging brush glyph', rect: { x: 0, y: 0, width: 10, height: 8 }, preferred: 12, effects: {} });
  const mask = canvases[0], fill = mask.calls.find((call) => call.method === 'fillText');
  assert.ok(fill.args[1] >= 14);
  assert.ok(fill.args[2] >= 26);
  assert.ok(mask.canvas.width - fill.args[1] >= 43);
  assert.ok(mask.canvas.height - fill.args[2] >= 18);
}));

test('opt-in centering uses visible ink rather than advance width or the middle baseline', () => {
  const { ctx, calls } = context();
  ctx.measureText = () => ({ width: 120, actualBoundingBoxLeft: 14, actualBoundingBoxRight: 82,
    actualBoundingBoxAscent: 24, actualBoundingBoxDescent: 8 });
  const measured = drawNativeCopy(ctx, { text: '带悬垂字形', rect: { x: 40, y: 20, width: 300, height: 60,
    align: 'center', verticalAlign: 'middle' }, preferred: 32 });
  const fill = calls.find((call) => call.method === 'fillText');
  assert.deepEqual(fill.args, ['带悬垂字形', 156, 58]);
  assert.equal(measured.inkBounds.x + measured.inkBounds.width / 2, 190);
  assert.equal(measured.inkBounds.y + measured.inkBounds.height / 2, 50);
  assert.equal(ctx.textAlign, 'center');
  assert.equal(ctx.textBaseline, 'alphabetic');
});

test('plate body content rectangle excludes decorative ends in both render paths', () => withCanvasDocument(({ canvases }) => {
  const { ctx, calls } = context();
  ctx.measureText = () => ({ width: 116, actualBoundingBoxLeft: 9, actualBoundingBoxRight: 87,
    actualBoundingBoxAscent: 25, actualBoundingBoxDescent: 7 });
  const options = { text: '题签主体居中', rect: { x: 10, y: 20, width: 420, height: 100 }, preferred: 30,
    align: 'center', verticalAlign: 'middle', contentRect: { x: 80, y: 50, width: 240, height: 50 } };
  const direct = drawNativeCopy(ctx, options);
  const masked = drawNativeCopy(ctx, { ...options, effects: {} });
  assert.deepEqual(direct.contentRect, options.contentRect);
  assert.equal(direct.inkBounds.x + direct.inkBounds.width / 2, 200);
  assert.equal(direct.inkBounds.y + direct.inkBounds.height / 2, 75);
  assert.deepEqual(masked.inkBounds, direct.inkBounds);
  const image = calls.find((call) => call.method === 'drawImage');
  const maskFill = canvases[0].calls.find((call) => call.method === 'fillText');
  assert.equal(image.args[1] + maskFill.args[1], direct.drawX);
  assert.equal(image.args[2] + maskFill.args[2], direct.drawY);
}));

test('aligned fitting accounts for glyph overhang while the legacy fitting stays unchanged', () => {
  const { ctx } = context();
  ctx.measureText = () => {
    const size = Number(ctx.font.match(/([\d.]+)px/)[1]);
    return { width: size * 3, actualBoundingBoxLeft: size * .5, actualBoundingBoxRight: size * 4,
      actualBoundingBoxAscent: size * .5, actualBoundingBoxDescent: size * .2 };
  };
  const options = { text: '字形', rect: { x: 0, y: 0, width: 100, height: 80 }, preferred: 30 };
  assert.equal(measureNativeCopy(ctx, options).fontSize, 30);
  const centered = measureNativeCopy(ctx, { ...options, align: 'center', verticalAlign: 'middle' });
  assert.equal(centered.fontSize, 22);
  assert.equal(centered.inkBounds.width, 99);
  assert.equal(centered.inkBounds.x, .5);
});

test('centered measurements support signed overhang and absent ink metrics', () => {
  const { ctx } = context();
  const options = { text: '边界', rect: { x: 10, y: 20, width: 200, height: 60 }, preferred: 30,
    align: 'center', verticalAlign: 'middle' };
  ctx.measureText = () => ({ width: 100, actualBoundingBoxLeft: -10, actualBoundingBoxRight: 90,
    actualBoundingBoxAscent: 22, actualBoundingBoxDescent: 6 });
  const signed = measureNativeCopy(ctx, options);
  assert.equal(signed.drawX, 60);
  assert.equal(signed.inkBounds.x + signed.inkBounds.width / 2, 110);
  assert.equal(signed.inkBounds.y + signed.inkBounds.height / 2, 50);
  ctx.measureText = () => ({ width: 100 });
  const fallback = measureNativeCopy(ctx, options);
  assert.equal(fallback.drawX, 60);
  assert.equal(fallback.drawY, 50);
});

test('body coordinates alone never move legacy copy and alignment can opt in one axis', () => {
  const { ctx } = context();
  const options = { text: '保留位置', rect: { x: 6.25, y: 10.125, width: 200, height: 41,
    contentRect: { x: 40, y: 50, width: 100, height: 35 } }, preferred: 20.5 };
  const legacy = measureNativeCopy(ctx, options);
  assert.equal(legacy.drawX, 6.25);
  assert.equal(legacy.drawY, 30.625);
  const vertical = measureNativeCopy(ctx, { ...options, verticalAlign: 'middle' });
  assert.equal(vertical.drawX, 6.25);
  assert.equal(vertical.inkBounds.y + vertical.inkBounds.height / 2, 67.5);
});

test('native copy measures rotated ink bounds around the actual content body without changing context', () => {
  const { ctx, calls } = context();
  ctx.measureText = () => ({ width: 120, actualBoundingBoxLeft: 14, actualBoundingBoxRight: 82,
    actualBoundingBoxAscent: 24, actualBoundingBoxDescent: 8 });
  const measured = measureNativeCopy(ctx, { text: '跟随题签', rect: { x: 10, y: 20, width: 420, height: 100,
    rotation: 90, align: 'center', verticalAlign: 'middle' }, preferred: 32,
    contentRect: { x: 80, y: 50, width: 240, height: 50 } });
  assert.deepEqual(measured.rotationCenter, { x: 200, y: 75 });
  assert.equal(measured.rotation, 90);
  assert.equal(measured.rotatedInkBounds.x, 184);
  assert.equal(measured.rotatedInkBounds.y, 27);
  assert.ok(Math.abs(measured.rotatedInkBounds.width - 32) < 1e-10);
  assert.equal(measured.rotatedInkBounds.height, 96);
  assert.deepEqual(calls, []);
  assert.equal(ctx.font, '10px sans-serif');
  assert.equal(ctx.textBaseline, 'alphabetic');
});

test('native copy rotates both direct text and effect masks around the same body center', () => withCanvasDocument(({ canvases }) => {
  const { ctx, calls } = context();
  const options = { text: '独立倾斜副标', rect: { x: 10, y: 20, width: 420, height: 100, rotation: -4.5 },
    preferred: 30, align: 'center', verticalAlign: 'middle',
    contentRect: { x: 80, y: 50, width: 240, height: 50 } };
  const direct = drawNativeCopy(ctx, options);
  const directCalls = calls.splice(0);
  const masked = drawNativeCopy(ctx, { ...options, effects: { stroke: { enabled: true, width: 2 } } });
  const transform = [
    { method: 'translate', args: [200, 75] },
    { method: 'rotate', args: [-4.5 * Math.PI / 180] },
    { method: 'translate', args: [-200, -75] },
  ];
  for (const renderedCalls of [directCalls, calls]) {
    assert.deepEqual(renderedCalls.slice(0, 3).map(({ method, args }) => ({ method, args })), transform);
    assert.ok(renderedCalls.slice(3).every(({ method }) => ['strokeText', 'fillText', 'drawImage'].includes(method)));
  }
  assert.deepEqual(masked.inkBounds, direct.inkBounds);
  assert.deepEqual(masked.rotatedInkBounds, direct.rotatedInkBounds);
  assert.equal(canvases.length, 2);
  assert.equal(ctx.font, '10px sans-serif');
  assert.equal(ctx.fillStyle, '#abcdef');
}));

test('native copy ignores malformed rotation and leaves legacy rendering untransformed', () => {
  for (const rotation of [undefined, null, true, '', 'invalid', Infinity, NaN, 0]) {
    const { ctx, calls } = context();
    const measured = drawNativeCopy(ctx, { text: '保持原样', rect: { x: 10, y: 20, width: 200, height: 40, rotation }, preferred: 20 });
    assert.equal(measured.rotation, 0);
    assert.deepEqual(measured.rotatedInkBounds, measured.inkBounds);
    assert.deepEqual(calls.map(({ method }) => method), ['strokeText', 'fillText']);
  }
});

test('opt-in ink fitting uses the measured body height without applying legacy padding twice', () => {
  const { ctx } = context();
  const options = { text: '题签文字', rect: { x: 10, y: 20, width: 200, height: 25, align: 'center', verticalAlign: 'middle' }, preferred: 29.7 };
  const legacy = measureNativeCopy(ctx, options);
  const fitted = measureNativeCopy(ctx, { ...options, rect: { ...options.rect, fitMode: 'ink' } });
  assert.equal(legacy.fontSize, 18.75);
  assert.equal(fitted.fontSize, 25);
  assert.equal(fitted.font, '400 25px "Microsoft YaHei",sans-serif');
  assert.ok(fitted.inkBounds.height <= options.rect.height);
  assert.equal(fitted.inkBounds.y + fitted.inkBounds.height / 2, 32.5);
  assert.equal(measureNativeCopy(ctx, { ...options, rect: { ...options.rect, fitMode: 'unknown' } }).fontSize, legacy.fontSize);
});

test('ink fitting still shrinks against actual glyph height and width', () => {
  const { ctx } = context();
  ctx.measureText = () => {
    const size = Number(ctx.font.match(/([\d.]+)px/)[1]);
    return { width: size * 4, actualBoundingBoxLeft: size * .5, actualBoundingBoxRight: size * 4.5,
      actualBoundingBoxAscent: size * .8, actualBoundingBoxDescent: size * .3 };
  };
  const options = { text: '字形', rect: { x: 0, y: 0, width: 300, height: 30, fitMode: 'ink', align: 'center', verticalAlign: 'middle' }, preferred: 40 };
  const heightFit = measureNativeCopy(ctx, options);
  assert.equal(heightFit.fontSize, 27);
  assert.ok(heightFit.inkBounds.height <= 30);
  const widthFit = measureNativeCopy(ctx, { ...options, rect: { ...options.rect, width: 100 } });
  assert.equal(widthFit.fontSize, 20);
  assert.equal(widthFit.inkBounds.width, 100);
});

test('both native draw paths retain ink fitting from the original rotated subtitle rectangle', () => withCanvasDocument(() => {
  const { ctx, calls } = context();
  const options = { text: '倾斜正文保持大小', rect: { x: 10, y: 20, width: 300, height: 25,
    rotation: -2.5, fitMode: 'ink', align: 'center', verticalAlign: 'middle' }, preferred: 29.7 };
  const direct = drawNativeCopy(ctx, options);
  const masked = drawNativeCopy(ctx, { ...options, effects: {} });
  assert.equal(direct.fontSize, 25);
  assert.equal(masked.font, direct.font);
  assert.deepEqual(masked.rotatedInkBounds, direct.rotatedInkBounds);
  assert.equal(calls.find(({ method }) => method === 'fillText').font, direct.font);
}));

test('native copy mask cache evicts old canvases after 64 distinct entries', () => withCanvasDocument(({ canvases }) => {
  const { ctx } = context();
  const draw = (index) => drawNativeCopy(ctx, { text: `bounded cache ${index}`, rect: { x: 0, y: 0, width: 400, height: 40 }, preferred: 20, effects: {} });
  for (let index = 0; index < 65; index++) draw(index);
  assert.equal(canvases.length, 65);
  draw(64);
  assert.equal(canvases.length, 65);
  draw(0);
  assert.equal(canvases.length, 66);
}));

test('inspector defaults expose the old outline outward radius', () => {
  const effects = defaultNativeCopyEffects(30);
  assert.equal(effects.stroke.enabled, true);
  assert.equal(effects.stroke.color, '#14314a');
  assert.equal(effects.stroke.width, 30 * .13 / 2);
  assert.equal(effects.shadow.enabled, false);
});
