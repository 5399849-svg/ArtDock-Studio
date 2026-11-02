import test from 'node:test';
import assert from 'node:assert/strict';
import {submitGeneration} from '../lib/ai-huabu.mjs';

const config={apiRoot:'https://canvas.test/api',token:'test-placeholder',gameTagId:27};
test('legacy image submissions create a canvas and retain all reference images and the selected model',async()=>{
  const body={model:'gpt-image-2',task_type:'image',prompt:'使用图2角色',images:[{data_base64:'style'},{data_base64:'character'}]},before=structuredClone(body),calls=[];
  const job=await submitGeneration(config,body,{idempotencyKey:'one-submission',fetchImpl:async(url,init)=>{
    calls.push({url,body:JSON.parse(init.body),headers:init.headers});
    return url.endsWith('/canvases')?Response.json({status:0,data:{canvas_id:'created-canvas'}}):Response.json({status:0,data:{job_id:'image-job'}});
  }});
  assert.equal(job,'image-job');assert.equal(calls.length,2);assert.equal(calls[0].body.game_tag_id,27);assert.equal(calls[1].body.canvas_id,'created-canvas');assert.deepEqual(calls[1].body.images,body.images);assert.equal(calls[1].headers['Idempotency-Key'],'one-submission');assert.deepEqual(body,before);
});
test('a shared caller canvas is reused without creating another canvas',async()=>{
  const calls=[];await submitGeneration(config,{model:'banana_pro',canvas_id:'run-canvas'},{fetchImpl:async(url,init)=>{calls.push({url,body:JSON.parse(init.body)});return Response.json({status:0,data:{jobId:'job-2'}})}});
  assert.equal(calls.length,1);assert.ok(calls[0].url.endsWith('/generate'));assert.equal(calls[0].body.canvas_id,'run-canvas');
});
test('canvas creation failure never starts a paid image request',async()=>{
  const calls=[];await assert.rejects(()=>submitGeneration(config,{model:'gpt-image-2'},{fetchImpl:async url=>{calls.push(url);return Response.json({status:401,msg:'test invalid credential'})}}),/test invalid credential/);assert.deepEqual(calls,[config.apiRoot+'/canvas-backend/canvases']);
});
test('a network retry uses the same canvas and idempotency key',async()=>{
  const calls=[];let generated=0;
  await submitGeneration(config,{model:'gpt-image-2'},{idempotencyKey:'retry-one-job',fetchImpl:async(url,init)=>{
    calls.push({url,body:JSON.parse(init.body),key:init.headers['Idempotency-Key']});
    if(url.endsWith('/canvases'))return Response.json({status:0,data:{id:'single-canvas'}});
    if(++generated===1)throw Error('lost response');return Response.json({status:0,data:{job_id:'same-job'}});
  }});
  assert.equal(calls.filter(c=>c.url.endsWith('/canvases')).length,1);assert.deepEqual(calls.filter(c=>c.key).map(c=>[c.key,c.body.canvas_id]),[['retry-one-job','single-canvas'],['retry-one-job','single-canvas']]);
});
