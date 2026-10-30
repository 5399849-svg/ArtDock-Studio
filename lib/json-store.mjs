import fs from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {setTimeout as sleep} from 'node:timers/promises';

// A reader/virus scanner can briefly hold a Windows destination file open.
// Keep writes ordered and retry atomic replacement without exposing partial JSON.
export function createJsonWriter({files=fs,wait=sleep}={}){
  const queues=new Map();
  const replace=async(file,contents)=>{
      const temporary=`${file}.${randomUUID()}.tmp`;
      try{
        await files.writeFile(temporary,contents,'utf8');
        for(let attempt=0;;attempt++){
          try{await files.rename(temporary,file);break;}
          catch(error){if(!['EPERM','EACCES','EBUSY'].includes(error.code)||attempt>=6)throw error;await wait(Math.min(400,25*2**attempt));}
        }
      }finally{await files.unlink(temporary).catch(error=>{if(error.code!=='ENOENT')throw error;});}
  };
  const enqueue=(file,work)=>{
    const operation=(queues.get(file) || Promise.resolve()).catch(()=>{}).then(work);
    queues.set(file,operation);operation.finally(()=>{if(queues.get(file)===operation)queues.delete(file);}).catch(()=>{});
    return operation;
  };
  function writeJson(file,value){
    const contents=JSON.stringify(value,null,2)+'\n';
    return enqueue(file,()=>replace(file,contents));
  };
  writeJson.mutate=(file,mutate)=>enqueue(file,async()=>{
    const value=JSON.parse(await files.readFile(file,'utf8'));
    const result=await mutate(value);
    await replace(file,JSON.stringify(value,null,2)+'\n');return result;
  });
  return writeJson;
}

export const writeJson=createJsonWriter();
export const mutateJson=writeJson.mutate;
