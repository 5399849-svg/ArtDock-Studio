import {getRecycleBin} from '../lib/recycle-bin.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Readable} from 'node:stream';
import {fileURLToPath} from 'node:url';
import {createStorePreorderHandler} from '../lib/store-preorder-server.mjs';
import {createIconPreorderHandler} from '../lib/icon-preorder-server.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
async function request(handle,method,url,body){
  const req=Readable.from(body?[Buffer.from(JSON.stringify(body))]:[]);req.method=method;
  let status=0,response='';const res={writeHead(code){status=code},end(value){response=String(value||'')}};
  await handle(req,res,new URL(url,'http://localhost'));
  return {status,body:JSON.parse(response)};
}

for(const [namespace,factory,config] of [
  ['store-preorder',createStorePreorderHandler,null],
  ['store-launch',createStorePreorderHandler,new URL('../config/store-launch-v1.json',import.meta.url)],
  ['icon-preorder',createIconPreorderHandler,null],
  ['icon-launch',createIconPreorderHandler,new URL('../config/icon-launch-v1.json',import.meta.url)]
])test(`${namespace} recycles, restores and purges one job while preserving the other`,async()=>{
  const runtimeDir=await fs.mkdtemp(path.join(os.tmpdir(),`${namespace}-delete-`));
  const storageDir=path.join(runtimeDir,'storage');await fs.mkdir(storageDir);
  const handle=await factory({root,runtimeDir,storageDir,namespace,...(config?{configUrl:config}:{})});
  const first=(await request(handle,'POST',`/api/${namespace}/jobs`,{project:'删除我'})).body;
  const second=(await request(handle,'POST',`/api/${namespace}/jobs`,{project:'保留我'})).body;
  const firstDir=path.join(storageDir,`${namespace}-${first.id}`),secondDir=path.join(storageDir,`${namespace}-${second.id}`);
  await fs.mkdir(firstDir);await fs.mkdir(secondDir);
  await fs.writeFile(path.join(firstDir,'marker.txt'),'delete');await fs.writeFile(path.join(secondDir,'marker.txt'),'keep');
  const removed=await request(handle,'DELETE',`/api/${namespace}/jobs/${first.id}`);
  assert.equal(removed.status,200);assert.equal(removed.body.ok,true);
  assert.deepEqual((await request(handle,'GET',`/api/${namespace}/jobs`)).body.map(job=>job.id),[second.id]);
  assert.equal(await fs.readFile(path.join(firstDir,'marker.txt'),'utf8'),'delete');
  const bin=await getRecycleBin({runtimeDir,storageDir});
  assert.equal((await request(handle,'GET',`/api/${namespace}/jobs/${first.id}`)).status,410);
  await bin.restore({ids:[removed.body.id]});
  assert.equal((await request(handle,'GET',`/api/${namespace}/jobs`)).body.length,2);
  const again=await request(handle,'DELETE',`/api/${namespace}/jobs/${first.id}`),ids=[again.body.id],plan=await bin.preview({ids});
  assert.equal(plan.freeBytes,6);await bin.purge({ids,token:plan.token,requestId:'permanent-delete-1'});
  await assert.rejects(fs.stat(path.join(firstDir,'marker.txt')),{code:'ENOENT'});
  assert.equal(await fs.readFile(path.join(secondDir,'marker.txt'),'utf8'),'keep');
});
