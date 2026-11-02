import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { assessCharacterTransparency, removeConnectedWhiteBackground, prepareCharacterAssets, replaceCharacterAsset } from '../lib/character-preflight.mjs';
import { extractTaskPsdAssets } from '../lib/task-psd-assets.mjs';

function characterPixels({ transparent = false, alpha = 255, textured = false } = {}) {
  const width = 60, height = 60, data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    const outline = x >= 10 && x <= 49 && y >= 10 && y <= 49;
    const enclosedWhite = x >= 15 && x <= 44 && y >= 15 && y <= 44;
    const value = textured && !outline ? (x % 2 ? 210 : 245) : outline && !enclosedWhite ? 35 : 255;
    data[i] = data[i + 1] = data[i + 2] = value;
    data[i + 3] = transparent && !outline ? 0 : alpha;
  }
  return { data, width, height, channels: 4 };
}
const png = fixture => sharp(fixture.data, { raw: fixture }).png().toBuffer();

test('nominal RGBA all-opaque image requires a cutout; enclosed white horns, eyes and book survive', async () => {
  const input = await png(characterPixels());
  const report = await assessCharacterTransparency(input);
  assert.equal(report.actualTransparency, false);
  assert.equal(report.needsCutout, true);
  assert.equal(report.safeWhiteBackground, true);
  const result = await removeConnectedWhiteBackground(input);
  const raw = await sharp(result.buffer).ensureAlpha().raw().toBuffer();
  assert.equal(raw[(0 * 60 + 0) * 4 + 3], 0);
  assert.equal(raw[(12 * 60 + 12) * 4 + 3], 255);
  assert.equal(raw[(30 * 60 + 30) * 4 + 3], 255);
  assert.equal(raw[(30 * 60 + 30) * 4], 255);
  assert.equal((await assessCharacterTransparency(result.buffer)).needsCutout, false);
});

test('real transparent image with near-opaque foreground is already ready', async () => {
  const report = await assessCharacterTransparency(await png(characterPixels({ transparent: true, alpha: 253 })));
  assert.equal(report.status, 'ready');
  assert.equal(report.safeWhiteBackground, false);
});

test('colored or textured background is flagged rather than indiscriminately removed', async () => {
  const textured = await assessCharacterTransparency(await png(characterPixels({ textured: true })));
  assert.equal(textured.needsCutout, true);
  assert.equal(textured.safeWhiteBackground, false);
  const coloredPixels = characterPixels();
  for (let i = 0; i < coloredPixels.data.length; i += 4) if (coloredPixels.data[i] === 255) coloredPixels.data[i + 1] = 175;
  const colored = await assessCharacterTransparency(await png(coloredPixels));
  assert.equal(colored.safeWhiteBackground, false);
});

test('empty transparent canvas and tiny stray alpha are not treated as usable cutouts', async () => {
  const empty = characterPixels();
  for (let i = 3; i < empty.data.length; i += 4) empty.data[i] = 0;
  assert.equal((await assessCharacterTransparency(await png(empty))).needsCutout, true);
  const stray = characterPixels(); stray.data[3] = 0;
  const report = await assessCharacterTransparency(await png(stray));
  assert.equal(report.needsCutout, true);
  assert.equal(report.safeWhiteBackground, false);
});

test('transparent outer margin cannot disguise an opaque white panel as a cutout', async () => {
  const fixture = characterPixels();
  for (let y = 0; y < 60; y++) for (let x = 0; x < 60; x++) if (x < 3 || x >= 57 || y < 3 || y >= 57) fixture.data[(y * 60 + x) * 4 + 3] = 0;
  const report = await assessCharacterTransparency(await png(fixture));
  assert.equal(report.needsCutout, true);
  assert.equal(report.safeWhiteBackground, false);
  assert.equal(report.reason, 'transparent-margin-with-opaque-white-panel');
});

test('replacement archives source and preserves layout, visibility, flips and effects', () => {
  const layout = { t1: { character: { x: 12, y: 30, width: 220, height: 400, visible: false, flipX: true, effects: { stroke: { width: 2 } } } } };
  const task = { assets: [{ name: 'a.png', role: 'character' }, { name: 'b.png', role: 'character' }, { name: 'cutout.png', role: 'supplement' }], targetTemplateIds: ['t1', 't2'], masterTemplateId: 'master',
    parameters: { layoutByTemplate: structuredClone(layout), assetByTemplate: { t1: { character: 'a.png', character2: 'b.png', background: 'bg.png' }, old: { character: 'a.png' } } } };
  replaceCharacterAsset(task, 'a.png', 'cutout.png');
  assert.deepEqual(task.parameters.layoutByTemplate, layout);
  assert.equal(task.parameters.assetByTemplate.t1.character, 'cutout.png');
  assert.equal(task.parameters.assetByTemplate.t2.character, 'cutout.png');
  assert.equal(task.parameters.assetByTemplate.master.character, 'cutout.png');
  assert.equal(task.parameters.assetByTemplate.old.character, 'cutout.png');
  assert.equal(task.parameters.assetByTemplate.t1.character2, 'b.png');
  assert.equal(task.parameters.assetByTemplate.t1.background, 'bg.png');
  assert.equal(task.assets.find(asset => asset.name === 'a.png').role, 'source-character');
  assert.deepEqual(task.assets.filter(asset => asset.role === 'character').map(asset => asset.name), ['cutout.png', 'b.png']);
});

test('automatic import retains original bytes, prepares safe white derivative and preserves transparent input', async () => {
  const storageDir = await fs.mkdtemp(path.join(os.tmpdir(), 'character-preflight-'));
  try {
    const directory = path.join(storageDir, 'fixture', 'assets'); await fs.mkdir(directory, { recursive: true });
    const opaque = await png(characterPixels()), ready = await png(characterPixels({ transparent: true }));
    await fs.writeFile(path.join(directory, 'opaque.png'), opaque);
    await fs.writeFile(path.join(directory, 'ready.png'), ready);
    const task = { id: 'fixture', targetTemplateIds: ['t1'], assets: [{ name: 'opaque.png', role: 'character' }, { name: 'ready.png', role: 'character' }],
      parameters: { layoutByTemplate: { t1: { character: { x: 7, y: 10, scale: 145 } } } } };
    const added = await prepareCharacterAssets({ storageDir, task, assets: task.assets });
    assert.equal(added.length, 1);
    assert.deepEqual(await fs.readFile(path.join(directory, 'opaque.png')), opaque);
    assert.deepEqual(await fs.readFile(path.join(directory, 'ready.png')), ready);
    assert.equal(task.assets.find(asset => asset.name === 'ready.png').cutoutPreflight.status, 'ready');
    assert.equal(task.parameters.assetByTemplate.t1.character, added[0].name);
    assert.deepEqual(task.parameters.layoutByTemplate.t1.character, { x: 7, y: 10, scale: 145 });
    assert.equal(added[0].width, 60);
    assert.equal(added[0].height, 60);
  } finally { await fs.rm(storageDir, { recursive: true, force: true }); }
});

test('cached PSD extraction receives the same preflight without re-running Photoshop parsing', async () => {
  const storageDir = await fs.mkdtemp(path.join(os.tmpdir(), 'psd-character-preflight-'));
  try {
    const directory = path.join(storageDir, 'fixture', 'assets'); await fs.mkdir(directory, { recursive: true });
    const sourceBuffer = Buffer.from('cached source fixture');
    const hash = createHash('sha256').update(sourceBuffer).update('visible-groups-v1').digest('hex');
    await fs.writeFile(path.join(directory, 'source.psb'), sourceBuffer);
    await fs.writeFile(path.join(directory, 'layer.png'), await png(characterPixels()));
    const source = { name: 'source.psb', role: 'source-psd' };
    const task = { id: 'fixture', targetTemplateIds: ['t1'], assets: [source, { name: 'layer.png', role: 'character', psdSourceHash: hash }] };
    const outputs = await extractTaskPsdAssets({ root: storageDir, storageDir, task, source });
    assert.equal(outputs.length, 2);
    assert.equal(source.psdExtraction.status, 'done');
    assert.equal(task.assets.find(asset => asset.name === 'layer.png').role, 'source-character');
    assert.equal(task.assets.filter(asset => asset.role === 'character').length, 1);
    assert.equal(task.assets.find(asset => asset.role === 'character').transparent, true);
  } finally { await fs.rm(storageDir, { recursive: true, force: true }); }
});
