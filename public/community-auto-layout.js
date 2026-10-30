// Carry a designer's adjustments relative to the master placement into each
// target's own composition. Target defaults are different for wide, square,
// and portrait placements; copying raw master coordinates would crop content.
import {normalizeSubtitleBacking} from './subtitle-backing.js';

export function remapCommunityLayer(sourceSize, targetSize, sourceDefault, targetDefault, sourceLayout, {preserveAspect=false}={}) {
  const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const sourceWidth = Math.max(1, finite(sourceSize.width, 1));
  const sourceHeight = Math.max(1, finite(sourceSize.height, 1));
  const targetWidth = Math.max(1, finite(targetSize.width, 1));
  const targetHeight = Math.max(1, finite(targetSize.height, 1));
  const source = { ...sourceDefault, ...sourceLayout };
  const dx = ((finite(source.x, sourceDefault.x) + finite(source.width, sourceDefault.width) / 2)
    - (sourceDefault.x + sourceDefault.width / 2)) / sourceWidth;
  const dy = ((finite(source.y, sourceDefault.y) + finite(source.height, sourceDefault.height) / 2)
    - (sourceDefault.y + sourceDefault.height / 2)) / sourceHeight;
  const scaleX = Math.max(.2, Math.min(3, finite(source.width, sourceDefault.width) / Math.max(1, sourceDefault.width)));
  const scaleY = Math.max(.2, Math.min(3, finite(source.height, sourceDefault.height) / Math.max(1, sourceDefault.height)));
  let width = Math.min(targetWidth * .98, Math.max(1, targetDefault.width * scaleX));
  let height = Math.min(targetHeight * .98, Math.max(1, targetDefault.height * scaleY));
  if(preserveAspect) {
    const ratio=Math.max(.01,finite(source.width,sourceDefault.width)/Math.max(1,finite(source.height,sourceDefault.height)));
    width=Math.sqrt(width*height*ratio);height=width/ratio;
    const fit=Math.min(1,targetWidth*.96/width,targetHeight*.96/height);
    width*=fit;height*=fit;
  }
  const centerX = targetDefault.x + targetDefault.width / 2 + dx * targetWidth;
  const centerY = targetDefault.y + targetDefault.height / 2 + dy * targetHeight;
  const insetX=preserveAspect?targetWidth*.02:0,insetY=preserveAspect?targetHeight*.02:0;
  const x = Math.max(insetX, Math.min(targetWidth - width-insetX, centerX - width / 2));
  const y = Math.max(insetY, Math.min(targetHeight - height-insetY, centerY - height / 2));
  return { ...source, x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
}

// Follow the subtitle's target composition while retaining the backing's own
// geometry relative to it. This mapping runs only on an explicit reflow action;
// moving either layer in the editor does not link their positions.
export function remapCommunitySubtitleBacking(sourceSize,targetSize,sourceSubtitle,targetSubtitle,sourceLayout) {
  const backing=normalizeSubtitleBacking(sourceLayout?.backing);
  if(!backing.enabled)return null;
  const finite=(value,fallback)=>Number.isFinite(value)?value:fallback;
  const sourceWidth=Math.max(1,finite(sourceSize?.width,1));
  const sourceHeight=Math.max(1,finite(sourceSize?.height,1));
  const targetWidth=Math.max(1,finite(targetSize?.width,1));
  const targetHeight=Math.max(1,finite(targetSize?.height,1));
  const from=sourceSubtitle || {x:0,y:0,width:sourceWidth,height:sourceHeight};
  const to=targetSubtitle || {x:0,y:0,width:targetWidth,height:targetHeight};
  const scaleX=Math.max(1,finite(to.width,targetWidth))/Math.max(1,finite(from.width,sourceWidth));
  const scaleY=Math.max(1,finite(to.height,targetHeight))/Math.max(1,finite(from.height,sourceHeight));
  const uniform=backing.assetName?Math.min(scaleX,scaleY):null;
  const width=Math.min(targetWidth,Math.max(1,finite(sourceLayout.width,1)*(uniform ?? scaleX)));
  const height=Math.min(targetHeight,Math.max(1,finite(sourceLayout.height,1)*(uniform ?? scaleY)));
  const centerX=finite(to.x,0)+(finite(sourceLayout.x,0)+finite(sourceLayout.width,1)/2-finite(from.x,0))*scaleX;
  const centerY=finite(to.y,0)+(finite(sourceLayout.y,0)+finite(sourceLayout.height,1)/2-finite(from.y,0))*scaleY;
  return {...structuredClone(sourceLayout),x:Math.round(Math.max(0,Math.min(targetWidth-width,centerX-width/2))),y:Math.round(Math.max(0,Math.min(targetHeight-height,centerY-height/2))),width:backing.assetName?width:Math.round(width),height:backing.assetName?height:Math.round(height),backing};
}
