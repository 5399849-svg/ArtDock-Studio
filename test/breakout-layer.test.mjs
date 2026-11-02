import test from "node:test";
import assert from "node:assert/strict";
import { coverPlacement, findForegroundOutput, fitSubjectToBreakout, isForegroundOutput, isProductionForeground, keepImageAspect } from "../public/breakout-layer.js";

test("横版人物旧尺寸拉伸时恢复原图比例，调整宽高仍保持比例", () => {
  const old = { x: 438, y: -75, width: 486, height: 864, visible: true };
  const repaired = keepImageAspect(old, 3840, 2160);
  assert.ok(Math.abs(repaired.width / repaired.height - 3840 / 2160) < 1e-8);
  assert.ok(Math.abs(repaired.width * repaired.height - old.width * old.height) < 1e-8);
  const resized = keepImageAspect({ ...repaired, width: 900 }, 3840, 2160, "width");
  assert.equal(resized.height, 506.25);
  assert.equal(resized.visible, true);
});

test("粗分割前景总图只被识别为素材，不进入弹窗成品", () => {
  const localAi = {
    source: "横版纯图.png",
    outputs: [{ name: "前景总图.png" }, { name: "背景修补草稿.jpg" }],
  };
  assert.equal(isForegroundOutput(localAi.outputs[0]), true);
  assert.equal(isProductionForeground(localAi.outputs[0]), false);
  assert.equal(findForegroundOutput(localAi, "横版纯图.png"), null);
  assert.equal(findForegroundOutput(localAi, "竖版纯图.png"), null);
});

test("弹窗只选用带精细质量标记且源图匹配的透明人物层", () => {
  const localAi = { outputs: [
    { name:"前景总图__竖版.png", kind:"foreground", sourceAssetName:"竖版.png" },
    { name:"人物精细抠图-removebg__竖版.png", kind:"foreground", sourceAssetName:"竖版.png", qualityStatus:"external-fine-cutout", method:"remove-bg-api" },
  ] };
  assert.equal(findForegroundOutput(localAi, "竖版.png")?.name, "人物精细抠图-removebg__竖版.png");
});

test("原图底层回退层不得进入弹窗，已审核的横竖版独立透明层可以使用", () => {
  const old = { name:"人物精细抠图-原图保真__竖版.png", kind:"foreground", qualityStatus:"source-pixel-preserving", method:"source-pixel-preserving-fallback" };
  const reviewed = { name:"人物保真透明层__横版.png", kind:"foreground", qualityStatus:"reviewed-source-pixel-cutout", method:"offline-character-layer" };
  assert.equal(isProductionForeground(old), false);
  assert.equal(isProductionForeground(reviewed), true);
});

test("透明人物层使用与背景相同的焦点和缩放参数", () => {
  const result = coverPlacement(1920, 1080, 1200, 700, { focalX: 25, focalY: 75, scale: 100 });
  assert.equal(result.height, 700);
  assert.ok(Math.abs(result.width - 1244.4444444444443) < 1e-8);
  assert.ok(Math.abs(result.x + 11.111111111111086) < 1e-8);
  assert.ok(Math.abs(result.y) < 1e-8);
});
test("完整人物包围框按联合破界空间缩放且保持比例", () => {
  const fitted = fitSubjectToBreakout(
    { x: 900, y: 200, width: 2100, height: 1700 },
    { x: 314, y: 86, width: 567, height: 567 },
    { x: 311, y: 23, width: 578, height: 369 },
  );
  assert.equal(fitted.source.x, 900);
  assert.equal(fitted.target.y, 23);
  assert.ok(fitted.target.width <= 578);
  assert.ok(fitted.target.height <= 630);
  assert.ok(Math.abs(fitted.target.width / fitted.target.height - 2100 / 1700) < 1e-8);
});
