import {communityObjectLayerImageKey,communityObjectLayerImageUrl} from './community-object-layers.js';

// 画布按角色自动挑素材时（app.js automaticAsset、referenceAssetsForTemplate、按钮按文案匹配）只看这些角色，挑之前要比较图片比例，
// 所以这些角色的图打开就要有。其它角色（参考图、母版候选、组合预览、角色源图、补充素材……）参数里写到了才下，用到时再取。
const AUTO_ROLES = new Set(['clean-kv', 'background', 'background-landscape', 'background-portrait', 'master', 'master-landscape', 'master-portrait',
  'character', 'core-character', 'foreground', 'title', 'subtitle', 'logo', 'ip-copyright', 'copyright', 'button']);
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

// 画布按名字取图的地方（app.js selectedAssetName、drawProtectedOriginal、drawSubtitleBacking、弹窗按钮底板）。修订快照、参考图清单这类
// 参数里也写着素材名，但画布不画；独立素材图层按 placed-image 地址另外下，不用它的原图。
function canvasAssetNames(parameters, ids) {
  const names = Object.values(parameters.assetByRole || {});
  for (const id of ids) names.push(...Object.values(parameters.assetByTemplate?.[id] || {}), parameters.backgroundByTemplate?.[id]?.sourceAssetName,
    parameters.layoutByTemplate?.[id]?.['subtitle-backing']?.backing?.assetName, parameters.communityPopupByTemplate?.[id]?.buttonBackingAsset);
  return new Set(names.filter(name => typeof name === 'string' && name));
}

/** 任务所有尺寸（母版、目标尺寸）的编号。 */
export function editorTemplateIds(task) {
  return [...new Set([task.masterTemplateId, ...(task.targetTemplateIds || []), ...(task.templates || []).map(template => template.id)].filter(Boolean))];
}

/**
 * 画 templateIds 这几个尺寸要用的图：[{key, url}]，key 是 assetImages 里的键（素材名、`__outpaint_<尺寸>`、独立素材图层）。
 * 包括画布会按角色自动挑的素材、本机计算结果、首选背景，以及这几个尺寸按名字选用的素材。
 */
export function editorImageEntries(task, templateIds) {
  const parameters = task.parameters || {}, ids = templateIds.filter(Boolean), names = canvasAssetNames(parameters, ids);
  const source = sourceImageCandidates(task)[0], entries = new Map();
  for (const asset of task.assets || []) {
    if (!isRenderableImageAsset(asset)) continue;
    // 独立素材导出的 PNG 只在画布上用到时才下。
    if (names.has(asset.name) || asset === source || asset.name === task.primaryAssetName || !asset.objectRunId && AUTO_ROLES.has(asset.role)) entries.set(asset.name, asset.url);
  }
  for (const asset of task.localAi?.outputs || []) if (isRenderableImageAsset(asset)) entries.set(asset.name, asset.url);
  for (const id of ids) {
    const outpaint = parameters.backgroundByTemplate?.[id]?.url;
    if (outpaint) entries.set(`__outpaint_${id}`, outpaint);
    for (const layer of parameters.communityObjectLayersByTemplate?.[id] || []) entries.set(communityObjectLayerImageKey(task, layer), communityObjectLayerImageUrl(task, layer));
  }
  return [...entries].map(([key, url]) => ({key, url}));
}

// 每个 assetImages 正在下的图（同一张不重复下）和下不到的图（不再重试，和以前一样不挡编辑器）。
const imageLoads = new WeakMap();
function loadsOf(images) {
  if (!imageLoads.has(images)) imageLoads.set(images, {running: new Map(), failed: new Set()});
  return imageLoads.get(images);
}

/** entries 里还没下、也没下失败过的。 */
export function missingEditorImages(images, entries) {
  const {failed} = loadsOf(images);
  return entries.filter(({key}) => !images.has(key) && !failed.has(key));
}

/** 把 entries 里还没有的图下到 images。坏图跳过；独立素材图层下不到要报错（下次再试）。 */
export function loadEditorImageEntries(images, entries, loadImage) {
  const {running, failed} = loadsOf(images);
  return Promise.all(missingEditorImages(images, entries).map(({key, url}) => {
    if (!running.has(key)) running.set(key, Promise.resolve().then(() => loadImage(url)).then(
      image => { images.set(key, image); },
      error => { if (key.startsWith('object-layer:')) throw error; failed.add(key); },
    ).finally(() => running.delete(key)));
    return running.get(key);
  }));
}

/**
 * 打开任务时先下 templateId（当前显示的尺寸）和母版要画的图，下完就返回，编辑器可以先显示；其它尺寸的图在后台接着下，
 * editorImagesLoading 是它的进度，导出、下载前要等它。
 */
export async function loadEditorImages(task, loadImage, {templateId} = {}) {
  const assetImages = new Map();
  if(task.sourceAdaptation){
    const ids=[task.masterTemplateId,...(task.targetTemplateIds||[])],names=new Set([task.sourceAdaptation.previewName,...(task.sourceAdaptation.reflow?.layers||[]).map(l=>l.assetName),...ids.flatMap(id=>(task.parameters?.sourceCompositionByTemplate?.[id]?.layers||[]).map(l=>l.assetName))]);
    for(const id of ids){const name=task.parameters?.sourceCompositionByTemplate?.[id]?.popup?.buttonBackingAsset;if(name)names.add(name);}
    for(const name of names){const asset=task.assets?.find(a=>a.name===name);if(!isRenderableImageAsset(asset))throw Error('源稿素材缺失：'+name);try{assetImages.set(name,await loadImage(asset.url));}catch{throw Error('源稿素材加载失败：'+name);}}
    const sourceAsset=task.assets.find(a=>a.name===task.sourceAdaptation.previewName);
    return {assetImages,sourceAsset,sourceImage:assetImages.get(sourceAsset.name),editorImagesLoading:Promise.resolve()};
  }
  await loadEditorImageEntries(assetImages, editorImageEntries(task, [task.masterTemplateId, templateId]), loadImage);
  const sourceAsset = sourceImageCandidates(task).find(asset => assetImages.has(asset.name)) || null;
  const editorImagesLoading = loadEditorImageEntries(assetImages, editorImageEntries(task, editorTemplateIds(task)), loadImage).then(() => {});
  editorImagesLoading.catch(() => {});
  return { assetImages, sourceAsset, sourceImage: sourceAsset ? assetImages.get(sourceAsset.name) : null, editorImagesLoading };
}
