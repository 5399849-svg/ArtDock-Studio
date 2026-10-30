const clampByte = (value) => Math.max(0, Math.min(255, Math.round(value)));

export function transformButtonPixels(pixels, state, width = 0, height = 0) {
  if (!pixels || state === "normal" || !state) return pixels;
  const pixelWidth = Math.max(1, Number(width) || Math.round(Math.sqrt(pixels.length / 4)) || 1);
  const pixelHeight = Math.max(1, Number(height) || Math.ceil(pixels.length / 4 / pixelWidth));
  for (let offset = 0; offset < pixels.length; offset += 4) {
    if (pixels[offset + 3] === 0) continue;
    const index = offset / 4;
    const x = index % pixelWidth;
    const y = Math.floor(index / pixelWidth);
    const xRatio = pixelWidth > 1 ? x / (pixelWidth - 1) : .5;
    const yRatio = pixelHeight > 1 ? y / (pixelHeight - 1) : .5;
    const red = pixels[offset];
    const green = pixels[offset + 1];
    const blue = pixels[offset + 2];
    const luminance = red * .2126 + green * .7152 + blue * .0722;
    if (state === "hover-gold") {
      const chroma = Math.max(red, green, blue) - Math.min(red, green, blue);
      const centralText = chroma < 30 && luminance > 178 && xRatio > .14 && xRatio < .86 && yRatio > .22 && yRatio < .78;
      if (centralText) {
        pixels[offset] = red;
        pixels[offset + 1] = green;
        pixels[offset + 2] = blue;
      } else {
        const center = Math.max(0, 1 - Math.abs(xRatio - .5) * 1.35) * Math.max(0, 1 - Math.abs(yRatio - .5) * 1.8);
        const tone = Math.min(1, Math.pow(luminance / 255, .72) + center * .14);
        pixels[offset] = clampByte(104 + 151 * tone);
        pixels[offset + 1] = clampByte(37 + 204 * tone);
        pixels[offset + 2] = clampByte(8 + 132 * tone);
      }
    } else if (state === "disabled-gray") {
      const gray = clampByte(luminance * .68 + 18);
      pixels[offset] = gray; pixels[offset + 1] = gray; pixels[offset + 2] = gray;
    }
  }
  return pixels;
}
