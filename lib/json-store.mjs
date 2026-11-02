import fs from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {setTimeout as sleep} from 'node:timers/promises';

// A reader/virus scanner can briefly hold a Windows destination file open.
// Keep writes ordered and retry atomic replacement without exposing partial JSON.
// 机器很忙时（例如几十个测试同时跑）占用可能超过一秒：最多等约 5 秒再报错。Linux 服务器上不会遇到。
export function createJsonWriter({files=fs,wait=sleep}={}){
  const queues=new Map();
  const replace=async(file,contents)=>{
      const temporary=`${file}.${randomUUID()}.tmp`;
      try{
        await files.writeFile(temporary,contents,'utf8');
        for(let attempt=0;;attempt++){
          try{await files.rename(temporary,file);break;}
          catch(error){if(!['EPERM','EACCES','EBUSY'].includes(error.code)||attempt>=15)throw error;await wait(Math.min(400,25*2**attempt));}
        }
      }finally{await files.unlink(temporary).catch(error=>{if(error.code!=='ENOENT')throw error;});}
  };
  const enqueue=(file,work)=>{
    const operation=(queues.get(file) || Promise.resolve()).catch(()=>{}).then(work);
    queues.set(file,operation);operation.finally(()=>{if(queues.get(file)===operation)queues.delete(file);}).catch(()=>{});
    return operation;
  };
  // 存成紧凑的 JSON（不缩进）：tasks.json 这类大文件每改一次都整份重写、整份同步进数据库，紧凑格式小一半左右，读的时候也解析得快。
  const serialize=value=>JSON.stringify(value)+'\n';
  function writeJson(file,value){
    const contents=serialize(value);
    return enqueue(file,()=>replace(file,contents));
  };
  writeJson.mutate=(file,mutate)=>enqueue(file,async()=>{
    const value=JSON.parse(await files.readFile(file,'utf8'));
    const result=await mutate(value);
    await replace(file,serialize(value));return result;
  });
  // “先读后写”的写回：读到 base（原文）之后文件没变就直接写 value；变了（别人在中间写过）就用
  // merge(最新内容, value) 算出要写的内容。在写队列里做，不会和别的写交错。返回实际写进去的原文和是否合并过。
  writeJson.since=(file,value,base,merge)=>enqueue(file,async()=>{
    const text=await files.readFile(file,'utf8').catch(error=>{if(error.code==='ENOENT')return null;throw error;});
    const merged=text!==null&&text!==base;
    const contents=serialize(merged?merge(JSON.parse(text),value):value);
    await replace(file,contents);return {contents,merged};
  });
  return writeJson;
}

/**
 * 按编号合并一组记录：只把 mine 这一份里相对 before（它上次读到或写过的样子，编号 → JSON）真正改过的、新加的、删掉的
 * 记录用到 current（文件里最新的）上，其余记录保留 current 的（别人在中间的修改）。新加的放最前面（新建任务都放最前）。
 * 两边改了同一条记录时，mine 的为准（和以前整份写回一样，但不再连累别的记录）。
 */
export function mergeRecordsById(current,mine,before){
  const changed=new Map(),mineIds=new Set();
  for(const record of mine){mineIds.add(record.id);if(before.get(record.id)!==JSON.stringify(record))changed.set(record.id,record);}
  const currentIds=new Set(current.map(record=>record.id));
  const added=mine.filter(record=>!before.has(record.id)&&!currentIds.has(record.id));
  const removed=new Set([...before.keys()].filter(id=>!mineIds.has(id)));
  return [...added,...current.filter(record=>!removed.has(record.id)).map(record=>changed.get(record.id)||record)];
}

export const writeJson=createJsonWriter();
export const mutateJson=writeJson.mutate;

/**
 * “先读后写”的记录文件（一个数组，每条有 id，例如 tasks.json）。很多处理先 read()，算完再整份 write() 回去；
 * 读和写之间别的请求、后台任务改过的记录，以前会被这份旧的整个盖掉。read() 记下读到的原文；write() 时文件没变就照旧
 * 整份写，变了就只把这份数组真正改过的记录合进最新的文件（mergeRecordsById），其余记录保留别人的修改。
 * write() 的不是 read() 读来的数组时，照旧整份写。
 */
export function createRecordFile(file,{writer=writeJson,files=fs}={}){
  const snapshots=new WeakMap(); // 数组 → {text: 上次读到或写进去的原文, before: 编号 → 这份数组当时的 JSON（合并过时才有）}
  const byId=records=>new Map(records.map(record=>[record.id,JSON.stringify(record)]));
  async function read(){
    const text=await files.readFile(file,'utf8'),value=JSON.parse(text);
    if(Array.isArray(value))snapshots.set(value,{text,before:null});
    return value;
  }
  async function write(value){
    const snapshot=snapshots.get(value);
    if(!snapshot)return writer(file,value);
    const before=snapshot.before||byId(JSON.parse(snapshot.text));
    // 合并过的话，这份数组里还是别人改之前的记录，下次写照样要合并，所以不给原文（不走“文件没变就整份写”）。
    const {contents,merged}=await writer.since(file,value,snapshot.before?null:snapshot.text,current=>mergeRecordsById(current,value,before));
    snapshots.set(value,merged?{text:contents,before:byId(value)}:{text:contents,before:null});
  }
  return {read,write};
}
