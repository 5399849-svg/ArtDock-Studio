import fs from 'node:fs/promises';
import path from 'node:path';

export async function readAdOutputPolicy(root){
  let policy;try{policy=JSON.parse(await fs.readFile(path.join(root,'config','ad-output-size-rules.json'),'utf8'));}catch(error){if(error.code==='ENOENT')return null;throw error;}
  if(typeof policy.version!=='string'||policy.scope!=='new-tasks-only'||!Array.isArray(policy.rules))throw Error('新任务体积规范格式无效');
  for(const rule of policy.rules)if(!Number.isInteger(rule.minBytes)||!Number.isInteger(rule.maxBytes)||rule.minBytes<1||rule.maxBytes<rule.minBytes||rule.maxBytesInclusive!==true||rule.jpegProfile!=='detail-first-v1')throw Error('新任务体积规范范围无效');
  return policy;
}
