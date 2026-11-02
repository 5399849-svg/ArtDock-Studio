import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {createImagePreviews, previewWidth} from '../lib/image-previews.mjs';
import {previewSrc} from '../public/image-preview.js';

async function fixture(t) {
  const runtimeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wb-previews-'));
  const previews = createImagePreviews({runtimeDir, log: {warn() {}}});
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://workbench.test');
    const file = path.join(runtimeDir, ...decodeURIComponent(url.pathname).split('/').filter(Boolean));
    if (!(await previews.serve(req, res, file, url))) { res.writeHead(404); res.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await fs.rm(runtimeDir, {recursive: true, force: true}); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = (rel, headers = {}) => fetch(base + rel, {headers});
  return {runtimeDir, previews, get};
}
// 有细节的图（纯色图压得太小，预览不会比原图小）。
const photo = (width, height, channels = 3) => sharp(Buffer.from(Array.from({length: width * height * channels}, (_, i) => (i * 2654435761 >>> 24) & 255)), {raw: {width, height, channels}});

test('originals carry an ETag and come back as 304 while unchanged', async t => {
  const {runtimeDir, get} = await fixture(t);
  await fs.mkdir(path.join(runtimeDir, 'storage', 't1', 'assets'), {recursive: true});
  await photo(1600, 900).jpeg().toFile(path.join(runtimeDir, 'storage', 't1', 'assets', '主视觉.jpg'));
  const first = await get('/storage/t1/assets/%E4%B8%BB%E8%A7%86%E8%A7%89.jpg');
  assert.equal(first.status, 200);
  assert.equal(first.headers.get('content-type'), 'image/jpeg');
  const etag = first.headers.get('etag');
  assert.ok(etag);
  assert.equal(Number(first.headers.get('content-length')), (await first.arrayBuffer()).byteLength);
  const again = await get('/storage/t1/assets/%E4%B8%BB%E8%A7%86%E8%A7%89.jpg', {'If-None-Match': etag});
  assert.equal(again.status, 304);
  assert.equal((await get('/storage/t1/assets/none.jpg')).status, 404);
});

test('?w= gives a cached WebP whose longest edge is the requested size, never larger than the original', async t => {
  const {runtimeDir, get} = await fixture(t);
  await fs.mkdir(path.join(runtimeDir, 'storage'), {recursive: true});
  const original = path.join(runtimeDir, 'storage', 'tall.png');
  await photo(900, 1600).png().toFile(original);
  const response = await get('/storage/tall.png?w=512');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'image/webp');
  const body = Buffer.from(await response.arrayBuffer());
  const meta = await sharp(body).metadata();
  assert.deepEqual([meta.format, meta.width, meta.height], ['webp', 288, 512]);
  assert.ok(body.length < (await fs.stat(original)).size);
  const etag = response.headers.get('etag');
  assert.match(etag, /-w512"$/);
  assert.equal((await get('/storage/tall.png?w=512', {'If-None-Match': etag})).status, 304);
  const cached = await fs.readdir(path.join(runtimeDir, '.previews'), {recursive: true});
  assert.equal(cached.filter(name => name.endsWith('.webp')).length, 1);
  // 不放大：比原图大的档位给原尺寸。
  const big = await sharp(Buffer.from(await (await get('/storage/tall.png?w=2048')).arrayBuffer())).metadata();
  assert.deepEqual([big.width, big.height], [900, 1600]);
});

test('sizes outside the list, ranges, GIFs and other files get the original', async t => {
  const {runtimeDir, get} = await fixture(t);
  await fs.mkdir(path.join(runtimeDir, 'storage'), {recursive: true});
  await photo(1200, 800).png().toFile(path.join(runtimeDir, 'storage', 'a.png'));
  await photo(400, 300).gif().toFile(path.join(runtimeDir, 'storage', 'motion.gif'));
  await fs.writeFile(path.join(runtimeDir, 'storage', 'notes.json'), '{}');
  for (const query of ['?w=500', '?w=0512', '?w=-1', '?w=abc', '']) assert.equal((await get(`/storage/a.png${query}`)).headers.get('content-type'), 'image/png', query);
  assert.equal((await get('/storage/a.png?w=512', {Range: 'bytes=0-99'})).headers.get('content-type'), 'image/png');
  assert.equal((await get('/storage/motion.gif?w=512')).headers.get('content-type'), 'image/gif');
  assert.equal((await get('/storage/notes.json?w=512')).headers.get('content-type'), 'application/json; charset=utf-8');
  assert.equal(previewWidth('768'), 768);
  assert.equal(previewWidth('700'), null);
});

test('transparency is kept, and a changed original gets a new preview', async t => {
  const {runtimeDir, get} = await fixture(t);
  await fs.mkdir(path.join(runtimeDir, 'storage'), {recursive: true});
  const file = path.join(runtimeDir, 'storage', 'logo.png');
  await photo(1000, 1000, 4).png().toFile(file);
  const first = await get('/storage/logo.png?w=256');
  const meta = await sharp(Buffer.from(await first.arrayBuffer())).metadata();
  assert.equal(meta.hasAlpha, true);
  await photo(800, 1000, 4).png().toFile(file);
  await fs.utimes(file, new Date(), new Date(Date.now() + 5000));
  const second = await get('/storage/logo.png?w=256', {'If-None-Match': first.headers.get('etag')});
  assert.equal(second.status, 200);
  const after = await sharp(Buffer.from(await second.arrayBuffer())).metadata();
  assert.deepEqual([after.width, after.height], [205, 256]);
});

test('the page asks for the size its box needs and only for stored images', () => {
  assert.equal(previewSrc('/storage/t/assets/a.png', 300), '/storage/t/assets/a.png?w=512');
  assert.equal(previewSrc('/storage/t/assets/a.jpg?v=3', 80), '/storage/t/assets/a.jpg?v=3&w=128');
  assert.equal(previewSrc('/storage/t/assets/a.webp', 5000), '/storage/t/assets/a.webp?w=2048');
  for (const url of ['/storage/t/assets/a.gif', '/storage/t/assets/a.psd', '/api/ad-resources/batches/b/items/i/preview', 'blob:http://x/1', 'https://elsewhere/a.png', null]) assert.equal(previewSrc(url, 300), url);
  // 投放成品在小框里用现成的缩略图接口，大框照旧用原图。
  assert.equal(previewSrc('/api/ad-resources/batches/b-1/items/ad-01/versions/2/image', 330), '/api/ad-resources/batches/b-1/items/ad-01/versions/2/thumbnail');
  assert.equal(previewSrc('/api/ad-resources/batches/b-1/items/ad-01/versions/2/image', 900), '/api/ad-resources/batches/b-1/items/ad-01/versions/2/image');
});

// 像设计稿的图（渐变、色块、文字边缘），不是噪点：这样压缩版才会比 PNG 小。
const artwork = (width, height, transparent = false) => sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff7a59"/><stop offset="1" stop-color="#3b5bdb"/></linearGradient></defs>${transparent ? '' : `<rect width="100%" height="100%" fill="url(#g)"/>`}<circle cx="${width / 3}" cy="${height / 2}" r="${height / 3}" fill="#ffd43b"/><text x="40" y="${height - 60}" font-size="${Math.round(height / 6)}" fill="#ffffff" stroke="#c92a2a" stroke-width="6">每日签到 WEEKLY</text></svg>`));

test('images the page shows come compressed at full size; downloads and fetches still get the original', async t => {
  const {runtimeDir, get} = await fixture(t);
  await fs.mkdir(path.join(runtimeDir, 'storage'), {recursive: true});
  await artwork(2400, 1350).png().toFile(path.join(runtimeDir, 'storage', 'kv.png'));
  await artwork(1200, 900, true).png().toFile(path.join(runtimeDir, 'storage', 'title.png'));
  const shown = await get('/storage/kv.png', {'Sec-Fetch-Dest': 'image'});
  assert.equal(shown.headers.get('content-type'), 'image/webp');
  assert.equal(shown.headers.get('vary'), 'Sec-Fetch-Dest');
  assert.match(shown.headers.get('etag'), /-full"$/);
  const body = Buffer.from(await shown.arrayBuffer()), meta = await sharp(body).metadata();
  assert.deepEqual([meta.width, meta.height], [2400, 1350], 'same size, so the editor positions and exports exactly as before');
  assert.ok(body.length < (await fs.stat(path.join(runtimeDir, 'storage', 'kv.png'))).size);
  assert.equal((await get('/storage/kv.png', {'Sec-Fetch-Dest': 'image', 'If-None-Match': shown.headers.get('etag')})).status, 304);
  // A transparent layer keeps its transparency exactly (near-lossless).
  const title = await get('/storage/title.png', {'Sec-Fetch-Dest': 'image'});
  const original = await sharp(path.join(runtimeDir, 'storage', 'title.png')).ensureAlpha().raw().toBuffer({resolveWithObject: true});
  const decoded = await sharp(Buffer.from(await title.arrayBuffer())).ensureAlpha().raw().toBuffer({resolveWithObject: true});
  assert.deepEqual([decoded.info.width, decoded.info.height], [1200, 900]);
  let alphaError = 0;
  for (let i = 3; i < original.data.length; i += 4) alphaError = Math.max(alphaError, Math.abs(original.data[i] - decoded.data[i]));
  assert.ok(alphaError <= 2, `alpha error ${alphaError}`);
  // Downloads, zips and browser compute fetch without Sec-Fetch-Dest: image and get the original.
  for (const headers of [{}, {'Sec-Fetch-Dest': 'empty'}, {'Sec-Fetch-Dest': 'document'}]) {
    const response = await get('/storage/kv.png', headers);
    assert.equal(response.headers.get('content-type'), 'image/png', JSON.stringify(headers));
    assert.equal(response.headers.get('vary'), 'Sec-Fetch-Dest');
  }
});

test('warming converts existing images ahead of time so the first view is served straight from the cache', async t => {
  const {runtimeDir, previews, get} = await fixture(t);
  await fs.mkdir(path.join(runtimeDir, 'storage', 't1'), {recursive: true});
  await artwork(1600, 900).png().toFile(path.join(runtimeDir, 'storage', 't1', 'bg.png'));
  await fs.writeFile(path.join(runtimeDir, 'storage', 't1', 'notes.txt'), 'x');
  assert.equal(await previews.warm(path.join(runtimeDir, 'storage'), {pauseMs: 0}), 1);
  const cached = (await fs.readdir(path.join(runtimeDir, '.previews', 'storage', 't1', 'bg.png'))).filter(name => name.startsWith('full-'));
  assert.equal(cached.length, 1);
  assert.equal(await previews.warm(path.join(runtimeDir, 'storage'), {pauseMs: 0}), 0, 'already done');
  assert.equal((await get('/storage/t1/bg.png', {'Sec-Fetch-Dest': 'image'})).headers.get('content-type'), 'image/webp');
});
