import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

export async function loadIconPreorderSpecs(fileUrl = new URL("../config/icon-preorder-v1.json", import.meta.url)) {
  const config = JSON.parse(await fs.readFile(fileUrl, "utf8"));
  if (config.format !== "PNG" || config.specs.length !== (config.expectedCount || 16)) throw new Error("ICON预约规格表不完整");
  const ids = new Set();
  for (const spec of config.specs) {
    if (ids.has(spec.id) || !Number.isInteger(spec.width) || spec.width !== spec.height || !(Number.isInteger(spec.maxKB) && spec.maxKB > 0 || Number.isInteger(spec.minKB) && spec.minKB > 0) || !Number.isInteger(spec.cornerRadiusPx)) throw new Error(`ICON预约规格无效：${spec.id}`);
    if (spec.badge && (!spec.badgeAsset || !Number.isInteger(spec.badgeWidth) || !Number.isInteger(spec.badgeHeight))) throw new Error(`ICON角标配置无效：${spec.id}`);
    if (spec.outputFormat && !["PNG", "JPG"].includes(spec.outputFormat)) throw new Error(`ICON输出格式无效：${spec.id}`);
    ids.add(spec.id);
  }
  return config;
}

export async function inspectIconSource(input) {
  const metadata = await sharp(input, { limitInputPixels: 80000000 }).metadata();
  const sideways = [5, 6, 7, 8].includes(metadata.orientation);
  const width = sideways ? metadata.height : metadata.width;
  const height = sideways ? metadata.width : metadata.height;
  if (!["jpeg", "png", "webp"].includes(metadata.format) || !width || !height) throw new Error("原始ICON须为独立的 JPG、PNG 或 WebP 文件");
  if (width !== height) throw new Error(`原始ICON必须是正方形，当前为 ${width}×${height}`);
  if (width < 512) throw new Error("原始ICON边长不能小于512px");
  return { width, height, format: metadata.format };
}

function maskSvg(size, radius) {
  return Buffer.from(`<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg"><rect width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="white"/></svg>`);
}

async function encodeWithinLimit(buffer, maxBytes) {
  const candidates = [
    { palette: false, label: "RGBA" },
    ...[256, 192, 128, 96, 64, 48, 32, 24, 16].map((colors) => ({ palette: true, colors, label: `${colors}色` })),
  ];
  for (const candidate of candidates) {
    const encoded = await sharp(buffer).png({ compressionLevel: 9, effort: 10, palette: candidate.palette, colors: candidate.colors, dither: candidate.palette ? .85 : 1 }).toBuffer();
    if (encoded.length <= maxBytes) return { buffer: encoded, compression: candidate.label };
  }
  throw new Error(`无法压缩到 ${Math.round(maxBytes / 1024)}KB 以下`);
}

export function iconOutputName(spec) {
  return `${spec.channel}${spec.width}x${spec.height}${spec.cornerRadiusPx ? `圆角${spec.cornerRadiusPx}px` : "直角"}${spec.badge ? "带角标" : "无角标"}.${spec.outputFormat === "JPG" ? "jpg" : "png"}`;
}

export function iconZipPath(project, spec) {
  return `${project}/${spec.channel}/${iconOutputName(spec)}`;
}

export async function renderIcon(input, spec, { assetsDir }) {
  let buffer = await sharp(input, { limitInputPixels: 80000000 }).rotate().resize(spec.width, spec.height, { fit: "fill", kernel: "lanczos3" }).ensureAlpha().png().toBuffer();
  if (spec.cornerRadiusPx > 0) buffer = await sharp(buffer).composite([{ input: maskSvg(spec.width, spec.cornerRadiusPx), blend: "dest-in" }]).png().toBuffer();
  if (spec.badgeAsset) {
    const badge = await sharp(await fs.readFile(path.join(assetsDir, spec.badgeAsset))).resize(spec.badgeWidth, spec.badgeHeight, { fit: "fill" }).png().toBuffer();
    buffer = await sharp(buffer).composite([{ input: badge, left: spec.width - spec.badgeWidth, top: spec.height - spec.badgeHeight }]).png().toBuffer();
  }
  if (spec.contentSize) {
    const content = await sharp(input).rotate().resize(spec.contentSize,spec.contentSize).ensureAlpha().composite([{input:maskSvg(spec.contentSize,spec.contentRadiusPx),blend:'dest-in'}]).png().toBuffer();
    const backing = spec.transparentCanvas
      ? await sharp({create:{width:spec.width,height:spec.height,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).png().toBuffer()
      : await sharp(await fs.readFile(path.join(assetsDir,spec.backingAsset))).resize(spec.width,spec.height).flatten({background:'#ffffff'}).png().toBuffer();
    buffer = await sharp(backing).composite([{input:content,left:spec.contentInsetPx,top:spec.contentInsetPx}]).png().toBuffer();
  }
  if (spec.outputFormat === 'JPG') {
    for (const quality of [95,92,88,84,80,76,72,68,64,60,56,52,48,44,40,32,24]) {
      const jpg = await sharp(buffer).flatten({background:'#ffffff'}).jpeg({quality,mozjpeg:true,chromaSubsampling:'4:4:4'}).toBuffer();
      if (jpg.length > spec.maxKB * 1024) continue;
      const metadata = await sharp(jpg).metadata();
      if(metadata.format !== 'jpeg' || metadata.width !== spec.width || metadata.height !== spec.height) throw new Error(`${spec.id} JPG导出校验失败`);
      return {buffer:jpg,bytes:jpg.length,format:'JPG',compression:`JPG Q${quality}`,warnings:quality<64?['文件上限较严，请检查压缩后的细节']:[]};
    }
    throw new Error(`${spec.channel} ${spec.width}×${spec.height} JPG 无法压缩到 ${spec.maxKB}KB 以下`);
  }
  let encoded = await encodeWithinLimit(buffer, spec.maxKB ? spec.maxKB * 1024 : Infinity);
  if (spec.minKB && encoded.buffer.length < spec.minKB * 1024) {
    encoded = {buffer:await sharp(buffer).ensureAlpha().png({compressionLevel:0,palette:false}).toBuffer(),compression:'RGBA 无损（满足大小下限）'};
  }
  if (spec.minKB && encoded.buffer.length < spec.minKB*1024) throw new Error('ICON未达到文件大小下限');
  const actual = await sharp(encoded.buffer).metadata();
  if (actual.format !== "png" || actual.width !== spec.width || actual.height !== spec.height) throw new Error(`${spec.id} 导出校验失败`);
  const warnings = [];
  if (!encoded.compression.startsWith("RGBA")) warnings.push(`文件上限较严，已使用${encoded.compression}PNG，请检查细节`);
  return { buffer: encoded.buffer, bytes: encoded.buffer.length, compression: encoded.compression, warnings };
}
