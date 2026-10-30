// 工作台的数据（data/runtime 下的记录和文件）全组共用，存在应用自己的 PostgreSQL 库里（规范 3.4）。
// 程序照旧读写容器里的 data/runtime，这里负责：启动时从库里恢复，之后把每次改动写回库。
// 容器里的文件重新部署就清空，库才是唯一的保存处。同一时间只有一个程序实例能写（会话锁），
// 部署新版本时新实例等旧实例交出锁、补上最后的改动后才开始服务，避免两份程序互相覆盖。
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import {createHash, randomUUID} from 'node:crypto';
import pg from 'pg';

const LEADER_LOCK = 734_201_918;
const SCHEMA_LOCK = 734_201_917;
const SYNC_DIR = '.wb-sync';
const EXCLUDED = [/^\.wb-sync(\/|$)/, /\.tmp$/, /\.tmp-[^/]*$/, /\.[0-9a-f-]{36}\.tmp$/i, /^local-compute(\/|$)/, /^verification(\/|$)/, /\.log$/];
const excluded = rel => EXCLUDED.some(pattern => pattern.test(rel));
const toRel = (root, file) => path.relative(root, file).split(path.sep).join('/');
const sha256 = buffer => createHash('sha256').update(buffer).digest('hex');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
// 写回文件时间会有 1 毫秒的舍入误差，比较时放宽一点。
const sameTime = (a, b) => Math.abs(Number(a) - Number(b)) < 2;

async function walk(root, visit, dir = root) {
  let entries;
  try { entries = await fsp.readdir(dir, {withFileTypes: true}); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
  for (const entry of entries) {
    const full = path.join(dir, entry.name), rel = toRel(root, full);
    if (excluded(rel)) continue;
    if (entry.isDirectory()) await walk(root, visit, full);
    else if (entry.isFile()) await visit(rel, full);
  }
}

async function pool(items, limit, work) {
  let index = 0;
  await Promise.all(Array.from({length: Math.min(limit, items.length)}, async () => {
    while (index < items.length) await work(items[index++]);
  }));
}

export function createPersistence({runtimeDir: configuredDir, databaseUrl, log = console}) {
  // 用完整路径（Windows 上 8.3 短路径会让文件监视崩溃）。
  fs.mkdirSync(configuredDir, {recursive: true});
  const runtimeDir = fs.realpathSync.native(configuredDir);
  const db = new pg.Pool({connectionString: databaseUrl, max: 6});
  let leader = null, watcher = null, scanTimer = null, gcTimer = null, stopped = false;
  const index = new Map();       // rel -> {size, mtimeMs, sha256}，和库里一致的那一份
  const dirty = new Set();
  let flushTimer = null, flushing = Promise.resolve();
  const state = {phase: 'starting', error: '', files: 0, pending: 0, lastSyncAt: null};

  async function schema() {
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock($1)', [SCHEMA_LOCK]);
      await client.query(`CREATE TABLE IF NOT EXISTS wb_blobs (
        sha256 text PRIMARY KEY, size bigint NOT NULL, content bytea NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`);
      await client.query(`CREATE TABLE IF NOT EXISTS wb_files (
        path text PRIMARY KEY, sha256 text NOT NULL, size bigint NOT NULL, mtime_ms bigint NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now(), updated_by text NOT NULL DEFAULT '')`);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  const indexFile = path.join(runtimeDir, SYNC_DIR, 'index.json');
  async function saveIndex() {
    await fsp.mkdir(path.dirname(indexFile), {recursive: true});
    const temporary = `${indexFile}.${randomUUID()}.tmp`;
    await fsp.writeFile(temporary, JSON.stringify(Object.fromEntries(index)));
    await fsp.rename(temporary, indexFile);
  }
  async function loadIndex() {
    try { return new Map(Object.entries(JSON.parse(await fsp.readFile(indexFile, 'utf8')))); } catch { return new Map(); }
  }

  async function download(row) {
    const target = path.join(runtimeDir, ...row.path.split('/'));
    const {rows} = await db.query('SELECT content FROM wb_blobs WHERE sha256 = $1', [row.sha256]);
    if (!rows.length) { log.warn?.(`[数据同步] 缺少内容 ${row.path}`); return; }
    await fsp.mkdir(path.dirname(target), {recursive: true});
    const temporary = `${target}.${randomUUID()}.tmp`;
    await fsp.writeFile(temporary, rows[0].content);
    const mtime = new Date(Number(row.mtime_ms));
    await fsp.utimes(temporary, mtime, mtime);
    await fsp.rename(temporary, target);
    index.set(row.path, {size: Number(row.size), mtimeMs: Number(row.mtime_ms), sha256: row.sha256});
  }

  async function upload(rel, full) {
    let buffer, stat;
    try { stat = await fsp.stat(full); buffer = await fsp.readFile(full); } catch (error) { if (error.code === 'ENOENT') return remove(rel); throw error; }
    if (!stat.isFile()) return;
    const known = index.get(rel), digest = sha256(buffer);
    if (known?.sha256 === digest) { index.set(rel, {size: buffer.length, mtimeMs: Math.trunc(stat.mtimeMs), sha256: digest}); return; }
    const exists = await db.query('SELECT 1 FROM wb_blobs WHERE sha256 = $1', [digest]);
    if (!exists.rowCount) await db.query('INSERT INTO wb_blobs (sha256, size, content) VALUES ($1, $2, $3) ON CONFLICT (sha256) DO NOTHING', [digest, buffer.length, buffer]);
    await db.query(`INSERT INTO wb_files (path, sha256, size, mtime_ms, updated_at) VALUES ($1, $2, $3, $4, now())
      ON CONFLICT (path) DO UPDATE SET sha256 = EXCLUDED.sha256, size = EXCLUDED.size, mtime_ms = EXCLUDED.mtime_ms, updated_at = now()`,
      [rel, digest, buffer.length, Math.trunc(stat.mtimeMs)]);
    index.set(rel, {size: buffer.length, mtimeMs: Math.trunc(stat.mtimeMs), sha256: digest});
  }

  async function remove(rel) {
    if (!index.has(rel) && ![...index.keys()].some(key => key.startsWith(`${rel}/`))) return;
    await db.query('DELETE FROM wb_files WHERE path = $1 OR path LIKE $2', [rel, `${rel.replace(/[\\%_]/g, '\\$&')}/%`]);
    for (const key of [...index.keys()]) if (key === rel || key.startsWith(`${rel}/`)) index.delete(key);
  }

  // 本地和库对一遍：库是准的；上次同步以后本地新增或改过、库里没变的，按本地的写回库。
  async function reconcile({initial}) {
    const remote = new Map((await db.query('SELECT path, sha256, size, mtime_ms FROM wb_files')).rows.map(row => [row.path, row]));
    const previous = await loadIndex();
    const local = new Map();
    await walk(runtimeDir, async (rel, full) => { const stat = await fsp.stat(full); local.set(rel, {size: stat.size, mtimeMs: Math.trunc(stat.mtimeMs)}); });
    if (initial && remote.size === 0 && local.size > 0) {
      log.info?.(`[数据同步] 库是空的，把本机已有的 ${local.size} 个文件存进库`);
      await pool([...local.keys()], 4, rel => upload(rel, path.join(runtimeDir, ...rel.split('/'))));
      await saveIndex();
      return;
    }
    const downloads = [], uploads = [], deletions = [];
    for (const [rel, row] of remote) {
      const here = local.get(rel), before = previous.get(rel);
      if (here && here.size === Number(row.size) && sameTime(here.mtimeMs, row.mtime_ms)) { index.set(rel, {size: here.size, mtimeMs: here.mtimeMs, sha256: row.sha256}); continue; }
      const changedHere = here && before && (here.size !== before.size || !sameTime(here.mtimeMs, before.mtimeMs)) && before.sha256 === row.sha256;
      if (changedHere) uploads.push(rel); else downloads.push(row);
    }
    for (const [rel] of local) {
      if (remote.has(rel)) continue;
      if (previous.has(rel)) deletions.push(rel); // 上次同步过、库里已经没有：别处删掉了
      else uploads.push(rel);                    // 本机新增
    }
    await pool(downloads, 4, download);
    await pool(uploads, 4, rel => upload(rel, path.join(runtimeDir, ...rel.split('/'))));
    for (const rel of deletions) await fsp.rm(path.join(runtimeDir, ...rel.split('/')), {force: true});
    await saveIndex();
    log.info?.(`[数据同步] 已和库对齐：恢复 ${downloads.length}，写回 ${uploads.length}，删除 ${deletions.length}`);
  }

  function markDirty(rel) {
    if (!rel || excluded(rel)) return;
    dirty.add(rel);
    state.pending = dirty.size;
    clearTimeout(flushTimer);
    flushTimer = setTimeout(() => { void flush(); }, 400);
  }

  function flush() {
    flushing = flushing.catch(() => {}).then(async () => {
      const batch = [...dirty];
      dirty.clear();
      for (const rel of batch) {
        const full = path.join(runtimeDir, ...rel.split('/'));
        let stat = null;
        try { stat = await fsp.stat(full); } catch (error) { if (error.code !== 'ENOENT') throw error; }
        try {
          if (!stat) await remove(rel);
          else if (stat.isDirectory()) await walk(runtimeDir, async (child, file) => {
            const known = index.get(child), s = await fsp.stat(file);
            if (!known || known.size !== s.size || !sameTime(known.mtimeMs, s.mtimeMs)) await upload(child, file);
          }, full);
          else {
            const known = index.get(rel);
            if (!known || known.size !== stat.size || !sameTime(known.mtimeMs, stat.mtimeMs)) await upload(rel, full);
          }
        } catch (error) {
          log.error?.(`[数据同步] ${rel} 没有存进库，稍后重试：${error.message}`);
          dirty.add(rel);
        }
      }
      state.pending = dirty.size;
      state.files = index.size;
      state.lastSyncAt = new Date().toISOString();
      if (batch.length) await saveIndex().catch(() => {});
      if (dirty.size && !stopped) { clearTimeout(flushTimer); flushTimer = setTimeout(() => { void flush(); }, 3000); }
    });
    return flushing;
  }

  // 兜底：整棵目录和上次同步的结果比一遍（文件监视可能漏掉事件），包括删除。
  async function fullScan() {
    const seen = new Set();
    await walk(runtimeDir, async (rel, full) => {
      seen.add(rel);
      const known = index.get(rel), stat = await fsp.stat(full);
      if (!known || known.size !== stat.size || !sameTime(known.mtimeMs, stat.mtimeMs)) markDirty(rel);
    });
    for (const rel of index.keys()) if (!seen.has(rel)) markDirty(rel);
    await flush();
  }

  async function start() {
    await fsp.mkdir(runtimeDir, {recursive: true});
    // 数据库可能还在启动或重启：一直重试，期间接口返回 503（健康检查照常 200）。
    for (let attempt = 0; ; attempt++) {
      try { await schema(); break; } catch (error) {
        state.phase = 'waiting-database';
        state.error = error.message;
        if (attempt % 10 === 0) log.warn?.(`[数据同步] 连不上应用的数据库，3 秒后重试：${error.message}`);
        await wait(3000);
      }
    }
    state.error = '';
    leader = new pg.Client({connectionString: databaseUrl});
    // 写入权靠这条连接上的会话锁。连接断了就不能再保证只有自己在写：退出，由平台重启容器后重新对齐
    //（容器重启不清空文件，没来得及存进库的改动会在对齐时写回）。
    leader.on('error', error => {
      if (stopped) return;
      log.error?.(`[数据同步] 写入权连接断开，退出后由平台重启：${error.message}`);
      process.exit(1);
    });
    await leader.connect();
    // 等写入权之前先把库里的文件下载下来（只下载、不改库），拿到写入权后只需补上这期间的变化，切换时的停顿更短。
    state.phase = 'prefetching';
    const previous = await loadIndex();
    if (!previous.size) {
      const rows = (await db.query('SELECT path, sha256, size, mtime_ms FROM wb_files')).rows;
      await pool(rows, 4, async row => {
        const stat = await fsp.stat(path.join(runtimeDir, ...row.path.split('/'))).catch(() => null);
        if (stat && stat.size === Number(row.size) && sameTime(stat.mtimeMs, row.mtime_ms)) index.set(row.path, {size: stat.size, mtimeMs: Math.trunc(stat.mtimeMs), sha256: row.sha256});
        else if (!stat) await download(row);
      });
      if (index.size) await saveIndex();
    }
    state.phase = 'waiting-lock';
    for (let attempt = 0; ; attempt++) {
      const {rows} = await leader.query('SELECT pg_try_advisory_lock($1) AS locked', [LEADER_LOCK]);
      if (rows[0].locked) break;
      if (attempt % 15 === 0) log.info?.('[数据同步] 旧版本还在运行，等它交出写入权…');
      await wait(1000);
    }
    state.phase = 'restoring';
    await reconcile({initial: true});
    state.files = index.size;
    try {
      watcher = fs.watch(runtimeDir, {recursive: true}, (_event, name) => { if (name) markDirty(String(name).split(path.sep).join('/')); });
      watcher.on('error', error => log.error?.(`[数据同步] 文件监视出错，改用定时比对：${error.message}`));
    } catch (error) {
      log.error?.(`[数据同步] 不能监视文件变化，改用定时比对：${error.message}`);
    }
    scanTimer = setInterval(() => { void fullScan().catch(error => log.error?.(`[数据同步] 定时比对失败：${error.message}`)); }, 60_000);
    gcTimer = setInterval(() => {
      void db.query(`DELETE FROM wb_blobs b WHERE created_at < now() - interval '1 hour' AND NOT EXISTS (SELECT 1 FROM wb_files f WHERE f.sha256 = b.sha256)`).catch(() => {});
    }, 30 * 60_000);
    state.phase = 'ready';
  }

  // 收到 SIGTERM：把最后的改动存进库，再交出写入权。
  async function stop() {
    if (stopped) return;
    stopped = true;
    clearInterval(scanTimer); clearInterval(gcTimer); clearTimeout(flushTimer);
    watcher?.close();
    try { if (state.phase === 'ready') await fullScan(); } catch (error) { log.error?.(`[数据同步] 退出前同步失败：${error.message}`); }
    await leader?.end().catch(() => {});
    await db.end().catch(() => {});
  }

  return {start, stop, flush, fullScan, state, db};
}
