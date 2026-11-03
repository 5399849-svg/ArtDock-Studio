import {communityObjectLayerImageKey,communityObjectLayerImageUrl} from './community-object-layers.js';

// 某个尺寸某一项没有明确选用素材时，画布按角色自动挑（app.js automaticAsset，挑之前要比较各候选图的比例），这些角色的图要先有。
// 其它角色（参考图、母版候选、组合预览、角色源图、补充素材……）只在被选用时才下，用到时再取。
const AUTO_KINDS = {
  background: ['clean-kv', 'background', 'background-landscape', 'background-portrait', 'master', 'master-landscape', 'master-portrait'],
  character: ['character', 'core-character'], foreground: ['foreground'], title: ['title'], subtitle: ['subtitle'], logo: ['logo'],
  'ip-copyright': ['ip-copyright', 'copyright'], button: ['button'],
};

// 社区尺寸的这一项会不会自动挑（对照 app.js selectedAssetName、templateAllowsElement、defaultElementLayout、按钮按文案匹配）。
function communityPicksAutomatically(task, template, chosen, kind) {
  return (kind === 'character' ? ['character', 'character2'] : [kind]).some(key => {
    if (chosen[key]) return false;
    if (key === 'logo' && template.brandLogo !== true || key === 'ip-copyright' && template.ipCopyright !== true) return false;
    const off = Object.hasOwn(chosen, key) && chosen[key] === null;
    // 没选按钮时还会按文案匹配按钮；人物默认位置没有固定区域时按自动挑的人物算，写了“不用”也一样。
    if (key === 'button') return true;
    if (key === 'character') return !(off && template.communityLayout?.character);
    if (off) return false;
    const masterBackground = task.parameters?.assetByTemplate?.[task.masterTemplateId]?.background;
    return !(key === 'background' && template.id !== task.masterTemplateId && task.assets?.some(asset => asset.name === masterBackground));
  });
}

// 画这几个尺寸时会被自动挑到的角色。平台 PSD 尺寸还会按图挑版式（choosePsdVariant），照旧全要。
function automaticRoles(task, ids) {
  const templates = [task.masterTemplate, ...(task.templates || [])].filter(Boolean), kinds = new Set(), all = new Set(Object.values(AUTO_KINDS).flat());
  if (!ids.length) return all;
  for (const id of ids) {
    const template = templates.find(item => item.id === id);
    if (!template?.communityPlacement) return all;
    for (const kind of Object.keys(AUTO_KINDS)) if (communityPicksAutomatically(task, template, task.parameters?.assetByTemplate?.[id] || {}, kind)) kinds.add(kind);
  }
  return new Set([...kinds].flatMap(kind => AUTO_KINDS[kind]));
}
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
 * 包括这几个尺寸按名字选用的素材、会被自动挑到的角色的素材（背景要自动挑时连首选背景一起）、本机计算结果。
 */
export function editorImageEntries(task, templateIds) {
  const parameters = task.parameters || {}, ids = templateIds.filter(Boolean), names = canvasAssetNames(parameters, ids), roles = automaticRoles(task, ids);
  const source = roles.has('background') ? sourceImageCandidates(task)[0] : null, entries = new Map();
  for (const asset of task.assets || []) {
    if (!isRenderableImageAsset(asset)) continue;
    // 独立素材导出的 PNG 只在画布上用到时才下。
    if (names.has(asset.name) || source && (asset === source || asset.name === task.primaryAssetName) || !asset.objectRunId && roles.has(asset.role)) entries.set(asset.name, asset.url);
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

/** 把 entries 里还没有的图下到 images，每下完（或下不到）一张调一次 onSettled。坏图跳过；独立素材图层下不到要报错（下次再试）。 */
export function loadEditorImageEntries(images, entries, loadImage, onSettled) {
  const {running, failed} = loadsOf(images);
  return Promise.all(missingEditorImages(images, entries).map(({key, url}) => {
    if (!running.has(key)) running.set(key, Promise.resolve().then(() => loadImage(url)).then(
      image => { images.set(key, image); },
      error => { if (key.startsWith('object-layer:')) throw error; failed.add(key); },
    ).finally(() => running.delete(key)));
    const job = running.get(key);
    if (onSettled) job.then(onSettled, onSettled);
    return job;
  }));
}

/**
 * 首选背景（state.sourceImage：画布、扩图找不到背景时用它；生成成套要有它）。母版画面一般不画它，所以不跟画面的图一起先下，
 * 放到后台下；在下载时 state.sourceAsset 已经是它（扩图只用它的地址），下载失败才换成下一张已经下到的候选图。
 */
export function sourceImageEntry(task) {
  const source = sourceImageCandidates(task)[0];
  return source ? [{key: source.name, url: source.url}] : [];
}
export function currentSourceAsset(task, images) {
  const candidates = sourceImageCandidates(task);
  if (candidates[0] && !loadsOf(images).failed.has(candidates[0].name)) return candidates[0];
  return candidates.find(asset => images.has(asset.name)) || null;
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
  const sourceAsset = currentSourceAsset(task, assetImages);
  const editorImagesLoading = loadEditorImageEntries(assetImages, [...editorImageEntries(task, editorTemplateIds(task)), ...sourceImageEntry(task)], url => loadImage(url, 'low')).then(() => {});
  editorImagesLoading.catch(() => {});
  return { assetImages, sourceAsset, sourceImage: sourceAsset && assetImages.get(sourceAsset.name) || null, editorImagesLoading };
}
