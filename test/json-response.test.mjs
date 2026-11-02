import test from 'node:test';
import assert from 'node:assert/strict';
import {sendJson,etagMatches} from '../lib/json-response.mjs';

const response=req=>{const r={req,status:0,headers:null,body:undefined,writeHead(status,headers){r.status=status;r.headers=headers;},end(value){r.body=value;}};return r;};

test('GET JSON carries a content ETag and answers 304 without a body when the browser already has it',()=>{
  const first=response({method:'GET',headers:{}});sendJson(first,200,{tasks:[1,2,3]});
  assert.equal(first.status,200);assert.match(first.headers.ETag,/^W\/"[\w-]+"$/);assert.equal(first.headers['Cache-Control'],'private, no-cache');
  assert.deepEqual(JSON.parse(first.body),{tasks:[1,2,3]});

  const again=response({method:'GET',headers:{'if-none-match':first.headers.ETag}});sendJson(again,200,{tasks:[1,2,3]});
  assert.equal(again.status,304);assert.equal(again.body,undefined);

  const changed=response({method:'GET',headers:{'if-none-match':first.headers.ETag}});sendJson(changed,200,{tasks:[1,2,3,4]});
  assert.equal(changed.status,200);assert.notEqual(changed.headers.ETag,first.headers.ETag);
});

test('errors, writes and in-process calls without a request stay uncached and always carry the body',()=>{
  const error=response({method:'GET',headers:{'if-none-match':'*'}});sendJson(error,404,{error:'x'});
  assert.equal(error.status,404);assert.equal(error.headers['Cache-Control'],'no-store');assert.equal(error.headers.ETag,undefined);
  const post=response({method:'POST',headers:{}});sendJson(post,200,{ok:true});
  assert.equal(post.headers.ETag,undefined);assert.ok(post.body.length);
  const internal=response(undefined);sendJson(internal,200,{ok:true});
  assert.equal(internal.status,200);assert.equal(internal.headers.ETag,undefined);assert.ok(internal.body.length);
});

test('etagMatches compares weakly and handles lists',()=>{
  assert.equal(etagMatches({headers:{'if-none-match':'W/"a", "b"'}},'"b"'),true);
  assert.equal(etagMatches({headers:{'if-none-match':'"a"'}},'W/"a"'),true);
  assert.equal(etagMatches({headers:{'if-none-match':'"a"'}},'"c"'),false);
  assert.equal(etagMatches({headers:{}},'"a"'),false);
});
