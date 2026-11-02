import test from 'node:test';
import assert from 'node:assert/strict';
import {loadWorkbenchIndex,taskIndex,assetIndex,groupChannelBatchTasks,groupAdBatchTasks,taskStatus,taskStatusBucket,taskBelongsToProject,specIndex} from '../public/workbench-model.js';

const channelFixture=()=>({channels:[{id:'oppo',name:'OPPO'}],batches:[{id:'demand-a',name:'同批需求',channel:'oppo',createdAt:'2026-09-22T00:00:00Z',items:[
 {id:'one',project:'同项目',sourceImages:[{name:'原图.png',url:'/shared.png'}],versions:[{file:'old.jpg',url:'/old.jpg'},{file:'one.jpg',url:'/one.jpg'}]},
 {id:'two',project:'同项目',sourceImages:[{name:'原图.png',url:'/shared.png'},{name:'补图.png',url:'/second.png'}],versions:[{file:'two.jpg',url:'/two.jpg'}]},
 {id:'three',project:'另项目',sourceImages:[{url:'/third.png'}],versions:[]}
]}]});
const adFixture=()=>({catalog:{sourceSha256:'sheet',specs:[{id:'current',name:'广告位'}]},batches:[{id:'ads',project:'广告任务',projectId:'project-ad',sourceSha256:'sheet',assets:[{name:'原稿.psd',url:'/ad-preview.png',originalUrl:'/ad-original.psd',originalMime:'image/vnd.adobe.photoshop'}],items:{current:{versions:[{number:1,url:'/ad-v1.jpg',format:'JPG'},{number:2,url:'/ad-v2.jpg',format:'JPG'}]},retired:{versions:[{number:1,url:'/old-spec.gif',format:'GIF'}]}}}]});

test('统一状态支持原始阶段与已统一标签，complete须已审核才能完成',()=>{
 for(const status of ['批量生成','制作中','running'])assert.equal(taskStatusBucket({status}),'running');
 for(const status of ['成套审核','待检查'])assert.equal(taskStatus({status}),'待检查');
 assert.equal(taskStatus({status:'complete'}),'待检查');assert.equal(taskStatus({status:'complete',reviewed:true}),'已完成');
 assert.equal(taskStatus({status:'已暂停'}),'需要处理');assert.equal(taskStatus({status:'需要处理'}),'需要处理');
});

test('渠道按批次与项目计数且分组身份不依赖第一张资源顺序',()=>{
 const fixture=channelFixture(),rows=groupChannelBatchTasks(fixture,{'channel-resources:two':'project-p'});
 assert.equal(rows.length,2);assert.equal(rows[0].itemCount,2);assert.equal(rows[0].outputs.length,3);assert.equal(rows[0].sources.length,3);
 assert.equal(rows[0].projectId,'project-p');assert.equal(rows[0].sources.find(source=>source.itemId==='two').projectId,'project-p');
 assert.equal(rows[0].channelId,'oppo');assert.equal(rows[0].id,'one');
 fixture.batches[0].items.reverse();const reordered=groupChannelBatchTasks(fixture).find(row=>row.projectKey==='同项目');
 assert.equal(reordered.key,rows[0].key);assert.equal(reordered.id,'two');
 assert.equal(taskBelongsToProject(rows[0],'project-p'),true);
});

test('统一索引按任务计数，补入投放且保留旧规格全部版本、原稿与准确来源',()=>{
 const core={tasks:[{id:'core',project:'普通任务',status:'批量生成',businessLineId:'platform-community',artifacts:[{url:'/core.jpg'}]}],projects:[]};
 const groupedChannel=groupChannelBatchTasks(channelFixture()),groupedAd=groupAdBatchTasks(adFixture());
 const tasks=taskIndex(core,[{id:'stage',module:'icon-launch',project:'图标',status:'complete',reviewed:true},...groupedChannel,...groupedAd]);
 assert.equal(tasks.length,5);assert.equal(tasks.find(task=>task.module==='ad-resources').line,'performance-marketing');
 const assets=assetIndex(core,tasks);
 assert.equal(assets.filter(asset=>asset.kind==='成品').length,7);
 assert.equal(assets.find(asset=>asset.url==='/old-spec.gif').mime,'image/gif');
 assert.equal(assets.find(asset=>asset.url==='/ad-original.psd').projectId,'project-ad');
 assert.equal(assets.find(asset=>asset.url==='/ad-preview.png').mime,'image/png');
 const shared=assets.find(asset=>asset.url==='/shared.png');
 assert.equal(shared.sources.length,2);assert.deepEqual(shared.sources.map(source=>[source.itemId,source.channelId]),[['one','oppo'],['two','oppo']]);
 assert.equal(assets.find(asset=>asset.url==='/two.jpg').sources[0].itemId,'two');
 assert.equal(assets.find(asset=>asset.url==='/ad-v2.jpg').sources[0].specId,'current');
});

test('共享读取仅请求每个模块一次，失败模块保留其余任务和警告且不修改原始对象',async()=>{
 const core={projects:[],tasks:[{id:'normal',project:'普通任务',status:'草稿'}]},snapshot=JSON.stringify(core),calls=[];
 const api=async endpoint=>{calls.push(endpoint);if(endpoint==='/api/icon-preorder/jobs')throw Error('暂未启动');if(endpoint==='/api/channel-resources')return channelFixture();if(endpoint==='/api/ad-resources')return adFixture();if(endpoint==='/api/channel-resources/rules')return {rules:[{编号:'1',资源位:'社区'}]};if(endpoint==='/api/workbench/project-links')return {'icon-launch:one':'p'};if(endpoint.endsWith('/jobs'))return [{id:'one',project:'阶段任务',status:'draft'}];return {specs:[]};};
 const index=await loadWorkbenchIndex(core,api);
 assert.deepEqual(index.missing,['icon-preorder']);assert.equal(index.tasks.length,7);assert.equal(index.tasks.filter(task=>task.module==='channel-resources').length,2);assert.equal(index.tasks.filter(task=>task.module==='ad-resources').length,1);
 assert.equal(index.channelRules.rules.length,1);assert.equal(index.ad.catalog.specs.length,1);assert.equal(new Set(calls).size,calls.length);assert.equal(JSON.stringify(core),snapshot);
});

test('明确未归档覆盖历史projectId，同文件跨任务保留所有来源',()=>{
 const tasks=taskIndex({tasks:[]},[{id:'one',module:'icon-launch',project:'图标',projectId:'old',source:{url:'/same.png'}},{id:'two',module:'store-launch',project:'商店图',source:{url:'/same.png'}}],{'icon-launch:one':''});
 assert.equal(tasks[0].projectId,'');assert.equal(taskBelongsToProject(tasks[0],'unfiled'),true);
 const assets=assetIndex({},tasks);assert.equal(assets.length,1);assert.equal(assets[0].sources.length,2);
});

test('规范搜索仅消除明确同源映射，相同尺寸的不同规范保留独立身份',()=>{
 const data={templates:[
  {id:'mapped',name:'已引用华为1',width:984,height:422,sourceSpec:{channel:'huawei',number:'1'}},
  {id:'unmapped',name:'另一条同尺寸华为规范',width:984,height:422,sourceSpec:{channel:'huawei',number:'2'}},
  {id:'independent',name:'独立平台同尺寸',width:984,height:422}
 ]};
 const index={channelRules:{rules:[{编号:'1',资源位:'banner',尺寸:'984x422'},{编号:'3',资源位:'另一banner',尺寸:'984x422'}]},sets:[{module:'store-preorder',config:{specs:[{id:0,channel:'测试渠道',width:984,height:422},{channel:'测试渠道',width:984,height:422}]}}]};
 const specs=specIndex(data,index);
 assert.equal(specs.length,6);assert.equal(specs.some(spec=>spec.id==='mapped'),false);assert.equal(specs.some(spec=>spec.id==='unmapped'),true);assert.equal(specs.some(spec=>spec.id==='independent'),true);
 assert.deepEqual(specs.filter(spec=>spec.module==='channel-resources').map(spec=>spec.specId),['1','3']);
 assert.deepEqual(specs.filter(spec=>spec.module==='store-preorder').map(spec=>spec.specId),[0,'1']);
});

test('规范暂时读取失败不应让已读取到的制作任务消失',async()=>{
 const api=async endpoint=>{if(endpoint.endsWith('/specs'))throw Error('规范暂不可用');if(endpoint.endsWith('/jobs'))return [{id:endpoint.split('/')[2],project:'阶段任务'}];if(endpoint==='/api/workbench/project-links')return {};if(endpoint==='/api/channel-resources/rules')return {rules:[]};return {batches:[]};};
 const index=await loadWorkbenchIndex({tasks:[],projects:[]},api);
 assert.equal(index.tasks.length,4);assert.deepEqual(index.missing,[]);assert.equal(index.missingSpecs.length,4);
});
