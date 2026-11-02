import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createModulePreloads} from '../lib/module-preloads.mjs';

const publicDir=fileURLToPath(new URL('../public',import.meta.url));

// 页面空闲时不能每秒问一次服务器：等任务的请求要真的在服务器上等（wait 是毫秒）。
test('the browser-compute long poll asks the server to hold the request for many seconds',async()=>{
  const client=await fs.readFile(`${publicDir}/platform/local-compute/client.mjs`,'utf8');
  const wait=Number(/\/api\/local-compute\/next\?wait=(\d+)/.exec(client)?.[1]);
  assert.ok(wait>=10_000,`wait=${wait} ms`);
});

// 同一个脚本用不同的地址（?v=…）导入，浏览器会当成不同的模块：多下一份，模块里的状态（字体缓存等）也分成两份。
test('every page module is loaded under one address (except the intentional launch-phase copies)',async()=>{
  const {body}=await createModulePreloads(publicDir).render(`${publicDir}/index.html`);
  const byFile=new Map();
  for(const [,href] of body.matchAll(/<link rel="modulepreload" href="([^"]+)">/g)){
    const address=href.replace(/&amp;/g,'&'),[file,query='']=address.split('?');
    if(new URLSearchParams(query).get('phase')==='launch')continue;
    byFile.set(file,[...(byFile.get(file)||[]),address]);
  }
  assert.ok(byFile.size>50);
  assert.deepEqual([...byFile].filter(([,addresses])=>addresses.length>1),[]);
});
