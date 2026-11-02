import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSpecTree,moduleSpecRows,normalizeSpecSelection,specConfiguredReady} from '../public/spec-center-navigation.js';

test('stage rules with identical dimensions remain separate addressable records',()=>{
 const config={format:'PNG',specs:[{channel:'华为',width:216,height:216,badge:null},{channel:'华为',width:216,height:216,badge:'游戏中心'}]};
 const rows=moduleSpecRows('icon-preorder',config);
 assert.deepEqual(rows.map(row=>row._key),['0','1']);
 assert.deepEqual(rows.map(row=>row.badge),[null,'游戏中心']);
});

test('channel issuance owns store and ICON phases while core and ad leaves retain their IDs',()=>{
 const data={businessLines:[{id:'platform-community',name:'平台社区',segments:[{id:'platform',name:'平台资源位'},{id:'community',name:'论坛社区'},{id:'official-media',name:'公众号与外媒'}]},{id:'channel-distribution',name:'渠道发行',segments:[{id:'huawei',name:'华为'},{id:'oppo',name:'OPPO'}]},{id:'performance-marketing',name:'投放',segments:[{id:'mumu',name:'MuMu模拟器'}]}],templates:[{id:'original',businessLineId:'channel-distribution',segmentId:'huawei'}]};
 const catalogs={'store-preorder':{specs:new Array(22)},'store-launch':{specs:new Array(24)},'icon-preorder':{specs:new Array(16)},'icon-launch':{specs:new Array(36)},'channel-resources':{rules:new Array(47)},'ad-resources':{catalog:{specs:new Array(8)}}};
 const tree=buildSpecTree(data,catalogs);
 assert.deepEqual(tree[1].children.map(node=>node.label),['渠道资源位','商店图','ICON']);
 assert.equal(tree[1].children[0].children[0].count,47);
 assert.equal(tree[1].children[1].children[0].count+tree[1].children[1].children[1].count+tree[1].children[2].children[0].count+tree[1].children[2].children[1].count,98);
 assert.deepEqual(tree[0].children[1].children.map(node=>node.selection.segmentId),['community','official-media']);
 assert.equal(tree[2].children[0].count,8);
 assert.equal(tree[2].children[1].selection.segmentId,'mumu');
});

test('global search selections preserve numeric zero keys and existing core references',()=>{
 assert.equal(normalizeSpecSelection({module:'store-preorder',id:0}).specId,'0');
 assert.deepEqual(normalizeSpecSelection({module:'core',businessLineId:'platform-community',segmentId:'community',specId:'community-one'}),{module:'core',businessLineId:'platform-community',lineId:'platform-community',segmentId:'community',specId:'community-one',templateId:'community-one'});
});

test('explicit pending status at row or config level is never promoted to ready',()=>{
 for(const key of ['productionReady','ready','enabled']){
  assert.equal(specConfiguredReady({[key]:false}),false);
  assert.equal(specConfiguredReady({}, {[key]:false}),false);
 }
 assert.equal(specConfiguredReady({},{}),true);
});
