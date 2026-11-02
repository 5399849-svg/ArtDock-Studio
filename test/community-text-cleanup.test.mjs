import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {eraseTextPixels,TextEraseDocument,textEraseImagePoint,validateEraseStrokes} from '../public/text-erase.js';
import {renderTextCleanupTool} from '../public/community-text-cleanup.js';
import {eraseCommunityTextPng,createCommunityTextCleanup} from '../lib/community-text-cleanup.mjs';
import {communityMasterTemplate as master} from '../lib/community-master-workspace.mjs';

const width=80,height=40;
function pixels(){
 const data=new Uint8ClampedArray(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const i=(y*width+x)*4;data.set([200+x%55,145+y%40,72+x%40,0],i);
  // Main glyph includes semitransparent texture and deliberate transparent gaps.
  if(x>=30&&x<70&&y>=10&&y<30)data[i+3]=x%7===0?0:(x+y)%5===0?83:255;
  if(x>=7&&x<13&&y>=7&&y<13)data[i+3]=197;
 }
 return data;
}
const speck=[{radius:6,points:[{x:10,y:10}]}];
const png=async(data=pixels())=>sharp(data,{raw:{width,height,channels:4}}).png().toBuffer();
const decode=async bytes=>sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});

test('eraser changes alpha only inside the brush and preserves glyph texture, dimensions and source bytes',async()=>{
 const original=pixels(),result=eraseTextPixels(original,width,height,speck);
 assert.ok(result.changedPixels>0);assert.ok(result.visiblePixels>0);assert.equal(result.data[(10*width+10)*4+3],0);
 for(let i=0;i<width*height;i++){
  assert.deepEqual(result.data.slice(i*4,i*4+3),original.slice(i*4,i*4+3));
  if(!result.mask[i])assert.equal(result.data[i*4+3],original[i*4+3]);
  if(i%width>=30)assert.equal(result.data[i*4+3],original[i*4+3]);
 }
 const source=await png(),copy=Buffer.from(source),saved=await eraseCommunityTextPng(source,speck),decoded=await decode(saved.buffer);
 assert.deepEqual(source,copy);assert.equal(decoded.info.width,width);assert.equal(decoded.info.height,height);assert.deepEqual(decoded.data,Buffer.from(result.data));
});

test('long strokes are continuous and overlaps never progressively erode antialiasing',()=>{
 const original=pixels(),line={radius:2,points:[{x:32,y:20},{x:67,y:20}]};
 const one=eraseTextPixels(original,width,height,[line]),twice=eraseTextPixels(original,width,height,[line,line]);
 assert.deepEqual(twice.data,one.data);
 for(let x=32;x<=67;x++)assert.equal(one.data[(20*width+x)*4+3],0);
});

test('preview commands match export exactly, undo restores source, redo restores edit, new strokes clear redo',()=>{
 const original=pixels(),doc=new TextEraseDocument(original,width,height);
 doc.begin({x:9,y:9},4);doc.append({x:12,y:12});doc.end();
 assert.deepEqual(doc.data,eraseTextPixels(original,width,height,doc.strokes).data);
 const edited=doc.data.slice();doc.undo();assert.deepEqual(doc.data,original);assert.equal(doc.redos.length,1);
 doc.redo();assert.deepEqual(doc.data,edited);doc.undo();doc.begin({x:65,y:20},3);doc.end();assert.equal(doc.redos.length,0);
});

test('painting transparent space is a no-op and preserves undo history',()=>{
 const doc=new TextEraseDocument(pixels(),width,height);doc.begin({x:10,y:10},6);doc.end();doc.undo();
 doc.begin({x:1,y:35},1);doc.end();assert.equal(doc.strokes.length,0);assert.equal(doc.redos.length,1);assert.deepEqual(doc.data,doc.original);
});

test('coordinates respect zoom and scroll and clamp pointer capture outside the image',()=>{
 const rect={left:-160,top:73,width:400,height:200};
 assert.deepEqual(textEraseImagePoint(40,173,rect,width,height),{x:40,y:20});
 assert.deepEqual(textEraseImagePoint(-900,900,rect,width,height),{x:0,y:height});
});

test('invalid, excessive, empty and all-erased operations fail without producing a usable asset',async()=>{
 for(const strokes of [null,[],[{radius:0,points:[{x:1,y:1}]}],[{radius:5,points:[{x:Infinity,y:1}]}],[{radius:5,points:[{x:-1,y:1}]}],Array(401).fill(speck[0])])assert.throws(()=>validateEraseStrokes(strokes,width,height));
 await assert.rejects(eraseCommunityTextPng(await png(),[{radius:1,points:[{x:1,y:35}]}]),e=>e.status===422&&/还没有擦除/.test(e.message));
 await assert.rejects(eraseCommunityTextPng(await png(),[{radius:100,points:[{x:40,y:20}]}]),e=>e.status===422&&/全部文字/.test(e.message));
 await assert.rejects(eraseCommunityTextPng(await png(),[]),e=>e.status===422);
});

function fixture(){return {id:'task',copy:'霜降祝福',updatedAt:'before',status:'批量生成',masterTemplateId:master.id,targetTemplateIds:['target'],assets:[{name:'title.png',mime:'image/png',role:'title',materialKind:'title',exactText:'霜降祝福',width,height}],parameters:{assetByTemplate:{[master.id]:{title:'title.png',background:'scene.png'},target:{title:'title.png',background:'target.png'}},layoutByTemplate:{[master.id]:{title:{x:141,y:295,width:900,height:450,visible:true,effects:{stroke:{enabled:true,width:4},shadow:{enabled:true,blur:10}}}},target:{title:{x:20,y:30,width:300,height:150}}},backgroundByTemplate:{target:{url:'/target.png'}}},communityMasterApproval:{fingerprint:'approved'},communityDesign:{versions:[]},history:[]};}
async function setup(t){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'workbench-text-cleanup-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const task=fixture(),tasksFile=path.join(dir,'tasks.json'),storageDir=path.join(dir,'storage'),assets=path.join(storageDir,task.id,'assets');await fs.mkdir(assets,{recursive:true});await fs.writeFile(path.join(assets,'title.png'),await png());await fs.writeFile(tasksFile,JSON.stringify([task]));
 const jobs=new Map(),invalidated=[],service=createCommunityTextCleanup({tasksFile,storageDir,templateMap:new Map([[master.id,master]]),jobs,invalidate:(task,reason)=>invalidated.push(reason)});
 const input={kind:'title',sourceName:'title.png',expectedUpdatedAt:'before',requestId:'cleanup-test-12345',strokes:speck};
 return {task,tasksFile,assets,jobs,invalidated,service,input,read:async()=>JSON.parse(await fs.readFile(tasksFile))[0]};
}

test('save creates a new material version, keeps old files, master geometry/effects and every target binding',async t=>{
 const f=await setup(t);f.task.assets[0].fontProvenance={fontId:'font-test',method:'licensed-glyph-reference-v1'};await fs.writeFile(f.tasksFile,JSON.stringify([f.task]));const source=await fs.readFile(path.join(f.assets,'title.png')),saved=await f.service.save('task',f.input),name=saved.parameters.assetByTemplate[master.id].title;
 assert.deepEqual(saved.assets.at(-1).fontProvenance,f.task.assets[0].fontProvenance);
 assert.notEqual(name,'title.png');assert.deepEqual(saved.parameters.layoutByTemplate,f.task.parameters.layoutByTemplate);assert.deepEqual(saved.parameters.assetByTemplate.target,f.task.parameters.assetByTemplate.target);assert.deepEqual(saved.parameters.backgroundByTemplate,f.task.parameters.backgroundByTemplate);
 assert.equal(saved.communityMasterApproval,null);assert.equal(f.invalidated.length,1);assert.equal(saved.assets.length,2);
 assert.deepEqual(await fs.readFile(path.join(f.assets,'title.png')),source);assert.ok(saved.communityDesign.versions.some(v=>v.snapshot.assets.title==='title.png'));assert.ok(saved.communityDesign.versions.some(v=>v.snapshot.assets.title===name));
 const output=await decode(await fs.readFile(path.join(f.assets,name))),expected=eraseTextPixels((await decode(source)).data,width,height,speck);assert.deepEqual(output.data,Buffer.from(expected.data));assert.equal(saved.assets.at(-1).generatorModel,'local-eraser');
});

test('retry is idempotent and request IDs cannot be reused for different strokes',async t=>{
 const f=await setup(t);const first=await f.service.save('task',f.input),again=await f.service.save('task',f.input);assert.deepEqual(again,first);assert.equal(f.invalidated.length,1);assert.equal((await fs.readdir(f.assets)).length,2);
 await assert.rejects(f.service.save('task',{...f.input,strokes:[{radius:5,points:[{x:10,y:10}]}]}),e=>e.status===409);assert.deepEqual(await f.read(),first);
});

for(const [name,change] of [
 ['stale metadata',f=>f.input.expectedUpdatedAt='stale'],
 ['changed source',f=>f.task.parameters.assetByTemplate[master.id].title='other.png'],
 ['whole artwork',f=>f.task.parameters.communityArtworkByTemplate={[master.id]:{assetName:'whole.png'}}],
 ['active generation',f=>f.task.communityGeneration={status:'running'}],
 ['active outpaint',f=>f.task.outpaint={status:'running'}],
 ['in-memory job',f=>f.jobs.set('task',{})],
 ['delivered task',f=>{f.task.status='已完成';f.task.deliveredPackage={url:'/completed.zip'};}],
 ['hidden source',f=>f.task.assets[0].libraryDeletedAt='removed']
])test(`save rejects ${name} without changing metadata or files`,async t=>{
 const f=await setup(t);change(f);await fs.writeFile(f.tasksFile,JSON.stringify([f.task]));const before=await fs.readFile(f.tasksFile);
 await assert.rejects(f.service.save('task',f.input),e=>e.status===409);assert.deepEqual(await fs.readFile(f.tasksFile),before);assert.deepEqual(await fs.readdir(f.assets),['title.png']);assert.equal(f.invalidated.length,0);
});

test('entry is offered only for independent title/subtitle image assets and is wired into the master inspector',async()=>{
 const asset={mime:'image/png'};assert.match(renderTextCleanupTool('title',asset),/community-cleanup-text/);assert.match(renderTextCleanupTool('subtitle',asset,{disabled:true}),/disabled/);
 for(const kind of ['background','logo','character'])assert.equal(renderTextCleanupTool(kind,asset),'');assert.equal(renderTextCleanupTool('title',null),'');assert.equal(renderTextCleanupTool('title',{mime:'font/otf'}),'');
 const app=await fs.readFile('public/app.js','utf8');assert.match(app,/const cleanupTool=template.communityMaster \? renderTextCleanupTool/);assert.match(app,/\$\{elementTabs\}\$\{cleanupTool\}/);
});
