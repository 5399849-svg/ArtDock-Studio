import fs from 'node:fs/promises';
import path from 'node:path';
import {mutateJson} from './json-store.mjs';
import {parseWorkbenchTaskKey} from './workbench-project-links.mjs';

const files={core:'tasks.json','ad-resources':'ad-resources-jobs.json','channel-resources':'channel-resource-jobs.json','store-preorder':'store-preorder-jobs.json','store-launch':'store-launch-jobs.json','icon-preorder':'icon-preorder-jobs.json','icon-launch':'icon-launch-jobs.json'};
const fail=(message,status=422)=>Object.assign(Error(message),{status});
const read=async file=>{try{return JSON.parse(await fs.readFile(file,'utf8'));}catch(error){if(error.code==='ENOENT')return null;throw error;}};

// A display name must not rename stored artwork, delivery files or channel groups.
export function createWorkbenchTaskNames({runtimeDir,readChannelBatches,onChange=()=>{}}){
  const file=path.join(runtimeDir,'workbench-task-names.json');
  return {
    async read(){const names=await read(file)||{};onChange(names);return names;},
    async rename(input){
      const target=parseWorkbenchTaskKey(input?.key);
      if(typeof input?.name!=='string')throw fail('请填写任务名称');
      const name=input.name.trim();
      if(!name||[...name].length>100||/[\u0000-\u001f\u007f]/u.test(name))throw fail('任务名称需要 1–100 个字符，不能包含换行');
      const rows=target.module==='channel-resources'&&readChannelBatches?await readChannelBatches():await read(path.join(runtimeDir,files[target.module]))||[];
      const exists=target.module==='channel-resources'
        ?target.group?rows.some(b=>b.id===target.id&&(b.items||[]).some(i=>String(i.project||'未命名项目').trim()===target.project))
          :rows.some(b=>(b.items||[]).some(i=>i.id===target.id))
        :rows.some(row=>row.id===target.id);
      if(!exists)throw fail('任务不存在，请刷新列表后重试',404);
      await fs.writeFile(file,'{}\n',{flag:'wx'}).catch(error=>{if(error.code!=='EEXIST')throw error;});
      const names=await mutateJson(file,names=>{names[target.key]=name;return {...names};});onChange(names);return names;
    }
  };
}
