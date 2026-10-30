import sharp from 'sharp';

export const portraitMenuMethod='menu-cards-v2';

const columns=[
  [[105,283],[285,462],[472,637],[650,830],[839,990],[995,1183]],
  [[105,283],[285,462],[470,637],[645,812],[815,990],[995,1183]],
  [[100,283],[285,462],[470,637],[640,813],[825,990],[995,1183]],
  [[105,283],[285,462],[465,637],[645,813],[825,990],[995,1183]]
];
const rows=[[84,207],[229,355],[363,489],[497,632]];

// The PSD is flattened, so keep each original name-and-illustration pair intact.
// Reflow its 24 pairs into a 3-column vertical catalogue rather than asking an
// image model to redraw Chinese text or invent replacement dishes.
export async function reflowPortraitMenu(sourceBuffer){
  const source=await sharp(sourceBuffer).metadata();
  if(source.width!==1280||source.height!==720)throw Error('竖版菜单重排需要 1280×720 原稿');
  const width=1080,height=1920;
  const background=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><defs><linearGradient id="wood" x2="1" y2="1"><stop stop-color="#a96335"/><stop offset=".42" stop-color="#784329"/><stop offset="1" stop-color="#b77b49"/></linearGradient><radialGradient id="paper"><stop stop-color="#fff1d4"/><stop offset="1" stop-color="#f8dbad"/></radialGradient></defs><rect width="1080" height="1920" fill="url(#wood)"/><rect x="19" y="17" width="1042" height="1886" rx="46" fill="#c99054" stroke="#63351f" stroke-width="11"/><rect x="36" y="34" width="1008" height="1852" rx="35" fill="url(#paper)" stroke="#ffe2aa" stroke-width="7"/><path d="M67 222 H1013 M67 1860 H1013" fill="none" stroke="#cc995a" stroke-width="5"/><path d="M85 230 H995 M85 1852 H995" fill="none" stroke="#fff0cd" stroke-width="2"/></svg>`);
  const overlays=[];
  for(let index=0;index<24;index++){
    const column=index%3,row=Math.floor(index/3),x=72+column*313,y=248+row*199;
    overlays.push({input:Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="298" height="184"><rect x="1" y="1" width="296" height="182" rx="17" fill="#ffeac6" stroke="#d3a56a" stroke-width="3"/><rect x="8" y="8" width="282" height="168" rx="12" fill="#ffeed0" stroke="#f8d8a4" stroke-width="2"/></svg>`),left:x,top:y});
    const sourceColumn=index%6,sourceRow=Math.floor(index/6),[x0,x1]=columns[sourceRow][sourceColumn],[y0,y1]=rows[sourceRow];
    let tileSource=sharp(sourceBuffer).extract({left:x0,top:y0,width:x1-x0,height:y1-y0});
    if(index===18){
      const {data,info}=await tileSource.ensureAlpha().raw().toBuffer({resolveWithObject:true});
      for(let maskY=86;maskY<info.height;maskY++){
        const edge=Math.min(65,Math.max(0,Math.ceil((maskY-86)*1.34)));
        const sample=(maskY*info.width+Math.min(info.width-1,edge+6))*info.channels;
        for(let maskX=0;maskX<edge;maskX++){
          const pixel=(maskY*info.width+maskX)*info.channels;
          for(let channel=0;channel<3;channel++)data[pixel+channel]=data[sample+channel];
        }
      }
      tileSource=sharp(data,{raw:{width:info.width,height:info.height,channels:info.channels}});
    }
    const tile=await tileSource.resize(272,160,{fit:'contain',background:'#00000000'}).png().toBuffer();
    overlays.push({input:tile,left:x+13,top:y+12});
  }
  return sharp(background).composite(overlays).png().toBuffer();
}
