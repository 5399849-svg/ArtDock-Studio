import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import {Readable} from 'node:stream';
import {createSourceAdaptation,sourceFingerprint,assertSourceParameterSave} from '../lib/source-adaptation.mjs';
import {isSourceAdaptation,planSourceComposition,sourceMasterTemplate} from '../public/source-adaptation-model.js';
import {communityRewardGroups} from '../public/community-object-state.js';
import {communityArtworkTargetPending,communityTargetHasComposition} from '../public/community-artwork-state.js';
import {ensureCommunityMasterWorkspace} from '../lib/community-master-workspace.mjs';
import {loadEditorImages} from '../public/editor-image-source.js';
import {createProjectDesignLibrary} from '../lib/project-design-library.mjs';
async function fixture(t){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'source-adapt-test-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const assets=path.join(dir,'task','assets');await fs.mkdir(assets,{recursive:true});const buffer=await sharp({create:{width:300,height:450,channels:4,background:'#7359ef'}}).png().toBuffer();await fs.writeFile(path.join(assets,'source.png'),buffer);
 const original={id:'task',mode:'adapt',project:'original',masterTemplateId:'community-banner-master',targetTemplateIds:['community-target'],status:'批量生成',updatedAt:'first',version:4,assets:[{name:'source.png',mime:'image/png',role:'master',bytes:buffer.length},{name:'old-trial.png',role:'mother-candidate',mime:'image/png'}],parameters:{assetByTemplate:{'community-banner-master':{background:'old-trial.png'}},layoutByTemplate:{other:{title:{x:7}}}},communityDesign:{versions:[{id:'old'}]},artifacts:[{name:'old.png',url:'/old.png'}],communityObjects:{rewards:[{id:'bad',sourceName:'psd-unclassified.png'}]},history:[]};
 original.assets.push({name:'psd-unclassified.png',mime:'image/png',role:'supplement',psdSourceHash:'hash'});
 original.projectId='p';
 const tasksFile=path.join(dir,'tasks.json');await fs.writeFile(tasksFile,JSON.stringify([original,{id:'unrelated'}]));
 await fs.writeFile(path.join(dir,'projects.json'),JSON.stringify([{id:'p',name:'当前项目',assets:[]},{id:'other',name:'其他项目',assets:[]}]));
 const library=createProjectDesignLibrary({runtimeDir:dir,storageDir:dir});
 const target={id:'community-target',width:900,height:383,format:'PNG',communityPlacement:true},templateMap=new Map([[target.id,target]]),jobs=new Map();
 const api=createSourceAdaptation({root:process.cwd(),storageDir:dir,tasksFile,templateMap,jobs,invalidate:t=>{t.artifacts=[];t.version++;},readProjectMaterial:(task,id)=>library.readImageForTask(task,id)});return {dir,tasksFile,api,target,original,jobs,library,read:async()=>JSON.parse(await fs.readFile(tasksFile,'utf8'))};
}
test('source intent is explicit; new designs and unrelated emulator tasks stay on their own routes',()=>{
 assert.equal(isSourceAdaptation({mode:'adapt',masterTemplateId:'community-banner-master'}),true);
 assert.equal(isSourceAdaptation({mode:'master',masterTemplateId:'community-banner-master'}),false);
 assert.equal(isSourceAdaptation({mode:'adapt',masterTemplateId:'mumu-popup'}),false);
 const task={mode:'adapt',masterTemplateId:'community-small'};assert.equal(ensureCommunityMasterWorkspace(task,{communityPlacement:true,width:750,height:1012}),false);assert.equal(task.masterTemplateId,'community-small');
});
test('unclassified assets do not become rewards; deliberately saved reward selections remain intact',()=>{
 const asset={name:'图.png',role:'supplement',mime:'image/png'};assert.deepEqual(communityRewardGroups({assets:[asset]}),[]);assert.equal(communityRewardGroups({assets:[{...asset,role:'reward'}]}).length,1);
 const rewards=[{sourceName:asset.name,id:'explicit'}];assert.deepEqual(communityRewardGroups({assets:[asset],communityObjects:{rewards}}),rewards);
});
test('source import preserves original canvas, previous trial, shared assets, historical versions and unrelated records',async t=>{
 const f=await fixture(t),saved=await f.api('task',{action:'prepare',sourceName:'source.png',expectedUpdatedAt:'first'});
 assert.deepEqual([sourceMasterTemplate(saved).width,sourceMasterTemplate(saved).height],[300,450]);assert.deepEqual(saved.assets.slice(0,f.original.assets.length),f.original.assets);assert.deepEqual(saved.communityDesign,f.original.communityDesign);assert.deepEqual(saved.parameters.layoutByTemplate.other,f.original.parameters.layoutByTemplate.other);
 assert.deepEqual(saved.communityObjects.rewards,[]);assert.deepEqual(saved.sourceAdaptationVersions[0].snapshot.artifacts,f.original.artifacts);assert.deepEqual((await f.read())[1],{id:'unrelated'});
 const restored=await f.api('task',{action:'restore',versionId:saved.sourceAdaptationVersions[0].id,expectedUpdatedAt:saved.updatedAt});assert.equal(restored.sourceAdaptation,undefined);assert.deepEqual(restored.parameters,f.original.parameters);assert.deepEqual(restored.artifacts,f.original.artifacts);assert.ok(restored.assets.length>f.original.assets.length);
});
test('direct size adaptation needs no confirmation, preserves proportions and isolates each size',async t=>{
 const f=await fixture(t);let s=await f.api('task',{action:'prepare',sourceName:'source.png',expectedUpdatedAt:'first'});
 await assert.rejects(()=>f.api('task',{action:'adapt',templateIds:[f.target.id],expectedUpdatedAt:s.updatedAt}),/分离人物/);
 s.sourceAdaptation.layers[0].role='background';s.parameters.sourceCompositionByTemplate[s.masterTemplateId].layers[0].role='background';await fs.writeFile(f.tasksFile,JSON.stringify([s,{id:'unrelated'}]));
 assert.equal(s.communityMasterApproval,null);
 s=await f.api('task',{action:'adapt',templateIds:[f.target.id],expectedUpdatedAt:s.updatedAt});assert.equal(s.communityMasterApproval.fingerprint,sourceFingerprint(s));const c=s.parameters.sourceCompositionByTemplate[f.target.id],r=c.layers[0];assert.ok(Math.abs(r.width/r.height-2/3)<1e-9);assert.equal(r.x,0);assert.ok(r.y<0);assert.ok(r.width>=f.target.width&&r.height>=f.target.height);const originalX=r.x;assert.equal(communityArtworkTargetPending(s,f.target),false);assert.equal(communityTargetHasComposition(s,f.target),true);
 const masterBefore=structuredClone(s.parameters.sourceCompositionByTemplate[s.masterTemplateId]);c.layers[0].x=25;
 s=await f.api('task',{action:'save',templateId:f.target.id,composition:c,expectedUpdatedAt:s.updatedAt});assert.equal(s.parameters.sourceCompositionByTemplate[f.target.id].layers[0].x,25);assert.deepEqual(s.parameters.sourceCompositionByTemplate[s.masterTemplateId],masterBefore);
 const historical=s.sourceAdaptationVersions.at(-1);s=await f.api('task',{action:'restore',versionId:historical.id,expectedUpdatedAt:s.updatedAt});assert.equal(s.parameters.sourceCompositionByTemplate[f.target.id].layers[0].x,originalX);
});
test('stale requests, stretched layers, foreign assets, running jobs and delivered versions cannot mutate source scenes',async t=>{
 const f=await fixture(t);let s=await f.api('task',{action:'prepare',sourceName:'source.png',expectedUpdatedAt:'first'});const before=await fs.readFile(f.tasksFile,'utf8'),c=structuredClone(s.parameters.sourceCompositionByTemplate[s.masterTemplateId]);
 await assert.rejects(()=>f.api('task',{action:'confirm',expectedUpdatedAt:'stale'}),/刷新/);
 c.layers[0].width*=2;await assert.rejects(()=>f.api('task',{action:'save',templateId:s.masterTemplateId,composition:c,expectedUpdatedAt:s.updatedAt}),/比例/);
 c.layers[0].assetName='foreign.png';await assert.rejects(()=>f.api('task',{action:'save',templateId:s.masterTemplateId,composition:c,expectedUpdatedAt:s.updatedAt}),/源稿引用/);
 assert.equal(await fs.readFile(f.tasksFile,'utf8'),before);f.jobs.set('task',true);await assert.rejects(()=>f.api('task',{action:'confirm',expectedUpdatedAt:s.updatedAt}),/等待/);f.jobs.clear();
 assert.throws(()=>assertSourceParameterSave(s,{parameters:{sourceCompositionByTemplate:{}},expectedUpdatedAt:s.updatedAt}),/源稿适配/);
 s.status='已完成';s.deliveredPackage={name:'old.zip'};await fs.writeFile(f.tasksFile,JSON.stringify([s]));await assert.rejects(()=>f.api('task',{action:'confirm',expectedUpdatedAt:s.updatedAt}),/新版本/);
});
test('copy replacement changes only its text group, keeps originals, and invalidates target approval',async t=>{
 const f=await fixture(t);let s=await f.api('task',{action:'prepare',sourceName:'source.png',expectedUpdatedAt:'first'});
 s.mode='copy-replace';s.sourceAdaptation.layers[0].role='title';s.parameters.sourceCompositionByTemplate[s.masterTemplateId].layers[0].role='title';await fs.writeFile(f.tasksFile,JSON.stringify([s]));
 s=await f.api('task',{action:'confirm',expectedUpdatedAt:s.updatedAt});s=await f.api('task',{action:'adapt',templateIds:[f.target.id],expectedUpdatedAt:s.updatedAt});const before=structuredClone(s),originalBytes=await fs.readFile(path.join(f.dir,'task','assets','source.png'));
 const replacement=await sharp(Buffer.from('<svg width="240" height="80"><rect x="10" y="10" width="220" height="60" fill="#ff9900"/></svg>')).png().toBuffer();
 s=await f.api('task',{action:'replace-text',layerId:s.sourceAdaptation.layers[0].id,dataUrl:'data:image/png;base64,'+replacement.toString('base64'),expectedUpdatedAt:s.updatedAt});
 assert.equal(s.communityMasterApproval,null);assert.equal(communityArtworkTargetPending(s,f.target),true);assert.deepEqual(s.parameters.sourceCompositionByTemplate[f.target.id],before.parameters.sourceCompositionByTemplate[f.target.id]);assert.deepEqual(s.assets.slice(0,before.assets.length),before.assets);assert.deepEqual(await fs.readFile(path.join(f.dir,'task','assets','source.png')),originalBytes);
 const text=s.parameters.sourceCompositionByTemplate[s.masterTemplateId].layers[0];assert.equal(text.width/text.height,3);assert.notEqual(text.assetName,before.sourceAdaptation.layers[0].assetName);
 s=await f.api('task',{action:'restore',versionId:s.sourceAdaptationVersions.at(-1).id,expectedUpdatedAt:s.updatedAt});assert.deepEqual(s.sourceAdaptation,before.sourceAdaptation);assert.ok(s.version>before.version);
});
test('source editor loads only current scene assets, preserves history references and rejects missing images',async()=>{
 const task={masterTemplateId:'source',targetTemplateIds:['target'],sourceAdaptation:{previewName:'preview.png'},parameters:{sourceCompositionByTemplate:{source:{layers:[{assetName:'group.png'}]},target:{layers:[{assetName:'group.png'}]}}},assets:['preview.png','group.png','old-history.png'].map(name=>({name,mime:'image/png',url:'/assets/'+name}))},calls=[];
 const result=await loadEditorImages(task,async url=>{calls.push(url);return {url};});assert.equal(result.sourceAsset.name,'preview.png');assert.equal(result.assetImages.size,2);assert.equal(calls.includes('/assets/old-history.png'),false);assert.equal(task.assets.length,3);
 await assert.rejects(()=>loadEditorImages(task,async()=>{throw Error('missing');}),/源稿素材加载失败/);
});

test('editable copyright persists per target, survives reflow and restores without changing other layers',async t=>{
 const f=await fixture(t);let s=await f.api('task',{action:'prepare',sourceName:'source.png',expectedUpdatedAt:'first'});
 s.sourceAdaptation.layers[0].role='background';s.parameters.sourceCompositionByTemplate[s.masterTemplateId].layers[0].role='background';await fs.writeFile(f.tasksFile,JSON.stringify([s,{id:'unrelated'}]));
 s=await f.api('task',{action:'confirm',expectedUpdatedAt:s.updatedAt});s=await f.api('task',{action:'adapt',templateIds:[f.target.id],expectedUpdatedAt:s.updatedAt});
 const old=structuredClone(s),composition=structuredClone(s.parameters.sourceCompositionByTemplate[f.target.id]);composition.copyright={x:630,y:310,fontSize:28,colorMode:'white'};
 s=await f.api('task',{action:'save',templateId:f.target.id,composition,expectedUpdatedAt:s.updatedAt});assert.deepEqual(s.parameters.sourceCompositionByTemplate[f.target.id].copyright,composition.copyright);assert.deepEqual(s.parameters.sourceCompositionByTemplate[f.target.id].layers,old.parameters.sourceCompositionByTemplate[f.target.id].layers);assert.deepEqual(s.parameters.sourceCompositionByTemplate[s.masterTemplateId],old.parameters.sourceCompositionByTemplate[old.masterTemplateId]);
 const version=s.sourceAdaptationVersions.at(-1).id;s=await f.api('task',{action:'adapt',templateIds:[f.target.id],expectedUpdatedAt:s.updatedAt});assert.deepEqual(s.parameters.sourceCompositionByTemplate[f.target.id].copyright,composition.copyright);
 await assert.rejects(()=>f.api('task',{action:'save',templateId:f.target.id,composition:{...composition,copyright:{...composition.copyright,fontSize:NaN}},expectedUpdatedAt:s.updatedAt}),/版权/);
 s=await f.api('task',{action:'restore',versionId:version,expectedUpdatedAt:s.updatedAt});assert.deepEqual(s.parameters.sourceCompositionByTemplate[f.target.id],old.parameters.sourceCompositionByTemplate[f.target.id]);
});

test('adding uploaded or reused materials preserves existing placement, files, history and unrelated tasks',async t=>{
 const f=await fixture(t);let s=await f.api('task',{action:'prepare',sourceName:'source.png',expectedUpdatedAt:'first'});
 s.sourceAdaptation.layers[0].role='background';s.parameters.sourceCompositionByTemplate[s.masterTemplateId].layers[0].role='background';await fs.writeFile(f.tasksFile,JSON.stringify([s,{id:'unrelated'}]));
 s=await f.api('task',{action:'confirm',expectedUpdatedAt:s.updatedAt});s=await f.api('task',{action:'adapt',templateIds:[f.target.id],expectedUpdatedAt:s.updatedAt});const old=structuredClone(s),oldBytes=await fs.readFile(path.join(f.dir,'task','assets','source.png'));
 const buffer=await sharp({create:{width:160,height:80,channels:4,background:'#ffcc00'}}).png().toBuffer();
 s=await f.api('task',{action:'add-material',role:'foreground',name:'新装饰.png',dataUrl:'data:image/png;base64,'+buffer.toString('base64'),expectedUpdatedAt:s.updatedAt});
 for(const id of [s.masterTemplateId,f.target.id]){const layers=s.parameters.sourceCompositionByTemplate[id].layers;assert.deepEqual(layers.slice(0,-1),old.parameters.sourceCompositionByTemplate[id].layers);assert.equal(layers.at(-1).width/layers.at(-1).height,2);}
 assert.deepEqual(s.assets.slice(0,-1),old.assets);assert.deepEqual(s.sourceAdaptationVersions.slice(0,-1),old.sourceAdaptationVersions);assert.deepEqual(await fs.readFile(path.join(f.dir,'task','assets','source.png')),oldBytes);assert.deepEqual((await f.read())[1],{id:'unrelated'});assert.equal(s.communityMasterApproval.fingerprint,sourceFingerprint(s));
 const version=s.sourceAdaptationVersions.at(-1).id;assert.equal(communityArtworkTargetPending(s,f.target),false);
 const assetCount=s.assets.length;s=await f.api('task',{action:'add-material',role:'logo',assetName:s.assets.at(-1).name,expectedUpdatedAt:s.updatedAt});assert.equal(s.assets.length,assetCount,'reuse must not copy the shared file');
 await assert.rejects(()=>f.api('task',{action:'add-material',role:'foreground',assetName:'foreign.png',expectedUpdatedAt:s.updatedAt}),/不属于/);
 s=await f.api('task',{action:'restore',versionId:version,expectedUpdatedAt:s.updatedAt});assert.deepEqual(s.parameters,old.parameters);assert.deepEqual(s.sourceAdaptation,old.sourceAdaptation);assert.equal(s.assets.length,assetCount);
});
test('streamed same-name uploads retain earlier source bytes and restore failures do not replace a working scene',async t=>{
 const f=await fixture(t),original=await fs.readFile(path.join(f.dir,'task','assets','source.png'));
 const buffer=await sharp({create:{width:400,height:220,channels:4,background:'#ff00aa'}}).png().toBuffer();
 const request=bytes=>{const req=Readable.from([bytes.subarray(0,30),bytes.subarray(30)]);req.headers={'content-length':String(bytes.length)};return req;};
 let s=await f.api.upload('task',request(buffer),{name:'source.png',expectedUpdatedAt:'first'});assert.deepEqual([s.sourceAdaptation.width,s.sourceAdaptation.height],[400,220]);assert.notEqual(s.sourceAdaptation.sourceName,'source.png');assert.deepEqual(await fs.readFile(path.join(f.dir,'task','assets','source.png')),original);
 const oldName=s.sourceAdaptation.sourceName,oldScene=structuredClone(s.sourceAdaptation);s=await f.api.upload('task',request(buffer),{name:'source.png',expectedUpdatedAt:s.updatedAt});assert.notEqual(s.assets.at(-1).name,oldName);assert.equal(s.sourceAdaptation.sourceName,oldName,'identical source pixels need no duplicate extraction');assert.deepEqual(await fs.readFile(path.join(f.dir,'task','assets',oldName)),buffer);
 s=await f.api.upload('task',request(Buffer.from('not an image')),{name:'source.png',expectedUpdatedAt:s.updatedAt});assert.deepEqual(s.sourceAdaptation,oldScene);assert.match(s.sourceImportError,/原有画面保留/);
 await assert.rejects(()=>f.api.upload('task',request(buffer),{name:'source.png',expectedUpdatedAt:'first'}),/刷新/);assert.deepEqual(await fs.readFile(path.join(f.dir,'task','assets','source.png')),original);
});
test('project material selection preserves shared originals, records its source and rejects foreign or removed assets',async t=>{
 const f=await fixture(t),buffer=await sharp({create:{width:140,height:60,channels:4,background:'#ff9000'}}).png().toBuffer(),file={name:'项目按钮.png',dataUrl:'data:image/png;base64,'+buffer.toString('base64')};
 const material=(await f.library.add('p',{category:'button',files:[file]})).added[0],foreign=(await f.library.add('other',{files:[file]})).added[0];
 let saved=await f.api('task',{action:'prepare',sourceName:'source.png',expectedUpdatedAt:'first'});saved.sourceAdaptation.layers[0].role='background';saved.parameters.sourceCompositionByTemplate[saved.masterTemplateId].layers[0].role='background';await fs.writeFile(f.tasksFile,JSON.stringify([saved,{id:'unrelated'}]));
 saved=await f.api('task',{action:'adapt',templateIds:[f.target.id],expectedUpdatedAt:saved.updatedAt});const before=structuredClone(saved),projects=await fs.readFile(path.join(f.dir,'projects.json'));
 saved=await f.api('task',{action:'add-material',projectAssetId:material.id,expectedUpdatedAt:saved.updatedAt});const asset=saved.assets.at(-1),definition=saved.sourceAdaptation.layers.at(-1);
 assert.equal(definition.role,'foreground');assert.equal(definition.label,'项目按钮.png');assert.equal(asset.projectLibraryAssetId,material.id);assert.equal(asset.projectLibraryProjectId,'p');assert.equal(asset.projectLibrarySourceUrl,material.url);
 assert.deepEqual(await fs.readFile(path.join(f.dir,'task','assets',asset.name)),buffer);assert.deepEqual(await fs.readFile(path.join(f.dir,'projects','p',material.url.split('/').at(-1))),buffer);assert.deepEqual(await fs.readFile(path.join(f.dir,'projects.json')),projects);
 for(const tid of [saved.masterTemplateId,...saved.targetTemplateIds])assert.deepEqual(saved.parameters.sourceCompositionByTemplate[tid].layers.slice(0,-1),before.parameters.sourceCompositionByTemplate[tid].layers);
 assert.deepEqual(saved.sourceAdaptationVersions.slice(0,-1),before.sourceAdaptationVersions);assert.deepEqual((await f.read())[1],{id:'unrelated'});
 saved=await f.api('task',{action:'add-material',projectAssetId:material.id,expectedUpdatedAt:saved.updatedAt});assert.equal(saved.assets.length,before.assets.length+1,'repeat uses reuse the task copy');
 const raw=await fs.readFile(f.tasksFile);await assert.rejects(()=>f.api('task',{action:'add-material',projectAssetId:foreign.id,expectedUpdatedAt:saved.updatedAt}),/当前项目/);assert.deepEqual(await fs.readFile(f.tasksFile),raw);
 const rows=JSON.parse(projects);rows[0].assets.find(a=>a.id===material.id).projectLibraryRemovedAt='removed';await fs.writeFile(path.join(f.dir,'projects.json'),JSON.stringify(rows));await assert.rejects(()=>f.api('task',{action:'add-material',projectAssetId:material.id,expectedUpdatedAt:saved.updatedAt}),/移除/);assert.deepEqual(await fs.readFile(f.tasksFile),raw);
});
test('uploads and pasted image payloads need no manual material type',async t=>{
 const f=await fixture(t);let saved=await f.api('task',{action:'prepare',sourceName:'source.png',expectedUpdatedAt:'first'});const dataUrl='data:image/png;base64,'+(await fs.readFile(path.join(f.dir,'task','assets','source.png'))).toString('base64');
 saved=await f.api('task',{action:'add-material',name:'粘贴素材.png',dataUrl,expectedUpdatedAt:saved.updatedAt});assert.equal(saved.sourceAdaptation.layers.at(-1).role,'foreground');
 await assert.rejects(()=>f.api('task',{action:'add-material',projectAssetId:'foreign',dataUrl,expectedUpdatedAt:saved.updatedAt}),/一个项目素材/);
});
