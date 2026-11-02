import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {configureCanvas, loadCanvasConfig} from '../platform/canvas.mjs';
import {setLocalCompute} from '../platform/local-compute.mjs';
import {runWithRequest} from '../platform/request-context.mjs';
import {submitGeneration} from '../lib/ai-huabu.mjs';

const TOKEN = 'header.payload-for-tests.signature-value';

// 模拟微光账号接口和画布：记录每次请求，按地址返回。
function mockServices(t, routes) {
  const original = globalThis.fetch, calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const key = `${init.method || 'GET'} ${new URL(url).pathname}`;
    calls.push({key, headers: init.headers || {}, body: init.body ? JSON.parse(init.body) : null});
    if (key === 'GET /api/account/me') return Response.json({status: 0, data: {account_id: 1001, display_name: '设计师甲'}});
    const handler = routes[key];
    if (!handler) throw new Error(`unexpected ${key}`);
    return Response.json(handler(calls.at(-1)));
  };
  t.after(() => { globalThis.fetch = original; });
  return calls;
}

async function workspace(t, project = {id: 'p1', name: '《寻道大千》', gameTagId: 27}) {
  const runtimeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wb-canvas-'));
  await fs.writeFile(path.join(runtimeDir, 'projects.json'), JSON.stringify([project]));
  configureCanvas({runtimeDir});
  t.after(() => fs.rm(runtimeDir, {recursive: true, force: true}));
  return runtimeDir;
}

const asUser = work => runWithRequest({headers: {authorization: `Bearer ${TOKEN}`}}, work);
const answering = accepted => setLocalCompute({ask: async prompt => ({accepted, prompt})});

test('without the user’s own login no canvas call is possible, and the error keeps paid jobs resumable', async t => {
  await workspace(t);
  await runWithRequest({headers: {}}, async () => {
    await assert.rejects(() => loadCanvasConfig({projectId: 'p1'}), error => error.status === 401 && error.code === 'LOGIN_REQUIRED' && error.editStatus === 'result_uncertain');
  });
});

test('one attributed canvas per user and game is created once and reused; submissions carry the user token', async t => {
  await workspace(t);
  answering(true);
  let created = 0;
  const calls = mockServices(t, {
    'POST /api/canvas-backend/estimate': () => ({status: 0, data: {point_cost: 12, balance: 300, sufficient: true}}),
    'POST /api/canvas-backend/canvases': () => ({status: 0, data: {canvas_id: `c${++created}`}}),
    'POST /api/canvas-backend/generate': () => ({status: 0, data: {job_id: 'j1'}}),
  });
  await asUser(async () => {
    const config = await loadCanvasConfig({projectId: 'p1'});
    assert.equal(config.accountId, '1001');
    assert.equal(config.gameTagId, 27);
    for (let i = 0; i < 2; i++) assert.equal(await submitGeneration(config, {model: 'banana_pro', canvas_id: 'someone-elses-canvas'}, {idempotencyKey: `k${i}`}), 'j1');
  });
  assert.equal(created, 1);
  const create = calls.find(call => call.key === 'POST /api/canvas-backend/canvases');
  assert.equal(create.body.game_tag_id, 27);
  const submits = calls.filter(call => call.key === 'POST /api/canvas-backend/generate');
  assert.deepEqual(submits.map(call => call.body.canvas_id), ['c1', 'c1']);
  assert.ok(submits.every(call => call.headers.Authorization === `Bearer ${TOKEN}`));
});

test('a project without a game blocks generation before anything is charged', async t => {
  await workspace(t, {id: 'p1', name: '《时光大爆炸》'});
  answering(true);
  const calls = mockServices(t, {});
  await asUser(async () => {
    const config = await loadCanvasConfig({projectId: 'p1'});
    await assert.rejects(() => submitGeneration(config, {model: 'banana_pro'}), error => error.code === 'PROJECT_GAME_REQUIRED' && /《时光大爆炸》/.test(error.message));
  });
  assert.ok(!calls.some(call => call.key.includes('/generate')));
});

test('a deleted canvas is recreated and the same idempotency key is resubmitted once', async t => {
  await workspace(t);
  answering(true);
  let created = 0, submitted = 0;
  const calls = mockServices(t, {
    'POST /api/canvas-backend/estimate': () => ({status: 0, data: {point_cost: 12, balance: 300, sufficient: true}}),
    'POST /api/canvas-backend/canvases': () => ({status: 0, data: {canvas_id: `c${++created}`}}),
    'POST /api/canvas-backend/canvases/c1/restore': () => ({status: 1, code: 404, msg: 'gone'}),
    'POST /api/canvas-backend/generate': () => (++submitted === 1 ? {status: 1, code: 403, msg: 'not editor'} : {status: 0, data: {job_id: 'j2'}}),
  });
  await asUser(async () => assert.equal(await submitGeneration(await loadCanvasConfig('p1'), {model: 'banana_pro'}, {idempotencyKey: 'same-key'}), 'j2'));
  const submits = calls.filter(call => call.key === 'POST /api/canvas-backend/generate');
  assert.deepEqual(submits.map(call => [call.body.canvas_id, call.headers['Idempotency-Key']]), [['c1', 'same-key'], ['c2', 'same-key']]);
});

test('the user sees the price first: insufficient credits or declining never submits', async t => {
  await workspace(t);
  let balance = 5;
  const calls = mockServices(t, {
    'POST /api/canvas-backend/estimate': () => ({status: 0, data: {point_cost: 12, balance, sufficient: balance >= 12}}),
    'POST /api/canvas-backend/canvases': () => ({status: 0, data: {canvas_id: 'c1'}}),
    'POST /api/canvas-backend/generate': () => ({status: 0, data: {job_id: 'never'}}),
  });
  answering(true);
  await asUser(async () => assert.rejects(async () => submitGeneration(await loadCanvasConfig('p1'), {model: 'banana_pro'}), error => error.code === 'CANVAS_CREDITS_LOW' && error.status === 402));
  balance = 300;
  answering(false);
  await asUser(async () => assert.rejects(async () => submitGeneration(await loadCanvasConfig('p1'), {model: 'banana_pro'}), error => error.code === 'CANVAS_COST_DECLINED' && error.materialStatus === 'failed'));
  assert.ok(!calls.some(call => call.key === 'POST /api/canvas-backend/generate'));
});
