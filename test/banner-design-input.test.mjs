import test from 'node:test';
import assert from 'node:assert/strict';
import { createBannerDesignLayout, splitBannerTitle, renderBannerTitleMask } from '../public/banner-design-input.js';
import { communityPlacements, communityTemplate } from '../lib/community-placements.mjs';

const overlaps = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

test('all shipping placements keep whole supplied characters inside the safe frame, separate from title and subtitle', () => {
  for (const placement of communityPlacements) {
    const template = communityTemplate(placement);
    for (const aspect of [.38, .85, 2.4]) {
      const layout = createBannerDesignLayout(template, { copy: '天工谜影\n谁是百晓生？', subtitle: '慧眼识物，有惊喜掉落！', aspectByKind: { character: aspect } });
      const char = layout.character;
      assert.ok(Math.abs(char.width / char.height - aspect) < 1e-8, `${template.id}: original aspect`);
      for (const kind of ['character', 'title', 'subtitle', 'subtitle-backing']) {
        const box = layout[kind];
        assert.ok(box.x >= template.width * .04 - .001 && box.x + box.width <= template.width * .96 + .001, `${template.id}/${kind}: horizontal safety`);
        assert.ok(box.y >= template.height * .04 - .001 && box.y + box.height <= template.height * .96 + .001, `${template.id}/${kind}: vertical safety`);
      }
      assert.equal(overlaps(char, layout.title), false, `${template.id}: title is clear`);
      assert.equal(overlaps(char, layout['subtitle-backing']), false, `${template.id}: caption is clear`);
    }
  }
});

test('square and portrait copy sits above the subject and wide copy sits to its left', () => {
  for (const [width, height] of [[900, 383], [984, 562], [500, 400], [120, 120], [900, 1200]]) {
    const result = createBannerDesignLayout({ width, height }, { copy: '创作者中心上线', subtitle: '立即参与', aspectByKind: { character: { width: 700, height: 900 } } });
    if (width / height >= 1.6) assert.ok(result.title.x + result.title.width < result.character.x);
    else assert.ok(result.title.y + result.title.height < result.character.y);
    assert.equal(result.character2.visible, false);
    assert.equal(result.foreground.visible, false);
  }
});

test('local edit preserves every supplied layout field without mutating inputs', () => {
  const layouts = {
    title: { x: 7.5, y: 25, width: 411, height: 109, visible: true, effects: { stroke: { color: '#643a2c' } } },
    character: { x: -12, y: 5, width: 500, height: 590, visible: false },
    'subtitle-backing': { x: 40, y: 300, width: 350, height: 42, visible: true, asset: 'designer-paper.png' },
  };
  const before = structuredClone(layouts);
  const actual = createBannerDesignLayout({ width: 900, height: 383 }, { layouts, reset: false, copy: '新标题' });
  for (const key of Object.keys(layouts)) assert.deepEqual(actual[key], layouts[key]);
  actual.title.effects.stroke.color = '#000000';
  assert.deepEqual(layouts, before);
  assert.ok(actual.subtitle && actual.logo);
});

test('two original characters use distinct subject slots without covering headline', () => {
  for (const template of [{ width: 900, height: 383 }, { width: 500, height: 400 }, { width: 900, height: 1200 }]) {
    const layout = createBannerDesignLayout(template, { copy: '天工谜影谁是百晓生？', subtitle: '有惊喜掉落', aspectByKind: { character: .7, character2: 1.1 } });
    assert.equal(layout.character2.visible, true);
    assert.equal(overlaps(layout.character, layout.character2), false);
    assert.equal(overlaps(layout.character2, layout.title), false);
    assert.equal(overlaps(layout.character2, layout['subtitle-backing']), false);
    assert.ok(Math.abs(layout.character2.width / layout.character2.height - 1.1) < 1e-8);
  }
});

test('absent second-character placeholder does not shrink the real subject into a half slot', () => {
  const template = communityTemplate(communityPlacements.find(item => item.id === 'community-official-cover'));
  // This is the live regression: getElementLayout returns a visible default box
  // even when assetByTemplate.character2 is null and there is no loaded image.
  const options = {
    copy: '天工谜影\n谁是百晓生？', subtitle: '慧眼识物，有惊喜掉落！',
    layouts: { character2: { x: 630, y: 70, width: 230, height: 290, visible: true }, foreground: { visible: true } },
    aspectByKind: { character: { width: 1254, height: 1254 }, character2: null, foreground: null },
  };
  const layout = createBannerDesignLayout(template, options);
  const single = createBannerDesignLayout(template, { ...options, layouts: {} });
  assert.equal(layout.character2.visible, false);
  assert.equal(layout.foreground.visible, false);
  assert.deepEqual(layout.character, single.character);
  assert.ok(layout.character.height / template.height > .85, 'The supplied square subject fills the poster height');
  assert.ok(layout.character.width / template.width > .37, 'The subject has the full right-side composition region');
  assert.equal(overlaps(layout.character, layout.title), false);
  assert.equal(overlaps(layout.character, layout['subtitle-backing']), false);
  assert.deepEqual(options.layouts.character2, { x: 630, y: 70, width: 230, height: 290, visible: true });
});

test('an optional second subject needs valid loaded dimensions before it can divide the subject region', () => {
  const template = { width: 900, height: 383 };
  for (const absent of [null, undefined, 0, -1, { width: 0, height: 1254 }, { width: 1254, height: 0 }]) {
    const layout = createBannerDesignLayout(template, {
      copy: '天工谜影', layouts: { character2: { visible: true } },
      aspectByKind: { character: 1, character2: absent },
    });
    assert.equal(layout.character2.visible, false);
    assert.ok(layout.character.height > template.height * .8);
  }
  const existing = { character2: { x: 1, y: 2, width: 20, height: 30, visible: true } };
  assert.deepEqual(createBannerDesignLayout(template, { layouts: existing, reset: false }).character2, existing.character2,
    'A local edit preserves the saved composition even before optional images have loaded');
});

test('explicit left character and right title mirror the complete copy group while retaining original asset ratios and Logo', () => {
  const template = communityTemplate(communityPlacements[0]);
  const options = { copy: '天工谜影谁是百晓生？', subtitle: '慧眼识物，有惊喜掉落！', aspectByKind: { character: .7, character2: 1.1, logo: 1.7 } };
  const normal = createBannerDesignLayout(template, options);
  for (const direction of ['人物在左，主标在右', '把人物放到画面左侧，主标题靠右', '主要角色左边，主文案右侧', '主标在右']) {
    const result = createBannerDesignLayout(template, { ...options, direction });
    assert.ok(result.character.x + result.character.width < result.title.x, direction);
    assert.ok(result.character2.x + result.character2.width < result.title.x, direction);
    assert.ok(Math.abs(result.character.width / result.character.height - .7) < 1e-8);
    assert.ok(Math.abs(result.character2.width / result.character2.height - 1.1) < 1e-8);
    assert.deepEqual(result.logo, normal.logo, 'The brand Logo keeps its template placement');
    for (const kind of ['character', 'character2', 'title', 'subtitle', 'subtitle-backing']) {
      assert.ok(Math.abs(result[kind].x + result[kind].width / 2 + normal[kind].x + normal[kind].width / 2 - template.width) < 1e-8, `${kind}: mirror around safe-frame centre`);
      assert.equal(overlaps(result[kind], result.title), kind === 'title');
      assert.ok(result[kind].x >= template.width * .04 - .001 && result[kind].x + result[kind].width <= template.width * .96 + .001);
    }
    assert.equal(overlaps(result.character, result['subtitle-backing']), false);
    assert.equal(overlaps(result.character2, result['subtitle-backing']), false);
  }
  assert.deepEqual(createBannerDesignLayout(template, { ...options, direction: '人物在右，主标在左' }), normal);
});

test('contradictory fresh positioning fails before rendering, and edit mode ignores fresh-layout direction', () => {
  const template = { width: 900, height: 383 };
  for (const direction of ['人物在左，主标在左', '人物在右，主标题在右', '人物在左，人物在右']) {
    assert.throws(() => createBannerDesignLayout(template, { copy: '测试主标', direction }), /同一侧|冲突/u);
  }
  const layouts = createBannerDesignLayout(template, { copy: '天工谜影', subtitle: '副标说明', aspectByKind: { character: .8 } });
  assert.deepEqual(createBannerDesignLayout(template, { layouts, reset: false, direction: '人物在左，主标在左' }), layouts);
  assert.deepEqual(createBannerDesignLayout(template, { layouts, reset: false, direction: '人物在左，主标在右' }), layouts);
  assert.doesNotThrow(() => createBannerDesignLayout(template, { copy: '标题', direction: '人物在左，副标题在左' }), 'Subtitle placement is not mistaken for a main-title instruction');
});

test('title splitting respects explicit copy and keeps semantic phrases and punctuation intact', () => {
  assert.deepEqual(splitBannerTitle('  天工谜影\r\n谁是百晓生？\n'), ['天工谜影', '谁是百晓生？']);
  assert.deepEqual(splitBannerTitle('创作者中心上线', { width: 400, height: 180 }), ['创作者中心上线']);
  assert.deepEqual(splitBannerTitle('天工谜影谁是百晓生？', { width: 460, height: 170 }), ['天工谜影', '谁是百晓生？']);
  for (const copy of ['周年庆典限时福利盛大开启！', '🎉百级突破全新征程', '全新活动，邀请好友一起参加！']) {
    const lines = splitBannerTitle(copy, { width: 300, height: 180 });
    assert.equal(lines.join(''), copy);
    assert.equal(lines.length, 2);
    assert.ok(lines.every(line => !/^[，。！？、：；]/u.test(line)));
  }
  assert.deepEqual(splitBannerTitle('百级突破全新征程', { width: 800, height: 100 }), ['百级突破全新征程']);
});

function canvasDocument({ loaded = true } = {}) {
  const calls = [], canvases = [];
  const document = {
    fonts: { check: () => loaded },
    createElement(type) {
      assert.equal(type, 'canvas');
      const canvas = { width: 0, height: 0 };
      const context = {
        scale(x, y) { calls.push({ method: 'scale', x, y }); },
        measureText(text) {
          const size = Number(this.font.match(/([\d.]+)px/u)?.[1]);
          const width = Array.from(text).length * size;
          return { width, actualBoundingBoxLeft: size * .14, actualBoundingBoxRight: width + size * .06, actualBoundingBoxAscent: size * .88, actualBoundingBoxDescent: size * .2 };
        },
        fillText(text, x, y) { calls.push({ method: 'fillText', text, x, y, font: this.font, fillStyle: this.fillStyle, shadowBlur: this.shadowBlur }); },
      };
      canvas.getContext = () => context;
      canvases.push(canvas);
      return canvas;
    },
  };
  return { document, calls, canvases };
}

test('mask renders actual chosen glyphs without decoration, keeping every ink bound inside its local canvas', () => {
  const fake = canvasDocument();
  const mask = renderBannerTitleMask({ text: '天工谜影\n谁是百晓生？', fontFamily: '"company-licensed-font"', rect: { x: 75, y: 80, width: 450, height: 190 }, scale: 2, document: fake.document });
  assert.equal(mask.canvas.width, 900);
  assert.equal(mask.canvas.height, 380);
  assert.deepEqual(mask.lines, ['天工谜影', '谁是百晓生？']);
  assert.equal(mask.rect.x, 75);
  assert.equal(fake.calls.filter(call => call.method === 'fillText').length, 2);
  for (const call of fake.calls.filter(call => call.method === 'fillText')) {
    assert.match(call.font, /400 [\d.]+px "company-licensed-font"/u);
    assert.equal(call.fillStyle, '#ffffff');
    assert.equal(call.shadowBlur, 0);
    const size = Number(call.font.match(/([\d.]+)px/u)[1]);
    assert.ok(call.x - size * .14 >= 0);
    assert.ok(call.x + Array.from(call.text).length * size + size * .06 <= 450);
    assert.ok(call.y - size * .88 >= 0);
    assert.ok(call.y + size * .2 <= 190);
  }
});

test('missing font readiness is explicit and empty copy creates no false glyphs', () => {
  const fake = canvasDocument();
  assert.throws(() => renderBannerTitleMask({ text: '标题', document: fake.document }), /company font/u);
  assert.throws(() => renderBannerTitleMask({ text: '标题', fontFamily: 'company', document: canvasDocument({ loaded: false }).document }), /finished loading/u);
  const empty = renderBannerTitleMask({ text: ' ', fontFamily: 'company', rect: { width: 50, height: 20 }, document: fake.document });
  assert.equal(empty.fontSize, 0);
  assert.deepEqual(empty.lines, []);
  assert.equal(fake.calls.filter(call => call.method === 'fillText').length, 0);
  assert.throws(() => createBannerDesignLayout({ width: 0, height: 20 }), /positive/u);
});
