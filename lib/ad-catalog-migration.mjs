// IDs belong to a placement, never to its current row/visible number.
const materialKeys=['width','height','format','logo','maxBytes','safeInsetX','requirements'];
const emptyDraft=()=>({sourceAssetId:'',logoAssetId:'',zoom:1,offsetX:0,offsetY:0,logoX:.78,logoY:.06,logoScale:.18});

export function migrateAdBatchesToCatalog(batches,catalog){
  const reports=[];
  for(const batch of batches){
    if(batch.sourceSha256===catalog.sourceSha256)continue;
    const previous=catalog.previousCatalogs?.find(c=>c.sourceSha256===batch.sourceSha256);
    // An unknown old table must remain explicitly out of date, not be guessed.
    if(!previous)continue;
    const oldById=new Map(previous.specs.map(s=>[s.id,s]));
    const currentIds=new Set(catalog.specs.map(s=>s.id));
    const oldDrafts=new Map(Object.entries(batch.items||{}).map(([id,i])=>[id,structuredClone(i.draft||{})]));
    const added=[],changed=[],removed=previous.specs.filter(s=>!currentIds.has(s.id));
    batch.items||={};
    for(const spec of catalog.specs){
      const old=oldById.get(spec.id);
      if(!old){
        added.push(spec.id);
        if(!batch.items[spec.id]){
          const equivalent=previous.specs.find(s=>s.width===spec.width&&s.height===spec.height&&s.format===spec.format&&s.logo===spec.logo&&oldDrafts.get(s.id)?.sourceAssetId);
          const seed=equivalent?oldDrafts.get(equivalent.id):{};
          batch.items[spec.id]={draft:{...emptyDraft(),...seed,logoAssetId:spec.logo==='required'?batch.activeLogoAssetId||seed.logoAssetId||'':''},versions:[]};
        }
        continue;
      }
      if(materialKeys.every(key=>(old[key]??null)===(spec[key]??null)))continue;
      changed.push(spec.id);
      const item=batch.items[spec.id];if(!item)continue;
      const changes=[];
      if(old.logo!==spec.logo)changes.push(spec.logo==='forbidden'?'现要求无 Logo':spec.logo==='required'?'现要求带 Logo':'Logo 要求已调整');
      if(old.width!==spec.width||old.height!==spec.height)changes.push(`尺寸改为 ${spec.width}×${spec.height}`);
      if(old.format!==spec.format)changes.push(`格式改为 ${spec.format}`);
      if(old.maxBytes!==spec.maxBytes)changes.push(`体积要求改为 ${spec.limitRaw}`);
      if(old.safeInsetX!==spec.safeInsetX)changes.push('保护区要求已调整');
      const reason=`规范已更新：${changes.join('；')||'文案与规范要求已调整'}，请按新要求重新保存候选稿。`;
      for(const version of item.versions||[]){
        version.specSnapshot||=structuredClone(old);
        version.invalidatedReason=[version.invalidatedReason,reason].filter(Boolean).join('；');
        version.review={...version.review,logoChecked:false,safeAreaChecked:false};
      }
      if(spec.logo==='forbidden'&&item.draft)item.draft.logoAssetId='';
      item.autoWarning=reason;
    }
    if(removed.length){
      const retired=new Map((batch.retiredSpecs||[]).map(s=>[s.id,s]));
      for(const spec of removed)retired.set(spec.id,structuredClone(spec));
      batch.retiredSpecs=[...retired.values()].filter(s=>!currentIds.has(s.id));
    }
    const report={from:batch.sourceSha256,to:catalog.sourceSha256,at:new Date().toISOString(),addedSpecIds:added,changedSpecIds:changed,removedSpecIds:removed.map(s=>s.id)};
    batch.catalogHistory||=[];batch.catalogHistory.push({...report,previousSpecs:structuredClone(previous.specs)});
    batch.catalogMigration=report;
    batch.sourceSha256=catalog.sourceSha256;
    reports.push({batchId:batch.id,...report});
  }
  return reports;
}
