// 需要一个可以建库的 PostgreSQL：WB_TEST_DATABASE_URL=postgres://user:pass@127.0.0.1:5432/postgres node --test test/platform-persistence.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {createPersistence} from '../platform/persistence.mjs';

const admin = process.env.WB_TEST_DATABASE_URL;
const quiet = {info() {}, warn() {}, error() {}};

async function freshDatabase(t) {
  const name = `wbtest_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const client = new pg.Client({connectionString: admin});
  await client.connect();
  await client.query(`CREATE DATABASE ${name}`);
  await client.end();
  t.after(async () => {
    const cleanup = new pg.Client({connectionString: admin});
    await cleanup.connect();
    await cleanup.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    await cleanup.end();
  });
  const url = new URL(admin);
  url.pathname = `/${name}`;
  return url.toString();
}
const tempDir = async t => { const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wb-persist-')); t.after(() => fs.rm(dir, {recursive: true, force: true})); return dir; };
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

test('records go to the database and come back into an empty folder, deletions included; images and storage/ stay out of it', {skip: !admin && '没有 WB_TEST_DATABASE_URL'}, async t => {
  const databaseUrl = await freshDatabase(t);
  const first = await tempDir(t), second = await tempDir(t);
  await fs.writeFile(path.join(first, 'tasks.json'), '[]\n');
  const a = createPersistence({runtimeDir: first, databaseUrl, log: quiet});
  await a.start();
  await fs.mkdir(path.join(first, 'storage', 't1'), {recursive: true});
  await fs.writeFile(path.join(first, 'storage', 't1', 'image.png'), Buffer.from([1, 2, 3]));
  await fs.writeFile(path.join(first, 'storage', 't1', 'manifest.json'), '{}');
  await fs.mkdir(path.join(first, 'longform'), {recursive: true});
  await fs.writeFile(path.join(first, 'longform', 'jobs.json'), '["nested"]');
  await fs.writeFile(path.join(first, 'tasks.json'), '[{"id":"t1","image":"/storage/t1/image.png"}]\n');
  await fs.writeFile(path.join(first, 'gone.json'), '[]');
  await wait(800);
  await fs.rm(path.join(first, 'gone.json'));
  await a.fullScan();
  const stored = (await a.db.query('SELECT path FROM wb_files ORDER BY path')).rows.map(row => row.path);
  assert.deepEqual(stored, ['longform/jobs.json', 'tasks.json']);
  await a.stop();

  const b = createPersistence({runtimeDir: second, databaseUrl, log: quiet});
  await b.start();
  assert.equal(await fs.readFile(path.join(second, 'tasks.json'), 'utf8'), '[{"id":"t1","image":"/storage/t1/image.png"}]\n');
  assert.equal(await fs.readFile(path.join(second, 'longform', 'jobs.json'), 'utf8'), '["nested"]');
  await assert.rejects(fs.access(path.join(second, 'storage')), 'images are in the folder, not in the database');
  await assert.rejects(fs.access(path.join(second, 'gone.json')));
  await b.stop();
});

test('a new version on the same folder waits for the lock, keeps the images and takes over the last record changes', {skip: !admin && '没有 WB_TEST_DATABASE_URL'}, async t => {
  const databaseUrl = await freshDatabase(t);
  const folder = await tempDir(t);
  const a = createPersistence({runtimeDir: folder, databaseUrl, log: quiet});
  await a.start();
  await fs.mkdir(path.join(folder, 'storage', 'p1'), {recursive: true});
  await fs.writeFile(path.join(folder, 'storage', 'p1', 'layer.psd'), Buffer.from([7, 7]));
  await fs.writeFile(path.join(folder, 'layout-regions.json'), '[1]');
  await a.flush();
  const b = createPersistence({runtimeDir: folder, databaseUrl, log: quiet});
  const starting = b.start();
  await wait(1500);
  assert.equal(b.state.phase, 'waiting-lock');
  await fs.writeFile(path.join(folder, 'layout-regions.json'), '[1,2]');
  await a.stop();
  await starting;
  assert.equal(await fs.readFile(path.join(folder, 'layout-regions.json'), 'utf8'), '[1,2]');
  assert.equal((await b.db.query("SELECT size FROM wb_files WHERE path = 'layout-regions.json'")).rows[0].size, '5');
  assert.deepEqual([...await fs.readFile(path.join(folder, 'storage', 'p1', 'layer.psd'))], [7, 7]);
  await b.stop();
});

test('images an earlier version kept in the database move into the folder and leave the database', {skip: !admin && '没有 WB_TEST_DATABASE_URL'}, async t => {
  const databaseUrl = await freshDatabase(t);
  const folder = await tempDir(t);
  const setup = createPersistence({runtimeDir: await tempDir(t), databaseUrl, log: quiet});
  await setup.start();
  const content = Buffer.from([9, 8, 7]), digest = 'a'.repeat(64);
  await setup.db.query('INSERT INTO wb_blobs (sha256, size, content) VALUES ($1, 3, $2)', [digest, content]);
  await setup.db.query("INSERT INTO wb_files (path, sha256, size, mtime_ms) VALUES ('storage/old/main.png', $1, 3, 1700000000000)", [digest]);
  await setup.stop();
  const c = createPersistence({runtimeDir: folder, databaseUrl, log: quiet});
  await c.start();
  assert.deepEqual([...await fs.readFile(path.join(folder, 'storage', 'old', 'main.png'))], [9, 8, 7]);
  assert.equal((await c.db.query('SELECT count(*)::int AS n FROM wb_files')).rows[0].n, 0);
  assert.equal((await c.db.query('SELECT count(*)::int AS n FROM wb_blobs')).rows[0].n, 0);
  await c.stop();
});

test('a second instance waits for the write lock and then picks up the last changes', {skip: !admin && '没有 WB_TEST_DATABASE_URL'}, async t => {
  const databaseUrl = await freshDatabase(t);
  const first = await tempDir(t), second = await tempDir(t);
  const a = createPersistence({runtimeDir: first, databaseUrl, log: quiet});
  await a.start();
  const b = createPersistence({runtimeDir: second, databaseUrl, log: quiet});
  const starting = b.start();
  await wait(1500);
  assert.equal(b.state.phase, 'waiting-lock');
  await fs.writeFile(path.join(first, 'projects.json'), '["late change"]\n');
  await a.stop();
  await starting;
  assert.equal(await fs.readFile(path.join(second, 'projects.json'), 'utf8'), '["late change"]\n');
  await b.stop();
});
