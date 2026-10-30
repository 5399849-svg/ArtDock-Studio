import sharp from 'sharp';

const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const smooth=value=>{const t=clamp(value,0,1);return t*t*(3-2*t)};
const oval=(x,y,cx,cy,rx,ry)=>1-smooth((Math.hypot((x-cx)/rx,(y-cy)/ry)-.58)/.42);

// A scene-specific, feathered displacement field. It follows the painted silk,
// butterflies and foreground flowers while leaving the woman and buildings still.
export async function renderDreamFlowerFrame(source,width,height,frame,total=20){
  const {data,info}=await sharp(source).removeAlpha().raw().toBuffer({resolveWithObject:true});
  const output=Buffer.allocUnsafe(data.length),phase=frame*2*Math.PI/total;
  const sample=(x,y,channel)=>{
    const px=clamp(x,0,width-1),py=clamp(y,0,height-1);
    const x0=Math.floor(px),y0=Math.floor(py),x1=Math.min(width-1,x0+1),y1=Math.min(height-1,y0+1),fx=px-x0,fy=py-y0;
    const a=data[(y0*width+x0)*info.channels+channel],b=data[(y0*width+x1)*info.channels+channel];
    const c=data[(y1*width+x0)*info.channels+channel],d=data[(y1*width+x1)*info.channels+channel];
    return Math.round((a+(b-a)*fx)*(1-fy)+(c+(d-c)*fx)*fy);
  };
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const silk=oval(x,y,width*.76,height*.70,width*.39,height*.33);
    const lowerFlowers=oval(x,y,width*.77,height*.89,width*.32,height*.20);
    const butterflies=[
      [.624,.555,.065,.085,0], [.518,.711,.065,.08,1.1],
      [.906,.507,.06,.095,2.1], [.912,.172,.065,.10,3.2]
    ];
    let dx=(silk*6.2+lowerFlowers*2.4)*Math.sin(phase+y*.021),dy=(silk*4.5+lowerFlowers*2.4)*Math.cos(phase+x*.018);
    for(const [cx,cy,rx,ry,delay] of butterflies){
      const weight=oval(x,y,width*cx,height*cy,width*rx,height*ry);
      dx+=weight*7*Math.sin(phase+delay);
      dy+=weight*4.5*Math.cos(phase+delay);
    }
    // The displacement fades across subject and canvas boundaries.
    const subject=smooth((x-width*.40)/(width*.10));
    const edge=smooth(x/12)*smooth((width-1-x)/12)*smooth(y/12)*smooth((height-1-y)/12);
    dx*=subject*edge;dy*=subject*edge;
    const index=(y*width+x)*info.channels;
    for(let c=0;c<info.channels;c++)output[index+c]=sample(x-dx,y-dy,c);
  }
  const glow=.10+.08*(1+Math.sin(phase-.8))/2;
  const glints=[[.55,.24,0],[.69,.57,1.4],[.84,.71,2.4],[.57,.81,3.6]];
  const sparks=glints.map(([px,py,delay])=>{
    const pulse=Math.max(0,Math.sin(phase+delay)),x=Math.round(px*width),y=Math.round(py*height);
    return `<circle cx="${x}" cy="${y}" r="${(1.2+2*pulse).toFixed(1)}" fill="#fff8ef" opacity="${(.10+.65*pulse).toFixed(2)}"/>`;
  }).join('');
  const overlay=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><defs><radialGradient id="moon"><stop stop-color="#fffbdc" stop-opacity="${glow.toFixed(3)}"/><stop offset="1" stop-color="#fffbdc" stop-opacity="0"/></radialGradient></defs><ellipse cx="${Math.round(width*.70)}" cy="${Math.round(height*.22)}" rx="${Math.round(width*.17)}" ry="${Math.round(height*.24)}" fill="url(#moon)"/>${sparks}</svg>`);
  return sharp(output,{raw:{width,height,channels:info.channels}}).composite([{input:overlay}]).png().toBuffer();
}
