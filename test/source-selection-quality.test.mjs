import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {normalizeSourceSelection,sourceSelectionContext} from '../public/source-selection-model.js';
import {sourceRemovalMask,finishSourceRepair} from '../lib/source-scene-repair.mjs';
test('box selection does not become a body-only center point; explicit clicks retain their meaning',()=>{
 const box=[.2,.1,.8,.9],center={x:.5,y:.5,label:1};
 assert.deepEqual(normalizeSourceSelection({box,points:[center]}).points,[]);
 assert.deepEqual(normalizeSourceSelection({box,points:[]}).points,[]);
 assert.deepEqual(normalizeSourceSelection({box,points:[center],pointMode:'manual'}).points,[center]);
 const negative={x:.3,y:.2,label:0};assert.deepEqual(normalizeSourceSelection({box,points:[center,negative]}).points,[negative]);
 assert.throws(()=>normalizeSourceSelection({box,points:[{x:.99,y:.5,label:1}]}),/选框/);
});
test('selection context includes nearby sleeve and costume edges without leaving the source canvas',()=>{
 const selection=normalizeSourceSelection({box:[.383,.009,.922,.908],points:[]}),expanded=sourceSelectionContext(selection);
 assert.ok(expanded.box[0]<selection.box[0]);assert.equal(expanded.box[1],0);assert.ok(expanded.box[2]>.98);assert.equal(expanded.box[3],1);assert.equal(selection.box[1],.009);
});
test('clean background removes omitted headwear inside the box while far scenery remains original',async()=>{
 const source=await sharp({create:{width:200,height:150,channels:4,background:'#506070'}}).png().toBuffer();
 const body=await sharp({create:{width:40,height:60,channels:4,background:'white'}}).png().toBuffer();
 const mask=await sourceRemovalMask(source,[{buffer:body,bounds:{left:70,top:55}}],[{box:[.3,.1,.7,.85]}]);
 const alpha=await sharp(mask).greyscale().raw().toBuffer();assert.equal(alpha[25*200+90],255);assert.equal(alpha[0],0);
 const generated=await sharp({create:{width:200,height:150,channels:3,background:'#809030'}}).png().toBuffer();
 const clean=await sharp(await finishSourceRepair(source,generated,mask)).raw().toBuffer();
 assert.deepEqual([...clean.subarray(0,3)],[80,96,112]);assert.deepEqual([...clean.subarray((25*200+90)*3,(25*200+90)*3+3)],[128,144,48]);
});
