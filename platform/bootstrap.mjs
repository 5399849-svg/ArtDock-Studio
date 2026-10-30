// 工作台的启动入口（平台上和本机都用它）：
// - 健康检查 /healthz 一开始监听就返回 200；数据还没从库里恢复好时，接口返回 503 WORKBENCH_STARTING；
// - 声明了 database（有 DATABASE_URL）时，数据存在应用自己的库里（persistence.mjs）；
// - 每个请求带着使用者的微光凭据进入请求上下文；改数据、花积分的请求核对来自本应用的页面；
// - /api/local-compute/* 把 Python 计算交给使用者的浏览器（local-compute.mjs）。
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {runWithRequest, sameApp, currentIdentity} from './request-context.mjs';
import {configureCanvas, listGameTags} from './canvas.mjs';
import {createPersistence} from './persistence.mjs';
import {createLocalCompute, setLocalCompute} from './local-compute.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(root, 'public');
const runtimeDir = process.env.WORKBENCH_RUNTIME_DIR || path.join(root, 'data', 'runtime');
const portArg = process.argv.indexOf('--port');
// 平台上 weiguang.json 的启动命令是 node platform/bootstrap.mjs（node 直接收到 SIGTERM，才能存完最后的改动再退出），端口 3000；
// 本机 npm start 带 --port 4173。
const port = Number(portArg > 0 ? process.argv[portArg + 1] : process.env.PORT || 3000);
const databaseUrl = process.env.DATABASE_URL || '';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.wasm': 'application/wasm',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.onnx': 'application/octet-stream', '.data': 'application/octet-stream', '.whl': 'application/zip', '.zip': 'application/zip',
  '.py': 'text/x-python; charset=utf-8', '.tar': 'application/x-tar', '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff2': 'font/woff2',
};

const state = {phase: 'starting', error: '', draining: false, inFlight: 0};
let appHandler = null;
let persistence = null;
const compute = createLocalCompute({root, runtimeDir});
setLocalCompute(compute);
configureCanvas({runtimeDir});

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(body)});
  res.end(body);
}

// 静态文件按文件流发送，带 ETag：平台把 Cache-Control 统一改成 private, no-cache，浏览器每次核对，没变就 304，
// 浏览器计算用的运行库和模型（几百 MB）不用重复下载。
async function serveStatic(req, res, pathname) {
  let relative;
  try { relative = decodeURIComponent(pathname === '/' ? '/index.html' : pathname).replace(/^\/+/, ''); } catch { return false; }
  const file = path.resolve(publicDir, relative);
  if (!file.startsWith(publicDir + path.sep)) return false;
  let stat;
  try { stat = await fsp.stat(file); } catch { return false; }
  if (!stat.isFile()) return false;
  const etag = `W/"${stat.size.toString(16)}-${Math.trunc(stat.mtimeMs).toString(16)}"`;
  const headers = {'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', ETag: etag, 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff'};
  if (req.headers['if-none-match'] === etag) { res.writeHead(304, headers); res.end(); return true; }
  res.writeHead(200, {...headers, 'Content-Length': stat.size});
  if (req.method === 'HEAD') { res.end(); return true; }
  await new Promise((resolve, reject) => fs.createReadStream(file).on('error', reject).on('end', resolve).pipe(res));
  return true;
}

async function computeScripts() {
  const names = (await fsp.readdir(path.join(root, 'scripts'))).filter(name => /^[A-Za-z0-9_.-]+.py$/.test(name)).map(name => `scripts/${name}`);
  return [...names, 'local-ai/pipeline.py'];
}
async function serveComputeScript(req, res, relative) {
  if (relative === 'manifest.json') return sendJson(res, 200, {files: await computeScripts()});
  if (!(await computeScripts()).includes(relative)) return sendJson(res, 404, {error: '脚本不存在'});
  const body = await fsp.readFile(path.join(root, ...relative.split('/')));
  res.writeHead(200, {'Content-Type': 'text/x-python; charset=utf-8', 'Cache-Control': 'no-cache', 'Content-Length': body.length});
  res.end(body);
}

const notReady = res => sendJson(res, 503, {
  error: state.phase === 'failed' ? `工作台启动失败：${state.error}` : state.draining ? '工作台正在切换到新版本，请几秒后重试' : '工作台正在启动（从库里恢复数据），请稍候',
  code: 'WORKBENCH_STARTING',
});

async function handle(req, res) {
  const url = new URL(req.url, 'http://workbench.local');
  if (url.pathname === '/healthz') { res.writeHead(200, {'Content-Type': 'text/plain', 'Cache-Control': 'no-store'}); res.end('ok'); return; }
  const isApi = url.pathname.startsWith('/api/');
  const mutation = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
  if (isApi && mutation && !sameApp(req)) return sendJson(res, 403, {error: '请求不是来自工作台页面，已拒绝', code: 'ORIGIN_REJECTED'});
  // 浏览器计算要用的工作台 Python 脚本（只读，只给 scripts/*.py 和 local-ai/pipeline.py）。
  if (url.pathname.startsWith('/platform/compute-scripts/') && req.method === 'GET') return serveComputeScript(req, res, url.pathname.slice('/platform/compute-scripts/'.length));
  if (url.pathname.startsWith('/platform/') || !appHandler) {
    if ((req.method === 'GET' || req.method === 'HEAD') && await serveStatic(req, res, url.pathname)) return;
    if (url.pathname.startsWith('/platform/')) return sendJson(res, 404, {error: '文件不存在'});
  }
  if (url.pathname === '/api/platform/status' && req.method === 'GET') {
    const identity = await currentIdentity({required: false}).catch(() => null);
    return sendJson(res, 200, {
      phase: state.phase, persistence: persistence ? {...persistence.state} : null, user: identity ? {name: identity.name} : null,
      mode: databaseUrl ? 'platform' : 'local', localCompute: {pending: compute.pending()},
    });
  }
  if (url.pathname.startsWith('/api/local-compute/')) { await compute.handle(req, res, url); return; }
  if (!appHandler || state.phase !== 'ready' || (state.draining && mutation)) return notReady(res);
  if (url.pathname === '/api/platform/game-tags' && req.method === 'GET') return sendJson(res, 200, {items: await listGameTags()});
  return appHandler(req, res);
}

const server = http.createServer((req, res) => {
  state.inFlight++;
  res.on('close', () => { state.inFlight--; });
  runWithRequest(req, () => handle(req, res)).catch(error => {
    if (!res.headersSent) sendJson(res, error.status || 500, error.code === 'LOGIN_REQUIRED'
      ? {error: {code: 'LOGIN_REQUIRED', message: error.message}}
      : {error: error.message || '服务器错误', code: error.code});
    else res.end();
    if (!error.status || error.status >= 500) console.error(error);
  });
});
server.requestTimeout = 0;
server.headersTimeout = 120_000;
server.listen(port, '0.0.0.0', () => console.log(`平台与社区素材工作台已启动：http://127.0.0.1:${port}/（健康检查 /healthz）`));

// 程序启动要用、但不是使用者数据的参考资料（华为资源位规则表、投放参考图）随代码放在 config/runtime-seed，
// 数据目录里没有时补上，已有的不覆盖。
async function copySeed(from = path.join(root, 'config', 'runtime-seed'), to = runtimeDir) {
  for (const entry of await fsp.readdir(from, {withFileTypes: true}).catch(() => [])) {
    const source = path.join(from, entry.name), target = path.join(to, entry.name);
    if (entry.isDirectory()) { await fsp.mkdir(target, {recursive: true}); await copySeed(source, target); }
    else if (entry.isFile()) await fsp.copyFile(source, target, fs.constants.COPYFILE_EXCL).catch(error => { if (error.code !== 'EEXIST') throw error; });
  }
}

async function start() {
  if (databaseUrl) {
    persistence = createPersistence({runtimeDir, databaseUrl});
    state.phase = 'restoring';
    await persistence.start();
  } else {
    console.log(`没有 DATABASE_URL：数据只保存在本机 ${runtimeDir}（平台上由平台提供应用自己的库）`);
  }
  await fsp.mkdir(runtimeDir, {recursive: true});
  await copySeed();
  process.env.WORKBENCH_BOOTSTRAP = '1';
  const app = await import(pathToFileURL(path.join(root, 'server.mjs')).href);
  appHandler = app.handleRequest;
  state.phase = 'ready';
  console.log('工作台已就绪');
}

start().catch(error => {
  state.phase = 'failed';
  state.error = error.message;
  console.error('工作台启动失败：', error);
});

let stopping = false;
async function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  state.draining = true;
  console.log(`收到 ${signal}：停止接收新的修改，把最后的改动存进库后退出`);
  const deadline = Date.now() + 8000;
  while (state.inFlight > 0 && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 200));
  await persistence?.stop();
  server.close();
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
