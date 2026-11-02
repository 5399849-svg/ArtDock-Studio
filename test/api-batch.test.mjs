import test from 'node:test';
import assert from 'node:assert/strict';
import {batchedGet} from '../public/api-batch.js';

const recorder = respond => {
  const calls = [];
  const api = async (url, options) => { calls.push({url, method: options?.method || 'GET'}); return respond(url, options); };
  return {api, calls};
};

test('reads issued together go out as one batch and come back in order; one failure stays its own', async () => {
  const {api, calls} = recorder(url => {
    const paths = new URL(url, 'http://wb.test').searchParams.getAll('p');
    return {results: paths.map(path => path === '/api/broken' ? {status: 404, body: {error: '接口不存在'}} : {status: 200, body: {path}})};
  });
  const get = batchedGet(api);
  const [a, b, broken] = await Promise.allSettled([get('/api/store-launch/jobs'), get('/api/icon-launch/specs?x=1'), get('/api/broken')]);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /^\/api\/workbench\/batch\?p=%2Fapi%2Fstore-launch%2Fjobs&p=%2Fapi%2Ficon-launch%2Fspecs%3Fx%3D1&p=%2Fapi%2Fbroken$/);
  assert.deepEqual([a.value, b.value], [{path: '/api/store-launch/jobs'}, {path: '/api/icon-launch/specs?x=1'}]);
  assert.equal(broken.status, 'rejected');
  assert.equal(broken.reason.message, '接口不存在');
});

test('a single read and any write go straight through', async () => {
  const {api, calls} = recorder(url => ({url}));
  const get = batchedGet(api);
  assert.deepEqual(await get('/api/workbench/task-names'), {url: '/api/workbench/task-names'});
  await get('/api/workbench/task-names', {method: 'PUT', body: '{}'});
  assert.deepEqual(calls.map(call => `${call.method} ${call.url}`), ['GET /api/workbench/task-names', 'PUT /api/workbench/task-names']);
});

test('if the batch itself fails (an older server), every read is sent on its own', async () => {
  const {api, calls} = recorder(url => { if (url.startsWith('/api/workbench/batch')) throw new Error('接口不存在'); return {url}; });
  const get = batchedGet(api);
  const results = await Promise.all([get('/api/a'), get('/api/b')]);
  assert.deepEqual(results, [{url: '/api/a'}, {url: '/api/b'}]);
  assert.deepEqual(calls.map(call => call.url), [calls[0].url, '/api/a', '/api/b']);
  assert.match(calls[0].url, /^\/api\/workbench\/batch\?/);
});
