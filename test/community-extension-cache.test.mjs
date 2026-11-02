import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { readCommunityExtensionCache, writeCommunityExtensionCache } from '../lib/community-extension-cache.mjs';

const hash = input => createHash('sha256').update(input).digest('hex');

async function fixture(t) {
  const runtime = await fs.mkdtemp(path.join(os.tmpdir(), 'community-extension-cache-'));
  t.after(() => fs.rm(runtime, { recursive: true, force: true }));
  const source = Buffer.from('approved-master-exact-pixels');
  const generated = Buffer.from('already-downloaded-extension');
  const identity = {
    taskId: 'task-1', templateId: 'community-one', sourceMasterFingerprint: 'approved-v2',
    sourceSha256: hash(source), model: 'gpt-image-2',
  };
  const record = {
    jobId: 'job-123', format: 'png', preparedSourceRect: { x: 0, y: .25, width: 1, height: .5 },
    sourceWidth: 1800, sourceHeight: 766, targetWidth: 1968, targetHeight: 668,
  };
  const directory = path.join(runtime, 'registration', record.jobId);
  await fs.mkdir(directory, { recursive: true });
  const sourcePath = path.join(directory, 'confirmed-master.png');
  const generatedPath = path.join(directory, 'extended.png');
  await Promise.all([fs.writeFile(sourcePath, source), fs.writeFile(generatedPath, generated)]);
  const cachePath = () => path.join(runtime, 'community-extension-cache', `${hash(JSON.stringify(identity))}.json`);
  return { runtime, source, generated, identity, record, sourcePath, generatedPath, cachePath };
}

test('downloaded extension survives a registration failure and is read without another generation', async t => {
  const f = await fixture(t);
  assert.equal(await readCommunityExtensionCache(f.runtime, f.identity), null);
  await writeCommunityExtensionCache(f.runtime, f.identity, f.record);
  const hit = await readCommunityExtensionCache(f.runtime, f.identity);
  assert.deepEqual(hit.record, f.record);
  assert.deepEqual(hit.buffer, f.generated);
  assert.equal(hit.sourcePath, f.sourcePath);
  assert.equal(hit.generatedPath, f.generatedPath);
  const persisted = JSON.parse(await fs.readFile(f.cachePath(), 'utf8'));
  assert.equal(persisted.generatedSha256, hash(f.generated));
  assert.equal(persisted.sourceRelativePath, 'registration/job-123/confirmed-master.png');
  assert.equal(persisted.generatedRelativePath, 'registration/job-123/extended.png');
  assert.ok(!JSON.stringify(persisted).includes(f.runtime));
});

test('task, target, approved master, source bytes and model each invalidate the cache identity', async t => {
  const f = await fixture(t);
  await writeCommunityExtensionCache(f.runtime, f.identity, f.record);
  for (const [field, value] of [
    ['taskId', 'task-2'], ['templateId', 'community-two'], ['sourceMasterFingerprint', 'approved-v3'],
    ['sourceSha256', hash('new-source')], ['model', 'banana_pro'],
  ]) assert.equal(await readCommunityExtensionCache(f.runtime, { ...f.identity, [field]: value }), null, field);
  const reorderedIdentity = Object.fromEntries(Object.entries(f.identity).reverse());
  assert.deepEqual((await readCommunityExtensionCache(f.runtime, reorderedIdentity)).buffer, f.generated);
});

test('job paths and formats reject traversal before any cache write', async t => {
  const f = await fixture(t);
  for (const jobId of ['../outside', '..\\outside', 'job/123', 'job\\123', '.', '', 123]) {
    await assert.rejects(writeCommunityExtensionCache(f.runtime, f.identity, { ...f.record, jobId }), { code: 'INVALID_COMMUNITY_EXTENSION_CACHE' });
  }
  for (const format of ['../png', 'png/other', 'gif', 'PNG', '', null]) {
    await assert.rejects(writeCommunityExtensionCache(f.runtime, f.identity, { ...f.record, format }), { code: 'INVALID_COMMUNITY_EXTENSION_CACHE' });
  }
  await assert.rejects(fs.access(path.dirname(f.cachePath())), { code: 'ENOENT' });
});

test('cache cannot be created for source bytes different from the confirmed master', async t => {
  const f = await fixture(t);
  await fs.writeFile(f.sourcePath, 'different-master');
  await assert.rejects(writeCommunityExtensionCache(f.runtime, f.identity, f.record), /确认母版与本次源图不一致/);
});

test('tampered or missing saved image files stop retry instead of becoming a cache miss', async t => {
  for (const type of ['source', 'generated', 'missing-generated']) {
    const f = await fixture(t);
    await writeCommunityExtensionCache(f.runtime, f.identity, f.record);
    if (type === 'missing-generated') await fs.unlink(f.generatedPath);
    else await fs.writeFile(type === 'source' ? f.sourcePath : f.generatedPath, 'tampered');
    await assert.rejects(readCommunityExtensionCache(f.runtime, f.identity), { code: 'INVALID_COMMUNITY_EXTENSION_CACHE' }, type);
  }
});

test('tampered cache JSON, identity, hashes and relative paths stop retry', async t => {
  for (const type of ['json', 'identity', 'hash', 'path', 'record']) {
    const f = await fixture(t);
    await writeCommunityExtensionCache(f.runtime, f.identity, f.record);
    const persisted = JSON.parse(await fs.readFile(f.cachePath(), 'utf8'));
    if (type === 'identity') persisted.identity.model = 'another-provider';
    if (type === 'hash') persisted.generatedSha256 = 'not-a-hash';
    if (type === 'path') persisted.generatedRelativePath = '../outside.png';
    if (type === 'record') persisted.record.preparedSourceRect.width = 2;
    await fs.writeFile(f.cachePath(), type === 'json' ? 'broken JSON' : JSON.stringify(persisted));
    await assert.rejects(readCommunityExtensionCache(f.runtime, f.identity), { code: 'INVALID_COMMUNITY_EXTENSION_CACHE' }, type);
  }
});

test('source rectangles and dimensions are validated before indexing', async t => {
  const f = await fixture(t);
  for (const delta of [
    { sourceWidth: 0 }, { targetHeight: 1.5 }, { sourceHeight: Infinity },
    { preparedSourceRect: { x: -.1, y: 0, width: 1, height: 1 } },
    { preparedSourceRect: { x: 0, y: 0, width: 0, height: 1 } },
    { preparedSourceRect: { x: 0, y: 0, width: '1', height: 1 } },
  ]) await assert.rejects(writeCommunityExtensionCache(f.runtime, f.identity, { ...f.record, ...delta }), { code: 'INVALID_COMMUNITY_EXTENSION_CACHE' });
});

test('empty downloaded result is not indexed', async t => {
  const f = await fixture(t);
  await fs.writeFile(f.generatedPath, Buffer.alloc(0));
  await assert.rejects(writeCommunityExtensionCache(f.runtime, f.identity, f.record), /图片为空/);
});

test('versioned registration validation roundtrips without changing downloaded image bytes', async t => {
  const f = await fixture(t);
  for (const validation of [
    { version: 'registration-v2', status: 'failed', reason: '有效匹配点不足' },
    { version: 'registration-v3', status: 'passed' },
  ]) {
    await writeCommunityExtensionCache(f.runtime, f.identity, { ...f.record, validation });
    const hit = await readCommunityExtensionCache(f.runtime, f.identity);
    assert.deepEqual(hit.record.validation, validation);
    assert.deepEqual(hit.buffer, f.generated);
  }
  for (const validation of [
    null, { version: '', status: 'passed' }, { version: 'v'.repeat(81), status: 'passed' },
    { version: 'v1', status: 'unknown' }, { version: 'v1', status: 'failed', reason: 'x'.repeat(501) },
  ]) await assert.rejects(writeCommunityExtensionCache(f.runtime, f.identity, { ...f.record, validation }), { code: 'INVALID_COMMUNITY_EXTENSION_CACHE' });
});

test('registration junctions cannot read or index files outside the runtime directory', async t => {
  const f = await fixture(t);
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'community-extension-outside-'));
  t.after(() => fs.rm(outside, { recursive: true, force: true }));
  await Promise.all([
    fs.writeFile(path.join(outside, 'confirmed-master.png'), f.source),
    fs.writeFile(path.join(outside, 'extended.png'), f.generated),
  ]);
  const linkedJob = path.join(f.runtime, 'registration', 'linked-job');
  try {
    await fs.symlink(outside, linkedJob, process.platform === 'win32' ? 'junction' : 'dir');
  } catch (error) {
    if (error.code === 'EPERM' || error.code === 'ENOTSUP') return t.skip('directory links unavailable');
    throw error;
  }
  await assert.rejects(writeCommunityExtensionCache(f.runtime, f.identity, { ...f.record, jobId: 'linked-job' }), /文件路径超出运行目录/);
  await writeCommunityExtensionCache(f.runtime, f.identity, f.record);
  const persisted = JSON.parse(await fs.readFile(f.cachePath(), 'utf8'));
  persisted.record.jobId = 'linked-job';
  persisted.sourceRelativePath = 'registration/linked-job/confirmed-master.png';
  persisted.generatedRelativePath = 'registration/linked-job/extended.png';
  await fs.writeFile(f.cachePath(), JSON.stringify(persisted));
  await assert.rejects(readCommunityExtensionCache(f.runtime, f.identity), /文件路径超出运行目录/);
});
