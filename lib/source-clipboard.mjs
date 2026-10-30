import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {isLocalWorkbenchRequest} from './local-folder-access.mjs';
const exec=promisify(execFile),fail=(message,status=422)=>{throw Object.assign(Error(message),{status});};
export async function windowsClipboardFiles(){
 if(process.platform!=='win32')return [];
 // Only file-drop entries, never arbitrary clipboard text or image contents.
 const script="[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); Add-Type -AssemblyName System.Windows.Forms; ConvertTo-Json -InputObject @([System.Windows.Forms.Clipboard]::GetFileDropList() | ForEach-Object { [string]$_ }) -Compress";
 const {stdout}=await exec('powershell.exe',['-NoProfile','-NonInteractive','-STA','-Command',script],{windowsHide:true,timeout:15000,maxBuffer:32768});return JSON.parse(stdout.trim()||'[]');
}
export function createSourceClipboard({readClipboard=windowsClipboardFiles,now=()=>Date.now()}={}){
 const tickets=new Map();
 const authorize=req=>{if(!isLocalWorkbenchRequest(req)||req.headers['x-workbench-clipboard']!=='1')fail('复制本地源文件仅支持本机工作台，请使用上传文件',403);};
 const prune=()=>{for(const [key,value] of tickets)if(value.expires<now())tickets.delete(key);};
 return {
  async read(req){authorize(req);prune();const paths=await readClipboard();if(!Array.isArray(paths)||paths.length>12)fail('一次最多粘贴 12 个源文件');const files=[];
   for(const file of paths){if(typeof file!=='string'||! /\.(psd|psb|png|jpe?g|webp)$/i.test(file))continue;const resolved=await fs.realpath(file),stat=await fs.stat(resolved);if(!stat.isFile())continue;const limit=/\.ps[db]$/i.test(file)?500:20;if(stat.size<1||stat.size>limit*1048576)fail(`源文件 ${path.basename(file)} 超过 ${limit} MB 或为空`);
    const ticket=randomUUID();tickets.set(ticket,{path:resolved,bytes:stat.size,modified:stat.mtimeMs,expires:now()+30*60000});files.push({ticket,name:path.basename(file),size:stat.size});
   }return {files};
  },
  async open(req,ticket){authorize(req);prune();const entry=tickets.get(ticket);if(!entry)fail('源文件选择已失效，请重新复制粘贴',409);const handle=await fs.open(entry.path,'r');try{const stat=await handle.stat();if(!stat.isFile()||stat.size!==entry.bytes||stat.mtimeMs!==entry.modified)fail('源文件已变化，请重新复制粘贴',409);const stream=handle.createReadStream();stream.headers={'content-length':String(stat.size)};return {stream,name:path.basename(entry.path),close:()=>stream.destroy()};}catch(e){await handle.close();throw e;}}
 };
}
