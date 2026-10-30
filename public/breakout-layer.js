export function isForegroundOutput(output) {
  const text = `${output?.kind || ""} ${output?.name || ""} ${output?.label || ""}`;
  return output?.kind === "foreground" || /前景|人物|角色|核心|foreground|subject|character/i.test(text);
}

export function isProductionForeground(output) {
  if (!isForegroundOutput(output)) return false;
  const quality = String(output?.qualityStatus || "").toLowerCase();
  const method = String(output?.method || "").toLowerCase();
  const name = String(output?.name || "");
  if (/draft|coarse|rough|粗|草稿/.test(`${quality} ${method}`)) return false;
  if (/^前景总图(?:__|\.)/.test(name) && !quality && !method) return false;
  return /external-fine-cutout|character-only-transparent|designer-point-guided|fine-character|reviewed-source-pixel-cutout/.test(`${quality} ${method}`)
    || (/^人物精细抠图-/.test(name) && !/原图保真/.test(name));
}

export function findForegroundOutput(localAi, sourceAssetName) {
  const candidates = (localAi?.outputs || []).filter(isProductionForeground);
  if (!candidates.length) return null;
  return candidates.find((item) => item.sourceAssetName === sourceAssetName)
    || (localAi?.source === sourceAssetName ? candidates.find((item) => !item.sourceAssetName) : null)
    || null;
}

export function coverPlacement(imageWidth, imageHeight, canvasWidth, canvasHeight, placement = {}) {
  const scale = Math.max(canvasWidth / imageWidth, canvasHeight / imageHeight) * (Number(placement.scale ?? 100) / 100);
  const width = imageWidth * scale;
  const height = imageHeight * scale;
  return {
    x: -(width - canvasWidth) * (Number(placement.focalX ?? 50) / 100),
    y: -(height - canvasHeight) * (Number(placement.focalY ?? 50) / 100),
    width,
    height,
  };
}

export function keepImageAspect(layout, imageWidth, imageHeight, editedDimension = "") {
  const ratio = Number(imageWidth) / Number(imageHeight);
  if (!Number.isFinite(ratio) || ratio <= 0) return layout;
  const width = Number(layout.width);
  const height = Number(layout.height);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return layout;
  let nextWidth = width;
  let nextHeight = height;
  if (editedDimension === "width") nextHeight = width / ratio;
  else if (editedDimension === "height") nextWidth = height * ratio;
  else {
    // A saved size may predate the aspect lock. Preserve its approximate area
    // while restoring the source image's proportions.
    nextWidth = Math.sqrt(width * height * ratio);
    nextHeight = nextWidth / ratio;
  }
  return {
    ...layout,
    x: Number(layout.x) + (width - nextWidth) / 2,
    y: Number(layout.y) + (height - nextHeight) / 2,
    width: nextWidth,
    height: nextHeight,
  };
}
export function fitSubjectToBreakout(subjectBounds, bodyBounds, breakoutBounds) {
  if (!subjectBounds || !bodyBounds || !breakoutBounds) return null;
  const source = {
    x: Number(subjectBounds.x),
    y: Number(subjectBounds.y),
    width: Number(subjectBounds.width),
    height: Number(subjectBounds.height),
  };
  if (![source.x, source.y, source.width, source.height].every(Number.isFinite) || source.width <= 0 || source.height <= 0) return null;
  const left = Math.min(bodyBounds.x, breakoutBounds.x);
  const top = Math.min(bodyBounds.y, breakoutBounds.y);
  const right = Math.max(bodyBounds.x + bodyBounds.width, breakoutBounds.x + breakoutBounds.width);
  const bottom = Math.max(bodyBounds.y + bodyBounds.height, breakoutBounds.y + breakoutBounds.height);
  const availableWidth = right - left;
  const availableHeight = bottom - top;
  const scale = Math.min(availableWidth / source.width, availableHeight / source.height);
  const width = source.width * scale;
  const height = source.height * scale;
  return {
    source,
    target: {
      x: bodyBounds.x + bodyBounds.width / 2 - width / 2,
      y: top,
      width,
      height,
    },
  };
}
