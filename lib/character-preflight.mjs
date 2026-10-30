import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { safeChild, sanitizeFileName } from './core.mjs';

export const CHARACTER_ROLES = ['character', 'core-character', 'secondary-character'];
const VERSION = 'white-border-connected-v1';
const isWhite = (data, pixel) => {
  const i = pixel * 4;
  return data[i] >= 245 && data[i + 1] >= 245 && data[i + 2] >= 245
    && Math.max(data[i], data[i + 1], data[i + 2]) - Math.min(data[i], data[i + 1], data[i + 2]) <= 8;
};

function whiteBorderRegion(data, width, height) {
  const visited = new Uint8Array(width * height), queue = new Int32Array(width * height);
  let head = 0, tail = 0;
  const push = pixel => {
    if (!visited[pixel] && isWhite(data, pixel)) { visited[pixel] = 1; queue[tail++] = pixel; }
  };
  for (let x = 0; x < width; x++) { push(x); push((height - 1) * width + x); }
  for (let y = 1; y + 1 < height; y++) { push(y * width); push(y * width + width - 1); }
  while (head < tail) {
    const pixel = queue[head++], x = pixel % width;
    if (x) push(pixel - 1);
    if (x + 1 < width) push(pixel + 1);
    if (pixel >= width) push(pixel - width);
    if (pixel + width < width * height) push(pixel + width);
  }
  return { visited, count: tail };
}

function whitePanelAtTransparentEdge(data, width, height) {
  const total = width * height, visited = new Uint8Array(total), queue = new Int32Array(total);
  let head = 0, tail = 0;
  const push = pixel => {
    if (!visited[pixel] && data[pixel * 4 + 3] >= 240 && isWhite(data, pixel)) { visited[pixel] = 1; queue[tail++] = pixel; }
  };
  for (let pixel = 0; pixel < total; pixel++) {
    if (data[pixel * 4 + 3] > 16) continue;
    const x = pixel % width;
    if (x) push(pixel - 1);
    if (x + 1 < width) push(pixel + 1);
    if (pixel >= width) push(pixel - width);
    if (pixel + width < total) push(pixel + width);
  }
  while (head < tail) {
    const pixel = queue[head++], x = pixel % width;
    if (x) push(pixel - 1);
    if (x + 1 < width) push(pixel + 1);
    if (pixel >= width) push(pixel - width);
    if (pixel + width < total) push(pixel + width);
  }
  return tail / total;
}

/** Check pixel alpha, rather than treating PNG or an alpha channel as a cutout. */
export async function assessCharacterTransparency(input) {
  const { data, info } = await sharp(input, { limitInputPixels: 64_000_000 }).toColourspace('srgb').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info, total = width * height;
  let transparent = 0, nonOpaque = 0, solidPixels = 0, borderCount = 0, borderTransparent = 0, borderWhite = 0;
  let whiteSum = 0, whiteSquares = 0;
  for (let pixel = 0; pixel < total; pixel++) {
    const i = pixel * 4, alpha = data[i + 3], x = pixel % width;
    if (alpha <= 16) transparent++;
    if (alpha < 250) nonOpaque++;
    if (alpha >= 240) solidPixels++;
    if (pixel < width || pixel >= total - width || !x || x === width - 1) {
      borderCount++;
      if (alpha <= 16) borderTransparent++;
      if (isWhite(data, pixel)) {
        borderWhite++;
        const value = (data[i] + data[i + 1] + data[i + 2]) / 3;
        whiteSum += value; whiteSquares += value * value;
      }
    }
  }
  const actualTransparency = transparent / total >= .001 && borderTransparent / borderCount >= .05 && solidPixels / total >= .001;
  const report = { version: VERSION, width, height, actualTransparency,
    nonOpaquePixels: nonOpaque, transparentFraction: transparent / total,
    transparentBorderFraction: borderTransparent / borderCount,
    status: actualTransparency ? 'ready' : 'needs-cutout', needsCutout: !actualTransparency,
    safeWhiteBackground: false };
  if (actualTransparency) {
    report.residualOpaqueWhiteFraction = whitePanelAtTransparentEdge(data, width, height);
    if (report.residualOpaqueWhiteFraction >= .015) {
      report.actualTransparency = false;
      report.status = 'needs-cutout'; report.needsCutout = true;
      report.reason = 'transparent-margin-with-opaque-white-panel';
    }
    return report;
  }
  // Partial alpha without a transparent border is ambiguous; preserve its pixels.
  if (nonOpaque) { report.reason = 'alpha-with-opaque-border'; return report; }
  const variance = borderWhite ? whiteSquares / borderWhite - (whiteSum / borderWhite) ** 2 : Infinity;
  const corners = [0, width - 1, total - width, total - 1];
  if (borderWhite / borderCount < .985 || variance > 12 || !corners.every(pixel => isWhite(data, pixel))) {
    report.reason = 'background-requires-subject-segmentation'; return report;
  }
  const region = whiteBorderRegion(data, width, height);
  const backgroundFraction = region.count / total;
  // Empty images and nearly empty images are not confidently identified characters.
  report.safeWhiteBackground = backgroundFraction >= .1 && backgroundFraction <= .94;
  report.backgroundFraction = backgroundFraction;
  report.reason = report.safeWhiteBackground ? 'uniform-white-border' : 'ambiguous-subject';
  return report;
}

/** Remove only border-connected white; white eyes, horns and props enclosed by outlines survive. */
export async function removeConnectedWhiteBackground(input) {
  const { data, info } = await sharp(input, { limitInputPixels: 64_000_000 }).toColourspace('srgb').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info, { visited, count } = whiteBorderRegion(data, width, height);
  for (let pixel = 0; pixel < visited.length; pixel++) if (visited[pixel]) data[pixel * 4 + 3] = 0;
  // The same canvas dimensions preserve all existing placement and size settings.
  return { buffer: await sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer(), width, height, removed: count };
}

/** Archive the opaque original and replace only its character bindings, never its geometry. */
export function replaceCharacterAsset(task, sourceName, replacementName) {
  const source = task.assets.find(asset => asset.name === sourceName);
  const replacement = task.assets.find(asset => asset.name === replacementName);
  if (!source || !replacement || source === replacement) throw new Error('原素材与透明人物素材必须是不同的现有文件');
  if (!CHARACTER_ROLES.includes(source.role) && source.role !== 'source-character') throw new Error('请选择人物源素材');
  const originalRole = source.originalRole || source.role;
  const candidates = task.assets.filter(asset => CHARACTER_ROLES.includes(asset.role) && asset !== replacement);
  const primary = candidates.find(asset => ['character','core-character'].includes(asset.role));
  task.parameters ||= {};
  task.parameters.assetByRole ||= {};
  task.parameters.assetByTemplate ||= {};
  const global = task.parameters.assetByRole;
  const keys = ['character', 'character2', 'secondary-character'];
  const templateIds = new Set([...(task.targetTemplateIds || []), ...Object.keys(task.parameters.assetByTemplate), task.masterTemplateId].filter(Boolean));
  for (const id of templateIds) {
    const binding = task.parameters.assetByTemplate[id] ||= {};
    const priorCharacter = binding.character || global.character || primary?.name;
    const priorSecond = binding.character2 || global.character2 || candidates.find(asset => ['character','core-character'].includes(asset.role) && asset.name !== priorCharacter)?.name;
    if (priorCharacter === sourceName) binding.character = replacementName;
    if (priorSecond === sourceName) binding.character2 = replacementName;
    for (const key of keys) if (binding[key] === sourceName) binding[key] = replacementName;
  }
  for (const key of keys) if (global[key] === sourceName) global[key] = replacementName;
  if (!global.character && primary?.name === sourceName) global.character = replacementName;
  source.originalRole = originalRole;
  source.role = 'source-character';
  source.cutoutReplacementName = replacementName;
  replacement.role = originalRole === 'source-character' ? 'character' : originalRole;
  replacement.sourceAssetName = sourceName;
  replacement.transparent = true;
  replacement.needsCutout = false;
  replacement.cutoutPreflight = { ...(replacement.cutoutPreflight || {}), status: 'ready', needsCutout: false, actualTransparency: true, version: VERSION };
  // Preserve the original relative selection order while removing duplicate active subjects.
  task.assets = task.assets.filter(asset => asset !== replacement);
  task.assets.splice(task.assets.indexOf(source) + 1, 0, replacement);
  return replacement;
}

export async function prepareCharacterAssets({ storageDir, task, assets }) {
  const added = [];
  for (const asset of [...assets]) {
    if (!CHARACTER_ROLES.includes(asset.role) || !/\.(png|jpe?g|webp)$/i.test(asset.name)) continue;
    const sourcePath = safeChild(storageDir, task.id, asset.bucket || 'assets', asset.name);
    try {
      const report = await assessCharacterTransparency(sourcePath);
      asset.cutoutPreflight = report;
      asset.transparent = report.actualTransparency;
      asset.needsCutout = report.needsCutout;
      if (!report.safeWhiteBackground) continue;
      const sourceBuffer = await fs.readFile(sourcePath);
      const hash = createHash('sha256').update(sourceBuffer).update(VERSION).digest('hex').slice(0, 12);
      const name = sanitizeFileName(`${path.parse(asset.name).name.slice(0, 80)}-透明人物-${hash}.png`);
      let output = task.assets.find(item => item.name === name);
      if (!output) {
        const result = await removeConnectedWhiteBackground(sourceBuffer);
        await fs.mkdir(safeChild(storageDir, task.id, 'assets'), { recursive: true });
        await fs.writeFile(safeChild(storageDir, task.id, 'assets', name), result.buffer);
        output = { name, role: asset.role, mime: 'image/png', bucket: 'assets', width: result.width, height: result.height,
          bytes: result.buffer.length, derived: true, sourceAssetName: asset.name, method: VERSION,
          url: `/storage/${encodeURIComponent(task.id)}/assets/${encodeURIComponent(name)}`, createdAt: new Date().toISOString() };
        task.assets.push(output); added.push(output);
      }
      replaceCharacterAsset(task, asset.name, name);
    } catch (error) {
      // Import remains usable even if a malformed/unsupported image cannot be assessed.
      asset.needsCutout = true;
      asset.cutoutPreflight = { version: VERSION, status: 'needs-cutout', needsCutout: true, reason: 'inspection-failed', error: error.message };
    }
  }
  return added;
}
