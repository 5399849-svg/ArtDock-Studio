import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {applyCutoutStrokes,locateCutout,validateCutoutStrokes} from '../lib/community-cutout-edit.mjs';
const decode=buffer=>sharp(buffer).ensureAlpha().raw().toBuffer({resolveWithObject:true});
test('erase and restore change only transparency and retain exact original colors and stroke order',async()=>{
 const source=await sharp(Buffer.from('<svg width="160" height="100"><defs><linearGradient id="g"><stop stop-color="#f33"/><stop offset="1" stop-color="#16a"/></linearGradient></defs><rect width="160" height="100" fill="url(#g)"/><circle cx="55" cy="48" r="22" fill="#fc7"/></svg>')).png().toBuffer();
 const initial=await sharp(source).composite([{input:Buffer.from('<svg width="160" height="100"><rect x="20" y="10" width="110" height="80" fill="white"/></svg>'),blend:'dest-in'}]).png().toBuffer();
 const strokes=[{tool:'erase',radius:.14,points:[{x:.35,y:.48}]},{tool:'restore',radius:.04,points:[{x:.35,y:.48}]},{tool:'erase',radius:.03,points:[{x:.7,y:.5},{x:.8,y:.5}]}],result=await applyCutoutStrokes(source,initial,strokes);
 const original=await decode(source),aligned=await sharp({create:{width:160,height:100,channels:4,background:'#00000000'}}).composite([{input:result.buffer,left:result.bounds.left,top:result.bounds.top}]).png().toBuffer(),edited=await decode(aligned);
 const alpha=(x,y)=>edited.data[(y*160+x)*4+3];assert.equal(alpha(56,48),255);assert.equal(alpha(64,48),0);assert.equal(alpha(120,50),0);assert.equal(alpha(90,60),255);
 for(let i=0;i<edited.data.length;i+=4)if(edited.data[i+3]===255)assert.deepEqual([...edited.data.subarray(i,i+3)],[...original.data.subarray(i,i+3)]);
 assert.ok(result.bounds.left>0);assert.ok(result.bounds.top>0);
});
test('legacy transparent crops are located from source pixels and never stretched to fit',async()=>{
 const pixels=Buffer.alloc(80*50*4);for(let y=0;y<50;y++)for(let x=0;x<80;x++){const p=(y*80+x)*4;pixels[p]=x*3;pixels[p+1]=y*5;pixels[p+2]=(x+y)%255;pixels[p+3]=255;}
 const source=await sharp(pixels,{raw:{width:80,height:50,channels:4}}).png().toBuffer(),crop=await sharp(source).extract({left:21,top:13,width:35,height:28}).png().toBuffer(),a=await decode(source),b=await decode(crop);
 assert.deepEqual(locateCutout(a.data,a.info,b.data,b.info),{left:21,top:13});b.data[0]^=255;for(let i=0;i<b.data.length;i+=4)b.data[i]=0;assert.throws(()=>locateCutout(a.data,a.info,b.data,b.info),/不匹配/);
});
test('malformed, excessive and foreign coordinates are rejected before processing',()=>{
 for(const strokes of [[],[{tool:'generate',radius:.1,points:[{x:.2,y:.2}]}],[{tool:'erase',radius:.3,points:[{x:.2,y:.2}]}],[{tool:'restore',radius:.02,points:[{x:1.1,y:.2}]}],Array(201).fill({tool:'erase',radius:.1,points:[{x:.2,y:.2}]})])assert.throws(()=>validateCutoutStrokes(strokes));
});
