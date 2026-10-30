const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const coordinate=(value,fallback)=>Number.isFinite(Number(value))?Number(value):fallback;

// Positions remain normalized to the canvas, including existing saved drafts.
export function adLogoGeometry(spec,art,draft={}){
  const artWidth=art.naturalWidth||art.width,artHeight=art.naturalHeight||art.height;
  const width=Math.max(1,Math.min(spec.width,Math.floor(spec.height*artWidth/artHeight),Math.round((Number(draft.logoScale)||.18)*spec.width)));
  const height=Math.max(1,Math.round(width*artHeight/artWidth));
  const travelX=Math.max(0,spec.width-width),travelY=Math.max(0,spec.height-height);
  return {width,height,maxX:travelX/spec.width,maxY:travelY/spec.height,
    left:clamp(Math.round(coordinate(draft.logoX,.78)*spec.width),0,travelX),
    top:clamp(Math.round(coordinate(draft.logoY,.06)*spec.height),0,travelY)};
}

export function updateAdLogoSliders(root,spec,geometry){
  for(const [axis,maximum,pixels,position] of [['x',geometry.maxX,spec.width,geometry.left],['y',geometry.maxY,spec.height,geometry.top]]){
    const input=root.querySelector(`#ad-logo-${axis}`);if(!input)continue;
    input.max=String(maximum);input.step=String(1/pixels);input.value=String(position/pixels);
  }
}
