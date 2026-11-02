// 谁能做什么（2026-10-30 用户：“组员只要可以自己创建自己的任务这样就行，管理自己的文件”）：
// - 管理员：环境变量 WORKBENCH_ADMIN_ACCOUNT_IDS 写的微光账号编号（account_id，逗号或空格分开；做法同 QCanvas 的
//   QCANVAS_ADMIN_ACCOUNT_IDS，不用账号服务给的角色）。管全组共用的东西：项目（新建、删除、改设置）、项目素材库、
//   规范中心（资源位规则、模板、排版区域、分类、参考、业务线、品牌）、公司字体库；每个人的任务和文件都能看、能管。
// - 组员：自己建任务、管自己的文件。任务（平台、投放、渠道、商店、ICON、社区）和它们的文件只有建的人和管理员能看、能改、能删；
//   项目、素材库、规范中心大家都能看、能用。
// - 本机没有微光登录（没挡本机开发入口）时只有一个人在用，当管理员。
// 记录归谁写在记录自己的 owner 上（{accountId, name}），建的时候写；以前的记录启动时一次性归给 LEGACY_OWNER。
import fs from 'node:fs/promises';
import path from 'node:path';
import {currentIdentity, loginRequired} from '../platform/request-context.mjs';

// 2026-10-30 用户：“把现在的资产都归给陈美霞”（微光账号编号 14）。
export const LEGACY_OWNER = {accountId: '14', name: '陈美霞'};
const MIGRATION_FILE = 'workbench-ownership.json';
// 每种任务记录在哪个文件、键怎么写（和回收站、项目关联用的键一样）。
export const TASK_SOURCES = [
  {file: 'tasks.json', module: 'core'},
  {file: 'ad-resources-jobs.json', module: 'ad-resources'},
  {file: 'channel-resource-jobs.json', module: 'channel-resources'},
  {file: 'store-preorder-jobs.json', module: 'store-preorder'},
  {file: 'store-launch-jobs.json', module: 'store-launch'},
  {file: 'icon-preorder-jobs.json', module: 'icon-preorder'},
  {file: 'icon-launch-jobs.json', module: 'icon-launch'},
];
// 全组共用的文件夹（项目素材、品牌、规范图示、参考图）：大家都能看。
const SHARED_FOLDERS = new Set(['projects', 'brands', 'specifications', 'references']);
// 渠道资源位自带的批次「0922 华为测试」不在记录文件里（由 channel-resources-server.mjs 按示例文件夹生成），
// 它的图片在 /channel-sample/ 下。2026-10-30 用户：这两个任务也归陈美霞。
export const CHANNEL_SAMPLE_KEY = 'channel-resources:huawei-0922';
const BUILTIN_OWNERS = new Map([[CHANNEL_SAMPLE_KEY, LEGACY_OWNER.accountId]]);

const forbidden = message => Object.assign(new Error(message), {status: 403, code: 'FORBIDDEN'});

/** WORKBENCH_ADMIN_ACCOUNT_IDS 里的账号编号。写错了不当作没有管理员，直接报错（同 QCanvas）。 */
export function adminAccountIds(value = process.env.WORKBENCH_ADMIN_ACCOUNT_IDS) {
  const ids = new Set();
  for (const token of String(value || '').split(/[\s,，]+/).filter(Boolean)) {
    if (!/^\d{1,15}$/.test(token) || Number(token) <= 0) throw Object.assign(new Error('环境变量 WORKBENCH_ADMIN_ACCOUNT_IDS 写错了：只能写微光账号编号（正整数），用逗号分开'), {status: 500, code: 'ADMIN_CONFIG_INVALID'});
    ids.add(String(Number(token)));
  }
  return ids;
}

const localMode = () => !process.env.DATABASE_URL && !process.env.WG_SDK_ORIGIN;

/** 这次请求是谁、是不是管理员。 */
export async function currentViewer() {
  const identity = await currentIdentity({required: false});
  if (!identity) {
    if (localMode()) return {accountId: null, name: '本机', admin: true, local: true};
    throw loginRequired();
  }
  return {accountId: identity.accountId, name: identity.name, admin: adminAccountIds().has(identity.accountId), local: false};
}

/** 新建任务时写在记录上的主人；本机没有登录时不写。 */
export async function ownerStamp() {
  const viewer = await currentViewer();
  return viewer.accountId ? {accountId: viewer.accountId, name: viewer.name} : null;
}

export async function requireAdmin(what = '这个操作') {
  const viewer = await currentViewer();
  if (!viewer.admin) throw forbidden(`${what}只有管理员可以做，请联系管理员`);
  return viewer;
}

/** 记录对这个人可见：管理员都能看，组员只能看自己的。 */
export const visibleTo = viewer => record => viewer.admin || (Boolean(viewer.accountId) && record?.owner?.accountId === viewer.accountId);

/** /storage/<文件夹>/… 属于哪条任务：返回键；共用的返回 null；认不出来的返回 'unknown:<文件夹>'（只给管理员）。 */
export function storageKey(folder) {
  if (SHARED_FOLDERS.has(folder)) return null;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(folder)) return `core:${folder}`;
  const match = /^(ad-resources|channel-resources|store-preorder|store-launch|icon-preorder|icon-launch)-(.+)$/.exec(folder);
  return match ? `${match[1]}:${match[2]}` : `unknown:${folder}`;
}

/** 改全组共用东西的接口（只给管理员）。项目素材“用到任务里”不算，在接口里按任务的主人核对。 */
export function adminOnlyRequest(method, pathname) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return null;
  if (/^\/api\/projects\/[^/]+\/design-library\/(?:assets|templates)\/[^/]+\/use$/.test(pathname)) return null;
  if (pathname === '/api/projects' || pathname.startsWith('/api/projects/')) return '新建、删除和修改项目（包括项目素材库）';
  if (/^\/api\/(?:templates|resource-rules|resource-profiles|categories|references|business-lines|brands|specifications|layout-defaults)(?:\/|$)/.test(pathname)) return '修改规范中心';
  if (pathname === '/api/channel-resources/rules' || pathname.startsWith('/api/channel-resources/rules/')) return '修改规范中心';
  if (pathname === '/api/company-fonts/import' || pathname.startsWith('/api/company-fonts/')) return '导入和删除公司字体';
  return null;
}

/**
 * 接口地址里带的任务键（/api/tasks/:id/…、/api/ad-resources/batches/:id/…、/api/store-preorder/jobs/:id/… 等）。
 * 渠道资源位的 /items/:id 先要找到它在哪个批次，在模块里核对（channel-resources-server.mjs）。
 */
export function requestTaskKey(pathname) {
  let match = /^\/api\/tasks\/([^/]+)/.exec(pathname);
  if (match) return `core:${decodeURIComponent(match[1])}`;
  match = /^\/api\/(ad-resources|channel-resources)\/batches\/([^/]+)/.exec(pathname);
  if (match) return `${match[1]}:${decodeURIComponent(match[2])}`;
  match = /^\/api\/(store-preorder|store-launch|icon-preorder|icon-launch)\/jobs\/([^/]+)/.exec(pathname);
  if (match) return `${match[1]}:${decodeURIComponent(match[2])}`;
  return null;
}

export function createWorkbenchAccess({runtimeDir}) {
  const cache = new Map(), parsing = new Map();
  // 读每个记录文件，按修改时间缓存：键 → 主人账号编号（没有主人是 null）。
  // 同一个版本只解析一次：任务刚保存完、几十张缩略图同时来核对时，共用正在进行的那一次（以前每张都整份解析一遍）。
  async function owners(source) {
    const file = path.join(runtimeDir, source.file);
    const stat = await fs.stat(file).catch(() => null);
    if (!stat) return new Map();
    const cached = cache.get(source.file);
    if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) return cached.map;
    const version = `${stat.mtimeMs}|${stat.size}`, running = parsing.get(source.file);
    if (running?.version === version) return running.promise;
    const promise = (async () => {
      const map = new Map();
      let rows = [];
      try { const data = JSON.parse(await fs.readFile(file, 'utf8')); rows = Array.isArray(data) ? data : []; } catch { rows = []; }
      for (const row of rows) {
        if (!row?.id) continue;
        const owner = row.owner?.accountId ? String(row.owner.accountId) : null;
        map.set(`${source.module}:${row.id}`, owner);
      }
      cache.set(source.file, {mtimeMs: stat.mtimeMs, size: stat.size, map});
      return map;
    })().finally(() => { if (parsing.get(source.file)?.promise === promise) parsing.delete(source.file); });
    parsing.set(source.file, {version, promise});
    return promise;
  }
  /** 任务键的主人：{found, accountId}。 */
  async function ownerOf(key) {
    const module = key.split(':')[0];
    const source = TASK_SOURCES.find(item => item.module === module);
    if (!source) return {found: false, accountId: null};
    const map = await owners(source);
    if (map.has(key)) return {found: true, accountId: map.get(key)};
    return BUILTIN_OWNERS.has(key) ? {found: true, accountId: BUILTIN_OWNERS.get(key)} : {found: false, accountId: null};
  }
  /** 这个人能不能碰这条任务（看、改、删、下载它的文件）。 */
  async function canUse(key, viewer) {
    if (viewer.admin) return true;
    if (!viewer.accountId || key.startsWith('unknown:')) return false;
    const owner = await ownerOf(key);
    return owner.found && owner.accountId === viewer.accountId;
  }
  async function requireTask(key, viewer) {
    if (!(await canUse(key, viewer))) throw Object.assign(new Error('任务不存在，或者不是你的任务'), {status: 404, code: 'TASK_NOT_FOUND'});
  }
  /**
   * 进到模块之前统一核对：改共用的东西要管理员；地址里带任务的（含 /storage 下任务的文件）要是自己的任务。
   * 返回 null 表示放行，否则是要回的 {status, body}。
   */
  async function check(req, url) {
    const pathname = url.pathname;
    const isStorage = pathname.startsWith('/storage/') || pathname.startsWith('/channel-sample/');
    const adminWhat = adminOnlyRequest(req.method, pathname);
    const taskKey = pathname.startsWith('/channel-sample/') ? CHANNEL_SAMPLE_KEY : isStorage ? storageKey(decodeURIComponent(pathname.split('/')[2] || '')) : requestTaskKey(pathname);
    if (!adminWhat && !taskKey) return null;
    const viewer = await currentViewer();
    if (adminWhat && !viewer.admin) return {status: 403, body: {error: `${adminWhat}只有管理员可以做，请联系管理员`, code: 'ADMIN_REQUIRED'}};
    if (taskKey && !(await canUse(taskKey, viewer))) return {status: 404, body: {error: isStorage ? '文件不存在' : '任务不存在，或者不是你的任务', code: 'TASK_NOT_FOUND'}};
    return null;
  }

  /**
   * 以前的记录没有主人：一次性归给 LEGACY_OWNER（之后新建的都在建的时候写主人）。在加载模块之前调用。
   * 做过就在 workbench-ownership.json 里记下，不再做。
   */
  async function migrateLegacyOwners(owner = LEGACY_OWNER) {
    const marker = path.join(runtimeDir, MIGRATION_FILE);
    if (await fs.stat(marker).catch(() => null)) return {migrated: false};
    const assigned = {};
    for (const source of TASK_SOURCES) {
      const file = path.join(runtimeDir, source.file);
      let rows;
      try { rows = JSON.parse(await fs.readFile(file, 'utf8')); } catch { continue; }
      if (!Array.isArray(rows)) continue;
      let count = 0;
      for (const row of rows) if (row?.id && !row.owner?.accountId) { row.owner = {...owner}; count++; }
      if (!count) continue;
      const temporary = `${file}.${process.pid}.tmp`;
      await fs.writeFile(temporary, `${JSON.stringify(rows, null, 2)}\n`);
      await fs.rename(temporary, file);
      assigned[source.module] = count;
    }
    await fs.writeFile(marker, `${JSON.stringify({version: 1, legacyOwner: owner, migratedAt: new Date().toISOString(), assigned}, null, 2)}\n`);
    return {migrated: true, assigned};
  }

  return {check, canUse, requireTask, ownerOf, migrateLegacyOwners};
}
