import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Readable} from 'node:stream';
import http from 'node:http';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {createAdResourcesHandler} from '../lib/ad-resources-server.mjs';
import {AD_MOTION_MODEL,AD_MOTION_METHOD,buildAdMotionBrief,generateAdKlingMotion} from '../lib/ad-kling-motion.mjs';
import {setAdGifDelays} from '../lib/ad-video-motion.mjs';
import {selectAdMotionPlan} from '../lib/ad-motion-plan.mjs';

// Every model and conversion dependency is injected. These integration tests use
// temporary storage only, and never load account configuration or contact APIs.
const gifSpec={id:'ad-04',number:4,name:'B站GIF动图',platform:'B站',width:640,height:400,format:'GIF',maxBytes:700*1024,limitRaw:'＜700KB',logo:'forbidden',safeInsetX:0};
const jpgSpec={id:'ad-03',number:3,name:'B站图片',platform:'B站',width:640,height:400,format:'JPG',maxBytes:300*1024,limitRaw:'＜300KB',logo:'forbidden',safeInsetX:0};
const catalog={sourceName:'isolated-motion-fixture.xlsx',sourceSha256:'isolated-motion-fixture',sheet:'投放资源位',specs:[jpgSpec,gifSpec]};
const fakeVideo=Buffer.from('offline-only fake video data');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject};}
async function until(read,accept,label='expected state'){
  const end=Date.now()+15000;
  while(Date.now()<end){const value=await read();if(accept(value))return value;await pause(15);}
  assert.fail(`Timed out waiting for ${label}`);
}
async function request(handler,method,pathname,body){
  const req=Readable.from(body===undefined?[]:[Buffer.from(JSON.stringify(body))]);req.method=method;
  let status=0,result='';const res={writeHead(code){status=code;},end(chunk){result=Buffer.isBuffer(chunk)?chunk.toString():String(chunk||'');}};
  await handler(req,res,new URL(pathname,'http://isolated.test'));
  return {status,body:JSON.parse(result)};
}
async function fixtureGif(spec=gifSpec){
  const frames=await Promise.all(Array.from({length:10},(_,i)=>sharp({create:{width:spec.width,height:spec.height,channels:3,background:{r:80+i*12,g:40+i*6,b:20+i*4}}}).png().toBuffer()));
  return sharp(frames,{join:{animated:true}}).gif({delay:Array(10).fill(100),loop:0}).toBuffer();
}
async function localProvider(t,{uncertain=false}={}){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'ad-kling-local-provider-')),requests=[];
  const server=http.createServer(async(req,res)=>{
    const chunks=[];for await(const part of req)chunks.push(part);
    const body=Buffer.concat(chunks).toString();requests.push({method:req.method,path:req.url,body:body?JSON.parse(body):null,headers:req.headers});
    if(req.method==='POST'&&req.url==='/api/canvas-backend/canvases'){
      res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({status:0,data:{id:'local-provider-canvas'}}));
    }else if(req.method==='POST'&&req.url==='/api/canvas-backend/generate'){
      res.writeHead(uncertain?500:200,{'content-type':'application/json'});res.end(JSON.stringify(uncertain?{status:1,code:500,msg:'unknown submission result'}:{status:0,data:{job_id:'local-provider-job'}}));
    }else if(req.url==='/api/canvas-backend/jobs/local-provider-job'){
      res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({status:0,data:{status:'done'}}));
    }else if(req.url==='/api/canvas-backend/jobs/local-provider-job/raw'){
      res.writeHead(200,{'content-type':'video/mp4'});res.end(Buffer.alloc(1500,42));
    }else{res.writeHead(404,{'content-type':'application/json'});res.end(JSON.stringify({status:1,code:404}));}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const configFile=path.join(root,'offline-provider.json');await fs.writeFile(configFile,JSON.stringify({enabled:true,token:'dummy-offline-test-token',apiRoot:`http://127.0.0.1:${server.address().port}/api`}));
  const previous=process.env.AI_HUABU_CONFIG;process.env.AI_HUABU_CONFIG=configFile;
  t.after(async()=>{if(previous===undefined)delete process.env.AI_HUABU_CONFIG;else process.env.AI_HUABU_CONFIG=previous;await new Promise(resolve=>server.close(resolve));await fs.rm(root,{recursive:true,force:true});});
  return {root,requests,workDir:path.join(root,'motion'),sourceBuffer:Buffer.from('local fixture source'),sourceName:'撤离宝箱',idempotencySeed:'offline-provider-contract'};
}
async function harness(t,{videoGenerate,videoToGif,specs=catalog.specs}={}){
  const runtimeDir=await fs.mkdtemp(path.join(os.tmpdir(),'ad-default-kling-')),storageDir=path.join(runtimeDir,'storage');
  await fs.mkdir(storageDir);
  t.after(async()=>{
    // A terminal status becomes visible in memory before its final queued write
    // closes. Wait for the durable job journal, then let Windows retry only real
    // transient removal errors instead of deleting a still-running test job.
    const active=new Set(['queued','preparing','submitting','submitted','processing','downloading','encoding']);
    await until(async()=>{
      try{return JSON.parse(await fs.readFile(path.join(runtimeDir,'ad-resources-jobs.json'),'utf8'));}
      catch(error){if(error.code==='ENOENT'||error instanceof SyntaxError)return null;throw error;}
    },jobs=>Array.isArray(jobs)&&jobs.every(batch=>Object.values(batch.items||{}).every(item=>!active.has(item.motionJob?.status))),'motion journal persistence before teardown');
    await fs.rm(runtimeDir,{recursive:true,force:true,maxRetries:5,retryDelay:30});
  });
  const calls={generate:[],convert:[]};
  const options={root:runtimeDir,runtimeDir,storageDir,catalogProvider:async()=>({...catalog,specs}),
    nanoGenerate:async()=>{throw new Error('unexpected image model request in isolated test');},
    videoGenerate:videoGenerate||(async args=>{calls.generate.push(args);await args.onStatus({status:'submitted',jobId:`offline-${calls.generate.length}`});return {buffer:fakeVideo,jobId:`offline-${calls.generate.length}`,contentType:'video/mp4'};}),
    videoToGif:videoToGif||(async args=>{calls.convert.push(args);return {buffer:await fixtureGif(args.spec),motion:{offlineFixture:true}};}),
  };
  const handle=await createAdResourcesHandler(options);
  const batch=(await request(handle,'POST','/api/ad-resources/batches',{project:'撤离时间与宝箱'})).body.batch;
  const source=await sharp({create:{width:640,height:400,channels:3,background:'#43577a'}}).png().toBuffer();
  const asset=(await request(handle,'POST',`/api/ad-resources/batches/${batch.id}/assets`,{role:'visual',name:'撤离宝箱_纯图.png',dataUrl:`data:image/png;base64,${source.toString('base64')}`})).body.asset;
  const endpoint=`/api/ad-resources/batches/${batch.id}/items/ad-04`;
  await request(handle,'PUT',`${endpoint}/draft`,{sourceAssetId:asset.id,zoom:1,offsetX:0,offsetY:0});
  const getJob=async(handler=handle)=>(await request(handler,'GET',`${endpoint}/motion-job`)).body;
  const waitStatus=(status,handler=handle)=>until(()=>getJob(handler),value=>value.motionJob?.status===status,status);
  const getBatch=async(handler=handle)=>(await request(handler,'GET','/api/ad-resources')).body.batches[0];
  return {runtimeDir,storageDir,options,handle,batch,asset,endpoint,source,calls,getJob,waitStatus,getBatch};
}

test('new batches automatically queue Kling V3 while JPG deliverables remain immediately available',async t=>{
  const gate=deferred(),entered=deferred();let generated=0;
  const h=await harness(t,{videoGenerate:async args=>{generated++;assert.equal(args.receipt.model,'kling_v3');await args.onStatus({status:'submitted',jobId:'provider-new-batch'});entered.resolve(args);await gate.promise;return {buffer:fakeVideo,jobId:'provider-new-batch'};}});
  const response=await request(h.handle,'POST',`/api/ad-resources/batches/${h.batch.id}/auto-generate`,{});
  assert.equal(response.status,202);assert.equal(response.body.generated,1);assert.deepEqual(response.body.errors,[]);
  assert.equal(response.body.pending[0].specId,'ad-04');assert.equal(response.body.pending[0].motionJob.model,'kling_v3');
  assert.equal(response.body.pending[0].motionJob.motionStyle,'full-scene');
  const args=await entered.promise,meta=await sharp(args.sourceBuffer).metadata();assert.equal(meta.width,640);assert.equal(meta.height,400);
  const before=await h.getBatch();assert.equal(before.items['ad-03'].versions[0].format,'JPG');assert.equal(before.items['ad-04'].versions.length,0);
  gate.resolve();const completed=await h.waitStatus('completed');
  assert.equal(generated,1);assert.equal(completed.version.format,'GIF');assert.equal(completed.version.motion.model,'kling_v3');assert.equal(completed.version.motion.providerJobId,'provider-new-batch');
  assert.equal(h.calls.convert[0].motionOptions.mode,'full-scene');
  assert.equal(h.calls.convert[0].motionOptions.scenePlan.id,'treasure-light');
  assert.equal(completed.version.durationMs,1000);assert.equal(completed.version.frames,10);assert.ok(completed.version.bytes<700*1024);
  const after=await h.getBatch();assert.equal(after.items['ad-04'].motionReference.model,'kling_v3');assert.equal(after.items['ad-04'].motionReference.sourceAssetId,h.asset.id);
  const receipt=JSON.parse(await fs.readFile(path.join(h.storageDir,`ad-resources-${h.batch.id}`,'motion',completed.motionJob.id,'video-receipt.json'),'utf8'));
  assert.equal(receipt.status,'completed');assert.equal(receipt.jobId,'provider-new-batch');assert.equal(receipt.generateAudio,false);
});

test('a failed legacy light QC reuses its paid video with the scene-adaptive converter',async t=>{
  let conversions=0;
  const h=await harness(t,{videoToGif:async args=>{
    conversions++;
    if(conversions===1)throw Object.assign(new Error('环境微光区域过大'),{code:'AD_MOTION_QC'});
    assert.equal(args.motionOptions.mode,'full-scene');
    return {buffer:await fixtureGif(args.spec),motion:{method:'native-video-scene-local-v1',motionStyle:'scene-adaptive'}};
  }});
  await request(h.handle,'POST',`${h.endpoint}/generate-gif`,{});
  const failed=await h.waitStatus('failed');assert.equal(failed.motionJob.videoReady,true);assert.equal(failed.motionJob.errorCode,'AD_MOTION_QC');
  const retried=await request(h.handle,'POST',`${h.endpoint}/generate-gif`,{retry:true});assert.equal(retried.status,202);
  const completed=await h.waitStatus('completed');
  assert.equal(h.calls.generate.length,1);assert.equal(conversions,2);assert.equal(completed.motionJob.id,failed.motionJob.id);
  assert.equal(completed.version.motion.renderMethod,'native-video-scene-local-v1');assert.equal(completed.version.motion.motionStyle,'scene-adaptive');
  assert.equal(completed.motionJob.errorCode,'');assert.equal((await h.getBatch()).items['ad-04'].versions.length,1);
});

test('a completed legacy GIF reencodes the saved video into a new revision without replacing its history or charging again',async t=>{
  const h=await harness(t);
  await request(h.handle,'POST',`${h.endpoint}/generate-gif`,{});await h.waitStatus('completed');
  const file=path.join(h.runtimeDir,'ad-resources-jobs.json');
  const saved=await until(async()=>JSON.parse(await fs.readFile(file,'utf8')),value=>value[0].items['ad-04'].motionJob.status==='completed','completed journal before migration');
  const legacy=saved[0].items['ad-04'];legacy.versions[0].motion.renderRevision='legacy-zoom-v1';legacy.motionJob.renderRevision='legacy-zoom-v1';
  const previousUrl=legacy.versions[0].url,previousJob=legacy.motionJob.id;
  await fs.writeFile(file,JSON.stringify(saved));const restarted=await createAdResourcesHandler(h.options);
  const response=await request(restarted,'POST',`${h.endpoint}/generate-gif`,{reencode:true});assert.equal(response.status,202);
  const result=await h.waitStatus('completed',restarted),batch=await h.getBatch(restarted);
  assert.equal(h.calls.generate.length,1);assert.equal(h.calls.convert.length,2);assert.equal(result.motionJob.id,previousJob);
  assert.equal(result.version.number,2);assert.equal(result.version.motion.renderRevision,'full-scene-native-type-v1');
  assert.equal(batch.items['ad-04'].versions.length,2);assert.equal(batch.items['ad-04'].versions[0].url,previousUrl);
});

test('concurrent repeated generation and render clicks share one provider task',async t=>{
  const gate=deferred(),entered=deferred();let submissions=0;
  const h=await harness(t,{videoGenerate:async({onStatus})=>{submissions++;await onStatus({status:'submitted',jobId:'provider-shared'});entered.resolve();await gate.promise;return {buffer:fakeVideo,jobId:'provider-shared'};}});
  const initial=await request(h.handle,'POST',`${h.endpoint}/generate-gif`,{});await entered.promise;
  const draftBefore=(await h.getBatch()).items['ad-04'].draft;
  await assert.rejects(()=>request(h.handle,'PUT',`${h.endpoint}/draft`,{sourceAssetId:h.asset.id,zoom:1,offsetX:.2,offsetY:0}),error=>error.status===409);
  await assert.rejects(()=>request(h.handle,'POST',`${h.endpoint}/render`,{draft:{sourceAssetId:h.asset.id,zoom:1,offsetX:.2,offsetY:0}}),error=>error.status===409);
  assert.deepEqual((await h.getBatch()).items['ad-04'].draft,draftBefore,'a rejected crop edit must not overwrite the running job draft');
  const results=await Promise.all(Array.from({length:5},(_,i)=>request(h.handle,'POST',`${h.endpoint}/${i%2?'render':'generate-gif'}`,{})));
  assert.ok(results.every(value=>value.status===202&&value.body.motionJob.id===initial.body.motionJob.id));assert.equal(submissions,1);
  gate.resolve();await h.waitStatus('completed');assert.equal((await h.getBatch()).items['ad-04'].versions.length,1);assert.equal(submissions,1);
});

test('provider failures create no decorative fallback GIF and require explicit retry',async t=>{
  let submissions=0;const h=await harness(t,{videoGenerate:async({onStatus})=>{submissions++;await onStatus({status:'submitted',jobId:`provider-attempt-${submissions}`});if(submissions===1)throw Object.assign(new Error('offline provider failed'),{motionStatus:'failed'});return {buffer:fakeVideo,jobId:`provider-attempt-${submissions}`};}});
  await request(h.handle,'POST',`${h.endpoint}/generate-gif`,{});const failed=await h.waitStatus('failed');assert.match(failed.motionJob.error,/provider failed/);
  assert.equal((await h.getBatch()).items['ad-04'].versions.length,0);assert.equal(h.calls.convert.length,0);
  const again=await request(h.handle,'POST',`${h.endpoint}/generate-gif`,{});assert.equal(again.status,409);assert.equal(submissions,1);
  const wrongIntent=await request(h.handle,'POST',`${h.endpoint}/generate-gif`,{regenerate:true});assert.equal(wrongIntent.status,409);assert.equal(submissions,1,'failed jobs require retry rather than silently using regeneration');
  const retried=await request(h.handle,'POST',`${h.endpoint}/generate-gif`,{retry:true});assert.equal(retried.status,202);assert.equal(retried.body.motionJob.attempt,2);assert.notEqual(retried.body.motionJob.id,failed.motionJob.id);
  await h.waitStatus('completed');assert.equal(submissions,2);
  const completedRetry=await request(h.handle,'POST',`${h.endpoint}/generate-gif`,{retry:true});assert.equal(completedRetry.status,201);assert.equal(submissions,2,'retry on a completed job must not create another charged generation');
  const regenerated=await request(h.handle,'POST',`${h.endpoint}/generate-gif`,{regenerate:true});assert.equal(regenerated.status,202);await h.waitStatus('completed');assert.equal(submissions,3);assert.equal((await h.getBatch()).items['ad-04'].versions.length,2);
});

test('completed motion references rerender locally after crop adjustment without calling a model',async t=>{
  const h=await harness(t);await request(h.handle,'POST',`${h.endpoint}/render`,{});const original=await h.waitStatus('completed');
  const same=await request(h.handle,'POST',`${h.endpoint}/render`,{});assert.equal(same.status,201);assert.equal(same.body.version.number,original.version.number);assert.equal(h.calls.generate.length,1);
  await request(h.handle,'PUT',`${h.endpoint}/draft`,{sourceAssetId:h.asset.id,zoom:1.1,offsetX:.05,offsetY:.08});
  const adjusted=await request(h.handle,'POST',`${h.endpoint}/render`,{});assert.equal(adjusted.status,201);assert.equal(adjusted.body.version.number,2);assert.equal(adjusted.body.version.motion.model,'kling_v3');
  assert.equal(h.calls.generate.length,1);assert.equal(h.calls.convert.length,1,'local crop must reuse the animated reference instead of reconverting video');
  assert.equal(adjusted.body.version.durationMs,1000);assert.equal(adjusted.body.version.frames,original.version.frames);
});

test('GIF quality or encoding retry reuses the saved video and exposes its failure reason without another provider charge',async t=>{
  let conversions=0;const h=await harness(t,{videoToGif:async({spec,videoBuffer})=>{
    conversions++;assert.deepEqual(videoBuffer,fakeVideo);
    if(conversions===1)throw Object.assign(new Error('动效幅度不足，请重新生成'),{code:'AD_MOTION_QC'});
    return {buffer:await fixtureGif(spec),motion:{qualityChecked:true}};
  }});
  await request(h.handle,'POST',`${h.endpoint}/generate-gif`,{});const failed=await h.waitStatus('failed');
  assert.equal(failed.motionJob.errorCode,'AD_MOTION_QC');assert.equal(failed.motionJob.videoReady,true);assert.equal(h.calls.generate.length,1);
  const retried=await request(h.handle,'POST',`${h.endpoint}/generate-gif`,{retry:true});assert.equal(retried.status,202);assert.equal(retried.body.motionJob.id,failed.motionJob.id);assert.equal(retried.body.motionJob.attempt,1);
  const done=await h.waitStatus('completed');assert.equal(done.version.motion.qualityChecked,true);assert.equal(h.calls.generate.length,1);assert.equal(conversions,2);
});

test('explicit regeneration after a saved-video quality failure creates one new provider attempt',async t=>{
  let conversions=0;const h=await harness(t,{videoToGif:async({spec})=>{if(++conversions===1)throw Object.assign(new Error('quality rejected'),{code:'AD_MOTION_QC'});return {buffer:await fixtureGif(spec)};}});
  await request(h.handle,'POST',`${h.endpoint}/generate-gif`,{});const failed=await h.waitStatus('failed');assert.equal(failed.motionJob.videoReady,true);
  const regenerated=await request(h.handle,'POST',`${h.endpoint}/generate-gif`,{regenerate:true});assert.equal(regenerated.status,202);assert.notEqual(regenerated.body.motionJob.id,failed.motionJob.id);assert.equal(regenerated.body.motionJob.attempt,2);
  await h.waitStatus('completed');assert.equal(h.calls.generate.length,2);assert.equal(conversions,2);
});

test('uncertain submissions without a provider id never automatically resubmit after clicks, polling, or restart',async t=>{
  let submissions=0;const h=await harness(t,{videoGenerate:async({onStatus})=>{submissions++;await onStatus({status:'submitting'});throw Object.assign(new Error('submission acknowledgment lost'),{motionStatus:'result_uncertain'});}});
  await request(h.handle,'POST',`${h.endpoint}/generate-gif`,{});await h.waitStatus('result_uncertain');
  for(const body of [{},{retry:true},{regenerate:true}])assert.equal((await request(h.handle,'POST',`${h.endpoint}/generate-gif`,body)).status,409);
  assert.equal((await h.getJob()).motionJob.status,'result_uncertain');assert.equal(submissions,1);
  const unknownRefresh=await request(h.handle,'GET',`${h.endpoint}/motion-job?refresh=1`);
  assert.equal(unknownRefresh.body.motionJob.status,'result_uncertain');assert.equal(unknownRefresh.body.pending,false);assert.equal(submissions,1,'an unknown provider job cannot be resumed by an explicit query');
  // Simulate a real restart from a durable terminal journal, rather than running
  // two handler instances while the first instance is still writing that state.
  await until(async()=>{try{return JSON.parse(await fs.readFile(path.join(h.runtimeDir,'ad-resources-jobs.json'),'utf8'));}catch(error){if(error instanceof SyntaxError)return null;throw error;}},jobs=>jobs?.[0]?.items['ad-04'].motionJob?.status==='result_uncertain','persisted unknown submission before restart');
  const restarted=await createAdResourcesHandler(h.options);await h.waitStatus('result_uncertain',restarted);
  assert.equal((await request(restarted,'POST',`${h.endpoint}/generate-gif`,{retry:true})).status,409);assert.equal(submissions,1);assert.equal((await h.getBatch(restarted)).items['ad-04'].versions.length,0);
});

test('ordinary reads preserve known uncertain errors while only an explicit refresh resumes the saved provider job',async t=>{
  let submissions=0,resumes=0;
  const h=await harness(t,{videoGenerate:async({receipt,onStatus})=>{
    if(!receipt.jobId){submissions++;await onStatus({status:'submitted',jobId:'known-uncertain-job'});}
    else{resumes++;assert.equal(receipt.jobId,'known-uncertain-job');}
    throw Object.assign(new Error(resumes?'provider remains uncertain after explicit query':'provider exceeded its query deadline'),{motionStatus:'result_uncertain'});
  }});
  await request(h.handle,'POST',`${h.endpoint}/generate-gif`,{});
  const first=await h.waitStatus('result_uncertain');assert.equal(first.pending,false);assert.equal(first.motionJob.providerJobId,'known-uncertain-job');
  const journal=path.join(h.runtimeDir,'ad-resources-jobs.json');
  const readJournal=async()=>{try{const text=await fs.readFile(journal,'utf8');return {text,batch:JSON.parse(text)[0]};}catch(error){if(error instanceof SyntaxError)return null;throw error;}};
  await until(readJournal,value=>value?.batch.items['ad-04'].motionJob?.status==='result_uncertain','durable uncertain state');
  // 生成流程收尾时还会再保存一次（更新 updatedAt）：等文件停止变化，用那时的内容做基准，再核对“普通读取不写文件”。
  let beforeStat=await fs.stat(journal);
  for(;;){await new Promise(resolve=>setTimeout(resolve,250));const settled=await fs.stat(journal);if(settled.mtimeMs===beforeStat.mtimeMs)break;beforeStat=settled;}
  const durable=await readJournal();assert.equal(durable.batch.items['ad-04'].motionJob.status,'result_uncertain');
  for(let read=0;read<5;read++){
    const unchanged=await h.getJob();assert.equal(unchanged.motionJob.status,'result_uncertain');assert.equal(unchanged.pending,false);assert.equal(unchanged.motionJob.error,'provider exceeded its query deadline');
  }
  assert.equal(submissions,1);assert.equal(resumes,0,'ordinary polling must not turn into a provider query');assert.equal(await fs.readFile(journal,'utf8'),durable.text);assert.equal((await fs.stat(journal)).mtimeMs,beforeStat.mtimeMs,'ordinary reads must not save a mutated job');
  const refreshed=await request(h.handle,'GET',`${h.endpoint}/motion-job?refresh=1`);
  assert.equal(refreshed.status,200);assert.equal(refreshed.body.motionJob.id,first.motionJob.id);assert.equal(refreshed.body.pending,true);
  const second=await h.waitStatus('result_uncertain');assert.equal(second.pending,false);assert.equal(second.motionJob.error,'provider remains uncertain after explicit query');assert.equal(submissions,1);assert.equal(resumes,1);
  for(let read=0;read<5;read++){const unchanged=await h.getJob();assert.equal(unchanged.motionJob.status,'result_uncertain');assert.equal(unchanged.motionJob.error,second.motionJob.error);assert.equal(unchanged.pending,false);}
  assert.equal(submissions,1);assert.equal(resumes,1,'watching an uncertain job must leave its error stable until another explicit query');
});

test('restart resumes the stored provider job rather than submitting a replacement job',async t=>{
  let submissions=0,resumed=0;
  const h=await harness(t,{videoGenerate:async({receipt,onStatus})=>{
    if(!receipt.jobId){submissions++;await onStatus({status:'submitted',jobId:'existing-provider-job'});throw Object.assign(new Error('poll interrupted'),{motionStatus:'result_uncertain'});}
    resumed++;assert.equal(receipt.jobId,'existing-provider-job');return {buffer:fakeVideo,jobId:receipt.jobId};
  }});
  await request(h.handle,'POST',`${h.endpoint}/generate-gif`,{});
  // Read the persisted job file directly: GET intentionally resumes known jobs.
  const readSaved=async()=>JSON.parse(await fs.readFile(path.join(h.runtimeDir,'ad-resources-jobs.json'),'utf8'));
  const saved=await until(readSaved,value=>value[0].items['ad-04'].motionJob?.status==='result_uncertain','stored interrupted job');
  assert.equal(saved[0].items['ad-04'].motionJob.providerJobId,'existing-provider-job');
  // This is the state a process exit while polling leaves on disk.
  saved[0].items['ad-04'].motionJob.status='processing';await fs.writeFile(path.join(h.runtimeDir,'ad-resources-jobs.json'),JSON.stringify(saved));
  const restarted=await createAdResourcesHandler(h.options);const done=await h.waitStatus('completed',restarted);
  assert.equal(done.version.motion.providerJobId,'existing-provider-job');assert.equal(submissions,1);assert.equal(resumed,1);assert.equal((await h.getBatch(restarted)).items['ad-04'].versions.length,1);
});

test('failed regeneration cannot silently deliver the previous GIF as a newly completed result',async t=>{
  let count=0;const h=await harness(t,{videoGenerate:async({onStatus})=>{count++;await onStatus({status:'submitted',jobId:`version-${count}`});if(count>1)throw Object.assign(new Error('regeneration failed'),{motionStatus:'failed'});return {buffer:fakeVideo,jobId:'version-1'};},specs:[gifSpec]});
  await request(h.handle,'POST',`${h.endpoint}/generate-gif`,{});await h.waitStatus('completed');
  await request(h.handle,'POST',`${h.endpoint}/generate-gif`,{regenerate:true});await h.waitStatus('failed');
  assert.equal((await h.getBatch()).items['ad-04'].versions.length,1,'the previous candidate stays available for history');
  await assert.rejects(()=>request(h.handle,'POST',`/api/ad-resources/batches/${h.batch.id}/download`,{}),/可灵动效尚未完成/);
});

test('durable generation boundary deduplicates concurrent execution and reuses completed video receipts',async t=>{
  const workDir=await fs.mkdtemp(path.join(os.tmpdir(),'ad-kling-receipt-'));t.after(()=>fs.rm(workDir,{recursive:true,force:true}));
  const gate=deferred(),entered=deferred();let submissions=0;
  const options={root:workDir,workDir,sourceBuffer:Buffer.from('same source'),sourceName:'撤离宝箱',idempotencySeed:'one-user-intent',videoGenerate:async({receipt,onStatus})=>{submissions++;assert.equal(receipt.model,AD_MOTION_MODEL);await onStatus({status:'submitted',jobId:'durable-job'});entered.resolve();await gate.promise;return {buffer:fakeVideo,jobId:'durable-job'};}};
  const first=generateAdKlingMotion(options);await entered.promise;const second=generateAdKlingMotion(options);assert.equal(submissions,1);gate.resolve();const results=await Promise.all([first,second]);
  assert.deepEqual(results[0].buffer,results[1].buffer);assert.equal(results[0].receipt.method,AD_MOTION_METHOD);
  assert.equal((await generateAdKlingMotion(options)).receipt.jobId,'durable-job');assert.equal(submissions,1);
});

test('a crash after submission started without a returned job id is recorded as uncertain without another provider call',async t=>{
  const workDir=await fs.mkdtemp(path.join(os.tmpdir(),'ad-kling-uncertain-'));t.after(()=>fs.rm(workDir,{recursive:true,force:true}));
  let calls=0;const options={root:workDir,workDir,sourceBuffer:Buffer.from('same source'),sourceName:'宝箱',idempotencySeed:'crash-simulation',videoGenerate:async()=>{calls++;throw new Error('initial interruption');}};
  await assert.rejects(()=>generateAdKlingMotion(options),/initial interruption/);
  const file=path.join(workDir,'video-receipt.json'),receipt=JSON.parse(await fs.readFile(file,'utf8'));receipt.status='submitting';delete receipt.jobId;await fs.writeFile(file,JSON.stringify(receipt));
  await assert.rejects(()=>generateAdKlingMotion(options),error=>error.motionStatus==='result_uncertain');assert.equal(calls,1);
  assert.equal(JSON.parse(await fs.readFile(file,'utf8')).status,'result_uncertain');
});

test('default brief requests one coherent scene with stable identity rather than frozen cut-out characters',()=>{
  const brief=buildAdMotionBrief('撤离时间_宝箱与宝石');
  assert.match(brief.prompt,/单张原画作为首帧/);assert.match(brief.prompt,/4秒/);assert.match(brief.prompt,/完整画面统一生成/);assert.match(brief.prompt,/人物身份、五官、手指/);assert.match(brief.prompt,/一至两处环境元素/);assert.match(brief.prompt,/10帧、1秒/);assert.match(brief.prompt,/原生透明图层/);assert.match(brief.prompt,/道具格、计时条/);assert.match(brief.prompt,/固定镜头/);assert.match(brief.negative,/遮挡脸部/);assert.doesNotMatch(brief.prompt,/全部保持静止|像素完全固定/);
  assert.equal(AD_MOTION_MODEL,'kling_v3');
});

test('native PSD scene and transparent type are used automatically and retained for fee-free re-encoding',async t=>{
  const h=await harness(t),journal=path.join(h.runtimeDir,'ad-resources-jobs.json');
  const scene=await sharp({create:{width:640,height:400,channels:3,background:'#2050a0'}}).png().toBuffer();
  const overlay=await sharp({create:{width:640,height:400,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input:await sharp({create:{width:80,height:20,channels:4,background:'#ff0000'}}).png().toBuffer(),left:450,top:200}]).png().toBuffer();
  const folder=`ad-resources-${h.batch.id}`,assetDir=path.join(h.storageDir,folder,'asset');
  await fs.writeFile(path.join(assetDir,'native-scene.png'),scene);await fs.writeFile(path.join(assetDir,'native-type.png'),overlay);
  const jobs=JSON.parse(await fs.readFile(journal,'utf8')),asset=jobs[0].assets.find(a=>a.id===h.asset.id);
  asset.motionSceneUrl=`/storage/${folder}/asset/native-scene.png`;asset.motionOverlayUrl=`/storage/${folder}/asset/native-type.png`;
  await fs.writeFile(journal,JSON.stringify(jobs));
  const handle=await createAdResourcesHandler(h.options);
  await request(handle,'POST',`${h.endpoint}/generate-gif`,{});const complete=await h.waitStatus('completed',handle);
  assert.equal(complete.motionJob.fullFrameLayers,true);
  assert.deepEqual(await sharp(h.calls.generate[0].sourceBuffer).removeAlpha().raw().toBuffer(),await sharp(scene).removeAlpha().raw().toBuffer());
  assert.deepEqual(await sharp(h.calls.convert[0].overlayBuffer).raw().toBuffer(),await sharp(overlay).raw().toBuffer());
  await request(handle,'POST',`${h.endpoint}/generate-gif`,{reencode:true});await h.waitStatus('completed',handle);
  assert.equal(h.calls.generate.length,1,'re-encoding must not charge again');
  assert.equal(h.calls.convert.length,2);assert.deepEqual(h.calls.convert[1].overlayBuffer,h.calls.convert[0].overlayBuffer);
});

test('quiet reading, treasure and unknown scenes receive distinct intent without forced camera motion',()=>{
  const reading=buildAdMotionBrief('读信原图'),treasure=buildAdMotionBrief('宝箱宝石');
  assert.equal(reading.scenePlan.id,'quiet-reading');assert.match(reading.prompt,/帘纱轻摆/);
  assert.equal(treasure.scenePlan.id,'treasure-light');assert.match(treasure.prompt,/宝石切面/);
  assert.notEqual(reading.prompt,treasure.prompt);
  const unknown=selectAdMotionPlan('素材_002');assert.equal(unknown.id,'visual-scene');assert.equal(unknown.camera,'locked');
  for(const name of ['读信','宝箱','茶席','花园','月夜','素材002']){
    const plan=selectAdMotionPlan(name);assert.equal(plan.frames,10);assert.equal(plan.durationMs,1000);assert.equal(plan.delayMs,100);assert.equal(plan.loop,0);
  }
});

test('a converter violating ten-frame one-second timing cannot publish a candidate or trigger a new paid call',async t=>{
  const h=await harness(t,{videoToGif:async()=>{
    const frames=await Promise.all(['red','blue'].map(background=>sharp({create:{width:640,height:400,channels:3,background}}).png().toBuffer()));
    return {buffer:await sharp(frames,{join:{animated:true}}).gif({delay:[500,500],loop:0}).toBuffer()};
  }});
  await request(h.handle,'POST',`${h.endpoint}/generate-gif`,{});
  const failed=await h.waitStatus('failed');assert.equal(failed.motionJob.errorCode,'AD_MOTION_QC');assert.equal(failed.motionJob.videoReady,true);
  assert.match(failed.motionJob.error,/10帧/);assert.equal(h.calls.generate.length,1);assert.equal((await h.getBatch()).items['ad-04'].versions.length,0);
});

test('an inspected native GIF import becomes the current reference without retaining a stale paid-video job',async t=>{
  const h=await harness(t);
  await request(h.handle,'POST',`${h.endpoint}/generate-gif`,{});
  const before=await h.waitStatus('completed');
  const buffer=await fixtureGif();
  const motionBrief={prompt:'已有花瓣慢飘，人物书信和文字固定，不添加扇子。',negative:'新增道具、人物动作'},motionOptions={protectedRectangles:[[20,30,40,50]],playbackRate:.5};
  const imported=await request(h.handle,'POST',`${h.endpoint}/versions`,{
    dataUrl:`data:image/gif;base64,${buffer.toString('base64')}`,motionReference:true,
    motionBrief,motionOptions,
    motion:{model:'kling_v3',providerJobId:'inspected-native-provider',jobId:'reviewed-native-job',motionStyle:'scene-adaptive',scenePlan:selectAdMotionPlan('读信')},
  });
  assert.equal(imported.status,201);assert.equal(imported.body.version.number,2);
  const state=await h.getJob();assert.equal(state.motionJob.id,'reviewed-native-job');assert.equal(state.version.number,2);assert.equal(state.motionJob.providerJobId,'inspected-native-provider');assert.equal(state.motionJob.videoReady,false);assert.equal(state.motionJob.imported,true);
  const same=await request(h.handle,'POST',`${h.endpoint}/render`,{});assert.equal(same.body.version.number,2);assert.equal(h.calls.generate.length,1);
  const batch=await h.getBatch();assert.equal(batch.items['ad-04'].versions[0].url,before.version.url);
  await request(h.handle,'POST',`${h.endpoint}/generate-gif`,{regenerate:true});await h.waitStatus('completed');
  assert.equal(h.calls.generate.length,2);assert.equal(h.calls.generate[1].receipt.prompt,motionBrief.prompt);
  assert.deepEqual(h.calls.convert.at(-1).motionOptions.protectedRectangles,motionOptions.protectedRectangles);
  assert.equal(h.calls.convert.at(-1).motionOptions.playbackRate,.5);
});

test('the real provider adapter submits the exact Kling V3 video contract to an isolated localhost server',async t=>{
  const options=await localProvider(t);const result=await generateAdKlingMotion(options);
  const posts=options.requests.filter(entry=>entry.method==='POST'),canvasPost=posts.find(entry=>entry.path==='/api/canvas-backend/canvases'),generationPost=posts.find(entry=>entry.path==='/api/canvas-backend/generate');assert.equal(posts.length,2);
  assert.equal(canvasPost.body.game_tag_id,13);assert.equal(canvasPost.body.title,'撤离宝箱 GIF');
  const submitted=generationPost.body;assert.equal(submitted.canvas_id,'local-provider-canvas');assert.equal(submitted.model,'kling_v3');assert.equal(submitted.task_type,'video');assert.equal(submitted.bot_id,'canvas');assert.equal(submitted.duration,4);assert.equal(submitted.resolution,'720p');assert.equal(submitted.generate_audio,false);
  assert.equal(submitted.images.length,1,'only the first frame is constrained so real continuous motion can develop');assert.equal(Buffer.from(submitted.images[0].data_base64,'base64').toString(),'local fixture source');
  assert.equal(Object.hasOwn(submitted,'ratio'),false);assert.equal(Object.hasOwn(submitted,'frame_mode'),false);assert.ok(generationPost.headers['idempotency-key']);
  assert.equal(result.receipt.jobId,'local-provider-job');assert.equal(result.buffer.length,1500);assert.equal(result.receipt.firstLastSameStill,false);assert.equal(result.receipt.referenceMode,'first-frame');
  await generateAdKlingMotion(options);assert.equal(options.requests.filter(entry=>entry.method==='POST'&&entry.path==='/api/canvas-backend/generate').length,1);
});

test('an explicit scene brief is sent and saved once while later retries preserve that paid brief',async t=>{
  const options=await localProvider(t),motionBrief={prompt:'冰晶轮廓有清楚的缓慢流光，角色与文字固定。',negative:'遮脸、人物动作、文字变化'};
  const result=await generateAdKlingMotion({...options,motionBrief});
  const submission=options.requests.find(entry=>entry.path==='/api/canvas-backend/generate');
  assert.equal(submission.body.prompt,motionBrief.prompt);assert.equal(submission.body.negative_prompt,motionBrief.negative);
  assert.equal(result.receipt.prompt,motionBrief.prompt);
  const resumed=await generateAdKlingMotion({...options,motionBrief:{prompt:'修改后的描述',negative:'新描述'}});
  assert.equal(resumed.receipt.prompt,motionBrief.prompt);
  assert.equal(options.requests.filter(entry=>entry.path==='/api/canvas-backend/generate').length,1);
});

test('a paid video keeps its original brief and remains reusable after default prompts or source labels change',async t=>{
  const workDir=await fs.mkdtemp(path.join(os.tmpdir(),'ad-kling-old-brief-'));t.after(()=>fs.rm(workDir,{recursive:true,force:true}));
  let calls=0;const options={root:workDir,workDir,sourceBuffer:Buffer.from('same paid source'),sourceName:'旧素材名称',idempotencySeed:'paid-before-default-change',videoGenerate:async()=>{calls++;return {buffer:fakeVideo,jobId:'already-paid-job'};}};
  const first=await generateAdKlingMotion(options);
  // Simulate a receipt created by the previous deployment. Its paid request
  // retains the old exact prompt even when the current default brief changes.
  const file=path.join(workDir,'video-receipt.json'),legacy={...first.receipt,prompt:'旧版已付费提示词：首尾使用同一张画，文字固定。',negative:'旧版负面提示：不得改变文字。',firstLastSameStill:true};delete legacy.referenceMode;
  legacy.requestHash=createHash('sha256').update(`${legacy.method}:${options.idempotencySeed}:${legacy.sourceHash}:${legacy.prompt}:${legacy.negative}`).digest('hex');
  await fs.writeFile(file,JSON.stringify(legacy));
  const cached=await generateAdKlingMotion({...options,sourceName:'新素材标签：默认设计已更新'});
  assert.equal(calls,1,'a changed default brief must not submit another paid video');assert.deepEqual(cached.buffer,fakeVideo);assert.equal(cached.receipt.prompt,legacy.prompt);assert.equal(cached.receipt.negative,legacy.negative);assert.equal(cached.receipt.firstLastSameStill,true);assert.equal(cached.receipt.jobId,'already-paid-job');
  // A provider job whose download was interrupted also resumes under its old
  // brief, instead of being rejected or resubmitted with new defaults.
  legacy.status='result_uncertain';await fs.writeFile(file,JSON.stringify(legacy));let resumed=0;
  const restored=await generateAdKlingMotion({...options,sourceName:'再次改名',videoGenerate:async({receipt})=>{resumed++;assert.equal(receipt.jobId,'already-paid-job');assert.equal(receipt.prompt,legacy.prompt);assert.equal(receipt.negative,legacy.negative);return {buffer:fakeVideo,jobId:receipt.jobId};}});
  assert.equal(resumed,1);assert.equal(calls,1);assert.deepEqual(restored.buffer,fakeVideo);assert.equal(restored.receipt.status,'completed');
});

test('an uncertain provider HTTP response receives only one POST across execution and recovery',async t=>{
  const options=await localProvider(t,{uncertain:true});
  await assert.rejects(()=>generateAdKlingMotion(options),error=>error.motionStatus==='result_uncertain');
  await assert.rejects(()=>generateAdKlingMotion(options),error=>error.motionStatus==='result_uncertain');
  assert.equal(options.requests.filter(entry=>entry.path==='/api/canvas-backend/generate').length,1);
  assert.equal(options.requests.filter(entry=>entry.path==='/api/canvas-backend/canvases').length,1);
  const receipt=JSON.parse(await fs.readFile(path.join(options.workDir,'video-receipt.json'),'utf8'));assert.equal(receipt.status,'result_uncertain');assert.equal(receipt.jobId,undefined);
});

test('32-frame GIF timing is exactly four seconds without changing pixel data or the original buffer',async()=>{
  const frames=await Promise.all(Array.from({length:32},(_,index)=>sharp({create:{width:8,height:6,channels:3,background:{r:index*7,g:255-index*5,b:index*3}}}).png().toBuffer()));
  const input=await sharp(frames,{join:{animated:true}}).gif({delay:Array(32).fill(100),loop:0}).toBuffer(),saved=Buffer.from(input);
  const output=setAdGifDelays(input),meta=await sharp(output,{animated:true}).metadata();
  assert.equal(meta.pages,32);assert.equal(meta.delay.reduce((sum,value)=>sum+value,0),4000);assert.deepEqual(meta.delay,Array.from({length:32},(_,index)=>index%2?130:120));assert.deepEqual(input,saved);
  for(const page of [0,15,31])assert.deepEqual(await sharp(output,{page}).raw().toBuffer(),await sharp(input,{page}).raw().toBuffer());
  assert.throws(()=>setAdGifDelays(Buffer.from('not a GIF')),/未返回 GIF/);
  assert.throws(()=>setAdGifDelays(input,24),/帧数不符/);
});

test('20-frame GIF timing stays at four seconds for compressed 5 fps banner delivery',async()=>{
  const frames=await Promise.all(Array.from({length:20},(_,index)=>sharp({create:{width:8,height:6,channels:3,background:{r:index*11,g:255-index*8,b:index*4}}}).png().toBuffer()));
  const input=await sharp(frames,{join:{animated:true}}).gif({delay:Array(20).fill(200),loop:0}).toBuffer(),saved=Buffer.from(input);
  const output=setAdGifDelays(input,20),meta=await sharp(output,{animated:true}).metadata();
  assert.equal(meta.pages,20);assert.equal(meta.delay.reduce((sum,value)=>sum+value,0),4000);assert.deepEqual(meta.delay,Array(20).fill(200));assert.deepEqual(input,saved);
});

test('10-frame ambient GIF uses exact 100ms delays without changing pixels',async()=>{
  const frames=await Promise.all(Array.from({length:10},(_,index)=>sharp({create:{width:8,height:6,channels:3,background:{r:20+index*20,g:230-index*15,b:30+index*17}}}).png().toBuffer()));
  const input=await sharp(frames,{join:{animated:true}}).gif({delay:Array(10).fill(200),loop:0}).toBuffer(),saved=Buffer.from(input);
  const output=setAdGifDelays(input,10,1000),meta=await sharp(output,{animated:true}).metadata();
  assert.equal(meta.pages,10);assert.deepEqual(meta.delay,Array(10).fill(100));assert.deepEqual(input,saved);
  for(let page=0;page<10;page++)assert.deepEqual(await sharp(output,{page}).raw().toBuffer(),await sharp(input,{page}).raw().toBuffer());
  assert.throws(()=>setAdGifDelays(input,10,95),/时序参数无效/);
});
