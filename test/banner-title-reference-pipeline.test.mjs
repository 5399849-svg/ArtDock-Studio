import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {runBannerDesign} from '../lib/community-banner-design.mjs';

test('an explicit numbered title palette overrides contrary model colours through the real design pipeline',async()=>{
  const template={width:900,height:383};
  const current=await sharp({create:{width:900,height:383,channels:4,background:'#eacfa1'}}).png().toBuffer();
  const reference=await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="90"><rect width="200" height="90" fill="#fff8e5"/><rect x="10" y="15" width="80" height="60" fill="#674c32"/><rect x="110" y="15" width="80" height="60" fill="#e88f18"/></svg>')).png().toBuffer();
  const mask=await sharp(Buffer.from('<svg width="280" height="200" xmlns="http://www.w3.org/2000/svg"><path fill="white" d="M35 25h200v55H35z M35 118h200v55H35z"/></svg>')).png().toBuffer();
  const contrary=await sharp(Buffer.from('<svg width="280" height="200" xmlns="http://www.w3.org/2000/svg"><rect width="280" height="100" fill="#ffb020"/><rect y="100" width="280" height="100" fill="#82c132"/></svg>')).png().toBuffer();
  let calls=0;
  const result=await runBannerDesign({mode:'edit',prompt:'主标参考图2的颜色和字效做修改，其它保留不变。副标文字要跟着底板的倾斜做调整。',template,model:'banana_pro',affectedKinds:['title'],
    inputs:{current,titleMask:mask,titleFont:{id:'licensed',name:'字魂甜豆体',sha256:'a'.repeat(64)},copy:'天工谜影\n谁是百晓生？',titleDesignTheme:'playful',references:[current,reference],referenceRoles:['reference-image','reference-image']},
    generate:async(body,{stage})=>{calls++;assert.equal(stage,'title-material');assert.ok(body.prompt.includes('参考图2'));assert.ok(body.prompt.includes('#674c32'));return contrary;}});
  assert.equal(calls,1);assert.equal(result.layers.length,1);
  const title=result.layers[0],{data}=await sharp(title.buffer).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const pixel=(x,y)=>[...data.subarray((y*280+x)*4,(y*280+x)*4+3)];
  const cocoa=pixel(155,49),orange=pixel(155,142);
  assert.ok(cocoa[0]<140 && cocoa[1]<110,'The explicit reference brown must win over the model orange');
  assert.ok(orange[0]>orange[1]+60 && orange[1]>orange[2]+60,'The explicit reference orange must win over the model green');
  assert.equal(title.fontProvenance.colourReference.index,2);
  assert.equal(title.fontProvenance.effectStyle,'licensed-glyph-sticker');
  assert.deepEqual(title.fontProvenance.quality.materialPaletteLines,[]);
});
