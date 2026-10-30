import { isRenderableImageAsset } from './editor-image-source.js';

export const isCommunityReference = asset => ['reference-image', 'reference-tone', 'reference-copy'].includes(asset.role);

// Keep the composer numbering and model attachment order identical, including old tasks.
export const communityReferences = task => (task.assets || []).filter(asset => isCommunityReference(asset) && isRenderableImageAsset(asset));

export const communityMaterialReferenceScope=kind=>kind==='illustration'?'illustration':'text';
export function communityMaterialReferences(task,kind){
 const scope=communityMaterialReferenceScope(kind),names=task.parameters?.communityMaterialReferences?.[scope],assets=communityReferences(task);
 // Existing attachments start in both independent lists; removing one never
 // removes the other's attachment or its underlying file.
 return Array.isArray(names)?names.map(name=>assets.find(a=>a.name===name)).filter(Boolean):assets;
}
