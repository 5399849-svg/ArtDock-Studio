import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import sharp from 'sharp';
import {layerGeometry} from '../public/store-layer-geometry.js';
import {renderLayeredStorePage} from '../lib/store-preorder.mjs';
import {removeGreenScreen, protectedExpansionPlan, restoreProtectedPixels, matchExtensionEdges} from '../lib/store-psd-ai.mjs';
import {createStorePreorderHandler} from '../lib/store-preorder-server.mjs';

test('PSD outside-artboard pixels remain movable and proportional', async()=>{
  const layer={id:'character',visible:true,rect:{x:-20,y:20,width:50,height:80}};
  const g=layerGeometry(layer,{width:100,height:100},{width:200,height:100},{x:30,scale:100});
  assert.deepEqual(g,{width:50,height:80,left:90,top:20});
  const files=new Map([['background',await sharp({create:{width:100,height:100,channels:4,background:'white'}}).png().toBuffer()],['character',await sharp({create:{width:50,height:80,channels:4,background:'red'}}).png().toBuffer()]]);
  const rendered=await renderLayeredStorePage(files,{width:100,height:100,method:'psd-direct-layers-v2',layers:[{id:'background',visible:true,rect:{x:0,y:0,width:100,height:100}},layer]}, {width:200,height:100,maxKB:500}, {character:{x:30}});
  const {data,info}=await sharp(rendered.buffer).raw().toBuffer({resolveWithObject:true});
  const at=(x,y)=>[...data.subarray((y*info.width+x)*3,(y*info.width+x)*3+3)];
  assert.ok(at(95,25)[0]>220&&at(95,25)[1]<40);
  assert.ok(at(80,25).every(v=>v>230));
  assert.deepEqual(rendered.warnings,[]);
});

test('green-screen removal preserves enclosed green costume details',async()=>{
  const b=await sharp(Buffer.from('<svg width="40" height="40"><rect width="40" height="40" fill="#00ff00"/><rect x="10" y="10" width="20" height="20" fill="red"/><rect x="16" y="16" width="8" height="8" fill="#00ff00"/></svg>')).png().toBuffer();
  const {data}=await sharp(await removeGreenScreen(b)).raw().toBuffer({resolveWithObject:true});
  assert.equal(data[3],0);assert.equal(data[(20*40+20)*4+3],255);
});

test('portrait characters render above screenshots and foreground hides detached costume fragments',async()=>{
  const background=await sharp({create:{width:100,height:100,channels:4,background:'white'}}).png().toBuffer();
  const character=await sharp(Buffer.from('<svg width="100" height="100"><rect x="10" y="10" width="40" height="40" fill="blue"/><rect x="10" y="80" width="40" height="10" fill="blue"/></svg>')).png().toBuffer();
  const screenshot=await sharp(Buffer.from('<svg width="100" height="100"><rect x="10" y="10" width="40" height="40" fill="red"/></svg>')).png().toBuffer();
  const layers=['background','character','screenshot'].map(id=>({id,visible:true,rect:{x:0,y:0,width:100,height:100},...(id==='character'?{foregroundClipY:60}:{})}));
  const files=new Map([['background',background],['character',character],['screenshot',screenshot]]);
  const manifest={width:100,height:100,variant:'portrait',method:'psd-direct-layers-v2',layers};
  const render=async adj=>{const r=await renderLayeredStorePage(files,manifest,{width:100,height:100,maxKB:100},adj);return sharp(r.buffer).raw().toBuffer();};
  const data=await render({});assert.ok(data[(20*100+20)*3+2]>220); // blue above screenshot
  assert.ok(data[(85*100+20)*3]>230); // no isolated skirt below foreground
  const shown=await render({character:{occlude:false}});assert.ok(shown[(85*100+20)*3+2]>220&&shown[(85*100+20)*3]<30);
});

test('cover outpaint replaces original pixels exactly without moving or recoloring them',async()=>{
  const source=await sharp({create:{width:100,height:50,channels:4,background:'#94334f'}}).png().toBuffer();
  const layer={id:'background',compositeArtwork:true,rect:{x:0,y:0,width:100,height:50}};
  const plan=await protectedExpansionPlan(source,layer,{width:100,height:50},{width:100,height:100});
  assert.equal(plan.left,0);assert.equal(plan.top,25);assert.equal(plan.width,100);assert.equal(plan.height,100);
  const changed=await sharp({create:{width:100,height:100,channels:4,background:'lime'}}).png().toBuffer();
  const fixed=await restoreProtectedPixels(changed,source,plan.left,plan.top);
  const region=await sharp(fixed).extract({left:0,top:25,width:100,height:50}).raw().toBuffer();
  assert.deepEqual(region,await sharp(source).raw().toBuffer());
  const outside=await sharp(fixed).extract({left:0,top:0,width:1,height:1}).raw().toBuffer();assert.deepEqual([...outside],[0,255,0,255]);
  assert.equal(layerGeometry({...layer,rect:plan.rect},{width:100,height:50},{width:100,height:100}).top,0);
  const transparent=await sharp({create:{width:2,height:2,channels:4,background:{r:255,g:0,b:0,alpha:0}}}).png().toBuffer();
  const intact=await restoreProtectedPixels(changed,transparent,10,10);
  assert.deepEqual(await sharp(intact).raw().toBuffer(),await sharp(changed).raw().toBuffer());
  const matched=await matchExtensionEdges(changed,source,0,25);
  const protectedMatched=await restoreProtectedPixels(matched,source,0,25);
  assert.deepEqual(await sharp(protectedMatched).extract({left:0,top:25,width:100,height:50}).raw().toBuffer(),await sharp(source).raw().toBuffer());
  assert.notDeepEqual(await sharp(matched).extract({left:10,top:24,width:1,height:1}).raw().toBuffer(),Buffer.from([0,255,0,255]));
});

test('cover protection excludes hidden PSD artboard fringe without cropping character layers',async()=>{
  const source=await sharp(Buffer.from('<svg width="120" height="80"><rect width="120" height="80" fill="lime"/><rect x="10" y="15" width="100" height="50" fill="red"/></svg>')).png().toBuffer();
  const layer={id:'background',compositeArtwork:true,rect:{x:-10,y:-15,width:120,height:80}};
  const plan=await protectedExpansionPlan(source,layer,{width:100,height:50},{width:100,height:100});
  const meta=await sharp(plan.protectedSource).metadata();assert.equal(meta.width,100);assert.equal(meta.height,50);
  const raw=await sharp(plan.protectedSource).raw().toBuffer();
  for(let i=0;i<raw.length;i+=4)assert.deepEqual([...raw.subarray(i,i+4)],[255,0,0,255]);
  const generated=await sharp({create:{width:plan.width,height:plan.height,channels:4,background:'blue'}}).png().toBuffer();
  const fixed=await restoreProtectedPixels(generated,plan.protectedSource,plan.protectedLeft,plan.protectedTop);
  assert.deepEqual([...await sharp(fixed).extract({left:plan.protectedLeft,top:plan.protectedTop+50,width:1,height:1}).raw().toBuffer()],[0,0,255,255]);
  const replay=await protectedExpansionPlan(source,layer,{width:100,height:50},{width:100,height:100},{scale:150},plan.rect);
  assert.equal(replay.protectedTop,plan.protectedTop);assert.equal(replay.width,plan.width);
});

test('PSD regeneration and edit retain real layer sets and synchronize only background',async t=>{
  const runtime=await fs.mkdtemp(path.join(os.tmpdir(),'store-psd-test-')),storage=path.join(runtime,'storage'),id='psd-fixture';
  t.after(()=>fs.rm(runtime,{recursive:true,force:true}));
  const job={id,status:'complete',project:'PSD fixture',sources:[],outputs:[],layerSets:{},version:1,total:132,updatedAt:new Date().toISOString()};
  const buffer=await sharp({create:{width:160,height:160,channels:4,background:'#bbaa99'}}).png().toBuffer();
  for(const variant of ['landscape','portrait']) for(let page=1;page<=6;page++){
    const key=`${variant}-${page}`,dir=path.join(storage,`store-preorder-${id}`,'layers',key);
    await fs.mkdir(dir,{recursive:true});await fs.writeFile(path.join(dir,'background.png'),buffer);
    const manifest={method:'psd-direct-layers-v2',width:160,height:160,layers:[{id:'background',file:'background.png',visible:true,rect:{x:0,y:0,width:160,height:160}}]};
    await fs.writeFile(path.join(dir,'manifest.json'),JSON.stringify(manifest));
    job.layerSets[key]={status:'ready',method:manifest.method,manifest,page,variant};
    const sourceDir=path.join(storage,`store-preorder-${id}`,'source');await fs.mkdir(sourceDir,{recursive:true});await fs.writeFile(path.join(sourceDir,`${key}.png`),buffer);
    job.sources.push({page,variant,file:`${key}.png`,name:key});
  }
  await fs.writeFile(path.join(runtime,'store-preorder-jobs.json'),JSON.stringify([job]));
  const handler=await createStorePreorderHandler({runtimeDir:runtime,storageDir:storage});
  const server=http.createServer(async(req,res)=>{try{await handler(req,res,new URL(req.url,'http://localhost'));}catch(e){res.writeHead(500);res.end(JSON.stringify({error:e.message}));}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
  const url=`http://127.0.0.1:${server.address().port}/api/store-preorder/jobs/${id}`;
  let response=await fetch(url+'/generate',{method:'POST'});assert.equal(response.status,202);
  let current;const deadline=Date.now()+60000;
  do{await new Promise(r=>setTimeout(r,150));current=await(await fetch(url)).json();}while(current.status==='running'&&Date.now()<deadline);
  assert.equal(current.status,'complete',current.error);assert.equal(current.outputs.length,132);
  assert.ok(current.outputs.every(o=>o.layerMethod==='psd-direct-layers-v2'));
  const before=await fs.readFile(path.join(storage,`store-preorder-${id}`,'layers','landscape-2','background.png'));
  response=await fetch(url+'/layers/adjust',{method:'POST',body:JSON.stringify({channel:'黑鲨',width:600,height:600,page:2,syncPages:false,adjustment:{background:{x:5},character:{x:12}}})});assert.equal(response.status,200);
  current=await response.json();
  const group=current.outputs.filter(o=>o.channel==='黑鲨'&&o.width===600);
  assert.equal(group.find(o=>o.page===3).layerAdjustment.background.x,5);
  assert.equal(group.find(o=>o.page===3).layerAdjustment.character.x,0);
  assert.equal(group.find(o=>o.page===2).layerAdjustment.character.x,12);
  assert.deepEqual(await fs.readFile(path.join(storage,`store-preorder-${id}`,'layers','landscape-2','background.png')),before);
  response=await fetch(url+'/psd/candidate',{method:'POST',body:JSON.stringify({channel:'黑鲨',width:600,height:600,page:2,layerId:'copy',prompt:'change'})});assert.equal(response.status,500); // fixture server wraps validation error
  response=await fetch(url+'/generate',{method:'POST'});assert.equal(response.status,202);
  const regenerateDeadline=Date.now()+60000;
  do{await new Promise(r=>setTimeout(r,150));current=await(await fetch(url)).json();}while(current.status==='running'&&Date.now()<regenerateDeadline);
  assert.equal(current.status,'complete',current.error);
  const saved=current.outputs.find(o=>o.channel==='黑鲨'&&o.width===600&&o.page===2);
  assert.equal(saved.layerAdjustment.background.x,5);
  assert.equal(saved.layerAdjustment.character.x,12);
  response=await fetch(url+'/psd/reuse',{method:'POST',body:JSON.stringify({channel:'黑鲨',width:600,height:600,page:2,adjustment:{background:{x:5},character:{x:8,scale:144},copy:{x:18,y:6,scale:129},screenshot:{x:-4,y:-9,scale:117}}})});
  assert.equal(response.status,200);current=await response.json();
  for(const o of current.outputs.filter(o=>o.channel==='黑鲨'&&o.width===600&&o.page>=2)){
    assert.equal(o.layerAdjustment.character.scale,144);assert.equal(o.layerAdjustment.copy.x,18);assert.equal(o.layerAdjustment.screenshot.y,-9);
  }
  assert.equal(current.outputs.find(o=>o.channel==='黑鲨'&&o.width===600&&o.page===1).layerAdjustment.character.scale,100);
  assert.equal(current.outputs.find(o=>o.channel==='小米'&&o.width===2048&&o.page===3).layerAdjustment.character.scale,100);
  assert.deepEqual(await fs.readFile(path.join(storage,`store-preorder-${id}`,'layers','landscape-2','background.png')),before);
});
