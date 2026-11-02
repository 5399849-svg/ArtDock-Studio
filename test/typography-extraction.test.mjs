import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {extractChromaTypography} from '../lib/channel-editor-ops.mjs';
test('white counters with chroma rims are removed while enclosed letter highlights survive',async()=>{
 const width=160,height=120,data=Buffer.alloc(width*height*4,255);
 function fill(x0,y0,x1,y1,color){for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)color.forEach((v,c)=>data[(y*width+x)*4+c]=v);}
 fill(20,20,140,100,[255,205,80,255]);
 fill(40,40,72,80,[15,160,20,255]);fill(44,44,68,76,[255,255,255,255]);
 fill(90,45,110,65,[255,255,255,255]); // Real highlight enclosed by gold, not green.
 const source=await sharp(data,{raw:{width,height,channels:4}}).png().toBuffer();
 const result=await extractChromaTypography(source);assert.ok(result.buffer);
 const raw=await sharp(result.buffer).raw().toBuffer({resolveWithObject:true});
 const rgba=(x,y)=>[...raw.data.subarray(((y-result.crop.top)*raw.info.width+x-result.crop.left)*4,((y-result.crop.top)*raw.info.width+x-result.crop.left)*4+4)];
 assert.equal(rgba(50,55)[3],0);assert.equal(rgba(41,55)[3],0);assert.deepEqual(rgba(100,55),[255,255,255,255]);assert.deepEqual(rgba(30,30),[255,205,80,255]);
});
test('green-background extraction preserves white foreground and rejects unrelated backgrounds',async()=>{
 const svg='<svg width="160" height="100"><rect width="160" height="100" fill="#00ff00"/><rect x="20" y="20" width="120" height="60" fill="white"/></svg>';
 const result=await extractChromaTypography(await sharp(Buffer.from(svg)).png().toBuffer());assert.ok(result.buffer);const {data,info}=await sharp(result.buffer).raw().toBuffer({resolveWithObject:true});const center=((Math.floor(info.height/2)*info.width)+Math.floor(info.width/2))*4;assert.equal(data[center+3],255);
 const blue=await sharp({create:{width:100,height:100,channels:3,background:'#234567'}}).png().toBuffer();assert.equal((await extractChromaTypography(blue)).buffer,null);
});
