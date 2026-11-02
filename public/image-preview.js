// 列表、卡片、缩略条里显示的图片用服务器缩小过的预览（地址后面加 ?w=，lib/image-previews.mjs；做法同 QCanvas）。
// 编辑器画布不用这个：它按图片的真实宽高算位置，服务器给它的是尺寸不变的压缩版（见 lib/image-previews.mjs）；下载照旧是原图。
// 档位要和服务器的 PREVIEW_WIDTHS 一样；w 限制的是最长边。
const WIDTHS = [128, 256, 384, 512, 768, 1024, 1536, 2048];
const PREVIEWABLE = /^\/(?:storage|ad-reference|channel-sample)\/[^?#]+\.(?:png|jpe?g|webp)(?:[?#]|$)/i;
// 投放成品的版本图有现成的缩略图接口（最长 360×240），小框里用它。
const AD_VERSION_IMAGE = /^(\/api\/ad-resources\/batches\/[\w%-]+\/items\/[\w%-]+\/versions\/\d+)\/image$/;
// 封面裁切（object-fit: cover）时竖图的长边要比框宽更长，留些余量才不糊。
const SHARPNESS = 1.4;

/** 显示框较长一边是 cssEdge（CSS 像素）时该用的地址；不是工作台存的图片就原样返回。 */
export function previewSrc(url, cssEdge) {
  const ratio = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
  const ad = typeof url === 'string' && AD_VERSION_IMAGE.exec(url);
  if (ad) return Number(cssEdge) * ratio <= 480 ? `${ad[1]}/thumbnail` : url;
  if (typeof url !== 'string' || !PREVIEWABLE.test(url)) return url;
  const wanted = Math.ceil(Number(cssEdge) * ratio * SHARPNESS);
  const width = WIDTHS.find(value => value >= wanted) ?? WIDTHS.at(-1);
  const [base, hash = ''] = url.split('#');
  return `${base}${base.includes('?') ? '&' : '?'}w=${width}${hash ? `#${hash}` : ''}`;
}
