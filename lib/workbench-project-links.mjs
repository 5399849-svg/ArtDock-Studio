import fs from 'node:fs/promises';
import path from 'node:path';
import {mutateJson} from './json-store.mjs';

const uuid='[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}';
const files={core:'tasks.json','ad-resources':'ad-resources-jobs.json','channel-resources':'channel-resource-jobs.json',
  'store-preorder':'store-preorder-jobs.json','store-launch':'store-launch-jobs.json','icon-preorder':'icon-preorder-jobs.json','icon-launch':'icon-launch-jobs.json'};
const fail=(message,status=422)=>Object.assign(Error(message),{status});
const read=async(file,fallback)=>{try{return JSON.parse(await fs.readFile(file,'utf8'));}catch(error){if(error.code==='ENOENT'&&fallback!==undefined)return fallback;throw error;}};

export function parseWorkbenchTaskKey(key){
  if(typeof key!=='string'||key.length>1000)throw fail('任务标识无效');
  const match=/^([a-z-]+):(.+)$/.exec(key),module=match?.[1],rest=match?.[2];
  if(!Object.hasOwn(files,module||''))throw fail('任务类型无效');
  if(module==='channel-resources'){
    const group=/^([a-zA-Z0-9_-]{1,160}):(.*)$/.exec(rest);
    if(group){let project;try{project=decodeURIComponent(group[2]);}catch{throw fail('渠道任务标识无效');}if(!project)throw fail('渠道任务标识无效');return {key,module,id:group[1],project,group:true};}
    if(!/^[a-zA-Z0-9_-]{1,160}$/.test(rest))throw fail('渠道任务标识无效');
  }else if(!new RegExp(`^${uuid}$`,'i').test(rest))throw fail('任务标识无效');
  return {key,module,id:rest};
}

// Filing is independent metadata, including for already delivered or running
// work. Never rewrite module-owned jobs, generated files or delivery approvals.
export function createWorkbenchProjectLinks({runtimeDir,onChange=()=>{},readChannelBatches}){
  const linksFile=path.join(runtimeDir,'workbench-project-links.json');
  return {
    async read(){const links=await read(linksFile,{});onChange(links);return links;},
    async assign(input){
      const supplied=input?.keys===undefined?[input?.key]:input.keys;
      if(!Array.isArray(supplied)||!supplied.length||supplied.length>500)throw fail('请选择 1–500 个任务');
      const targets=[...new Set(supplied)].map(parseWorkbenchTaskKey);
      const projectId=input.projectId??'';
      if(typeof projectId!=='string')throw fail('项目标识无效');
      const projects=await read(path.join(runtimeDir,'projects.json'),[]);
      if(projectId&&!projects.some(p=>p.id===projectId))throw fail('项目不存在');
      const data=new Map(await Promise.all([...new Set(targets.map(t=>t.module))].map(async module=>[module,module==='channel-resources'&&readChannelBatches?await readChannelBatches():await read(path.join(runtimeDir,files[module]),[])])));
      for(const target of targets){
        const rows=data.get(target.module);
        const exists=target.module==='channel-resources'
          ?target.group?rows.some(b=>b.id===target.id&&(b.items||[]).some(i=>String(i.project||'未命名项目').trim()===target.project))
            :rows.some(b=>(b.items||[]).some(i=>i.id===target.id))
          :rows.some(row=>row.id===target.id);
        if(!exists)throw fail('任务不存在，请刷新列表后重试',404);
      }
      // Validate the entire batch before one serialized, atomic metadata write.
      const links=await mutateJson(linksFile,links=>{for(const target of targets)links[target.key]=projectId;return {...links};});
      onChange(links);return links;
    }
  };
}
