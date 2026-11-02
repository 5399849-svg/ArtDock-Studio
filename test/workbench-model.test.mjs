import test from 'node:test';
import assert from 'node:assert/strict';
import {taskIndex,assetIndex,taskStatus,groupAdBatchTasks} from '../public/workbench-model.js';
test('跨模块同名任务保留独立身份，项目归属只使用明确记录',()=>{
 const data={tasks:[{id:'same',project:'同名',status:'草稿',projectId:'p'}]};const jobs=[{id:'same',project:'同名',status:'complete',reviewed:false,module:'icon-launch',source:{url:'/icon.png'}},{id:'other',project:'同名',status:'complete',reviewed:true,module:'store-launch'}];
 const rows=taskIndex(data,jobs,{'icon-launch:same':'p'});assert.equal(rows.length,3);assert.equal(new Set(rows.map(r=>r.key)).size,3);assert.equal(rows.find(r=>r.module==='icon-launch').statusLabel,'待检查');assert.equal(rows.find(r=>r.module==='store-launch').projectId,'');assert.equal(taskStatus({status:'paused'}),'需要处理');assert.equal(taskStatus({status:'running'}),'制作中');
});
test('资产索引涵盖项目原图、普通成品、渠道源图、PSD分层和渠道成品',()=>{
 const data={projects:[{id:'p',assets:[{name:'logo',url:'/logo.png'}]}]};const tasks=[{key:'core:1',projectId:'p',label:'任务',assets:[{url:'/source.png'}],artifacts:[{url:'/result.jpg'}]},{key:'store-launch:2',projectId:'p',sources:[{url:'/store.png'}],outputs:[{url:'/store-result.jpg'}],layerSets:{one:{manifest:{layers:[{url:'/character.png',name:'人物'}]}}}}];
 const assets=assetIndex(data,tasks);assert.equal(assets.length,6);assert.equal(assets.filter(a=>a.kind==='成品').length,2);assert.equal(assets.find(a=>a.name==='人物').projectId,'p');assert.equal(assets.find(a=>a.name==='人物').taskKey,'store-launch:2');
});

const adMotionFixture=status=>({catalog:{sourceSha256:'fixture',specs:[{id:'jpg',name:'静态',format:'JPG'},{id:'gif',name:'动态',format:'GIF'}]},batches:[{id:'batch',project:'有旧动图的任务',sourceSha256:'fixture',downloadedAt:'2026-10-15T01:00:00.000Z',deliveredVersions:{jpg:1,gif:1},assets:[],items:{jpg:{versions:[{number:1,url:'/original.jpg'}]},gif:{versions:[{number:1,url:'/previous.gif'}],motionJob:{status,model:'kling_v3',error:['failed','result_uncertain','cancelled'].includes(status)?'动效未完成':''}}}}]});

test('投放任务重新生成动效时，旧动图与历史下载不能把新任务误报为成套审核或已完成',()=>{
 for(const status of ['queued','preparing','submitting','submitted','processing','downloading','encoding']){
  const row=groupAdBatchTasks(adMotionFixture(status))[0];
  assert.equal(taskStatus(row),'制作中',status);assert.equal(row.reviewed,false,status);
  assert.ok(!['complete','成套审核'].includes(row.status),status);
  assert.equal(row.outputs.length,2,'旧成品仍保留在历史资产中');
 }
});

test('投放动效失败或提交结果未知时，即使有旧稿也显示需要处理',()=>{
 for(const status of ['failed','cancelled','result_uncertain']){
  const row=groupAdBatchTasks(adMotionFixture(status))[0];
  assert.equal(taskStatus(row),'需要处理',status);assert.equal(row.reviewed,false,status);assert.ok(row.error,status);
 }
});

test('已完成动效和无动效任务的历史成套交付状态保持兼容',()=>{
 const completed=groupAdBatchTasks(adMotionFixture('completed'))[0];assert.equal(taskStatus(completed),'已完成');assert.equal(completed.reviewed,true);
 const legacy=adMotionFixture('completed');delete legacy.batches[0].items.gif.motionJob;
 assert.equal(taskStatus(groupAdBatchTasks(legacy)[0]),'已完成');
});

test('新规范失效稿不计入完成进度，退役动图只保留在历史资产中',()=>{
 const data=adMotionFixture('completed');data.catalog.specs=[{id:'jpg',name:'当前静态',format:'JPG'}];
 const batch=data.batches[0];batch.retiredSpecs=[{id:'gif',name:'旧规范动图'}];
 batch.items.gif.motionJob.status='failed';batch.items.jpg.versions[0].invalidatedReason='现要求无 Logo，请重制';
 const row=groupAdBatchTasks(data)[0];
 assert.equal(row.total,1);assert.equal(row.progress,0);assert.equal(row.reviewed,false);assert.equal(taskStatus(row),'需要处理');
 assert.equal(row.outputs.length,2);assert.equal(row.outputs.find(v=>v.specId==='gif').resource,'旧规范动图');
 assert.match(row.error,/无 Logo/);
});
