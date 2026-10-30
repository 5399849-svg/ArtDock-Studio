import sharp from 'sharp';
import { protectedComposition } from '../public/outpaint-composite.js';
import { createSafeOutpaint } from './safe-outpaint.mjs';

const clampPercent = value => Math.max(0, Math.min(100, Number(value) || 0));

// Capture the background as it appears on the approved master canvas. Text,
// characters and Logo remain separate layers and are intentionally absent.
export async function confirmedMasterBackground(sourceBuffer, width, height, placement = {}, backgroundColor = '#ffffff') {
  const source = await sharp(sourceBuffer).metadata();
  if (!source.width || !source.height || width < 1 || height < 1) throw new Error('确认母版背景尺寸无效');
  const zoom = Math.max(.01, Number(placement.scale ?? 100) / 100);
  const scale = (placement.fit==='contain'?Math.min:Math.max)(width / source.width, height / source.height) * zoom;
  const scaledWidth = Math.max(1, Math.round(source.width * scale));
  const scaledHeight = Math.max(1, Math.round(source.height * scale));
  const x = Math.round((width - scaledWidth) * clampPercent(placement.focalX ?? 50) / 100);
  const y = Math.round((height - scaledHeight) * clampPercent(placement.focalY ?? 50) / 100);
  const resized = await sharp(sourceBuffer).resize(scaledWidth, scaledHeight, { fit:'fill' }).png().toBuffer();
  const left = Math.max(0, -x), top = Math.max(0, -y);
  const visibleWidth = Math.min(width - Math.max(0, x), scaledWidth - left);
  const visibleHeight = Math.min(height - Math.max(0, y), scaledHeight - top);
  if (visibleWidth < 1 || visibleHeight < 1) throw new Error('确认母版背景未覆盖画布');
  const visible = await sharp(resized).extract({ left, top, width:visibleWidth, height:visibleHeight }).png().toBuffer();
  return sharp({ create:{ width, height, channels:4, background:backgroundColor } })
    .composite([{ input:visible, left:Math.max(0,x), top:Math.max(0,y) }]).png().toBuffer();
}

export function communityContainPlacement(sourceWidth, sourceHeight, targetWidth, targetHeight) {
  if (![sourceWidth,sourceHeight,targetWidth,targetHeight].every(value => Number.isFinite(value) && value > 0)) throw new Error('延展画面尺寸无效');
  const contain = Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight);
  const cover = Math.max(targetWidth / sourceWidth, targetHeight / sourceHeight);
  return { scale:100 * contain / cover, focalX:50, focalY:50 };
}

// The model supplies only the newly exposed scenery. Registration fixes where
// the approved master sits; the validated outpaint has the master overlaid.
export async function cropCommunityExtension(generatedBuffer, sourceRect, sourceWidth, sourceHeight, targetWidth, targetHeight) {
  const placement = communityContainPlacement(sourceWidth, sourceHeight, targetWidth, targetHeight);
  const geometry = protectedComposition(targetWidth,targetHeight,sourceWidth,sourceHeight,placement,sourceRect);
  if (!geometry.covered) throw new Error('扩图范围不足，无法覆盖目标尺寸');
  const image = await sharp(generatedBuffer).metadata();
  if (!image.width || !image.height) throw new Error('扩图结果尺寸无效');
  const bounds = geometry.generated;
  const left = Math.max(0, Math.floor(-bounds.x / bounds.width * image.width));
  const top = Math.max(0, Math.floor(-bounds.y / bounds.height * image.height));
  const right = Math.min(image.width, Math.ceil((targetWidth - bounds.x) / bounds.width * image.width));
  const bottom = Math.min(image.height, Math.ceil((targetHeight - bounds.y) / bounds.height * image.height));
  if (right <= left || bottom <= top) throw new Error('扩图裁切区域无效');
  return sharp(generatedBuffer).extract({ left, top, width:right-left, height:bottom-top })
    .resize(targetWidth,targetHeight,{ fit:'fill' }).png().toBuffer();
}

// Rectify the generated scenery first, then place the approved source once in
// the final target coordinates. Mild model stretch never stretches the master.
export async function composeCommunityExtension(sourceBuffer,generatedBuffer,sourceRect,targetWidth,targetHeight){
  const source=await sharp(sourceBuffer).metadata();
  const placement=communityContainPlacement(source.width,source.height,targetWidth,targetHeight);
  const geometry=protectedComposition(targetWidth,targetHeight,source.width,source.height,placement,sourceRect);
  const cropped=await cropCommunityExtension(generatedBuffer,sourceRect,source.width,source.height,targetWidth,targetHeight);
  const box=geometry.original;
  return createSafeOutpaint({sourceBuffer,generatedBuffer:cropped,width:targetWidth,height:targetHeight,
    sourceRect:{x:box.x/targetWidth,y:box.y/targetHeight,width:box.width/targetWidth,height:box.height/targetHeight}});
}
