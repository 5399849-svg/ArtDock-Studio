import {communityReferences} from '../public/community-references.js';

const fail=(message,status=409)=>{throw Object.assign(Error(message),{status});};
export function assertReferenceScope(scope){if(!['illustration','text'].includes(scope))fail('参考图分组无效',422);}
export function initializeCommunityMaterialReferences(task){
 const p=task.parameters||={},all=communityReferences(task).map(a=>a.name),refs=p.communityMaterialReferences||={};
 for(const key of ['illustration','text'])if(!Array.isArray(refs[key]))refs[key]=[...all];
 return refs;
}
export function addCommunityMaterialReferences(task,{scope,assets,expectedUpdatedAt},now=new Date().toISOString()){
 assertReferenceScope(scope);if(task.updatedAt!==expectedUpdatedAt)fail('参考图已更新，请刷新后重新添加');
 const refs=initializeCommunityMaterialReferences(task);
 task.assets.push(...assets);refs[scope].push(...assets.map(a=>a.name));
 task.updatedAt=now;
 return task;
}
export function removeCommunityMaterialReference(task,{scope,name,expectedUpdatedAt},now=new Date().toISOString()){
 assertReferenceScope(scope);if(task.updatedAt!==expectedUpdatedAt)fail('参考图已更新，请刷新后再移除');
 const refs=initializeCommunityMaterialReferences(task);refs[scope]=refs[scope].filter(n=>n!==name);
 if(scope==='illustration'&&task.parameters.communityIllustrationOptions?.version===2&&task.parameters.communityIllustrationOptions.characterSourceName===name)task.parameters.communityIllustrationOptions={version:2,characterMode:'prompt',characterSourceName:'',action:'',side:'auto'};
 task.updatedAt=now;
 return task;
}
