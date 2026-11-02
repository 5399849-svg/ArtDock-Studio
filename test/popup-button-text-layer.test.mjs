import test from 'node:test';
import assert from 'node:assert/strict';
import {popupDefaults,normalizePopupConfig,drawPopupButton,popupButtonTextBox,transformPopupButtonText} from '../public/community-popup-model.js';
import {validateSourceComposition} from '../public/source-adaptation-model.js';
const layout={x:100,y:560,width:300,height:60},image={width:400,height:100};
function context(){return {events:[],save(){},restore(){},drawImage(...a){this.events.push(['backing',...a]);},measureText(text){return {width:text.length*parseFloat(this.font.match(/([\d.]+)px/)[1])};},fillText(text,x,y){this.events.push(['text',text,x,y,this.font]);}};}
test('legacy alignment stays identical while a positioned text layer is independent of decorated image bounds',()=>{
 const c=popupDefaults(),a=context(),b=context();drawPopupButton(a,c,layout,{image});
 assert.deepEqual(a.events[1].slice(1,4),['立即去玩',250,590]);
 const moved={...c,buttonTextPosition:{x:244,y:603}};drawPopupButton(b,moved,layout,{image});
 assert.deepEqual(a.events[0],b.events[0]);assert.deepEqual(b.events[1].slice(1,4),['立即去玩',244,603]);
 const replaced=context();drawPopupButton(replaced,moved,{x:40,y:520,width:400,height:80},{image:{width:800,height:90}});
 assert.deepEqual(replaced.events[1].slice(2,4),[244,603]);assert.equal(Object.hasOwn(normalizePopupConfig(c),'buttonTextPosition'),false);
});
test('dragging preserves type size; resizing only changes text; position validation is shared with source saves',()=>{
 const c={...popupDefaults(),buttonFontSize:30},original=popupButtonTextBox(context(),c,layout,{image});
 transformPopupButtonText(c,{...original,x:original.x+12,y:original.y+9},original);
 assert.deepEqual(c.buttonTextPosition,{x:262,y:599});assert.equal(c.buttonFontSize,30);assert.equal(c.buttonLayout,undefined);
 transformPopupButtonText(c,{...original,width:original.width*1.4,height:original.height*1.4},original);assert.equal(c.buttonFontSize,42);
 const saved=validateSourceComposition({masterTemplateId:'master',sourceAdaptation:{layers:[]}},{background:'transparent',layers:[],popup:c},'community-community-popup');
 assert.deepEqual(saved.popup.buttonTextPosition,c.buttonTextPosition);assert.equal(saved.popup.buttonFontSize,42);
 for(const p of [{x:-1,y:50},{x:501,y:50},{x:50,y:651},{x:Infinity,y:0},{x:'10',y:20}])assert.throws(()=>normalizePopupConfig({...c,buttonTextPosition:p}),/文字中心/);
});
