import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {loadIconPreorderSpecs,renderIcon,iconOutputName} from '../lib/icon-preorder.mjs';
import {loadStorePreorderSpecs,needsAdvancedComposition,renderStorePage,inspectPageSource} from '../lib/store-preorder.mjs';
import {layerGeometry} from '../public/store-layer-geometry.js';
const assetsDir=new URL('../public/icon-launch-assets/',import.meta.url).pathname.replace(/^\/(\w:)/,'$1');
test('测试首发36个ICON：独立命名、角标、尺寸、上下限及特殊蒙版',async()=>{
 const config=await loadIconPreorderSpecs(new URL('../config/icon-launch-v1.json',import.meta.url));
 assert.equal(config.specs.length,36);assert.equal(new Set(config.specs.map(iconOutputName)).size,36);
 const source=await sharp({create:{width:512,height:512,channels:4,background:'#da3155'}}).png().toBuffer();
 for(const spec of config.specs){
  const result=await renderIcon(source,spec,{assetsDir:decodeURI(assetsDir)});
  const meta=await sharp(result.buffer).metadata();assert.equal(meta.format,spec.outputFormat==='JPG'?'jpeg':'png');assert.ok(iconOutputName(spec).endsWith(spec.outputFormat==='JPG'?'.jpg':'.png')); assert.equal(meta.width,spec.width);assert.equal(meta.height,spec.height);
  if(spec.maxKB)assert.ok(result.bytes<=spec.maxKB*1024,spec.id);
  if(spec.minKB)assert.ok(result.bytes>=spec.minKB*1024,spec.id);
  const {data,info}=await sharp(result.buffer).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const pixel=(x,y)=>Array.from(data.subarray((y*info.width+x)*4,(y*info.width+x)*4+4));
  if(spec.cornerRadiusPx)assert.equal(pixel(0,0)[3],0,spec.id);
  if(spec.contentSize){assert.equal(pixel(0,0)[3],0);assert.deepEqual(pixel(88,88),[218,49,85,255]);assert.equal(pixel(14,14)[3],0);for(let i=0;i<176;i++){assert.equal(pixel(i,0)[3],0);assert.equal(pixel(i,175)[3],0);assert.equal(pixel(0,i)[3],0);assert.equal(pixel(175,i)[3],0);}assert.ok(data.some((v,i)=>i%4===3&&v>0&&v<255));}
  if(spec.minKB)assert.deepEqual(pixel(256,256),[218,49,85,255]);
 }
});
test('测试首发24套商店图使用独立裁切规则且不继承预约安全区',async()=>{
 const c=await loadStorePreorderSpecs(new URL('../config/store-launch-v1.json',import.meta.url));
 assert.equal(c.specs.length*6,144);assert.equal(c.specs.filter(needsAdvancedComposition).length,6);
 const vivo=c.specs.find(s=>s.channel==='vivo'&&s.width===1080&&s.height===720);assert.equal(vivo.safeTopPx,undefined);assert.equal(needsAdvancedComposition(vivo),false);
 const source=await sharp({create:{width:1920,height:1080,channels:3,background:'red'}}).jpeg().toBuffer();
 const out=await renderStorePage(source,await inspectPageSource(source),vivo,{outpaintProvider:()=>{throw Error('不应调用AI');}});
 assert.equal(out.outpaintApplied,false);assert.equal((await sharp(out.buffer).metadata()).height,720);
 const g=layerGeometry({id:'character',rect:{x:0,y:0,width:1920,height:1080}},{width:1920,height:1080},vivo);
 assert.equal(g.height,720);assert.ok(g.left<0);
 assert.equal((await loadStorePreorderSpecs()).specs.length,22);assert.equal((await loadIconPreorderSpecs()).specs.length,16);
});
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {createIconPreorderHandler} from '../lib/icon-preorder-server.mjs';
import {createStorePreorderHandler} from '../lib/store-preorder-server.mjs';
test('新阶段API任务独立持久化，并完成36个ICON生成和ZIP交付',async(t)=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'launch-specs-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const root=fileURLToPath(new URL('../',import.meta.url)),storageDir=path.join(dir,'storage');await fs.mkdir(storageDir);
 const opts={root,runtimeDir:dir,storageDir};
 const handlers={
  'icon-launch':await createIconPreorderHandler({...opts,namespace:'icon-launch',configUrl:new URL('../config/icon-launch-v1.json',import.meta.url)}),
  'icon-preorder':await createIconPreorderHandler(opts),
  'store-launch':await createStorePreorderHandler({...opts,namespace:'store-launch',configUrl:new URL('../config/store-launch-v1.json',import.meta.url)}),
  'store-preorder':await createStorePreorderHandler(opts)
 };
 const server=http.createServer(async(req,res)=>{try{const u=new URL(req.url,'http://localhost');await handlers[u.pathname.split('/')[2]](req,res,u);}catch(e){res.statusCode=500;res.end(JSON.stringify({error:e.message}));}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const base=`http://127.0.0.1:${server.address().port}/api/`;
 const api=async(route,data)=>{const r=await fetch(base+route,data?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}:{});assert.ok(r.ok,await r.clone().text());return r.json();};
 const job=await api('icon-launch/jobs',{project:'测试独立任务'});assert.equal(job.total,36);
 const store=await api('store-launch/jobs',{project:'测试商店图'});assert.equal(store.total,144);
 assert.deepEqual(await api('icon-preorder/jobs'),[]);assert.deepEqual(await api('store-preorder/jobs'),[]);
 const source=await sharp({create:{width:512,height:512,channels:3,background:'#de6880'}}).png().toBuffer();
 await api(`icon-launch/jobs/${job.id}/source`,{name:'test.png',dataUrl:'data:image/png;base64,'+source.toString('base64')});await api(`icon-launch/jobs/${job.id}/generate`,{});
 let result;
 for(let n=0;n<100;n++){result=await api(`icon-launch/jobs/${job.id}`);if(result.status!=='running')break;await new Promise(r=>setTimeout(r,100));}
 assert.equal(result.status,'complete',result.error);assert.equal(result.outputs.length,36);assert.ok(result.outputs.every(o=>o.url.includes('/icon-launch-')));
 const xiaomi=result.outputs.find(o=>o.channel==='小米');assert.equal(xiaomi.minBytes,307200);assert.equal(xiaomi.maxBytes,null);assert.ok(xiaomi.bytes>=xiaomi.minBytes);
 await api(`icon-launch/jobs/${job.id}/review`,{});const zip=await fetch(base+`icon-launch/jobs/${job.id}/package`);assert.equal(zip.status,200);assert.equal(zip.headers.get('content-type'),'application/zip');assert.ok((await zip.arrayBuffer()).byteLength>307200);
 assert.equal(JSON.parse(await fs.readFile(path.join(dir,'icon-launch-jobs.json'),'utf8')).length,1);
});
