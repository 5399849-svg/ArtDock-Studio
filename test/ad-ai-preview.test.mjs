import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import sharp from 'sharp';
import {createAdAiPreviewHandler} from '../lib/ad-ai-preview-server.mjs';
import {createAdAiPreview} from '../public/ad-ai-preview.js';

const jobId='a1adb27d-f00b-4207-b3a1-6dfa570cebb8',prefix=`/storage/ad-resources-test/ai-edit/${jobId}`;

test('HTTP exposes single/group candidate and before JPGs, with no cache, but no provider files',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'ad-ai-preview-http-')),folder=path.join(root,'ad-resources-test','ai-edit',jobId);await fs.mkdir(folder,{recursive:true});
 const jpg=await sharp({create:{width:80,height:60,channels:3,background:'#345678'}}).jpeg().toBuffer();
 for(const name of ['before.jpg','before-ad-08.jpg','candidate.jpg','candidate-ad-08.jpg','request.json','raw.png'])await fs.writeFile(path.join(folder,name),jpg);
 const handler=createAdAiPreviewHandler({storageDir:root}),server=http.createServer(async(req,res)=>{if(!await handler(req,res,new URL(req.url,'http://localhost'))){res.writeHead(404);res.end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));await fs.rm(root,{recursive:true,force:true});});
 const base=`http://127.0.0.1:${server.address().port}`;
 for(const name of ['before.jpg','before-ad-08.jpg','candidate.jpg','candidate-ad-08.jpg']){
  const r=await fetch(base+prefix+'/'+name);assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),'image/jpeg');assert.equal(r.headers.get('cache-control'),'no-store');assert.ok(Buffer.from(await r.arrayBuffer()).equals(jpg));
 }
 const head=await fetch(base+prefix+'/candidate.jpg',{method:'HEAD'});assert.equal(head.status,200);assert.equal(Number(head.headers.get('content-length')),jpg.length);assert.equal((await head.arrayBuffer()).byteLength,0);
 for(const suffix of ['request.json','raw.png','candidate-ad-missing.jpg','%2e%2e%2frequest.json','candidate.jpg/more']){const r=await fetch(base+prefix+'/'+suffix);assert.equal(r.status,404,suffix);assert.equal(r.headers.get('cache-control'),'no-store');}
 assert.equal((await fetch(base+prefix+'/candidate.jpg',{method:'POST'})).status,405);
 assert.equal((await fetch(base+prefix.replace(jobId,'wrong-job')+'/candidate.jpg')).status,404);
});

class Node {
 constructor(tag){this.tagName=tag;this.children=[];this.parentElement=null;this.hidden=false;this.complete=false;this.naturalWidth=0;}
 set textContent(value){this.text=value;this.children=[];}get textContent(){return this.text;}
 append(node){this.children.push(node);node.parentElement=this;}
 insertBefore(node){this.append(node);}
 setAttribute(key,value){this[key]=value;}
 querySelector(selector){return this.children.find(node=>'#'+node.id===selector)||null;}
 remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(n=>n!==this);this.parentElement=null;}
}
function fixture(t){
 const previous=globalThis.document;globalThis.document={createElement:tag=>new Node(tag)};t.after(()=>{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;});
 const stage=new Node('div'),image=new Node('img'),caption=new Node('span');image.id='ad-stage-final';image.src='/storage/old.jpg';stage.append(image);
 const root={querySelector:selector=>selector==='#ad-stage'?stage:selector==='.ad-stage-caption>span'?caption:null},events=[],preview=createAdAiPreview({root,onState:s=>events.push(s.status)});
 return {stage,image,caption,preview,events};
}

test('a review image must finish loading; failure displays a retry and cannot masquerade as the old preview',t=>{
 const f=fixture(t),url=prefix+'/candidate.jpg';f.preview.show(url,{caption:'候选预览'});assert.equal(f.image.src,url);assert.equal(f.preview.state.status,'loading');assert.equal(f.image.hidden,true);assert.equal(f.caption.textContent,'候选预览');
 const message=f.stage.children.find(n=>n.className==='ad-preview-status');assert.equal(message.hidden,false);
 f.image.onerror();assert.equal(f.preview.state.status,'failed');assert.equal(f.image.hidden,true);assert.match(message.textContent,/加载失败/);const retry=message.children[0];assert.match(retry.textContent,/重新加载/);
 retry.onclick();assert.equal(f.preview.state.status,'loading');f.image.onload();assert.equal(f.image.hidden,false);assert.equal(message.hidden,true);assert.equal(f.preview.state.status,'ready');
 const count=f.events.length;f.preview.show(url);assert.equal(f.events.length,count,'presenting the same state must not reload the image');f.preview.dispose();assert.equal(f.image.onload,null);assert.equal(f.image.onerror,null);
});

test('comparison loads actual before/after URLs and a late load never resolves a newer request',t=>{
 const f=fixture(t);f.preview.show(prefix+'/candidate.jpg');const oldLoad=f.image.onload;
 f.preview.show(prefix+'/before.jpg',{caption:'正在查看修改前'});oldLoad();assert.equal(f.preview.state.status,'loading');assert.equal(f.image.hidden,true);f.image.onload();assert.equal(f.preview.state.url,prefix+'/before.jpg');assert.equal(f.preview.state.status,'ready');
 f.preview.show('javascript:alert(1)');assert.equal(f.preview.state.status,'failed');assert.notEqual(f.image.src,'javascript:alert(1)');
});
