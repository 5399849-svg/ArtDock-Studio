import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createJsonWriter,createRecordFile,mergeRecordsById} from '../lib/json-store.mjs';

const before=records=>new Map(records.map(record=>[record.id,JSON.stringify(record)]));

test('mergeRecordsById applies only what this copy changed, added or removed, and keeps everyone else\'s edits',()=>{
  const base=[{id:'a',v:1},{id:'b',v:1},{id:'c',v:1}];
  const current=[{id:'b',v:2},{id:'a',v:1},{id:'c',v:1},{id:'x',v:1}]; // 别人改了 b、加了 x
  const mine=[{id:'new',v:1},{id:'a',v:9},{id:'b',v:1}];                // 我改了 a、加了 new、删了 c，b 是旧的
  assert.deepEqual(mergeRecordsById(current,mine,before(base)),[{id:'new',v:1},{id:'b',v:2},{id:'a',v:9},{id:'x',v:1}]);
  // 两边都改了同一条：我的为准（只影响这一条）。
  assert.deepEqual(mergeRecordsById([{id:'a',v:5},{id:'b',v:5}],[{id:'a',v:9},{id:'b',v:1}],before([{id:'a',v:1},{id:'b',v:1}])),[{id:'a',v:9},{id:'b',v:5}]);
  // 别人删掉的，我改过也不再加回来。
  assert.deepEqual(mergeRecordsById([{id:'b',v:1}],[{id:'a',v:9},{id:'b',v:1}],before([{id:'a',v:1},{id:'b',v:1}])),[{id:'b',v:1}]);
});

test('a stale read-then-write no longer overwrites tasks changed in between; untouched files are written whole as before',async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'record-file-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const file=path.join(dir,'tasks.json'),writer=createJsonWriter(),records=createRecordFile(file,{writer});
  const load=async()=>JSON.parse(await fs.readFile(file,'utf8'));
  await fs.writeFile(file,JSON.stringify([{id:'a',v:1},{id:'b',v:1}],null,2)+'\n');

  // 没有别人插进来：照旧整份写。
  const plain=await records.read();plain[0].v=2;await records.write(plain);
  assert.deepEqual(await load(),[{id:'a',v:2},{id:'b',v:1}]);

  // 读了以后，后台把 b 改了；这份只改了 a，写回时 b 保留后台的修改。
  const stale=await records.read();
  await writer.mutate(file,tasks=>{tasks.find(task=>task.id==='b').v=7;});
  stale.find(task=>task.id==='a').v=3;await records.write(stale);
  assert.deepEqual(await load(),[{id:'a',v:3},{id:'b',v:7}]);

  // 同一份数组接着再改再写（生成过程每一步都这样）：手里的 b 还是旧的，也不能把后台的修改盖回去。
  stale.find(task=>task.id==='a').v=4;await records.write(stale);
  assert.deepEqual(await load(),[{id:'a',v:4},{id:'b',v:7}]);
  await writer.mutate(file,tasks=>{tasks.unshift({id:'c',v:1});});
  stale.find(task=>task.id==='a').v=5;await records.write(stale);
  assert.deepEqual(await load(),[{id:'c',v:1},{id:'a',v:5},{id:'b',v:7}]);

  // 不是读来的数组：照旧整份写。
  await records.write([{id:'z',v:1}]);
  assert.deepEqual(await load(),[{id:'z',v:1}]);
});
