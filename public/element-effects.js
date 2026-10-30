const defaults={
  stroke:{enabled:false,color:'#ffffff',width:4},
  shadow:{enabled:false,color:'#000000',opacity:55,blur:12,offsetX:6,offsetY:8},
};
const between=(value,min,max,fallback)=>Number.isFinite(Number(value))?Math.min(max,Math.max(min,Number(value))):fallback;
const color=(value,fallback)=>/^#[0-9a-f]{6}$/i.test(String(value||''))?String(value).toLowerCase():fallback;

export function normalizeElementEffects(input={}){
  const stroke=input?.stroke||{},shadow=input?.shadow||{};
  return {
    stroke:{enabled:stroke.enabled===true,color:color(stroke.color,defaults.stroke.color),width:between(stroke.width,1,30,defaults.stroke.width)},
    shadow:{enabled:shadow.enabled===true,color:color(shadow.color,defaults.shadow.color),opacity:between(shadow.opacity,0,100,defaults.shadow.opacity),blur:between(shadow.blur,0,80,defaults.shadow.blur),offsetX:between(shadow.offsetX,-100,100,defaults.shadow.offsetX),offsetY:between(shadow.offsetY,-100,100,defaults.shadow.offsetY)},
  };
}

const strokeCache=new WeakMap();
function strokeImage(drawable,width,height,stroke){
  let images=strokeCache.get(drawable);
  if(!images){images=new Map();strokeCache.set(drawable,images);}
  const key=`${width.toFixed(2)}:${height.toFixed(2)}:${stroke.width}:${stroke.color}`;
  if(images.has(key))return images.get(key);
  const padding=Math.ceil(stroke.width)+2;
  const canvas=document.createElement('canvas');
  canvas.width=Math.ceil(width+padding*2);canvas.height=Math.ceil(height+padding*2);
  const ctx=canvas.getContext('2d');
  const count=Math.min(96,Math.max(20,Math.ceil(stroke.width*6)));
  for(let index=0;index<count;index++){
    const angle=index/count*Math.PI*2;
    ctx.drawImage(drawable,padding+Math.cos(angle)*stroke.width,padding+Math.sin(angle)*stroke.width,width,height);
  }
  ctx.globalCompositeOperation='source-in';ctx.fillStyle=stroke.color;ctx.fillRect(0,0,canvas.width,canvas.height);
  const result={canvas,padding};images.set(key,result);
  if(images.size>8)images.delete(images.keys().next().value);
  return result;
}

function rgba(hex,opacity){
  const number=Number.parseInt(hex.slice(1),16);
  return `rgba(${number>>16&255},${number>>8&255},${number&255},${opacity/100})`;
}

export function drawElementWithEffects(ctx,drawable,rect,input,{fallbackShadow=null,flipX=false}={}){
  const effects=normalizeElementEffects(input);
  const shadow=effects.shadow.enabled?effects.shadow:fallbackShadow;
  ctx.save();
  if(flipX){ctx.translate(rect.x*2+rect.width,0);ctx.scale(-1,1);}
  if(shadow){
    ctx.shadowColor=rgba(shadow.color,shadow.opacity);
    ctx.shadowBlur=shadow.blur;
    ctx.shadowOffsetX=shadow.offsetX;
    ctx.shadowOffsetY=shadow.offsetY;
    ctx.drawImage(drawable,rect.x,rect.y,rect.width,rect.height);
    ctx.shadowColor='transparent';ctx.shadowBlur=0;ctx.shadowOffsetX=0;ctx.shadowOffsetY=0;
  }
  if(effects.stroke.enabled){
    const outline=strokeImage(drawable,rect.width,rect.height,effects.stroke);
    ctx.drawImage(outline.canvas,rect.x-outline.padding,rect.y-outline.padding);
  }
  if(!shadow||effects.stroke.enabled)ctx.drawImage(drawable,rect.x,rect.y,rect.width,rect.height);
  ctx.restore();
}
