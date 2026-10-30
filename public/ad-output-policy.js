// The policy is captured on creation. A missing policy means the original rules.
export function adCatalogWithOutputPolicy(catalog,policy){
  if(!policy)return catalog;
  return {...catalog,outputPolicyVersion:policy.version,specs:catalog.specs.map(spec=>adSpecWithOutputPolicy(spec,policy))};
}

export function adSpecWithOutputPolicy(spec,policy){
  const rule=policy?.rules.find(rule=>['platform','width','height','format'].every(key=>rule[key]===spec[key]));
  return rule?{...spec,...Object.fromEntries(['minBytes','maxBytes','maxBytesInclusive','limitRaw','jpegProfile'].map(key=>[key,rule[key]]))}:spec;
}

export function adWorkspaceCatalog(data,batch){
  return batch?adCatalogWithOutputPolicy(data.baseCatalog||data.catalog,batch.outputPolicy):data.catalog;
}
