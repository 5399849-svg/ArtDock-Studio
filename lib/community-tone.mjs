import sharp from 'sharp';

export async function analyzeCommunityTone(buffer) {
  const { data } = await sharp(buffer).resize(128, 72, { fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let brightness = 0, saturation = 0, darkShare = 0;
  const count = data.length / 3;
  for (let i = 0; i < data.length; i += 3) {
    const red = data[i] / 255, green = data[i + 1] / 255, blue = data[i + 2] / 255;
    const lightest = Math.max(red, green, blue), darkest = Math.min(red, green, blue);
    brightness += .2126 * red + .7152 * green + .0722 * blue;
    saturation += (lightest - darkest) / (lightest || 1);
    if (lightest < .35) darkShare++;
  }
  return { brightness: brightness / count, saturation: saturation / count, darkShare: darkShare / count };
}

export function assessCommunityTone(reference, candidate) {
  if (!reference) return [];
  const issues = [];
  if (candidate.brightness < reference.brightness * .88 || candidate.darkShare > Math.max(.12, reference.darkShare + .12)) issues.push('偏暗');
  if (candidate.saturation < reference.saturation * .84) issues.push('偏灰');
  return issues;
}

export function communityToneGuide(reference) {
  if (!reference) return '';
  return `风格参考的平均亮度约 ${Math.round(reference.brightness * 100)}%，平均饱和度约 ${Math.round(reference.saturation * 100)}%，仅用于提醒保持清透、避免无意发灰发黑，不是必须复刻的配色数值。具体色相、明暗层次和光源服从角色与创作说明；不要沿用参考的场景或添加灰褐、泛黄、褪色滤镜。`;
}
