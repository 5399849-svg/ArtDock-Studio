import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {safeChild} from './core.mjs';

export const adDraftFields=['sourceAssetId','logoAssetId','zoom','offsetX','offsetY','logoScale','logoX','logoY'];
export const adDraftKey=draft=>JSON.stringify(adDraftFields.map(key=>draft?.[key]??null));
const copy=value=>structuredClone(value);
const fail=(message,status=409)=>Object.assign(Error(message),{status});
const hash=buffer=>createHash('sha256').update(buffer).digest('hex');
export const nextAdVersion=item=>Math.max(item.versionSequence||0,...(item.versions||[]).map(v=>v.number),0)+1;

export function markAdVersionSaved(item,version){
  version.draftSnapshot??=copy(item.draft);
  item.versionSequence=Math.max(item.versionSequence||0,version.number);
  item.savedDraftState={versionNumber:version.number,draft:copy(item.draft)};
  item.draftDirty=false;
}

export function updateAdWorkingDraft(item,draft,{record=true,groupId=null}={}){
  if(adDraftKey(item.draft)===adDraftKey(draft))return;
  item.savedDraftState??={versionNumber:item.versions.at(-1)?.number||0,draft:copy(item.versions.at(-1)?.draftSnapshot||item.draft)};
  if(record){item.draftUndoStepIds=Array.from({length:item.draftUndo?.length||0},(_,i)=>item.draftUndoStepIds?.[i]||null);item.draftUndoStepIds.push(groupId);item.draftUndoStepIds=item.draftUndoStepIds.slice(-30);(item.draftUndo??=[]).push(copy(item.draft));item.draftUndo=item.draftUndo.slice(-30);item.draftRedo=[];item.draftRedoStepIds=[];}
  item.draft=copy(draft);item.draftUpdatedAt=new Date().toISOString();
  item.draftDirty=item.savedDraftState.versionNumber!==(item.versions.at(-1)?.number||0)||adDraftKey(draft)!==adDraftKey(item.savedDraftState.draft);
}

export function moveAdDraftHistory(item,direction){
  const from=direction==='redo'?'draftRedo':'draftUndo',to=direction==='redo'?'draftUndo':'draftRedo';
  if(!item[from]?.length)return false;
  item[from+'StepIds']=Array.from({length:item[from].length},(_,i)=>item[from+'StepIds']?.[i]||null);
  item[to+'StepIds']=Array.from({length:item[to]?.length||0},(_,i)=>item[to+'StepIds']?.[i]||null);
  const draft=item[from].pop(),id=item[from+'StepIds'].pop();
  (item[to]??=[]).push(copy(item.draft));item[to]=item[to].slice(-30);item[to+'StepIds'].push(id);item[to+'StepIds']=item[to+'StepIds'].slice(-30);
  updateAdWorkingDraft(item,draft,{record:false});return true;
}

export function createAdVersionLifecycle({storageDir,batches,save,renderForSpec,saveVersion,assertFree}){
  const state=item=>({draft:item.draft,draftDirty:Boolean(item.draftDirty),draftUpdatedAt:item.draftUpdatedAt,canUndo:Boolean(item.draftUndo?.length),canRedo:Boolean(item.draftRedo?.length)});
  const readVersion=async(batch,spec,version)=>{
    if(version.kind==='composition')return renderForSpec(batch,spec,copy(version.draftSnapshot));
    const file=version.storageName||version.name;
    if(typeof file!=='string'||path.basename(file)!==file||/[\\/\0]/.test(file))throw fail('版本文件路径无效',422);
    return fs.readFile(safeChild(path.resolve(storageDir,`ad-resources-${batch.id}`,'candidate'),file));
  };
  const snapshot=async(batch,spec,item,input={})=>{
    assertFree(item);
    if(spec.format!=='JPG')throw fail('动图版本在制作完成后保留',422);
    if(Number.isInteger(input.expectedVersion)&&input.expectedVersion!==(item.versions.at(-1)?.number||0))throw fail('版本列表已更新，请刷新后再保留');
    if(input.draft&&adDraftKey(input.draft)!==adDraftKey(item.draft))throw fail('编辑稿尚未保存，请稍后重试');
    const token=JSON.stringify([item.versionSequence,item.versions.map(v=>v.number),adDraftKey(item.draft)]),draft=copy(item.draft),buffer=await renderForSpec(batch,spec,draft),last=item.versions.at(-1);
    if(last&&!last.invalidatedReason&&hash(buffer)===hash(await readVersion(batch,spec,last))){
      if(token!==JSON.stringify([item.versionSequence,item.versions.map(v=>v.number),adDraftKey(item.draft)]))throw fail('编辑稿已变化，请重新保留');
      item.savedDraftState={versionNumber:last.number,draft};item.draftDirty=false;await save();return {version:last,deduplicated:true,...state(item)};
    }
    const version=await saveVersion(batch,spec,buffer,{referenceOnly:true,compositionDraft:draft,beforeCommit:()=>{
      if(token!==JSON.stringify([item.versionSequence,item.versions.map(v=>v.number),adDraftKey(item.draft)]))throw fail('编辑稿已变化，未覆盖当前画面');
    }});
    return {version,...state(item)};
  };
  const undo=async(item,input,direction)=>{
    assertFree(item);if(input.draft&&adDraftKey(input.draft)!==adDraftKey(item.draft))throw fail('编辑稿已更新，请刷新后重试');
    if(!moveAdDraftHistory(item,direction))return state(item);
    await save();return state(item);
  };
  const remove=async(batch,spec,item,number,input={})=>{
    assertFree(item);
    if(['queued','preparing','submitting','submitted','processing','downloading','encoding'].includes(item.motionJob?.status))throw fail('当前尺寸正在制作，请完成后再删除版本');
    if(Number.isInteger(input.expectedVersion)&&input.expectedVersion!==(item.versions.at(-1)?.number||0))throw fail('版本列表已更新，请刷新后再删除');
    const version=item.versions.find(v=>v.number===number);if(!version)throw fail('此版本已被删除，请刷新列表',404);
    const files=[version.thumbnailStorageName,version.storageName||(version.kind!=='composition'?version.name:null)].filter(Boolean);
    for(const file of files)if(typeof file!=='string'||path.basename(file)!==file||/[\\/\0]/.test(file))throw fail('版本文件路径无效',422);
    item.versionSequence=Math.max(item.versionSequence||0,...item.versions.map(v=>v.number));
    const wasCurrent=version===item.versions.at(-1),wasDelivered=batch.deliveredVersions?.[spec.id]===number;
    if(wasCurrent){item.savedDraftState??={versionNumber:number,draft:copy(version.draftSnapshot||item.draft)};item.draftDirty=true;}
    if(wasDelivered){(batch.deliveryArchive??=[]).push({specId:spec.id,...copy(version)});}
    item.versions=item.versions.filter(v=>v!==version);
    // Provider receipts stay intact. A deleted snapshot must not be resurrected
    // by a stale accept/resume action or used as a now-broken before preview.
    for(const row of Object.values(batch.items))for(const job of [row.aiEditJob,...(row.aiEditHistory||[])].filter(Boolean)){
      if(job.basePreviewUrl===version.url)job.basePreviewUrl='';
      if(row===item&&job.versionNumber===number){job.versionDeleted=true;job.status='version_deleted';}
    }
    await save();
    let removedFiles=0;
    for(const file of files){
      const url=`/storage/ad-resources-${batch.id}/candidate/${encodeURIComponent(file)}`;
      const retained=batches.some(b=>JSON.stringify({items:b.items,assets:b.assets,deliveryArchive:b.deliveryArchive}).includes(file)||JSON.stringify(b).includes(url));
      if(retained)continue;
      await fs.rm(safeChild(path.resolve(storageDir,`ad-resources-${batch.id}`,'candidate'),file),{force:true});removedFiles++;
    }
    return {deleted:number,removedFiles,retainedForDelivery:wasDelivered,versions:item.versions,...state(item)};
  };
  return {state,readVersion,snapshot,undo,remove};
}
