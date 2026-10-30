// A subtitle backing is an independent canvas layer. Its geometry is stored in
// layoutByTemplate[templateId]['subtitle-backing']; only its paint is in backing.
// Existing work stays unchanged until a backing is explicitly created/enabled.
const DEFAULT_BACKING = Object.freeze({
  enabled: false,
  shape: 'round-rect',
  fill: '#fff1d8',
  opacity: 88,
  radius: 12,
});

const object = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const finite = (value, fallback) => {
  if (value === null || typeof value === 'boolean' || (typeof value === 'string' && !value.trim())) return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const between = (value, min, max, fallback) => clamp(finite(value, fallback), min, max);
const positive = (value, fallback) => {
  const number = finite(value, fallback);
  return number > 0 ? number : fallback;
};
const color = (value) => {
  const hex = String(value || '').toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(hex)) return hex;
  if (/^#[0-9a-f]{3}$/.test(hex)) return `#${[...hex.slice(1)].map((digit) => digit + digit).join('')}`;
  return DEFAULT_BACKING.fill;
};

/** Paint-only settings. Geometry and visibility belong to the layer layout. */
export function normalizeSubtitleBacking(input = {}) {
  const value = object(input);
  return {
    enabled: value.enabled === true,
    shape: ['round-rect', 'capsule', 'rect'].includes(value.shape) ? value.shape : DEFAULT_BACKING.shape,
    fill: color(value.fill),
    opacity: between(value.opacity, 0, 100, DEFAULT_BACKING.opacity),
    radius: between(value.radius, 0, 1000, DEFAULT_BACKING.radius),
    ...(typeof value.assetName === 'string' && value.assetName && !/[\\/]/.test(value.assetName) ? {assetName:value.assetName} : {}),
    ...(value.contentRect && ['x','y','width','height'].every(k=>Number.isFinite(value.contentRect[k])) && value.contentRect.x>=0 && value.contentRect.y>=0 && value.contentRect.width>0 && value.contentRect.height>0 && value.contentRect.x+value.contentRect.width<=1.01 && value.contentRect.y+value.contentRect.height<=1.01 ? {contentRect:{...value.contentRect}} : {}),
  };
}

/**
 * Explicit add action only: initialize a separately editable backing around the
 * current subtitle. Coordinates, padding and radius use source-canvas pixels.
 * options accepts paint fields (or options.backing) plus paddingX / paddingY.
 */
export function createSubtitleBackingLayout(subtitleRect, template, options = {}) {
  const source = object(subtitleRect), canvas = object(template), settings = object(options);
  const canvasWidth = positive(canvas.width, 1), canvasHeight = positive(canvas.height, 1);
  const textWidth = clamp(positive(source.width, canvasWidth * .55), Math.min(1, canvasWidth), canvasWidth);
  const textHeight = clamp(positive(source.height, canvasHeight * .08), Math.min(1, canvasHeight), canvasHeight);
  const paddingX = between(settings.paddingX, 0, canvasWidth, clamp(textHeight * .55, 8, 28));
  const paddingY = between(settings.paddingY, 0, canvasHeight, clamp(textHeight * .22, 4, 14));
  const width = Math.min(canvasWidth, textWidth + paddingX * 2);
  const height = Math.min(canvasHeight, textHeight + paddingY * 2);
  const centerX = finite(source.x, (canvasWidth - textWidth) / 2) + textWidth / 2;
  const centerY = finite(source.y, (canvasHeight - textHeight) / 2) + textHeight / 2;
  const backing = normalizeSubtitleBacking({ ...settings, ...object(settings.backing), enabled: true });
  // No live linkage to the subtitle: moving/resizing either layer stays local.
  return {
    x: clamp(centerX - width / 2, 0, canvasWidth - width),
    y: clamp(centerY - height / 2, 0, canvasHeight - height),
    width,
    height,
    visible: true,
    backing,
  };
}

/** Draw only the simple backing shape; no generated artwork or decorations. */
export function drawSubtitleBacking(ctx, rect, input = rect?.backing, image = null) {
  const box = object(rect), backing = normalizeSubtitleBacking(input);
  if (!ctx || !backing.enabled || box.visible === false || backing.opacity === 0) return false;
  const x = finite(box.x, 0), y = finite(box.y, 0);
  const width = positive(box.width, 0), height = positive(box.height, 0);
  if (!width || !height) return false;
  const radius = backing.shape === 'rect' ? 0
    : backing.shape === 'capsule' ? Math.min(width, height) / 2
      : Math.min(backing.radius, width / 2, height / 2);
  ctx.save();
  try {
    ctx.globalAlpha = between(ctx.globalAlpha, 0, 1, 1) * backing.opacity / 100;
    if(backing.assetName){
      if(!image)return false;
      ctx.drawImage(image,x,y,width,height);
      return true;
    }
    ctx.fillStyle = backing.fill;
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    if (!radius) {
      ctx.fillRect(x, y, width, height);
    } else {
      ctx.beginPath();
      ctx.moveTo(x + radius, y);
      ctx.lineTo(x + width - radius, y);
      ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
      ctx.lineTo(x + width, y + height - radius);
      ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
      ctx.lineTo(x + radius, y + height);
      ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
      ctx.lineTo(x, y + radius);
      ctx.quadraticCurveTo(x, y, x + radius, y);
      ctx.closePath();
      ctx.fill();
    }
  } finally {
    ctx.restore();
  }
  return true;
}
