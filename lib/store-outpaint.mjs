import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { buildOutpaintRequest, composeOutpaintPrompt, detectImageFormat, downloadRaw, pollJob, submitGeneration } from "./ai-huabu.mjs";
import { loadCanvasConfig as loadConfig } from "../platform/canvas.mjs";

async function expansionCanvas(sourceBuffer, variant) {
  const metadata = await sharp(sourceBuffer).metadata();
  if (!metadata.width || !metadata.height) throw new Error("扩图源图尺寸无效");
  const ratio = variant === "portrait" ? 2 / 3 : 1;
  let width = metadata.width, height = metadata.height;
  if (width / height > ratio) height = Math.ceil(width / ratio);
  else width = Math.ceil(height * ratio);
  const left = Math.round((width - metadata.width) / 2);
  const top = Math.round((height - metadata.height) / 2);
  const source = await sharp(sourceBuffer).ensureAlpha().raw().toBuffer({ resolveWithObject:true });
  const rgba = Buffer.from(source.data);
  const overlap = Math.max(24, Math.min(64, Math.round(Math.min(metadata.width, metadata.height) * .05)));
  const blendX = left > 0, blendY = top > 0;
  for (let y = 0; y < metadata.height; y += 1) for (let x = 0; x < metadata.width; x += 1) {
    let alpha = 255;
    if (blendX && x < overlap) alpha = Math.min(alpha, Math.round(255 * x / overlap));
    if (blendX && metadata.width - 1 - x < overlap) alpha = Math.min(alpha, Math.round(255 * (metadata.width - 1 - x) / overlap));
    if (blendY && y < overlap) alpha = Math.min(alpha, Math.round(255 * y / overlap));
    if (blendY && metadata.height - 1 - y < overlap) alpha = Math.min(alpha, Math.round(255 * (metadata.height - 1 - y) / overlap));
    rgba[(y * metadata.width + x) * 4 + 3] = alpha;
  }
  const sourceLayer = await sharp(rgba, { raw:{ width:metadata.width, height:metadata.height, channels:4 } }).png().toBuffer();
  const buffer = await sharp({ create:{ width, height, channels:4, background:{ r:0, g:0, b:0, alpha:0 } } })
    .composite([{ input:sourceLayer, left, top }])
    .png()
    .toBuffer();
  return { buffer, width, height, overlap, sourceRect:{ x:left / width, y:top / height, width:metadata.width / width, height:metadata.height / height } };
}

async function protectOriginal({ sourceBuffer, generatedBuffer, sourceRect, overlap }) {
  const metadata = await sharp(generatedBuffer).metadata();
  if (!metadata.width || !metadata.height) throw new Error("自动扩图结果尺寸无效");
  const left = Math.max(0, Math.round(sourceRect.x * metadata.width));
  const top = Math.max(0, Math.round(sourceRect.y * metadata.height));
  const width = Math.min(metadata.width - left, Math.max(1, Math.round(sourceRect.width * metadata.width)));
  const height = Math.min(metadata.height - top, Math.max(1, Math.round(sourceRect.height * metadata.height)));
  const resized = await sharp(sourceBuffer).resize(width, height, { fit:"fill", kernel:"lanczos3" }).ensureAlpha().raw().toBuffer({ resolveWithObject:true });
  const rgba = Buffer.from(resized.data);
  const feather = Math.max(8, Math.round(overlap * width / (sourceRect.width * metadata.width)));
  const blendLeft = sourceRect.x > .001;
  const blendTop = sourceRect.y > .001;
  const blendRight = sourceRect.x + sourceRect.width < .999;
  const blendBottom = sourceRect.y + sourceRect.height < .999;
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    let alpha = 255;
    if (blendLeft && x < feather) alpha = Math.min(alpha, Math.round(255 * x / feather));
    if (blendTop && y < feather) alpha = Math.min(alpha, Math.round(255 * y / feather));
    if (blendRight && width - 1 - x < feather) alpha = Math.min(alpha, Math.round(255 * (width - 1 - x) / feather));
    if (blendBottom && height - 1 - y < feather) alpha = Math.min(alpha, Math.round(255 * (height - 1 - y) / feather));
    rgba[(y * width + x) * 4 + 3] = alpha;
  }
  const protectedSource = await sharp(rgba, { raw:{ width, height, channels:4 } }).png().toBuffer();
  const buffer = await sharp(generatedBuffer).composite([{ input:protectedSource, left, top }]).png().toBuffer();
  return { buffer, width:metadata.width, height:metadata.height, sourceRect:{ x:left / metadata.width, y:top / metadata.height, width:width / metadata.width, height:height / metadata.height } };
}

// The source is placed on a transparent, target-ratio canvas before editing.
// This gives the model and the protection pass the same fixed source rectangle.
export async function generateStoreOutpaint({ sourceBuffer, variant }) {
  const ratio = variant === "portrait" ? "2:3" : "1:1";
  const targetRatio = variant === "portrait" ? 2 / 3 : 1;
  const canvas = await expansionCanvas(sourceBuffer, variant);
  const prompt = composeOutpaintPrompt("预约商店图批量适配。输入图中央是不允许修改的完整原图，四周透明区域是唯一允许生成的区域。只填充透明区域，使其无缝延续原图边缘的云纹、花枝、光影和背景空间。严禁把中央原图做成海报、卡片、画框、屏幕或带投影的矩形；严禁复制中央原图中的文字、Logo、人物和界面到透明扩展区；严禁生成任何文字状符号。", { allowNewSubjects:false });
  const body = buildOutpaintRequest({ model:"banana_pro", base64:canvas.buffer.toString("base64"), prompt, ratio, imageSize:"2K" });
  const sourceHash = createHash("sha256").update(sourceBuffer).digest("hex").slice(0, 20);
  const idempotencyKey = createHash("sha256").update(`store-preorder-banana-v4:${sourceHash}:${variant}:${ratio}`).digest("hex").slice(0, 32);
  const config = await loadConfig();
  const jobId = await submitGeneration(config, body, { idempotencyKey });
  await pollJob(config, jobId);
  const raw = await downloadRaw(config, jobId);
  detectImageFormat(raw);
  const protectedResult = await protectOriginal({ sourceBuffer, generatedBuffer:raw.buffer, sourceRect:canvas.sourceRect, overlap:canvas.overlap });
  const ratioDelta = Math.abs(Math.log((protectedResult.width / protectedResult.height) / targetRatio));
  if (ratioDelta > .035) throw new Error("自动扩图结果比例与目标不一致，已阻止错误结果进入商店图");
  return { ...protectedResult, format:"png", model:"banana_pro", jobId };
}
