import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {Readable} from 'node:stream';
import sharp from 'sharp';
import {createCommunityObjectController} from '../lib/community-object-server.mjs';
import {communityRewardGroups,communityObjectImageUrl} from '../public/community-object-state.js';
import {renderCommunityObjectLibrary,renderCommunityObjectInspector} from '../public/community-objects.js';
import {transparentRewardPng,communityCurrentSource} from '../lib/community-object-assets.mjs';
import {communityStyleRequest,decorationReference,validateObjectSelection,preserveObjectCutout} from '../lib/community-object-jobs.mjs';
import {renderMasterInputs} from '../public/community-master-page.js';
import {placeCommunityObject,communityObjectLayerImageUrl} from '../public/community-object-layers.js';

const id='11111111-2222-4333-8444-555555555555',template={id:'community-banner-master',communityMaster:true,width:320,height:180};
const selection={box:[.02,.02,.95,.98],points:[{x:.35,y:.45,label:1},{x:.35,y:.4,label:1}]};
async function request(controller,method,route,body){
 const req=Readable.from(body?[Buffer.from(JSON.stringify(body))]:[]);req.method=method;let status,headers,result;
 await controller.handle(req,{writeHead(s,h){status=s;headers=h;},end(value){result=value;}},new URL(route,'http://localhost'));
 return {status,headers,body:headers?.['Content-Type']?.includes('json')?JSON.parse(String(result)):Buffer.from(result||'')};
}
async function fixture(t,options={}){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'community-objects-'));t.after(()=>fs.rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:50}));const storageDir=path.join(root,'storage'),assetDir=path.join(storageDir,id,'assets');await fs.mkdir(assetDir,{recursive:true});
 const scene=await sharp(Buffer.from('<svg width="640" height="360"><rect width="640" height="360" fill="#f6e0aa"/><circle cx="224" cy="160" r="90" fill="#34576d"/><rect x="200" y="180" width="90" height="140" fill="#cb7712"/></svg>')).png().toBuffer();
 const icon=await sharp(Buffer.from('<svg width="80" height="80"><rect x="15" y="10" width="50" height="60" rx="5" fill="#ffbb00"/></svg>')).png().toBuffer();
 await fs.writeFile(path.join(assetDir,'scene.png'),scene);await fs.writeFile(path.join(assetDir,'original-character.png'),await sharp(scene).modulate({hue:150}).png().toBuffer());
 const assets=[{name:'scene.png',role:'mother-candidate',materialKind:'illustration',mime:'image/png',width:640,height:360,url:`/storage/${id}/assets/scene.png`},{name:'original-character.png',role:'character',mime:'image/png',url:`/storage/${id}/assets/original-character.png`}];
 for(let i=1;i<=4;i++){await fs.writeFile(path.join(assetDir,`reward${i}.png`),icon);assets.push({name:`reward${i}.png`,role:'reward',mime:'image/png',width:80,height:80,url:`/storage/${id}/assets/reward${i}.png`});}
 const task={id,project:'每日抽奖测试',status:'主图制作',updatedAt:'initial',masterTemplateId:template.id,targetTemplateIds:['target'],copy:'每日抽奖',assets,parameters:{assetByTemplate:{[template.id]:{background:'scene.png'}},backgroundByTemplate:{[template.id]:{scale:100}},layoutByTemplate:{target:{title:{x:1,y:2}}}},communityDesign:{versions:[]}};
 const tasksFile=path.join(root,'tasks.json');await fs.writeFile(tasksFile,JSON.stringify([task]));const jobs=new Map(),calls=[],segments=[];
 const style=await sharp(Buffer.from('<svg width="256" height="256"><rect width="256" height="256" fill="#ff00ff"/><rect x="20" y="20" width="216" height="216" rx="25" fill="#e3d9f3" stroke="#9d69cf" stroke-width="4"/></svg>')).png().toBuffer();
 const config={serveImage:options.serveImage,tasksFile,storageDir,templateMap:new Map([[template.id,template]]),jobs,readBody:async req=>{const chunks=[];for await(const chunk of req)chunks.push(chunk);return JSON.parse(Buffer.concat(chunks).toString()||'{}');},segmentAvailable:async()=>true,
  segment:async input=>{segments.push(input);if(options.segment)return options.segment(input);const meta=await sharp(input.sourceBuffer).metadata();return sharp(Buffer.from(`<svg width="${meta.width}" height="${meta.height}"><circle cx="${meta.width*.35}" cy="${meta.height*.45}" r="${meta.height*.22}" fill="#ff0000"/></svg>`)).png().toBuffer();},
  loadConfig:async()=>({enabled:true}),createCanvas:async()=>19,submitGeneration:async(bodyConfig,body,receipt)=>{calls.push({body,receipt});if(options.submit)return options.submit(body,receipt);return 'provider-style-123';},pollJob:async()=>{},downloadRaw:async()=>({buffer:calls.at(-1)?.body.prompt.includes('#00FF00')?await sharp(Buffer.from('<svg width="256" height="256"><rect width="256" height="256" fill="#00ff00"/><rect x="20" y="20" width="216" height="216" rx="25" fill="#e3d9f3" stroke="#9d69cf" stroke-width="4"/></svg>')).png().toBuffer():style})};
 const make=()=>createCommunityObjectController(config),controller=make(),get=async()=>JSON.parse(await fs.readFile(tasksFile,'utf8'))[0],route=`/api/tasks/${id}/community-objects`,post=async(action,input={})=>request(controller,'POST',route+'/'+action,{expectedRevision:(await get()).communityObjects?.revision||0,...input});
 const poll=async()=>{for(let i=0;i<500;i++){const current=await get();if(current.communityObjectJob?.status!=='running')return current;await new Promise(r=>setTimeout(r,10));}assert.fail('Object job did not settle');};
 return {root,storageDir,assetDir,tasksFile,task,scene,icon,style,jobs,calls,segments,make,controller,get,route,post,poll};
}

test('four rewards stay four cards, decorations are nested, and GET thumbnails never mutate old task data',async t=>{
 const f=await fixture(t),before=await fs.readFile(f.tasksFile,'utf8'),task=await f.get(),groups=communityRewardGroups(task);assert.equal(groups.length,4);const html=renderCommunityObjectLibrary(task);assert.equal((html.match(/data-object-reward=/g)||[]).length,4);assert.equal((html.match(/data-object-character=/g)||[]).length,0);assert.ok(!html.includes('气泡 · 4'));
 const left=renderMasterInputs(task);assert.match(left,/奖励道具/);assert.match(left,/从当前稿提取人物/);
 for(const reward of groups){const result=await request(f.controller,'GET',communityObjectImageUrl(task,reward,{thumbnail:true}));assert.equal(result.status,200);const meta=await sharp(result.body).metadata();assert.equal(meta.hasAlpha,true);assert.equal(meta.width,240);}
 assert.equal(await fs.readFile(f.tasksFile,'utf8'),before);assert.equal(f.calls.length,0);assert.equal(f.segments.length,0);
});

test('micro-adjustments and apply-all save metadata only; original artwork, history and source bytes stay unchanged',async t=>{
 const f=await fixture(t),before=await f.get(),files=await fs.readdir(f.assetDir),reward=communityRewardGroups(before)[0];
 for(let i=0;i<8;i++){const response=await f.post('update',{rewardId:reward.id,style:{kind:'bubble',scale:.65+i*.04,opacity:.7,contentScale:.6}});assert.equal(response.status,200);}
 const all=await f.post('update',{rewardId:reward.id,scope:'all',style:{kind:'none',scale:1,opacity:.5,contentScale:.75}});assert.equal(all.status,200);const after=await f.get();assert.equal(after.communityObjects.rewards.length,4);assert.ok(after.communityObjects.rewards.every(r=>r.style.kind==='none'));assert.deepEqual(after.parameters,before.parameters);assert.deepEqual(after.communityDesign,before.communityDesign);assert.deepEqual(after.assets,before.assets);assert.deepEqual(await fs.readdir(f.assetDir),files);assert.ok((await fs.readFile(path.join(f.assetDir,'scene.png'))).equals(f.scene));
 const stale=await request(f.controller,'POST',f.route+'/update',{expectedRevision:0,rewardId:reward.id,style:{kind:'bubble'}});assert.equal(stale.status,409);
});

test('AI generates an isolated reusable decoration, adoption applies to all and ZIP includes the common style once',async t=>{
 const f=await fixture(t),before=await f.get(),reward=communityRewardGroups(before)[0];const submitted=await f.post('generate',{kind:'style',rewardId:reward.id,name:'淡紫底板',scope:'all',layer:'backing',prompt:'淡紫色圆角底板',model:'gpt-image-2',requestId:'style-request-123'});assert.equal(submitted.status,202);const ready=await f.poll();assert.equal(ready.communityObjectJob.status,'done');assert.ok(ready.communityObjects.styleCandidate);assert.ok(ready.communityObjects.rewards.every(r=>r.style.kind==='bubble'));assert.equal(f.calls.length,1);assert.equal(f.calls[0].body.images,undefined);assert.match(f.calls[0].body.prompt,/不能重画或替换原道具/);
 const adopted=await f.post('accept',{candidateId:ready.communityObjects.styleCandidate.id});assert.equal(adopted.status,200);const task=await f.get();assert.equal(task.communityObjects.styles.length,1);assert.ok(task.communityObjects.rewards.every(r=>r.style.styleId===task.communityObjects.styles[0].id));assert.deepEqual(task.parameters,before.parameters);assert.deepEqual(task.communityDesign,before.communityDesign);
 const image=await request(f.controller,'GET',communityObjectImageUrl(task,task.communityObjects.rewards[0]));assert.equal(image.status,200);assert.equal((await sharp(image.body).metadata()).hasAlpha,true);
 const files=await f.controller.downloadFiles(task);assert.equal(files.filter(f=>f.name.startsWith('共用装饰/')).length,1);assert.equal(files.filter(f=>f.name.endsWith('/组合.png')).length,4);assert.equal(files.filter(f=>f.name.endsWith('/道具.png')).length,4);assert.equal(f.calls.length,1);
});

test('a style candidate cannot overwrite settings changed after generation, and abandoning creates no style card',async t=>{
 const f=await fixture(t),reward=communityRewardGroups(await f.get())[0];await f.post('generate',{kind:'style',rewardId:reward.id,layer:'backing',prompt:'金色边框',model:'banana_pro',requestId:'style-conflict-123'});const ready=await f.poll();await f.post('update',{rewardId:reward.id,style:{kind:'none'}});const rejected=await f.post('accept',{candidateId:ready.communityObjects.styleCandidate.id});assert.equal(rejected.status,409);const discarded=await f.post('discard',{candidateId:ready.communityObjects.styleCandidate.id});assert.equal(discarded.status,200);assert.equal((await f.get()).communityObjects.styles.length,0);assert.equal((await f.get()).communityObjects.rewards.length,4);
});

test('character extraction is pinned to the current generated draft, preserves RGB, and never switches the master',async t=>{
 const f=await fixture(t),before=await f.get(),source=communityCurrentSource(before);const result=await f.post('generate',{kind:'character',sourceToken:source.token,selection,requestId:'character-request-123'});assert.equal(result.status,202);const done=await f.poll();assert.equal(done.communityObjectJob.status,'done',done.communityObjectJob.error);assert.equal(f.segments.length,1);assert.equal(f.calls.length,0);assert.ok((await sharp(f.segments[0].sourceBuffer).removeAlpha().raw().toBuffer()).equals(await sharp(f.scene).removeAlpha().raw().toBuffer()));
 const group=done.communityObjects.characters[0],asset=done.assets.find(a=>a.name===group.assetName);assert.equal(group.sourceName,'scene.png');assert.equal(asset.extractionMethod,'source-pixel-mask-v1');assert.deepEqual(done.parameters,before.parameters);assert.deepEqual(done.communityDesign,before.communityDesign);
 const raw=await sharp(await fs.readFile(path.join(f.assetDir,asset.name))).ensureAlpha().raw().toBuffer();let opaque=0,clear=0;for(let p=0;p<raw.length;p+=4){if(raw[p+3]>32){opaque++;assert.ok(!(raw[p]>250&&raw[p+1]<5&&raw[p+2]<5),'Segmenter RGB must be discarded in favour of original pixels');}else clear++;}assert.ok(opaque>0);assert.ok(clear>0);
 const html=renderCommunityObjectInspector(done,{communityObjectMode:'objects',communityObjectSelection:{kind:'character'}});assert.match(html,/下载人物 PNG/);assert.match(html,/当前生成稿/);
 const duplicate=await f.post('generate',{kind:'character',sourceToken:source.token,selection,requestId:'character-request-123'});assert.equal(duplicate.status,202);assert.equal(f.segments.length,1);
});

test('character edge edits pin the extraction source, preserve old PNGs and retry idempotently without rerunning segmentation',async t=>{
 const f=await fixture(t),source=communityCurrentSource(await f.get());await f.post('generate',{kind:'character',sourceToken:source.token,selection,requestId:'edge-extract-123'});const done=await f.poll(),character=done.communityObjects.characters[0],oldName=character.assetName,oldPixels=await fs.readFile(path.join(f.assetDir,oldName));
 assert.ok(done.assets.find(a=>a.name===oldName).cutoutBounds);assert.match(renderCommunityObjectInspector(done,{communityObjectMode:'objects',communityObjectSelection:{kind:'character'}}),/检查与修边/);
 // Changing the current composition must not make an old cutout restore pixels from a different pose/placement.
 done.parameters.backgroundByTemplate[template.id].scale=135;await fs.writeFile(f.tasksFile,JSON.stringify([done]));
 const descriptor=await request(f.controller,'GET',f.route+'/cutout-edit?'+new URLSearchParams({characterId:character.id}));assert.equal(descriptor.status,200);
 const original=await request(f.controller,'GET',descriptor.body.sourceUrl),mask=await request(f.controller,'GET',descriptor.body.maskUrl);assert.equal(original.status,200);assert.equal(mask.status,200);assert.deepEqual(await sharp(original.body).removeAlpha().raw().toBuffer(),await sharp(f.segments[0].sourceBuffer).removeAlpha().raw().toBuffer());
 const parameters=structuredClone(done.parameters),input={characterId:character.id,assetName:oldName,requestId:'edge-save-123',strokes:[{tool:'erase',radius:.03,points:[{x:.35,y:.45}]},{tool:'restore',radius:.01,points:[{x:.35,y:.45}]}]};
 const saved=await f.post('cutout-edit',input);assert.equal(saved.status,200);const edited=await f.get(),group=edited.communityObjects.characters[0];assert.notEqual(group.assetName,oldName);assert.deepEqual(group.versions,[oldName]);assert.equal(f.segments.length,1);assert.equal(f.calls.length,0);assert.deepEqual(edited.parameters,parameters);assert.deepEqual(await fs.readFile(path.join(f.assetDir,oldName)),oldPixels);
 const assetCount=edited.assets.length;assert.equal((await f.post('cutout-edit',input)).status,200);assert.equal((await f.get()).assets.length,assetCount);
 assert.equal((await f.post('cutout-edit',{...input,requestId:'stale-edge-save-123'})).status,409);
 assert.equal((await request(f.controller,'GET',descriptor.body.maskUrl)).status,409);
 const reopened=await request(f.controller,'GET',f.route+'/cutout-edit?'+new URLSearchParams({characterId:character.id}));assert.equal(reopened.status,200);
 assert.equal((await f.post('cutout-edit',{...input,characterId:'foreign-character',requestId:'foreign-edge-123'})).status,404);
 const unchanged=await fs.readFile(f.tasksFile,'utf8');assert.equal((await f.post('cutout-edit',{...input,assetName:group.assetName,requestId:'bad-edge-123',strokes:[{tool:'restore',radius:.1,points:[{x:2,y:0}]}]})).status,422);assert.equal(await fs.readFile(f.tasksFile,'utf8'),unchanged);
});

test('stale sources, invalid points, cross-task rewards and completed tasks reject before any processing',async t=>{
 const f=await fixture(t),before=await f.get();let response=await f.post('generate',{kind:'character',sourceToken:'wrong',selection,requestId:'stale-source-123'});assert.equal(response.status,409);
 response=await f.post('generate',{kind:'character',sourceToken:communityCurrentSource(before).token,selection:{box:[0,0,1,1],points:[]},requestId:'invalid-points-123'});assert.equal(response.status,422);
 response=await f.post('add',{sourceNames:['../../other.png']});assert.equal(response.status,422);assert.equal(f.segments.length,0);assert.equal(f.calls.length,0);
 const tasks=[before];tasks[0].status='已完成';tasks[0].deliveredPackage={name:'done.zip'};await fs.writeFile(f.tasksFile,JSON.stringify(tasks));response=await f.post('update',{rewardId:communityRewardGroups(before)[0].id,style:{kind:'none'}});assert.equal(response.status,409);
});

test('ambiguous style submissions retain request bytes and receipt; resume does not generate a new idempotency key',async t=>{
 let count=0;const f=await fixture(t,{submit:async()=>{if(++count===1)throw Error('network lost');return 'provider-existing';}}),reward=communityRewardGroups(await f.get())[0];const input={kind:'style',rewardId:reward.id,layer:'backing',prompt:'金色边框',model:'banana_pro',requestId:'uncertain-request-123'};
 await f.post('generate',input);let task=await f.poll();assert.equal(task.communityObjectJob.status,'interrupted');assert.equal((await f.post('generate',{...input,requestId:'new-request-blocked'})).status,409);const restarted=f.make();await restarted.restore();assert.equal(f.calls.length,1);await request(restarted,'POST',f.route+'/resume',{});task=await f.poll();assert.equal(task.communityObjectJob.status,'done');assert.equal(f.calls.length,2);assert.equal(f.calls[0].receipt.idempotencyKey,f.calls[1].receipt.idempotencyKey);assert.deepEqual(f.calls[0].body,f.calls[1].body);
});

test('matte removal preserves enclosed white pixels; layout styling references hide their central reward content',async()=>{
 const image=await sharp(Buffer.from('<svg width="100" height="100"><rect width="100" height="100" fill="white"/><rect x="20" y="20" width="60" height="60" fill="#345678"/><rect x="40" y="40" width="20" height="20" fill="white"/></svg>')).png().toBuffer(),result=await transparentRewardPng(image),meta=await sharp(result).metadata();assert.equal(meta.width,60);const raw=await sharp(result).ensureAlpha().raw().toBuffer();assert.equal(raw[(30*60+30)*4+3],255);
 const reference=await sharp({create:{width:200,height:200,channels:3,background:'#ff0000'}}).png().toBuffer(),masked=await decorationReference('data:image/png;base64,'+reference.toString('base64')),pixel=await sharp(masked).extract({left:380,top:380,width:1,height:1}).removeAlpha().raw().toBuffer();assert.deepEqual([...pixel],[238,238,238]);
 const body=communityStyleRequest({layer:'backing',prompt:'参考淡紫边框',model:'banana_pro',matte:'green'},masked);assert.equal(body.images.length,1);assert.match(body.prompt,/不能补回、模仿或猜测/);assert.match(body.prompt,/#00FF00/);assert.throws(()=>validateObjectSelection({box:[0,0,1,1],points:[{x:.5,y:.5,label:0}]}),/保留/);
});

test('a partially invalid upload leaves neither task changes nor orphan files',async t=>{
 const f=await fixture(t),before=await fs.readFile(f.tasksFile,'utf8'),files=await fs.readdir(f.assetDir);
 const result=await f.post('upload',{requestId:'upload-rollback-123',files:[{name:'道具.png',dataUrl:'data:image/png;base64,'+f.icon.toString('base64')},{name:'broken.png',dataUrl:'data:image/png;base64,YmFk'}]});
 assert.equal(result.status,422);assert.equal(await fs.readFile(f.tasksFile,'utf8'),before);assert.deepEqual(await fs.readdir(f.assetDir),files);
});

test('foreground candidates retain the accepted backing and do not duplicate reward cards',async t=>{
 const f=await fixture(t),reward=communityRewardGroups(await f.get())[0];
 for(const [layer,requestId]of [['backing','plate-request-123'],['foreground','front-request-123']]){
  await f.post('generate',{kind:'style',rewardId:reward.id,layer,prompt:'金色边框光效',model:'banana_pro',requestId});
  const ready=await f.poll();assert.equal(ready.communityObjectJob.status,'done',ready.communityObjectJob.error);
  const preview=await request(f.controller,'GET',communityObjectImageUrl(ready,ready.communityObjects.rewards[0],{candidate:true,style:{...ready.communityObjects.rewards[0].style,kind:'backing',styleId:'candidate'}}));assert.equal(preview.status,200);
  assert.equal((await f.post('accept',{candidateId:ready.communityObjects.styleCandidate.id})).status,200);
 }
 const after=await f.get(),style=after.communityObjects.styles.find(s=>s.id===after.communityObjects.rewards[0].style.styleId);
 assert.ok(style.backingName);assert.ok(style.foregroundName);assert.equal(after.communityObjects.rewards.length,4);
});

test('placed PNGs render from owned immutable appearance snapshots and remain downloadable after library removal',async t=>{
 const f=await fixture(t),task=await f.get(),reward=communityRewardGroups(task)[0],layer=placeCommunityObject(task,template,'reward',reward.id),before=await fs.readFile(f.tasksFile,'utf8');
 const response=await request(f.controller,'GET',communityObjectLayerImageUrl(task,layer));assert.equal(response.status,200);const meta=await sharp(response.body).metadata();assert.equal(meta.hasAlpha,true);assert.equal(meta.width,1024);assert.equal(await fs.readFile(f.tasksFile,'utf8'),before);
 const foreign=structuredClone(layer);foreign.appearance.assetName='other-task.png';assert.equal((await request(f.controller,'GET',communityObjectLayerImageUrl(task,foreign))).status,422);
 await fs.writeFile(f.tasksFile,JSON.stringify([task]));assert.equal((await f.post('remove',{kind:'reward',id:reward.id})).status,200);
 assert.equal((await request(f.controller,'GET',communityObjectLayerImageUrl(task,layer))).status,200);
});

test('placed layer images revalidate instead of re-downloading: originals use the shared image server, rendered rewards answer 304',async t=>{
 const served=[],f=await fixture(t,{serveImage:async(req,res,file)=>{served.push(path.basename(file));res.writeHead(200,{'Content-Type':'image/webp'});res.end(Buffer.from('compressed'));return true;}});
 const task=await f.get(),material={id:'material:original',x:.5,y:.5,size:.3,appearance:{kind:'material',groupId:'original',name:'素材',assetName:'original-character.png',aspect:1}};
 const original=await request(f.controller,'GET',communityObjectLayerImageUrl(task,material));
 assert.equal(original.status,200);assert.equal(original.headers['Content-Type'],'image/webp');assert.deepEqual(served,['original-character.png']);
 const layer=placeCommunityObject(task,template,'reward',communityRewardGroups(task)[0].id),route=communityObjectLayerImageUrl(task,layer);
 const first=await request(f.controller,'GET',route);assert.equal(first.status,200);assert.match(first.headers.ETag,/^W\/"/);
 const req=Readable.from([]);req.method='GET';req.headers={'if-none-match':first.headers.ETag};let status,body;
 await f.controller.handle(req,{writeHead(s){status=s;},end(value){body=value;}},new URL(route,'http://localhost'));
 assert.equal(status,304);assert.equal(body,undefined);
 const canvas=Readable.from([]);canvas.method='GET';canvas.headers={'sec-fetch-dest':'image'};let headers,image;
 await f.controller.handle(canvas,{writeHead(s,h){status=s;headers=h;},end(value){image=value;}},new URL(route,'http://localhost'));
 const png=await sharp(first.body).metadata(),webp=await sharp(image).metadata();
 assert.equal(status,200);assert.equal(headers['Content-Type'],'image/webp');assert.notEqual(headers.ETag,first.headers.ETag);
 assert.equal(webp.width,png.width);assert.equal(webp.height,png.height);assert.equal(webp.hasAlpha,true);assert.ok(image.length<first.body.length);
});

test('editing a placed reward updates its layer appearance without creating bitmap files or changing scene pixels',async t=>{
 const f=await fixture(t),task=await f.get(),reward=communityRewardGroups(task)[0];placeCommunityObject(task,template,'reward',reward.id);task.communityMasterApproval={fingerprint:'approved'};await fs.writeFile(f.tasksFile,JSON.stringify([task]));const files=await fs.readdir(f.assetDir);
 assert.equal((await f.post('update',{rewardId:reward.id,style:{kind:'none',contentScale:.5}})).status,200);
 const saved=await f.get();assert.equal(saved.parameters.communityObjectLayersByTemplate[template.id][0].appearance.style.kind,'none');assert.equal(saved.communityMasterApproval,null);assert.deepEqual(await fs.readdir(f.assetDir),files);assert.ok((await fs.readFile(path.join(f.assetDir,'scene.png'))).equals(f.scene));
});
