import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {reflowPortraitMenu} from '../lib/ad-portrait-menu.mjs';

test('portrait menu reflows all 24 source panels into a 3 by 8 grid',async()=>{
  const source=await sharp({create:{width:1280,height:720,channels:3,background:'#fff3d7'}}).png().toBuffer();
  const columns=[
    [[105,283],[285,462],[472,637],[650,830],[839,990],[995,1183]],
    [[105,283],[285,462],[470,637],[645,812],[815,990],[995,1183]],
    [[100,283],[285,462],[470,637],[640,813],[825,990],[995,1183]],
    [[105,283],[285,462],[465,637],[645,813],[825,990],[995,1183]]
  ];
  const rows=[[84,207],[229,355],[363,489],[497,632]];
  const colors=Array.from({length:24},(_,index)=>[40+index*7,50+index*5,220-index*7]);
  const blocks=colors.map(([red,green,blue],index)=>{
    const [x0,x1]=columns[Math.floor(index/6)][index%6],[y0,y1]=rows[Math.floor(index/6)];
    return `<rect x="${x0+4}" y="${y0+4}" width="${x1-x0-8}" height="${y1-y0-8}" fill="rgb(${red},${green},${blue})"/>`;
  });
  const marked=await sharp(source).composite([{input:Buffer.from(`<svg width="1280" height="720">${blocks.join('')}</svg>`)}]).png().toBuffer();
  const output=await reflowPortraitMenu(marked),meta=await sharp(output).metadata();
  assert.equal(meta.width,1080);assert.equal(meta.height,1920);
  for(let index=0;index<24;index++){
    const column=index%3,row=Math.floor(index/3),x=72+column*313+149,y=248+row*199+92;
    const pixel=await sharp(output).extract({left:x,top:y,width:1,height:1}).removeAlpha().raw().toBuffer();
    assert.deepEqual([...pixel],colors[index],`source panel ${index+1} was lost or reordered`);
  }
  await assert.rejects(reflowPortraitMenu(await sharp(source).resize(640,400).png().toBuffer()),/1280×720/);
});
