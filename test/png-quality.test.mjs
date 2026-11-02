import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import sharp from "sharp";
import { optimizePngLosslessly } from "../lib/png-optimize.mjs";

const appSource = fs.readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
const serverSource = fs.readFileSync(new URL("../server.mjs", import.meta.url), "utf8");

test("PNG优化不改变任何像素", async () => {
  const width = 96;
  const height = 72;
  const pixels = Buffer.alloc(width * height * 4);
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = (i * 17) & 255;
    pixels[i + 1] = (i * 29) & 255;
    pixels[i + 2] = (i * 43) & 255;
    pixels[i + 3] = 255 - ((i / 4) % 31);
  }
  const original = await sharp(pixels, { raw: { width, height, channels: 4 } }).png({ compressionLevel: 1 }).toBuffer();
  const optimized = await optimizePngLosslessly(original);
  const decoded = await sharp(optimized).ensureAlpha().raw().toBuffer();
  assert.deepEqual(decoded, pixels);
  assert.ok(optimized.length <= original.length);
});

// 官网头图的渐变和肤色对粗量化敏感：它用更细的档位，其余尺寸照旧 8～24。
test("移动端官网头图使用高保真PNG压缩且提交PSD套版标记", () => {
  assert.match(appSource, /const colorSteps = templateId === "platform-mobile-official-hero" \? \[8, 10, 11, 12, 13, 14\] : \[8, 12, 16, 24\];\s*for \(const step of colorSteps\)/);
  assert.doesNotMatch(appSource, /\[8, 12, 16, 24, 32, 48\]/);
  assert.match(appSource, /api\("\/api\/png\/optimize"/);
  assert.match(appSource, /files\.push\(\{ templateId: template\.id,[\s\S]*?templateApplied/);
  assert.match(serverSource, /Boolean\(file\.templateApplied\) && hasPsdRule/);
});

// 逐行滤波和 9 级压缩是纯计算（大图一两秒）：放在后台线程里，主线程照常回应别的请求，结果和在主线程算一样。
test("PNG优化在后台线程里算，不卡住服务器", async () => {
  const { rebuildPngLosslessly } = await import("../lib/png-rebuild.mjs");
  const width = 1600, height = 1000, noise = Buffer.alloc(width * height * 4);
  for (let i = 0; i < noise.length; i += 1) noise[i] = (i * 2654435761 >>> 13) & 255;
  const png = await sharp(noise, { raw: { width, height, channels: 4 } }).png({ compressionLevel: 1 }).toBuffer();
  const started = performance.now(); const rebuilt = rebuildPngLosslessly(png); const syncMs = performance.now() - started;
  let last = performance.now(), longest = 0;
  const timer = setInterval(() => { const now = performance.now(); longest = Math.max(longest, now - last); last = now; }, 10);
  try { await new Promise(resolve => setTimeout(resolve, 30)); const optimized = await optimizePngLosslessly(png); assert.ok(optimized.length <= rebuilt.length); }
  finally { clearInterval(timer); }
  assert.ok(longest < syncMs / 2, `main thread stalled ${Math.round(longest)} ms while the work takes ${Math.round(syncMs)} ms`);
});
