import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { defaultLayerAdjustments, inspectPageSource, loadStorePreorderSpecs, needsAdvancedComposition, outputZipPath, renderLayeredStorePage, renderStorePage, selectPageSource } from "../lib/store-preorder.mjs";

test("预约商店图保留22条渠道尺寸并固定六页一套", async () => {
  const config = await loadStorePreorderSpecs();
  assert.equal(config.specs.length, 22);
  assert.equal(config.pagesPerSet, 6);
  assert.equal(new Set(config.specs.map((item) => item.channel)).size, 11);
  assert.equal(config.specs.find((item) => item.channel === "VIVO").safeTopPx, 57);
  assert.equal(config.specs.find((item) => item.channel === "B站").maxKB, 200);
});

test("横竖输出分别选择对应方向的六页独立源图", () => {
  const sources = [{ variant: "portrait", name: "01竖版" }, { variant: "landscape", name: "01横版" }];
  assert.equal(selectPageSource(sources, { width: 1280, height: 720 }).name, "01横版");
  assert.equal(selectPageSource(sources, { width: 720, height: 1280 }).name, "01竖版");
});

test("异比例页面自动扩图并导出符合尺寸和大小上限的JPG", async () => {
  const source = await sharp({ create: { width: 600, height: 600, channels: 3, background: "#e8baba" } }).png().toBuffer();
  const info = await inspectPageSource(source);
  let providerCalls = 0;
  const output = await renderStorePage(source, info, { channel: "华为", width: 450, height: 800, maxKB: 500 }, { outpaintProvider:async () => {
    providerCalls += 1;
    return {
      buffer:await sharp({ create:{ width:600, height:1067, channels:3, background:"#d99a9a" } }).png().toBuffer(),
      jobId:"rh-test-job",
      sourceRect:{ x:0, y:.2188, width:1, height:.5623 },
    };
  } });
  const metadata = await sharp(output.buffer).metadata();
  assert.equal(metadata.width, 450);
  assert.equal(metadata.height, 800);
  assert.equal(metadata.format, "jpeg");
  assert.ok(output.bytes <= 500 * 1024);
  assert.equal(providerCalls, 1);
  assert.equal(output.outpaintApplied, true);
  assert.equal(output.outpaintMethod, "nano-banana-outpaint");
  assert.equal(output.outpaintJobId, "rh-test-job");
  assert.ok(output.sourceRect.width < 1 || output.sourceRect.height < 1);
  assert.ok(!output.warnings.some((item) => item.includes("比例差异")));
});

test("匹配比例不重复扩图", async () => {
  const source = await sharp({ create: { width: 720, height: 1280, channels: 3, background: "#e8baba" } }).png().toBuffer();
  const output = await renderStorePage(source, await inspectPageSource(source), { channel:"OPPO", width:720, height:1280, maxKB:150 });
  assert.equal(output.outpaintApplied, false);
});

test("异比例输出缺少真实扩图服务时直接失败，不用模糊或拉伸冒充扩图", async () => {
  const source = await sharp({ create:{ width:1920, height:1080, channels:3, background:"#e8baba" } }).png().toBuffer();
  await assert.rejects(
    renderStorePage(source, await inspectPageSource(source), { channel:"小米", width:2048, height:1536, maxKB:1024 }),
    /需要真实自动扩图/,
  );
});

test("ZIP目录包含素材名称、商店、尺寸和有序页码", () => {
  assert.equal(outputZipPath("甄嬛许愿", { channel: "4399", width: 1600, height: 960 }, 6), "甄嬛许愿/4399/43991600x960/1600x960-6.jpg");
});

test("只有大比例改动尺寸启用高级分层调整", () => {
  assert.equal(needsAdvancedComposition({ channel:"黑鲨", width:600, height:600 }), true);
  assert.equal(needsAdvancedComposition({ channel:"小米", width:2048, height:1536 }), true);
  assert.equal(needsAdvancedComposition({ channel:"华为", width:800, height:450 }), false);
});

test("背景、人物、截图、文案和Logo可独立等比移动缩放", async () => {
  const manifest = { width:100, height:100, method:"test", layers:["background","character","screenshot","copy","logo"].map((id) => ({ id, visible:true })) };
  const layers = new Map();
  layers.set("background", await sharp({ create:{ width:100, height:100, channels:4, background:{ r:240,g:220,b:210,alpha:1 } } }).png().toBuffer());
  for (const [id, color] of [["character","#ee3322"],["screenshot","#22aa66"],["copy","#ffffff"],["logo","#3355ee"]]) {
    const svg = `<svg width="100" height="100"><rect x="40" y="40" width="20" height="20" fill="${color}"/></svg>`;
    layers.set(id, await sharp(Buffer.from(svg)).png().toBuffer());
  }
  const adjustment = defaultLayerAdjustments();
  adjustment.character = { ...adjustment.character, x:-20, scale:150 };
  adjustment.logo = { ...adjustment.logo, x:20, y:-20, scale:80 };
  const output = await renderLayeredStorePage(layers, manifest, { channel:"黑鲨", width:600, height:600, maxKB:1024 }, adjustment);
  const meta = await sharp(output.buffer).metadata();
  assert.equal(meta.width, 600); assert.equal(meta.height, 600); assert.ok(output.bytes <= 1024 * 1024);
  assert.equal(output.adjustment.character.x, -20); assert.equal(output.adjustment.character.scale, 150);
  assert.equal(output.adjustment.logo.y, -20); assert.equal(output.layerMethod, "test");
});
