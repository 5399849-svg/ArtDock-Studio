import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { inspectIconSource, loadIconPreorderSpecs, renderIcon } from "../lib/icon-preorder.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const assetsDir = path.join(root, "public", "icon-preorder-assets");

async function sourceIcon() {
  const svg = `<svg width="1024" height="1024" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="#f87572"/><stop offset=".5" stop-color="#ffd8a8"/><stop offset="1" stop-color="#6558d9"/></linearGradient></defs><rect width="1024" height="1024" fill="url(#g)"/><circle cx="512" cy="420" r="260" fill="#fff" opacity=".78"/><path d="M210 820 Q512 540 814 820" fill="#a41e45"/><text x="512" y="470" text-anchor="middle" font-size="132" font-family="Arial" font-weight="700" fill="#57244a">ICON</text></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

test("ICON预约配置包含16个唯一规格和4个角标规格", async () => {
  const config = await loadIconPreorderSpecs();
  assert.equal(config.specs.length, 16);
  assert.equal(new Set(config.specs.map((item) => item.id)).size, 16);
  assert.equal(config.specs.filter((item) => item.badgeAsset).length, 4);
});

test("正方形原始ICON可生成全部规格并满足PNG大小上限", async () => {
  const source = await sourceIcon();
  const info = await inspectIconSource(source);
  assert.deepEqual([info.width, info.height], [1024, 1024]);
  const config = await loadIconPreorderSpecs();
  for (const spec of config.specs) {
    const result = await renderIcon(source, spec, { assetsDir });
    const metadata = await sharp(result.buffer).metadata();
    assert.equal(metadata.format, "png", spec.id);
    assert.equal(metadata.width, spec.width, spec.id);
    assert.equal(metadata.height, spec.height, spec.id);
    assert.ok(result.bytes <= spec.maxKB * 1024, spec.id);
    const pixel = await sharp(result.buffer).ensureAlpha().extract({ left: 0, top: 0, width: 1, height: 1 }).raw().toBuffer();
    if (spec.cornerRadiusPx) assert.ok(pixel[3] < 255, `${spec.id} 左上角应带抗锯齿透明圆角`);
    else assert.equal(pixel[3], 255, `${spec.id} 左上角应保持直角不透明`);
  }
});

test("非正方形源图会被拒绝", async () => {
  const source = await sharp({ create: { width: 800, height: 600, channels: 3, background: "#fff" } }).png().toBuffer();
  await assert.rejects(() => inspectIconSource(source), /正方形/);
});
