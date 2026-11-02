import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {adLogoGeometry,updateAdLogoSliders} from '../public/ad-logo-geometry.js';
import {renderAdJpg} from '../lib/ad-resources-server.mjs';

const art={width:585,height:218};
test('square logo can move below the old 80% cap and stops exactly at the image edge',()=>{
  const spec={width:800,height:800},draft={logoScale:.3,logoX:1,logoY:1};
  const g=adLogoGeometry(spec,art,draft);
  assert.ok(g.maxY>.8);assert.equal(g.left+g.width,800);assert.equal(g.top+g.height,800);
  const controls={'#ad-logo-x':{},'#ad-logo-y':{}},root={querySelector:s=>controls[s]};
  updateAdLogoSliders(root,spec,g);
  assert.equal(Number(controls['#ad-logo-y'].max),g.maxY);
  assert.equal(Number(controls['#ad-logo-y'].step),1/800);
  assert.equal(Number(controls['#ad-logo-y'].value)*800,g.top);
  const smaller=adLogoGeometry(spec,art,{...draft,logoScale:.15});updateAdLogoSliders(root,spec,smaller);
  assert.ok(Number(controls['#ad-logo-y'].max)>g.maxY,'smaller logo has more usable travel');
});

test('landscape, portrait, square and tall Logos retain saved canvas coordinates and stay fully inside',()=>{
  for(const spec of [{width:1280,height:720},{width:720,height:1280},{width:800,height:800}])for(const logo of [art,{width:50,height:900}]){
    const draft={logoScale:.25,logoX:.15,logoY:.2};
    const g=adLogoGeometry(spec,logo,draft),edge=adLogoGeometry(spec,logo,{...draft,logoX:1,logoY:1});
    assert.ok(g.left>=0&&g.top>=0);assert.ok(g.left+g.width<=spec.width&&g.top+g.height<=spec.height);
    assert.equal(edge.left+edge.width,spec.width);assert.equal(edge.top+edge.height,spec.height);
    assert.equal(g.left,Math.min(Math.round(.15*spec.width),spec.width-g.width));
    assert.equal(g.top,Math.min(Math.round(.2*spec.height),spec.height-g.height));
  }
});

test('download rendering puts the logo at the same exact lower edge shown by the slider',async()=>{
  const spec={width:800,height:800,format:'JPG'},draft={logoScale:.3,logoX:.1,logoY:1};
  const source=await sharp({create:{width:800,height:800,channels:3,background:'#e8edf3'}}).png().toBuffer();
  const logo=await sharp({create:{...art,channels:4,background:'#15ad38'}}).png().toBuffer();
  const g=adLogoGeometry(spec,art,draft),result=await renderAdJpg(source,spec,draft,logo);
  const at=async(x,y)=>[...await sharp(result).extract({left:x,top:y,width:1,height:1}).raw().toBuffer()];
  const bottom=await at(g.left+20,797);assert.ok(bottom[1]>bottom[0]*2&&bottom[1]>bottom[2]*2,'Logo reaches the bottom in the actual downloaded JPG');
  const above=await at(g.left+20,g.top-5);assert.ok(above[0]>200&&above[2]>200,'the source background immediately above stays intact');
});
