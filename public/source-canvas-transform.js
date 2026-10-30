export const layerCorners=l=>[{name:'nw',x:l.x,y:l.y},{name:'ne',x:l.x+l.width,y:l.y},{name:'se',x:l.x+l.width,y:l.y+l.height},{name:'sw',x:l.x,y:l.y+l.height}];
export function visibleLayerCorners(layer,viewport,inset=5){return layerCorners(layer).map(p=>({...p,...(viewport?{x:Math.max(inset,Math.min(viewport.width-inset,p.x)),y:Math.max(inset,Math.min(viewport.height-inset,p.y))}:{})}));}
export function hitLayerCorner(layer,point,radius,viewport){return layer?.visible!==false?visibleLayerCorners(layer,viewport,radius/2).find(p=>Math.hypot(p.x-point.x,p.y-point.y)<=radius):null;}
export function resizeLayerFromCorner(layer,corner,point){
 const right=corner.includes('e'),bottom=corner.includes('s'),anchor={x:layer.x+(right?0:layer.width),y:layer.y+(bottom?0:layer.height)};
 const dx=(point.x-anchor.x)*(right?1:-1),dy=(point.y-anchor.y)*(bottom?1:-1);
 // Project onto the original diagonal. The opposite corner stays fixed.
 const scale=Math.max(1/Math.min(layer.width,layer.height),Math.min(60000/Math.max(layer.width,layer.height),(dx*layer.width+dy*layer.height)/(layer.width**2+layer.height**2)));
 const width=layer.width*scale,height=layer.height*scale;
 return {x:anchor.x-(right?0:width),y:anchor.y-(bottom?0:height),width,height};
}
export function scaleLayerAtPoint(layer,factor,point){
 const scale=Math.max(1/Math.min(layer.width,layer.height),Math.min(60000/Math.max(layer.width,layer.height),factor));
 return {x:point.x-(point.x-layer.x)*scale,y:point.y-(point.y-layer.y)*scale,width:layer.width*scale,height:layer.height*scale};
}
export function drawLayerHandles(ctx,layer,size,viewport){
 ctx.save();ctx.strokeStyle='#7956ef';ctx.lineWidth=Math.max(1,size/7);ctx.setLineDash([size/2,size/3]);ctx.strokeRect(layer.x,layer.y,layer.width,layer.height);ctx.setLineDash([]);ctx.fillStyle='#fff';
 for(const p of visibleLayerCorners(layer,viewport,size*.625)){ctx.fillRect(p.x-size/2,p.y-size/2,size,size);ctx.strokeRect(p.x-size/2,p.y-size/2,size,size);}ctx.restore();
}
