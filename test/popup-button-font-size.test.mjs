import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {normalizePopupConfig,popupDefaults,drawPopupButton} from '../public/community-popup-model.js';
import {createCommunityPopup} from '../lib/community-popup.mjs';
function draw(config,layout={x:80,y:560,width:300,height:60}){
 const events=[],ctx={save(){},restore(){},drawImage(...a){events.push(['image',...a]);},measureText(text){return {width:text.length*Number(this.font.match(/([\d.]+)px/)[1])};},fillText(text,x,y){events.push(['text',text,x,y,this.font]);}};
 drawPopupButton(ctx,{...popupDefaults(),...config},layout,{image:{width:400,height:100},fontFamily:'Licensed Font'});return events;
}
test('explicit button font size changes only text and remains fixed when the backing resizes',()=>{
 const small=draw({buttonFontSize:18}),large=draw({buttonFontSize:46});assert.deepEqual(small[0],large[0]);assert.deepEqual(small[1].slice(0,4),large[1].slice(0,4));assert.match(small[1][4],/18px/);assert.match(large[1][4],/46px/);
 const resized=draw({buttonFontSize:46},{x:40,y:500,width:440,height:110});assert.match(resized[1][4],/46px/);assert.notDeepEqual(resized[0],large[0]);
 // An explicit size must not silently shrink to fit the old backing.
 assert.match(draw({buttonFontSize:60,buttonLabel:'立即参与领取限定好礼'})[1][4],/60px/);
});
test('legacy automatic sizing stays unchanged and manual size is validated on both save paths',()=>{
 const legacy=normalizePopupConfig(popupDefaults());assert.equal(Object.hasOwn(legacy,'buttonFontSize'),false);assert.equal(draw({})[1][4],'400 31.200000000000003px "Licensed Font"');
 assert.equal(normalizePopupConfig({...legacy,buttonFontSize:36}).buttonFontSize,36);assert.equal(Object.hasOwn(normalizePopupConfig({...legacy,buttonFontSize:undefined}),'buttonFontSize'),false);
 for(const buttonFontSize of [0,7,121,NaN,Infinity,'30'])assert.throws(()=>normalizePopupConfig({...legacy,buttonFontSize}),/文字大小/);
});
test('new-design size saves and resets font size without changing button placement or other sizes',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'popup-font-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const tasksFile=path.join(dir,'tasks.json'),id='community-community-popup';
 const task={id:'test',mode:'master',masterTemplateId:'master',targetTemplateIds:[id],status:'批量生成',updatedAt:'before',version:1,copy:'标题',assets:[],history:[],parameters:{assetByTemplate:{[id]:{},master:{}},layoutByTemplate:{[id]:{button:{x:90,y:550,width:320,height:60,visible:true}},master:{title:{x:30}}},communityPopupByTemplate:{[id]:{...popupDefaults(),shape:'none'}},communityObjectLayersByTemplate:{[id]:[]}}};await fs.writeFile(tasksFile,JSON.stringify([task]));
 const apply=createCommunityPopup({tasksFile,storageDir:dir,templateMap:new Map([[id,{id,width:500,height:650}],['master',{id:'master',width:1920,height:1080}]]),invalidate:()=>{}});
 const saved=await apply('test',{action:'apply',expectedUpdatedAt:'before',config:{...task.parameters.communityPopupByTemplate[id],buttonFontSize:42}});assert.equal(saved.parameters.communityPopupByTemplate[id].buttonFontSize,42);assert.deepEqual(saved.parameters.layoutByTemplate[id].button,task.parameters.layoutByTemplate[id].button);assert.deepEqual(saved.parameters.layoutByTemplate.master,task.parameters.layoutByTemplate.master);
 const reset=await apply('test',{action:'apply',expectedUpdatedAt:saved.updatedAt,config:{...saved.parameters.communityPopupByTemplate[id],buttonFontSize:undefined}});assert.equal(reset.parameters.communityPopupByTemplate[id].buttonFontSize,undefined);assert.deepEqual(reset.parameters.layoutByTemplate[id].button,task.parameters.layoutByTemplate[id].button);
});
