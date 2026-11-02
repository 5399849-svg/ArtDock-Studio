import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {safeChild} from '../lib/core.mjs';
import {extractTaskPsdAssets,exportTaskPsdLayers} from '../lib/task-psd-assets.mjs';
import {prepareSourceScene,sourceFileHash} from '../lib/source-adaptation.mjs';

// 浏览器计算（导出 PSD 图层）在任务数据的写锁外做完，锁里拿结果只做快的部分：这里没有浏览器计算，
// 一旦锁里又去调用它就会失败，测试能看出来。
async function fixture(t){
  const storageDir=await fs.mkdtemp(path.join(os.tmpdir(),'locked-compute-'));t.after(()=>fs.rm(storageDir,{recursive:true,force:true}));
  const assets=safeChild(storageDir,'t1','assets');await fs.mkdir(assets,{recursive:true});
  await fs.writeFile(path.join(assets,'源.psd'),Buffer.from('8BPS fake psd bytes'));
  return {storageDir,assets};
}

test('PSD layers exported outside the lock are registered without running the export again',async t=>{
  const {storageDir,assets}=await fixture(t);
  const temporary=await fs.mkdtemp(safeChild(storageDir,'t1','psd-extract-'));
  await sharp({create:{width:40,height:20,channels:3,background:'#336699'}}).png().toFile(path.join(temporary,'layer-1.png'));
  const exported={hash:'a'.repeat(64),sourceName:'源.psd',temporary,manifest:{layers:[{file:'layer-1.png',role:'background',layerPath:['背景'],width:40,height:20,transparent:false,sourceBounds:{x:0,y:0,width:40,height:20}}]}};
  const source={name:'源.psd',role:'master'},task={id:'t1',assets:[source]};
  const outputs=await extractTaskPsdAssets({root:path.join(storageDir,'no-scripts'),storageDir,task,source,role:'background',exported});
  assert.equal(source.psdExtraction.status,'done',JSON.stringify(source.psdExtraction));
  assert.equal(outputs.length,1);assert.equal(outputs[0].psdSourceHash,exported.hash);
  assert.ok(task.assets.some(asset=>asset.name===outputs[0].name));
  await fs.access(path.join(assets,outputs[0].name));
  await assert.rejects(fs.access(temporary),'the export folder is cleaned up');
});

test('a failed outside export is recorded as before, and a PSD extracted earlier is not exported again',async t=>{
  const {storageDir,assets}=await fixture(t);
  const source={name:'源.psd'},task={id:'t1',assets:[source]};
  await extractTaskPsdAssets({root:storageDir,storageDir,task,source,exported:{hash:'b'.repeat(64),sourceName:'源.psd',error:Object.assign(Error('x'),{stderr:'解析失败\n文件损坏'})}});
  assert.deepEqual(source.psdExtraction,{status:'failed',error:'源文件已保存，图层提取失败：文件损坏'});

  const hash=createHash('sha256').update(await fs.readFile(path.join(assets,'源.psd'))).update('visible-groups-v1').digest('hex');
  assert.deepEqual(await exportTaskPsdLayers({root:storageDir,storageDir,taskId:'t1',sourceName:'源.psd',knownHashes:[hash]}),{hash,sourceName:'源.psd'});
});

test('restoring a source scene uses the outside export: same file keeps the task and drops the export, a failed export is reported',async t=>{
  const {storageDir,assets}=await fixture(t);
  const sourcePath=safeChild(storageDir,'t1','assets','源.psd'),sourceHash=await sourceFileHash(sourcePath);
  const temporary=await fs.mkdtemp(safeChild(storageDir,'t1','source-scene-'));
  const task={id:'t1',assets:[{name:'源.psd'}],sourceAdaptation:{sourceHash},sourceImportError:'旧的'};
  assert.equal(await prepareSourceScene({root:storageDir,storageDir,task,name:'源.psd',templateMap:new Map(),exported:{name:'源.psd',sourcePath,sourceHash,temporary,manifest:{layers:[]}}}),task);
  assert.equal(task.sourceImportError,undefined);
  await assert.rejects(fs.access(temporary),'unused export folder removed');

  const other={id:'t1',assets:[{name:'源.psd'}]};
  await assert.rejects(prepareSourceScene({root:storageDir,storageDir,task:other,name:'源.psd',templateMap:new Map(),exported:{name:'源.psd',sourcePath,sourceHash,error:Error('导出失败')}}),/导出失败/);
  assert.equal(other.sourceAdaptation,undefined);
  void assets;
});
