import test from 'node:test';import assert from 'node:assert/strict';
import {sourceCopyrightRequired,sourceCopyrightState,sourceCopyrightLayout,sourceCopyrightKey,sourceCopyrightArtifactsCurrent,sourceCopyrightElement,validateSourceCopyright} from '../public/source-copyright.js';
import {planSourceComposition,drawSourceComposition} from '../public/source-adaptation-model.js';
const target={id:'banner',width:900,height:383,ipCopyright:true,communityLayout:{copyright:[.76,.91,.21,.06]}},project={isIpProject:true,copyrightNotice:'© YUEWEN'};
const task=()=>({masterTemplateId:'master',sourceAdaptation:{sourceHash:'test-source',layers:[],width:750,height:1000},parameters:{sourceCompositionByTemplate:{banner:{layers:[]}}}});
test('source targets inherit IP project copyright, respecting placement rules and untouched source master',()=>{
 const t=task();assert.equal(sourceCopyrightState(t,target,project).text,'© YUEWEN');
 for(const [ta,te,p] of [[t,target,{isIpProject:false}],[t,{...target,ipCopyright:false},project],[t,{...target,id:'master'},project],[{},target,project]])assert.equal(sourceCopyrightRequired(ta,te,p),false);
 assert.equal(sourceCopyrightState(t,target,{...project,copyrightNotice:' '}).text,'©YUEWEN');
 const r=sourceCopyrightLayout(target);assert.ok(r.x+r.width<=900&&r.y+r.height<=383);
});
test('existing fully visible copyright layers are reused; hidden and clipped marks do not suppress fallback',()=>{
 const t=task(),l={id:'ip',role:'ip-copyright',x:700,y:350,width:100,height:20};t.parameters.sourceCompositionByTemplate.banner.layers=[l];
 assert.equal(sourceCopyrightState(t,target,project).embedded,'ip');l.visible=false;assert.equal(sourceCopyrightState(t,target,project).embedded,null);
 l.visible=true;l.x=890;assert.equal(sourceCopyrightState(t,target,project).embedded,null);
});
test('a changed copyright or legacy artifact cannot reuse a stale source ZIP, while non-IP artifacts stay current',()=>{
 const t=task();t.artifacts=[{templateId:target.id}];assert.equal(sourceCopyrightArtifactsCurrent(t,[target],project),false);
 t.artifacts[0].sourceCopyrightKey=sourceCopyrightKey(t,target,project);assert.equal(sourceCopyrightArtifactsCurrent(t,[target],project),true);
 assert.equal(sourceCopyrightArtifactsCurrent(t,[target],{...project,copyrightNotice:'© OTHER'}),false);
 assert.equal(sourceCopyrightArtifactsCurrent(t,[target],{isIpProject:false}),true);
});
test('PSD copyright groups use their own bottom safe area instead of the subtitle area',()=>{
 const t=task();t.sourceAdaptation.layers=[{id:'ip',role:'ip-copyright',assetName:'ip.png',width:200,height:40,x:0,y:0}];
 const c=planSourceComposition(t,target),l=c.layers[0];assert.ok(l.y>target.height*.85);assert.ok(l.x+l.width<=900);assert.equal(l.width/l.height,5);
 assert.equal(planSourceComposition(t,{...target,ipCopyright:false}).layers[0].visible,false);
});

test('target copyright is above foregrounds while source master retains its original layer order',()=>{
 const t=task(),layers=[{id:'ip',assetName:'ip.png',role:'ip-copyright',x:700,y:350,width:100,height:20},{id:'figure',assetName:'figure.png',role:'character',x:0,y:0,width:900,height:383}];
 for(const id of ['master','banner'])t.parameters.sourceCompositionByTemplate[id]={background:'transparent',layers};
 const images=new Map([['ip.png','copyright'],['figure.png','foreground']]),drawn=[],ctx={clearRect(){},save(){},restore(){},drawImage(img){drawn.push(img);}};
 drawSourceComposition(ctx,t,{...target,id:'master'},images,{project});assert.deepEqual(drawn,['copyright','foreground']);drawn.length=0;
 drawSourceComposition(ctx,t,target,images,{project});assert.deepEqual(drawn,['foreground','copyright']);
});

test('embedded copyright is selected at its actual bounds; native overrides replace it and invalidate cached exports',()=>{
 const t=task(),layer={id:'ip',role:'ip-copyright',x:690,y:310,width:130,height:24,visible:true};t.parameters.sourceCompositionByTemplate.banner.layers=[layer];
 const element=sourceCopyrightElement(null,t,target,project);assert.deepEqual([element.x,element.y,element.width,element.height],[690,310,130,24]);
 const oldKey=sourceCopyrightKey(t,target,project);t.parameters.sourceCompositionByTemplate.banner.copyright=validateSourceCopyright({x:620,y:280,fontSize:28,colorMode:'black'});assert.equal(sourceCopyrightState(t,target,project).embedded,null);assert.notEqual(sourceCopyrightKey(t,target,project),oldKey);
 assert.throws(()=>validateSourceCopyright({x:NaN,y:20,fontSize:14,colorMode:'auto'}),/无效/);assert.throws(()=>validateSourceCopyright({x:20,y:20,fontSize:14,colorMode:'red'}),/版权颜色/);
});

test('oversized native copyright remains entirely inside the target canvas',()=>{
 const t=task();t.parameters.sourceCompositionByTemplate.banner.copyright={x:899,y:382,fontSize:200,colorMode:'black'};
 const ctx={save(){},restore(){},measureText(){return {width:Number(this.font.split(' ')[1].replace('px',''))*7};}},element=sourceCopyrightElement(ctx,t,target,project);
 assert.ok(element.fontSize<200);assert.ok(element.x>=0&&element.y>=0);assert.ok(element.x+element.width<=target.width&&element.y+element.height<=target.height);
});
