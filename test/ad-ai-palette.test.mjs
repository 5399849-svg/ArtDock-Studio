import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {assessAdAiPalette} from '../lib/ad-ai-palette.mjs';
import {adAiOriginalReference} from '../lib/ad-ai-original-reference.mjs';

const image=colour=>sharp({create:{width:100,height:100,channels:3,background:colour}}).png().toBuffer();
test('original blue-purple palette rejects a red-purple repaint but tolerates minor encoding differences',async()=>{
  const reference=await image('#4030e0');
  assert.equal((await assessAdAiPalette(reference,await image('#b030e0'))).consistent,false);
  const same=await assessAdAiPalette(reference,await image('#4131df'));assert.equal(same.checked,true);assert.equal(same.consistent,true);
});
test('a calibrated artwork keeps its uploaded original as colour reference on subsequent edits',()=>{
  const original={id:'original',role:'visual'},current={id:'calibrated',role:'visual',toneReferenceAssetId:'original'};
  assert.equal(adAiOriginalReference({assets:[original,current]},current,'人物放大一点'),original);
});
