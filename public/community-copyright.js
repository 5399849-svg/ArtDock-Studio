import {measureNativeCopy,drawNativeCopy} from './native-copy-layer.js';

const linear=Array.from({length:256},(_,value)=>{const c=value/255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;});
export const copyrightColorMode=value=>['black','white'].includes(value)?value:'auto';
export function copyrightColorFromPixels(pixels){
  let luminance=0,weight=0;
  // A deterministic sample grid bounds the work when a copyright box is large.
  const stride=Math.max(1,Math.floor(pixels.length/4/2048));
  for(let index=0;index<pixels.length/4;index+=stride){
    const p=index*4,alpha=pixels[p+3]/255;
    const r=Math.round(pixels[p]*alpha+255*(1-alpha)),g=Math.round(pixels[p+1]*alpha+255*(1-alpha)),b=Math.round(pixels[p+2]*alpha+255*(1-alpha));
    luminance+=.2126*linear[r]+.7152*linear[g]+.0722*linear[b];weight++;
  }
  if(!weight)return '#000000';
  const light=luminance/weight;
  return (light+.05)/.05>=1.05/(light+.05)?'#000000':'#ffffff';
}
export function copyrightColorAt(ctx,bounds){
  const left=Math.max(0,Math.floor(bounds.x)),top=Math.max(0,Math.floor(bounds.y)),right=Math.min(ctx.canvas.width,Math.ceil(bounds.x+bounds.width)),bottom=Math.min(ctx.canvas.height,Math.ceil(bounds.y+bounds.height));
  if(right<=left||bottom<=top)return '#000000';
  return copyrightColorFromPixels(ctx.getImageData(left,top,right-left,bottom-top).data);
}
export function drawCommunityCopyright(ctx,options){
  if(!String(options.text||'').trim()||options.rect?.visible===false)return null;
  const regular={...options,fontWeight:400};
  const measured=measureNativeCopy(ctx,regular),mode=copyrightColorMode(options.rect?.copyrightColorMode);
  const fill=mode==='black'?'#000000':mode==='white'?'#ffffff':copyrightColorAt(ctx,measured.rotatedInkBounds);
  // Copyright is plain black/white text, independent of title effects and old outlines.
  drawNativeCopy(ctx,{...regular,kind:'ip-copyright',fill,effects:{stroke:{enabled:false},shadow:{enabled:false}}});
  return {fill,measured};
}
