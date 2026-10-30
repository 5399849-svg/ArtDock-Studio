// 调用微光画布：用发起这次操作的使用者自己的凭据（积分记在他账号下），每次生成归到项目选定的游戏（规范 6.4）。
import fs from 'node:fs/promises';
import path from 'node:path';
import {currentAuthorization, currentIdentity, currentProjectHint, loginRequired} from './request-context.mjs';
import {writeJson} from '../lib/json-store.mjs';
import {askUser} from './local-compute.mjs';

export const CANVAS_API_ROOT = 'https://ai-huabu.r3062.com/api';
let runtimeDir = '';
const creating = new Map();

export function configureCanvas(options) {
  runtimeDir = options.runtimeDir;
}

const registryFile = () => path.join(runtimeDir, 'platform', 'canvases.json');
async function readJsonFile(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
}

async function resolveProject(ref) {
  const id = (typeof ref === 'string' ? ref : ref?.projectId) || currentProjectHint();
  if (!id || !runtimeDir) return null;
  const projects = await readJsonFile(path.join(runtimeDir, 'projects.json'), []);
  return projects.find(project => project.id === id) || null;
}

export function gameRequired(projectName) {
  return Object.assign(new Error(projectName
    ? `项目「${projectName}」还没有选归属游戏：到项目设置里从画布的游戏清单选好，再生成`
    : '这个任务没有所属项目，画布生成要归到一个游戏下：请先把任务放进项目并给项目选好游戏'), {status: 409, code: 'PROJECT_GAME_REQUIRED'});
}

// 只在 node --test 里：沿用测试写的模拟画布配置（AI_HUABU_CONFIG 或 <root>/config/ai-huabu.json，指向模拟服务）。
// 平时运行和平台上永远用使用者自己的凭据。
async function testCanvasConfig(root) {
  if (!process.env.NODE_TEST_CONTEXT || currentAuthorization()) return null;
  const file = process.env.AI_HUABU_CONFIG || (root ? path.join(root, 'config', 'ai-huabu.json') : '');
  const config = file ? await readJsonFile(file, null) : null;
  if (!config) return null;
  if (config.enabled === false || !String(config.token || '').trim()) throw Object.assign(new Error('画布服务未启用或缺少凭据'), {status: 503});
  return {...config, apiRoot: String(config.apiRoot || '').trim().replace(/\/$/, '') || CANVAS_API_ROOT};
}

// projectRef：任务或投放、渠道批次（带 projectId），或者项目编号。
export async function loadCanvasConfig(projectRef, {root} = {}) {
  const testing = await testCanvasConfig(root);
  if (testing) return testing;
  const authorization = currentAuthorization();
  // 没有凭据（例如服务重启后自动续跑的任务）：标成“结果待确认 / 已中断”，等使用者回来点继续，用他自己的凭据接着查，不当成失败。
  if (!authorization) throw Object.assign(loginRequired('调用画布要用发起人自己的微光登录身份：请打开工作台后点「继续」，用你的身份接着处理'), {
    editStatus: 'result_uncertain', motionStatus: 'result_uncertain', materialStatus: 'interrupted', objectStatus: 'interrupted', buttonStatus: 'interrupted',
  });
  const identity = await currentIdentity();
  const project = await resolveProject(projectRef);
  return {
    apiRoot: CANVAS_API_ROOT,
    token: authorization.slice('Bearer '.length),
    enabled: true,
    accountId: identity.accountId,
    operator: identity.name,
    gameTagId: Number(project?.gameTagId) || null,
    projectId: project?.id || '',
    projectName: project?.name || '',
  };
}

// 每个使用者、每个游戏只建一张归属画布，反复使用，免得他自己的画布列表越来越乱。
export async function accountCanvas(config, fetchImpl = fetch) {
  if (!config.gameTagId) throw gameRequired(config.projectName);
  const key = `${config.accountId}:${config.gameTagId}`;
  const registry = await readJsonFile(registryFile(), {});
  if (registry[key]?.canvasId) return registry[key].canvasId;
  if (creating.has(key)) return creating.get(key);
  const operation = (async () => {
    const response = await fetchImpl(`${config.apiRoot}/canvas-backend/canvases`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json', Authorization: `Bearer ${config.token}`},
      body: JSON.stringify({game_tag_id: config.gameTagId, title: `微光素材工作台 · ${config.projectName || '生成'}`.slice(0, 100)}),
      signal: AbortSignal.timeout(45000),
    });
    const payload = await response.json().catch(() => null);
    if (payload?.status !== 0) {
      const code = payload?.code ?? response.status;
      if (code === 401) throw loginRequired();
      throw Object.assign(new Error(payload?.msg ? `建归属画布失败：${payload.msg}` : `建归属画布失败（HTTP ${response.status}）`), {status: code === 400 ? 409 : 502, code: 'CANVAS_CREATE_FAILED'});
    }
    const canvasId = String(payload.data?.canvas_id ?? payload.data?.id ?? '');
    if (!canvasId) throw Object.assign(new Error('画布已建好但没有返回画布编号'), {status: 502});
    await fs.mkdir(path.dirname(registryFile()), {recursive: true});
    const latest = await readJsonFile(registryFile(), {});
    latest[key] = {canvasId, gameTagId: config.gameTagId, createdAt: new Date().toISOString()};
    await writeJson(registryFile(), latest);
    return canvasId;
  })();
  creating.set(key, operation);
  try { return await operation; } finally { creating.delete(key); }
}

// 提交返回 403：画布可能被使用者删掉或丢进回收站。回收站里的先恢复，彻底删了的重建；
// 被拒的那次在扣积分前就拦下了，可以用同一个 Idempotency-Key 换新画布再交一次。
export async function recoverAccountCanvas(config, canvasId, fetchImpl = fetch) {
  const restore = await fetchImpl(`${config.apiRoot}/canvas-backend/canvases/${encodeURIComponent(canvasId)}/restore`, {
    method: 'POST', headers: {Authorization: `Bearer ${config.token}`}, signal: AbortSignal.timeout(30000),
  }).catch(() => null);
  const payload = restore ? await restore.json().catch(() => null) : null;
  if (payload?.status === 0) return canvasId;
  const key = `${config.accountId}:${config.gameTagId}`;
  const registry = await readJsonFile(registryFile(), {});
  if (registry[key]?.canvasId === canvasId) {
    delete registry[key];
    await writeJson(registryFile(), registry);
  }
  return accountCanvas(config, fetchImpl);
}

export async function listGameTags() {
  const authorization = currentAuthorization();
  if (!authorization) throw loginRequired();
  let response;
  try {
    response = await fetch(`${CANVAS_API_ROOT}/canvas-backend/game-tags`, {headers: {Authorization: authorization}, signal: AbortSignal.timeout(20000)});
  } catch {
    throw Object.assign(new Error('暂时连不上画布，读不到游戏清单'), {status: 503});
  }
  const payload = await response.json().catch(() => null);
  if (payload?.status !== 0) {
    if ((payload?.code ?? response.status) === 401) throw loginRequired();
    throw Object.assign(new Error(payload?.msg || `读游戏清单失败（HTTP ${response.status}）`), {status: 502});
  }
  return (payload.data?.items || [])
    .map(item => ({id: Number(item.id), name: String(item.name || ''), sortOrder: Number(item.sort_order) || 0}))
    .filter(item => item.id > 0 && item.name)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

// 提交生成前先按这次的真实参数估价，并在发起人的工作台页面上确认（规范 6.4：提交前把要花的积分告诉使用者）。
// 积分不够、使用者取消或没有页面回答时都不提交，不扣积分。
const notSubmitted = {editStatus: 'failed', motionStatus: 'failed', materialStatus: 'failed', objectStatus: 'failed', buttonStatus: 'failed'};
export async function confirmCanvasCost(config, body, fetchImpl = fetch) {
  if (!config.accountId) return;
  try { await estimateAndAsk(config, body, fetchImpl); } catch (error) {
    // 没有提交：按“失败”记，不当成结果待确认，也不会自动重试。
    if (error.code !== 'LOGIN_REQUIRED') Object.assign(error, notSubmitted);
    throw error;
  }
}
async function estimateAndAsk(config, body, fetchImpl) {
  let estimate = null;
  try {
    const response = await fetchImpl(`${config.apiRoot}/canvas-backend/estimate`, {
      method: 'POST', headers: {'Content-Type': 'application/json', Authorization: `Bearer ${config.token}`},
      body: JSON.stringify({...body, bot_id: 'canvas'}), signal: AbortSignal.timeout(30000),
    });
    const payload = await response.json().catch(() => null);
    if (payload?.status === 0) estimate = payload.data || null;
    else if ((payload?.code ?? response.status) === 401) throw loginRequired();
  } catch (error) {
    if (error.code === 'LOGIN_REQUIRED') throw error;
  }
  if (estimate?.sufficient === false) throw Object.assign(new Error(`你的画布积分不够：这次需要 ${estimate.point_cost}，余额 ${estimate.balance}。这次没有提交`), {status: 402, code: 'CANVAS_CREDITS_LOW'});
  const answer = await askUser({
    kind: 'canvas-cost', title: '确认画布积分', model: String(body.model || ''),
    pointCost: estimate?.point_cost ?? null, balance: estimate?.balance ?? null, project: config.projectName || '',
  });
  if (!answer.accepted) throw Object.assign(new Error('你取消了这次生成：没有提交，也没有扣积分'), {status: 409, code: 'CANVAS_COST_DECLINED'});
}
