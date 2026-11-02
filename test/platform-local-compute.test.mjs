import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createLocalCompute} from '../platform/local-compute.mjs';
import {runWithRequest} from '../platform/request-context.mjs';

// 本机模式（没有 DATABASE_URL）下页面和服务器都按 local 账号对上。
async function setup(t) {
  delete process.env.DATABASE_URL;
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'wb-compute-'));
  const runtimeDir = path.join(root, 'data', 'runtime');
  await fs.mkdir(path.join(runtimeDir, 'storage', 'task'), {recursive: true});
  await fs.mkdir(path.join(root, 'scripts'), {recursive: true});
  await fs.writeFile(path.join(root, 'scripts', 'demo.py'), 'print("hi")\n');
  const compute = createLocalCompute({root, runtimeDir});
  const server = http.createServer((req, res) => runWithRequest(req, () => compute.handle(req, res, new URL(req.url, 'http://x'))));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await fs.rm(root, {recursive: true, force: true}); });
  return {root, runtimeDir, compute, base};
}

const next = async base => (await (await fetch(`${base}/api/local-compute/next?wait=2000`)).json()).job;

test('a Python step becomes a browser job; only declared result locations can be written and the caller gets stdout', async t => {
  const {root, runtimeDir, compute, base} = await setup(t);
  const input = path.join(runtimeDir, 'storage', 'task', 'in.png');
  const output = path.join(runtimeDir, 'storage', 'task', 'out.png');
  await fs.writeFile(input, 'source-bytes');
  const running = runWithRequest({headers: {}}, () => compute.runPython(path.join(root, 'scripts', 'demo.py'), ['--input', input, '--output', output, '--max-side', '1600']));
  const job = await next(base);
  assert.equal(job.kind, 'python');
  assert.equal(job.script, '/wb/scripts/demo.py');
  assert.deepEqual(job.args, ['--input', '/wb-runtime/storage/task/in.png', '--output', '/wb-runtime/storage/task/out.png', '--max-side', '1600']);
  assert.deepEqual(job.inputs.map(item => item.path), ['/wb-runtime/storage/task/in.png']);
  const headers = {'X-Compute-Claim': job.claim};
  assert.equal(await (await fetch(`${base}/api/local-compute/jobs/${job.id}/input/0`, {headers})).text(), 'source-bytes');
  const outside = await fetch(`${base}/api/local-compute/jobs/${job.id}/file?path=${encodeURIComponent('/wb/server.mjs')}`, {method: 'PUT', headers, body: 'x'});
  assert.equal(outside.status, 422);
  assert.equal((await fetch(`${base}/api/local-compute/jobs/${job.id}/file?path=${encodeURIComponent('/wb-runtime/storage/task/out.png')}`, {method: 'PUT', headers, body: 'result'})).status, 200);
  const wrongClaim = await fetch(`${base}/api/local-compute/jobs/${job.id}/done`, {method: 'POST', headers: {'X-Compute-Claim': 'other'}, body: '{}'});
  assert.equal(wrongClaim.status, 409);
  await fetch(`${base}/api/local-compute/jobs/${job.id}/done`, {method: 'POST', headers, body: JSON.stringify({exitCode: 0, stdout: '{"ok":true}\n', stderr: ''})});
  assert.deepEqual(await running, {stdout: '{"ok":true}\n', stderr: ''});
  assert.equal(await fs.readFile(output, 'utf8'), 'result');
});

test('an existing output file can be overwritten by a re-run, and a failed run rejects with stderr like execFile', async t => {
  const {root, runtimeDir, compute, base} = await setup(t);
  const output = path.join(runtimeDir, 'storage', 'task', 'cutout.png');
  await fs.writeFile(output, 'old');
  const outcome = runWithRequest({headers: {}}, () => compute.runPython(path.join(root, 'scripts', 'demo.py'), ['--output', output])).then(() => null, error => error);
  const job = await next(base);
  assert.ok(job.outputRoots.includes('/wb-runtime/storage/task/cutout.png'));
  const headers = {'X-Compute-Claim': job.claim};
  await fetch(`${base}/api/local-compute/jobs/${job.id}/file?path=${encodeURIComponent('/wb-runtime/storage/task/cutout.png')}`, {method: 'PUT', headers, body: 'new'});
  await fetch(`${base}/api/local-compute/jobs/${job.id}/done`, {method: 'POST', headers, body: JSON.stringify({exitCode: 2, stdout: '', stderr: 'Traceback\nValueError: bad prompt'})});
  const error = await outcome;
  assert.ok(error.stderr.includes('ValueError: bad prompt') && /bad prompt/.test(error.message));
  assert.equal(await fs.readFile(output, 'utf8'), 'new');
});

test('paths inside JSON argument files are mapped and the referenced files are sent as inputs', async t => {
  const {root, runtimeDir, compute, base} = await setup(t);
  const font = path.join(runtimeDir, 'fonts', 'a.ttf');
  await fs.mkdir(path.dirname(font), {recursive: true});
  await fs.writeFile(font, 'font');
  const options = path.join(runtimeDir, 'storage', 'task', 'options.json');
  await fs.writeFile(options, JSON.stringify({fontFile: font, size: 3}));
  const outcome = runWithRequest({headers: {}}, () => compute.runPython(path.join(root, 'scripts', 'demo.py'), [options])).then(() => null, error => error);
  const job = await next(base);
  const headers = {'X-Compute-Claim': job.claim};
  const sent = JSON.parse(await (await fetch(`${base}/api/local-compute/jobs/${job.id}/input/${job.inputs.find(item => item.path.endsWith('options.json')).n}`, {headers})).text());
  assert.deepEqual(sent, {fontFile: '/wb-runtime/fonts/a.ttf', size: 3});
  assert.ok(job.inputs.some(item => item.path === '/wb-runtime/fonts/a.ttf'));
  await fetch(`${base}/api/local-compute/jobs/${job.id}/fail`, {method: 'POST', headers, body: JSON.stringify({cancelled: true})});
  assert.equal((await outcome).code, 'LOCAL_COMPUTE_CANCELLED');
});

test('a confirmation is answered by the page; declining or accepting resolves the waiting step', async t => {
  const {compute, base} = await setup(t);
  for (const accepted of [true, false]) {
    const asking = runWithRequest({headers: {}}, () => compute.ask({kind: 'canvas-cost', model: 'banana_pro', pointCost: 12, balance: 100}));
    const job = await next(base);
    assert.equal(job.kind, 'prompt');
    assert.equal(job.prompt.pointCost, 12);
    await fetch(`${base}/api/local-compute/jobs/${job.id}/answer`, {method: 'POST', headers: {'X-Compute-Claim': job.claim}, body: JSON.stringify({accepted})});
    assert.deepEqual(await asking, {accepted});
  }
});

test('the long poll waits instead of returning at once when there is no job', async t => {
  const {base} = await setup(t);
  const started = Date.now();
  const response = await (await fetch(`${base}/api/local-compute/next?wait=600`)).json();
  assert.equal(response.job, null);
  assert.ok(Date.now() - started >= 500, 'next returned before the wait time');
});

// 大的输入（例如刚上传的 PSD）带内容摘要：页面手里有同样的文件就不再下载（public/platform/local-compute/client.mjs）。
test('large inputs carry a content digest so the page can reuse a file it just uploaded; inputs stream in full', async t => {
  const {root, runtimeDir, compute, base} = await setup(t);
  const {createHash} = await import('node:crypto');
  const big = path.join(runtimeDir, 'storage', 'task', 'source.psd'), small = path.join(runtimeDir, 'storage', 'task', 'logo.png');
  const bytes = Buffer.alloc(1024 * 1024 + 7, 7);bytes[100] = 1;
  await fs.writeFile(big, bytes);await fs.writeFile(small, 'tiny');
  const running = runWithRequest({headers: {}}, () => compute.runPython(path.join(root, 'scripts', 'demo.py'), ['--source', big, '--logo', small]));
  const job = await next(base);
  const [psd, logo] = job.inputs;
  assert.equal(psd.size, bytes.length);assert.equal(psd.sha256, createHash('sha256').update(bytes).digest('hex'));
  assert.equal(logo.sha256, undefined, 'small files are just downloaded');
  const headers = {'X-Compute-Claim': job.claim};
  const served = Buffer.from(await (await fetch(`${base}/api/local-compute/jobs/${job.id}/input/0`, {headers})).arrayBuffer());
  assert.ok(served.equals(bytes));
  await fetch(`${base}/api/local-compute/jobs/${job.id}/done`, {method: 'POST', headers, body: JSON.stringify({exitCode: 0, stdout: 'ok', stderr: ''})});
  assert.equal((await running).stdout, 'ok');
});

// 两个标签页时：在 A 页发起的计算和确认框先交给 A，不弹到 B 页；A 页一直没来接（关了），过一会儿才交给 B。
async function setupPages(t, pageGraceMs) {
  delete process.env.DATABASE_URL;
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'wb-compute-pages-'));
  const runtimeDir = path.join(root, 'data', 'runtime');
  await fs.mkdir(path.join(runtimeDir, 'storage', 'task'), {recursive: true});
  await fs.mkdir(path.join(root, 'scripts'), {recursive: true});
  await fs.writeFile(path.join(root, 'scripts', 'demo.py'), 'print("hi")\n');
  const compute = createLocalCompute({root, runtimeDir, pageGraceMs});
  const server = http.createServer((req, res) => runWithRequest(req, () => compute.handle(req, res, new URL(req.url, 'http://x'))));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await fs.rm(root, {recursive: true, force: true}); });
  const poll = async (page, wait = 0) => (await (await fetch(`${base}/api/local-compute/next?wait=${wait}`, {headers: {'X-Workbench-Page': page}})).json()).job;
  return {root, compute, base, poll};
}
const PAGE_A = 'page-aaaa-0001', PAGE_B = 'page-bbbb-0002';

test('a job started in one tab goes to that tab, not to another tab that is also waiting', async t => {
  const {root, compute, base, poll} = await setupPages(t, 60_000);
  const waitingB = poll(PAGE_B, 1500);
  await new Promise(resolve => setTimeout(resolve, 100));
  const running = runWithRequest({headers: {'x-workbench-page': PAGE_A}}, () => compute.runPython(path.join(root, 'scripts', 'demo.py'), ['--x', '1']));
  assert.equal(await poll(PAGE_B), null, 'another tab cannot take it right away');
  const job = await poll(PAGE_A);
  assert.equal(job.kind, 'python');
  assert.equal(await waitingB, null, 'the tab that was already waiting keeps waiting and gets nothing');
  await fetch(`${base}/api/local-compute/jobs/${job.id}/done`, {method: 'POST', headers: {'X-Compute-Claim': job.claim}, body: JSON.stringify({exitCode: 0, stdout: 'a', stderr: ''})});
  assert.equal((await running).stdout, 'a');
});

test('if the starting tab never comes for it, another tab takes it after a short wait; confirmations follow the same rule', async t => {
  const {root, compute, base, poll} = await setupPages(t, 300);
  const running = runWithRequest({headers: {'x-workbench-page': PAGE_A}}, () => compute.runPython(path.join(root, 'scripts', 'demo.py'), []));
  const started = Date.now();
  const job = await poll(PAGE_B, 3000);
  assert.ok(job && Date.now() - started >= 250, 'handed to the other tab only after the wait');
  await fetch(`${base}/api/local-compute/jobs/${job.id}/done`, {method: 'POST', headers: {'X-Compute-Claim': job.claim}, body: JSON.stringify({exitCode: 0, stdout: 'b', stderr: ''})});
  assert.equal((await running).stdout, 'b');

  const asked = runWithRequest({headers: {'x-workbench-page': PAGE_A}}, () => compute.ask({title: '确认消耗积分', message: '本次生成要 15 积分'}));
  assert.equal(await poll(PAGE_B), null);
  const prompt = await poll(PAGE_A);
  assert.equal(prompt.kind, 'prompt');
  await fetch(`${base}/api/local-compute/jobs/${prompt.id}/answer`, {method: 'POST', headers: {'X-Compute-Claim': prompt.claim}, body: JSON.stringify({accepted: true})});
  assert.deepEqual(await asked, {accepted: true});
  // 不带标签页编号的旧页面发起的任务，谁来都给。
  const legacy = runWithRequest({headers: {}}, () => compute.runPython(path.join(root, 'scripts', 'demo.py'), []));
  const any = await poll(PAGE_B);
  assert.equal(any.kind, 'python');
  await fetch(`${base}/api/local-compute/jobs/${any.id}/done`, {method: 'POST', headers: {'X-Compute-Claim': any.claim}, body: JSON.stringify({exitCode: 0, stdout: '', stderr: ''})});
  await legacy;
});
