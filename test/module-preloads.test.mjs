import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createModulePreloads,staticImports} from '../lib/module-preloads.mjs';

test('staticImports finds import and export-from specifiers, not dynamic imports or commented-out lines',()=>{
  const source=[
    "import {a,b} from '/a.js?v=1';",
    "import x from './x.js';import '/side.js'",
    'import * as ns from "../ns.js";',
    'import {\n  multi,\n  line as other\n} from "/multi.js";',
    "export {y} from './y.js';export * from '/all.js';",
    "// import {gone} from '/gone.js';",
    "/* import {block} from '/block.js'; */",
    "const later=await import('/lazy.js');",
    "const text='not an import from \"/fake.js\"';",
  ].join('\n');
  assert.deepEqual(staticImports(source),['/a.js?v=1','./x.js','/side.js','../ns.js','/multi.js','./y.js','/all.js']);
});

test('index.html gets one modulepreload per module the entry reaches, with the exact address each import uses',async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'module-preloads-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  await fs.mkdir(path.join(dir,'lib'));
  const files={
    'index.html':'<html><head><title>t</title></head><body><script src="/classic.js"></script><script type="module" src="/app.js?v=7"></script></body></html>',
    'app.js':"import {a} from '/lib/a.js?v=2';\nimport {b} from './lib/b.js';\nimport {gone} from '/missing.js';\nimport('/lazy.js');\nimport ext from 'https://cdn.example/x.js';",
    'lib/a.js':"import {c} from './c.js';\nimport {b} from '/lib/b.js';",
    'lib/b.js':"export const b=1;",
    'lib/c.js':"import {a} from '/lib/a.js?v=2';export const c=1;",
    'lazy.js':'export {}',
  };
  for(const [name,body] of Object.entries(files))await fs.writeFile(path.join(dir,name),body);
  const preloads=createModulePreloads(dir);
  const {body,etag}=await preloads.render(path.join(dir,'index.html'));
  const links=[...body.matchAll(/<link rel="modulepreload" href="([^"]+)">/g)].map(m=>m[1]);
  assert.deepEqual(links,['/lib/a.js?v=2','/lib/b.js','/lib/c.js'],'each address once, missing/lazy/external/entry left out');
  assert.ok(body.indexOf('modulepreload')<body.indexOf('</head>'));
  assert.match(etag,/^W\/"[0-9a-f]{20}"$/);

  // 改了 import 不用重启：按修改时间重新读。
  await new Promise(resolve=>setTimeout(resolve,20));
  await fs.writeFile(path.join(dir,'lib/b.js'),"import '/lazy.js';export const b=2;");
  const again=await preloads.render(path.join(dir,'index.html'));
  assert.ok(again.body.includes('href="/lazy.js"'));assert.notEqual(again.etag,etag);

  const response=()=>{const r={status:0,headers:null,body:undefined,writeHead(status,headers){r.status=status;r.headers=headers;},end(value){r.body=value;}};return r;};
  const first=response();await preloads.serveIndex({method:'GET',headers:{}},first,path.join(dir,'index.html'));
  assert.equal(first.status,200);assert.equal(first.headers['Content-Type'],'text/html; charset=utf-8');assert.ok(first.body.includes('modulepreload'));
  const cached=response();await preloads.serveIndex({method:'GET',headers:{'if-none-match':first.headers.ETag}},cached,path.join(dir,'index.html'));
  assert.equal(cached.status,304);assert.equal(cached.body,undefined);
});

// 同一层的文件并行读，谁先读完不能影响列表顺序：否则首页内容和 ETag 会变，浏览器白白重下。
test('the preload list and its ETag are the same however file reads interleave',async()=>{
  const publicDir=fileURLToPath(new URL('../public',import.meta.url));
  const renders=await Promise.all(Array.from({length:8},()=>createModulePreloads(publicDir).render(path.join(publicDir,'index.html'))));
  assert.equal(new Set(renders.map(r=>r.etag)).size,1);
});
