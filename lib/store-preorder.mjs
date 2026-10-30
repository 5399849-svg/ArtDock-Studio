import fs from "node:fs/promises";
import sharp from "sharp";
import { layerGeometry, orderedLayers, foregroundClipPercent } from '../public/store-layer-geometry.js';

export const STORE_PAGE_COUNT = 6;

export async function loadStorePreorderSpecs(fileUrl = new URL("../config/store-preorder-v1.json", import.meta.url)) {
  const config = JSON.parse(await fs.readFile(fileUrl, "utf8"));
  if (config.pagesPerSet !== STORE_PAGE_COUNT || config.format !== "JPG" || config.specs.length !== (config.expectedCount || 22)) throw new Error("商店图预约规格表不完整");
  const keys = new Set();
  for (const spec of config.specs) {
    const key = `${spec.channel}/${spec.width}x${spec.height}`;
    if (keys.has(key) || !Number.isInteger(spec.width) || !Number.isInteger(spec.height) || !Number.isInteger(spec.maxKB)) throw new Error(`商店图预约规格无效：${key}`);
    keys.add(key);
  }
  return config;
}

export function selectPageSource(sources, spec) {
  const orientation = spec.height > spec.width ? "portrait" : "landscape";
  return sources.find((item) => item.variant === orientation) || sources.find((item) => item.variant === "primary") || sources[0] || null;
}

export function outputName(spec, page) {
  return `${spec.width}x${spec.height}-${page}.jpg`;
}

export function outputZipPath(project, spec, page) {
  return `${project}/${spec.channel}/${spec.channel}${spec.width}x${spec.height}/${outputName(spec, page)}`;
}

const ADVANCED_SPECS = new Set(["VIVO/1080x720", "小米/2048x1536", "九游UC/1080x720", "4399/1600x960", "黑鲨/600x600"]);

export function needsAdvancedComposition(spec) {
  if (spec.composition) return spec.composition === 'extend';
  return ADVANCED_SPECS.has(`${spec.channel}/${spec.width}x${spec.height}`);
}

export function defaultLayerAdjustments() {
  return Object.fromEntries(["background", "character", "copy", "screenshot", "logo"].map((id) => [id, { x:0, y:0, scale:100, visible:true, locked:id === "background" }]));
}

function normalizedLayerAdjustments(value = {}) {
  const defaults = defaultLayerAdjustments();
  for (const id of Object.keys(defaults)) {
    const input = value[id] || {};
    defaults[id] = {
      x:Math.max(-100, Math.min(100, Number(input.x) || 0)),
      y:Math.max(-100, Math.min(100, Number(input.y) || 0)),
      scale:Math.max(40, Math.min(240, Number(input.scale) || 100)),
      visible:input.visible !== false,
      locked:Boolean(input.locked ?? (id === "background")),
      occlude:input.occlude !== false,
    };
  }
  return defaults;
}

async function placedLayer(buffer, sourceSize, targetSize, adjustment, { cover = true, layer = null } = {}) {
  if (layer) {
    const clip=foregroundClipPercent(layer,adjustment);
    if(clip>0) {
      const {data,info}=await sharp(buffer).ensureAlpha().raw().toBuffer({resolveWithObject:true});
      const cutoff=Math.round(info.height*(1-clip/100));
      for(let y=cutoff;y<info.height;y++) for(let x=0;x<info.width;x++) data[(y*info.width+x)*4+3]=0;
      buffer=await sharp(data,{raw:info}).png().toBuffer();
    }
    const g = layerGeometry(layer, sourceSize, targetSize, adjustment);
    const x = Math.max(0, g.left), y = Math.max(0, g.top);
    const right = Math.min(targetSize.width, g.left + g.width), bottom = Math.min(targetSize.height, g.top + g.height);
    if (right <= x || bottom <= y) return null;
    const input = await sharp(buffer).resize(g.width, g.height, { fit:'fill' }).extract({left:x-g.left,top:y-g.top,width:right-x,height:bottom-y}).png().toBuffer();
    return {input,left:x,top:y};
  }
  const baseScale = cover ? Math.max(targetSize.width / sourceSize.width, targetSize.height / sourceSize.height) : Math.min(targetSize.width / sourceSize.width, targetSize.height / sourceSize.height);
  const scale = baseScale * adjustment.scale / 100;
  const width = Math.max(1, Math.round(sourceSize.width * scale));
  const height = Math.max(1, Math.round(sourceSize.height * scale));
  const left = Math.round((targetSize.width - width) / 2 + targetSize.width * adjustment.x / 100);
  const top = Math.round((targetSize.height - height) / 2 + targetSize.height * adjustment.y / 100);
  const x1 = Math.max(0, left), y1 = Math.max(0, top);
  const x2 = Math.min(targetSize.width, left + width), y2 = Math.min(targetSize.height, top + height);
  if (x2 <= x1 || y2 <= y1) return null;
  const resized = await sharp(buffer, { limitInputPixels:80000000 }).resize(width, height, { fit:"fill", kernel:"lanczos3" }).png().toBuffer();
  const clipped = await sharp(resized).extract({ left:x1 - left, top:y1 - top, width:x2 - x1, height:y2 - y1 }).png().toBuffer();
  return { input:clipped, left:x1, top:y1 };
}

export async function renderLayeredStorePage(layerFiles, manifest, spec, inputAdjustments = {}) {
  const adjustments = normalizedLayerAdjustments(inputAdjustments);
  const targetSize = { width:spec.width, height:spec.height, composition:spec.composition };
  const sourceSize = { width:manifest.width, height:manifest.height };
  const layerById = new Map(manifest.layers.map((item) => [item.id, item]));
  const background = layerById.get("background");
  const backgroundPlacement = await placedLayer(layerFiles.get(background.id), sourceSize, targetSize, adjustments.background, {layer:background.rect ? background : null});
  let canvas = sharp({ create:{ width:spec.width, height:spec.height, channels:4, background:{ r:245, g:239, b:242, alpha:1 } } });
  if (backgroundPlacement && adjustments.background.visible) canvas = canvas.composite([backgroundPlacement]);
  let composed = await canvas.png().toBuffer();
  for (const {id} of orderedLayers(manifest).filter(l=>l.id!=='background')) {
    const layer = layerById.get(id);
    if (!layer?.visible || !adjustments[id].visible || !layerFiles.has(id)) continue;
    const placement = await placedLayer(layerFiles.get(id), sourceSize, targetSize, adjustments[id], { cover:false, layer:layer.rect ? layer : null });
    if (placement) composed = await sharp(composed).composite([placement]).png().toBuffer();
  }
  let result = null, quality = 0;
  for (const candidate of [88, 76, 64, 52, 40, 28]) {
    const buffer = await sharp(composed).flatten({ background:"#f5eff2" }).jpeg({ quality:candidate, mozjpeg:true, chromaSubsampling:"4:4:4" }).toBuffer();
    if (buffer.length <= spec.maxKB * 1024) { result = buffer; quality = candidate; break; }
  }
  if (!result) throw new Error(`${spec.channel}${spec.width}x${spec.height} 分层合成后无法压到 ${spec.maxKB}KB 以下`);
  const warnings = manifest.method?.startsWith("psd-direct")
    ? []
    : ["已启用JPG自动拆层，请重点检查人物发丝、文案与截图边缘"];
  if (background.compositeArtwork && !background.protectedExpansion) warnings.push('首图可使用“保护原图扩图”补齐外围；原有人物和色调保持不变');
  if (quality < 64) warnings.push('文件上限较严，请检查小字清晰度');
  if (spec.safeTopPx || spec.safeBottomPx) warnings.push(`上下文案安全区：${spec.safeTopPx || 0}px / ${spec.safeBottomPx || 0}px`);
  return { buffer:result, bytes:result.length, quality, adjustment:adjustments, warnings, layerMethod:manifest.method };
}

export async function inspectPageSource(input) {
  const metadata = await sharp(input, { limitInputPixels: 80000000 }).metadata();
  if (!["jpeg", "png", "webp"].includes(metadata.format) || !metadata.width || !metadata.height || metadata.width < 150 || metadata.height < 150) throw new Error("六张源图须为独立的高分辨率 JPG、PNG 或 WebP 文件");
  const pixel = await sharp(input).rotate().extract({ left: 0, top: 0, width: 1, height: 1 }).removeAlpha().raw().toBuffer();
  const background = `#${Array.from(pixel.subarray(0, 3), (value) => value.toString(16).padStart(2, "0")).join("")}`;
  const sideways = [5, 6, 7, 8].includes(metadata.orientation);
  return { width: sideways ? metadata.height : metadata.width, height: sideways ? metadata.width : metadata.height, format: metadata.format, background };
}

export async function renderStorePage(input, sourceInfo, spec, { outpaintProvider = null, adjustment = {} } = {}) {
  const maxBytes = spec.maxKB * 1024;
  const sourceRatio = sourceInfo.width / sourceInfo.height;
  const targetRatio = spec.width / spec.height;
  const aspectDelta = Math.abs(Math.log(sourceRatio / targetRatio));
  const rotated = await sharp(input, { limitInputPixels: 80000000 }).rotate().png().toBuffer();
  let prepared = rotated;
  let outpaintApplied = false;
  let sourceRect = { x:0, y:0, width:1, height:1 };
  let outpaintJobId = "";
  if (aspectDelta > .025 && spec.composition !== 'crop-center') {
    if (typeof outpaintProvider !== "function") throw new Error(`${spec.channel}${spec.width}x${spec.height} 需要真实自动扩图，但扩图服务未接入`);
    const extended = await outpaintProvider({ sourceBuffer:rotated, sourceInfo, spec });
    prepared = extended.buffer;
    sourceRect = extended.sourceRect;
    outpaintJobId = extended.jobId || "";
    outpaintApplied = true;
  }
  const preparedInfo = await sharp(prepared, { limitInputPixels:80000000 }).metadata();
  const zoom = Math.max(100, Math.min(200, Number(adjustment.zoom) || 100));
  const focalX = Math.max(0, Math.min(100, Number(adjustment.focalX) || 50));
  const focalY = Math.max(0, Math.min(100, Number(adjustment.focalY) || 50));
  const baseScale = outpaintApplied
    ? Math.max(spec.width / preparedInfo.width, spec.height / preparedInfo.height)
    : Math.max(spec.width / sourceInfo.width, spec.height / sourceInfo.height);
  const renderScale = baseScale * zoom / 100;
  const resizedWidth = Math.max(spec.width, Math.round((preparedInfo.width || sourceInfo.width) * renderScale));
  const resizedHeight = Math.max(spec.height, Math.round((preparedInfo.height || sourceInfo.height) * renderScale));
  const extractLeft = Math.round((resizedWidth - spec.width) * focalX / 100);
  const extractTop = Math.round((resizedHeight - spec.height) * focalY / 100);
  let result = null, quality = 0;
  for (const candidate of [88, 76, 64, 52, 40, 28]) {
    const buffer = await sharp(prepared, { limitInputPixels: 80000000 })
      .resize(resizedWidth, resizedHeight, { fit:"fill", kernel:"lanczos3" })
      .extract({ left:extractLeft, top:extractTop, width:spec.width, height:spec.height })
      .flatten({ background: sourceInfo.background })
      .jpeg({ quality: candidate, mozjpeg: true, chromaSubsampling: "4:4:4" })
      .toBuffer();
    if (buffer.length <= maxBytes) { result = buffer; quality = candidate; break; }
  }
  if (!result) throw new Error(`${spec.channel}${spec.width}x${spec.height} 无法在保持画面尺寸的同时压到 ${spec.maxKB}KB 以下`);
  const actual = await sharp(result).metadata();
  if (actual.width !== spec.width || actual.height !== spec.height || actual.format !== "jpeg") throw new Error("商店图导出格式或尺寸校验失败");
  const scaledWidth = sourceRatio > targetRatio ? spec.width : spec.height * sourceRatio;
  const scaledHeight = sourceRatio > targetRatio ? spec.width / sourceRatio : spec.height;
  const warnings = [];
  if (sourceInfo.width < scaledWidth * .7 || sourceInfo.height < scaledHeight * .7) warnings.push("源图分辨率偏低，请检查放大后的文字与界面清晰度");
  if (quality < 64) warnings.push("文件上限较严，请检查压缩后细节和文字清晰度");
  if (spec.safeTopPx || spec.safeBottomPx) warnings.push(`顶部 ${spec.safeTopPx || 0}px、底部 ${spec.safeBottomPx || 0}px 为文案遮挡区，请人工核对`);
  return { buffer: result, width: actual.width, height: actual.height, format: "JPG", bytes: result.length, quality, warnings, outpaintApplied, outpaintMethod:outpaintApplied ? "nano-banana-outpaint" : "matched-ratio-resize", outpaintJobId, sourceRect, adjustment:{ zoom, focalX, focalY } };
}
