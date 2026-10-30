import {loadCommunityObjectLayerImages} from './community-object-layers.js?v=20261022-object-canvas';
// Photoshop source documents remain downloadable assets, but cannot be decoded by <img>.
export function isRenderableImageAsset(asset) {
  if (!asset?.url) return false;
  const mime = (asset.mime || '').split(';')[0].toLowerCase();
  const paths = [asset.name, asset.url].filter(Boolean).map(value => String(value).split(/[?#]/)[0]);
  if (/photoshop|psd|psb/i.test(mime) || paths.some(value => /\.ps[db]$/i.test(value))) return false;
  return /^image\/(png|jpe?g|webp|gif|avif|bmp|x-icon|vnd\.microsoft\.icon|svg\+xml)$/.test(mime)
    || (!mime && (paths.some(value => /\.(png|jpe?g|webp|gif|avif|bmp|ico|svg)$/i.test(value)) || /^data:image\//i.test(asset.url)));
}

export function sourceImageCandidates(task) {
  const assets = (task.assets || []).filter(asset => asset.role !== 'source-character' && isRenderableImageAsset(asset) && !(asset.psdSourceHash && ['character','secondary-character','logo','title','subtitle','foreground'].includes(asset.role)));
  const explicit = assets.find(asset => asset.name === task.primaryAssetName && ['clean-kv', 'background', 'background-landscape', 'background-portrait'].includes(asset.role));
  const roles = task.masterCanvasId === 'portrait-1080x1920'
    ? ['background-portrait', 'clean-kv', 'background', 'background-landscape', 'master-portrait', 'master', 'master-landscape']
    : ['background-landscape', 'clean-kv', 'background', 'background-portrait', 'master-landscape', 'master', 'master-portrait'];
  return [...new Set([explicit, ...roles.flatMap(role => assets.filter(asset => asset.role === role)), ...assets].filter(Boolean))];
}

export function preferredSourceAsset(task) {
  return sourceImageCandidates(task)[0];
}

export async function loadEditorImages(task, loadImage) {
  const assetImages = new Map();
  if(task.sourceAdaptation){
    const ids=[task.masterTemplateId,...(task.targetTemplateIds||[])],names=new Set([task.sourceAdaptation.previewName,...(task.sourceAdaptation.reflow?.layers||[]).map(l=>l.assetName),...ids.flatMap(id=>(task.parameters?.sourceCompositionByTemplate?.[id]?.layers||[]).map(l=>l.assetName))]);
    for(const id of ids){const name=task.parameters?.sourceCompositionByTemplate?.[id]?.popup?.buttonBackingAsset;if(name)names.add(name);}
    for(const name of names){const asset=task.assets?.find(a=>a.name===name);if(!isRenderableImageAsset(asset))throw Error('源稿素材缺失：'+name);try{assetImages.set(name,await loadImage(asset.url));}catch{throw Error('源稿素材加载失败：'+name);}}
    const sourceAsset=task.assets.find(a=>a.name===task.sourceAdaptation.previewName);
    return {assetImages,sourceAsset,sourceImage:assetImages.get(sourceAsset.name)};
  }
  const bindings=Object.values(task.parameters?.assetByTemplate||{}).flatMap(value=>Object.values(value||{}));
  const assets = [...(task.assets || []), ...(task.localAi?.outputs || [])].filter(asset=>isRenderableImageAsset(asset)&&(!asset.objectRunId||bindings.includes(asset.name)));
  const loaded = await Promise.all(assets.map(async asset => {
    try { return await loadImage(asset.url); } catch { return null; }
  }));
  assets.forEach((asset, index) => { if (loaded[index]) assetImages.set(asset.name, loaded[index]); });
  await loadCommunityObjectLayerImages(task,loadImage,assetImages);
  const sourceAsset = sourceImageCandidates(task).find(asset => assetImages.has(asset.name)) || null;
  return { assetImages, sourceAsset, sourceImage: sourceAsset ? assetImages.get(sourceAsset.name) : null };
}
