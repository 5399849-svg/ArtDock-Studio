import test from 'node:test';
import assert from 'node:assert/strict';
import { isRenderableImageAsset, preferredSourceAsset, loadEditorImages } from '../public/editor-image-source.js';

const asset = (name, role = 'supplement', mime = 'image/png') => ({ name, role, mime, url: `/assets/${name}` });

test('Photoshop documents are retained as source files, never selected for browser decoding', async () => {
  const psb = asset('character.psb', 'master', 'image/vnd.adobe.photoshop');
  const png = asset('preview.png');
  const task = { assets: [psb, png], primaryAssetName: psb.name };
  const requested = [];
  const result = await loadEditorImages(task, async url => { requested.push(url); return { url }; });
  assert.equal(preferredSourceAsset(task), png);
  assert.deepEqual(requested, [png.url]);
  assert.equal(result.sourceAsset, png);
  assert.equal(isRenderableImageAsset(asset('source.psd', 'background', 'image/png')), false);
});

test('unreadable primary image falls back without blocking the editor', async () => {
  const broken = asset('broken.png', 'background');
  const fallback = asset('usable.webp', 'master', 'image/webp');
  const result = await loadEditorImages({ assets: [broken, fallback] }, async url => {
    if (url === broken.url) throw Error('decode failed');
    return { url };
  });
  assert.equal(result.sourceAsset, fallback);
  assert.equal(result.assetImages.has(broken.name), false);
});

test('Photoshop-only and empty tasks can enter an editor without a raster preview', async () => {
  for (const assets of [[], [asset('only.psb', 'master', 'image/vnd.adobe.photoshop')]]) {
    const result = await loadEditorImages({ assets }, () => { throw Error('must not load Photoshop'); });
    assert.equal(result.sourceImage, null);
    assert.equal(result.sourceAsset, null);
    assert.equal(result.assetImages.size, 0);
  }
});

test('explicit background and orientation precedence are preserved', () => {
  const landscape = asset('landscape.jpg', 'background-landscape', 'image/jpeg');
  const portrait = asset('portrait.jpg', 'background-portrait', 'image/jpeg');
  const task = { assets: [landscape, portrait], masterCanvasId: 'portrait-1080x1920' };
  assert.equal(preferredSourceAsset(task), portrait);
  assert.equal(preferredSourceAsset({ ...task, primaryAssetName: landscape.name }), landscape);
});

test('extracted character stays an independent layer and is never used as the background', async () => {
  const character = { ...asset('角色.png', 'character'), psdSourceHash: 'source-hash' };
  const result = await loadEditorImages({ assets: [character] }, async () => ({ naturalWidth: 100, naturalHeight: 200 }));
  assert.equal(result.sourceImage, null);
  assert.equal(result.sourceAsset, null);
  assert.ok(result.assetImages.has(character.name));
});

test('independent PNG exports load lazily unless explicitly used on a canvas', async () => {
  const background=asset('scene.png','background'),cutout={...asset('cutout.png','community-object-character'),objectRunId:'extract-1'};
  const requested=[];
  const first=await loadEditorImages({assets:[background,cutout]},async url=>{requested.push(url);return {url};});
  assert.deepEqual(requested,[background.url]);
  assert.equal(first.assetImages.has(cutout.name),false);
  const bound=await loadEditorImages({assets:[background,cutout],parameters:{assetByTemplate:{master:{character:cutout.name}}}},async url=>({url}));
  assert.ok(bound.assetImages.has(cutout.name));
  assert.equal(bound.sourceAsset,background);
});
