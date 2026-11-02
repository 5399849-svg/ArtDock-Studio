import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {assessAdAiReferenceUse,buildAdAiLayoutReference} from '../lib/ad-ai-reference-guard.mjs';

const artwork=(colour,position)=>sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="500"><rect width="300" height="500" fill="#f6efe4"/><circle cx="${position}" cy="130" r="70" fill="${colour}"/><path d="M${position-50} 200h100l35 260h-170z" fill="${colour}"/><rect x="10" y="320" width="70" height="150" fill="#34586d"/><path d="M30 20h45v100H30z" fill="#222"/></svg>`)).png().toBuffer();

test('a copied or lightly re-encoded reference is rejected while own-source edits and same-content references pass',async()=>{
 const source=await artwork('#ce8c35',210),reference=await artwork('#89192d',140),copied=await sharp(reference).resize(540,960).jpeg({quality:90}).toBuffer();
 assert.equal((await assessAdAiReferenceUse(source,reference,[reference])).consistent,false);
 assert.equal((await assessAdAiReferenceUse(source,copied,[reference])).consistent,false);
 const changed=await sharp(source).composite([{input:Buffer.from('<svg width="10" height="20"><rect width="10" height="20" fill="#f3ecd9"/></svg>'),top:280,left:90}]).png().toBuffer();
 assert.equal((await assessAdAiReferenceUse(source,changed,[reference])).consistent,true);
 assert.equal((await assessAdAiReferenceUse(source,source,[source])).consistent,true);
 assert.equal((await assessAdAiReferenceUse(reference,source,[source],{original:source})).consistent,true,'Its own original remains a valid content source');
});

test('new reference input retains coarse layout only, strips colour and readable detail, and labels its limited role',async()=>{
 const source=await artwork('#d81723',210),guide=await buildAdAiLayoutReference(source,0),meta=await sharp(guide).metadata();assert.ok(meta.width<=392);assert.ok(meta.height<=632);assert.ok(!guide.equals(source));
 const data=await sharp(guide).removeAlpha().raw().toBuffer();for(let i=0;i<data.length;i+=3){assert.equal(data[i],data[i+1]);assert.equal(data[i+1],data[i+2]);}
 assert.equal((await assessAdAiReferenceUse(source,source,[guide])).consistent,true);
});
