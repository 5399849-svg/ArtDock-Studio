import fs from 'node:fs/promises';
import {safeChild} from './core.mjs';

// Only expose review images. Provider requests, receipts and model inputs in
// the same job directory are not public preview files.
export function createAdAiPreviewHandler({storageDir}){
 const error=(res,status,message)=>{const body=Buffer.from(JSON.stringify({error:message}));res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Content-Length':body.length,'Cache-Control':'no-store'});res.end(body);return true;};
 return async(req,res,url)=>{
  const parts=url.pathname.split('/');
  if(parts[1]!=='storage'||!parts[2]?.startsWith('ad-resources-')||parts[3]!=='ai-edit')return false;
  if(!['GET','HEAD'].includes(req.method))return error(res,405,'候选预览只支持读取');
  let batch,job,name;try{[batch,job,name]=[parts[2],parts[4],parts[5]].map(decodeURIComponent)}catch{return error(res,404,'候选预览不存在');}
  if(parts.length!==6||!/^ad-resources-[a-zA-Z0-9-]{1,80}$/.test(batch)||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(job)||!/^(?:before|candidate)(?:-[a-zA-Z0-9_-]{1,100})?\.jpg$/.test(name))return error(res,404,'候选预览不存在');
  let body;try{body=await fs.readFile(safeChild(storageDir,batch,'ai-edit',job,name))}catch(e){if(['ENOENT','ENOTDIR'].includes(e.code))return error(res,404,'候选预览不存在，请刷新后重试');throw e;}
  res.writeHead(200,{'Content-Type':'image/jpeg','Content-Length':body.length,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:body);return true;
 };
}
