import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {communityRewardGroups} from '../public/community-object-state.js';
import {placedCommunityObjects,placeCommunityObject,changeCommunityObjectLayer,removeCommunityObjectLayer,communityObjectLayerRect,validateCommunityObjectLayers,syncCommunityObjectLayers,loadCommunityObjectLayerImages,drawCommunityObjectLayers,communityObjectLayerImageKey} from '../public/community-object-layers.js';
import {renderCommunityObjectPlacementControls,mountCommunityObjectCanvas} from '../public/community-object-canvas.js';
import {bannerMasterSnapshot,bannerSourceToken,restoreBannerVersion} from '../lib/community-banner-session.mjs';
import {planLayeredCommunityTarget} from '../lib/community-target-reflow.mjs';
import {communityTargetReviewSnapshot} from '../public/community-artwork-state.js';
const master={id:'master',width:1920,height:1080},portrait={id:'portrait',width:720,height:1280,communityPlacement:true},square={id:'square',width:800,height:800,communityPlacement:true};
function task(){return {id:'task-1',masterTemplateId:master.id,assets:[1,2,3,4].map(n=>({name:`reward${n}.png`,mime:'image/png',role:'reward',url:`/reward${n}.png`,width:100,height:80})),parameters:{assetByTemplate:{master:{background:null}},layoutByTemplate:{master:{}},backgroundByTemplate:{master:{}}},communityDesign:{versions:[]}};}
test('four rewards are placed independently, repeated placement selects the existing one and moves are metadata only',()=>{
 const t=task(),original=structuredClone(t.assets),groups=communityRewardGroups(t);for(const group of groups)placeCommunityObject(t,master,'reward',group.id);
 assert.equal(placedCommunityObjects(t).length,4);const layer=placeCommunityObject(t,master,'reward',groups[0].id,{x:500,y:300});assert.equal(placedCommunityObjects(t).length,4);assert.equal(layer.x,500/1920);
 changeCommunityObjectLayer(t,master.id,layer.id,{x:.05,y:.95,size:.45});for(const target of [master,portrait,square]){const r=communityObjectLayerRect(layer,target);assert.equal(r.width,r.height);assert.ok(r.x>=0&&r.y>=0&&r.x+r.width<=target.width&&r.y+r.height<=target.height);}
 assert.deepEqual(t.assets,original);removeCommunityObjectLayer(t,master.id,layer.id);assert.equal(placedCommunityObjects(t).length,3);assert.equal(communityRewardGroups(t).length,4);
});
test('placed appearances survive library removal; unapproved candidates and foreign asset paths reject',()=>{
 const t=task(),reward=communityRewardGroups(t)[0];const layer=placeCommunityObject(t,master,'reward',reward.id);t.communityObjects={rewards:[],styles:[],characters:[]};validateCommunityObjectLayers(t,t.parameters.communityObjectLayersByTemplate,[master.id]);assert.equal(layer.appearance.assetName,reward.sourceName);
 const foreign=structuredClone(t.parameters.communityObjectLayersByTemplate);foreign.master[0].appearance.assetName='../other.png';assert.throws(()=>validateCommunityObjectLayers(t,foreign,[master.id]),/不属于/);
 const invalid=structuredClone(t.parameters.communityObjectLayersByTemplate);invalid.master[0].x=NaN;assert.throws(()=>validateCommunityObjectLayers(t,invalid,[master.id]),/位置/);
 t.communityObjects.styleCandidate={id:'new'};assert.throws(()=>placeCommunityObject(t,master,'reward',reward.id),/候选/);
});
test('history restores exact layer appearance and geometry, including clearing layers absent in an old snapshot',()=>{
 const t=task(),empty=bannerMasterSnapshot(t),before=bannerSourceToken(t),reward=communityRewardGroups(t)[0],layer=placeCommunityObject(t,master,'reward',reward.id);assert.notEqual(bannerSourceToken(t),before);
 const snapshot=bannerMasterSnapshot(t);t.communityDesign.versions=[{id:'placed',snapshot},{id:'empty',snapshot:empty}];changeCommunityObjectLayer(t,master.id,layer.id,{x:.9});restoreBannerVersion(t,'placed');assert.deepEqual(placedCommunityObjects(t),snapshot.objectLayers);restoreBannerVersion(t,'empty');assert.deepEqual(placedCommunityObjects(t),[]);
});
test('target planning keeps standalone objects as overlays; local sync preserves manual target offsets and scale',()=>{
 const t=task(),reward=communityRewardGroups(t)[0],layer=placeCommunityObject(t,master,'reward',reward.id),old=structuredClone([layer]),target=structuredClone(old);target[0].x=.7;target[0].size=.2;
 const plan=planLayeredCommunityTarget(t,master,portrait);assert.deepEqual(plan.objectLayers,old);assert.equal(plan.assets.character,null);
 changeCommunityObjectLayer(t,master.id,layer.id,{x:.6,size:.45});const next=structuredClone(placedCommunityObjects(t)),synced=syncCommunityObjectLayers(target,old,next);assert.ok(Math.abs(synced[0].x-.8)<1e-8);assert.ok(Math.abs(synced[0].size-.3)<1e-8);assert.deepEqual(syncCommunityObjectLayers(synced,old,[]),[]);
});
test('canvas drawing and export use the exact appearance URL and cached image, without accumulating slider previews',async()=>{
 const t=task(),reward=communityRewardGroups(t)[0],layer=placeCommunityObject(t,master,'reward',reward.id),images=new Map(),requests=[];
 await loadCommunityObjectLayerImages(t,async url=>{requests.push(url);return {url};},images);const drawn=[],ctx={drawImage:(...args)=>drawn.push(args),save(){},restore(){},setLineDash(){},strokeRect(){}};
 drawCommunityObjectLayers(ctx,t,master,images);assert.equal(drawn.length,1);assert.equal(drawn[0][0],images.get(communityObjectLayerImageKey(t,layer)));assert.deepEqual(drawn[0].slice(1),Object.values(communityObjectLayerRect(layer,master)));
 for(let i=0;i<10;i++){layer.appearance.style.opacity=.5+i*.02;await loadCommunityObjectLayerImages(t,async url=>({url}),images);}assert.equal(images.size,1);
 assert.throws(()=>drawCommunityObjectLayers(ctx,t,master,new Map()),/尚未加载/);assert.match(requests[0],/placed-image\?appearance=/);
});
test('target review expires when a placed item moves or its backing changes, while the background stays fixed',()=>{
 const t=task(),layer=placeCommunityObject(t,square,'reward',communityRewardGroups(t)[0].id),before=structuredClone(communityTargetReviewSnapshot(t,square));changeCommunityObjectLayer(t,square.id,layer.id,{y:.75});assert.notDeepEqual(communityTargetReviewSnapshot(t,square),before);assert.deepEqual(communityTargetReviewSnapshot(t,square).background,before.background);
});
function placedCharacter(t){
 t.assets.push({name:'character.png',mime:'image/png',role:'community-object-character',width:400,height:900,url:'/character.png'});
 t.communityObjects={rewards:communityRewardGroups(t),characters:[{id:'actor',assetName:'character.png'}],styles:[]};
 return placeCommunityObject(t,master,'character','actor');
}
test('characters enlarge to 300%, validate and synchronize without changing reward size limits',()=>{
 const t=task(),layer=placedCharacter(t);changeCommunityObjectLayer(t,master.id,layer.id,{size:1.6});assert.equal(layer.size,1.6);
 assert.match(renderCommunityObjectPlacementControls(t,'character','actor'),/max="3"/);
 validateCommunityObjectLayers(t,t.parameters.communityObjectLayersByTemplate,[master.id]);
 const old=structuredClone([layer]),target=structuredClone(old);target[0].size=1.2;changeCommunityObjectLayer(t,master.id,layer.id,{size:3});
 assert.ok(Math.abs(syncCommunityObjectLayers(target,old,[layer])[0].size-2.25)<1e-8);
 const invalid=structuredClone(t.parameters.communityObjectLayersByTemplate);invalid.master[0].size=3.01;assert.throws(()=>validateCommunityObjectLayers(t,invalid,[master.id]),/大小/);
 changeCommunityObjectLayer(t,master.id,layer.id,{size:5});assert.equal(layer.size,3);
 const reward=placeCommunityObject(t,master,'reward',communityRewardGroups(t)[0].id);changeCommunityObjectLayer(t,master.id,reward.id,{size:2});assert.equal(reward.size,1);
});
test('enlarged characters retain aspect and can reposition their cropped part instead of sticking at the top left',()=>{
 const t=task(),layer=placedCharacter(t);changeCommunityObjectLayer(t,master.id,layer.id,{size:1.6,x:.6,y:.5});
 const rect=communityObjectLayerRect(layer,master);assert.ok(rect.y<0);assert.equal(rect.height,1080*1.6);assert.ok(Math.abs(rect.width/rect.height-400/900)<1e-8);
 changeCommunityObjectLayer(t,master.id,layer.id,{y:.8});assert.notEqual(communityObjectLayerRect(layer,master).y,rect.y);
});
test('character and reward passes can be drawn separately around copy without drawing either twice',async()=>{
 const t=task(),character=placedCharacter(t),reward=placeCommunityObject(t,master,'reward',communityRewardGroups(t)[0].id),images=new Map();
 await loadCommunityObjectLayerImages(t,async url=>({url}),images);const calls=[],ctx={drawImage:image=>calls.push(image.url)};
 drawCommunityObjectLayers(ctx,t,master,images,{kinds:['character']});calls.push('copy');drawCommunityObjectLayers(ctx,t,master,images,{kinds:['reward']});
 assert.deepEqual(calls,[images.get(communityObjectLayerImageKey(t,character)).url,'copy',images.get(communityObjectLayerImageKey(t,reward)).url]);
 const app=await fs.readFile(new URL('../public/app.js',import.meta.url),'utf8'),start=app.indexOf('function renderCanvas('),render=app.slice(start,app.indexOf('function ',start+10));
 assert.ok(render.indexOf("kinds:['character']")<render.indexOf('drawSubtitleBacking(ctx'));
 assert.ok(render.indexOf("kinds:['character']")<render.indexOf('drawUploadedElement(ctx, template, "title")'));
});
class Element{
 constructor(dataset={}){this.dataset=dataset;this.handlers=new Map();this.classList={add(){},remove(){}};this.isConnected=true;}
 addEventListener(name,fn){this.handlers.set(name,fn);}removeEventListener(name){this.handlers.delete(name);}getBoundingClientRect(){return {left:0,top:0,width:960,height:540};}focus(){}setPointerCapture(){}
}
const settle=async callback=>{for(let n=0;n<100&&!callback();n++)await new Promise(r=>setTimeout(r,2));assert.ok(callback());};
test('visible controls place and drag an object, and deleting removes the layer but keeps the source material',async()=>{
 const t=task(),group=communityRewardGroups(t)[0],button=new Element({objectKind:'reward',objectGroup:group.id}),canvas=new Element(),stage=new Element(),nodes=new Map([['#preview-canvas',canvas],['#editor-drop-stage',stage]]),ui={previewMode:'target'},images=new Map();canvas.width=1920;canvas.height=1080;let saved=0,rendered=0;
 const root={isConnected:true,querySelector:s=>nodes.get(s),querySelectorAll:s=>s==='[data-object-place]'?[button]:[]};
 const stop=mountCommunityObjectCanvas({root,getTask:()=>t,getTemplate:()=>master,ui,images,loadImage:async url=>({url}),flush:async()=>true,save:async()=>{saved++;return true;},render:()=>rendered++,redraw(){},toast(){},isActive:()=>true});
 button.handlers.get('click')();await settle(()=>saved===1);assert.match(renderCommunityObjectPlacementControls(t,'reward',group.id),/移出画布/);assert.equal(rendered,1);
 const event=(clientX,clientY)=>({button:0,clientX,clientY,pointerId:1,preventDefault(){},stopImmediatePropagation(){}});
 canvas.handlers.get('pointerdown')(event(480,270));canvas.handlers.get('pointermove')(event(576,324));canvas.handlers.get('pointerup')(event(576,324));await settle(()=>saved===2);const layer=placedCommunityObjects(t)[0];assert.equal(layer.x,.6);assert.equal(layer.y,.6);
 canvas.handlers.get('keydown')({...event(0,0),key:'Delete'});await settle(()=>saved===3);assert.equal(placedCommunityObjects(t).length,0);assert.equal(t.assets.length,4);stop();
});
test('preview, export, history and the image loader are wired to the common overlay model',async()=>{
 const app=await fs.readFile(new URL('../public/app.js',import.meta.url),'utf8');assert.match(app,/drawCommunityObjectLayers\(ctx,state\.task,template,state\.assetImages/);assert.match(app,/mountCommunityObjectCanvas\(/);assert.match(app,/parameters\.communityObjectLayersByTemplate=snapshot\.communityObjectLayersByTemplate/);
});
