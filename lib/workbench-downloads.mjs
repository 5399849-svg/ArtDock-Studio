import {Readable} from 'node:stream';
import {inflateRawSync} from 'node:zlib';
import {createStoreZip,sanitizeFileName,sanitizeZipName} from './core.mjs';

const MAX_TASKS=200,MAX_BYTES=256*1024*1024;
const fail=(message,status=422)=>Object.assign(Error(message),{status});
const safeName=value=>sanitizeFileName(value||'未命名任务').replace(/^\.+/,'').replace(/[. ]+$/,'')||'未命名任务';
function uniqueZipName(value,names){
  const original=sanitizeZipName(value);if(!original)throw fail('成品文件名无效');
  let name=original,n=2;
  while(names.has(name.toLowerCase())){
    const slash=original.lastIndexOf('/'),dir=original.slice(0,slash+1),leaf=original.slice(slash+1),dot=leaf.lastIndexOf('.'),extension=dot>0?leaf.slice(dot).slice(0,15):'',stem=dot>0?leaf.slice(0,dot):leaf;
    name=`${dir}${stem.slice(0,100)}_${n++}${extension}`;
  }
  names.add(name.toLowerCase());return name;
}
const json=(res,status,value)=>{const buffer=Buffer.from(JSON.stringify(value));res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(buffer);};

// Read the directory rather than guessing local record sizes; delivered archives
// may contain deflated entries and standard ZIP data descriptors.
export function workbenchZipFiles(buffer,limit=MAX_BYTES){
  let end=-1;
  for(let p=buffer.length-22;p>=Math.max(0,buffer.length-65557);p--)if(buffer.readUInt32LE(p)===0x06054b50){end=p;break;}
  if(end<0)throw fail('成套文件不是有效的 ZIP');
  const count=buffer.readUInt16LE(end+10),start=buffer.readUInt32LE(end+16);
  if(!count||count>5000||buffer.readUInt16LE(end+4)||buffer.readUInt16LE(end+6))throw fail('成套 ZIP 格式不支持');
  let offset=start,total=0;const files=[];
  for(let i=0;i<count;i++){
    if(offset+46>buffer.length||buffer.readUInt32LE(offset)!==0x02014b50)throw fail('成套 ZIP 目录不完整');
    const flags=buffer.readUInt16LE(offset+8),method=buffer.readUInt16LE(offset+10),size=buffer.readUInt32LE(offset+20),length=buffer.readUInt32LE(offset+24),nameLength=buffer.readUInt16LE(offset+28),extra=buffer.readUInt16LE(offset+30),comment=buffer.readUInt16LE(offset+32),local=buffer.readUInt32LE(offset+42);
    if(offset+46+nameLength+extra+comment>end)throw fail('成套 ZIP 目录不完整');
    const name=buffer.subarray(offset+46,offset+46+nameLength).toString('utf8');
    offset+=46+nameLength+extra+comment;
    if(flags&1||![0,8].includes(method)||!name||/^[\\/]|^[a-z]:|\\|\x00/i.test(name)||name.split('/').some(part=>part==='..'||part==='.'))throw fail('成套 ZIP 包含无效文件路径');
    if(name.endsWith('/'))continue;
    total+=length;if(total>limit)throw fail('所选成品超过 256MB，请分批下载',413);
    if(local+30>buffer.length||buffer.readUInt32LE(local)!==0x04034b50)throw fail('成套 ZIP 文件记录无效');
    const dataStart=local+30+buffer.readUInt16LE(local+26)+buffer.readUInt16LE(local+28);
    if(dataStart+size>start)throw fail('成套 ZIP 文件不完整');
    const stored=buffer.subarray(dataStart,dataStart+size),data=method===8?inflateRawSync(stored,{maxOutputLength:Math.max(1,length)}):stored;
    if(data.length!==length)throw fail('成套 ZIP 文件长度不一致');
    files.push({name,data});
  }
  if(!files.length)throw fail('任务没有可下载成品');
  return files;
}

function taskIdentity(input){
  if(!input||typeof input.key!=='string'||input.key.length>1000)throw fail('任务选择无效');
  const [module,id,...rest]=input.key.split(':');
  if(!['core','ad-resources','store-preorder','store-launch','icon-preorder','icon-launch','channel-resources'].includes(module)||!/^[a-z0-9_-]{1,100}$/i.test(id||''))throw fail('任务选择无效');
  if(module!=='channel-resources'&&rest.length)throw fail('任务选择无效');
  let projectKey='';if(module==='channel-resources'){try{projectKey=decodeURIComponent(rest.join(':'));}catch{throw fail('任务选择无效');}if(!projectKey||projectKey.length>300)throw fail('任务选择无效');}
  return {key:input.key,module,id,projectKey,label:String(input.label||'未命名任务').slice(0,100)};
}

export function createWorkbenchDownloads({dispatch,readChannelFile}){
  const invoke=async(path,method='GET',body)=>{
    const req=Readable.from(body===undefined?[]:[Buffer.from(JSON.stringify(body))]);req.method=method;req.headers={};
    let status=200,headers={},buffer;
    const res={writeHead(code,values={}){status=code;headers=Object.fromEntries(Object.entries(values).map(([k,v])=>[k.toLowerCase(),v]));},setHeader(k,v){headers[k.toLowerCase()]=v;},end(value){buffer=Buffer.isBuffer(value)?value:Buffer.from(value||'');}};
    await dispatch(req,res,new URL(path,'http://workbench.internal'));
    if(status<200||status>=300){let message;try{message=JSON.parse(buffer).error;}catch{}throw fail(message||'成套文件暂不可下载',status);}
    return {buffer,headers};
  };
  const collect=async(task,{remainingBytes,remainingFiles})=>{
    if(task.module==='channel-resources'){
      const {buffer}=await invoke('/api/channel-resources'),data=JSON.parse(buffer),batch=data.batches.find(b=>b.id===task.id),items=batch?.items?.filter(item=>String(item.project||'未命名项目').trim()===task.projectKey)||[];
      if(!items.length)throw fail('渠道任务不存在',404);
      if(items.some(item=>item.editorJobs?.some(job=>job.status==='running')))throw fail('该任务仍在生成中');
      if(items.some(item=>!item.versions?.length||!item.review?.approved||item.review.versionFile!==item.versions.at(-1).file))throw fail('请先验收这组资源位的全部当前稿');
      if(!readChannelFile)throw fail('渠道成品暂不可下载');
      const files=[];
      for(const item of items){const version=item.versions.at(-1);files.push({name:version.downloadName||`${item.resource||item.id}_${item.width}x${item.height}.jpg`,data:await readChannelFile(batch,version.url)});}
      return {folder:items[0].taskName||task.projectKey,files};
    }
    let endpoint;
    if(task.module==='ad-resources'){
      const base=`/api/ad-resources/batches/${encodeURIComponent(task.id)}`;
      const prepared=JSON.parse((await invoke(base+'/prepare-download','POST',{})).buffer);
      if(!prepared.ready)throw fail(prepared.blocked?.map(row=>row.reason).join('；')||'当前稿尚未完成，请先处理未完成的尺寸');
      endpoint=base+'/download';
    }else endpoint=task.module==='core'?`/api/tasks/${encodeURIComponent(task.id)}/materials-package`:`/api/${task.module}/jobs/${encodeURIComponent(task.id)}/package`;
    // A successful ad export is a delivery, just like its own workspace's download.
    // Pass the remaining budget so skipped tasks are never marked as delivered.
    const {buffer,headers}=task.module==='ad-resources'
      ?await invoke(endpoint,'POST',{maxPackageBytes:remainingBytes,maxPackageFiles:remainingFiles})
      :await invoke(endpoint);
    if(!String(headers['content-type']||'').includes('application/zip'))throw fail('任务没有可下载的成套文件');
    const encoded=/filename\*=UTF-8''([^;]+)/i.exec(headers['content-disposition']||'');
    let folder=task.label;
    if(encoded){try{folder=decodeURIComponent(encoded[1]).replace(/\.zip$/i,'').replace(/_投放资源位$|_成套素材_v\d+$|_当前素材包_v\d+$/,'');}catch{}}
    return {folder,files:workbenchZipFiles(buffer)};
  };
  return async(req,res,url)=>{
    if(url.pathname!=='/api/workbench/task-downloads')return false;
    if(req.method!=='POST'){json(res,405,{error:'请使用批量下载操作'});return true;}
    let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>256*1024)throw fail('任务选择过多');chunks.push(chunk);}
    let input;try{input=JSON.parse(Buffer.concat(chunks));}catch{throw fail('任务选择无效');}
    if(!Array.isArray(input.tasks)||!input.tasks.length||input.tasks.length>MAX_TASKS)throw fail('一次请选择 1–200 个任务');
    const tasks=[...new Map(input.tasks.map(value=>{const task=taskIdentity(value);return [task.key,task];})).values()];
    const files=[],downloaded=[],skipped=[],folders=new Set();let bytes=0;
    for(const task of tasks){
      try{
        const result=await collect(task,{remainingBytes:MAX_BYTES-bytes,remainingFiles:5000-files.length}),amount=result.files.reduce((n,file)=>n+file.data.length,0);
        if(bytes+amount>MAX_BYTES)throw fail('所选成品超过 256MB，请分批下载',413);
        if(files.length+result.files.length>5000)throw fail('所选成品文件过多，请分批下载',413);
        const base=safeName(result.folder);let folder=base,n=2;while(folders.has(folder.toLowerCase()))folder=`${base.slice(0,110)}_${n++}`;
        const names=new Set(),entries=result.files.map(file=>({name:`${folder}/${uniqueZipName(file.name,names)}`,data:file.data}));
        files.push(...entries);folders.add(folder.toLowerCase());
        bytes+=amount;downloaded.push({key:task.key,label:task.label,folder});
      }catch(error){skipped.push({key:task.key,label:task.label,reason:error.message});}
    }
    if(!downloaded.length){json(res,409,{error:'所选任务暂不可下载',failures:skipped});return true;}
    if(skipped.length)files.push({name:'未下载任务.txt',data:Buffer.from(skipped.map(task=>`${task.label}\r\n${task.reason}`).join('\r\n\r\n'))});
    const zip=createStoreZip(files);
    res.writeHead(200,{'Content-Type':'application/zip','Content-Length':zip.length,'Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(`任务成品_${downloaded.length}项.zip`)}`,'X-Workbench-Downloaded':String(downloaded.length),'X-Workbench-Skipped':String(skipped.length)});res.end(zip);return true;
  };
}
