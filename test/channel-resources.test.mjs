import {getRecycleBin} from '../lib/recycle-bin.mjs';
import {existsSync} from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Readable} from 'node:stream';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import {createChannelResourcesHandler} from '../lib/channel-resources-server.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const workbook=path.join(root,'渠道资源位','华为资源位','0922测试','0922-华为需求表.xlsx');
function request(handler,method,pathname,body){
  const req=Readable.from(body?[Buffer.from(JSON.stringify(body))]:[]);req.method=method;
  let code=0,buffer='';const res={writeHead(status){code=status;},end(chunk){buffer=Buffer.isBuffer(chunk)?chunk.toString():String(chunk||'');}};
  return handler(req,res,new URL(pathname,'http://localhost')).then(()=>({code,body:JSON.parse(buffer)}));
}

test('channel resource import follows the revised community brief and preserves separate deliverables',{skip:existsSync(workbook)?false:'本机没有样例需求表：渠道资源位/华为资源位/0922测试/0922-华为需求表.xlsx'},async()=>{
  const runtimeDir=await fs.mkdtemp(path.join(os.tmpdir(),'channel-resource-test-'));
  const storageDir=path.join(runtimeDir,'storage');
  const rulesDir=path.join(runtimeDir,'channel-analysis','huawei-current');
  await fs.mkdir(rulesDir,{recursive:true});await fs.mkdir(storageDir,{recursive:true});
  await fs.copyFile(path.join(root,'data','runtime','channel-analysis','huawei-current','华为资源位规则清单.csv'),path.join(rulesDir,'华为资源位规则清单.csv'));
  const handle=await createChannelResourcesHandler({root,runtimeDir,storageDir});
  const imported=await request(handle,'POST','/api/channel-resources/import',{channel:'huawei',path:workbook});
  assert.equal(imported.code,201);assert.equal(imported.body.itemCount,4);
  const listed=await request(handle,'GET','/api/channel-resources');
  const batch=listed.body.batches.find(b=>b.id===imported.body.id);
  assert.equal(batch.items.length,4);
  assert.deepEqual(batch.items.slice(0,2).map(item=>[item.category,item.resource,item.template]),[
    ['鸿蒙','社区',''],['鸿蒙','社区','']
  ]);
  assert.equal(batch.items[0].rule?.id,'19');
  assert.equal(batch.items[0].maxBytes,400*1024);
  assert.equal(batch.items[2].sourceCopy,batch.items[3].sourceCopy);
  assert.ok(batch.items[0].sourceImages.length>=1);
  assert.equal(batch.items[0].hasRuleConflict,false);
  assert.equal(batch.items[3].requirements,'');
  const huawei=batch.items[0];
  const huaweiImage=await sharp({create:{width:huawei.width,height:huawei.height,channels:3,background:'#f5f5f5'}}).jpeg({quality:65}).toBuffer();
  const huaweiVersion=await request(handle,'POST',`/api/channel-resources/items/${huawei.id}/versions`,{dataUrl:`data:image/jpeg;base64,${huaweiImage.toString('base64')}`});
  assert.equal(huaweiVersion.code,201);
  assert.equal(huaweiVersion.body.version.sceneUrl,null);
  assert.equal(huaweiVersion.body.version.sceneKind,null);
  const banner=batch.items[2];
  const bannerImage=await sharp({create:{width:banner.width,height:banner.height,channels:3,background:'#f5f5f5'}}).jpeg({quality:65}).toBuffer();
  const bannerVersion=await request(handle,'POST',`/api/channel-resources/items/${banner.id}/versions`,{dataUrl:`data:image/jpeg;base64,${bannerImage.toString('base64')}`});
  assert.equal(bannerVersion.code,201);
  assert.equal(bannerVersion.body.version.sceneKind,'华为 PSD 模板预览');
  const sceneFile=path.join(storageDir,`channel-resources-${batch.id}`,'candidate',path.basename(bannerVersion.body.version.sceneUrl));
  assert.deepEqual(await sharp(sceneFile).metadata().then(({width,height})=>[width,height]),[banner.width,banner.height]);
  await assert.rejects(()=>request(handle,'POST','/api/channel-resources/import',{channel:'oppo',path:workbook}),/仅支持华为渠道/);

  const manual=await request(handle,'POST','/api/channel-resources/manual',{channel:'oppo',project:'测试项目',resource:'首页大卡',size:'800x600',quantity:3,format:'JPG',limit:'＜100KB'});
  assert.equal(manual.code,201);assert.equal(manual.body.itemCount,3);
  const listedAgain=await request(handle,'GET','/api/channel-resources');
  const opBatch=listedAgain.body.batches.find(b=>b.id===manual.body.id);
  assert.equal(new Set(opBatch.items.map(i=>i.id)).size,3);
  assert.deepEqual(opBatch.items.map(i=>i.copyIndex),[1,2,3]);
  const one=opBatch.items[0];const image=await sharp({create:{width:800,height:600,channels:3,background:'#f5f5f5'}}).jpeg({quality:70}).toBuffer();
  const added=await request(handle,'POST',`/api/channel-resources/items/${one.id}/versions`,{dataUrl:`data:image/jpeg;base64,${image.toString('base64')}`});
  assert.equal(added.code,201);assert.equal(added.body.version.bytes,image.length);
  await assert.rejects(()=>request(handle,'POST',`/api/channel-resources/items/${one.id}/review`,{sceneVerified:false,rulesConfirmed:true,versionFile:added.body.version.file}),/场景与规范差异核对/);
  const reviewed=await request(handle,'POST',`/api/channel-resources/items/${one.id}/review`,{sceneVerified:true,rulesConfirmed:true,note:'测试验收记录',versionFile:added.body.version.file});
  assert.equal(reviewed.body.review.approved,true);
  const projects=[...new Set(batch.items.map(item=>item.project))];
  assert.equal(projects.length,2);
  const beforeDeletion=(await request(handle,'GET','/api/channel-resources')).body.batches.find(entry=>entry.id===batch.id);
  const firstProjectItems=batch.items.filter(item=>item.project===projects[0]);
  const secondProjectItems=batch.items.filter(item=>item.project===projects[1]);
  const removed=await request(handle,'DELETE',`/api/channel-resources/batches/${batch.id}/projects/${encodeURIComponent(projects[0])}`);
  assert.equal(removed.code,200);assert.equal(removed.body.recycled,true);
  const afterProjectDelete=(await request(handle,'GET','/api/channel-resources')).body.batches.find(entry=>entry.id===batch.id);
  assert.deepEqual(afterProjectDelete.items.map(item=>item.id),secondProjectItems.map(item=>item.id));
  assert.ok((await request(handle,'GET','/api/channel-resources')).body.batches.some(entry=>entry.id===opBatch.id));
  const final=await request(handle,'DELETE',`/api/channel-resources/batches/${batch.id}/projects/${encodeURIComponent(projects[1])}`);
  assert.equal(final.body.recycled,true);
  assert.ok(!(await request(handle,'GET','/api/channel-resources')).body.batches.some(entry=>entry.id===batch.id));
  await fs.access(path.join(storageDir,`channel-resources-${batch.id}`));
  const bin=await getRecycleBin({runtimeDir,storageDir});await bin.restore({ids:[removed.body.id,final.body.id]});
  const restored=(await request(handle,'GET','/api/channel-resources')).body.batches.find(entry=>entry.id===batch.id);assert.deepEqual(restored.items,beforeDeletion.items);
  assert.equal(restored.items.length,4);
  const before=JSON.parse(await fs.readFile(path.join(runtimeDir,'channel-resource-overlays.json'),'utf8'));
  const recycled=await request(handle,'DELETE',`/api/channel-resources/batches/${batch.id}/projects/${encodeURIComponent(projects[0])}`),ids=[recycled.body.id],plan=await bin.preview({ids});assert.equal(plan.freeBytes,0);await bin.purge({ids,token:plan.token,requestId:'channel-purge-1'});
  const kept=(await request(handle,'GET','/api/channel-resources')).body.batches.find(entry=>entry.id===batch.id);assert.deepEqual(kept.items,restored.items.filter(i=>i.project===projects[1]));
  const after=JSON.parse(await fs.readFile(path.join(runtimeDir,'channel-resource-overlays.json'),'utf8'));for(const item of kept.items)assert.deepEqual(after[item.id],before[item.id]);
});

test('Huawei sample keeps one current artwork when replaced',async()=>{
  const runtimeDir=await fs.mkdtemp(path.join(os.tmpdir(),'channel-resource-sample-'));
  const storageDir=path.join(runtimeDir,'storage');
  const rulesDir=path.join(runtimeDir,'channel-analysis','huawei-current');
  const sampleDir=path.join(runtimeDir,'channel-analysis','0922-test');
  await fs.mkdir(rulesDir,{recursive:true});
  await fs.mkdir(path.join(sampleDir,'candidates-v1'),{recursive:true});
  await fs.copyFile(path.join(root,'data/runtime/channel-analysis/huawei-current/华为资源位规则清单.csv'),path.join(rulesDir,'华为资源位规则清单.csv'));
  await fs.copyFile(path.join(root,'data/runtime/channel-analysis/0922-test/制作任务清单.json'),path.join(sampleDir,'制作任务清单.json'));
  await fs.copyFile(path.join(root,'data/runtime/channel-analysis/0922-test/candidates-v1/checks.json'),path.join(sampleDir,'candidates-v1','checks.json'));
  const handle=await createChannelResourcesHandler({root,runtimeDir,storageDir});
  const itemId='HW0922-01',route=`/api/channel-resources/items/${itemId}/versions`;
  const initial=(await request(handle,'GET','/api/channel-resources')).body.batches.find(batch=>batch.id==='huawei-0922').items[0];
  assert.equal(initial.versions.length,1);
  assert.equal(initial.versions[0].name,'当前交付稿');
  await request(handle,'PUT',`/api/channel-resources/items/${itemId}/editor-draft`,{backgroundUrl:initial.versions[0].url,layers:[]});
  for(const color of ['#f5e3d1','#e1daf0']){
    const image=await sharp({create:{width:1920,height:1080,channels:3,background:color}}).jpeg({quality:60}).toBuffer();
    const result=await request(handle,'POST',route,{dataUrl:`data:image/jpeg;base64,${image.toString('base64')}`});
    assert.equal(result.code,201);
  }
  const final=(await request(handle,'GET','/api/channel-resources')).body.batches.find(batch=>batch.id==='huawei-0922').items[0];
  assert.equal(final.versions.length,1);
  assert.equal(final.versions[0].name,'当前交付稿');
  assert.equal(final.editor.backgroundUrl,final.versions[0].url);
  const files=await fs.readdir(path.join(storageDir,'channel-resources-huawei-0922','candidate'));
  assert.deepEqual(files,[final.versions[0].file]);
});
