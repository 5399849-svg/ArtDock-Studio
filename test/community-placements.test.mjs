import test from 'node:test';
import assert from 'node:assert/strict';
import { communityPlacements, communityTemplate, communityResourceRule, sampleSevenPlacementIds } from '../lib/community-placements.mjs';

test('platform sheet contains 14 distinct PNG placements with the stated file limits',()=>{
  assert.equal(communityPlacements.length,14);
  assert.equal(new Set(communityPlacements.map(item=>item.id)).size,14);
  assert.ok(communityPlacements.every(item=>item.format==='PNG'));
  assert.equal(communityPlacements.find(item=>item.id==='community-wechat-mini-cover').maxBytes,10*1048576);
  assert.ok(communityPlacements.filter(item=>item.id!=='community-wechat-mini-cover').every(item=>item.maxBytes===1048576));
});

test('game Logo and IP copyright remain independent placement rules',()=>{
  for(const suffix of ['community-three','community-four','community-five']){
    const item=communityPlacements.find(item=>item.id===`community-${suffix}`);
    assert.equal(item.brandLogo,false);assert.equal(item.ipCopyright,false);
  }
  for(const suffix of ['community-hero-library','community-hero-mini']){
    const item=communityPlacements.find(item=>item.id===`community-${suffix}`);
    assert.equal(item.brandLogo,false);assert.equal(item.ipCopyright,true);
  }
  for(const item of communityPlacements){
    const template=communityTemplate(item),rule=communityResourceRule(item);
    assert.equal(template.brandLogo,rule.brandLogo);
    assert.equal(template.ipCopyright,rule.ipCopyright);
    assert.equal(template.width,rule.technical.width);
    assert.equal(template.height,rule.technical.height);
  }
});

test('sample request selects exactly the seven specified dimensions',()=>{
  const dimensions=sampleSevenPlacementIds.map(id=>{
    const item=communityPlacements.find(entry=>entry.id===id);
    assert.ok(item,`missing ${id}`);
    return `${item.width}x${item.height}`;
  });
  assert.deepEqual(dimensions,['984x562','500x400','567x175','720x271','900x383','600x167','500x650']);
});
