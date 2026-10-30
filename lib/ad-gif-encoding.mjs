import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import sharp from 'sharp';
import {localPython} from '../platform/local-compute.mjs';

const run=promisify(execFile);
const execution={windowsHide:true,timeout:180000,maxBuffer:1024*1024};

/** Split optimized endpoint holds into explicit 100 ms frames without redrawing. */
export function expandAdGifHolds(input){
  const data=Buffer.from(input),chunks=[];
  if(!/^GIF8[79]a$/.test(data.subarray(0,6).toString('ascii'))||data.length<14)throw Error('GIF 数据不完整');
  const palette=packed=>(packed&128)?3*(1<<((packed&7)+1)):0;
  let pos=13+palette(data[10]),start=0,held=0,ended=false;
  const skipBlocks=offset=>{
    while(offset<data.length){const length=data[offset++];if(!length)return offset;offset+=length;}
    throw Error('GIF 数据块不完整');
  };
  while(pos<data.length){
    if(data[pos]===0x3b){chunks.push(data.subarray(start));ended=true;break;}
    if(data[pos]===0x21){
      if(data[pos+1]===0xf9){
        if(data[pos+2]!==4||pos+7>=data.length)throw Error('GIF 时序损坏');
        const delay=data.readUInt16LE(pos+4),disposal=(data[pos+3]>>2)&7;
        if(delay<10||delay%10||disposal>1)throw Error('GIF 无法保留缩放停顿时序');
        held=delay/10-1;data.writeUInt16LE(10,pos+4);
      }
      pos=skipBlocks(pos+2);continue;
    }
    if(data[pos]!==0x2c||pos+9>=data.length)throw Error('GIF 图像块损坏');
    pos+=10+palette(data[pos+9]);pos=skipBlocks(pos+1);
    chunks.push(data.subarray(start,pos));
    // A transparent one-pixel frame holds the composited canvas unchanged.
    for(let index=0;index<held;index++)chunks.push(Buffer.from('21f904050a0000002c0000000001000100000202440100','hex'));
    held=0;start=pos;
  }
  if(!ended)throw Error('GIF 数据未结束');
  return Buffer.concat(chunks);
}

// 把一组 PNG 帧编成 GIF（全局调色板，按帧差裁剪）。原来用 ffmpeg，现在在使用者的浏览器里用 Pillow 编码。
export async function encodeFramesGif({root,framesDir,frames,fps,colors,dither='none',output}){
  await localPython([path.join(root,'scripts','encode-frames-gif.py'),'--frames',framesDir,'--count',String(frames),'--fps',String(fps),'--colors',String(colors),'--dither',dither,'--output',output],{timeout:180000});
}

async function optimizer(root){
  for(const candidate of [process.env.GIFSICLE,path.join(root,'data/tools/gifsicle/gifsicle.exe'),path.join(root,'data/runtime/tools/gifsicle/gifsicle.exe')].filter(Boolean)){
    try{await fs.access(candidate);return candidate;}catch{}
  }
  return null;
}

export async function encodeAdZoomGif({root,ffmpeg,framesDir,workDir,spec,preparation}){
  return encodeAdFrameSequence({root,ffmpeg,framesDir,workDir,spec,preparation,fullScene:false});
}

export async function encodeAdFullSceneGif({root,ffmpeg,framesDir,workDir,spec,preparation}){
  return encodeAdFrameSequence({root,ffmpeg,framesDir,workDir,spec,preparation,fullScene:true});
}

async function encodeAdFrameSequence({root,ffmpeg,framesDir,workDir,spec,preparation,fullScene}){
  const gifsicle=await optimizer(root),attempts=[],limit=spec.maxBytes||700*1024;
  const label=fullScene?'完整场景':'整图缩放',prefix=fullScene?'full-scene':'zoom';
  for(const colors of (fullScene?[256,192,128,96,64]:[192,128,96,64,32,16])){
    const file=path.join(workDir,`${prefix}-${colors}.gif`);
    await encodeFramesGif({root,framesDir,frames:10,fps:10,colors,dither:'none',output:file});
    for(const lossy of gifsicle?[0,40,80]:[0]){
      let encoded=await fs.readFile(file);
      if(lossy||(fullScene&&gifsicle)){
        const optimized=path.join(workDir,`${prefix}-${colors}-${lossy}.gif`);
        await run(gifsicle,['-O3',...(lossy?[`--lossy=${lossy}`]:[]),file,'-o',optimized],execution);
        encoded=await fs.readFile(optimized);
      }
      const buffer=expandAdGifHolds(encoded),meta=await sharp(buffer,{animated:true}).metadata();
      const durationMs=meta.delay?.reduce((sum,value)=>sum+value,0);
      const accepted=buffer.length<limit&&meta.width===spec.width&&meta.pageHeight===spec.height&&meta.pages===10&&durationMs===1000&&meta.delay.every(value=>value===100)&&meta.loop===0;
      const attempt={colors,lossy,bytes:buffer.length,frames:meta.pages,durationMs,accepted};attempts.push(attempt);
      const report={...preparation,attempts,accepted};
      await fs.writeFile(path.join(workDir,'gif-quality.json'),JSON.stringify(report,null,2));
      if(!accepted)continue;
      const first=await sharp(buffer,{page:0}).removeAlpha().raw().toBuffer(),peak=await sharp(buffer,{page:5}).removeAlpha().raw().toBuffer();
      let visible=0;
      for(let pixel=0;pixel<spec.width*spec.height;pixel++){const p=pixel*3;if(Math.max(...[0,1,2].map(c=>Math.abs(first[p+c]-peak[p+c])))>12)visible++;}
      if(visible<Math.max(24,spec.width*spec.height*(fullScene?.0005:.02)))throw Error(`${label}编码后的变化不足`);
      await fs.writeFile(path.join(workDir,'accepted.gif'),buffer);
      return {buffer,motion:{...report,frames:10,durationMs:1000,bytes:buffer.length,colors,lossy,visiblyChangedPixels:visible,provider:'微光画布',model:'kling_v3'}};
    }
  }
  throw Error(`${label}未达到 GIF 文件大小限制；原视频已保留，可重试转换`);
}
