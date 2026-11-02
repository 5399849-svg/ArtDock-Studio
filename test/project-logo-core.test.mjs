import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {setTimeout as wait} from 'node:timers/promises';
import sharp from 'sharp';
import {createProjectLogoLibrary} from '../lib/project-logos.mjs';
import {createPsdActions} from '../lib/store-psd-actions.mjs';

const root=fileURLToPath(new URL('..',import.meta.url));
test('core creation API copies project default into a readable task asset and supports opting out', {timeout:30000},async t=>{
  const runtime=await fs.mkdtemp(path.join(os.tmpdir(),'core-project-logo-')),storageDir=path.join(runtime,'storage');await fs.mkdir(storageDir);
  t.after(()=>fs.rm(runtime,{recursive:true,force:true,maxRetries:6,retryDelay:60}));
  const rules=path.join(runtime,'channel-analysis','huawei-current');await fs.mkdir(rules,{recursive:true});await fs.writeFile(path.join(rules,'华为资源位规则清单.csv'),'编号,资源位,尺寸\n');
  await fs.writeFile(path.join(runtime,'projects.json'),JSON.stringify([{id:'p',name:'项目',status:'active',assets:[]}]));
  const library=createProjectLogoLibrary({runtimeDir:runtime,storageDir}),logo=await sharp({create:{width:90,height:30,channels:4,background:'#19bd42'}}).png().toBuffer();
  const source=(await library.add('p',{name:'默认Logo.png',dataUrl:'data:image/png;base64,'+logo.toString('base64')})).asset;
  const port=await new Promise(resolve=>{const s=createServer();s.listen(0,'127.0.0.1',()=>{const port=s.address().port;s.close(()=>resolve(port))})});
  const child=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,PORT:String(port),WORKBENCH_RUNTIME_DIR:runtime},windowsHide:true,stdio:['ignore','ignore','pipe']});
  let errorLog='';child.stderr.on('data',chunk=>errorLog+=chunk);t.after(async()=>{if(child.exitCode===null){const stopped=new Promise(resolve=>child.once('exit',resolve));child.kill();await stopped;}});
  const base=`http://127.0.0.1:${port}`;let bootstrap;
  for(let attempt=0;attempt<100;attempt++){if(child.exitCode!==null)throw Error(errorLog);try{const r=await fetch(base+'/api/bootstrap');if(r.ok){bootstrap=await r.json();break;}}catch{}await wait(100);}
  assert.ok(bootstrap,'isolated core server starts: '+errorLog);
  const template=bootstrap.templates.find(template=>template.communityPlacement&&!template.communityMaster)||bootstrap.templates[0];
  const input={project:'新任务',projectId:'p',requester:'测试',mode:'adapt',masterTemplateId:template.id,targetTemplateIds:[template.id]};
  const create=async body=>{const r=await fetch(base+'/api/tasks',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await r.json();assert.equal(r.status,201,JSON.stringify(data));return data;};
  const task=await create(input),asset=task.assets.find(asset=>asset.role==='logo');assert.equal(asset.projectLogoId,source.id);assert.equal(asset.originalName,'默认Logo.png');
  assert.deepEqual(await fs.readFile(path.join(storageDir,task.id,'assets',asset.name)),logo,'core renderer reads by asset.name, not the display label');
  const served=await fetch(base+asset.url);assert.equal(served.status,200);assert.deepEqual(Buffer.from(await served.arrayBuffer()),logo);
  for(const mode of ['master','copy-replace']){
    const deferred=await create({...input,project:`稍后填写文案-${mode}`,mode,submit:true});
    assert.equal(deferred.copy,'');assert.equal(deferred.mode,mode);
    assert.equal(deferred.masterTemplateId,'community-banner-master');
    assert.equal(deferred.assets.find(asset=>asset.role==='logo').projectLogoId,source.id);
    const reopened=await fetch(base+`/api/tasks/${deferred.id}`).then(r=>r.json());
    assert.equal(reopened.copy,'');assert.equal(reopened.assets[0].projectLogoId,source.id);
    const emptyText=await fetch(base+`/api/tasks/${deferred.id}/community-materials`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:'title',prompt:'生成文案'})});
    // “制作主图”生成文字素材前要先确认文案；“替换文案”现在是源文件适配任务，根本不走 AI 生成素材，服务器直接拦下。
    if(mode==='master')assert.equal(emptyText.status,422,'actual text production still requires confirmed copy');
    else{assert.equal(emptyText.status,409,'copy-replace tasks adapt the source file instead of generating materials');assert.match((await emptyText.json()).error,/源文件适配任务/);}
  }
  assert.deepEqual((await create({...input,project:'纯图',projectLogoId:''})).assets,[]);
});

test('store PSD Logo can be replaced directly from its task snapshot without uploading or generating an image',async t=>{
  const storageDir=await fs.mkdtemp(path.join(os.tmpdir(),'psd-project-logo-'));t.after(()=>fs.rm(storageDir,{recursive:true,force:true,maxRetries:5,retryDelay:30}));
  const folder='store-id',dir=path.join(storageDir,folder,'project-logo');await fs.mkdir(dir,{recursive:true});
  const buffer=await sharp({create:{width:100,height:40,channels:4,background:'#19bd42'}}).png().toBuffer();await fs.writeFile(path.join(dir,'logo.png'),buffer);
  const spec={channel:'渠道',width:400,height:400,maxKB:200},layer={id:'logo',file:'old.png',visible:true,rect:{x:20,y:25,width:100,height:70}},set={method:'psd-direct',manifest:{width:400,height:400,layers:[layer]}};
  const output={channel:'渠道',width:400,height:400,page:1},job={id:'id',status:'complete',version:1,reviewed:true,outputs:[output],layerSets:{'landscape-1':set},projectLogo:{file:'logo.png',name:'任务默认 Logo'}};
  let renders=0;
  const action=createPsdActions({root,storageDir,jobStorage:()=>folder,config:{specs:[spec]},persist:async()=>{},publicJob:job=>job,runGeneration:()=>assert.fail('cannot generate'),renderLayerOutput:async(job,output)=>{renders++;assert.deepEqual(await fs.readFile(path.join(storageDir,folder,'candidates',output.layerOverrides.logo.file)),buffer);}});
  await action(job,'project-logo',{channel:'渠道',width:400,height:400,page:1});assert.equal(renders,1);assert.equal(job.version,2);assert.equal(job.reviewed,false);assert.equal(output.layerOverrides.logo.layer.rect.height,40);assert.equal(layer.file,'old.png');
});
