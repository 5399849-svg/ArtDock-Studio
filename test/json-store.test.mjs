import test from 'node:test';
import assert from 'node:assert/strict';
import {createJsonWriter} from '../lib/json-store.mjs';

test('Windows sharing failures retry replacement without rewriting or truncating destination JSON',async()=>{
  const calls=[],temps=new Map();let attempts=0;
  const write=createJsonWriter({wait:async ms=>calls.push(['wait',ms]),files:{
    writeFile:async(file,value)=>{calls.push(['write',file]);temps.set(file,value)},
    rename:async(from,to)=>{calls.push(['rename',from,to]);if(attempts++<2)throw Object.assign(Error('locked'),{code:'EPERM'});temps.set(to,temps.get(from));temps.delete(from)},
    unlink:async file=>{temps.delete(file)},
  }});
  await write('tasks.json',{status:'done'});
  assert.equal(JSON.parse(temps.get('tasks.json')).status,'done');assert.equal(calls.filter(c=>c[0]==='write').length,1);assert.equal(calls.filter(c=>c[0]==='rename').length,3);
  assert.deepEqual(calls.filter(c=>c[0]==='wait').map(c=>c[1]),[25,50]);
});

test('simultaneous writes to one file use unique temporary paths, preserve invocation order and snapshot their payload',async()=>{
  const writes=[],renames=[];const write=createJsonWriter({files:{writeFile:async(file,value)=>writes.push([file,JSON.parse(value)]),rename:async(from,to)=>renames.push([from,to]),unlink:async()=>{}}});
  const payload={version:1},first=write('tasks.json',payload);payload.version=99;
  const second=write('tasks.json',{version:2});await Promise.all([first,second]);
  assert.deepEqual(writes.map(w=>w[1].version),[1,2]);assert.notEqual(writes[0][0],writes[1][0]);assert.deepEqual(renames.map(r=>r[0]),writes.map(w=>w[0]));
});

test('a permanent failure does not poison subsequent saves or pretend to have persisted a result',async()=>{
  let fails=true;const write=createJsonWriter({wait:async()=>{},files:{writeFile:async()=>{},rename:async()=>{if(fails)throw Object.assign(Error('denied'),{code:'EPERM'})},unlink:async()=>{}}});
  await assert.rejects(write('tasks.json',{version:1}),/denied/);fails=false;await write('tasks.json',{version:2});
});

test('read-modify-write transactions serialize user edits with generation progress instead of losing either change',async()=>{
  let stored=JSON.stringify({logoX:10,progress:0});const temps=new Map();
  const write=createJsonWriter({files:{readFile:async()=>stored,writeFile:async(file,value)=>temps.set(file,value),rename:async file=>{stored=temps.get(file);temps.delete(file)},unlink:async()=>{}}});
  await Promise.all([write.mutate('tasks.json',async task=>{await Promise.resolve();task.logoX=20}),write.mutate('tasks.json',task=>{task.progress=1})]);
  assert.deepEqual(JSON.parse(stored),{logoX:20,progress:1});
  await assert.rejects(write.mutate('tasks.json',task=>{task.logoX=999;throw Error('validation failed')}),/validation failed/);
  assert.equal(JSON.parse(stored).logoX,20);
});
