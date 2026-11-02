import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import {prepareSourceReflow,validateSourceSelections} from '../lib/source-reflow.mjs';
import {sourceRemovalMask,prepareSourceRepairInput,finishSourceRepair,createSourceSceneRepair} from '../lib/source-scene-repair.mjs';
import {createSourceAdaptation} from '../lib/source-adaptation.mjs';
import {planSourceComposition} from '../public/source-adaptation-model.js';
const selections=[{box:[.05,.12,.42,.9],points:[{x:.22,y:.5,label:1}]},{box:[.5,.05,.95,.95],points:[{x:.7,y:.5,label:1}]}];
const png=(width,height,background)=>sharp({create:{width,height,channels:4,background}}).png().toBuffer();
async function fixture(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'source-repair-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));await fs.mkdir(path.join(dir,'task/assets'),{recursive:true});const source=await png(200,120,'#506070');await fs.writeFile(path.join(dir,'task/assets/source.png'),source);const task={id:'task',mode:'adapt',masterTemplateId:'source-master-task',targetTemplateIds:['wide'],updatedAt:'before',assets:[{name:'source.png'}],sourceAdaptation:{sourceHash:'hash',width:200,height:120,layers:[{id:'merged',role:'source-group',assetName:'source.png',width:200,height:120,x:0,y:0,visible:true}]},parameters:{sourceCompositionByTemplate:{'source-master-task':{layers:[]}}},history:[]};const masks=await Promise.all(['<rect x="22" y="30" width="45" height="65" fill="white"/>','<ellipse cx="142" cy="60" rx="30" ry="50" fill="white"/>'].map(shape=>sharp(Buffer.from(`<svg width="200" height="120">${shape}</svg>`)).png().toBuffer()));return {dir,source,task,segment:async({index})=>masks[index]};}
test('two selections produce separate original-pixel layers and one full repaired background',async t=>{
 const {dir,source,task,segment}=await fixture(t);let calls=0;
 const result=await prepareSourceReflow({root:dir,storageDir:dir,task,input:{selections},segment,repairBackground:async({maskBuffer,cutouts})=>{calls++;assert.equal(cutouts.length,2);const data=await sharp(maskBuffer).greyscale().raw().toBuffer();assert.equal(data[60*200+40],255);assert.equal(data[60*200+140],255);assert.equal(data[15*200+35],255,'missed headwear inside the selection is erased even if absent from the character alpha');return png(200,120,'#203040');}});
 assert.equal(calls,1);assert.equal(result.reflow.layers.length,3);assert.equal(result.reflow.backgroundMode,'full-scene');assert.deepEqual(await fs.readFile(path.join(dir,'task/assets/source.png')),source);
 for(const l of result.reflow.layers.filter(l=>l.role==='character')){const pixels=await sharp(path.join(dir,'task/assets',l.assetName)).raw().toBuffer();for(let i=0;i<pixels.length;i+=4)if(pixels[i+3]>32)assert.deepEqual([...pixels.subarray(i,i+3)],[80,96,112]);}
 const composition=planSourceComposition({...task,sourceAdaptation:{...task.sourceAdaptation,reflow:result.reflow},communityMasterApproval:{fingerprint:'test'}},{id:'wide',width:900,height:383});const people=composition.layers.filter(l=>l.role==='character');assert.equal(people.length,2);assert.ok(people[0].x<people[1].x);assert.ok(Math.abs(people[0].width/result.reflow.layers[1].width-people[1].width/result.reflow.layers[2].width)<1e-8,'relative character scale is retained');
 assert.throws(()=>validateSourceSelections({selections:[selections[0],selections[0]]}),/重复/);
});
test('repair retains all unmasked pixels and rejects an unfilled magenta mask',async()=>{
 const source=await png(80,60,'#506070'),cutout={buffer:await png(20,30,'#c08060'),bounds:{left:30,top:15}},mask=await sourceRemovalMask(source,[cutout]),masked=await prepareSourceRepairInput(source,mask);
 await assert.rejects(()=>finishSourceRepair(source,masked,mask),/未通过/);
 const result=await finishSourceRepair(source,await png(80,60,'#809030'),mask),pixels=await sharp(result).raw().toBuffer();assert.deepEqual([...pixels.subarray(0,3)],[80,96,112]);assert.deepEqual([...pixels.subarray((30*80+40)*3,(30*80+40)*3+3)],[128,144,48]);
});
test('failed repair does not publish incomplete layers or modify tasks; existing backgrounds bypass generation',async t=>{
 const {dir,task,segment}=await fixture(t),tasksFile=path.join(dir,'tasks.json');await fs.writeFile(tasksFile,JSON.stringify([task,{id:'other'}]));const before=await fs.readFile(tasksFile),jobs=new Map();
 const api=createSourceAdaptation({root:dir,storageDir:dir,tasksFile,jobs,templateMap:new Map(),segment,repairBackground:async()=>{throw Error('temporary provider failure');}});
 await assert.rejects(()=>api('task',{action:'separate',selections,expectedUpdatedAt:'before'}),/temporary/);assert.deepEqual(await fs.readFile(tasksFile),before);assert.equal(jobs.size,0);assert.deepEqual(await fs.readdir(path.join(dir,'task/assets')),['source.png']);
 task.sourceAdaptation.reflow={sourceHash:'hash',backgroundMode:'full-scene',layers:[{id:'background',role:'background',assetName:'full.png',width:200,height:120}]};
 const result=await prepareSourceReflow({root:dir,storageDir:dir,task,input:{selections},segment,repairBackground:async()=>{throw Error('must not generate');}});assert.equal(result.assets.length,2);assert.equal(result.reflow.layers[0].assetName,'full.png');
});
test('background retries reuse the durable provider job and completed result',async t=>{
 const {dir,source,task}=await fixture(t);await fs.mkdir(path.join(dir,'config'));await fs.writeFile(path.join(dir,'config/ai-huabu.json'),JSON.stringify({token:'test-only',apiRoot:'http://test.invalid'}));const mask=await sourceRemovalMask(source,[{buffer:await png(40,60,'white'),bounds:{left:30,top:25}}]);let submitted=0,created=0,polled=0,submittedImage;
 const repair=createSourceSceneRepair({createCanvas:async()=>{created++;return 'canvas';},submitGeneration:async(_,body)=>{submitted++;submittedImage=await sharp(Buffer.from(body.images[0].data_base64,'base64')).metadata();assert.equal(body.images.length,1);assert.match(body.prompt,/没有任何人物/);return 'job';},pollJob:async()=>{if(++polled===1)throw Error('interrupted');},downloadRaw:async()=>({buffer:await png(submittedImage.width,submittedImage.height,'#203040')})});
 const input={root:dir,storageDir:dir,task,sourceBuffer:source,maskBuffer:mask};await assert.rejects(()=>repair(input),/interrupted/);const a=await repair(input),b=await repair(input);assert.deepEqual(a,b);assert.equal(submitted,1);assert.equal(created,1);assert.equal(polled,2);
});

test('changed character selections repair the background again while identical selections reuse it',async t=>{
 const {dir,task,segment}=await fixture(t);let repairs=0;
 task.sourceAdaptation.reflow={sourceHash:'hash',backgroundMode:'full-scene',backgroundMethod:'masked-scene-repair-v1',selections:[selections[0]],layers:[{id:'background',role:'background',assetName:'previous-full.png',width:200,height:120}]};
 const repairBackground=async()=>{repairs++;return png(200,120,'#203040');};
 const result=await prepareSourceReflow({root:dir,storageDir:dir,task,input:{selections},segment,repairBackground});
 assert.equal(repairs,1);assert.notEqual(result.reflow.layers[0].assetName,'previous-full.png');
 task.sourceAdaptation.reflow=result.reflow;
 const repeated=await prepareSourceReflow({root:dir,storageDir:dir,task,input:{selections},segment,repairBackground});
 assert.equal(repairs,1);assert.equal(repeated.reflow.layers[0].assetName,result.reflow.layers[0].assetName);
});
