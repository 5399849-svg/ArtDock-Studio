// 在使用者浏览器里运行工作台的 Python 脚本（Pyodide）和模型（onnxruntime-web，优先用本机 GPU）。
// 由 client.mjs 创建；一次只做一个计算，停止计算时整个 Worker 被结束。
import {loadPyodide} from '/platform/vendor/pyodide/pyodide.mjs';

// 在哪里算是实测定的（onnxruntime-web 1.22）：SAM2 编码模型用本机 GPU（和 CPU 结果一致，约 0.3 秒）；
// SAM2 解码模型在 WebGPU 上输出全是 0、u2net 的 MaxPool(ceil) WebGPU 不支持，这两个小模型用 CPU。
const MODELS = {
  'u2net': {label: '人物识别模型 u2net（约 176 MB）', url: '/platform/models/u2net.onnx', providers: ['wasm']},
  // 编码模型里有 If 节点，onnxruntime-web 做图优化时会出错：不做图优化（结果相同，GPU 上一次约 0.3 秒）。
  'sam2-encoder': {label: 'SAM2 图像编码模型（约 138 MB）', url: '/platform/models/sam2.1-hiera-small/vision_encoder.onnx', optimization: 'disabled'},
  'sam2-decoder': {label: 'SAM2 提示解码模型（约 17 MB）', url: '/platform/models/sam2.1-hiera-small/mask_decoder.onnx', providers: ['wasm']},
};
const SUPPORT = ['wb_bridge.py', 'wb_runner.py', 'aggdraw.py', 'sam2_browser.py', 'rembg/__init__.py'];
const SCRATCH = ['/wb-runtime', '/wb-tmp', '/wb-bridge', '/wb-video'];
const MAX_ROUNDS = 8;

let pyodidePromise = null, ort = null, gpuAvailable = null;
const sessions = new Map();
const videoWaiters = new Map();
const post = (type, payload = {}) => self.postMessage({type, ...payload});
const progress = (stage, loaded, total) => post('progress', {stage, loaded, total});

async function fetchBytes(url, label) {
  const response = await fetch(url, {cache: 'no-cache'});
  if (!response.ok) throw new Error(`下载${label}失败（HTTP ${response.status}）`);
  const total = Number(response.headers.get('content-length')) || 0;
  if (!response.body) return new Uint8Array(await response.arrayBuffer());
  const reader = response.body.getReader(), chunks = [];
  let loaded = 0, last = 0;
  for (;;) {
    const {done, value} = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    if (Date.now() - last > 300) { last = Date.now(); progress(`下载${label}`, loaded, total); }
  }
  const bytes = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}

function getPyodide() {
  pyodidePromise ||= (async () => {
    progress('加载 Python 运行库（第一次约 30 MB，之后用浏览器缓存）');
    const py = await loadPyodide({indexURL: '/platform/vendor/pyodide/', stdout: () => {}, stderr: () => {}});
    progress('加载 numpy、OpenCV、Pillow');
    await py.loadPackage(['numpy', 'opencv-python', 'pillow', 'attrs', 'six', 'typing-extensions'], {messageCallback: () => {}, errorCallback: () => {}});
    py.unpackArchive(await fetchBytes('/platform/vendor/psd_tools-1.19.0.zip', ' PSD 解析库'), 'zip', {extractDir: '/lib/python3.12/site-packages'});
    py.FS.mkdirTree('/wb-support/rembg');
    for (const file of SUPPORT) py.FS.writeFile(`/wb-support/${file}`, await (await fetch(`/platform/local-compute/py/${file}`, {cache: 'no-cache'})).text());
    const {files} = await (await fetch('/platform/compute-scripts/manifest.json', {cache: 'no-cache'})).json();
    for (const file of files) {
      py.FS.mkdirTree(`/wb/${file.split('/').slice(0, -1).join('/')}`);
      py.FS.writeFile(`/wb/${file}`, await (await fetch(`/platform/compute-scripts/${file}`, {cache: 'no-cache'})).text());
    }
    // 脚本检查模型文件是否就绪：模型在浏览器里，这里只放一个占位文件。
    py.FS.mkdirTree('/wb/local-ai/models');
    py.FS.writeFile('/wb/local-ai/models/u2net.onnx', 'browser');
    py.runPython("import sys; sys.path.insert(0, '/wb-support')");
    return py;
  })();
  return pyodidePromise;
}

async function hasGpu() {
  if (gpuAvailable === null) {
    try { gpuAvailable = Boolean(self.navigator.gpu && await self.navigator.gpu.requestAdapter()); } catch { gpuAvailable = false; }
  }
  return gpuAvailable;
}

async function getSession(model) {
  if (sessions.has(model)) return sessions.get(model);
  const spec = MODELS[model];
  if (!spec) throw new Error(`没有模型 ${model}`);
  if (!ort) {
    ort = await import('/platform/vendor/ort/ort.webgpu.min.mjs');
    ort.env.wasm.wasmPaths = '/platform/vendor/ort/';
    ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, self.navigator.hardwareConcurrency || 2) : 1;
  }
  const gpu = !spec.providers && await hasGpu();
  const options = {executionProviders: spec.providers || (gpu ? ['webgpu', 'wasm'] : ['wasm']), graphOptimizationLevel: spec.optimization || 'all'};
  const bytes = await fetchBytes(spec.url, spec.label);
  if (spec.data) options.externalData = [{path: spec.data, data: await fetchBytes(spec.url.replace(/[^/]+$/, spec.data), `${spec.label}（权重）`)}];
  progress(gpu ? '准备模型（使用本机 GPU）' : spec.providers ? '准备模型（这个模型用 CPU）' : '准备模型（这台电脑的浏览器没有可用的 GPU，改用 CPU，会慢一些）');
  const session = await ort.InferenceSession.create(bytes, options);
  sessions.set(model, session);
  return session;
}

function readTensor(py, spec) {
  let file = spec.file;
  if (spec.ref) {
    const [key, name] = spec.ref.split(':');
    file = JSON.parse(py.FS.readFile(`/wb-bridge/r-${key}.json`, {encoding: 'utf8'})).outputs[name].file;
  }
  const raw = py.FS.readFile(file);
  const buffer = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
  const data = spec.dtype === 'int64' ? new BigInt64Array(buffer) : spec.dtype === 'int32' ? new Int32Array(buffer) : new Float32Array(buffer);
  return new ort.Tensor(spec.dtype, data, spec.shape);
}

async function runOnnx(py, request) {
  const session = await getSession(request.model);
  progress(`运行模型 ${request.model}`);
  const feeds = {};
  for (const [name, spec] of Object.entries(request.inputs)) feeds[name] = readTensor(py, spec);
  const results = await session.run(feeds);
  const outputs = {};
  request.outputs.forEach((name, index) => {
    const tensor = results[name] || results[session.outputNames[index]];
    const data = tensor.data;
    const file = `/wb-bridge/r-${request.key}-${index}.bin`;
    py.FS.writeFile(file, new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
    outputs[name] = {file, dtype: tensor.type === 'int64' ? 'int64' : 'float32', shape: [...tensor.dims]};
  });
  py.FS.writeFile(`/wb-bridge/r-${request.key}.json`, JSON.stringify({outputs}));
}

async function sha1Hex(text) {
  const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

// 视频解码要用页面里的 <video>：请页面解码，结果写进虚拟文件系统。
function askPage(request) {
  return new Promise((resolve, reject) => {
    videoWaiters.set(request.key, {resolve, reject});
    post('video', {request});
  });
}
async function resolveVideo(py, request) {
  const dir = `/wb-video/${await sha1Hex(request.path)}`;
  py.FS.mkdirTree(dir);
  const result = await askPage(request);
  if (request.kind === 'video-meta') py.FS.writeFile(`${dir}/meta.json`, JSON.stringify(result.meta));
  else py.FS.writeFile(`${dir}/${request.index}.png`, new Uint8Array(result.png));
}

function exists(py, file) { try { py.FS.stat(file); return true; } catch { return false; } }
function walk(py, dir, visit) {
  if (!exists(py, dir)) return;
  const stat = py.FS.stat(dir);
  if (!py.FS.isDir(stat.mode)) { visit(dir, stat); return; }
  for (const name of py.FS.readdir(dir)) if (name !== '.' && name !== '..') walk(py, `${dir}/${name}`, visit);
}
function removeTree(py, dir) {
  if (!exists(py, dir)) return;
  if (!py.FS.isDir(py.FS.stat(dir).mode)) { py.FS.unlink(dir); return; }
  for (const name of py.FS.readdir(dir)) if (name !== '.' && name !== '..') removeTree(py, `${dir}/${name}`);
  py.FS.rmdir(dir);
}
const parentOf = file => file.split('/').slice(0, -1).join('/') || '/';
const loadedExtras = new Set();
function missingPackage(stderr) {
  if (!loadedExtras.has('scipy') && /No module named 'scipy'|pip install scipy/.test(stderr)) return 'scipy';
  if (!loadedExtras.has('scikit-image') && /No module named 'skimage'|scikit-image/.test(stderr)) return 'scikit-image';
  return '';
}

async function run(job, files) {
  const py = await getPyodide();
  for (const dir of SCRATCH) removeTree(py, dir);
  const written = [];
  for (const file of files) {
    py.FS.mkdirTree(parentOf(file.path));
    py.FS.writeFile(file.path, new Uint8Array(file.bytes));
    written.push(file.path);
  }
  for (const dir of job.outputDirs || []) py.FS.mkdirTree(dir);
  for (const root of job.outputRoots) py.FS.mkdirTree(parentOf(root));
  const inputs = new Map(files.map(file => [file.path, file.bytes]));
  const snapshot = new Map();
  for (const root of job.outputRoots) walk(py, root, (file, stat) => snapshot.set(file, stat.mtime.getTime()));
  const script = job.name === 'sam2-character-cutout.py' ? '/wb-support/sam2_browser.py' : job.script;
  const runner = py.pyimport('wb_runner');
  let result;
  // 占位结果或缺少依赖时算出的文件不能交回去：把结果位置恢复成运行前的样子。
  const restore = () => {
    for (const root of job.outputRoots) walk(py, root, (file, stat) => {
      if (snapshot.get(file) === stat.mtime.getTime()) return;
      if (inputs.has(file)) py.FS.writeFile(file, new Uint8Array(inputs.get(file)));
      else py.FS.unlink(file);
    });
  };
  try {
    for (let round = 1; ; round++) {
      progress(round === 1 ? `运行 ${job.label}` : `运行 ${job.label}（第 ${round} 轮）`);
      result = JSON.parse(runner.run(script, JSON.stringify(job.args), '/wb'));
      // PSD 的渐变填充、部分图层效果要 scipy / scikit-image：用到时才下载（约 15～40 MB），再从头算一次。
      const missing = result.exitCode !== 0 && !result.pending.length && missingPackage(result.stderr);
      if (missing) {
        if (round >= MAX_ROUNDS) break;
        progress(`下载 ${missing}（这类 PSD 第一次用到，之后用浏览器缓存）`);
        await py.loadPackage([missing], {messageCallback: () => {}, errorCallback: () => {}});
        py.runPython("import sys\nfor name in [k for k in sys.modules if k.startswith('psd_tools')]: del sys.modules[name]");
        loadedExtras.add(missing);
        restore();
        continue;
      }
      if (!result.pending.length) break;
      if (round >= MAX_ROUNDS) throw new Error('计算需要的模型结果一直没有准备好');
      restore();
      for (const request of result.pending) {
        if (request.kind === 'onnx') await runOnnx(py, request);
        else await resolveVideo(py, request);
      }
    }
    const outputs = [];
    for (const root of job.outputRoots) walk(py, root, (file, stat) => {
      if (snapshot.get(file) === stat.mtime.getTime()) return;
      const bytes = py.FS.readFile(file);
      outputs.push({path: file, bytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)});
    });
    return {exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr, outputs};
  } finally {
    runner.destroy?.();
    for (const file of written) if (exists(py, file) && !file.startsWith('/wb/scripts/')) py.FS.unlink(file);
    for (const dir of SCRATCH) removeTree(py, dir);
  }
}

self.onmessage = async event => {
  const message = event.data;
  if (message.type === 'video-result') {
    const waiter = videoWaiters.get(message.key);
    videoWaiters.delete(message.key);
    if (message.error) waiter?.reject(new Error(message.error)); else waiter?.resolve(message);
    return;
  }
  if (message.type !== 'run') return;
  try {
    const result = await run(message.job, message.files);
    self.postMessage({type: 'done', ...result}, result.outputs.map(output => output.bytes));
  } catch (error) {
    post('error', {message: String(error?.message || error)});
  }
};
