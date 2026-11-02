import test from 'node:test';
import assert from 'node:assert/strict';
import {copyrightColorMode,copyrightColorFromPixels,copyrightColorAt,drawCommunityCopyright} from '../public/community-copyright.js';

const pixels=(r,g=r,b=r,a=255)=>new Uint8ClampedArray([r,g,b,a,r,g,b,a]);
test('copyright chooses black on light warm/cool backgrounds and white on dark backgrounds',()=>{
  for(const c of [[255,255,255],[235,203,143],[140,220,240]])assert.equal(copyrightColorFromPixels(pixels(...c)),'#000000');
  for(const c of [[0,0,0],[28,45,65],[50,25,20]])assert.equal(copyrightColorFromPixels(pixels(...c)),'#ffffff');
  assert.equal(copyrightColorFromPixels(pixels(0,0,0,0)),'#000000');
  assert.equal(copyrightColorMode('white'),'white');assert.equal(copyrightColorMode('black'),'black');assert.equal(copyrightColorMode('#ffffff'),'auto');
});
test('color samples only the visible copyright location and clips sampling to canvas bounds',()=>{
  const calls=[],ctx={canvas:{width:100,height:60},getImageData:(...rect)=>{calls.push(rect);return {data:pixels(20)};}};
  assert.equal(copyrightColorAt(ctx,{x:80,y:35,width:40,height:40}),'#ffffff');assert.deepEqual(calls,[[80,35,20,25]]);
  copyrightColorAt(ctx,{x:-5,y:-4,width:10,height:12});assert.deepEqual(calls[1],[0,0,5,8]);
  assert.equal(copyrightColorAt(ctx,{x:200,y:200,width:20,height:20}),'#000000');assert.equal(calls.length,2);
});
test('copyright ignores old outline/shadow effects and respects explicit black or white overrides',()=>{
  const draws=[],masks=[],stack=[];
  const document={createElement:()=>{const canvas={width:0,height:0,ownerDocument:document},mask={fillStyle:'',font:'',fillText:()=>{},};canvas.getContext=()=>mask;masks.push(mask);return canvas;}};
  const ctx={canvas:{width:400,height:200,ownerDocument:document},save(){stack.push({shadowColor:this.shadowColor,shadowBlur:this.shadowBlur});},restore(){Object.assign(this,stack.pop());},
    measureText:text=>({width:text.length*12,actualBoundingBoxLeft:0,actualBoundingBoxRight:text.length*12,actualBoundingBoxAscent:10,actualBoundingBoxDescent:4}),
    getImageData:()=>({data:pixels(240)}),drawImage(){draws.push({shadow:this.shadowColor,blur:this.shadowBlur});},strokeText(){assert.fail('copyright must not stroke');}};
  const options={text:'copyright-test',rect:{x:10,y:20,width:300,height:40},preferred:20,effects:{stroke:{enabled:true,width:10,color:'#123456'},shadow:{enabled:true,blur:20,color:'#333333'}}};
  assert.equal(drawCommunityCopyright(ctx,options).fill,'#000000');assert.equal(draws.length,1);assert.equal(masks[0].fillStyle,'#000000');assert.equal(draws[0].shadow,'transparent');assert.equal(draws[0].blur,0);
  assert.equal(drawCommunityCopyright(ctx,{...options,rect:{...options.rect,copyrightColorMode:'white'}}).fill,'#ffffff');
  assert.equal(drawCommunityCopyright(ctx,{...options,rect:{...options.rect,copyrightColorMode:'black'}}).fill,'#000000');
});
