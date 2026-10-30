import sharp from 'sharp';

const medianOf=values=>{
  const ordered=[...values].sort((a,b)=>a-b);
  return ordered[Math.floor(ordered.length/2)];
};

// Measure the paper itself, rather than the PNG bounds. A robust centerline
// ignores isolated folds, rope and accent marks without inventing a tilt.
function measureBodyCenterline(isBody,width,height){
  const samples=[];
  for(let x=Math.round(width*.2);x<=width*.82;x+=Math.max(2,Math.round(width/100))){
    let start=-1,best=null;
    for(let y=0;y<=height;y++){
      if(y<height&&isBody(x,y)){
        if(start<0)start=y;
      }else if(start>=0){
        if(!best||y-start>best.bottom-best.top)best={x,top:start,bottom:y-1};
        start=-1;
      }
    }
    if(best&&best.bottom-best.top>=height*.15)samples.push({...best,mid:(best.top+best.bottom)/2});
  }
  if(samples.length<8)return null;
  const thickness=medianOf(samples.map(point=>point.bottom-point.top));
  const body=samples.filter(point=>point.bottom-point.top>=thickness*.65&&point.bottom-point.top<=thickness*1.5);
  const slopes=[];
  for(let i=0;i<body.length;i++)for(let j=i+1;j<body.length;j++){
    const span=body[j].x-body[i].x;
    if(span>=width*.12)slopes.push((body[j].mid-body[i].mid)/span);
  }
  if(slopes.length<8)return null;
  let slope=medianOf(slopes);
  let intercept=medianOf(body.map(point=>point.mid-slope*point.x));
  const residuals=body.map(point=>Math.abs(point.mid-slope*point.x-intercept));
  const tolerance=Math.max(2,height*.035);
  if(residuals.filter(value=>value<=tolerance).length<body.length*.7)return null;
  let rotation=Math.atan(slope)*180/Math.PI;
  if(Math.abs(rotation)>20)return null;
  if(Math.abs(rotation)<.35){slope=0;rotation=0;intercept=medianOf(body.map(point=>point.mid));}
  // Keep a conservative perpendicular thickness. The lower tenth percentile
  // avoids folds shrinking the text for one pixel while protecting its ends.
  const halfHeights=body.map(point=>Math.min(slope*point.x+intercept-point.top,point.bottom-slope*point.x-intercept)).sort((a,b)=>a-b);
  const halfHeight=halfHeights[Math.floor(halfHeights.length*.1)]*Math.cos(rotation*Math.PI/180);
  if(!Number.isFinite(halfHeight)||halfHeight<height*.06)return null;
  return {slope,intercept,rotation:Math.round(rotation*1000)/1000,height:halfHeight*2*.76};
}

// The text-bearing body is not the full PNG: knots, points and glow can make
// the image bounds asymmetric. Estimate a solid central paper/body rectangle.
export async function measureBannerBackingContent(buffer){
  const {data,info}=await sharp(buffer).resize({width:512,withoutEnlargement:true}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const colors=[[],[],[]];
  for(let y=Math.floor(info.height*.4);y<info.height*.6;y++)for(let x=Math.floor(info.width*.4);x<info.width*.6;x++){
    const i=(y*info.width+x)*4;if(data[i+3]<220)continue;
    for(let c=0;c<3;c++)colors[c].push(data[i+c]);
  }
  if(!colors[0].length)return {x:.14,y:.28,width:.72,height:.44,method:'conservative-inset'};
  const median=colors.map(a=>a.sort((a,b)=>a-b)[Math.floor(a.length/2)]);
  const isBody=(x,y)=>{const i=(y*info.width+x)*4;return data[i+3]>=225 && Math.hypot(data[i]-median[0],data[i+1]-median[1],data[i+2]-median[2])<115;};
  const cx=Math.floor(info.width/2),cy=Math.floor(info.height/2);
  const rowSolid=y=>{let n=0;const a=Math.floor(info.width*.3),b=Math.ceil(info.width*.7);for(let x=a;x<b;x++)if(isBody(x,y))n++;return n/(b-a)>.92;};
  let top=cy,bottom=cy;while(top>0 && rowSolid(top-1))top--;while(bottom<info.height-1 && rowSolid(bottom+1))bottom++;
  const colSolid=x=>{let n=0;const a=Math.round(top+(bottom-top)*.25),b=Math.max(a+1,Math.round(bottom-(bottom-top)*.25));for(let y=a;y<b;y++)if(isBody(x,y))n++;return n/(b-a)>.88;};
  let left=cx,right=cx;while(left>0&&colSolid(left-1))left--;while(right<info.width-1&&colSolid(right+1))right++;
  if((right-left)<info.width*.45 || bottom-top<info.height*.15)return {x:.14,y:.28,width:.72,height:.44,method:'conservative-inset'};
  const insetX=(right-left)*.045,insetY=(bottom-top)*.12;
  const content={x:(left+insetX)/info.width,y:(top+insetY)/info.height,width:(right-left-insetX*2)/info.width,height:(bottom-top-insetY*2)/info.height,method:'central-solid-body-v1'};
  const line=measureBodyCenterline((x,y)=>{const i=(y*info.width+x)*4;return data[i+3]>=225&&Math.hypot(data[i]-median[0],data[i+1]-median[1],data[i+2]-median[2])<85;},info.width,info.height);
  if(!line)return content;
  const contentHeight=Math.min(content.height*info.height,line.height);
  const centerY=line.slope*(content.x+content.width/2)*info.width+line.intercept;
  return {...content,y:(centerY-contentHeight/2)/info.height,height:contentHeight/info.height,rotation:line.rotation,sourceAspect:info.width/info.height,method:'central-solid-body-v2'};
}

export function centerSubtitleInBacking(subtitle,backing,content){
  const body=content || {x:.12,y:.25,width:.76,height:.5};
  const result={...subtitle,x:backing.x+backing.width*body.x,y:backing.y+backing.height*body.y,width:backing.width*body.width,height:backing.height*body.height,align:'center',verticalAlign:'middle',backingAligned:true};
  if(Number.isFinite(body.rotation)){
    result.fitMode='ink';
    const aspectScale=Number.isFinite(body.sourceAspect)&&body.sourceAspect>0&&backing.width>0&&backing.height>0?body.sourceAspect*backing.height/backing.width:1;
    result.rotation=aspectScale===1?body.rotation:Math.atan(Math.tan(body.rotation*Math.PI/180)*aspectScale)*180/Math.PI;
  }
  return result;
}

export function fitBannerBackingArtwork(rect,image,template){
  const ratio=image.width/image.height;
  if(!Number.isFinite(ratio)||ratio<=0)return {...rect};
  let width=rect.width,height=width/ratio;
  const maxHeight=Math.min(template.height*.26,template.height*.96-rect.y);
  if(height>maxHeight){const factor=Math.max(.1,maxHeight)/height;width*=factor;height*=factor;}
  const centerX=rect.x+rect.width/2;
  return {...rect,x:Math.max(0,Math.min(template.width-width,centerX-width/2)),width,height,scaleBaseWidth:width,scaleBaseHeight:height};
}
