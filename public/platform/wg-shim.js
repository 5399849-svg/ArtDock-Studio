// 平台接入的页面部分（比 app.js 先加载）：
// - 登录失效（401）时提示重新连接，不自动刷新、不清空页面上的结果；
// - 工作台正在启动或切换版本（503 WORKBENCH_STARTING）时，读取类请求自动重试；
// - 平台和本机开发入口返回的 {error:{code,message}} 换成工作台原来的 {error:"…"} 格式；
// - 启动浏览器计算（local-compute/client.mjs）。
(function () {
  const nativeFetch = window.fetch.bind(window);
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const state = {mode: 'local', user: null};
  let banner = null;

  // 重新连接回来后恢复 # 后面的部分（平台只带回路径和查询参数）。
  try {
    const saved = sessionStorage.getItem('wb-return-hash');
    if (saved && !location.hash) history.replaceState(null, '', location.pathname + location.search + saved);
    sessionStorage.removeItem('wb-return-hash');
  } catch {}

  function showBanner(kind, html) {
    if (!document.body) { document.addEventListener('DOMContentLoaded', () => showBanner(kind, html), {once: true}); return; }
    banner ||= Object.assign(document.createElement('div'), {className: 'wb-banner'});
    banner.dataset.kind = kind;
    banner.innerHTML = html;
    if (!banner.isConnected) document.body.prepend(banner);
  }
  function hideBanner(kind) {
    if (banner && banner.dataset.kind === kind) banner.remove();
  }
  function reconnect() {
    try { if (location.hash) sessionStorage.setItem('wb-return-hash', location.hash); } catch {}
    location.href = '/__wg/start?return=' + encodeURIComponent(location.pathname + location.search);
  }
  window.wbReconnect = reconnect;

  function loginExpired() {
    if (state.mode === 'local' && !state.user) {
      showBanner('login', '这一步要用你的微光账号（例如调用画布生成）。本机请先运行平台的「本机开发入口」<code>node weiguang-dev.mjs --app http://127.0.0.1:4173</code>，再从 <b>http://127.0.0.1:4310</b> 打开工作台。');
      return;
    }
    showBanner('login', '微光登录已失效。页面上的结果都还在，需要的请先下载保存，然后 <button type="button" class="button primary" onclick="wbReconnect()">重新连接</button>（会离开当前页面）。');
  }

  function isApi(input) {
    try {
      const url = new URL(typeof input === 'string' ? input : input.url, location.href);
      return url.origin === location.origin && url.pathname.startsWith('/api/') && !url.pathname.startsWith('/api/local-compute/');
    } catch { return false; }
  }

  // 记下页面最近上传的大文件（PSD、大图）：服务器要请浏览器计算这个文件时（解析 PSD 图层等），
  // local-compute/client.mjs 先看这里有没有大小和内容摘要都一样的，有就直接用，不再从服务器下载一遍（出口只有 1.5 MB/s）。
  // 只记 File/Blob 的引用（选的文件在硬盘上，不占内存），最多 4 个、两小时内的。
  const recentUploads = [];
  function rememberUpload(body) {
    const blobs = body instanceof Blob ? [body] : body instanceof FormData ? [...body.values()].filter(value => value instanceof Blob) : [];
    for (const file of blobs) {
      if (file.size < 1024 * 1024 || recentUploads.some(entry => entry.file === file)) continue;
      recentUploads.unshift({file, at: Date.now(), sha256: null});
      recentUploads.length = Math.min(recentUploads.length, 4);
    }
  }
  window.wbRecentUploads = () => recentUploads.filter(entry => Date.now() - entry.at < 2 * 60 * 60 * 1000);

  // 每个标签页一个编号，工作台的请求都带上：服务器把这次操作要的浏览器计算和“确认消耗积分”交给发起的这个标签页，
  // 不会弹到你没在看的另一个标签页上（platform/local-compute.mjs）。
  const pageId = (crypto.randomUUID?.() || `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`).replace(/[^A-Za-z0-9-]/g, '');
  window.wbPageId = pageId;
  const withPage = (input, init) => {
    const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
    headers.set('X-Workbench-Page', pageId);
    return {...init, headers};
  };
  const nativeOpen = XMLHttpRequest.prototype.open, nativeSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) { this.wbApi = isApi(String(url)); return nativeOpen.call(this, method, url, ...rest); };
  XMLHttpRequest.prototype.send = function (body) {
    try { rememberUpload(body); if (this.wbApi) this.setRequestHeader('X-Workbench-Page', pageId); } catch {}
    return nativeSend.call(this, body);
  };

  window.fetch = async function (input, init) {
    if (!isApi(input)) return nativeFetch(input, init);
    try { rememberUpload(init?.body); } catch {}
    init = withPage(input, init);
    const method = String(init?.method || (typeof input === 'object' && input.method) || 'GET').toUpperCase();
    for (let attempt = 0; ; attempt++) {
      const response = await nativeFetch(input, init);
      const json = (response.headers.get('content-type') || '').includes('json');
      if (response.status === 503 && json) {
        const body = await response.clone().json().catch(() => null);
        if (body?.code === 'WORKBENCH_STARTING') {
          showBanner('starting', `${body.error || '工作台正在启动'}……${method === 'GET' ? '会自动重试。' : '这次修改没有保存，请稍后再点一次。'}`);
          if (method === 'GET' && attempt < 60) { await sleep(2000); continue; }
        }
      } else hideBanner('starting');
      if (response.status === 401) loginExpired();
      if (!response.ok && json) {
        const body = await response.clone().json().catch(() => null);
        if (body?.error && typeof body.error === 'object') {
          return new Response(JSON.stringify({error: body.error.message || '请求失败', code: body.error.code}), {
            status: response.status, statusText: response.statusText, headers: {'Content-Type': 'application/json; charset=utf-8'},
          });
        }
      }
      return response;
    }
  };

  nativeFetch('/api/platform/status', {cache: 'no-store'}).then(response => response.json()).then(status => {
    state.mode = status.mode;
    state.user = status.user;
    document.documentElement.dataset.wbMode = status.mode;
    const apply = () => {
      // 记下名字，下次打开页面直接显示（index.html 里读）；本机不登录时照旧叫“设计师”。
      const name = status.user?.name || '设计师';
      try { if (status.user?.name) localStorage.setItem('wb-user-name', status.user.name); else localStorage.removeItem('wb-user-name'); } catch {}
      document.querySelectorAll('[data-wb-user]').forEach(node => { node.textContent = name; });
      document.querySelectorAll('[data-wb-avatar]').forEach(node => { node.textContent = name.slice(0, 1); });
      document.querySelectorAll('[data-wb-env]').forEach(node => { node.textContent = status.mode === 'platform' ? '微光平台' : '本机运行'; });
      document.querySelectorAll('[data-wb-storage]').forEach(node => {
        node.textContent = status.mode === 'platform' ? '项目与素材存在工作台自己的数据库里，全组共用' : '项目与素材保存在本机 data/runtime';
      });
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply, {once: true}); else apply();
    window.wbPlatform = {mode: status.mode, user: status.user};
    window.dispatchEvent(new CustomEvent('wb-platform', {detail: window.wbPlatform}));
  }).catch(() => {});

  import('/platform/local-compute/client.mjs').catch(error => console.error('浏览器计算没有启动', error));
})();
