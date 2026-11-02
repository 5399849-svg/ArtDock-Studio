import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {setTimeout as wait} from 'node:timers/promises';

const root=fileURLToPath(new URL('..',import.meta.url));

// 首页只读任务摘要（/api/bootstrap?tasks=summary），打开任务时读完整的（GET /api/tasks/:id）；只有服务器用的字段两边都不发。
test('bootstrap summaries leave out editor fields; opening a task returns them; server-only fields never reach the page',{timeout:30000},async t=>{
  const runtime=await fs.mkdtemp(path.join(os.tmpdir(),'task-summary-'));
  t.after(()=>fs.rm(runtime,{recursive:true,force:true,maxRetries:6,retryDelay:60}));
  await fs.mkdir(path.join(runtime,'storage'));
  const rules=path.join(runtime,'channel-analysis','huawei-current');await fs.mkdir(rules,{recursive:true});await fs.writeFile(path.join(rules,'华为资源位规则清单.csv'),'编号,资源位,尺寸\n');
  await fs.writeFile(path.join(runtime,'projects.json'),JSON.stringify([{id:'p',name:'项目',status:'active',assets:[]}]));
  const task={id:'t1',project:'摘要测试',status:'草稿',projectId:'p',masterTemplateId:'community-banner-master',targetTemplateIds:['missing-template'],
    assets:[{name:'kv.png',url:'/storage/t1/assets/kv.png',role:'master'}],artifacts:[{templateId:'x',url:'/storage/t1/out/x.png'}],history:[{action:'创建'}],
    coverPreview:{url:'/storage/t1/cover.png'},parameters:{focalX:3},communityDesign:{versions:[{id:'d1'}]},communityGeneration:{status:'done'},
    sourceAdaptationVersions:[{id:'v1',snapshot:{}}],communityTargetRuns:[{id:'r'}],communityTargetVersions:[{id:'tv'}],communityMaterialRuns:[{id:'m'}],communityObjectRuns:[{id:'o'}]};
  await fs.writeFile(path.join(runtime,'tasks.json'),JSON.stringify([task]));
  const port=await new Promise(resolve=>{const s=createServer();s.listen(0,'127.0.0.1',()=>{const port=s.address().port;s.close(()=>resolve(port))})});
  const child=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,PORT:String(port),WORKBENCH_RUNTIME_DIR:runtime},windowsHide:true,stdio:['ignore','ignore','pipe']});
  let errorLog='';child.stderr.on('data',chunk=>errorLog+=chunk);t.after(async()=>{if(child.exitCode===null){const stopped=new Promise(resolve=>child.once('exit',resolve));child.kill();await stopped;}});
  const base=`http://127.0.0.1:${port}`;let summary;
  for(let attempt=0;attempt<100;attempt++){if(child.exitCode!==null)throw Error(errorLog);try{const r=await fetch(base+'/api/bootstrap?tasks=summary');if(r.ok){summary=await r.json();break;}}catch{}await wait(100);}
  assert.ok(summary,'isolated server starts: '+errorLog);

  const listed=summary.tasks.find(item=>item.id==='t1');
  assert.equal(listed.summary,true);
  for(const key of ['parameters','communityDesign','templates','communityGeneration'])assert.equal(key in listed,false,`summary leaves out ${key}`);
  // 首页卡片、全部任务、资产库要用的照旧在：封面、成品、素材、记录、尺寸数。
  assert.equal(listed.coverPreview.url,'/storage/t1/cover.png');assert.equal(listed.artifacts.length,1);assert.equal(listed.assets.length,1);
  assert.equal(listed.history.length,1);assert.deepEqual(listed.targetTemplateIds,['missing-template']);assert.ok('masterTemplate' in listed);

  const full=await fetch(base+'/api/tasks/t1').then(r=>r.json());
  assert.equal(full.summary,undefined);assert.equal(full.parameters.focalX,3);assert.deepEqual(full.communityDesign.versions,[{id:'d1'}]);assert.ok(Array.isArray(full.templates));

  const plain=await fetch(base+'/api/bootstrap').then(r=>r.json());
  assert.equal(plain.tasks.find(item=>item.id==='t1').parameters.focalX,3,'without ?tasks=summary the list stays complete');
  for(const value of [listed,full,plain.tasks.find(item=>item.id==='t1')])
    for(const key of ['sourceAdaptationVersions','communityTargetRuns','communityTargetVersions','communityMaterialRuns','communityObjectRuns'])assert.equal(key in value,false,`${key} stays on the server`);
  // 只是不发给页面：库里照旧完整。
  const stored=JSON.parse(await fs.readFile(path.join(runtime,'tasks.json'),'utf8')).find(item=>item.id==='t1');
  assert.deepEqual(stored.sourceAdaptationVersions,[{id:'v1',snapshot:{}}]);assert.equal(stored.parameters.focalX,3);
});
