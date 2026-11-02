import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {CHANNEL_SAMPLE_KEY, LEGACY_OWNER, adminAccountIds, adminOnlyRequest, createWorkbenchAccess, currentViewer, requestTaskKey, storageKey, visibleTo} from '../lib/workbench-access.mjs';
import {runWithRequest} from '../platform/request-context.mjs';
import {createRecycleBin} from '../lib/recycle-bin.mjs';
import {createImagePreviews} from '../lib/image-previews.mjs';

// 账号服务的模拟：令牌 → 微光账号编号。
const accounts = {'Bearer member-token-0000000000000000': {account_id: 20, display_name: '组员甲'}, 'Bearer other-token-00000000000000000': {account_id: 21, display_name: '组员乙'}, 'Bearer admin-token-00000000000000000': {account_id: 3, display_name: '管理员'}};
const realFetch = globalThis.fetch;
test.before(() => {
  process.env.DATABASE_URL = 'postgres://test-only';
  process.env.WORKBENCH_ADMIN_ACCOUNT_IDS = '3, 8,14';
  globalThis.fetch = async (url, init) => {
    if (!String(url).endsWith('/api/account/me')) return realFetch(url, init);
    const data = accounts[init?.headers?.Authorization];
    return Response.json(data ? {status: 0, data} : {status: 401}, {status: data ? 200 : 401});
  };
});
test.after(() => { globalThis.fetch = realFetch; delete process.env.DATABASE_URL; delete process.env.WORKBENCH_ADMIN_ACCOUNT_IDS; });
const as = (token, work) => runWithRequest({headers: {authorization: token}}, work);
const MEMBER = 'Bearer member-token-0000000000000000', OTHER = 'Bearer other-token-00000000000000000', ADMIN = 'Bearer admin-token-00000000000000000';
const tempDir = async t => { const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wb-access-')); t.after(() => fs.rm(dir, {recursive: true, force: true})); return dir; };
const uuid = n => `0000000${n}-0000-4000-8000-000000000000`;

test('admins come from WORKBENCH_ADMIN_ACCOUNT_IDS only; a malformed list is an error, not "no admins"', async () => {
  assert.deepEqual([...adminAccountIds('3,8 14，3')], ['3', '8', '14']);
  assert.deepEqual([...adminAccountIds('')], []);
  for (const bad of ['3,abc', '-1', '0', '1.5']) assert.throws(() => adminAccountIds(bad), /WORKBENCH_ADMIN_ACCOUNT_IDS/);
  assert.equal((await as(ADMIN, currentViewer)).admin, true);
  const member = await as(MEMBER, currentViewer);
  assert.deepEqual([member.accountId, member.admin], ['20', false]);
  await assert.rejects(runWithRequest({headers: {}}, currentViewer), error => error.code === 'LOGIN_REQUIRED');
});

test('shared things need an admin; using a project material in your own task does not', () => {
  for (const [method, url] of [['POST', '/api/projects'], ['PATCH', '/api/projects/p1'], ['DELETE', '/api/projects/p1'], ['POST', '/api/projects/p1/design-library/assets'], ['PUT', '/api/projects/p1/design-library/colors'],
    ['PUT', '/api/templates/t1/regions'], ['POST', '/api/templates'], ['PUT', '/api/resource-rules/t1'], ['PUT', '/api/resource-profiles/t1'], ['POST', '/api/categories'], ['POST', '/api/references'],
    ['PATCH', '/api/business-lines/b1'], ['POST', '/api/brands'], ['POST', '/api/company-fonts/import'], ['DELETE', '/api/company-fonts/f1']]) assert.ok(adminOnlyRequest(method, url), `${method} ${url}`);
  for (const [method, url] of [['GET', '/api/projects'], ['GET', '/api/templates'], ['POST', '/api/projects/p1/design-library/assets/a1/use'], ['POST', '/api/projects/p1/design-library/templates/t1/use'],
    ['POST', '/api/tasks'], ['PUT', '/api/tasks/x'], ['GET', '/api/company-fonts']]) assert.equal(adminOnlyRequest(method, url), null, `${method} ${url}`);
});

test('task keys come from the address and from the storage folder; shared folders belong to nobody', () => {
  assert.equal(requestTaskKey(`/api/tasks/${uuid(1)}/assets`), `core:${uuid(1)}`);
  assert.equal(requestTaskKey('/api/ad-resources/batches/b1/items/s1/draft'), 'ad-resources:b1');
  assert.equal(requestTaskKey('/api/store-launch/jobs/j1/generate'), 'store-launch:j1');
  assert.equal(requestTaskKey('/api/tasks'), null);
  assert.equal(storageKey(uuid(1)), `core:${uuid(1)}`);
  assert.equal(storageKey('ad-resources-b1'), 'ad-resources:b1');
  assert.equal(storageKey('icon-preorder-j9'), 'icon-preorder:j9');
  for (const shared of ['projects', 'brands', 'specifications', 'references']) assert.equal(storageKey(shared), null);
  assert.equal(storageKey('something-else'), 'unknown:something-else');
});

test('a member reaches only their own tasks and files; an admin reaches everything', async t => {
  const runtimeDir = await tempDir(t);
  await fs.writeFile(path.join(runtimeDir, 'tasks.json'), JSON.stringify([{id: uuid(1), owner: {accountId: '20', name: '组员甲'}}, {id: uuid(2), owner: {accountId: '21', name: '组员乙'}}, {id: uuid(3)}]));
  await fs.writeFile(path.join(runtimeDir, 'ad-resources-jobs.json'), JSON.stringify([{id: 'b1', owner: {accountId: '21'}}]));
  const access = createWorkbenchAccess({runtimeDir});
  const check = (token, method, url) => as(token, () => access.check({method, headers: {}}, new URL(url, 'http://wb.test')));
  assert.equal(await check(MEMBER, 'GET', `/api/tasks/${uuid(1)}`), null);
  assert.equal(await check(MEMBER, 'PUT', `/api/tasks/${uuid(1)}/assets/a.png/primary`), null);
  assert.equal(await check(MEMBER, 'GET', `/storage/${uuid(1)}/assets/a.png?w=512`), null);
  for (const url of [`/api/tasks/${uuid(2)}`, `/storage/${uuid(2)}/assets/a.png`, `/api/tasks/${uuid(3)}`, '/api/ad-resources/batches/b1', '/storage/ad-resources-b1/asset/x.png', '/storage/unknown-folder/x.png', `/api/tasks/${uuid(9)}`]) {
    assert.equal((await check(MEMBER, 'GET', url))?.status, 404, url);
  }
  assert.equal(await check(MEMBER, 'GET', '/storage/projects/p1/logo.png'), null, 'project materials are shared');
  assert.equal((await check(MEMBER, 'POST', '/api/projects'))?.status, 403);
  assert.equal((await check(MEMBER, 'POST', '/api/projects'))?.body.code, 'ADMIN_REQUIRED');
  for (const url of [`/api/tasks/${uuid(2)}`, '/storage/ad-resources-b1/asset/x.png', `/api/tasks/${uuid(3)}`]) assert.equal(await check(ADMIN, 'GET', url), null, url);
  assert.equal(await check(ADMIN, 'POST', '/api/projects'), null);
  // A record written later (another owner on the same task) is read again because the file changed.
  await fs.writeFile(path.join(runtimeDir, 'tasks.json'), JSON.stringify([{id: uuid(1), owner: {accountId: '21'}}]));
  assert.equal((await check(MEMBER, 'GET', `/api/tasks/${uuid(1)}`))?.status, 404);
  assert.equal(await check(OTHER, 'GET', `/api/tasks/${uuid(1)}`), null);
});

test('lists keep only what the viewer may see; the built-in channel sample belongs to 陈美霞 like the other earlier tasks', async t => {
  const rows = [{id: 'a', owner: {accountId: '20'}}, {id: 'b', owner: {accountId: '21'}}, {id: 'c'}, {id: 'huawei-0922', sample: true, owner: {...LEGACY_OWNER}}];
  assert.deepEqual(rows.filter(visibleTo({accountId: '20', admin: false})).map(row => row.id), ['a']);
  assert.deepEqual(rows.filter(visibleTo({accountId: '14', admin: false})).map(row => row.id), ['huawei-0922']);
  assert.deepEqual(rows.filter(visibleTo({accountId: '3', admin: true})).map(row => row.id), ['a', 'b', 'c', 'huawei-0922']);
  // The sample is not in any record file: its batch, its storage folder and its /channel-sample images all go by LEGACY_OWNER.
  const access = createWorkbenchAccess({runtimeDir: await tempDir(t)});
  const check = (token, url) => as(token, () => access.check({method: 'GET', headers: {}}, new URL(url, 'http://wb.test')));
  for (const url of ['/api/channel-resources/batches/huawei-0922', '/storage/channel-resources-huawei-0922/editor/a.png', '/channel-sample/candidates-v1/01.jpg?w=256']) {
    assert.equal((await check(MEMBER, url))?.status, 404, url);
    assert.equal(await check(ADMIN, url), null, url);
  }
  assert.deepEqual(await access.ownerOf(CHANNEL_SAMPLE_KEY), {found: true, accountId: '14'});
});

test('earlier records go to the legacy owner once; owned records and later runs are left alone', async t => {
  const runtimeDir = await tempDir(t);
  await fs.writeFile(path.join(runtimeDir, 'tasks.json'), JSON.stringify([{id: 't1'}, {id: 't2', owner: {accountId: '20', name: '组员甲'}}]));
  await fs.writeFile(path.join(runtimeDir, 'store-preorder-jobs.json'), JSON.stringify([{id: 's1'}]));
  const access = createWorkbenchAccess({runtimeDir});
  const first = await access.migrateLegacyOwners();
  assert.deepEqual(first, {migrated: true, assigned: {core: 1, 'store-preorder': 1}});
  const tasks = JSON.parse(await fs.readFile(path.join(runtimeDir, 'tasks.json'), 'utf8'));
  assert.deepEqual(tasks.map(task => task.owner.accountId), [LEGACY_OWNER.accountId, '20']);
  assert.equal(LEGACY_OWNER.accountId, '14');
  await fs.writeFile(path.join(runtimeDir, 'tasks.json'), JSON.stringify([...tasks, {id: 't3'}]));
  assert.deepEqual(await access.migrateLegacyOwners(), {migrated: false});
  assert.equal(JSON.parse(await fs.readFile(path.join(runtimeDir, 'tasks.json'), 'utf8')).at(-1).owner, undefined, 'runs only once');
  assert.equal((await access.ownerOf('core:t1')).accountId, '14');
});

test('a permanent delete removes the image, its previews and the emptied task folder', async t => {
  const runtimeDir = await tempDir(t), storageDir = path.join(runtimeDir, 'storage');
  const image = path.join(storageDir, 'p1', 'assets', 'main.png');
  await fs.mkdir(path.dirname(image), {recursive: true});
  await sharp({create: {width: 900, height: 600, channels: 3, background: '#3366cc'}}).png({compressionLevel: 0}).toFile(image);
  const previews = createImagePreviews({runtimeDir, log: {warn() {}}});
  const served = [];
  const res = {writeHead(status) { served.push(status); }, end() {}, on() {}, destroy() {}, write() { return true; }, once() {}, emit() {}};
  await previews.serve({method: 'HEAD', headers: {}}, res, image, new URL('http://wb.test/storage/p1/assets/main.png?w=256'));
  const previewDir = path.join(runtimeDir, '.previews', 'storage', 'p1', 'assets', 'main.png');
  assert.equal((await fs.readdir(previewDir)).length, 1);
  const state = {tasks: [{id: 'p1', assets: [{url: '/storage/p1/assets/main.png'}]}]};
  const bin = await createRecycleBin({runtimeDir, storageDir});
  bin.register('core', {list: () => state.tasks.map(data => ({key: `core:${data.id}`, folder: data.id, data, label: data.id})), drop: async key => { state.tasks = state.tasks.filter(task => `core:${task.id}` !== key); }, restore: async () => {}});
  bin.onFileDeleted(file => previews.forget(file));
  const {id} = await bin.trashTask('core:p1');
  assert.deepEqual(bin.ownerKeysOf([id, 'missing']), [['core:p1'], null]);
  assert.equal((await bin.list(async keys => keys.includes('core:other'))).items.length, 0, 'someone else does not see it');
  assert.equal((await bin.list(async keys => keys.includes('core:p1'))).items.length, 1);
  const plan = await bin.preview({ids: [id]});
  const result = await bin.purge({ids: [id], token: plan.token, requestId: 'purge-with-previews'});
  assert.equal(result.done, true);
  await assert.rejects(fs.access(image));
  await assert.rejects(fs.access(previewDir));
  await assert.rejects(fs.access(path.join(storageDir, 'p1')), 'the emptied task folder goes too');
  await fs.access(storageDir);
});

// 任务刚保存完时几十张缩略图同时来核对主人：共用一次解析，结果都对；文件再变时读到新的主人。
test('many owner checks at once after a save all see the current owners, and a later change is picked up', async t => {
  const runtimeDir = await tempDir(t), file = path.join(runtimeDir, 'tasks.json');
  await fs.writeFile(file, JSON.stringify([{id: 'a', owner: {accountId: '3'}}, {id: 'b', owner: {accountId: '20'}}]));
  const access = createWorkbenchAccess({runtimeDir});
  const results = await Promise.all(Array.from({length: 30}, (_, n) => access.ownerOf(n % 2 ? 'core:a' : 'core:b')));
  assert.ok(results.every((result, n) => result.found && result.accountId === (n % 2 ? '3' : '20')));
  await new Promise(resolve => setTimeout(resolve, 20));
  await fs.writeFile(file, JSON.stringify([{id: 'a', owner: {accountId: '8'}}, {id: 'b', owner: {accountId: '20'}}, {id: 'c', owner: null}]));
  assert.deepEqual(await access.ownerOf('core:a'), {found: true, accountId: '8'});
  assert.deepEqual(await access.ownerOf('core:c'), {found: true, accountId: null});
});
