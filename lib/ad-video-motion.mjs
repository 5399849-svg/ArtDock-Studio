import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import sharp from 'sharp';
import {encodeAdZoomGif,encodeAdFullSceneGif,encodeFramesGif} from './ad-gif-encoding.mjs';
import {localPython} from '../platform/local-compute.mjs';

export const AD_DEFAULT_MOTION_STYLE='full-scene';
export const AD_MOTION_RENDER_REVISION='full-scene-native-type-v1';

const run=promisify(execFile);
const execution={windowsHide:true,timeout:180000,maxBuffer:4*1024*1024,env:{...process.env,PYTHONIOENCODING:'utf-8'}};
const qcError=message=>Object.assign(new Error(message),{code:'AD_MOTION_QC'});

export function setAdGifDelays(buffer,frames=32,durationMs=4000){
  if(!Number.isInteger(frames)||frames<1||!Number.isInteger(durationMs)||durationMs%10||durationMs<frames*10)throw Error('GIF 时序参数无效');
  const result=Buffer.from(buffer);
  if(!/^GIF8[79]a$/.test(result.subarray(0,6).toString('ascii')))throw Error('视频编码未返回 GIF');
  const palette=packed=>3*(2**((packed&7)+1));
  let offset=13+((result[10]&128)?palette(result[10]):0);
  const positions=[];
  const skip=()=>{while(offset<result.length){const length=result[offset++];if(!length)return;offset+=length}throw Error('GIF 数据不完整')};
  while(offset<result.length){
    const marker=result[offset++];if(marker===0x3b)break;
    if(marker===0x21){const label=result[offset++];if(label===0xf9){if(result[offset]!==4)throw Error('GIF 时序损坏');positions.push(offset+2)}skip()}
    else if(marker===0x2c){const packed=result[offset+8];offset+=9+((packed&128)?palette(packed):0);offset++;skip()}
    else throw Error('GIF 数据块损坏');
  }
  if(positions.length!==frames)throw Error(`GIF 帧数不符：${positions.length}/${frames}`);
  positions.forEach((position,index)=>{
    const centiseconds=durationMs/10,start=Math.floor(index*centiseconds/frames),end=Math.floor((index+1)*centiseconds/frames);
    result.writeUInt16LE(end-start,position);
  });
  return result;
}

/** Preserve scene-appropriate Kling motion without forcing whole-image zoom.
 * Local files/diagnostics stay beside the provider receipt for fee-free re-encoding.
 */
export async function convertAdVideoToGif({root,videoBuffer,sourceBuffer,spec,workDir,motionOptions={},overlayBuffer}){
  await fs.mkdir(workDir,{recursive:true});
  const still=path.join(workDir,'source.png'),video=path.join(workDir,'motion.mp4');
  const frames=path.join(workDir,'frames');await fs.mkdir(frames,{recursive:true});
  await sharp(sourceBuffer).resize(spec.width,spec.height,{fit:'fill'}).png().toFile(still);
  await fs.writeFile(video,videoBuffer);
  // Windows OCR runs locally. It never uploads artwork or consumes model credit.
  let words=[];
  if(process.platform==='win32'&&(motionOptions.mode||AD_DEFAULT_MOTION_STYLE)!=='full-scene'){
    const ocrStill=path.join(workDir,'ocr-source.png');
    await sharp(sourceBuffer).resize(spec.width*2,spec.height*2,{fit:'fill'}).png().toFile(ocrStill);
    try{
      const {stdout}=await run('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(root,'scripts','ocr-ad-text.ps1'),'-ImagePath',ocrStill],execution);
      const ocr=JSON.parse(stdout.replace(/^\uFEFF/,''));
      words=(ocr.words||[]).map(word=>({...word,x:word.x/2,y:word.y/2,width:word.width/2,height:word.height/2}));
    }catch(error){throw Error(`本机文字保护识别失败，已保留可灵视频，可重试转码：${error.message.slice(0,150)}`)}
  }
  const options={mode:AD_DEFAULT_MOTION_STYLE,...motionOptions,safeInsetX:spec.safeInsetX||0,words};
  // Only an explicitly supplied native transparent layer may overlay full video.
  // Do not accept a file path from motionOptions or restore flat source regions.
  delete options.nativeOverlayFile;
  if(overlayBuffer){
    const overlay=await sharp(overlayBuffer).metadata();
    if(overlay.width!==spec.width||overlay.height!==spec.height||!overlay.hasAlpha)throw qcError('原生透明文案层必须匹配完整画布尺寸');
    options.nativeOverlayFile=path.join(workDir,'typography-overlay.png');
    await fs.writeFile(options.nativeOverlayFile,overlayBuffer);
  }
  const optionsFile=path.join(workDir,'prepare-options.json');await fs.writeFile(optionsFile,JSON.stringify(options));
  try{await localPython([path.join(root,'scripts','prepare-ad-video.py'),still,video,frames,optionsFile],execution)}
  catch(error){
    let report;try{report=JSON.parse(await fs.readFile(path.join(frames,'prepare-report.json'),'utf8'))}catch{}
    throw qcError(report?.error||`可灵视频处理失败：${String(error.stderr||error.message).slice(-300)}`);
  }
  const preparation=JSON.parse(await fs.readFile(path.join(frames,'prepare-report.json'),'utf8'));
  if(options.mode==='full-scene'){
    if(preparation.fullFrameVideo!==true||preparation.sourcePatchesApplied!==false)throw qcError('完整场景处理不允许拼贴原图保护区');
    return encodeAdFullSceneGif({root,framesDir:frames,workDir,spec,preparation});
  }
  if(options.mode==='whole-image-zoom'){
    if(preparation.motionStyle!=='whole-image-zoom'||preparation.rigidWholeImageScale!==true)throw qcError('整图缩放准备未完成，已保留视频');
    return encodeAdZoomGif({root,framesDir:frames,workDir,spec,preparation});
  }
  const protection=await sharp(path.join(frames,'protected-mask.png')).greyscale().raw().toBuffer();
  const attempts=[],limit=spec.maxBytes||700*1024,outputFrames=10,outputFps=10,outputDurationMs=1000;
  for(const colors of [256,192,128,96,64,48,32]){
    const file=path.join(workDir,`encoded-${colors}.gif`);
    await encodeFramesGif({root,framesDir:frames,frames:outputFrames,fps:outputFps,colors,dither:'bayer',output:file});
    const buffer=setAdGifDelays(await fs.readFile(file),outputFrames,outputDurationMs);
    const meta=await sharp(buffer,{animated:true}).metadata();
    const first=await sharp(buffer,{page:0}).removeAlpha().raw().toBuffer();
    let protectedChanges=0,motionChanges=0;
    for(let page=1;page<meta.pages;page++){
      const current=await sharp(buffer,{page}).removeAlpha().raw().toBuffer();let changed=0;
      for(let pixel=0;pixel<protection.length;pixel++){
        const pos=pixel*3,difference=Math.max(Math.abs(first[pos]-current[pos]),Math.abs(first[pos+1]-current[pos+1]),Math.abs(first[pos+2]-current[pos+2]));
        if(!difference)continue;
        if(protection[pixel]===255)protectedChanges++;
        else if(difference>2)changed++;
      }
      motionChanges=Math.max(motionChanges,changed);
    }
    const durationMs=meta.delay.reduce((sum,value)=>sum+value,0);
    const attempt={colors,bytes:buffer.length,frames:meta.pages,fps:outputFps,durationMs,protectedChanges,motionChanges};attempts.push(attempt);
    const accepted=buffer.length<limit&&meta.pages===outputFrames&&durationMs===outputDurationMs&&meta.delay.every(value=>value===100)&&meta.loop===0&&protectedChanges===0&&motionChanges>Math.max(12,spec.width*spec.height*.0002);
    const report={...preparation,attempts,accepted};await fs.writeFile(path.join(workDir,'gif-quality.json'),JSON.stringify(report,null,2));
    if(accepted){await fs.writeFile(path.join(workDir,'accepted.gif'),buffer);return {buffer,motion:{...report,frames:meta.pages,durationMs,bytes:buffer.length,colors,protectedChanges,motionChanges,provider:'微光画布',model:'kling_v3',method:preparation.method}}}
  }
  throw qcError('可灵视频未同时达到场景局部动效、主体文字稳定和文件大小要求；视频已保留，可重试转码或明确重新生成');
}
