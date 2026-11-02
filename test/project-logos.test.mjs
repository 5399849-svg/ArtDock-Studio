import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Readable} from 'node:stream';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import {createProjectLogoLibrary} from '../lib/project-logos.mjs';
import {createAdResourcesHandler} from '../lib/ad-resources-server.mjs';
import {createStorePreorderHandler} from '../lib/store-preorder-server.mjs';
import {createIconPreorderHandler} from '../lib/icon-preorder-server.mjs';
import {createChannelResourcesHandler} from '../lib/channel-resources-server.mjs';
import {createWorkbenchTaskNames} from '../lib/workbench-task-names.mjs';

const root=fileURLToPath(new URL('..',import.meta.url));
const request=async(handler,method,url,body)=>{
  const req=Readable.from(body?[Buffer.from(JSON.stringify(body))]:[]);req.method=method;let status,headers,buffer;
  await handler(req,{writeHead(code,h){status=code;headers=h},end(chunk){buffer=Buffer.from(chunk||'')}},new URL(url,'http://localhost'));
  return {status,headers,buffer,body:headers?.['Content-Type']?.includes('json')?JSON.parse(buffer):null};
};
const zipEntries=buffer=>{const entries=[];let offset=0;while(offset+30<=buffer.length&&buffer.readUInt32LE(offset)===0x04034b50){const length=buffer.readUInt16LE(offset+26),extra=buffer.readUInt16LE(offset+28),bytes=buffer.readUInt32LE(offset+18),start=offset+30+length+extra;entries.push({name:buffer.subarray(offset+30,offset+30+length).toString('utf8'),data:buffer.subarray(start,start+bytes)});offset=start+bytes;}return entries;};
async function fixture(t){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'project-logos-')),storageDir=path.join(dir,'storage');await fs.mkdir(storageDir);
  t.after(()=>fs.rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:30}));
  await fs.writeFile(path.join(dir,'projects.json'),JSON.stringify([{id:'p',name:'测试项目',status:'active',assets:[]},{id:'other',name:'另一项目',status:'active',assets:[]},{id:'archived',status:'archived',assets:[]}]));
  const green=await sharp({create:{width:100,height:40,channels:4,background:'#18b438'}}).png().toBuffer(),blue=await sharp({create:{width:100,height:40,channels:4,background:'#2535d4'}}).png().toBuffer();
  const library=createProjectLogoLibrary({runtimeDir:dir,storageDir});
  const add=async(buffer,name)=>library.add('p',{name,dataUrl:'data:image/png;base64,'+buffer.toString('base64')});
  const first=(await add(green,'带标语.png')).asset;
  return {dir,storageDir,green,blue,library,add,first};
}

test('project default, variants and existing task imports preserve old task pixels and survive reload',async t=>{
  const f=await fixture(t),old={id:'old',project:'原任务',projectId:'p',assets:[],items:{one:{draft:{logoX:.2},versions:[{number:3}]}}},jobs=JSON.stringify([old]);
  await fs.writeFile(path.join(f.dir,'ad-resources-jobs.json'),jobs);
  const snapshot=await f.library.copyToTask({projectId:'p',folder:'ad-resources-new',bucket:'asset'});
  assert.equal(snapshot.projectLogoId,f.first.id);assert.deepEqual(await fs.readFile(path.join(f.storageDir,'ad-resources-new','asset',snapshot.file)),f.green);
  const second=(await f.add(f.blue,'无标语.png')).asset;await f.library.setDefault('p',second.id);
  assert.equal((await f.library.list('p')).defaultLogoId,second.id);
  assert.deepEqual(await fs.readFile(path.join(f.storageDir,'ad-resources-new','asset',snapshot.file)),f.green,'switching the project default cannot recolor an earlier task');
  assert.equal(await fs.readFile(path.join(f.dir,'ad-resources-jobs.json'),'utf8'),jobs);
  const library=createProjectLogoLibrary({runtimeDir:f.dir,storageDir:f.storageDir});assert.equal((await library.list('p')).defaultLogoId,second.id);
  const variant=await library.copyToTask({projectId:'p',logoId:f.first.id,folder:'variant'});assert.equal(variant.projectLogoId,f.first.id);
  assert.equal(await library.copyToTask({projectId:'p',logoId:'',folder:'no-logo'}),null);
  assert.equal(await library.copyToTask({folder:'unfiled'}),null);
  const uploadedDir=path.join(f.storageDir,'ad-resources-old','asset');await fs.mkdir(uploadedDir,{recursive:true});await fs.writeFile(path.join(uploadedDir,'uploaded.png'),f.blue);
  old.assets.push({role:'logo',name:'已有Logo.png',url:'/storage/ad-resources-old/asset/uploaded.png'});await fs.writeFile(path.join(f.dir,'ad-resources-jobs.json'),JSON.stringify([old]));
  const before=await fs.readFile(path.join(f.dir,'ad-resources-jobs.json'),'utf8');
  assert.ok((await library.list('p')).candidates.some(candidate=>candidate.url===old.assets[0].url));
  assert.equal((await library.add('p',{sourceUrl:old.assets[0].url})).asset.id,second.id,'identical existing Logo is reused without duplicating the library');
  assert.equal(await fs.readFile(path.join(f.dir,'ad-resources-jobs.json'),'utf8'),before);
});

test('Logo selection enforces project ownership, archived status, supported images and local storage',async t=>{
  const f=await fixture(t),before=await fs.readFile(path.join(f.dir,'projects.json'),'utf8');
  for(const work of [()=>f.library.copyToTask({projectId:'other',logoId:f.first.id,folder:'bad'}),()=>f.library.copyToTask({projectId:'archived',folder:'bad'}),()=>f.library.add('other',{sourceUrl:f.first.url}),()=>f.library.add('p',{sourceUrl:'/storage/../secret'}),()=>f.library.add('p',{dataUrl:'data:image/png;base64,aGVsbG8='}),()=>f.library.setDefault('p','missing')])await assert.rejects(work);
  assert.equal(await fs.readFile(path.join(f.dir,'projects.json'),'utf8'),before);
});

test('ad task rename reaches the module, JPEG names, ZIP content and manifest while existing file identities remain immutable',async t=>{
  const f=await fixture(t),specs=[{id:'yes',number:1,width:400,height:400,format:'JPG',logo:'required',name:'带标'},{id:'no',number:2,width:400,height:400,format:'JPG',logo:'forbidden',name:'无标'}],catalog={sourceSha256:'test',specs};
  let names={};const nameStore=createWorkbenchTaskNames({runtimeDir:f.dir,onChange:value=>names=value});
  const make=()=>createAdResourcesHandler({root:f.dir,runtimeDir:f.dir,storageDir:f.storageDir,catalogProvider:async()=>catalog,projectLogos:f.library,taskName:(key,fallback)=>names[key]||fallback,nanoGenerate:()=>assert.fail('No external image generation is needed')});
  const handler=await make(),batch=(await request(handler,'POST','/api/ad-resources/batches',{project:'02_旧名字_无LOGO',projectId:'p'})).body.batch;
  assert.equal(batch.projectLogo.projectLogoId,f.first.id);
  const source=await sharp({create:{width:400,height:400,channels:3,background:'#ededed'}}).png().toBuffer();
  await request(handler,'POST',`/api/ad-resources/batches/${batch.id}/assets`,{role:'visual',name:'纯图.png',dataUrl:'data:image/png;base64,'+source.toString('base64')});
  assert.equal((await request(handler,'POST',`/api/ad-resources/batches/${batch.id}/auto-generate`,{})).body.generated,2);
  const file=path.join(f.dir,'ad-resources-jobs.json'),before=await fs.readFile(file,'utf8');
  await nameStore.rename({key:`ad-resources:${batch.id}`,name:'沈眉庄展示'});
  const shown=(await request(handler,'GET','/api/ad-resources')).body.batches[0];assert.equal(shown.project,'沈眉庄展示');assert.equal(shown.items.yes.versions[0].name,'沈眉庄展示_lg_400x400.jpg');assert.equal(shown.items.no.draft.logoAssetId,'');
  const zip=await request(handler,'GET',`/api/ad-resources/batches/${batch.id}/download`),entries=zipEntries(zip.buffer);
  assert.equal(zip.status,200);assert.match(decodeURIComponent(zip.headers['Content-Disposition']),/沈眉庄展示_投放资源位\.zip/);
  assert.deepEqual(entries.map(entry=>entry.name),['沈眉庄展示_lg_400x400.jpg','沈眉庄展示_400x400.jpg','交付清单.json']);
  assert.equal(JSON.parse(entries[2].data).project,'沈眉庄展示');
  const pix=async buffer=>[...await sharp(buffer).extract({left:330,top:35,width:1,height:1}).raw().toBuffer()];
  const yes=await pix(entries[0].data),no=await pix(entries[1].data);assert.ok(yes[1]>yes[0]*2,'required Logo is locally composed');assert.ok(no[0]>200&&no[2]>200,'forbidden Logo variant stays clean');
  assert.equal(await fs.readFile(file,'utf8'),before,'renaming and exporting do not rewrite stored files or history');
  await make();assert.equal(await fs.readFile(file,'utf8'),before,'restart must not rewrite historical version names for a display rename');
});

for(const namespace of ['store-preorder','store-launch','icon-preorder','icon-launch'])test(`${namespace} creates with selected project Logo and exports under the renamed task folder`,async t=>{
  const f=await fixture(t),icon=namespace.startsWith('icon'),configUrl=namespace.endsWith('launch')?new URL(`../config/${icon?'icon':'store'}-launch-v1.json`,import.meta.url):undefined;
  const factory=icon?createIconPreorderHandler:createStorePreorderHandler;
  const options={root,runtimeDir:f.dir,storageDir:f.storageDir,namespace,configUrl,projectLogos:f.library,taskName:(key,fallback)=>key.endsWith(currentId)?'新任务名称':fallback};
  let currentId='none';let handler=await factory(options);
  const made=(await request(handler,'POST',`/api/${namespace}/jobs`,{project:'旧任务名称',projectId:'p'})).body;currentId=made.id;
  assert.equal(made.projectId,'p');assert.equal(made.projectLogo.projectLogoId,f.first.id);
  const config=(await request(handler,'GET',`/api/${namespace}/specs`)).body;
  const file=path.join(f.dir,`${namespace}-jobs.json`),rows=JSON.parse(await fs.readFile(file,'utf8')),job=rows[0];
  const outputDir=path.join(f.storageDir,`${namespace}-${currentId}`,'output');await fs.mkdir(outputDir,{recursive:true});
  job.outputs=[];for(const spec of config.specs)for(let page=1;page<=(icon?1:6);page++){const name=`${spec.id||spec.channel}-${spec.width}-${spec.height}-${page}.png`;await fs.writeFile(path.join(outputDir,name),f.green);job.outputs.push({specId:spec.id,channel:spec.channel,width:spec.width,height:spec.height,page,file:name});}
  job.status='complete';job.reviewed=true;job.total=job.outputs.length;await fs.writeFile(file,JSON.stringify(rows));handler=await factory(options);
  assert.equal((await request(handler,'GET',`/api/${namespace}/jobs/${currentId}`)).body.project,'新任务名称');
  const result=await request(handler,'GET',`/api/${namespace}/jobs/${currentId}/package`);assert.equal(result.status,200);assert.match(decodeURIComponent(result.headers['Content-Disposition']),/新任务名称/);
  assert.ok(zipEntries(result.buffer).every(entry=>entry.name.startsWith('新任务名称/')));
});

test('new channel tasks use the project Logo as a layer, honor no-Logo requirements and keep stable group identities on rename',async t=>{
  const f=await fixture(t),rules=path.join(f.dir,'channel-analysis','huawei-current');await fs.mkdir(rules,{recursive:true});await fs.writeFile(path.join(rules,'华为资源位规则清单.csv'),'编号,资源位,尺寸\n');
  let alias='';const handler=await createChannelResourcesHandler({root,runtimeDir:f.dir,storageDir:f.storageDir,projectLogos:f.library,taskName:(key,fallback)=>alias||fallback,generateImage:()=>assert.fail('No AI call')});
  const made=(await request(handler,'POST','/api/channel-resources/manual',{channel:'oppo',project:'原素材名',projectId:'p',resource:'Banner',size:'400x400'})).body;
  let data=(await request(handler,'GET','/api/channel-resources')).body,batch=data.batches.find(batch=>batch.id===made.id);assert.equal(batch.projectLogo.projectLogoId,f.first.id);assert.equal(batch.items[0].editor.layers[0].name,'项目 Logo');
  const item=batch.items[0],draft={...item.editor,backgroundUrl:'',layers:item.editor.layers};assert.equal((await request(handler,'PUT',`/api/channel-resources/items/${item.id}/editor-draft`,draft)).status,200,'the copied Logo is authorized in the editor');
  alias='新渠道任务';data=(await request(handler,'GET','/api/channel-resources')).body;batch=data.batches.find(batch=>batch.id===made.id);assert.equal(batch.items[0].taskName,alias);assert.equal(batch.items[0].project,'原素材名');
  const clean=(await request(handler,'POST','/api/channel-resources/manual',{channel:'oppo',project:'纯图',projectId:'p',resource:'Banner',size:'400x400',requirements:'不得含 Logo，纯图'})).body;
  const noLogo=(await request(handler,'GET','/api/channel-resources')).body.batches.find(batch=>batch.id===clean.id);assert.deepEqual(noLogo.items[0].editor.layers,[]);
});
