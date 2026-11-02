import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createSourceClipboard} from '../lib/source-clipboard.mjs';
import {clipboardSourceFiles,quickSourceFile} from '../public/quick-source-files.js';
const request={socket:{remoteAddress:'127.0.0.1'},headers:{host:'localhost:4173',origin:'http://localhost:4173','x-workbench-clipboard':'1'}};
test('Photoshop clipboard files are accepted even when the browser supplies no MIME type',()=>{
 const psd=new File(['8BPS'],'每日签到.psd',{type:''}),psb=new File(['8BPS'],'大图.psb',{type:'application/octet-stream'});assert.deepEqual(clipboardSourceFiles({files:[psd,psb]}),[psd,psb]);assert.equal(quickSourceFile(psd).file.name,psd.name);assert.equal(quickSourceFile(psb).photoshop,true);assert.throws(()=>quickSourceFile(new File(['x'],'script.exe')),/请选择/);assert.throws(()=>quickSourceFile({name:'big.psd',size:501*1048576}),/500/);
});
test('native clipboard reads require same-origin localhost and grant only temporary file tickets',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'source-clipboard-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const file=path.join(dir,'source.psd');await fs.writeFile(file,'8BPS-data');let now=0,reads=0;const service=createSourceClipboard({now:()=>now,readClipboard:async()=>{reads++;return [file,path.join(dir,'ignored.txt')];}});
 await assert.rejects(()=>service.read({...request,headers:{...request.headers,origin:'http://other.invalid'}}),/本机/);assert.equal(reads,0);await assert.rejects(()=>service.read({...request,headers:{host:'localhost:4173'}}),/本机/);
 const {files}=await service.read(request);assert.equal(files.length,1);assert.equal(files[0].path,undefined);const opened=await service.open(request,files[0].ticket);let data='';for await(const chunk of opened.stream)data+=chunk;assert.equal(data,'8BPS-data');opened.close();
 await fs.writeFile(file,'changed');await assert.rejects(()=>service.open(request,files[0].ticket),/变化/);now=31*60000;await assert.rejects(()=>service.open(request,files[0].ticket),/失效/);await assert.rejects(()=>service.open(request,file),/失效/);
});
