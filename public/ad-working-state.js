export const adWorkingThumbnailUrl=(batchId,specId,item)=>`/api/ad-resources/batches/${encodeURIComponent(batchId)}/items/${encodeURIComponent(specId)}/preview?thumbnail=1&v=${encodeURIComponent(item?.draftUpdatedAt||'current')}`;

export function mergeAdWorkingUpdate(batch,specId,result){
 const changed=[];
 for(const patch of [{specId,...result},...(result.synced||[])]){
  const item=batch.items?.[patch.specId];if(!item)continue;
  if(patch.draft)item.draft={...patch.draft};
  item.draftDirty=Boolean(patch.draftDirty);item.draftCanUndo=Boolean(patch.canUndo);item.draftCanRedo=Boolean(patch.canRedo);
  if(patch.draftUpdatedAt)item.draftUpdatedAt=patch.draftUpdatedAt;
  changed.push(patch.specId);
 }
 return changed;
}
