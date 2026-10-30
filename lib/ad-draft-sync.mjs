import {randomUUID} from 'node:crypto';
import {adAiSameTypeSpecs,adAiTypeLabel} from '../public/ad-ai-scope.js';
import {adDraftKey,updateAdWorkingDraft,moveAdDraftHistory} from './ad-version-lifecycle.mjs';

const logoFields=['logoScale','logoX','logoY'],viewFields=['zoom','offsetX','offsetY'];
const copy=value=>structuredClone(value);
const fail=message=>Object.assign(Error(message),{status:409});

export function createAdDraftSync({save,assertFree,embeddedLogo,state}){
 const prune=batch=>{
  const retained=new Set(Object.values(batch.items||{}).flatMap(item=>[...(item.draftUndoStepIds||[]),...(item.draftRedoStepIds||[])]).filter(Boolean));
  batch.draftSyncSteps=(batch.draftSyncSteps||[]).filter(step=>retained.has(step.id));
 };
 const response=(batch,spec,entries,extra={})=>({...state(batch.items[spec.id]),synced:entries.filter(e=>e.specId!==spec.id).map(e=>({specId:e.specId,...state(batch.items[e.specId])})),sync:{label:adAiTypeLabel(spec),updated:entries.filter(e=>e.specId!==spec.id).map(e=>e.specId),...extra}});
 const apply=async(batch,spec,specs,next)=>{
  const item=batch.items[spec.id];assertFree(item);
  const changed=fields=>fields.some(key=>next[key]!==item.draft?.[key]);
  const copyLogo=spec.logo==='required'&&changed(logoFields),copyView=changed(viewFields),skipped=[],entries=[];
  const add=(target,draft)=>{const row=batch.items[target.id];if(adDraftKey(draft)!==adDraftKey(row.draft))entries.push({specId:target.id,before:copy(row.draft),after:copy(draft)});};
  add(spec,next);
  if(spec.format==='JPG'&&(copyLogo||copyView))for(const target of adAiSameTypeSpecs(spec,specs)){
   if(target.id===spec.id)continue;
   const row=batch.items[target.id],source=batch.assets.find(a=>a.id===row?.draft?.sourceAssetId&&a.role==='visual');
   if(!source){skipped.push({specId:target.id,reason:'尚未添加主视觉'});continue;}
   const draft={...row.draft};
   if(copyView)for(const key of viewFields)draft[key]=next[key];
   if(copyLogo&&target.logo==='required'){
    const logo=batch.assets.find(a=>a.id===draft.logoAssetId&&a.role==='logo');
    if(embeddedLogo(source))skipped.push({specId:target.id,reason:'Logo 已合入源图，无法单独调整'});
    else if(!logo)skipped.push({specId:target.id,reason:'尚未添加独立 Logo'});
    else for(const key of logoFields)draft[key]=next[key];
   }
   if(target.logo==='forbidden')draft.logoAssetId='';
   add(target,draft);
  }
  // Check every affected member before changing any draft. A running/reviewing
  // AI result must never race a partial synchronization of the same group.
  for(const entry of entries){try{assertFree(batch.items[entry.specId])}catch(error){if(entry.specId!==spec.id){const target=specs.find(s=>s.id===entry.specId);error.message=`同类尺寸 ${target?.width}×${target?.height}：${error.message}`;}throw error;}}
  const groupId=entries.length>1?randomUUID():null;
  for(const entry of entries)updateAdWorkingDraft(batch.items[entry.specId],entry.after,{groupId});
  if(groupId)(batch.draftSyncSteps??=[]).push({id:groupId,leaderSpecId:spec.id,entries});
  if(entries.length){prune(batch);await save();}
  return response(batch,spec,entries,{skipped,fields:[...(copyView?viewFields:[]),...(copyLogo?logoFields:[])]});
 };
 const undo=async(batch,spec,input,direction)=>{
  const item=batch.items[spec.id],from=direction==='redo'?'draftRedo':'draftUndo',id=item[from+'StepIds']?.at(-1);
  if(!id)return null;
  const step=batch.draftSyncSteps?.find(s=>s.id===id);if(!step)throw fail('同类调整记录已变化，请刷新后重试');
  if(input.draft&&adDraftKey(input.draft)!==adDraftKey(item.draft))throw fail('编辑稿已更新，请刷新后重试');
  for(const entry of step.entries){
   const row=batch.items[entry.specId],expected=direction==='redo'?entry.before:entry.after;assertFree(row);
   if(!row||row[from+'StepIds']?.at(-1)!==id||adDraftKey(row.draft)!==adDraftKey(expected))throw fail('有同类尺寸已继续调整，不能一起撤销或重做；当前编辑稿已保留');
  }
  for(const entry of step.entries)moveAdDraftHistory(batch.items[entry.specId],direction);
  prune(batch);await save();return response(batch,spec,step.entries,{direction,skipped:[]});
 };
 return {apply,undo};
}
