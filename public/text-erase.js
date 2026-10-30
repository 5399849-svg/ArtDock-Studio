// The preview and server share this alpha-only eraser. RGB, image dimensions
// and every pixel outside the brush footprint are retained exactly.
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export function validateEraseStrokes(strokes,width,height){
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width*height>40000000)throw Error('文案素材尺寸无效');
 if(!Array.isArray(strokes)||!strokes.length||strokes.length>400)throw Error('请先擦除杂点；单次最多保存400笔');
 let points=0,work=0;
 for(const s of strokes){
  if(!s||!Number.isFinite(s.radius)||s.radius<.5||s.radius>256||!Array.isArray(s.points)||!s.points.length||s.points.length>2000)throw Error('擦除画笔参数无效');
  points+=s.points.length;if(points>25000)throw Error('本次操作较多，请先另存一版再继续清理');
  for(let i=0;i<s.points.length;i++){
   const p=s.points[i],a=s.points[Math.max(0,i-1)];if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.y<0||p.x>width||p.y>height)throw Error('擦除位置超出素材范围');
   work+=Math.min(width,Math.abs(p.x-a.x)+s.radius*2+2)*Math.min(height,Math.abs(p.y-a.y)+s.radius*2+2);
   if(work>150000000)throw Error('本次操作较多，请先另存一版再继续清理');
  }
 }
 return strokes;
}
export function rasterizeEraseStroke(mask,width,height,stroke){
 let dirty=null;
 for(let n=0;n<stroke.points.length;n++){
  const a=stroke.points[Math.max(0,n-1)],b=stroke.points[n],r=stroke.radius;
  const left=Math.max(0,Math.floor(Math.min(a.x,b.x)-r-1)),right=Math.min(width,Math.ceil(Math.max(a.x,b.x)+r+1));
  const top=Math.max(0,Math.floor(Math.min(a.y,b.y)-r-1)),bottom=Math.min(height,Math.ceil(Math.max(a.y,b.y)+r+1));
  const dx=b.x-a.x,dy=b.y-a.y,length=dx*dx+dy*dy;
  for(let y=top;y<bottom;y++)for(let x=left;x<right;x++){
   const index=y*width+x;if(mask[index]===255)continue;
   const t=length?clamp(((x+.5-a.x)*dx+(y+.5-a.y)*dy)/length,0,1):0;
   const distance=Math.hypot(x+.5-a.x-t*dx,y+.5-a.y-t*dy),coverage=Math.round(clamp(r+.5-distance,0,1)*255);
   if(coverage>mask[index]){mask[index]=coverage;if(!dirty)dirty={left:x,top:y,right:x+1,bottom:y+1};else{dirty.left=Math.min(dirty.left,x);dirty.top=Math.min(dirty.top,y);dirty.right=Math.max(dirty.right,x+1);dirty.bottom=Math.max(dirty.bottom,y+1);}}
  }
 }
 return dirty;
}
function updateAlpha(original,data,mask,width,box){
 if(!box)return false;let changed=false;
 for(let y=box.top;y<box.bottom;y++)for(let x=box.left;x<box.right;x++){
  const index=y*width+x,p=index*4+3,value=Math.round(original[p]*(255-mask[index])/255);
  if(data[p]!==value){data[p]=value;changed=true;}
 }
 return changed;
}
export function eraseTextPixels(original,width,height,strokes){
 validateEraseStrokes(strokes,width,height);if(original.length!==width*height*4)throw Error('文案像素格式无效');
 const mask=new Uint8Array(width*height),data=new Uint8ClampedArray(original);
 for(const s of strokes)rasterizeEraseStroke(mask,width,height,s);
 let changedPixels=0,visiblePixels=0;
 for(let i=0;i<mask.length;i++){const a=i*4+3;data[a]=Math.round(original[a]*(255-mask[i])/255);if(data[a]!==original[a])changedPixels++;if(data[a]>0)visiblePixels++;}
 return {data,mask,changedPixels,visiblePixels};
}
export class TextEraseDocument{
 constructor(original,width,height){if(original.length!==width*height*4)throw Error('文案像素格式无效');this.width=width;this.height=height;this.original=new Uint8ClampedArray(original);this.data=new Uint8ClampedArray(original);this.mask=new Uint8Array(width*height);this.strokes=[];this.redos=[];this.active=null;}
 point(p){return {x:clamp(p.x,0,this.width),y:clamp(p.y,0,this.height)};}
 begin(point,radius){this.end();if(this.strokes.length>=400)throw Error('请先另存一版再继续清理');this.active={radius:clamp(radius,.5,256),points:[this.point(point)],changed:false};return this.paint(this.active);}
 append(point){if(!this.active)return null;const p=this.point(point),a=this.active.points.at(-1);if(Math.hypot(p.x-a.x,p.y-a.y)<.25)return null;if(this.active.points.length>=2000)throw Error('这一笔较长，请松开鼠标后继续');this.active.points.push(p);return this.paint({radius:this.active.radius,points:[a,p]});}
 paint(stroke){const box=rasterizeEraseStroke(this.mask,this.width,this.height,stroke);if(updateAlpha(this.original,this.data,this.mask,this.width,box))this.active.changed=true;return box;}
 end(){if(!this.active)return;const active=this.active;this.active=null;if(active.changed){this.strokes.push({radius:active.radius,points:active.points});this.redos=[];}else this.rebuild();}
 rebuild(){this.mask.fill(0);this.data.set(this.original);for(const s of this.strokes)rasterizeEraseStroke(this.mask,this.width,this.height,s);updateAlpha(this.original,this.data,this.mask,this.width,{left:0,top:0,right:this.width,bottom:this.height});}
 undo(){this.end();if(!this.strokes.length)return;this.redos.push(this.strokes.pop());this.rebuild();}
 redo(){this.end();if(!this.redos.length)return;this.strokes.push(this.redos.pop());this.rebuild();}
}
export function textEraseImagePoint(x,y,rect,width,height){return {x:clamp((x-rect.left)/rect.width*width,0,width),y:clamp((y-rect.top)/rect.height*height,0,height)};}
