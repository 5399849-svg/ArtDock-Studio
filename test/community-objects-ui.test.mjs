import test from 'node:test';
import assert from 'node:assert/strict';
import {mountCommunityObjects,renderCommunityObjectInspector} from '../public/community-objects.js';
import {defaultRewardStyle} from '../public/community-object-state.js';
class Element{
 constructor(dataset={}){this.dataset=dataset;this.listeners=new Map();this.classList={toggle(){}};this.parentElement={classList:{toggle(){}},querySelector:()=>({textContent:''})};}
 addEventListener(type,handler){this.listeners.set(type,handler);}
 querySelector(){return null;}
}
const settle=async callback=>{for(let i=0;i<100&&!callback();i++)await new Promise(r=>setTimeout(r,2));assert.ok(callback());};
function fixture(){
 const task={id:'test-task',assets:[],parameters:{},communityObjects:{revision:3,rewards:[{id:'reward:book.png',name:'书卷',sourceName:'book.png',style:defaultRewardStyle()}],styles:[]}},ui={},nodes=new Map(),lists=new Map(),calls=[],notices=[];let active=true,refreshed,rendered=0;
 const root={isConnected:true,querySelector:selector=>nodes.get(selector)||null,querySelectorAll:selector=>lists.get(selector)||[]};
 const select=new Element({objectReward:'reward:book.png'});lists.set('[data-object-reward]',[select]);const mode=new Element({objectMode:'objects'});lists.set('[data-object-mode]',[mode]);
 nodes.set('[data-current-reward]',new Element({currentReward:'reward:book.png'}));
 const slider=new Element({objectSlider:'scale'});slider.value='.8';lists.set('[data-object-slider]',[slider]);
 const generate=new Element();nodes.set('[data-object-generate-style]',generate);for(const [selector,value]of [['#community-object-style-prompt','淡紫星光底板'],['#community-object-layer','backing'],['#community-object-scope','all'],['#community-object-model','gpt-image-2']]){const input=new Element();input.value=value;nodes.set(selector,input);}
 const start=api=>mountCommunityObjects({root,task,ui,api:async(url,options)=>{calls.push({url,options});return api?api(url,options):task;},flush:async()=>true,refresh:async fresh=>{refreshed=fresh;active=false;},render:()=>rendered++,toast:text=>notices.push(text),isActive:()=>active});
 return {task,ui,nodes,lists,calls,notices,start,slider,generate,get refreshed(){return refreshed},get rendered(){return rendered}};
}
test('reward selection opens the settings inspector and sliders submit only normalized metadata',async()=>{
 const f=fixture(),stop=f.start();f.lists.get('[data-object-reward]')[0].onclick();assert.equal(f.ui.communityObjectMode,'objects');assert.equal(f.ui.communityObjectSelection.id,'reward:book.png');assert.equal(f.rendered,1);
 f.slider.oninput();f.slider.onchange();await settle(()=>f.refreshed);const request=JSON.parse(f.calls[0].options.body);assert.equal(request.expectedRevision,3);assert.equal(request.style.scale,.8);assert.equal(request.rewardId,'reward:book.png');assert.equal(request.sourceBuffer,undefined);assert.equal(request.referenceDataUrl,undefined);stop();
});
test('a lost style receipt retains the same client request ID for a retry and sends no reward pixels',async()=>{
 const f=fixture();let attempts=0;const stop=f.start(async(url,options)=>{if(!options)return {task:f.task};if(++attempts===1)throw Error('reply lost');return f.task;});
 f.generate.listeners.get('click')();await settle(()=>f.notices.length===1);f.generate.listeners.get('click')();await settle(()=>f.refreshed);const submissions=f.calls.filter(c=>c.options?.method==='POST').map(c=>JSON.parse(c.options.body));assert.equal(submissions.length,2);assert.equal(submissions[0].requestId,submissions[1].requestId);assert.equal(submissions[0].scope,'all');assert.equal(submissions[0].kind,'style');assert.equal(submissions[0].sourceName,undefined);assert.equal(submissions[0].images,undefined);stop();
});
test('candidate controls expose review before adoption and keep four rewards grouped rather than expanding style cards',()=>{
 const f=fixture();f.task.communityObjects.styleCandidate={id:'candidate',name:'新底板',rewardId:'reward:book.png',backingName:'plate.png'};const html=renderCommunityObjectInspector(f.task,{communityObjectMode:'objects'});assert.match(html,/data-object-accept disabled/);assert.match(html,/data-object-discard/);assert.match(html,/candidate=1/);assert.match(html,/下载道具 PNG/);assert.match(html,/前景光效/);assert.equal(f.task.communityObjects.rewards.length,1);
});

test('candidate review stays on its owning reward and body-only preview cannot enable adoption',()=>{
 const f=fixture();f.task.communityObjects.rewards.push({id:'other',name:'其他道具',sourceName:'other.png',style:defaultRewardStyle()});f.task.communityObjects.styleCandidate={id:'candidate',rewardId:'reward:book.png',backingName:'plate.png'};
 assert.match(renderCommunityObjectInspector(f.task,{communityObjectMode:'objects',communityObjectSelection:{kind:'reward',id:'other'}}),/data-current-reward="reward:book.png"/);
 const image=new Element(),error=new Element(),adopt=new Element(),body=new Element({objectPreview:'body'}),combo=new Element({objectPreview:'combo'});image.complete=false;adopt.disabled=true;
 f.nodes.set('#community-object-preview',image);f.nodes.set('.community-object-preview-error',error);f.nodes.set('[data-object-accept]',adopt);f.lists.set('[data-object-preview]',[combo,body]);
 const stop=f.start();image.onload();assert.equal(adopt.disabled,false);body.onclick();image.onload();assert.equal(adopt.disabled,true);combo.onclick();assert.equal(adopt.disabled,true);image.onload();assert.equal(adopt.disabled,false);stop();
});
