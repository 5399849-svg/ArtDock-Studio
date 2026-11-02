import assert from 'node:assert/strict';
import test from 'node:test';
import {groupAdBatchTasks,groupChannelBatchTasks,selectDashboardRows} from '../public/home-dashboard.js';

test('home All filter includes older tasks beyond the first twelve cards',()=>{
 const tasks=Array.from({length:25},(_,index)=>({id:`recent-${index}`,status:'批量生成'}));
 const older={id:'older-completed',project:'《梦回甄嬛传》甄嬛许愿KV延展平台尺寸',status:'已完成'};
 tasks.push(older);
 assert.equal(selectDashboardRows(tasks,'all').length,26);
 assert.equal(selectDashboardRows(tasks,'all').at(-1),older);
 assert.deepEqual(selectDashboardRows(tasks,'done'),[older]);
});

test('home groups channel deliverables by project within each batch and opens the matching item',()=>{
 const item=(id,project,file='',approved=false)=>({id,project,versions:file?[{file,url:`/storage/${file}`}]:[],sourceImages:[{url:`/storage/source-${id}.png`}],review:approved?{approved:true,versionFile:file}:null});
 const data={channels:[{id:'huawei',name:'华为'}],batches:[
  {id:'batch-a',name:'0922 华为测试',channel:'huawei',createdAt:'2026-09-22T00:00:00Z',items:[item('a1','赘婿','a1.jpg'),item('a2','赘婿','a2.jpg'),item('a3','寻道大千','a3.jpg')]},
  {id:'batch-b',name:'0924 华为测试',channel:'huawei',createdAt:'2026-09-24T00:00:00Z',items:[item('b1','赘婿','b1.jpg',true),item('b2','赘婿','b2.jpg',true)]}
 ]};
 const rows=groupChannelBatchTasks(data);
 assert.equal(rows.length,3);
 assert.deepEqual(rows.map(row=>[row.batchId,row.projectKey]),[['batch-a','赘婿'],['batch-a','寻道大千'],['batch-b','赘婿']]);
 assert.deepEqual(rows.map(row=>[row.project,row.id,row.itemCount]),[
  ['赘婿 · 0922 华为测试','a1',2],['寻道大千 · 0922 华为测试','a3',1],['赘婿 · 0924 华为测试','b1',2]
 ]);
 assert.equal(rows[0].status,'成套审核');
 assert.equal(rows[0].phase,'0/2 已验收 · 2/2 有候选');
 assert.equal(rows[2].status,'complete');
 assert.equal(rows[2].cover,'/storage/b1.jpg');
});

test('home shows one ad task per batch with accurate review progress and cover',()=>{
 const review={logoChecked:true,contentChecked:true,safeAreaChecked:true};
 const data={catalog:{sourceSha256:'sheet',specs:[{id:'ad-01'},{id:'ad-02'}]},batches:[
  {id:'batch-a',project:'桃园喝茶',sourceSha256:'sheet',createdAt:'2026-09-24T08:00:00Z',assets:[],items:{'ad-01':{versions:[{url:'/storage/a.jpg',createdAt:'2026-09-24T09:00:00Z',review}]},'ad-02':{versions:[{url:'/storage/b.jpg',review:{}}]}}},
  {id:'batch-b',project:'甄嬛送花',sourceSha256:'sheet',createdAt:'2026-09-23T08:00:00Z',assets:[{role:'visual',url:'/storage/source.png'}],items:{'ad-01':{versions:[]}}},
  {id:'batch-c',project:'成套交付',sourceSha256:'sheet',createdAt:'2026-09-22T08:00:00Z',downloadedAt:'2026-09-24T10:00:00Z',deliveredVersions:{'ad-01':1,'ad-02':1},items:{'ad-01':{versions:[{number:1}]},'ad-02':{versions:[{number:1}]}}}
 ]};
 const rows=groupAdBatchTasks(data);
 assert.equal(rows.length,3);
 assert.deepEqual(rows.map(row=>[row.id,row.project,row.status,row.phase]),[
  ['batch-a','桃园喝茶','成套审核','2/2 已生成 · 待成套下载'],
  ['batch-b','甄嬛送花','draft','0/2 已生成 · 待成套下载'],
  ['batch-c','成套交付','complete','2/2 已生成 · 已成套下载']
 ]);
 assert.equal(rows[0].cover,'/storage/a.jpg');
 assert.equal(rows[0].updatedAt,'2026-09-24T09:00:00Z');
 assert.equal(rows[1].cover,'/storage/source.png');
 assert.equal(rows[2].updatedAt,'2026-09-24T10:00:00Z');
});
