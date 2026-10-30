import sharp from 'sharp';

export function channelOutpaintGaps(sourceWidth,sourceHeight,targetWidth,targetHeight,occupancy=80){
  const fraction=Math.max(.55,Math.min(.95,Number(occupancy)/100||.8));
  const fit=Math.min(targetWidth/sourceWidth,targetHeight/sourceHeight)*fraction;
  const expandedWidth=Math.ceil(targetWidth/fit);
  const expandedHeight=Math.ceil(targetHeight/fit);
  const left=Math.floor((expandedWidth-sourceWidth)/2);
  const top=Math.floor((expandedHeight-sourceHeight)/2);
  return {left,top,right:expandedWidth-sourceWidth-left,bottom:expandedHeight-sourceHeight-top,width:expandedWidth,height:expandedHeight};
}

export function normalizeChannelDraft(input,item,allowedImageUrls){
  const allowed=new Set(allowedImageUrls);
  const backgroundUrl=String(input?.backgroundUrl||'');
  if(backgroundUrl&&!allowed.has(backgroundUrl))throw Object.assign(new Error('背景图不属于当前交付稿'),{status:422});
  const layers=Array.isArray(input?.layers)?input.layers:[];
  if(layers.length>30)throw Object.assign(new Error('图层不能超过 30 个'),{status:422});
  const clean=layers.map((layer,index)=>{
    const type=layer?.type==='image'?'image':'text';
    const name=String(layer?.name||`${type==='text'?'文字':'图片'} ${index+1}`).trim().slice(0,60);
    const numeric=(value,min,max,fallback)=>{const n=Number(value);return Number.isFinite(n)?Math.max(min,Math.min(max,n)):fallback;};
    const base={id:String(layer?.id||`layer-${index}`).replace(/[^a-zA-Z0-9_-]/g,'').slice(0,80),type,name,
      x:numeric(layer?.x,-item.width,item.width*2,100),y:numeric(layer?.y,-item.height,item.height*2,100),
      width:numeric(layer?.width,20,item.width*2,Math.min(600,item.width)),visible:layer?.visible!==false};
    if(type==='image'){
      const url=String(layer?.url||'');if(!allowed.has(url))throw Object.assign(new Error('图片图层不属于当前交付稿'),{status:422});
      return {...base,url};
    }
    return {...base,text:String(layer?.text||'').slice(0,500),fontSize:numeric(layer?.fontSize,8,600,64),
      color:/^#[0-9a-f]{6}$/i.test(layer?.color||'')?layer.color:'#ffffff',
      stroke:/^#[0-9a-f]{6}$/i.test(layer?.stroke||'')?layer.stroke:'#503025',
      strokeWidth:numeric(layer?.strokeWidth,0,30,0),shadow:layer?.shadow!==false,
      stylePreset:layer?.stylePreset==='gold-title'?'gold-title':'plain',
      fontFamily:['Microsoft YaHei','SimHei','KaiTi','SimSun'].includes(layer?.fontFamily)?layer.fontFamily:'Microsoft YaHei'};
  });
  return {backgroundUrl,layers:clean,targetText:String(input?.targetText||'').slice(0,80),
    occupancy:Math.max(60,Math.min(95,Number(input?.occupancy)||80)),
    outpaintPrompt:String(input?.outpaintPrompt||'').slice(0,500),updatedAt:new Date().toISOString()};
}

// Banana may ignore a requested transparent background. Only expose a movable
// layer when the border is chroma green or neutral white; otherwise keep the raw preview.
export async function extractChromaTypography(buffer){
  const {data,info}=await sharp(buffer).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const {width,height,channels}=info;
  if(width*height>18_000_000)throw new Error('文案候选图片过大');
  let border=0,green=0,white=0;
  const isGreen=(r,g,b)=>g>115&&g>r*1.42&&g>b*1.3;
  const isWhite=(r,g,b)=>r>232&&g>232&&b>232&&Math.max(r,g,b)-Math.min(r,g,b)<28;
  const isSpill=(r,g,b)=>g>r+8&&g>b+8;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    if(x>3&&x<width-4&&y>3&&y<height-4)continue;
    border++;const i=(y*width+x)*channels;if(isGreen(data[i],data[i+1],data[i+2]))green++;if(isWhite(data[i],data[i+1],data[i+2]))white++;
  }
  const useGreen=green/Math.max(1,border)>=.8,useWhite=white/Math.max(1,border)>=.8;
  if(!useGreen&&!useWhite)return {buffer:null,reason:'模型未输出可安全提取的纯色背景；已保留原始候选，可用准确文字重绘'};
  if(useWhite){
    // Chroma-colored edges inside enclosed counters are also background seeds.
    // White highlights enclosed by gold strokes (without chroma) remain opaque.
    const visited=new Uint8Array(width*height),queue=new Int32Array(width*height);let head=0,tail=0;
    const add=(x,y)=>{if(x<0||y<0||x>=width||y>=height)return;const pos=y*width+x;if(visited[pos])return;visited[pos]=1;const i=pos*channels;if(isWhite(data[i],data[i+1],data[i+2])||isSpill(data[i],data[i+1],data[i+2]))queue[tail++]=pos;};
    for(let x=0;x<width;x++){add(x,0);add(x,height-1)}for(let y=0;y<height;y++){add(0,y);add(width-1,y)}
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=(y*width+x)*channels;if(isSpill(data[i],data[i+1],data[i+2]))add(x,y);}
    while(head<tail){const pos=queue[head++],x=pos%width,y=Math.floor(pos/width);data[pos*channels+3]=0;add(x-1,y);add(x+1,y);add(x,y-1);add(x,y+1)}
  }
  // Models sometimes paint green spill around letters and faint unrelated
  // fragments above the title. Keep only rows belonging to the dense title.
  const rows=new Int32Array(height);let peak=0;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=(y*width+x)*channels;
    if(isGreen(data[i],data[i+1],data[i+2])||isSpill(data[i],data[i+1],data[i+2]))data[i+3]=0;
    if(data[i+3]>20)rows[y]++;
  }
  for(const count of rows)peak=Math.max(peak,count);
  const denseThreshold=Math.max(24,Math.round(peak*.18));
  let bandTop=height,bandBottom=-1;
  for(let y=0;y<height;y++)if(rows[y]>=denseThreshold){bandTop=Math.min(bandTop,y);bandBottom=Math.max(bandBottom,y)}
  if(bandBottom>=bandTop){const bandPadding=Math.max(24,Math.round(height*.06));bandTop=Math.max(0,bandTop-bandPadding);bandBottom=Math.min(height-1,bandBottom+bandPadding);
    for(let y=0;y<bandTop;y++)for(let x=0;x<width;x++)data[(y*width+x)*channels+3]=0;
    for(let y=bandBottom+1;y<height;y++)for(let x=0;x<width;x++)data[(y*width+x)*channels+3]=0;
  }
  let x0=width,y0=height,x1=-1,y1=-1;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=(y*width+x)*channels;
    if(useGreen&&isGreen(data[i],data[i+1],data[i+2])){data[i+3]=0;continue;}
    if(data[i+3]<20)continue;
    x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);
  }
  if(x1<x0||y1<y0)return {buffer:null,reason:'文案候选没有可提取的文字区域'};
  const pad=12,left=Math.max(0,x0-pad),top=Math.max(0,y0-pad);
  const result=await sharp(data,{raw:{width,height,channels}})
    .extract({left,top,width:Math.min(width-left,x1-left+pad+1),height:Math.min(height-top,y1-top+pad+1)})
    .png().toBuffer();
  return {buffer:result,reason:null,crop:{left,top}};
}

async function channelPsnr(original,candidate){
  const a=await sharp(original).removeAlpha().raw().toBuffer();
  const b=await sharp(candidate).removeAlpha().raw().toBuffer();
  if(a.length!==b.length)return 0;
  let square=0;for(let i=0;i<a.length;i++){const difference=a[i]-b[i];square+=difference*difference;}
  const mse=square/a.length;return mse===0?Infinity:10*Math.log10(255*255/mse);
}

export async function optimizeChannelCandidate(buffer,{format,maxBytes}){
  if(!maxBytes||buffer.length<maxBytes)return buffer;
  const png=/png/i.test(format);
  if(png){
    const lossless=await sharp(buffer).png({compressionLevel:9,effort:10}).toBuffer();
    if(lossless.length<maxBytes)return lossless;
    for(const quality of [100,98,95]){
      const candidate=await sharp(buffer).png({palette:true,quality,colors:256,effort:10,dither:.9}).toBuffer();
      if(candidate.length<maxBytes&&await channelPsnr(buffer,candidate)>=36)return candidate;
    }
  }else{
    for(const quality of [94,90,86,82,78,74,70]){
      const candidate=await sharp(buffer).jpeg({quality,mozjpeg:true}).toBuffer();
      if(candidate.length<maxBytes&&await channelPsnr(buffer,candidate)>=34)return candidate;
    }
  }
  throw Object.assign(new Error('在保持清晰度的前提下无法满足文件体积限制，请调整画面后重试'),{status:422});
}
