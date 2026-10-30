// 工作台页面这一侧：接手服务器交给“我的浏览器”的计算和确认（抠图、PSD 解析、对齐、GIF 编码，画布积分确认），
// 显示正在做什么和真实进度，可以随时停止。文件只在这台电脑的浏览器里处理，算好的结果存回工作台。
const MODEL_LABELS = {banana_pro: 'Nano Banana Pro', rh_image_outpaint: 'RH 定向扩图', kling_v3: '可灵 V3 视频', 'gpt-image-2': 'GPT Image 2'};
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let worker = null, current = null;

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const panel = (() => {
  const root = element('section', 'wb-compute');
  root.hidden = true;
  root.setAttribute('role', 'status');
  const title = element('b', 'wb-compute-title');
  const stage = element('p', 'wb-compute-stage');
  const bar = element('progress', 'wb-compute-bar');
  const note = element('p', 'wb-compute-note', '文件只在你这台电脑的浏览器里处理，算好的结果存回工作台；第一次要下载运行库和模型，之后用浏览器缓存。');
  const stop = element('button', 'wb-compute-stop', '停止');
  stop.type = 'button';
  stop.addEventListener('click', () => current?.stop());
  root.append(title, stage, bar, note, stop);
  document.body.append(root);
  return {
    show(label) { title.textContent = `正在你的电脑上计算：${label}`; stage.textContent = '准备中…'; bar.removeAttribute('value'); root.hidden = false; },
    stage(text, loaded, total) {
      stage.textContent = total ? `${text}（${(loaded / 1048576).toFixed(1)} / ${(total / 1048576).toFixed(1)} MB）` : text;
      if (total) { bar.max = total; bar.value = loaded; } else bar.removeAttribute('value');
    },
    hide() { root.hidden = true; },
  };
})();

function claimHeaders(job, extra = {}) {
  return {'X-Compute-Claim': job.claim, ...extra};
}
async function send(job, action, body) {
  await fetch(`/api/local-compute/jobs/${job.id}/${action}`, {
    method: 'POST', headers: claimHeaders(job, {'Content-Type': 'application/json'}), body: JSON.stringify(body || {}),
  }).catch(() => {});
}

function checkSupport() {
  if (typeof WebAssembly !== 'object') return '这个浏览器不支持 WebAssembly，请换用新版 Chrome 或 Edge';
  if (typeof Worker !== 'function') return '这个浏览器不支持后台计算（Web Worker），请换用新版 Chrome 或 Edge';
  return '';
}

// 视频帧由页面里的 <video> 解码（Worker 里没有 <video>）。
const videos = new Map();
async function videoFor(path, bytes) {
  if (videos.has(path)) return videos.get(path);
  const video = document.createElement('video');
  video.muted = true;
  video.preload = 'auto';
  video.src = URL.createObjectURL(new Blob([bytes]));
  await new Promise((resolve, reject) => { video.onloadedmetadata = resolve; video.onerror = () => reject(new Error('浏览器解码不了这个视频，请换用新版 Chrome 或 Edge')); });
  videos.set(path, video);
  return video;
}
async function answerVideo(request, files) {
  const video = await videoFor(request.path, files.get(request.path));
  if (request.kind === 'video-meta') {
    const fps = 30;
    return {meta: {fps, count: Math.floor(video.duration * fps), width: video.videoWidth, height: video.videoHeight}};
  }
  video.currentTime = Math.min(video.duration - 0.001, (request.index + 0.5) / request.fps);
  await new Promise(resolve => { video.onseeked = resolve; });
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  return {png: await blob.arrayBuffer()};
}

async function runCompute(job) {
  const unsupported = checkSupport();
  if (unsupported) return send(job, 'fail', {message: unsupported});
  panel.show(job.label);
  let stopped = false, reject = null;
  const heartbeat = setInterval(() => send(job, 'heartbeat', {progress: {label: job.label}}), 5000);
  current = {stop() { stopped = true; worker?.terminate(); worker = null; reject?.(new Error('cancelled')); }};
  try {
    const files = new Map();
    let index = 0;
    for (const input of job.inputs) {
      if (stopped) throw new Error('cancelled');
      panel.stage(`读取输入文件 ${++index}/${job.inputs.length}`, 0, 0);
      const response = await fetch(`/api/local-compute/jobs/${job.id}/input/${input.n}`, {headers: claimHeaders(job), cache: 'no-store'});
      if (!response.ok) throw new Error(`读取输入文件失败（HTTP ${response.status}）`);
      files.set(input.path, await response.arrayBuffer());
    }
    worker ||= new Worker('/platform/local-compute/worker.mjs', {type: 'module'});
    const result = await new Promise((resolve, fail) => {
      reject = fail;
      worker.onmessage = async event => {
        const message = event.data;
        if (message.type === 'progress') panel.stage(message.stage, message.loaded, message.total);
        else if (message.type === 'video') {
          try { worker?.postMessage({type: 'video-result', key: message.request.key, ...await answerVideo(message.request, files)}); }
          catch (error) { worker?.postMessage({type: 'video-result', key: message.request.key, error: error.message}); }
        } else if (message.type === 'done') resolve(message);
        else if (message.type === 'error') fail(new Error(message.message));
      };
      worker.onerror = event => fail(new Error(event.message || '浏览器计算出错'));
      worker.postMessage({type: 'run', job, files: [...files].map(([path, bytes]) => ({path, bytes}))});
    });
    index = 0;
    for (const output of result.outputs) {
      panel.stage(`保存结果 ${++index}/${result.outputs.length}`, 0, 0);
      const response = await fetch(`/api/local-compute/jobs/${job.id}/file?path=${encodeURIComponent(output.path)}`, {
        method: 'PUT', headers: claimHeaders(job, {'Content-Type': 'application/octet-stream'}), body: output.bytes,
      });
      if (!response.ok) throw new Error(`保存结果失败（HTTP ${response.status}）`);
    }
    await send(job, 'done', {exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr});
  } catch (error) {
    const cancelled = stopped || error.message === 'cancelled';
    await send(job, 'fail', cancelled ? {cancelled: true} : {message: error.message});
    if (!cancelled) console.error('本机计算失败', error);
  } finally {
    clearInterval(heartbeat);
    for (const video of videos.values()) URL.revokeObjectURL(video.src);
    videos.clear();
    current = null;
    panel.hide();
  }
}

// 画布积分确认：本次打开期间可以选“同一模型不再询问”。
async function answerPrompt(job) {
  const prompt = job.prompt || {};
  if (prompt.kind !== 'canvas-cost') return send(job, 'answer', {accepted: false});
  const rememberKey = `wb-canvas-cost-ok:${prompt.model}`;
  let remembered = false;
  try { remembered = sessionStorage.getItem(rememberKey) === '1'; } catch {}
  if (remembered && prompt.pointCost !== null) return send(job, 'answer', {accepted: true});
  const dialog = element('dialog', 'wb-confirm');
  const model = MODEL_LABELS[prompt.model] || prompt.model || '画布模型';
  dialog.append(element('b', '', '确认画布积分'));
  dialog.append(element('p', '', prompt.pointCost === null
    ? `这次用 ${model} 生成，暂时估不出要花多少积分。积分记在你自己的微光账号下。`
    : `这次用 ${model} 生成，要花 ${prompt.pointCost} 积分（你现在有 ${prompt.balance}）。积分记在你自己的微光账号下。`));
  if (prompt.project) dialog.append(element('p', 'wb-confirm-note', `归属：项目「${prompt.project}」选定的游戏。`));
  const label = element('label', 'wb-confirm-remember');
  const remember = element('input');
  remember.type = 'checkbox';
  label.append(remember, document.createTextNode(' 这次打开工作台期间，这个模型不再询问'));
  if (prompt.pointCost !== null) dialog.append(label);
  const actions = element('div', 'wb-confirm-actions');
  const cancel = element('button', 'button', '取消');
  const ok = element('button', 'button primary', '确定生成');
  cancel.type = ok.type = 'button';
  actions.append(cancel, ok);
  dialog.append(actions);
  document.body.append(dialog);
  dialog.showModal();
  const heartbeat = setInterval(() => send(job, 'heartbeat', {progress: {label: job.label}}), 5000);
  const accepted = await new Promise(resolve => {
    ok.onclick = () => resolve(true);
    cancel.onclick = () => resolve(false);
    dialog.oncancel = () => resolve(false);
  });
  clearInterval(heartbeat);
  if (accepted && remember.checked) { try { sessionStorage.setItem(rememberKey, '1'); } catch {} }
  dialog.close();
  dialog.remove();
  await send(job, 'answer', {accepted});
}

async function loop() {
  for (;;) {
    const started = Date.now();
    try {
      const response = await fetch('/api/local-compute/next?wait=25', {cache: 'no-store'});
      if (response.status === 401) { await sleep(30000); continue; }
      if (!response.ok) { await sleep(5000); continue; }
      const {job} = await response.json();
      if (!job) { if (Date.now() - started < 1000) await sleep(1000); continue; }
      if (job.kind === 'prompt') await answerPrompt(job);
      else await runCompute(job);
    } catch {
      await sleep(5000);
    }
  }
}

addEventListener('beforeunload', event => {
  if (current) { event.preventDefault(); event.returnValue = ''; }
});
void loop();
