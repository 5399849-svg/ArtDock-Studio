export const communityMaterialKind=asset=>asset.materialKind||(['mother-candidate','background','clean-kv'].includes(asset.role)&&asset.artworkMode!=='whole-artwork'?'illustration':['title','subtitle','logo'].includes(asset.role)?asset.role:asset.artworkMode==='whole-artwork'?'legacy':null);
export function communityMaterialGroups(task){
 const kinds=['illustration','title','subtitle','logo','legacy'];
 return kinds.map(kind=>({kind,assets:(task.assets||[]).filter(a=>isRenderableImageAsset(a)&&communityMaterialKind(a)===kind&&!a.extensionMode&&!a.libraryDeletedAt).slice().reverse()})).filter(g=>g.assets.length);
}
import {isRenderableImageAsset} from './editor-image-source.js';
