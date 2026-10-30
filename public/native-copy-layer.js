import { drawElementWithEffects, normalizeElementEffects } from './element-effects.js';

const copyMasks = new Map();
const MAX_MASKS = 64;
const DEFAULT_FAMILY = '"Microsoft YaHei",sans-serif';
const finite = (value, fallback) => {
  if (value === null || typeof value === 'boolean' || (typeof value === 'string' && !value.trim())) return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};
const copyText = (value) => String(value ?? '').trim();
const weight = (value) => /^(?:[1-9]\d{0,2}|1000|normal|bold|bolder|lighter)$/.test(String(value)) ? String(value) : '400';

const copyRect = (rect = {}) => ({
  x: finite(rect.x, 0), y: finite(rect.y, 0),
  width: Math.max(0, finite(rect.width, 0)), height: Math.max(0, finite(rect.height, 0)),
});

function rotatedBounds(rect, center, degrees) {
  if (!degrees) return { ...rect };
  const angle = degrees * Math.PI / 180, cosine = Math.cos(angle), sine = Math.sin(angle);
  const corners = [[rect.x, rect.y], [rect.x + rect.width, rect.y],
    [rect.x + rect.width, rect.y + rect.height], [rect.x, rect.y + rect.height]]
    .map(([x, y]) => ({ x: center.x + (x - center.x) * cosine - (y - center.y) * sine,
      y: center.y + (x - center.x) * sine + (y - center.y) * cosine }));
  const left = Math.min(...corners.map((point) => point.x)), top = Math.min(...corners.map((point) => point.y));
  return { x: left, y: top, width: Math.max(...corners.map((point) => point.x)) - left,
    height: Math.max(...corners.map((point) => point.y)) - top };
}

function inkMetrics(metrics, fontSize) {
  const left = finite(metrics.actualBoundingBoxLeft, 0);
  const right = finite(metrics.actualBoundingBoxRight, metrics.width);
  const ascent = finite(metrics.actualBoundingBoxAscent, fontSize * .5);
  const descent = finite(metrics.actualBoundingBoxDescent, fontSize * .5);
  return { left, right, ascent, descent, width: Math.max(0, left + right), height: Math.max(0, ascent + descent) };
}

/**
 * Measure single-line native copy. Alignment is opt-in so older layouts keep
 * their exact left/middle baseline. contentRect is in absolute canvas units;
 * callers can exclude an AI plate's decorative tips from its text body.
 * Optional rotation is clockwise in canvas degrees around that body's center.
 * inkBounds stays unrotated; rotatedInkBounds describes its canvas-space AABB.
 * fitMode 'ink' fits an already measured text body without adding legacy padding.
 */
export function measureNativeCopy(ctx, { text, rect = {}, fontFamily = DEFAULT_FAMILY, fontWeight = 400, preferred,
  align = rect.align, verticalAlign = rect.verticalAlign, contentRect = rect.contentRect, rotation = rect.rotation, fitMode = rect.fitMode } = {}) {
  const value = copyText(text);
  const box = copyRect(rect);
  const centered = align === 'center', middle = verticalAlign === 'middle';
  const body = contentRect && (centered || middle) ? copyRect(contentRect) : box;
  const maxWidth = body.width;
  const height = body.height;
  const family = String(fontFamily || DEFAULT_FAMILY);
  const fontLimit = height * (fitMode === 'ink' ? 1 : .75);
  let fontSize = Math.max(12, Math.min(finite(preferred, fontLimit), fontLimit));
  let font, textMetrics;
  ctx.save();
  try {
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    // Preserve the old rounding and one-pixel shrink loop for existing layouts.
    do {
      font = `${weight(fontWeight)} ${Math.round(fontSize)}px ${family}`;
      ctx.font = font;
      textMetrics = ctx.measureText(value);
      const ink = inkMetrics(textMetrics, fontSize);
      const fitsWidth = (centered ? ink.width : textMetrics.width) <= maxWidth;
      const fitsHeight = !middle || ink.height <= height;
      if ((fitsWidth && fitsHeight) || fontSize <= 12) break;
      fontSize -= 1;
    } while (true);
  } finally {
    ctx.restore();
  }
  const ink = inkMetrics(textMetrics, fontSize);
  const drawX = centered ? body.x + (body.width - ink.width) / 2 + ink.left : box.x;
  const drawY = middle ? body.y + (body.height + ink.ascent - ink.descent) / 2 : box.y + box.height / 2;
  const inkBounds = { x: drawX - ink.left, y: drawY - ink.ascent, width: ink.width, height: ink.height };
  const degrees = finite(rotation, 0);
  const rotationCenter = { x: body.x + body.width / 2, y: body.y + body.height / 2 };
  return { fontSize, font, textWidth: textMetrics.width, textMetrics, drawX, drawY,
    contentRect: body, inkBounds, rotation: degrees, rotationCenter,
    rotatedInkBounds: rotatedBounds(inkBounds, rotationCenter, degrees) };
}

/** Initial inspector values match the old centered stroke's outward thickness. */
export function defaultNativeCopyEffects(fontSize) {
  const defaults = normalizeElementEffects();
  return {
    ...defaults,
    stroke: { enabled: true, color: '#14314a', width: Math.max(2, finite(fontSize, 12) * .13) / 2 },
  };
}

function createCanvas(ctx, width, height) {
  const document = ctx.canvas?.ownerDocument || globalThis.document;
  const canvas = document?.createElement ? document.createElement('canvas') : new OffscreenCanvas(width, height);
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function maskFor(ctx, text, rect, measured, kind, fill) {
  const metrics = measured.textMetrics;
  const fontSet = ctx.canvas?.ownerDocument?.fonts || globalThis.document?.fonts;
  const key = JSON.stringify([
    text, measured.font, measured.fontSize, rect.width, rect.height, kind, fill, 'explicit-effects',
    measured.textWidth, metrics.actualBoundingBoxLeft, metrics.actualBoundingBoxRight,
    metrics.actualBoundingBoxAscent, metrics.actualBoundingBoxDescent, fontSet?.size,
  ]);
  if (copyMasks.has(key)) {
    const cached = copyMasks.get(key);
    copyMasks.delete(key);
    copyMasks.set(key, cached);
    return cached;
  }
  // Bounds are relative to the middle baseline. Keep overhanging brush strokes
  // and minimum-size text that extends past its layout box inside the mask.
  const left = Math.ceil(Math.max(0, finite(metrics.actualBoundingBoxLeft, 0)) + 2);
  const ascent = finite(metrics.actualBoundingBoxAscent, measured.fontSize);
  const descent = finite(metrics.actualBoundingBoxDescent, measured.fontSize * .5);
  const top = Math.ceil(Math.max(0, ascent - rect.height / 2) + 2);
  const right = Math.max(rect.width, measured.textWidth, finite(metrics.actualBoundingBoxRight, measured.textWidth)) + 2;
  const bottom = Math.max(rect.height, rect.height / 2 + descent) + 2;
  const canvas = createCanvas(ctx, Math.max(1, Math.ceil(left + right)), Math.max(1, Math.ceil(top + bottom)));
  const layer = canvas.getContext('2d');
  layer.font = measured.font;
  layer.textBaseline = 'middle';
  layer.textAlign = 'left';
  layer.fillStyle = fill || (kind === 'title' ? '#ffe190' : '#ffffff');
  layer.fillText(text, left, top + rect.height / 2);
  const result = { canvas, left, top };
  copyMasks.set(key, result);
  if (copyMasks.size > MAX_MASKS) copyMasks.delete(copyMasks.keys().next().value);
  return result;
}

/**
 * No effects field keeps the original direct text rendering byte-for-byte in
 * position. An explicit effects value uses a reusable transparent text mask so
 * outline/shadow controls also work for native licensed-font copy.
 */
export function drawNativeCopy(ctx, { text, rect = {}, fontFamily = DEFAULT_FAMILY, fontWeight = 400, preferred, kind = 'subtitle', effects, fill,
  align = rect.align, verticalAlign = rect.verticalAlign, contentRect = rect.contentRect, rotation = rect.rotation, fitMode = rect.fitMode } = {}) {
  const value = copyText(text);
  if (!value || rect.visible === false) return null;
  const box = copyRect(rect);
  const measured = measureNativeCopy(ctx, { text: value, rect: box, fontFamily, fontWeight, preferred, align, verticalAlign, contentRect, rotation, fitMode });
  ctx.save();
  try {
    if (measured.rotation) {
      const center = measured.rotationCenter;
      ctx.translate(center.x, center.y);
      ctx.rotate(measured.rotation * Math.PI / 180);
      ctx.translate(-center.x, -center.y);
    }
    if (effects === undefined) {
      ctx.font = measured.font;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.lineJoin = 'round';
      ctx.lineWidth = Math.max(2, measured.fontSize * .13);
      ctx.strokeStyle = '#14314a';
      ctx.strokeText(value, measured.drawX, measured.drawY);
      ctx.fillStyle = fill || (kind === 'title' ? '#ffe190' : '#ffffff');
      ctx.fillText(value, measured.drawX, measured.drawY);
    } else {
      const mask = maskFor(ctx, value, box, measured, kind, fill);
      // Explicitly disabled shadow must not inherit unrelated caller paint.
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
      drawElementWithEffects(ctx, mask.canvas, {
        x: measured.drawX - mask.left, y: measured.drawY - box.height / 2 - mask.top,
        width: mask.canvas.width, height: mask.canvas.height,
      }, normalizeElementEffects(effects));
    }
  } finally {
    ctx.restore();
  }
  return measured;
}
