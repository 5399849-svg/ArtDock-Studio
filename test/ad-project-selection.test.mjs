import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Readable} from 'node:stream';
import {createAdResourcesHandler} from '../lib/ad-resources-server.mjs';
import {groupAdBatchTasks,taskIndex,assetIndex,taskBelongsToProject} from '../public/workbench-model.js';

const catalog={sourceSha256:'project-selection-sheet',specs:[]};
async function request(handle,method,url,body){
  const req=Readable.from(body?[Buffer.from(JSON.stringify(body))]:[]);req.method=method;
  let status,result;const res={writeHead(code){status=code},end(value){result=JSON.parse(String(value))}};
  await handle(req,res,new URL(url,'http://localhost'));return {status,body:result};
}
async function fixture(t){
  const runtimeDir=await fs.mkdtemp(path.join(os.tmpdir(),'ad-project-select-'));
  t.after(()=>fs.rm(runtimeDir,{recursive:true,force:true,maxRetries:5,retryDelay:30}));
  const projects=[{id:'game-a',name:'游戏 A',status:'active',assets:[{url:'/private-font.ttf'}]},{id:'game-b',name:'游戏 B',status:'active'},{id:'archived',name:'已归档项目',status:'archived'}];
  const old={id:'old',project:'以往的投放任务',sourceSha256:catalog.sourceSha256,assets:[{id:'old-art',url:'/old.png'}],items:{},downloadedAt:'2026-10-20',deliveredVersions:{}};
  await fs.writeFile(path.join(runtimeDir,'projects.json'),JSON.stringify(projects));
  await fs.writeFile(path.join(runtimeDir,'ad-resources-jobs.json'),JSON.stringify([old]));
  const links='{"ad-resources:old":"game-b"}';await fs.writeFile(path.join(runtimeDir,'workbench-project-links.json'),links);
  const make=()=>createAdResourcesHandler({root:runtimeDir,runtimeDir,storageDir:path.join(runtimeDir,'storage'),catalogProvider:async()=>catalog,nanoGenerate:()=>assert.fail('Project selection must not generate images')});
  return {runtimeDir,projects,old,links,make,handle:await make()};
}

test('new ad tasks save their selected project, survive restart and appear with their materials under that project',async t=>{
  const f=await fixture(t),listed=(await request(f.handle,'GET','/api/ad-resources')).body;
  assert.deepEqual(listed.projects.map(({id,name})=>({id,name})),[{id:'game-a',name:'游戏 A'},{id:'game-b',name:'游戏 B'}]);
  assert.ok(listed.projects.every(project=>project.defaultLogoId===''&&project.assets.length===0),'project choices expose only reusable Logos, not unrelated private fonts');
  assert.deepEqual(listed.batches,[f.old]);
  const created=await request(f.handle,'POST','/api/ad-resources/batches',{project:'新投放素材',projectId:'game-a'});
  assert.equal(created.status,201);assert.equal(created.body.batch.projectId,'game-a');assert.equal(created.body.batch.project,'新投放素材');
  const restarted=await f.make(),data=(await request(restarted,'GET','/api/ad-resources')).body;
  assert.deepEqual(data.batches.find(b=>b.id==='old'),f.old);
  assert.equal(data.batches.find(b=>b.id===created.body.batch.id).projectId,'game-a');
  assert.equal(await fs.readFile(path.join(f.runtimeDir,'workbench-project-links.json'),'utf8'),f.links);
  const batch=data.batches.find(b=>b.id===created.body.batch.id);batch.assets.push({url:'/new-source.png'});batch.items.one={versions:[{number:1,url:'/new-final.jpg'}]};
  const indexed=taskIndex({projects:f.projects},groupAdBatchTasks({...data,catalog:{...catalog,specs:[{id:'one'}]}}));
  const task=indexed.find(t=>t.id===batch.id);assert.equal(taskBelongsToProject(task,'game-a'),true);
  assert.ok(assetIndex({projects:[]},[task]).every(asset=>asset.projectId==='game-a'));
});

test('project choice stays optional and invalid or newly archived destinations never create a task',async t=>{
  const f=await fixture(t),file=path.join(f.runtimeDir,'ad-resources-jobs.json');
  for(const projectId of ['missing','archived',{},42]){
    const before=await fs.readFile(file,'utf8');
    await assert.rejects(()=>request(f.handle,'POST','/api/ad-resources/batches',{project:'不应创建',projectId}),/项目/);
    assert.equal(await fs.readFile(file,'utf8'),before);
  }
  await fs.writeFile(path.join(f.runtimeDir,'projects.json'),JSON.stringify(f.projects.map(p=>({...p,status:'archived'}))));
  await assert.rejects(()=>request(f.handle,'POST','/api/ad-resources/batches',{project:'项目选择已过期',projectId:'game-a'}),/已归档/);
  const created=(await request(f.handle,'POST','/api/ad-resources/batches',{project:'暂不归档的新任务'})).body.batch;
  assert.equal(Object.hasOwn(created,'projectId'),false);
  assert.deepEqual((await request(f.handle,'GET','/api/ad-resources')).body.batches.find(b=>b.id==='old'),f.old);
});
