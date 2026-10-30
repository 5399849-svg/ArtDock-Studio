import fs from 'node:fs/promises';
import path from 'node:path';
export async function resolvePsdInputs(root,input) {
 const allowed=await fs.realpath(root);
 async function resolve(value,variant){
  let candidate=String(value||'').trim().replace(/^"|"$/g,'');
  if(!candidate)throw new Error('请填写 PSD 文件夹或文件路径');
  try {candidate=await fs.realpath(candidate);} catch(e){
   const marker='Documents\\ChatGPT\\平台&社区\\';const index=candidate.indexOf(marker);
   if(e.code!=='ENOENT'||index<0)throw e;
   candidate=await fs.realpath(path.join(allowed,candidate.slice(index+marker.length)));
  }
  async function check(file){
   const real=await fs.realpath(file),relative=path.relative(allowed,real);
   if(relative.startsWith('..')||path.isAbsolute(relative))throw new Error('请选择项目目录内的 PSD 文件或文件夹');
   return real;
  }
  candidate=await check(candidate);
  if((await fs.stat(candidate)).isDirectory()){
   const names=(await fs.readdir(candidate,{withFileTypes:true})).filter(e=>e.isFile()&&/\.psd$/i.test(e.name));
   const pattern=variant==='landscape'?/横版|横屏|landscape/i:/竖版|竖屏|portrait/i;
   const matches=names.filter(e=>pattern.test(e.name));
   if(matches.length!==1)throw new Error(`${variant==='landscape'?'横版':'竖版'} PSD 无法唯一识别（找到${matches.length}份），请填写具体文件路径`);
   candidate=await check(path.join(candidate,matches[0].name));
  }
  if(!/\.psd$/i.test(candidate))throw new Error('请选择 PSD 文件或包含横竖版 PSD 的文件夹');
  return candidate;
 }
 const landscape=await resolve(input.folder||input.landscape,'landscape');
 const portrait=await resolve(input.folder||input.portrait||input.landscape,'portrait');
 if(landscape===portrait)throw new Error('横版和竖版不能使用同一份 PSD');
 return {landscape,portrait};
}
