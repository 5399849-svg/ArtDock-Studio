import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { runBannerDesign,referenceCharacterScene } from '../lib/community-banner-design.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const template = { width: 160, height: 80 };
const titleFont = { id: 'font-test', sha256: 'a'.repeat(64), name: '字魂测试体' };
async function png(width, height, background) {
  return sharp({ create: { width, height, channels: 4, background } }).png().toBuffer();
}
async function fixture() {
  const guide = await png(160, 80, '#cea86a');
  const titleMask = await sharp(Buffer.from('<svg width="100" height="40"><path d="M12 9h22v8H12zM20 9h6v23h-6zM59 10h24v7H59zM63 10h6v22h-6z" fill="white"/></svg>')).png().toBuffer();
  return { guide, current: guide, titleMask, titleFont, copy: '天工谜影', subtitle: '慧眼识物，有惊喜掉落！', references: [guide], characters: [guide], layouts: { title: { x: 10, y: 15, width: 85, height: 30 } } };
}
async function backing() {
  return sharp(Buffer.from('<svg width="240" height="100"><path d="M20 38h200l15 12-15 12H20L5 50z" fill="#ae783f" stroke="#f4d3a1" stroke-width="2"/></svg>')).png().toBuffer();
}
async function executor() {
  const calls = [];
  const material = await png(100, 40, '#f9c76c');
  const scene = await png(200, 100, '#67836a');
  const carrier = await backing();
  return {
    calls,
    generate: async (body, { stage }) => {
      calls.push({ body, stage });
      return stage === 'subtitle-backing' ? carrier : stage === 'title-material' ? material : scene;
    },
  };
}

test('full design makes one internal direction and exact separate layers, without mutating inputs', async () => {
  const inputs = await fixture(), mock = await executor(), progress = [];
  const before = { guide: hash(inputs.guide), mask: hash(inputs.titleMask), layouts: structuredClone(inputs.layouts), font: structuredClone(inputs.titleFont) };
  const result = await runBannerDesign({ mode: 'design', prompt: '温暖书房，文案简洁', template, model: 'banana_pro', inputs, generate: mock.generate, onProgress: stage => progress.push(stage) });
  assert.deepEqual(result.stages, ['direction', 'background', 'title-material', 'subtitle-backing']);
  assert.deepEqual([...progress].sort(), [...result.stages].sort());
  assert.deepEqual(result.layers.map(layer => layer.kind), ['background', 'title', 'subtitle-backing']);
  for (const image of [result.designPreview, result.layers[0].buffer]) {
    const info = await sharp(image).metadata();
    assert.deepEqual([info.width, info.height], [320, 160]);
  }
  assert.equal(hash(inputs.guide), before.guide);
  assert.equal(hash(inputs.titleMask), before.mask);
  assert.deepEqual(inputs.layouts, before.layouts);
  assert.deepEqual(inputs.titleFont, before.font);
  assert.match(mock.calls[0].body.prompt, /参考图1/);
  assert.match(mock.calls[0].body.prompt, /不是用户批准的最终合成稿/);
  assert.equal(mock.calls[3].body.background, 'transparent');
  assert.equal(mock.calls[3].body.model, 'gpt-image-2');
  const carrierInfo = await sharp(result.layers[2].buffer).metadata();
  assert.ok(carrierInfo.width / carrierInfo.height > 2);
});

test('a numbered character sheet creates one character in the scene when no independent character was uploaded',async()=>{
  const inputs=await fixture(),mock=await executor();inputs.characters=[];inputs.references=[inputs.guide,await png(300,500,'#123456')];inputs.referenceRoles=['reference-image','reference-image'];inputs.subtitle='';
  const result=await runBannerDesign({mode:'design',prompt:'参考图1的风格，使用图2角色设计一张banner，双手捧铜手炉',template,model:'gpt-image-2',inputs,generate:mock.generate});
  assert.deepEqual(result.sceneCharacters,{mode:'reference-character-scene',referenceIndex:2});
  const direction=mock.calls.find(c=>c.stage==='direction').body.prompt,background=mock.calls.find(c=>c.stage==='background').body.prompt;
  assert.match(direction,/三视图.*同一位角色.*最终只画一次/);assert.match(direction,/默认背景不作为画风或色彩依据/);assert.match(direction,/新的动作、表情与道具/);
  assert.match(background,/角色没有单独的原始透明素材.*不能擦除/);assert.ok(!background.includes('完整擦除人物及自带道具'));
  assert.deepEqual(referenceCharacterScene('使用图2的角色',inputs),result.sceneCharacters);
  assert.throws(()=>referenceCharacterScene('使用图3角色',inputs),/当前只有2张参考图/);
  assert.equal(referenceCharacterScene('使用图2角色',{...inputs,characters:[inputs.guide]}),null);
});

test('later background edits retain previously generated scene characters',async()=>{
  const inputs=await fixture(),mock=await executor();inputs.sceneCharacters={mode:'reference-character-scene',referenceIndex:2};
  const result=await runBannerDesign({mode:'edit',prompt:'背景更明亮一些，其余保留',template,model:'gpt-image-2',inputs,affectedKinds:['background'],generate:mock.generate});
  assert.equal(result.sceneCharacters.mode,'reference-character-scene');assert.match(mock.calls[0].body.prompt,/保留同一位.*人物.*手持道具/);assert.ok(!mock.calls[0].body.prompt.includes('输出仍是纯环境背景层'));
});

test('AI supplies material only; final title is bounded by exact licensed glyph alpha and muted outline', async () => {
  const inputs = await fixture(), mock = await executor();
  const result = await runBannerDesign({ mode: 'edit', prompt: '主标用浅金色', template, model: 'gpt-image-2', inputs, affectedKinds: ['title'], generate: mock.generate });
  assert.equal(result.designPreview, null);
  assert.deepEqual(mock.calls.map(call => call.stage), ['title-material']);
  const layer = result.layers[0];
  assert.equal(layer.fontProvenance.fontId, titleFont.id);
  assert.equal(layer.fontProvenance.sha256, titleFont.sha256);
  assert.equal(layer.fontProvenance.maskSha256, hash(inputs.titleMask));
  assert.equal(layer.fontProvenance.method, 'licensed-glyph-mask-material-v1');
  const { data, info } = await sharp(layer.buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const mask = await sharp(inputs.titleMask).ensureAlpha().extractChannel(3).raw().toBuffer();
  assert.deepEqual([info.width, info.height], [100, 40]);
  const radius = layer.fontProvenance.outlineRadius;
  let opaqueFill = 0, transparent = 0, dark = 0, pale = 0;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    const offset = (y * info.width + x) * 4;
    const rgb = [...data.subarray(offset, offset + 3)];
    const alpha = data[offset + 3];
    if (!alpha) { transparent++; continue; }
    let nearGlyph = false;
    for (let yy = Math.max(0, y - radius); yy <= Math.min(info.height - 1, y + radius); yy++) {
      for (let xx = Math.max(0, x - radius); xx <= Math.min(info.width - 1, x + radius); xx++) {
        if (mask[yy * info.width + xx]) nearGlyph = true;
      }
    }
    assert.ok(nearGlyph, `paint outside original glyph outline at ${x},${y}`);
    if (mask[y * info.width + x] === 255) {
      assert.equal(alpha, 255);
      assert.deepEqual(rgb, [249, 199, 108]);
      opaqueFill++;
    }
    if (rgb.join() === '76,91,104') dark++;
    if (rgb.join() === '245,241,218') pale++;
  }
  assert.ok(opaqueFill > 100 && transparent > 1000 && dark > 0 && pale > 0);
});

test('backing-only edit sends current composition and does not regenerate background or title', async () => {
  const inputs = await fixture(), mock = await executor();
  delete inputs.titleMask;
  delete inputs.titleFont;
  const result = await runBannerDesign({ mode: 'edit', prompt: '副标底板改成纸质题签，其余保留', template, model: 'banana_pro', inputs, affectedKinds: ['subtitle-backing', 'subtitle-backing'], generate: mock.generate });
  assert.deepEqual(mock.calls.map(call => call.stage), ['subtitle-backing']);
  assert.deepEqual(result.layers.map(layer => layer.kind), ['subtitle-backing']);
  assert.match(mock.calls[0].body.prompt, /纸质题签/);
  assert.match(mock.calls[0].body.prompt, /绝对不能将任何文字画入图层/);
  assert.ok(mock.calls[0].body.images[0].data_base64);
  assert.equal(result.designPreview, null);
});

test('geometry-only edit performs no paid generation', async () => {
  const inputs = await fixture();
  const result = await runBannerDesign({ mode: 'edit', prompt: '人物缩小一点', template, model: 'banana_pro', inputs, affectedKinds: [], generate: () => assert.fail('must not call generation') });
  assert.deepEqual(result, { layers: [], designPreview: null, stages: [] });
});

test('opaque or fake-transparent checkerboard backing rejects without returning partial layers', async () => {
  const inputs = await fixture(), mock = await executor();
  const opaque = await png(240, 100, '#cccccc');
  const checker = await sharp(Buffer.from('<svg width="240" height="100"><pattern id="c" width="20" height="20" patternUnits="userSpaceOnUse"><rect width="20" height="20" fill="#fff"/><path d="M0 0h10v10H0zM10 10h10v10H10z" fill="#ccc"/></pattern><rect width="240" height="100" fill="url(#c)"/></svg>')).png().toBuffer();
  for (const invalid of [opaque, checker]) {
    await assert.rejects(runBannerDesign({ mode: 'design', prompt: '简洁活动图', template, model: 'gpt-image-2', inputs, generate: async (body, meta) => meta.stage === 'subtitle-backing' ? invalid : mock.generate(body, meta) }), /真实透明|棋盘格/);
  }
});

test('wrong-shaped flattened poster cannot become subtitle carrier', async () => {
  const inputs = await fixture();
  const poster = await sharp(Buffer.from('<svg width="200" height="200"><rect x="10" y="10" width="180" height="180" fill="#ad8532"/></svg>')).png().toBuffer();
  await assert.rejects(runBannerDesign({ mode: 'edit', prompt: '承托做成纸签', template, model: 'gpt-image-2', inputs, affectedKinds: ['subtitle-backing'], generate: async () => poster }), /完整画面/);
});

test('a requested layer failure rejects the whole run; no automatic broad regeneration', async () => {
  const inputs = await fixture(), mock = await executor(), calls = [];
  await assert.rejects(runBannerDesign({ mode: 'edit', prompt: '换背景和主标材质', template, model: 'banana_pro', inputs, affectedKinds: ['background', 'title'], generate: async (body, meta) => {
    calls.push(meta.stage);
    if (meta.stage === 'title-material') throw new Error('upstream failure');
    return mock.generate(body, meta);
  } }), /upstream failure/);
  assert.deepEqual(calls.sort(), ['background', 'title-material'].sort());
});

test('licensed title mask and font provenance are mandatory before submitting generation', async () => {
  const inputs = await fixture();
  for (const altered of [{ titleMask: undefined }, { titleFont: undefined }, { titleFont: { ...titleFont, sha256: 'wrong' } }, { titleMask: await png(100, 40, '#ffffff') }]) {
    await assert.rejects(runBannerDesign({ mode: 'design', prompt: '设计母版', template, model: 'gpt-image-2', inputs: { ...inputs, ...altered }, generate: () => assert.fail('preflight must reject before paid calls') }), /版权字形|版权字体|透明/);
  }
});

test('a design without subtitle generates direction, background and licensed title only', async () => {
  const inputs = await fixture(), mock = await executor();
  inputs.subtitle = '';
  const result = await runBannerDesign({ prompt: '原创明亮场景', template, model: 'banana_pro', inputs, generate: mock.generate });
  assert.deepEqual(result.stages, ['direction', 'background', 'title-material']);
  assert.deepEqual(result.layers.map(layer => layer.kind), ['background', 'title']);
});

test('mixed internal assets never acquire designer reference numbers; duplicate characters are sent once', async () => {
  const inputs = await fixture(), mock = await executor();
  const character = await png(100, 70, '#e28a31');
  const secondReference = await png(100, 60, '#68d5c9');
  inputs.references = [inputs.guide, character, secondReference];
  inputs.referenceRoles = ['reference-tone', 'core-character', 'reference-copy'];
  inputs.characters = [character, character];
  await runBannerDesign({ prompt: '参考图1色调，参考图2文字效果', template, model: 'banana_pro', inputs, generate: mock.generate });
  const call = mock.calls.find(call => call.stage === 'direction');
  assert.equal(call.body.images.length, 5); // Guide, 2 numbered refs, character, glyph.
  assert.match(call.body.prompt, /输入第2张：参考图1/);
  assert.match(call.body.prompt, /输入第3张：参考图2/);
  assert.match(call.body.prompt, /输入第4张：原始核心角色素材（不属于参考图编号）/);
  assert.doesNotMatch(call.body.prompt, /参考图3/);
  const title = mock.calls.find(call => call.stage === 'title-material');
  assert.match(title.body.prompt, /输入第3张：参考图2/);
});

test('provider reference cap preserves numbered refs and rejects excess before any generation', async () => {
  const inputs = await fixture(), mock = await executor();
  inputs.references = Array.from({ length: 12 }, () => inputs.guide);
  inputs.referenceRoles = Array.from({ length: 12 }, () => 'reference-image');
  inputs.characters = Array.from({ length: 20 }, () => inputs.guide);
  await runBannerDesign({ prompt: '按参考图设计', template, model: 'banana_pro', inputs, generate: mock.generate });
  assert.ok(mock.calls.every(call => call.body.images.length <= 14));
  assert.equal(mock.calls[0].body.images.length, 14);
  inputs.references.push(inputs.guide);
  await assert.rejects(runBannerDesign({ prompt: '按参考图设计', template, model: 'banana_pro', inputs, generate: () => assert.fail('too many refs must fail before provider') }), /参考图过多/);
});

test('empty title text rejects design and title edits before provider calls', async () => {
  const inputs = { ...await fixture(), copy: '  ' };
  for (const mode of ['design', 'edit']) {
    await assert.rejects(runBannerDesign({ mode, prompt: '主标浅一点', template, model: 'banana_pro', inputs, affectedKinds: ['title'], generate: () => assert.fail('empty copy must fail preflight') }), /主标文字/);
  }
});

test('independent layers run at most two concurrently while progress persistence remains serialized', async () => {
  const inputs = await fixture(), mock = await executor();
  let active = 0, maximum = 0, progressActive = 0, progressMaximum = 0;
  const pause = delay => new Promise(resolve => setTimeout(resolve, delay));
  const result = await runBannerDesign({ prompt: '完整设计', template, model: 'banana_pro', inputs,
    onProgress: async () => {
      progressMaximum = Math.max(progressMaximum, ++progressActive);
      await pause(5);
      progressActive--;
    },
    generate: async (body, meta) => {
      maximum = Math.max(maximum, ++active);
      await pause(meta.stage === 'background' ? 50 : 20);
      const buffer = await mock.generate(body, meta);
      active--;
      return buffer;
    },
  });
  assert.equal(maximum, 2);
  assert.equal(progressMaximum, 1);
  assert.equal(active, 0);
  assert.deepEqual(result.stages, ['direction', 'background', 'title-material', 'subtitle-backing']);
  assert.deepEqual(result.layers.map(layer => layer.kind), ['background', 'title', 'subtitle-backing']);
});

test('layer failure waits for active jobs and skips layers not yet started', async () => {
  const inputs = await fixture(), mock = await executor(), started = [];
  let active = 0;
  await assert.rejects(runBannerDesign({ prompt: '完整设计', template, model: 'banana_pro', inputs,
    generate: async (body, meta) => {
      started.push(meta.stage);
      active++;
      try {
        if (meta.stage === 'title-material') throw new Error('material failed');
        if (meta.stage === 'background') await new Promise(resolve => setTimeout(resolve, 40));
        return mock.generate(body, meta);
      } finally { active--; }
    },
  }), /material failed/);
  assert.equal(active, 0);
  assert.ok(started.includes('background') && started.includes('title-material'));
  assert.ok(!started.includes('subtitle-backing'));
});

test('invalid mode, sizes and layer requests never reach the provider', async () => {
  const inputs = await fixture();
  for (const altered of [{ mode: 'other' }, { template: { width: -1, height: 100 } }, { model: 'unknown' }, { affectedKinds: ['character'] }, { prompt: '  ' }]) {
    await assert.rejects(runBannerDesign({ mode: 'edit', prompt: '局部修改', template, model: 'banana_pro', inputs, affectedKinds: ['background'], generate: () => assert.fail('invalid request must not generate'), ...altered }));
  }
});

test('explicit no-backing design preserves subtitle while omitting the backing job', async () => {
  const inputs = { ...await fixture(), includeBacking: false }, mock = await executor();
  const result = await runBannerDesign({ prompt: '副标不要底板，主标简洁', template, model: 'banana_pro', inputs, generate: mock.generate });
  assert.deepEqual(result.stages, ['direction', 'background', 'title-material']);
  assert.deepEqual(result.layers.map(layer => layer.kind), ['background', 'title']);
  const direction = mock.calls.find(call => call.stage === 'direction').body.prompt;
  assert.match(direction, /明确不使用副标底板或承托/);
  assert.match(direction, /慧眼识物，有惊喜掉落/);
  assert.match(direction, /主题与字形/);
  assert.match(direction, /语义装饰/);
  assert.match(mock.calls.find(call => call.stage === 'title-material').body.prompt, /公司版权字形蒙版/);
});

test('AI backing suggests contrasting native text from its center, and edit prompt preserves existing text color', async () => {
  const inputs = await fixture();
  inputs.layouts.subtitle = { x: 10, y: 50, width: 120, height: 15, textColor: '#fff5dc' };
  for (const [fill, expected] of [['#fff1d8', '#453627'], ['#34281c', '#fff5dc']]) {
    let request;
    const carrier = await sharp(Buffer.from(`<svg width="240" height="100"><path d="M20 35h200l15 15-15 15H20L5 50z" fill="${fill}"/></svg>`)).png().toBuffer();
    const result = await runBannerDesign({ mode: 'edit', prompt: '改成纸质题签，其它保持', template, model: 'banana_pro', inputs, affectedKinds: ['subtitle-backing'], generate: async body => { request = body; return carrier; } });
    assert.equal(result.layers[0].suggestedTextColor, expected);
    assert.match(request.prompt, /颜色（#fff5dc）和排版保持不变/);
    assert.match(request.prompt, /足够明暗对比/);
    assert.equal(inputs.layouts.subtitle.textColor, '#fff5dc');
  }
});
