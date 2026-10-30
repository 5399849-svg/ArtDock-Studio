import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readCompanyFontLibrary,readCompanyFontBytes,resolveCompanyFontFile} from './company-font-library.mjs';
import {localPython} from '../platform/local-compute.mjs';

const exec=promisify(execFile),fail=message=>{throw Object.assign(Error(message),{status:422});};
// Read the selected file's Unicode cmap. No OS/browser substitute may supply
// missing letters, since the resulting guide must represent this exact font.
export function missingCompanyFontCharacters(buffer,text,faceIndex=0){
 const range=(at,size)=>{if(at<0||at+size>buffer.length)throw Error('字体字符表损坏');};
 const u16=at=>{range(at,2);return buffer.readUInt16BE(at);},u32=at=>{range(at,4);return buffer.readUInt32BE(at);};
 const base=buffer.toString('ascii',0,4)==='ttcf'?u32(12+faceIndex*4):0,count=u16(base+4);let cmap;
 for(let i=0;i<count;i++){const at=base+12+i*16;range(at,16);if(buffer.toString('ascii',at,at+4)==='cmap')cmap=u32(at+8);}
 if(cmap===undefined)throw Error('字体缺少 Unicode 字符表');
 const tables=[];
 for(let i=0;i<u16(cmap+2);i++){const at=cmap+4+i*8,platform=u16(at),encoding=u16(at+2),offset=cmap+u32(at+4),format=u16(offset);if((platform===0||platform===3&&[1,10].includes(encoding))&&[4,12].includes(format))tables.push({offset,format});}
 const present=code=>tables.some(({offset:o,format})=>{
  if(format===12){let lo=0,hi=u32(o+12)-1;while(lo<=hi){const mid=(lo+hi)>>1,at=o+16+mid*12,start=u32(at),end=u32(at+4);if(code<start)hi=mid-1;else if(code>end)lo=mid+1;else return u32(at+8)+code-start!==0;}return false;}
  if(code>0xffff)return false;const segments=u16(o+6)/2,ends=o+14,starts=ends+segments*2+2,deltas=starts+segments*2,ranges=deltas+segments*2;
  for(let n=0;n<segments;n++){if(code>u16(ends+n*2))continue;if(code<u16(starts+n*2))return false;const delta=u16(deltas+n*2),offset=u16(ranges+n*2);if(!offset)return ((code+delta)&0xffff)!==0;const glyph=u16(ranges+n*2+offset+(code-u16(starts+n*2))*2);return glyph!==0&&((glyph+delta)&0xffff)!==0;}return false;
 });
 return [...new Set(Array.from(String(text)).filter(char=>!/[\s\u200b-\u200f\ufe00-\ufe0f]/u.test(char)&&!present(char.codePointAt(0))))];
}

async function renderCommunityFont(task,kind,{root=process.cwd(),python=path.join(root,'local-ai','.venv',process.platform==='win32'?'Scripts':'bin',process.platform==='win32'?'python.exe':'python'),mode='guide',color='#674025'}={}){
 const id=task.parameters?.communityMaterialFontIds?.[kind];if(kind==='illustration'||!id)return null;
 const library=await readCompanyFontLibrary({root}),selected=library.fonts.find(f=>f.id===id);if(!selected)fail('所选版权字体不可用，请重新选择');
 const {bytes,font}=await readCompanyFontBytes(id,{root}),text=String(kind==='title'?task.copy:task.parameters?.subtitleText||'').trim();
 if(!text||Array.from(text).length>200)fail('版权字文案需在 1–200 字之间');
 const missing=missingCompanyFontCharacters(bytes,text,font.faceIndex||0);if(missing.length)fail(`所选字体不含这些字：${missing.slice(0,16).join('')}，请更换字体`);
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'workbench-font-guide-'));
 try{
  const output=path.join(directory,'guide.png'),input=path.join(directory,'input.json');await fs.writeFile(input,JSON.stringify({fontFile:await resolveCompanyFontFile(id,{root}),faceIndex:font.faceIndex||0,text,output,mode,color}));
  try{await localPython([path.join(root,'scripts','render-community-font-guide.py'),input],{windowsHide:true,timeout:30000,maxBuffer:128000});}catch(error){throw Object.assign(Error('版权字体字形生成失败，请重试或更换字体'),{status:422,cause:error});}
  return {font:{id:selected.id,name:selected.name,family:selected.family,sha256:selected.sha256,faceIndex:selected.faceIndex,version:selected.version},guide:await fs.readFile(output)};
 }finally{if(path.dirname(directory)!==path.resolve(os.tmpdir())||!path.basename(directory).startsWith('workbench-font-guide-'))throw Error('字形临时目录无效');await fs.rm(directory,{recursive:true,force:true});}
}

export const prepareCommunityMaterialFont=(task,kind,options={})=>renderCommunityFont(task,kind,{...options,mode:'guide'});
export async function renderCommunityFontText(task,kind,options={}){
 const rendered=await renderCommunityFont(task,kind,{...options,mode:'typeset'});
 if(!rendered)fail('请先选择版权字');
 return {font:rendered.font,buffer:rendered.guide};
}
