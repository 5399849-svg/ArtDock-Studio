import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import {createProjectDesignLibrary} from '../lib/project-design-library.mjs';
import {projectMaterialCategory} from '../public/project-material-model.js';
import {customTargetTemplate} from '../public/custom-target-sizes.js';
const master={id:'community-banner-master',width:1920,height:1080,communityMaster:true},target={id:'target',width:900,height:383};
const json=async(file,value)=>fs.writeFile(file,JSON.stringify(value));
async function fixture(t){
 const runtimeDir=await fs.mkdtemp(path.join(os.tmpdir(),'project-design-')),storageDir=path.join(runtimeDir,'storage');await fs.mkdir(storageDir);t.after(()=>fs.rm(runtimeDir,{recursive:true,force:true,maxRetries:5,retryDelay:60}));
 const projects=[{id:'p',name:'项目',status:'active',assets:[]},{id:'other',name:'另一个项目',status:'active',assets:[]},{id:'archived',name:'归档项目',status:'archived',assets:[]}];await json(path.join(runtimeDir,'projects.json'),projects);
 const png=await sharp({create:{width:80,height:120,channels:4,background:'#00000000'}}).composite([{input:await sharp({create:{width:40,height:70,channels:4,background:'#edb424'}}).png().toBuffer(),left:20,top:20}]).png().toBuffer(),opaque=await sharp({create:{width:80,height:80,channels:4,background:'#125ebd'}}).png().toBuffer();
 await fs.mkdir(path.join(storageDir,'old','assets'),{recursive:true});await fs.writeFile(path.join(storageDir,'old','assets','role.png'),png);await fs.writeFile(path.join(storageDir,'old','assets','opaque.png'),opaque);
 const role={name:'角色.png',role:'community-object-character',mime:'image/png',width:80,height:120,url:'/storage/old/assets/role.png'},old={id:'old',project:'原Banner',projectId:'p',copy:'活动文案',mode:'master',status:'主图制作',masterTemplateId:master.id,targetTemplateIds:['target'],assets:[role],parameters:{assetByTemplate:{[master.id]:{background:role.name}},layoutByTemplate:{[master.id]:{title:{x:30,y:40,width:500,height:200}}},communityMaterialReferences:{illustration:[role.name],text:[]}},updatedAt:'initial',createdAt:'initial',artifacts:[{name:'old-output'}],communityMasterApproval:{fingerprint:'approved'},history:[]};
 await json(path.join(runtimeDir,'tasks.json'),[old]);let index={assets:[{...role,projectId:'p',taskKey:'core:old',taskLabel:'原Banner'},{name:'其他.png',url:'/storage/old/assets/opaque.png',mime:'image/png',projectId:'other',taskKey:'core:other'}],tasks:[{...old,key:'core:old',module:'core'}]};
 const fonts={fonts:[{id:'font-one',name:'公司字体',mime:'font/ttf',url:'/api/company-fonts/font-one/file',sha256:'1'.repeat(64)}]};
 const options={runtimeDir,storageDir,sourceIndex:async()=>index,readFonts:async()=>fonts,templateMap:new Map([[master.id,master],['target',target]]),invalidate:task=>{task.artifacts=[];task.communityMasterApproval=null;}};
 const library=createProjectDesignLibrary(options),upload=async(kind='character',buffer=png,name='角色.png')=>(await library.add('p',{category:kind,files:[{name,dataUrl:'data:image/png;base64,'+buffer.toString('base64')}]})).added[0];
 return {runtimeDir,storageDir,library,options,png,opaque,old,role,upload,setIndex:value=>index=value};
}
test('project library reads legacy assets without writes, classifies correctly and only promotes same-project sources',async t=>{
 const f=await fixture(t),before=await fs.readFile(path.join(f.runtimeDir,'tasks.json'),'utf8');
 assert.equal(projectMaterialCategory({name:'logo.png'}),'logo');assert.equal(projectMaterialCategory({role:'community-object-character'}),'character');
 const created=(await f.library.add('p',{sourceUrl:f.role.url,sourceTaskKey:'core:old'})).added[0];assert.equal(created.category,'character');assert.equal(created.sourceTaskKey,'core:old');assert.deepEqual(await fs.readFile(path.join(f.storageDir,'projects','p',created.url.split('/').at(-1))),f.png);
 await assert.rejects(()=>f.library.add('p',{sourceUrl:'/storage/old/assets/opaque.png'}),/当前项目/);
 const duplicate=(await f.library.add('p',{sourceUrl:f.role.url})).added[0];assert.equal(duplicate.id,created.id);
 assert.equal(await fs.readFile(path.join(f.runtimeDir,'tasks.json'),'utf8'),before);
 f.setIndex({missingLinks:true});await assert.rejects(()=>f.library.sources('p'),/归属/);
});
test('favorites, labels, default Logo, colors and company font references persist without changing old work',async t=>{
 const f=await fixture(t),before=await fs.readFile(path.join(f.runtimeDir,'tasks.json'),'utf8'),a=await f.upload('logo');
 await f.library.updateAsset('p',a.id,{favorite:true,displayName:'常用Logo'});await f.library.setDefault('p',a.id);await f.library.colors('p',['#C23F32','#CEA05D']);await f.library.addFont('p',{fontId:'font-one',usage:'subtitle'});
 const state=await createProjectDesignLibrary(f.options).list('p');assert.equal(state.assets.find(a=>a.isDefault).displayName,'常用Logo');assert.equal(state.assets[0].favorite,true);assert.deepEqual(state.colors,['#C23F32','#CEA05D']);assert.equal(state.assets.find(a=>a.fontId).fontUsage,'subtitle');assert.deepEqual(state.project.recommendedFontIds,['font-one']);
 await assert.rejects(()=>f.library.setDefault('other',a.id),/当前项目/);await assert.rejects(()=>f.library.colors('p',['url(evil)']),/配色/);await assert.rejects(()=>f.library.addFont('p',{fontId:'missing'}),/字体库/);assert.equal(await fs.readFile(path.join(f.runtimeDir,'tasks.json'),'utf8'),before);
});
test('original characters keep exact pixels as movable independent objects; references preserve existing numbering and do not redraw',async t=>{
 const f=await fixture(t),a=await f.upload();let task=structuredClone(f.old);await f.library.importIntoTask(task,{assetId:a.id,projectId:'p',mode:'original'});
 const c=task.communityObjects.characters.at(-1),layer=task.parameters.communityObjectLayersByTemplate[master.id][0],asset=task.assets.find(a=>a.name===c.assetName);assert.equal(layer.appearance.assetName,c.assetName);assert.deepEqual(await fs.readFile(path.join(f.storageDir,task.id,'assets',asset.name)),f.png);assert.equal(task.parameters.layoutByTemplate[master.id].title.x,30);
 task=structuredClone(f.old);delete task.parameters.communityMaterialReferences;task.assets[0].role='reference-image';await f.library.importIntoTask(task,{assetId:a.id,projectId:'p',mode:'reference',scope:'illustration'});assert.equal(task.parameters.communityMaterialReferences.illustration[0],f.role.name);assert.equal(task.parameters.communityMaterialReferences.illustration.length,2);assert.equal(task.parameters.assetByTemplate[master.id].background,f.role.name);
 const opaque=await f.upload('character',f.opaque,'不透明角色.png');await assert.rejects(()=>f.library.importIntoTask(task,{assetId:opaque.id,projectId:'p',mode:'original'}),/透明背景/);await assert.rejects(()=>f.library.importIntoTask(task,{assetId:a.id,projectId:'other'}),/同一项目/);
});
test('current-task imports respect delivery locks, active jobs and saved revisions',async t=>{
 const f=await fixture(t),a=await f.upload();await assert.rejects(()=>f.library.useAsset('p',a.id,{taskId:'old',expectedUpdatedAt:'stale'}),/已更新/);
 let rows=[{...f.old,status:'已完成',deliveredPackage:{name:'old.zip'}}];await json(path.join(f.runtimeDir,'tasks.json'),rows);await assert.rejects(()=>f.library.useAsset('p',a.id,{taskId:'old',expectedUpdatedAt:'initial'}),/已交付/);
 rows=[{...f.old,communityGeneration:{status:'running'}}];await json(path.join(f.runtimeDir,'tasks.json'),rows);await assert.rejects(()=>f.library.useAsset('p',a.id,{taskId:'old',expectedUpdatedAt:'initial'}),/等待/);
});
test('archived projects allow material management without restoring the project or modifying tasks',async t=>{
 const f=await fixture(t),before=await fs.readFile(path.join(f.runtimeDir,'tasks.json'),'utf8');
 const a=(await f.library.add('archived',{category:'logo',files:[{name:'归档项目Logo.png',dataUrl:'data:image/png;base64,'+f.png.toString('base64')}]})).added[0];
 await f.library.updateAsset('archived',a.id,{favorite:true,displayName:'已整理Logo'});await f.library.setDefault('archived',a.id);await f.library.addFont('archived',{fontId:'font-one'});await f.library.colors('archived',['#7057EF']);
 const state=await f.library.list('archived');assert.equal(state.project.status,'archived');assert.equal(state.assets.find(a=>a.isDefault).displayName,'已整理Logo');assert.equal(state.assets.find(a=>a.isDefault).favorite,true);assert.ok(state.assets.some(a=>a.fontId==='font-one'));assert.deepEqual(state.colors,['#7057EF']);
 assert.deepEqual(await fs.readFile(path.join(f.storageDir,'projects','archived',a.url.split('/').at(-1))),f.png);
 await assert.rejects(()=>f.library.useAsset('archived',a.id,{taskId:'old'}),/归档/);await assert.rejects(()=>f.library.saveTemplate('archived',{taskKey:'core:old'}),/归档/);await assert.rejects(()=>f.library.useTemplate('archived','missing',{}),/归档/);
 assert.equal(await fs.readFile(path.join(f.runtimeDir,'tasks.json'),'utf8'),before);
});
test('choosing a project font replaces the active title bitmap with editable text and retains layout',async t=>{
 const f=await fixture(t);await f.library.addFont('p',{fontId:'font-one'});const a=(await f.library.list('p')).assets.find(a=>a.fontId),task=structuredClone(f.old);task.parameters.assetByTemplate[master.id].title='old-title.png';task.parameters.titleFontAsset='old-font.ttf';task.parameters.layoutByTemplate[master.id].title.visible=false;
 await f.library.importIntoTask(task,{assetId:a.id,projectId:'p',mode:'original',textKind:'title'});assert.equal(task.parameters.titleFontId,'font-one');assert.equal(task.parameters.titleFontAsset,undefined);assert.equal(task.parameters.assetByTemplate[master.id].title,null);assert.equal(task.parameters.layoutByTemplate[master.id].title.x,30);assert.equal(task.parameters.layoutByTemplate[master.id].title.visible,true);
});
test('template snapshots freeze assets and layout, create fresh editable tasks and never copy approvals or deliveries',async t=>{
 const f=await fixture(t),before=await fs.readFile(path.join(f.runtimeDir,'tasks.json'),'utf8'),saved=await f.library.saveTemplate('p',{taskKey:'core:old',name:'福利模板',expectedUpdatedAt:'initial'}),tid=saved.templates[0].id;
 assert.equal(await fs.readFile(path.join(f.runtimeDir,'tasks.json'),'utf8'),before);
 await fs.writeFile(path.join(f.storageDir,'old','assets','role.png'),f.opaque);
 const made=await f.library.useTemplate('p',tid,{requestId:'test-request-one',name:'新任务'}),a=made.assets[0];assert.equal(made.status,'草稿');assert.equal(made.copy,'活动文案');assert.equal(made.parameters.layoutByTemplate[master.id].title.x,30);assert.deepEqual(made.artifacts,[]);assert.equal(made.communityMasterApproval,undefined);assert.equal(made.deliveredPackage,undefined);assert.equal(made.communityGeneration,undefined);assert.notEqual(made.id,'old');assert.equal(made.parameters.assetByTemplate[master.id].background,a.name);assert.deepEqual(await fs.readFile(path.join(f.storageDir,made.id,'assets',a.name)),f.png);
 const again=await f.library.useTemplate('p',tid,{requestId:'test-request-one'});assert.equal(again.id,made.id);assert.equal(JSON.parse(await fs.readFile(path.join(f.runtimeDir,'tasks.json'),'utf8')).length,2);
 await assert.rejects(()=>f.library.useTemplate('other',tid,{requestId:'test-request-two'}),/不存在/);
});
test('library imports reject unsupported files and traversal even when a source record points at them',async t=>{
 const f=await fixture(t);await assert.rejects(()=>f.library.add('p',{files:[{name:'x.png',dataUrl:'data:image/png;base64,aGVsbG8='}]}),/请使用/);
 f.setIndex({assets:[{...f.role,url:'/storage/../projects.json',projectId:'p',taskKey:'core:old'}],tasks:[]});await assert.rejects(()=>f.library.add('p',{sourceUrl:'/storage/../projects.json'}),/地址无效/);
});
test('project templates retain custom target definitions and restore them in a fresh template registry',async t=>{
 const f=await fixture(t),spec={width:1234,height:567,format:'JPG'},template=customTargetTemplate(spec);
 f.old.customTargetSizes=[spec];f.old.targetTemplateIds.push(template.id);f.options.templateMap.set(template.id,template);await json(path.join(f.runtimeDir,'tasks.json'),[f.old]);
 const saved=await f.library.saveTemplate('p',{taskKey:'core:old',name:'临时尺寸模板',expectedUpdatedAt:'initial'});
 f.options.templateMap.delete(template.id);const restarted=createProjectDesignLibrary(f.options),made=await restarted.useTemplate('p',saved.templates[0].id,{requestId:'custom-target-template-test'});
 assert.deepEqual(made.customTargetSizes,[spec]);assert.ok(made.targetTemplateIds.includes(template.id));assert.equal(f.options.templateMap.get(template.id).width,1234);assert.equal(f.options.templateMap.get(template.id).format,'JPG');
});
