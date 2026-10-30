import sharp from 'sharp';
import { isCommunityReference } from '../public/community-references.js';

const toHex = rgb => '#' + rgb.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
const brightness = rgb => .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2];

function numberOf(value) {
  if (/^\d+$/.test(value)) return Number(value);
  const digits = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
  if (value === '十') return 10;
  if (value.includes('十')) { const [a, b] = value.split('十'); return (a ? digits[a] : 1) * 10 + (b ? digits[b] : 0); }
  return digits[value];
}

function explicitTitleReference(prompt) {
  if (typeof prompt !== 'string' || prompt.length > 12000) return null;
  const found = [];
  const clauses = prompt.split(/[。；;\n]/);
  for (const clause of clauses) {
    // A second object's brief must not get attributed to the title.
    const title = /(?:主标题|主标|大标题|标题)/.exec(clause);
    if (!title) continue;
    const section = clause.slice(title.index + title[0].length).split(/副标|副标题|小标题|背景|人物|角色|logo/i)[0];
    if (/不(?:要)?参考|别参考|不采用|不使用|不用参考/.test(section)) continue;
    const refs = /(颜色|色调|配色|字效|效果)/.test(section)
      ? [...section.matchAll(/(?:参考\s*)?图\s*([0-9]{1,2}|[一二三四五六七八九十]{1,3})/g)] : [];
    if (!refs.length && !/副标|副标题|背景|人物|角色|logo/i.test(clause.slice(0, title.index))) {
      // Also support “参考图2的配色修改主标”, without borrowing a subtitle brief.
      const before = clause.slice(0, title.index);
      if (/不(?:要)?参考|别参考|不采用|不使用|不用参考/.test(before)) continue;
      if (/(颜色|色调|配色|字效|效果)/.test(before) && /用于|用在|修改|调整|应用|设计/.test(before)) {
        refs.push(...before.matchAll(/(?:参考\s*)?图\s*([0-9]{1,2}|[一二三四五六七八九十]{1,3})/g));
      }
    }
    found.push(...refs.map(match => numberOf(match[1])).filter(n => Number.isInteger(n) && n > 0));
  }
  const unique = [...new Set(found)];
  return unique.length === 1 ? unique[0] : null;
}

function sampleAt(samples, percentile) {
  return samples[Math.min(samples.length - 1, Math.max(0, Math.round((samples.length - 1) * percentile)))];
}

/**
 * Resolve only a designer's explicit title colour/effect reference. Numbering is
 * the same filtered reference-image/tone/copy order as the workbench composer.
 * Unsupported palettes return null; this is deliberately not a generic image
 * palette classifier and never invents a reference from an internal background.
 */
export async function resolveBannerTitleReference(prompt, inputs = {}) {
  const referenceIndex = explicitTitleReference(prompt);
  if (!referenceIndex || !Array.isArray(inputs.references)) return null;
  const references = inputs.references.map((buffer, index) => ({ buffer, role: inputs.referenceRoles?.[index] || 'reference-image' }))
    .filter(entry => isCommunityReference(entry));
  const entry = references[referenceIndex - 1];
  if (!entry || !Buffer.isBuffer(entry.buffer) || !entry.buffer.length) return null;
  let decoded;
  try {
    decoded = await sharp(entry.buffer, { limitInputPixels: 32_000_000 }).resize({ width: 640, height: 400, fit: 'inside', withoutEnlargement: true })
      .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  } catch { return null; }
  const brown = [], orange = [], cream = [];
  let opaquePixels = 0, coolPixels = 0;
  for (let p = 0; p < decoded.data.length; p += 4) {
    if (decoded.data[p + 3] < 150) continue;
    opaquePixels++;
    const r = decoded.data[p], g = decoded.data[p + 1], b = decoded.data[p + 2];
    const max = Math.max(r, g, b), min = Math.min(r, g, b), saturation = max ? (max - min) / max : 0;
    if (saturation > .3 && (b > r * 1.15 || g > r * 1.15)) coolPixels++;
    if (r >= 45 && r <= 155 && g >= 28 && g <= 125 && b >= 12 && b <= 98
      && r > g * 1.13 && g > b * 1.17 && saturation > .2) brown.push([r, g, b]);
    // Exclude the pale yellow paper/circle behind the reference's orange ink.
    else if (r >= 190 && g >= 70 && g <= 175 && b <= 70 && r > g * 1.38 && g > b * 1.18 && saturation > .66) orange.push([r, g, b]);
    else if (r >= 243 && g >= 231 && b >= 200 && b <= 248 && saturation < .24) cream.push([r, g, b]);
  }
  if (!opaquePixels) return null;
  const brownRatio = brown.length / opaquePixels, orangeRatio = orange.length / opaquePixels, coolRatio = coolPixels / opaquePixels;
  if (brownRatio < .01 || orangeRatio < .01 || coolRatio > .12) return null;
  brown.sort((a, b) => brightness(a) - brightness(b));
  orange.sort((a, b) => brightness(a) - brightness(b));
  cream.sort((a, b) => brightness(a) - brightness(b));
  const cocoa = sampleAt(brown, .5), amber = sampleAt(orange, .72);
  const creamColour = cream.length ? sampleAt(cream, .55) : [255, 248, 229];
  const palette = {
    lines: [
      { top: toHex(sampleAt(brown, .8)), middle: toHex(cocoa), bottom: toHex(sampleAt(brown, .2)) },
      { top: toHex(sampleAt(orange, .83)), middle: toHex(sampleAt(orange, .52)), bottom: toHex(sampleAt(orange, .18)) },
    ],
    edge: toHex(creamColour), outerRim: toHex(creamColour), outerEdge: toHex(amber), depth: toHex(amber),
    shadow: toHex(sampleAt(brown, .15)), finish: 'sticker',
  };
  return {
    referenceIndex, palette,
    confidence: Number(Math.min(.98, .82 + Math.min(brownRatio, orangeRatio) * 2 - coolRatio).toFixed(3)),
    method: 'explicit-numbered-reference-warm-sticker-v1',
    sampleStats: { opaquePixels, brownPixels: brown.length, orangePixels: orange.length, creamPixels: cream.length, coolPixels },
  };
}
