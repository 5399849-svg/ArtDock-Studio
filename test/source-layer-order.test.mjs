import test from 'node:test';
import assert from 'node:assert/strict';
import {moveSourceLayer,sourceStackLayers} from '../public/source-layer-order.js';
import {planSourceComposition,validateSourceComposition} from '../public/source-adaptation-model.js';
const target={id:'wide',width:900,height:383,communityPlacement:true};
function scene(){
 const layers=[{id:'bg',role:'background',width:1280,height:720},{id:'big',role:'character',width:800,height:674,sourceBounds:{left:478,top:0,width:800,height:674}},{id:'small',role:'character',width:362,height:420,sourceBounds:{left:120,top:230,width:362,height:420}},{id:'title',role:'title',width:672,height:253}].map(l=>({...l,x:0,y:0,assetName:l.id+'.png',label:l.id,visible:true}));
 return {id:'task',masterTemplateId:'source-master-task',sourceAdaptation:{sourceHash:'hash',width:1280,height:720,layers:[],reflow:{version:4,sourceHash:'hash',backgroundMode:'full-scene',layers}},parameters:{sourceCompositionByTemplate:{}},communityMasterApproval:{fingerprint:'same'}};
}
test('separate foreground character paints over the smaller character regardless of selection order',()=>{
 const t=scene(),c=planSourceComposition(t,target);assert.ok(c.layers.findIndex(l=>l.id==='big')>c.layers.findIndex(l=>l.id==='small'));
});
test('sidebar reorder changes only stacking, survives validation and reflow, and keeps new layers',()=>{
 const t=scene(),c=planSourceComposition(t,target),before=new Map(c.layers.map(l=>[l.id,structuredClone(l)]));
 assert.equal(moveSourceLayer(c,'small',0),true);assert.equal(c.layers.at(-1).id,'small');
 for(const l of c.layers)assert.deepEqual(l,before.get(l.id));
 const saved=validateSourceComposition(t,c,target.id);assert.equal(saved.layerOrderCustomized,true);
 t.parameters.sourceCompositionByTemplate[target.id]=saved;
 const next=planSourceComposition(t,target);assert.deepEqual(next.layers.map(l=>l.id),saved.layers.map(l=>l.id));
 t.sourceAdaptation.layers.push({id:'new',role:'foreground',width:20,height:20,assetName:'new.png'});
 assert.equal(planSourceComposition(t,target).layers.filter(l=>l.id==='new').length,1);
 assert.equal(moveSourceLayer(c,'small',-1),false);assert.equal(moveSourceLayer(c,'missing',0),false);
 c.layers.push({id:'copyright',role:'ip-copyright'});assert.equal(moveSourceLayer(c,'copyright',0),false);assert.ok(!sourceStackLayers(c).some(l=>l.id==='copyright'));
});
