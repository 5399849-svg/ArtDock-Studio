import test from 'node:test';
import assert from 'node:assert/strict';
import {adGenerationMessage, adMotionAction, adMotionStatusText, hasAdMotionVersion, isAdMotionPending, isAdMotionRunning, isAdMotionUncertain, watchAdMotionJob} from '../public/ad-motion-status.js';

function scheduler() {
  let sequence=0;
  const tasks=new Map();
  return {
    schedule: callback=>{const id=++sequence;tasks.set(id,callback);return id;},
    cancel: id=>tasks.delete(id),
    async next(){const entry=tasks.entries().next().value;assert.ok(entry,'expected a scheduled read');tasks.delete(entry[0]);await entry[1]();},
    get size(){return tasks.size;},
  };
}

test('queued video work is reported as background work rather than a finished GIF',()=>{
  const job={id:'job-1',status:'queued',model:'kling_v3'};
  assert.equal(isAdMotionPending({pending:true,motionJob:job}),true);
  assert.equal(isAdMotionPending({pending:true}),false);
  assert.match(adGenerationMessage({generated:7,total:8,pending:[{specId:'ad-04',motionJob:job}],errors:[]}),/7 张候选，1 张可灵 V3 动效正在后台制作/);
  assert.doesNotMatch(adGenerationMessage({generated:7,total:8,pending:[{specId:'ad-04',motionJob:job}],errors:[]}),/已自动生成 8|已生成动效/);
  assert.match(adGenerationMessage({generated:7,total:8,pending:[],errors:['视频失败原文']}),/失败项/);
  assert.equal(hasAdMotionVersion({...job,status:'completed'}),false);
  assert.equal(hasAdMotionVersion({...job,status:'completed',versionNumber:2}),true);
  assert.equal(hasAdMotionVersion({...job,status:'completed'},{number:2}),true);
  assert.equal(hasAdMotionVersion({...job,status:'failed',versionNumber:1}),false);
});

test('all provider processing stages stay locked; uncertain results are distinct from retryable failures',()=>{
  for(const status of ['queued','preparing','submitting','submitted','processing','downloading','encoding']){
    assert.equal(isAdMotionRunning({status}),true,status);
    assert.match(adMotionStatusText({status}),/微光画布 · 可灵 V3/);
  }
  for(const status of ['completed','failed','result_uncertain'])assert.equal(isAdMotionRunning({status}),false,status);
  assert.equal(isAdMotionUncertain({status:'result_uncertain'}),true);
  assert.match(adMotionStatusText({status:'result_uncertain'}),/结果待确认/);
});

test('retrying a saved video only converts it again; an explicit regeneration requests a new video',()=>{
  assert.deepEqual(adMotionAction({status:'failed',videoReady:true}),{label:'重试转换 GIF',payload:{retry:true}});
  assert.deepEqual(adMotionAction({status:'failed',videoReady:false}),{label:'重试可灵动效',payload:{retry:true}});
  assert.deepEqual(adMotionAction({status:'failed',videoReady:true,errorCode:'AD_MOTION_QC'}),{label:'重试转换 GIF',payload:{retry:true}});
  assert.deepEqual(adMotionAction({status:'completed',versionNumber:2}),{label:'重新生成动效',payload:{regenerate:true}});
  assert.deepEqual(adMotionAction(null),{label:'生成可灵动效',payload:{}});
});

test('a refreshed page resumes the persisted job using GET reads only and stops when a real version exists',async()=>{
  const clock=scheduler(),requests=[],updates=[];
  const responses=[{motionJob:{id:'existing-job',status:'processing'}},{motionJob:{id:'existing-job',status:'encoding'}},{motionJob:{id:'existing-job',status:'completed',versionNumber:2},version:{number:2,url:'/storage/new.gif'}}];
  const stop=watchAdMotionJob({api:async(...args)=>{requests.push(args);return responses.shift();},batchId:'batch/1',specId:'ad-04',isActive:()=>true,onUpdate:value=>updates.push(value),schedule:clock.schedule,cancel:clock.cancel});
  await clock.next();await clock.next();await clock.next();
  assert.equal(requests.length,3);
  for(const request of requests){assert.equal(request.length,1);assert.equal(request[0],'/api/ad-resources/batches/batch%2F1/items/ad-04/motion-job');}
  assert.equal(clock.size,0);
  assert.equal(hasAdMotionVersion(updates.at(-1).motionJob,updates.at(-1).version),true);
  stop();
});

test('a read failure keeps the existing job queryable without submitting another video',async()=>{
  const clock=scheduler(),requests=[],errors=[];let attempt=0;
  watchAdMotionJob({api:async(...args)=>{requests.push(args);if(attempt++===0)throw Error('查询连接中断');return {motionJob:{id:'same-job',status:'result_uncertain',error:'服务结果待核对'}};},batchId:'batch',specId:'gif',isActive:()=>true,onUpdate:()=>{},onError:error=>errors.push(error.message),schedule:clock.schedule,cancel:clock.cancel});
  await clock.next();assert.deepEqual(errors,['查询连接中断']);assert.equal(clock.size,1);
  await clock.next();assert.equal(clock.size,0);
  assert.ok(requests.every(args=>args.length===1&&args[0].endsWith('/motion-job')));
});

test('navigation and cancellation discard in-flight job reads and prevent stale page updates',async()=>{
  const clock=scheduler();let resolveRead,updates=0,active=true,requests=0;
  const stop=watchAdMotionJob({api:()=>{requests++;return new Promise(resolve=>{resolveRead=resolve;});},batchId:'batch',specId:'gif',isActive:()=>active,onUpdate:()=>updates++,schedule:clock.schedule,cancel:clock.cancel});
  const reading=clock.next();active=false;stop();resolveRead({motionJob:{status:'completed',versionNumber:2}});await reading;
  assert.equal(requests,1);assert.equal(updates,0);assert.equal(clock.size,0);
  const stopBefore=watchAdMotionJob({api:async()=>{throw Error('should not query');},batchId:'other',specId:'gif',isActive:()=>true,onUpdate:()=>{},schedule:clock.schedule,cancel:clock.cancel});
  stopBefore();assert.equal(clock.size,0);
});
