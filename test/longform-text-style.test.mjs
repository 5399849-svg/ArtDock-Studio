import test from 'node:test';import assert from 'node:assert/strict';import {newVariants,validateProject} from '../public/longform/model.js';import {textForLayer,layerArtwork,adoptLayerArtwork} from '../public/longform/layer-text.js';import {layerPatchSet} from '../public/longform/layers.js';
const project=()=>({document:{title:'主标题',subtitle:'副标题',intro:'导语',people:[],blocks:[{id:'q1',kind:'dialogue',text:'采访者：问题？',speaker:'采访者'},{id:'reward',kind:'rewards',text:'奖励',items:[{id:'item1',title:'钻石',quantity:'500',detail:'说明',assetId:''}]}]},variants:newVariants(),assets:[]});
test('text source resolves subtitles, dialogue display copy, reward labels and free text',()=>{const p=project(),v=p.variants[0];assert.equal(textForLayer(p,v,'hero.subtitle'),'副标题');assert.equal(textForLayer(p,v,'text:q1'),'问题？');assert.equal(textForLayer(p,v,'item-item1-quantity:reward'),'500');v.customLayers=[{id:'custom-1',kind:'text',name:'自由文字',text:'报名中',width:200,fontSize:30,color:'#ffffff'}];assert.equal(textForLayer(p,v,'custom-1'),'报名中');assert.equal(textForLayer(p,v,'hero.logo'),null);});
test('font and alignment patches remain isolated to the selected layer and variant',()=>{const p=project(),v=p.variants[0];Object.assign(v.layers,layerPatchSet(v,'hero.subtitle',{align:'center',fontId:'licensed-font'}));assert.equal(v.layers['hero.subtitle'].align,'center');assert.equal(p.variants[1].layers['hero.subtitle'],undefined);assert.equal(v.layers['hero.edition'],undefined);assert.doesNotThrow(()=>validateProject(p));v.layers['hero.subtitle'].align='justify';assert.throws(()=>validateProject(p),/对齐/);v.layers['hero.subtitle'].align='center';v.layers['hero.subtitle'].fontId="bad'url";assert.throws(()=>validateProject(p),/样式/);});
test('AI candidates bind to exact layer and text and stop displaying when copy changes',()=>{const p=project(),v=p.variants[0];p.assets.push({id:'ai-art',role:'typography',targetLayerId:'hero.subtitle',targetText:'副标题'});adoptLayerArtwork(p,v,'hero.subtitle','ai-art');assert.equal(layerArtwork(p,v,'hero.subtitle').asset.id,'ai-art');assert.equal(v.titleArtAssetId,'');assert.throws(()=>adoptLayerArtwork(p,v,'hero.title','ai-art'),/不属于/);p.document.subtitle='新副标题';assert.equal(layerArtwork(p,v,'hero.subtitle').stale,true);assert.equal(layerArtwork(p,v,'hero.subtitle').asset,null);assert.throws(()=>adoptLayerArtwork(p,v,'hero.subtitle','ai-art'),/文案已变化/);});
test('AI adoption respects locked layers and never changes source copy',()=>{const p=project(),v=p.variants[0],before=structuredClone(p.document);p.assets.push({id:'a',role:'typography',targetLayerId:'hero.subtitle',targetText:'副标题'});v.layers['hero.subtitle']={locked:true};assert.throws(()=>adoptLayerArtwork(p,v,'hero.subtitle','a'),/解锁/);v.layers['hero.subtitle'].locked=false;adoptLayerArtwork(p,v,'hero.subtitle','a');assert.deepEqual(p.document,before);});

test('editorial interview splits display headings while preserving shared copy and host',()=>{
 const p=project(),v=p.variants[0];v.designProfile='interview-editorial';v.titleGap=0;
 p.document.title='亚军剑道尘心 × 季军无聊的游：双雄各姿，尽展锋芒';
 p.document.people=[{id:'host',name:'璐璐',role:'host',assetId:''}];
 p.document.blocks=[{id:'part1',kind:'part',text:'亚军篇・剑道尘心：公测元老，知己同行'},{id:'intro1',kind:'paragraph',text:'人物介绍'},{id:'q1',kind:'dialogue',speaker:'璐璐',text:'璐璐：请介绍一下自己。'}];
 const source=structuredClone(p.document);
 assert.equal(textForLayer(p,v,'hero.edition'),'亚军剑道尘心 × 季军无聊的游');
 assert.equal(textForLayer(p,v,'hero.title'),'双雄各姿，尽展锋芒');
 assert.equal(textForLayer(p,v,'text:part1'),'亚军篇・剑道尘心');
 assert.equal(textForLayer(p,v,'kicker:part1'),'公测元老，知己同行');
 assert.equal(textForLayer(p,v,'name:q1'),'璐璐');assert.equal(textForLayer(p,v,'text:q1'),'请介绍一下自己。');
 assert.equal(textForLayer(p,p.variants[1],'text:part1'),source.blocks[0].text);
 assert.deepEqual(p.document,source);assert.doesNotThrow(()=>validateProject(p));
});
test('editorial layer overrides and AI artwork bind to the text actually shown',()=>{
 const p=project(),v=p.variants[0];v.designProfile='interview-editorial';
 v.layers['hero.edition']={text:'两位受访者'};
 assert.equal(textForLayer(p,v,'hero.edition'),'两位受访者');
 p.assets.push({id:'edition-art',role:'typography',targetLayerId:'hero.edition',targetText:'两位受访者'});
 adoptLayerArtwork(p,v,'hero.edition','edition-art');assert.equal(layerArtwork(p,v,'hero.edition').stale,false);
 v.layers['hero.edition'].text='新受访者';assert.equal(layerArtwork(p,v,'hero.edition').stale,true);
});
