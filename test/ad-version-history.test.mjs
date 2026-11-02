import test from 'node:test';
import assert from 'node:assert/strict';
import {renderAdVersionHistory,mountAdVersionHistory,fitAdHistoryPreviewSize} from '../public/ad-version-history.js';

const versions=[
  {number:1,url:'/storage/batch/candidate/one.jpg',name:'第1版.jpg',createdAt:'2026-10-22T01:00:00Z'},
  {number:2,url:'/storage/batch/candidate/two.jpg',name:'第2版.jpg',createdAt:'2026-10-22T02:00:00Z',aiEdit:{prompt:'补回名称，保留色调'}}
];

test('all candidates remain accessible with the current candidate first and copy safely escaped',()=>{
  const malicious={number:3,url:'javascript:alert(1)',name:'x" onmouseover="alert(1)',aiEdit:{prompt:'<img src=x onerror=alert(1)>'}};
  const html=renderAdVersionHistory([...versions,malicious]);
  assert.ok(html.indexOf('data-ad-history-version="3"')<html.indexOf('data-ad-history-version="2"'));
  assert.ok(html.includes('data-ad-history-version="1"'));
  assert.match(html,/当前保留方案/);assert.match(html,/&lt;img/);assert.doesNotMatch(html,/javascript:|<img src=x|" onmouseover="/);
  assert.match(renderAdVersionHistory([]),/还没有保留方案/);
});

test('selecting a history thumbnail changes only the preview and download link, never the current candidate',()=>{
  const before=structuredClone(versions),nodes={};
  for(const id of ['#ad-history-preview','#ad-history-label','#ad-history-time','#ad-history-prompt','#ad-history-download'])nodes[id]={};
  const cards=versions.map(v=>({dataset:{adHistoryVersion:String(v.number)},classList:{toggle(){}},setAttribute(){}}));
  const root={innerHTML:'',querySelector:id=>nodes[id],querySelectorAll:selector=>selector==='[data-ad-history-version]'?cards:[]};
  mountAdVersionHistory(root,versions);cards[0].onclick();
  assert.equal(nodes['#ad-history-preview'].src,versions[0].url);assert.equal(nodes['#ad-history-download'].href,versions[0].url);
  assert.match(nodes['#ad-history-label'].textContent,/第 1 版 · 历史预览/);
  assert.equal(nodes['#ad-history-time'].textContent,'10/22 09:00');
  assert.deepEqual(versions,before);
  cards[1].onclick();assert.match(nodes['#ad-history-label'].textContent,/当前保留方案/);assert.equal(nodes['#ad-history-prompt'].textContent,'补回名称，保留色调');
});

test('portrait, square and landscape previews fit inside the image viewport and leave information below unobstructed',()=>{
  for(const [width,height]of [[1080,1920],[720,1280],[800,800],[640,400],[1280,720],[4000,200]])for(const [vw,vh]of [[915,440],[520,360],[280,240]]){
    const box=fitAdHistoryPreviewSize(width,height,vw,vh);
    assert.ok(box.left>=0&&box.top>=0);
    assert.ok(box.left+box.width<=vw+1e-6&&box.top+box.height<=vh+1e-6);
    assert.ok(Math.abs(box.width/box.height-width/height)<1e-6,'the artwork must not be stretched');
  }
  assert.equal(fitAdHistoryPreviewSize(0,800,500,400),null);
});

test('each thumbnail has a separate delete control; deleting does not switch preview or mutate versions locally',async()=>{
  const before=structuredClone(versions),calls=[],nodes={'#ad-history-preview':{}},buttons=versions.map(v=>({dataset:{adDeleteVersion:String(v.number)},disabled:false}));
  const root={innerHTML:'',querySelector:selector=>nodes[selector],querySelectorAll:selector=>selector==='[data-ad-delete-version]'?buttons:[]};
  mountAdVersionHistory(root,versions,{draftDirty:true,thumbnailBase:'/api/ad-resources/batches/b/items/s',onDelete:async n=>calls.push(n)});
  assert.match(root.innerHTML,/versions\/2\/thumbnail/);assert.doesNotMatch(root.innerHTML,/当前保留方案/);
  assert.equal((root.innerHTML.match(/class="ad-history-delete"/g)||[]).length,2);assert.match(root.innerHTML,/<\/button><button type="button" class="ad-history-delete"/);
  let prevented=0,stopped=0;await buttons[0].onclick({preventDefault(){prevented++},stopPropagation(){stopped++}});
  assert.deepEqual(calls,[1]);assert.equal(prevented,1);assert.equal(stopped,1);assert.equal(buttons[0].disabled,false);assert.deepEqual(versions,before);assert.equal(nodes['#ad-history-preview'].src,undefined);
  let message;mountAdVersionHistory(root,versions,{onDelete:async()=>{throw Error('已更新')},onError:e=>message=e.message});await buttons[1].onclick({preventDefault(){},stopPropagation(){}});assert.equal(message,'已更新');assert.equal(buttons[1].disabled,false);
});

test('an unadopted candidate is clearly distinguished from retained historical versions',()=>{
 const html=renderAdVersionHistory(versions,{pendingReview:true});assert.match(html,/此前保留的版本/);assert.match(html,/查看新候选/);assert.match(html,/data-ad-tab="compose"/);assert.match(html,/two.jpg/);assert.match(html,/当前保留方案/);
});
