import sharp from 'sharp';

async function palette(buffer){
  const pixels=await sharp(buffer).resize(160,160,{fit:'fill'}).flatten({background:'#fff'}).removeAlpha().raw().toBuffer();
  const violet=[];
  for(let i=0;i<pixels.length;i+=3){
    const r=pixels[i]/255,g=pixels[i+1]/255,b=pixels[i+2]/255,max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;
    if(max<.45||!d||d/max<.25)continue;
    let hue=max===r?60*((g-b)/d%6):max===g?60*((b-r)/d+2):60*((r-g)/d+4);if(hue<0)hue+=360;
    if(hue>=215&&hue<=300)violet.push(hue);
  }
  violet.sort((a,b)=>a-b);
  return {share:violet.length/(pixels.length/3),hue:violet.length?violet[Math.floor(violet.length/2)]:null};
}

// Conditional palette comparison tolerates different amounts of background and
// differently sized figures. It catches a blue garment being repainted purple
// without equating a new composition with an overall colour change.
export async function assessAdAiPalette(reference,candidate){
  const [a,b]=await Promise.all([palette(reference),palette(candidate)]);
  const checked=a.share>=.015&&b.share>=.015;
  const violetHueShift=checked?Math.abs(a.hue-b.hue):null;
  return {method:'original-violet-palette-check-v1',checked,consistent:!checked||violetHueShift<=8,reference:a,candidate:b,violetHueShift};
}
