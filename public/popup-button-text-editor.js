import {popupButtonTextBox,transformPopupButtonText} from './community-popup-model.js';
import {hitLayerCorner,layerCorners,resizeLayerFromCorner,scaleLayerAtPoint} from './source-canvas-transform.js';

// The new-design canvas has its own asset drag handler. Capture only text hits
// above that handler, then use the same popup config/save path as the panel.
export function mountPopupButtonTextEditor({root,config,layout,image,fontFamily,selected,select,change,commit,locked}){
 const canvas=root.querySelector('#preview-canvas');if(!canvas)return ()=>{};
 let drag=null,timer=null,disposed=false;
 const box=()=>popupButtonTextBox(canvas.getContext('2d'),config(),layout(),{image:image(),fontFamily:fontFamily()});
 const point=e=>{const r=canvas.getBoundingClientRect();return {x:(e.clientX-r.x)*500/r.width,y:(e.clientY-r.y)*650/r.height};};
 const radius=()=>8*500/canvas.getBoundingClientRect().width;
 const hit=(b,p)=>b.visible&&p.x>=b.x&&p.x<=b.x+b.width&&p.y>=b.y&&p.y<=b.y+b.height;
 const stop=e=>{e.preventDefault();e.stopImmediatePropagation();};
 const apply=(value,original)=>{const next={...config()};transformPopupButtonText(next,value,original);change(next);};
 const persist=()=>{clearTimeout(timer);if(!disposed)void commit();};
 const down=e=>{
  if(e.target!==canvas||e.button!==0||locked())return;
  const b=box(),p=point(e),corner=selected()&&b.visible?hitLayerCorner(b,p,radius(),{width:500,height:650}):null;
  if(!corner&&!hit(b,p)){if(selected())select(false);return;}
  stop(e);clearTimeout(timer);select(true);drag={box:b,start:p,corner:corner?.name,moved:false};canvas.setPointerCapture(e.pointerId);canvas.focus({preventScroll:true});
 };
 const move=e=>{
  if(!drag)return;stop(e);if(locked())return;
  const p=point(e),dx=p.x-drag.start.x,dy=p.y-drag.start.y;if(Math.abs(dx)+Math.abs(dy)<.01)return;
  drag.moved=true;
  if(drag.corner){const origin=layerCorners(drag.box).find(c=>c.name===drag.corner);apply(resizeLayerFromCorner(drag.box,drag.corner,{x:origin.x+dx,y:origin.y+dy}),drag.box);}
  else apply({...drag.box,x:drag.box.x+dx,y:drag.box.y+dy},drag.box);
 };
 const finish=e=>{if(!drag)return;stop(e);const moved=drag.moved;drag=null;if(moved)persist();};
 const wheel=e=>{
  if(e.target!==canvas||locked()||drag)return;const b=box(),p=point(e);if(!hit(b,p))return;
  stop(e);select(true);const delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?canvas.clientHeight:1);
  apply(scaleLayerAtPoint(b,Math.exp(-Math.max(-100,Math.min(100,delta))*.0015),p),b);clearTimeout(timer);timer=setTimeout(persist,250);
 };
 const key=e=>{
  if(e.target!==canvas||!selected()||locked())return;
  // Avoid deleting the asset underneath the independently selected lettering.
  if(['Delete','Backspace'].includes(e.key)){stop(e);return;}
  const delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];if(!delta)return;
  stop(e);const b=box(),step=e.shiftKey?10:1;apply({...b,x:b.x+delta[0]*step,y:b.y+delta[1]*step},b);clearTimeout(timer);timer=setTimeout(persist,250);
 };
 const events=[['pointerdown',down],['pointermove',move],['pointerup',finish],['pointercancel',finish],['lostpointercapture',finish],['wheel',wheel],['keydown',key]];
 for(const [name,fn]of events)root.addEventListener(name,fn,{capture:true,passive:false});
 return ()=>{disposed=true;clearTimeout(timer);for(const [name,fn]of events)root.removeEventListener(name,fn,true);};
}
