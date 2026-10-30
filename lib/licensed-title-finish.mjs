import sharp from 'sharp';

// Effects are derived from the licensed font's alpha, never from an AI redraw.
// palette.lines accepts [{ top, middle, bottom }]; all colours are #rrggbb.
const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const colour = (value, fallback) => /^#[\da-f]{6}$/i.test(value || '')
  ? [1, 3, 5].map(i => parseInt(value.slice(i, i + 2), 16)) : fallback;
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * clamp(t));
const linear = value => { const c = value / 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; };
const luminance = rgb => .2126 * linear(rgb[0]) + .7152 * linear(rgb[1]) + .0722 * linear(rgb[2]);
const contrast = (a, b) => (Math.max(a, b) + .05) / (Math.min(a, b) + .05);

// Exact squared Euclidean distance transform, separable O(width * height).
function distanceLine(input, output, length, sites, boundaries) {
  let k = 0; sites[0] = 0; boundaries[0] = -Infinity; boundaries[1] = Infinity;
  for (let q = 1; q < length; q++) {
    let site = sites[k];
    let s = ((input[q] + q * q) - (input[site] + site * site)) / (2 * q - 2 * site);
    while (s <= boundaries[k] && k > 0) {
      site = sites[--k];
      s = ((input[q] + q * q) - (input[site] + site * site)) / (2 * q - 2 * site);
    }
    sites[++k] = q; boundaries[k] = s; boundaries[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < length; q++) {
    while (boundaries[k + 1] < q) k++;
    output[q] = (q - sites[k]) ** 2 + input[sites[k]];
  }
}

function distanceTo(alpha, width, height, foreground) {
  const result = new Float32Array(width * height);
  const n = Math.max(width, height), input = new Float64Array(n), output = new Float64Array(n);
  const sites = new Int32Array(n), boundaries = new Float64Array(n + 1), far = 1e12;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) input[x] = (alpha[y * width + x] >= 128) === foreground ? 0 : far;
    distanceLine(input, output, width, sites, boundaries);
    for (let x = 0; x < width; x++) result[y * width + x] = output[x];
  }
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) input[y] = result[y * width + x];
    distanceLine(input, output, height, sites, boundaries);
    for (let y = 0; y < height; y++) result[y * width + x] = Math.sqrt(output[y]);
  }
  return result;
}

function inkBounds(alpha, width, height, threshold = 16) {
  let left = width, top = height, right = -1, bottom = -1, pixels = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (alpha[y * width + x] > threshold) {
    left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y); pixels++;
  }
  return { left, top, right, bottom, width: right - left + 1, height: bottom - top + 1, pixels };
}

function detectBands(alpha, width, height, supplied) {
  if (Array.isArray(supplied) && supplied.length) {
    const valid = supplied.map(b => ({ top: clamp(Math.round(b.top ?? b.y ?? 0), 0, height - 1),
      bottom: clamp(Math.round(b.bottom ?? ((b.y ?? 0) + (b.height ?? height) - 1)), 0, height - 1) }))
      .filter(b => b.bottom >= b.top).sort((a, b) => a.top - b.top);
    if (valid.length) return valid;
  }
  const bands = []; let start = -1, last = -1;
  const minGap = Math.max(3, Math.round(height * .012));
  for (let y = 0; y < height; y++) {
    let count = 0;
    for (let x = 0; x < width; x++) if (alpha[y * width + x] > 64) count++;
    if (count > 0) { if (start < 0) start = y; last = y; }
    if (start >= 0 && (y - last > minGap || y === height - 1)) {
      bands.push({ top: start, bottom: last }); start = -1;
    }
  }
  return bands.length ? bands : [{ top: 0, bottom: height - 1 }];
}

async function inspectMaterial(material, alpha, width, height) {
  if (!material) return { data: null, used: false, status: 'absent', meanSaturation: 0, luminanceStdDev: 0, observedSamples: 0 };
  let data;
  try { data = await sharp(material).resize(width, height, { fit: 'fill' }).ensureAlpha().raw().toBuffer(); }
  catch { return { data: null, used: false, status: 'rejected-unreadable', meanSaturation: 0, luminanceStdDev: 0, observedSamples: 0 }; }
  let sum = 0, square = 0, sat = 0, count = 0, opaque = 0, linearSum = 0;
  for (let i = 0; i < alpha.length; i += 5) if (alpha[i] > 160) {
    count++;
    const offset = i * 4; if (data[offset + 3] < 100) continue;
    opaque++;
    const max = Math.max(data[offset], data[offset + 1], data[offset + 2]);
    const min = Math.min(data[offset], data[offset + 1], data[offset + 2]);
    const l = (.2126 * data[offset] + .7152 * data[offset + 1] + .0722 * data[offset + 2]) / 255;
    sum += l; square += l * l; sat += max ? (max - min) / max : 0;
    linearSum += luminance([data[offset], data[offset + 1], data[offset + 2]]);
  }
  const mean = sum / Math.max(1, opaque), deviation = Math.sqrt(Math.max(0, square / Math.max(1, opaque) - mean * mean));
  const saturation = sat / Math.max(1, opaque);
  const backgroundContrast = contrast(linearSum / Math.max(1, opaque), luminance([228, 201, 148]));
  const status = opaque < Math.max(1, count * .5) ? 'rejected-insufficient-opacity'
    : saturation < .26 ? 'rejected-washed-beige'
      : deviation < .035 && backgroundContrast < 1.7 ? 'rejected-low-contrast' : 'accepted-texture';
  return { data, used: status === 'accepted-texture', status, mean, meanSaturation: saturation,
    luminanceStdDev: deviation, backgroundContrast, observedSamples: opaque };
}

function materialBandPalette(data, alpha, width, band) {
  const buckets = Array.from({ length: 3 }, () => ({ rgb: [0, 0, 0], weight: 0 }));
  const total = { rgb: [0, 0, 0], weight: 0 };
  for (let y = band.top; y <= band.bottom; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x, p = i * 4;
    if (alpha[i] < 100 || data[p + 3] < 100) continue;
    const weight = alpha[i] / 255 * data[p + 3] / 255;
    const bucket = buckets[Math.min(2, Math.floor((y - band.top) / Math.max(1, band.bottom - band.top + 1) * 3))];
    for (let c = 0; c < 3; c++) { bucket.rgb[c] += data[p + c] * weight; total.rgb[c] += data[p + c] * weight; }
    bucket.weight += weight; total.weight += weight;
  }
  if (!total.weight) return null;
  const average = total.rgb.map(v => v / total.weight);
  const samples = buckets.map(b => b.weight ? b.rgb.map(v => v / b.weight) : average);
  let top = mix(samples[0], [255, 255, 255], .23);
  const middle = mix(samples[1], average, .2);
  let bottom = mix(samples[2], [0, 0, 0], .18);
  // Preserve the material's hue family, while keeping a readable lit upper face.
  if (luminance(top) < luminance(middle) + .04) top = mix(middle, [255, 255, 255], .28);
  if (luminance(bottom) > luminance(middle) - .03) bottom = mix(middle, [0, 0, 0], .2);
  return { top, middle, bottom };
}

export async function finishLicensedTitle({ mask, material = null, theme = 'playful', palette = {}, lineBands } = {}) {
  if (!Buffer.isBuffer(mask)) throw new TypeError('A licensed glyph mask Buffer is required');
  const decoded = await sharp(mask).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = decoded.info;
  if (width < 2 || height < 2 || width * height > 12_000_000) throw new RangeError('Unsupported licensed glyph mask dimensions');
  const alpha = new Uint8Array(width * height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = decoded.data[i * 4 + 3];
  const bounds = inkBounds(alpha, width, height);
  if (!bounds.pixels) throw new Error('The licensed glyph mask contains no visible ink');
  if (bounds.pixels === width * height) throw new Error('The licensed glyph mask must have transparent surroundings');
  const bands = detectBands(alpha, width, height, lineBands);
  const playful = theme === 'playful';
  const sticker = palette.finish === 'sticker';
  const lineHeight = bands.reduce((sum, b) => sum + b.bottom - b.top + 1, 0) / bands.length;
  const scale = clamp(lineHeight / 170, .35, 2.5);
  const edgeRadius = sticker ? Math.max(1,Math.round(scale)) : playful ? Math.max(2, Math.round(4 * scale)) : Math.max(1, Math.round(2 * scale));
  const rimRadius = sticker ? Math.max(3,Math.round(7 * scale)) : playful ? Math.max(2, Math.round(3 * scale)) : Math.max(1, Math.round(scale));
  const hairRadius = Math.max(1, Math.round(scale));
  const outlineRadius = edgeRadius + rimRadius + hairRadius;
  const depth = sticker ? Math.max(1,Math.round(2 * scale)) : playful ? Math.max(2, Math.round(4 * scale)) : Math.max(1, Math.round(2 * scale));
  const bevel = sticker ? 1 : Math.max(2, Math.round((playful ? 5 : 2) * scale));
  const edge = colour(palette.edge, [94, 47, 26]);
  const outerEdge = colour(palette.outerEdge,edge);
  const rim = colour(palette.outerRim, [255, 248, 218]);
  const extrusion = colour(palette.depth, [109, 49, 24]);
  const shadowColour = colour(palette.shadow, [58, 35, 22]);
  const defaults = playful ? [
    { top: [255, 232, 113], middle: [255, 184, 45], bottom: [239, 126, 17] },
    { top: [236, 255, 154], middle: [170, 218, 61], bottom: [102, 153, 32] },
  ] : [{ top: [255, 248, 211], middle: [247, 221, 155], bottom: [223, 177, 91] }];
  const palettes = bands.map((_, i) => {
    const fallback = defaults[i % defaults.length], requested = palette.lines?.[i] || {};
    return { top: colour(requested.top, fallback.top), middle: colour(requested.middle, fallback.middle), bottom: colour(requested.bottom, fallback.bottom) };
  });
  const outside = distanceTo(alpha, width, height, true), inside = distanceTo(alpha, width, height, false);
  const signed = new Float32Array(alpha.length);
  for (let i = 0; i < alpha.length; i++) signed[i] = alpha[i] >= 128 ? inside[i] - .5 : .5 - outside[i];
  const dilated = radius => {
    const result = new Uint8Array(alpha.length);
    for (let i = 0; i < result.length; i++) result[i] = Math.round(clamp(signed[i] + radius + .5) * 255);
    return result;
  };
  const outer = dilated(outlineRadius), cream = dilated(edgeRadius + rimRadius), structure = dilated(edgeRadius);
  const texture = await inspectMaterial(material, alpha, width, height);
  const materialPaletteLines = [];
  if (texture.used && palette.useMaterialPalette === true) bands.forEach((band, i) => {
    if (palette.lines?.[i]) return;
    const derived = materialBandPalette(texture.data, alpha, width, band);
    if (derived) { palettes[i] = derived; materialPaletteLines.push(i); }
  });
  const shadow = await sharp(Buffer.from(outer), { raw: { width, height, channels: 1 } })
    .blur(Math.max(.3, 1.8 * scale)).greyscale().raw().toBuffer();
  const pixels = new Float32Array(alpha.length * 4);
  const blend = (i, rgb, a) => {
    if (a <= 0) return;
    const p = i * 4, remaining = 1 - a;
    pixels[p] = rgb[0] * a + pixels[p] * remaining;
    pixels[p + 1] = rgb[1] * a + pixels[p + 1] * remaining;
    pixels[p + 2] = rgb[2] * a + pixels[p + 2] * remaining;
    pixels[p + 3] = a + pixels[p + 3] * remaining;
  };
  const paintAlpha = (layer, rgb, dx = 0, dy = 0, opacity = 1) => {
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const sx = x - dx, sy = y - dy;
      if (sx >= 0 && sy >= 0 && sx < width && sy < height) blend(y * width + x, rgb, layer[sy * width + sx] / 255 * opacity);
    }
  };
  paintAlpha(shadow, shadowColour, Math.round(scale), depth + Math.max(1, Math.round(2 * scale)), .24);
  for (let offset = depth; offset >= 1; offset--) paintAlpha(outer, extrusion, Math.round(offset * .45), offset);
  paintAlpha(outer, outerEdge);
  paintAlpha(cream, rim);
  paintAlpha(structure, edge);
  let totalLuminance = 0, inkSamples = 0;
  const perLine = bands.map(() => ({ sum: 0, count: 0 }));
  const rowBand = new Int16Array(height);
  for (let y = 0; y < height; y++) {
    let best = 0, nearest = Infinity;
    bands.forEach((b, i) => { const d = y < b.top ? b.top - y : y > b.bottom ? y - b.bottom : 0; if (d < nearest) { nearest = d; best = i; } });
    rowBand[y] = best;
  }
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x, a = alpha[i] / 255; if (!a) continue;
    const bandIndex = rowBand[y], band = bands[bandIndex], p = palettes[bandIndex];
    const t = clamp((y - band.top) / Math.max(1, band.bottom - band.top));
    let rgb = t < .48 ? mix(p.top, p.middle, t / .48) : mix(p.middle, p.bottom, (t - .48) / .52);
    // Broad upper face light and directional bevel both stay within original ink.
    const faceLight = Math.exp(-(((t - .16) / .085) ** 2)) * (sticker ? .035 : playful ? .19 : .08);
    rgb = mix(rgb, [255, 255, 236], faceLight);
    if (texture.used) {
      const offset = i * 4;
      const l = (.2126 * texture.data[offset] + .7152 * texture.data[offset + 1] + .0722 * texture.data[offset + 2]) / 255;
      const variation = clamp((l - texture.mean) / Math.max(.04, texture.luminanceStdDev), -2, 2) * .025;
      rgb = rgb.map(value => clamp(value * (1 + variation), 0, 255));
    }
    const left = signed[y * width + Math.max(0, x - 1)], right = signed[y * width + Math.min(width - 1, x + 1)];
    const above = signed[Math.max(0, y - 1) * width + x], below = signed[Math.min(height - 1, y + 1) * width + x];
    const nx = (right - left) / 2, ny = (below - above) / 2;
    const directional = (nx + ny) / Math.max(.01, Math.hypot(nx, ny) * Math.SQRT2);
    const bevelAmount = clamp(1 - Math.max(0, signed[i]) / bevel);
    if (directional > 0) rgb = mix(rgb, [255, 255, 224], directional * bevelAmount * (sticker ? .12 : .76));
    else rgb = mix(rgb, [100, 59, 24], -directional * bevelAmount * (sticker ? .08 : .27));
    blend(i, rgb, a);
    if (a > .8) { const l = luminance(rgb); totalLuminance += l; inkSamples++; perLine[bandIndex].sum += l; perLine[bandIndex].count++; }
  }
  const rgba = Buffer.alloc(alpha.length * 4);
  for (let i = 0; i < alpha.length; i++) {
    const p = i * 4, a = pixels[p + 3];
    if (a > 0) { rgba[p] = Math.round(pixels[p] / a); rgba[p + 1] = Math.round(pixels[p + 1] / a); rgba[p + 2] = Math.round(pixels[p + 2] / a); rgba[p + 3] = Math.round(a * 255); }
  }
  const outputAlpha = new Uint8Array(alpha.length);
  for (let i = 0; i < alpha.length; i++) outputAlpha[i] = rgba[i * 4 + 3];
  const outputBounds = inkBounds(outputAlpha, width, height);
  const warmBackground = luminance([228, 201, 148]);
  const flags = [];
  if (texture.status.startsWith('rejected-')) flags.push(texture.status);
  if (outputBounds.left === 0 || outputBounds.top === 0 || outputBounds.right === width - 1 || outputBounds.bottom === height - 1) flags.push('effects-reach-canvas-edge');
  return {
    buffer: await sharp(rgba, { raw: { width, height, channels: 4 } }).png().toBuffer(),
    outlineRadius,
    effectStyle: sticker ? 'licensed-glyph-sticker' : playful ? 'licensed-glyph-candy-bevel' : 'licensed-glyph-restrained-bevel',
    quality: {
      usedMaterial: texture.used,
      material: { status: texture.status, meanSaturation: Number(texture.meanSaturation.toFixed(4)), luminanceStdDev: Number(texture.luminanceStdDev.toFixed(4)), backgroundContrast: Number((texture.backgroundContrast || 0).toFixed(3)), observedSamples: texture.observedSamples },
      materialPaletteLines,
      fillContrast: Number(contrast(totalLuminance / Math.max(1, inkSamples), warmBackground).toFixed(3)),
      lineFillContrasts: perLine.map(p => Number(contrast(p.sum / Math.max(1, p.count), warmBackground).toFixed(3))),
      edgeContrast: Number(contrast(luminance(edge), warmBackground).toFixed(3)),
      contrastReference: '#e4c994',
      layers: [...(sticker?['contact-shadow','short-colour-depth','colour-hairline','cream-rim','per-line-gradient','subtle-edge-highlight']:['contact-shadow', 'short-cocoa-extrusion', 'cocoa-hairline', 'cream-rim', 'cocoa-structure', 'per-line-gradient', 'face-highlight', 'glyph-bevel']), ...(texture.used ? ['subtle-material-texture'] : [])],
      lineCount: bands.length, inkPixels: bounds.pixels, maskBounds: bounds, outputBounds,
      depth, bevel, flags,
    },
  };
}
