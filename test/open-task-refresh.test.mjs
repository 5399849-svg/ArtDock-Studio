import test from 'node:test';
import assert from 'node:assert/strict';
import {keepOpenTaskFull} from '../public/open-task-refresh.js';

test('reloading the list keeps the open task full, closes it when it left the list, and never falls back to the summary',()=>{
  const full={id:'a',project:'A',parameters:{focalX:1}};
  const list=[{id:'a',project:'A',summary:true},{id:'b',summary:true}];
  assert.equal(keepOpenTaskFull(list,'a',full),full);
  assert.equal(list[0],full,'the list entry becomes the full task too');
  assert.equal(list[1].summary,true);

  assert.equal(keepOpenTaskFull([{id:'b',summary:true}],'a',full),null,'deleted or handed over: close the editor');
  assert.equal(keepOpenTaskFull([{id:'b',summary:true}],'a',{error:new Error('404')}),null,'gone from the list wins over a failed read');

  const failure=new Error('连不上工作台服务');
  assert.throws(()=>keepOpenTaskFull([{id:'a',summary:true}],'a',{error:failure}),failure);
  assert.throws(()=>keepOpenTaskFull([{id:'a',summary:true}],'a',null),/任务没有读到/);
});
