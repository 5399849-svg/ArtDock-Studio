export function protectedComposition(width, height, sourceWidth, sourceHeight, placement, sourceRect, view = {}) {
  if (![width,height,sourceWidth,sourceHeight].every(v=>Number.isFinite(v)&&v>0) || !sourceRect || !['x','y','width','height'].every(k=>Number.isFinite(sourceRect[k])) || sourceRect.width<=0 || sourceRect.height<=0) throw new Error('原图对齐坐标无效');
  const scale = Math.max(width/sourceWidth,height/sourceHeight) * Number(placement.scale ?? 100)/100;
  const zoom = Number(view.scale ?? 100)/100;
  const sw=sourceWidth*scale,sh=sourceHeight*scale;
  const sx=(width-sw)*Number(placement.focalX??50)/100,sy=(height-sh)*Number(placement.focalY??50)/100;
  const gw=sw/sourceRect.width,gh=sh/sourceRect.height;
  const gx=sx-sourceRect.x*gw,gy=sy-sourceRect.y*gh;
  const tx=width*(1-zoom)*Number(view.focalX??50)/100,ty=height*(1-zoom)*Number(view.focalY??50)/100;
  const transform=b=>({x:b.x*zoom+tx,y:b.y*zoom+ty,width:b.width*zoom,height:b.height*zoom});
  const original=transform({x:sx,y:sy,width:sw,height:sh}),generated=transform({x:gx,y:gy,width:gw,height:gh});
  const covered=generated.x<=.5 && generated.y<=.5 && generated.x+generated.width>=width-.5 && generated.y+generated.height>=height-.5;
  return {original,generated,covered};
}

export function drawRegisteredComposite(ctx, source, generated, geometry, options = {}) {
  const b=geometry.original,g=geometry.generated;
  ctx.save();ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
  ctx.drawImage(generated,g.x,g.y,g.width,g.height);ctx.restore();
  drawFeatheredOriginal(ctx,source,b,options);
}

export function drawFeatheredOriginal(ctx, source, bounds, options = {}) {
  const b=bounds;
  const featherX=Math.max(0,Math.min(Number(options.featherX)||0,b.width/3));
  const featherY=Math.max(0,Math.min(Number(options.featherY)||0,b.height/3));
  if(!featherX&&!featherY){
    ctx.save();ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(source,b.x,b.y,b.width,b.height);ctx.restore();return;
  }
  const layer=document.createElement('canvas');layer.width=ctx.canvas.width;layer.height=ctx.canvas.height;
  const layerCtx=layer.getContext('2d');layerCtx.imageSmoothingEnabled=true;layerCtx.imageSmoothingQuality='high';layerCtx.drawImage(source,b.x,b.y,b.width,b.height);
  const mask=document.createElement('canvas');mask.width=ctx.canvas.width;mask.height=ctx.canvas.height;
  const maskCtx=mask.getContext('2d');maskCtx.fillStyle='#fff';maskCtx.fillRect(b.x,b.y,b.width,b.height);maskCtx.globalCompositeOperation='destination-in';
  if(featherX){
    const gx=maskCtx.createLinearGradient(b.x,0,b.x+b.width,0),edge=Math.min(.49,featherX/b.width);
    gx.addColorStop(0,'rgba(0,0,0,0)');gx.addColorStop(edge,'rgba(0,0,0,1)');gx.addColorStop(1-edge,'rgba(0,0,0,1)');gx.addColorStop(1,'rgba(0,0,0,0)');maskCtx.fillStyle=gx;maskCtx.fillRect(b.x,b.y,b.width,b.height);
  }
  if(featherY){
    const gy=maskCtx.createLinearGradient(0,b.y,0,b.y+b.height),edge=Math.min(.49,featherY/b.height);
    gy.addColorStop(0,'rgba(0,0,0,0)');gy.addColorStop(edge,'rgba(0,0,0,1)');gy.addColorStop(1-edge,'rgba(0,0,0,1)');gy.addColorStop(1,'rgba(0,0,0,0)');maskCtx.fillStyle=gy;maskCtx.fillRect(b.x,b.y,b.width,b.height);
  }
  layerCtx.save();layerCtx.globalCompositeOperation='destination-in';layerCtx.drawImage(mask,0,0);layerCtx.restore();ctx.drawImage(layer,0,0);
}
