// 抠图、PSD 解析、扩图对齐、动图编码这类计算在使用者自己的电脑上做（规范 3.1、打包规范 2.5）：
// 服务器不运行 Python，而是把这一步交给发起操作的使用者正开着的工作台页面。页面下载输入文件，
// 在浏览器里用 Pyodide（Python）和 onnxruntime-web（本机 GPU）算完，把结果传回来，服务器接着往下做。
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {currentIdentity} from './request-context.mjs';

const LABELS = {
  'sam2-character-cutout.py': '人物精细抠图（SAM2）',
  'refine-community-cutout.py': '抠图边缘修整',
  'source-character-guidance.py': '人物识别（u2net）',
  'register-outpaint.py': '扩图与原图对齐',
  'store-jpg-layer-split.py': '分离人物与背景',
  'store-shared-background.py': '合成共用背景',
  'export-task-psd-assets.py': '读取 PSD 图层',
  'export-source-scene.py': '读取 PSD 场景',
  'flatten-ad-psd.py': '读取 PSD 画面',
  'store-psd-layer-export.py': '导出 PSD 图层',
  'render-huawei-psd-preview.py': '生成 PSD 场景预览',
  'render-community-font-guide.py': '生成版权字体字形',
  'prepare-ad-video.py': '处理动效视频帧',
  'encode-frames-gif.py': '编码 GIF 动图',
  'parse-channel-requirements.py': '读取需求表',
  'pipeline.py': '本地抠图分割',
};
const CLAIM_STALE_MS = 45_000;
const UNCLAIMED_TIMEOUT_MS = 10 * 60_000;
const MIN_RUN_TIMEOUT_MS = 15 * 60_000;

function computeError(message, status = 422, extra = {}) {
  return Object.assign(new Error(message), {status, ...extra});
}

export function createLocalCompute({root, runtimeDir}) {
  const roots = [
    {real: path.resolve(runtimeDir), virtual: '/wb-runtime'},
    {real: path.resolve(root), virtual: '/wb'},
    {real: path.resolve(os.tmpdir()), virtual: '/wb-tmp'},
  ].sort((a, b) => b.real.length - a.real.length);
  const jobs = new Map();
  const waiters = new Map(); // accountId -> Set<wake>

  const inside = (parent, child) => {
    const relative = path.relative(parent, child);
    return relative === '' || (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative));
  };
  function toVirtual(real) {
    const resolved = path.resolve(real);
    const base = roots.find(entry => inside(entry.real, resolved));
    if (!base) return null;
    const relative = path.relative(base.real, resolved).split(path.sep).join('/');
    return relative ? `${base.virtual}/${relative}` : base.virtual;
  }
  function toReal(virtual) {
    if (typeof virtual !== 'string' || virtual.includes('\0') || virtual.split('/').includes('..')) return null;
    const base = roots.find(entry => virtual === entry.virtual || virtual.startsWith(`${entry.virtual}/`));
    if (!base) return null;
    return path.join(base.real, ...virtual.slice(base.virtual.length).split('/').filter(Boolean));
  }

  async function listFiles(dir) {
    const files = [];
    for (const entry of await fs.readdir(dir, {withFileTypes: true})) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) files.push(...await listFiles(full));
      else if (entry.isFile()) files.push(full);
    }
    return files;
  }

  // 参数里的路径：已存在的文件是输入；已存在的文件夹里的文件是输入，文件夹本身也可以写结果；
  // 不存在的路径是结果的位置。JSON 参数文件里写的路径同样处理（例如字体文件）。
  async function describe(script, args) {
    const inputs = [], outputRoots = [], outputDirs = [], seen = new Set();
    const addInput = async (real, content) => {
      const virtual = toVirtual(real);
      if (!virtual || seen.has(virtual)) return virtual;
      seen.add(virtual);
      const size = content ? content.length : (await fs.stat(real)).size;
      inputs.push({n: inputs.length, path: virtual, real, size, content});
      return virtual;
    };
    const mapPath = async value => {
      if (typeof value !== 'string' || !path.isAbsolute(value)) return value;
      const virtual = toVirtual(value);
      if (!virtual) throw computeError(`本机计算不能读取 ${path.basename(value)}`, 500);
      let stat = null;
      try { stat = await fs.stat(value); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (!stat) { outputRoots.push(virtual); return virtual; }
      if (stat.isDirectory()) {
        outputRoots.push(virtual);
        outputDirs.push(virtual);
        for (const file of await listFiles(value)) await addInput(file);
        return virtual;
      }
      if (/\.json$/i.test(value) && stat.size < 4 * 1024 * 1024) {
        const parsed = JSON.parse(await fs.readFile(value, 'utf8'));
        const rewrite = async node => {
          if (typeof node === 'string') return path.isAbsolute(node) && toVirtual(node) ? mapPath(node) : node;
          if (Array.isArray(node)) return Promise.all(node.map(rewrite));
          if (node && typeof node === 'object') return Object.fromEntries(await Promise.all(Object.entries(node).map(async ([k, v]) => [k, await rewrite(v)])));
          return node;
        };
        return addInput(value, Buffer.from(JSON.stringify(await rewrite(parsed))));
      }
      // 已存在的文件可能是输入，也可能是要覆盖的结果（例如再算一次）：两者都算，脚本改过才传回来。
      outputRoots.push(virtual);
      return addInput(value);
    };
    const mapped = [];
    for (const arg of args) mapped.push(await mapPath(arg));
    const scriptVirtual = toVirtual(script);
    if (!scriptVirtual) throw computeError('本机计算的脚本不在工作台里', 500);
    return {script: scriptVirtual, args: mapped, inputs, outputRoots, outputDirs};
  }

  function wake(accountId) {
    for (const resolve of waiters.get(accountId) || []) resolve();
    waiters.delete(accountId);
  }

  // 和 execFile 一样返回 {stdout, stderr}；失败时抛出带 stderr 的错误，原来的错误处理照常工作。
  async function runPython(script, args = [], options = {}) {
    const identity = await currentIdentity({required: false}).catch(() => null);
    const accountId = identity?.accountId || (process.env.DATABASE_URL ? '' : 'local');
    const name = path.basename(script);
    const label = options.label || LABELS[name] || '本机计算';
    if (!accountId) throw computeError(`「${label}」要在使用者的浏览器里计算，但这一步没有登录身份；请重新打开工作台后再试`, 409, {code: 'LOCAL_COMPUTE_NO_USER'});
    const described = await describe(script, args);
    const id = randomUUID();
    const job = {
      id, kind: 'python', accountId, label, name, ...described,
      createdAt: Date.now(), claim: null, heartbeatAt: 0, progress: null,
      timeoutMs: Math.max(MIN_RUN_TIMEOUT_MS, Number(options.timeout) || 0),
    };
    const result = new Promise((resolve, reject) => { job.resolve = resolve; job.reject = reject; });
    jobs.set(id, job);
    job.timer = setInterval(() => {
      const now = Date.now();
      if (job.claim && now - job.heartbeatAt > CLAIM_STALE_MS) { job.claim = null; wake(accountId); }
      if (!job.claim && now - job.createdAt > UNCLAIMED_TIMEOUT_MS) finish(job, computeError(`「${label}」要在你的浏览器里计算，但 10 分钟内没有打开的工作台页面接手；请打开工作台页面后重试`, 409, {code: 'LOCAL_COMPUTE_NO_PAGE'}));
      if (job.claim && now - job.createdAt > job.timeoutMs) finish(job, computeError(`「${label}」在浏览器里计算超时，请缩小处理规模后重试`, 422));
    }, 5000);
    wake(accountId);
    return result;
  }

  // 请使用者在页面上确认一件事（例如这次生成要花多少积分）。页面没人回答就当作不同意。
  async function ask(prompt, {timeoutMs = 5 * 60_000} = {}) {
    const identity = await currentIdentity({required: false}).catch(() => null);
    const accountId = identity?.accountId || (process.env.DATABASE_URL ? '' : 'local');
    if (!accountId) throw computeError('这一步要你在工作台页面上确认，但没有登录身份；请重新打开工作台后再试', 409, {code: 'CONFIRM_NO_USER'});
    const id = randomUUID();
    const job = {id, kind: 'prompt', accountId, label: prompt.title || '需要确认', prompt, createdAt: Date.now(), claim: null, heartbeatAt: 0};
    const result = new Promise((resolve, reject) => { job.resolve = resolve; job.reject = reject; });
    jobs.set(id, job);
    job.timer = setInterval(() => {
      const now = Date.now();
      if (job.claim && now - job.heartbeatAt > CLAIM_STALE_MS) { job.claim = null; wake(accountId); }
      if (!job.claim && now - job.createdAt > 2 * 60_000) finish(job, computeError('需要在工作台页面上确认，但没有打开的页面；这次没有提交，也没有扣积分', 409, {code: 'CONFIRM_NO_PAGE'}));
      if (now - job.createdAt > timeoutMs) finish(job, computeError('等待确认超时；这次没有提交，也没有扣积分', 409, {code: 'CONFIRM_TIMEOUT'}));
    }, 5000);
    wake(accountId);
    return result;
  }

  function finish(job, error, value) {
    if (!jobs.has(job.id)) return;
    jobs.delete(job.id);
    clearInterval(job.timer);
    if (error) job.reject(error); else job.resolve(value);
  }

  function publicJob(job) {
    if (job.kind === 'prompt') return {id: job.id, claim: job.claim, kind: 'prompt', label: job.label, prompt: job.prompt};
    return {
      kind: job.kind,
      id: job.id, claim: job.claim, label: job.label, name: job.name, script: job.script, args: job.args,
      inputs: job.inputs.map(({n, path: file, size}) => ({n, path: file, size})), outputRoots: job.outputRoots, outputDirs: job.outputDirs,
    };
  }

  function nextFor(accountId) {
    for (const job of jobs.values()) {
      if (job.accountId !== accountId || job.claim) continue;
      job.claim = randomUUID();
      job.heartbeatAt = Date.now();
      return job;
    }
    return null;
  }

  async function readJsonBody(req, limit = 4 * 1024 * 1024) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) { size += chunk.length; if (size > limit) throw computeError('请求内容太大', 413); chunks.push(chunk); }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { throw computeError('请求格式不对'); }
  }
  const send = (res, status, data) => {
    const body = JSON.stringify(data);
    res.writeHead(status, {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(body)});
    res.end(body);
  };

  async function handle(req, res, url) {
    if (!url.pathname.startsWith('/api/local-compute/')) return false;
    const identity = await currentIdentity({required: false}).catch(() => null);
    const accountId = identity?.accountId || (process.env.DATABASE_URL ? '' : 'local');
    if (!accountId) return send(res, 401, {error: {code: 'LOGIN_REQUIRED', message: '登录已失效，请重新连接微光平台'}}), true;
    if (url.pathname === '/api/local-compute/next' && req.method === 'GET') {
      let job = nextFor(accountId);
      if (!job) {
        const waitMs = Math.min(25_000, Math.max(0, Number(url.searchParams.get('wait')) || 0));
        if (waitMs) {
          await new Promise(resolve => {
            const set = waiters.get(accountId) || new Set();
            const timer = setTimeout(done, waitMs);
            function done() { clearTimeout(timer); set.delete(done); resolve(); }
            set.add(done); waiters.set(accountId, set);
            res.on('close', done); // 页面关掉或连接断开时不再等待（req 的 close 在读完请求时就会触发）
          });
          job = nextFor(accountId);
        }
      }
      return send(res, 200, {job: job ? publicJob(job) : null}), true;
    }
    const match = /^\/api\/local-compute\/jobs\/([0-9a-f-]{36})\/(input\/(\d+)|file|heartbeat|done|fail|answer)$/.exec(url.pathname);
    if (!match) return send(res, 404, {error: '本机计算接口不存在'}), true;
    const job = jobs.get(match[1]);
    if (!job || job.accountId !== accountId) return send(res, 404, {error: '本机计算任务不存在或已结束'}), true;
    if (!job.claim || req.headers['x-compute-claim'] !== job.claim) return send(res, 409, {error: '这个计算已由别的页面接手'}), true;
    job.heartbeatAt = Date.now();
    const action = match[2];
    if (action.startsWith('input/') && req.method === 'GET') {
      const input = job.inputs[Number(match[3])];
      if (!input) return send(res, 404, {error: '输入文件不存在'}), true;
      const body = input.content || await fs.readFile(input.real);
      res.writeHead(200, {'Content-Type': 'application/octet-stream', 'Content-Length': body.length, 'Cache-Control': 'no-store'});
      res.end(body);
      return true;
    }
    if (action === 'heartbeat' && req.method === 'POST') {
      job.progress = (await readJsonBody(req, 4096)).progress || null;
      return send(res, 200, {ok: true}), true;
    }
    if (action === 'file' && req.method === 'PUT') {
      const virtual = url.searchParams.get('path') || '';
      const allowed = job.outputRoots.some(rootPath => virtual === rootPath || virtual.startsWith(`${rootPath}/`));
      const real = allowed ? toReal(virtual) : null;
      if (!real) return send(res, 422, {error: `结果文件位置无效：${virtual.slice(0, 200)}`}), true;
      await fs.mkdir(path.dirname(real), {recursive: true});
      const temporary = `${real}.${randomUUID()}.tmp`;
      const handle = await fs.open(temporary, 'w');
      try { for await (const chunk of req) await handle.write(chunk); } finally { await handle.close(); }
      await fs.rename(temporary, real);
      return send(res, 200, {ok: true}), true;
    }
    if (action === 'done' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const stdout = String(body.stdout || ''), stderr = String(body.stderr || '');
      if (Number(body.exitCode) !== 0) finish(job, Object.assign(computeError(`「${job.label}」计算失败：${(stderr.trim().split('\n').pop() || '').slice(0, 300)}`), {stdout, stderr, code: body.exitCode}));
      else finish(job, null, {stdout, stderr});
      return send(res, 200, {ok: true}), true;
    }
    if (action === 'answer' && req.method === 'POST' && job.kind === 'prompt') {
      const body = await readJsonBody(req, 4096);
      finish(job, null, {accepted: body.accepted === true});
      return send(res, 200, {ok: true}), true;
    }
    if (action === 'fail' && req.method === 'POST') {
      const body = await readJsonBody(req, 64 * 1024);
      const message = String(body.message || '').slice(0, 500);
      finish(job, computeError(body.cancelled ? `已在本机停止「${job.label}」` : `「${job.label}」不能在这个浏览器里完成：${message || '未知原因'}`, body.cancelled ? 409 : 422, {stderr: message, code: body.cancelled ? 'LOCAL_COMPUTE_CANCELLED' : 'LOCAL_COMPUTE_FAILED'}));
      return send(res, 200, {ok: true}), true;
    }
    return send(res, 405, {error: '不支持的操作'}), true;
  }

  return {runPython, ask, handle, toVirtual, pending: () => jobs.size};
}

let instance = null;
export function setLocalCompute(value) { instance = value; }
// 给 server.mjs 和 lib 里原来调用 Python 的地方用：和 promisify(execFile) 的返回一样。
export function runLocalPython(script, args, options) {
  if (!instance) throw computeError('本机计算还没准备好，请稍后重试', 503);
  return instance.runPython(script, args, options);
}
// 和原来 execFile(python, [脚本, ...参数], 选项) 一样的写法。
export function localPython([script, ...args], options) {
  return runLocalPython(script, args, options);
}

export function askUser(prompt, options) {
  if (!instance) throw computeError('工作台还没准备好，请稍后重试', 503);
  return instance.ask(prompt, options);
}
