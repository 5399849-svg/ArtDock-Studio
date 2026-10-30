import {validateAdUploadFile} from './ad-upload-policy.js';
export const AD_BULK_MAX_TASKS=20;
export const adBulkFileKey=file=>JSON.stringify([file.name,file.size,file.lastModified||0]);
export const adBulkTaskName=name=>String(name||'').replace(/\.(psd|jpe?g|png|webp)$/i,'').trim().slice(0,100);
let activeSession=null;
export const currentAdBulkSession=()=>activeSession;
export function createAdBulkSession({visuals,logos=[],projectId='',projectLogoId='default'},{api,upload,uuid=()=>crypto.randomUUID()}={}){
 if(!Array.isArray(visuals)||!visuals.length||visuals.length>AD_BULK_MAX_TASKS)throw Error(`每批请选择 1–${AD_BULK_MAX_TASKS} 张主视觉`);
 if(logos.length>1)throw Error('批量新建每次可选择一张共用 Logo');
 for(const entry of [...visuals,...logos]){const result=validateAdUploadFile(entry.file);if(!result.ok)throw Error(result.error);}
 for(const entry of visuals)if(!String(entry.taskName||'').trim()||entry.taskName.trim().length>100)throw Error('请为每个任务填写 100 字以内的名称');
 const rows=visuals.map(entry=>({id:uuid(),name:entry.taskName.trim(),sourceIdentity:adBulkFileKey(entry.file),batchId:'',stage:'waiting',message:'等待创建',error:'',warnings:[],uploads:[{file:entry.file,name:entry.file.name,role:'visual',requestId:uuid(),assetId:''},...logos.map(logo=>({file:logo.file,name:logo.file.name,role:'logo',requestId:uuid(),assetId:''}))]}));
 const listeners=new Set();let running=null;
 const session={rows,projectId,projectLogoId,status:'idle',subscribe(fn){for(const old of listeners){try{old(session);}catch{listeners.delete(old);}}listeners.add(fn);fn(session);return()=>listeners.delete(fn);},
  get running(){return Boolean(running);},get completed(){return rows.filter(row=>['ready','motion'].includes(row.stage)).length;},get failed(){return rows.filter(row=>['failed','partial'].includes(row.stage)).length;},
  run(){if(running)return running;session.status='running';
   const beforeUnload=event=>{if(session.running&&session.rows.some(row=>row.uploads.some(asset=>!asset.assetId))){event.preventDefault();event.returnValue='';}};globalThis.window?.addEventListener('beforeunload',beforeUnload);
   const notify=()=>{for(const fn of listeners){try{fn(session);}catch{listeners.delete(fn);}}};
   const change=(row,values)=>{Object.assign(row,values);notify();};
   running=(async()=>{
    // Publish each independent workbench first. Slow PSD parsing in one task
    // never prevents the remaining tasks from being listed and opened.
    for(const row of rows){if(row.batchId)continue;try{change(row,{stage:'creating',message:'正在创建独立任务',error:''});const result=await api('/api/ad-resources/batches',{method:'POST',body:JSON.stringify({project:row.name,projectId,projectLogoId,requestId:row.id,sourceIdentity:row.sourceIdentity})});if(!result.batch?.id)throw Error('任务创建回执不完整');change(row,{batchId:result.batch.id,stage:'waiting',message:'任务已创建，等待导入'});}catch(error){change(row,{stage:'failed',message:'创建未完成',error:error.message});}}
    for(const row of rows){if(!row.batchId||['ready','motion'].includes(row.stage))continue;
     try{
      change(row,{error:'',stage:'uploading',message:'正在导入素材'});
      for(const asset of row.uploads){if(asset.assetId)continue;const result=await upload(row.batchId,asset.file,{role:asset.role,requestId:asset.requestId,onProgress:progress=>change(row,{stage:progress.phase==='processing'?'processing':'uploading',message:`${asset.name} · ${progress.message}`})});asset.assetId=result.asset.id;row.warnings.push(...(result.warnings||[]));asset.file=null;notify();}
      change(row,{stage:'generating',message:'正在制作各尺寸'});const result=await api(`/api/ad-resources/batches/${encodeURIComponent(row.batchId)}/auto-generate`,{method:'POST',body:'{}'});row.result=result;
      if(result.errors?.length)change(row,{stage:'partial',message:'部分尺寸待处理',error:result.errors.join('；')});else change(row,{stage:result.pending?.length?'motion':'ready',message:result.pending?.length?'静态稿已生成，动效制作中':'各尺寸已生成，待检查'});
     }catch(error){change(row,{stage:'failed',message:'未完成，可继续重试',error:error.message});}
    }
    session.status=session.failed?'partial':'done';notify();return session;
   })().finally(()=>{running=null;globalThis.window?.removeEventListener('beforeunload',beforeUnload);notify();});notify();return running;
  }
 };
 return session;
}
export function startAdBulkSession(input,deps){
 if(activeSession&&(activeSession.running||activeSession.failed))throw Error('请先完成或关闭上一批任务进度');
 activeSession=createAdBulkSession(input,deps);void activeSession.run();return activeSession;
}
export function clearAdBulkSession(){if(activeSession?.running)throw Error('批量创建仍在进行');activeSession=null;}
