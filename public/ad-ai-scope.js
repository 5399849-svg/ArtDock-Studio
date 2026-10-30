const gcd=(a,b)=>b?gcd(b,a%b):a;
export function adAiScopeKey(spec){
 const d=gcd(spec.width,spec.height);
 return `${spec.format}:${spec.width/d}:${spec.height/d}:${(spec.safeInsetX||0)/spec.width}:${(spec.safeInsetY||0)/spec.height}`;
}
export const adAiSameTypeSpecs=(spec,specs)=>specs.filter(s=>s.format==='JPG'&&adAiScopeKey(s)===adAiScopeKey(spec));
export function adAiTypeLabel(spec){const d=gcd(spec.width,spec.height);return `${spec.width===spec.height?'方版':spec.width<spec.height?'竖版':'横版'} ${spec.width/d}:${spec.height/d}`;}
export function adAiDefaultScope(spec,specs,{job,storedScope}={}){
 if(adAiSameTypeSpecs(spec,specs).length<2)return 'current';
 if(['queued','preparing','submitting','processing','downloading','saving','result_uncertain','awaiting_review'].includes(job?.status))return job.groupId?'same-ratio':'current';
 return storedScope==='current'?'current':'same-ratio';
}
