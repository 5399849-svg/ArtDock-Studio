import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {updateLayoutRegions} from '../lib/layout-regions.mjs';
const base=JSON.parse(fs.readFileSync(new URL('../config/psd-layout-rules-v1.json',import.meta.url))).templates.find(t=>t.templateId==='37-home-hero');
const template={id:base.templateId,...base.canvas};
test('区域编辑保留其他版式、全部页面遮挡和固定85px渐变，撤销交付核实',()=>{
  const input=structuredClone({...base,revision:0});
  input.variants[0].regions.find(r=>r.type==='copy').bounds.x+=1;
  const next=updateLayoutRegions(template,base,input);
  assert.equal(next.revision,1);assert.equal(next.deliveryAllowed,false);
  assert.deepEqual(next.variants[1].regions.map(r=>r.bounds),base.variants[1].regions.map(r=>r.bounds));
  assert.equal(next.globalRegions.find(r=>r.type==='fixed').bounds.height,85);
  assert.equal(next.variants[0].regions.filter(r=>r.type==='page-occlusion').length,3);
  assert.equal(base.revision,undefined);
});
test('拒绝越界、非数字、小数、重复版式和过期版本，原规范不变',()=>{
  for(const patch of [{x:-1},{width:1921},{height:0},{y:1.5},{x:'20'},{y:NaN}]){
    const input=structuredClone({...base,revision:0});Object.assign(input.variants[0].regions[0].bounds,patch);
    assert.throws(()=>updateLayoutRegions(template,base,input),{status:422});
  }
  assert.throws(()=>updateLayoutRegions(template,base,{...base,revision:1}),{status:409});
  const bad=structuredClone({...base,revision:0});bad.variants[1].id=bad.variants[0].id;
  assert.throws(()=>updateLayoutRegions(template,base,bad),{status:422});
});
test('没有PSD的新资源位可保存默认版式，但不能自动获得交付资格',()=>{
  const rule=updateLayoutRegions({id:'new',width:100,height:200},undefined,{revision:0,globalRegions:[],variants:[{id:'layout-01',regions:[{type:'core',name:'主体',bounds:{x:0,y:0,width:100,height:200}}]}]});
  assert.equal(rule.deliveryAllowed,false);assert.equal(rule.variants[0].name,'默认版式');
});
