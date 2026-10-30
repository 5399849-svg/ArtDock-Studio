// 每个请求的使用者身份。凭据（微光 JWT）只放在内存里：请求结束、或这次请求发起的后台任务结束，就随之释放。
import {AsyncLocalStorage} from 'node:async_hooks';
import {createHash} from 'node:crypto';

export const ACCOUNT_ORIGIN = (process.env.WG_ACCOUNT_ORIGIN || 'https://ai-huabu.r3062.com').replace(/\/$/, '');
const storage = new AsyncLocalStorage();
const identities = new Map();
const IDENTITY_TTL_MS = 5 * 60 * 1000;

export function runWithRequest(req, work) {
  const header = req.headers.authorization;
  const authorization = typeof header === 'string' && /^Bearer [A-Za-z0-9._~+/=-]{20,4096}$/.test(header) ? header : '';
  return storage.run({authorization, identity: null}, work);
}

export function currentAuthorization() {
  return storage.getStore()?.authorization || '';
}

// 投放、渠道、商店这些批次的接口先记下这次请求属于哪个项目，画布生成据此找归属游戏。
export function setProjectHint(projectId) {
  const store = storage.getStore();
  if (store && typeof projectId === 'string') store.projectId = projectId;
}
export function currentProjectHint() {
  return storage.getStore()?.projectId || '';
}

export function loginRequired(message = '登录已失效，请重新连接微光平台后再试') {
  return Object.assign(new Error(message), {status: 401, code: 'LOGIN_REQUIRED'});
}

// 身份以微光账号接口返回的 account_id 为准（不信任浏览器传来的名字）。同一张凭据 5 分钟内只问一次。
export async function currentIdentity({required = true} = {}) {
  const store = storage.getStore();
  if (store?.identity) return store.identity;
  const authorization = store?.authorization;
  if (!authorization) {
    if (required) throw loginRequired('没有微光登录身份：请从微光平台打开工作台（本机开发时挡上本机开发入口）');
    return null;
  }
  const key = createHash('sha256').update(authorization).digest('hex');
  const cached = identities.get(key);
  if (cached && cached.expiresAt > Date.now()) return (store.identity = cached.identity);
  let response;
  try {
    response = await fetch(`${ACCOUNT_ORIGIN}/api/account/me`, {headers: {Authorization: authorization}, signal: AbortSignal.timeout(15000)});
  } catch {
    throw Object.assign(new Error('暂时连不上微光账号服务，请稍后再试'), {status: 503, code: 'ACCOUNT_UNREACHABLE'});
  }
  const body = await response.json().catch(() => null);
  if (response.status === 401 || body?.status !== 0 || body?.data?.account_id == null) {
    if (required) throw loginRequired();
    return null;
  }
  const data = body.data;
  const identity = {
    accountId: String(data.account_id),
    name: String(data.display_name || data.name || data.username || data.account_id).slice(0, 60),
  };
  identities.set(key, {identity, expiresAt: Date.now() + IDENTITY_TTL_MS});
  if (identities.size > 500) for (const [k, v] of identities) if (v.expiresAt <= Date.now()) identities.delete(k);
  return (store.identity = identity);
}

// 改数据、花积分的请求必须来自本应用的页面：Origin 的主机和 Host 一样（规范 3.2）。
export function sameApp(req) {
  try { return new URL(req.headers.origin).host === req.headers.host; } catch { return false; }
}
