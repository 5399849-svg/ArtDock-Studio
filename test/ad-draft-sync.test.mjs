import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {Readable} from 'node:stream';
import sharp from 'sharp';
import {createAdResourcesHandler,renderAdJpg} from '../lib/ad-resources-server.mjs';
import {adWorkingThumbnailUrl,mergeAdWorkingUpdate} from '../public/ad-working-state.js';
import {isAdImageUrl} from '../public/ad-image-url.js';

const sheet=JSON.parse(await fs.readFile(new URL('../config/ad-resources-v1.json',import.meta.url),'utf8'));
const endpoint=id=>`/api/ad-resources/batches/sync-test/items/${id}`;
async function request(handler,method,url,body){
 const req=Readable.from(body?[Buffer.from(JSON.stringify(body))]:[]);req.method=method;let status,headers,buffer;
 await handler(req,{writeHead(s,h){status=s;headers=h},end(b){buffer=Buffer.from(b)}},new URL(url,'http://localhost'));
 return {status,headers,buffer,body:headers['Content-Type'].includes('application/json')?JSON.parse(buffer):null};
}
async function fixture(t,alter){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'ad-draft-sync-')),storageDir=path.join(root,'storage'),folder=path.join(storageDir,'ad-resources-sync-test'),candidates=path.join(folder,'candidate');
 t.after(()=>fs.rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:30}));await fs.mkdir(path.join(folder,'asset'),{recursive:true});await fs.mkdir(candidates);
 const art=await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><rect width="1280" height="720" fill="#345678"/><circle cx="180" cy="280" r="140" fill="#b4cea3"/><rect x="600" y="140" width="330" height="400" fill="#a89868"/></svg>')).png().toBuffer();
 const logo=await sharp({create:{width:80,height:40,channels:4,background:'#ed2020'}}).png().toBuffer();
 for(const name of ['art','second-art'])await fs.writeFile(path.join(folder,`asset/${name}.png`),art);
 for(const name of ['logo','second-logo'])await fs.writeFile(path.join(folder,`asset/${name}.png`),logo);
 const assets=['art','second-art','logo','second-logo'].map(id=>({id,role:id.includes('logo')?'logo':'visual',name:id+'.png',url:`/storage/ad-resources-sync-test/asset/${id}.png`,width:id.includes('logo')?80:1280,height:id.includes('logo')?40:720,logoFree:!id.includes('logo'),hasEmbeddedLogo:false}));
 const batch={id:'sync-test',project:'联动测试',sourceSha256:sheet.sourceSha256,assets,items:{}};
 for(const [i,spec]of sheet.specs.entries()){
  const draft={sourceAssetId:spec.id==='ad-09'?'second-art':'art',logoAssetId:spec.logo==='required'?(spec.id==='ad-09'?'second-logo':'logo'):'',zoom:1+i*.01,offsetX:0,offsetY:0,logoScale:.2+i*.01,logoX:.05+i*.01,logoY:.05};
  const name=spec.id+'-before.jpg';await fs.writeFile(path.join(candidates,name),await renderAdJpg(art,spec,draft,spec.logo==='required'?logo:null));
  batch.items[spec.id]={draft,versions:[{number:1,name,storageName:name,url:`/storage/ad-resources-sync-test/candidate/${name}`} ]};
 }
 alter?.(batch);const file=path.join(root,'ad-resources-jobs.json');await fs.writeFile(file,JSON.stringify([batch]));
 const make=()=>createAdResourcesHandler({root,runtimeDir:root,storageDir,catalogProvider:async()=>sheet,nanoGenerate:()=>assert.fail('manual synchronization cannot generate new artwork'),aiEditGenerate:()=>assert.fail('manual synchronization cannot invoke a paid AI')});
 const handler=await make(),get=async(h=handler)=>(await request(h,'GET','/api/ad-resources')).body.batches[0];
 const edit=async(id,patch,h=handler)=>{const batch=await get(h);return (await request(h,'PUT',endpoint(id)+'/draft',{...batch.items[id].draft,...patch,syncSimilar:true})).body;};
 return {root,file,folder,candidates,handler,make,get,edit};
}

test('landscape Logo placement propagates to all required peers without touching artwork, no-Logo or other shapes',async t=>{
 const f=await fixture(t),before=await f.get(),files=await fs.readdir(f.candidates),changed={logoScale:.31,logoX:.42,logoY:.11};
 const result=await f.edit('ad-01',changed);assert.deepEqual(result.sync.updated,['ad-06','ad-09']);assert.equal(result.sync.skipped.length,0);
 const after=await f.get();for(const id of ['ad-01','ad-06','ad-09']){
  for(const [key,value]of Object.entries(changed))assert.equal(after.items[id].draft[key],value);
  assert.equal(after.items[id].draft.sourceAssetId,before.items[id].draft.sourceAssetId);assert.equal(after.items[id].draft.logoAssetId,before.items[id].draft.logoAssetId);assert.equal(after.items[id].draft.zoom,before.items[id].draft.zoom);assert.equal(after.items[id].draftDirty,true);assert.deepEqual(after.items[id].versions,before.items[id].versions);
 }
 for(const id of ['ad-02','ad-03','ad-05','ad-07','ad-08','ad-10','ad-11'])assert.deepEqual(after.items[id],before.items[id]);
 assert.deepEqual(await fs.readdir(f.candidates),files);
 const unchanged=await fs.readFile(f.file,'utf8');await f.edit('ad-01',changed);assert.equal(await fs.readFile(f.file,'utf8'),unchanged,'a repeated save must not add undo steps or rewrite metadata');
});

test('portrait Logo placement uses normalized geometry across 1080×1920 and 720×1280; either peer can lead',async t=>{
 const f=await fixture(t),before=await f.get(),geometry={logoScale:.4,logoX:.29,logoY:.03};await f.edit('ad-05',geometry);
 let batch=await f.get();for(const id of ['ad-05','ad-11'])for(const [key,value]of Object.entries(geometry))assert.equal(batch.items[id].draft[key],value);
 assert.deepEqual(batch.items['ad-07'],before.items['ad-07']);
 await f.edit('ad-11',{logoX:.48});batch=await f.get();assert.equal(batch.items['ad-05'].draft.logoX,.48);
 for(const id of ['ad-01','ad-06','ad-09','ad-08','ad-10'])assert.deepEqual(batch.items[id],before.items[id]);
});

test('view adjustments propagate to both 800×800 variants without moving or adding Logos, and show fresh working thumbnails',async t=>{
 const f=await fixture(t),before=await f.get();const result=await f.edit('ad-08',{zoom:1.5,offsetX:.22,offsetY:-.14});assert.deepEqual(result.sync.updated,['ad-10']);
 const batch=await f.get();for(const id of ['ad-08','ad-10']){assert.equal(batch.items[id].draft.zoom,1.5);assert.equal(batch.items[id].draft.offsetX,.22);assert.equal(batch.items[id].draft.offsetY,-.14);assert.equal(batch.items[id].draft.logoAssetId,before.items[id].draft.logoAssetId);assert.equal(batch.items[id].draft.logoScale,before.items[id].draft.logoScale);assert.equal(batch.items[id].versions.length,1);}
 for(const id of Object.keys(before.items).filter(id=>!['ad-08','ad-10'].includes(id)))assert.deepEqual(batch.items[id],before.items[id]);
 const url=adWorkingThumbnailUrl(batch.id,'ad-10',batch.items['ad-10']);assert.equal(isAdImageUrl(url),true);const r=await request(f.handler,'GET',url),meta=await sharp(r.buffer).metadata();assert.equal(r.headers['Cache-Control'],'no-store');assert.ok(meta.width<=360&&meta.height<=240);
 const merged=structuredClone(before);assert.deepEqual(mergeAdWorkingUpdate(merged,'ad-08',result),['ad-08','ad-10']);assert.deepEqual(merged.items['ad-10'].draft,batch.items['ad-10'].draft);assert.equal(merged.items['ad-10'].draftCanUndo,true);assert.equal(merged.items['ad-10'].draftUpdatedAt,batch.items['ad-10'].draftUpdatedAt);
});

test('landscape view adjustments include no-Logo peers and exclude the protected 640×400 layout',async t=>{
 const f=await fixture(t),before=await f.get();const result=await f.edit('ad-02',{zoom:1.3,offsetX:-.2});assert.deepEqual(result.sync.updated,['ad-01','ad-06','ad-09']);
 const batch=await f.get();for(const id of ['ad-01','ad-06','ad-09']){assert.equal(batch.items[id].draft.zoom,1.3);assert.equal(batch.items[id].draft.logoX,before.items[id].draft.logoX);assert.equal(batch.items[id].draft.sourceAssetId,before.items[id].draft.sourceAssetId);}assert.deepEqual(batch.items['ad-03'],before.items['ad-03']);
});

test('undo and redo from any synchronized peer restore the whole action and survive restart',async t=>{
 const f=await fixture(t),before=await f.get();await f.edit('ad-01',{logoX:.45});const handler=await f.make(),batch=await f.get(handler);
 let result=(await request(handler,'POST',endpoint('ad-06')+'/draft/undo',{draft:batch.items['ad-06'].draft})).body;assert.equal(result.sync.updated.length,2);assert.equal(result.canRedo,true);
 let restored=await f.get(handler);for(const id of ['ad-01','ad-06','ad-09'])assert.deepEqual(restored.items[id].draft,before.items[id].draft);
 await request(handler,'POST',endpoint('ad-09')+'/draft/redo',{draft:restored.items['ad-09'].draft});restored=await f.get(handler);for(const id of ['ad-01','ad-06','ad-09']){assert.equal(restored.items[id].draft.logoX,.45);assert.equal(restored.items[id].versions.length,1);}
});

test('subsequent independent work prevents a group undo from overwriting it',async t=>{
 const f=await fixture(t);await f.edit('ad-01',{logoX:.45});let batch=await f.get();await request(f.handler,'PUT',endpoint('ad-09')+'/draft',{...batch.items['ad-09'].draft,offsetX:.2});
 const before=await fs.readFile(f.file,'utf8');batch=await f.get();await assert.rejects(()=>request(f.handler,'POST',endpoint('ad-01')+'/draft/undo',{draft:batch.items['ad-01'].draft}),/同类尺寸已继续调整/);assert.equal(await fs.readFile(f.file,'utf8'),before);
});

test('a running/reviewing peer blocks the entire edit, while embedded or missing Logos are explicitly skipped',async t=>{
 for(const status of ['result_uncertain','awaiting_review']){
  const f=await fixture(t,b=>b.items['ad-06'].aiEditJob={id:'locked',status}),before=await fs.readFile(f.file,'utf8');await assert.rejects(()=>f.edit('ad-01',{logoX:.4}),/AI 修改|采用或放弃/);assert.equal(await fs.readFile(f.file,'utf8'),before);
 }
 const f=await fixture(t,b=>{b.assets.find(a=>a.id==='second-art').hasEmbeddedLogo=true;b.items['ad-06'].draft.logoAssetId='';});const before=await f.get(),result=await f.edit('ad-01',{logoX:.4});
 assert.deepEqual(result.sync.updated,[]);assert.deepEqual(result.sync.skipped.map(e=>e.specId),['ad-06','ad-09']);const batch=await f.get();for(const id of ['ad-06','ad-09'])assert.deepEqual(batch.items[id],before.items[id]);
});

test('Logo-only natural-language adjustment follows automatic synchronization without a paid generation',async t=>{
 const f=await fixture(t),batch=await f.get(),result=(await request(f.handler,'POST',endpoint('ad-01')+'/ai-edit',{requestId:'logo-sync-no-provider',prompt:'Logo 放大20%，Logo 移到右上角',expectedVersion:1,draft:batch.items['ad-01'].draft,reviewBeforeApply:true,syncSimilar:true})).body;
 assert.equal(result.localDraft,true);assert.deepEqual(result.sync.updated,['ad-06','ad-09']);const after=await f.get();for(const id of ['ad-01','ad-06','ad-09']){assert.equal(after.items[id].draft.logoScale,.24);assert.equal(after.items[id].draft.logoX,.72);assert.equal(after.items[id].versions.length,1);assert.equal(after.items[id].aiEditJob,undefined);}
});

test('repeated linked gestures retain at most 30 undo actions and no orphaned group records or image files',async t=>{
 const f=await fixture(t),files=await fs.readdir(f.candidates);for(let n=1;n<=35;n++)await f.edit('ad-01',{logoX:(10+n)/100});
 const batch=await f.get();assert.equal(batch.draftSyncSteps.length,30);for(const id of ['ad-01','ad-06','ad-09']){assert.equal(batch.items[id].draftUndo.length,30);assert.equal(batch.items[id].draftUndoStepIds.length,30);assert.equal(batch.items[id].versions.length,1);}assert.deepEqual(await fs.readdir(f.candidates),files);
});

test('a Logo-only group command from a no-Logo peer aligns required peers and returns the selected draft',async t=>{
 const f=await fixture(t),batch=await f.get(),ids=['ad-01','ad-02','ad-06','ad-09'];
 const result=(await request(f.handler,'POST',endpoint('ad-02')+'/ai-edit',{scope:'same-ratio',requestId:'logo-group-from-clean',prompt:'Logo 放大20%',expectedVersion:1,draft:batch.items['ad-02'].draft,targets:ids.map(specId=>({specId,expectedVersion:1,draft:batch.items[specId].draft})),reviewBeforeApply:true,syncSimilar:true})).body;
 assert.equal(result.localDraft,true);assert.deepEqual(result.draft,batch.items['ad-02'].draft);assert.deepEqual(result.sync.updated,['ad-01','ad-06','ad-09']);
 const after=await f.get();assert.deepEqual(after.items['ad-02'],batch.items['ad-02']);for(const id of ['ad-01','ad-06','ad-09'])assert.equal(after.items[id].draft.logoScale,.24);
});
