import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
const server = fs.readFileSync(new URL("../server.mjs", import.meta.url), "utf8");

test("编辑器显示全部按钮素材并把当前选中项排在前面", () => {
  assert.doesNotMatch(app, /items\.slice\(0,4\)/);
  assert.match(app, /Number\(b\.name === selectedName\) - Number\(a\.name === selectedName\)/);
});

test("自动套版为弹窗补充本地人物层并保留明确按钮绑定", () => {
  const block = app.slice(app.indexOf("async function autoApplyAllTemplates"), app.indexOf("async function addTargetSizes"));
  assert.match(block, /local-ai\/preprocess/);
  assert.match(block, /preservedButtons/);
});

test("弹窗圆框使用亮色的内粗外细双描边", () => {
  assert.match(app, /ring === "inner" \? \.006 : \.002/);
  assert.match(app, /Math\.max\(150/);
  assert.doesNotMatch(app, /strokeStyle\s*=\s*["']#000/);
});

test("重新扩图沿用原始KV位置而不是旧生成画布的100%位置", () => {
  assert.match(server, /savedPlacement\.url && savedPlacement\.sourceAssetName === sourceAsset\.name && savedPlacement\.originalPlacement/);
  assert.match(server, /const placement = job\.originalPlacement \|\| task\.parameters\?\.backgroundByTemplate/);
});

test("弹窗提供独立人物抠图、移动缩放和顶部渐隐", () => {
  assert.match(app, /id="editor-character-cutout"/);
  assert.match(app, /id="character-cutout-dialog"/);
  assert.match(app, /local-ai\/cutout/);
  assert.match(app, /applyCharacterEdgeFade\(layerCtx, body, breakout, contentTop\)/);
  assert.match(app, /contentTop < bounds\.y - 8/);
  assert.match(app, /globalCompositeOperation = "destination-in"/);
  assert.match(app, /\["character", "core-character"\]\.includes\(role\)/);
});

test("人物抠图支持本机SAM2与可选remove.bg引擎", () => {
  assert.match(app, /option value="sam2"/);
  assert.match(app, /option value="removebg"/);
  assert.match(server, /REMOVE_BG_API_KEY/);
  assert.match(server, /https:\/\/api\.remove\.bg\/v1\.0\/removebg/);
});

test("所有项目的弹窗精细抠图保持整图一次分割、原尺寸对齐和边界渐隐", () => {
  assert.match(server, /if \(!points\.length\) return json\(res, 422/);
  assert.match(server, /form\.append\("image_file", new Blob\(\[apiInput\]/);
  assert.match(server, /form\.append\("size", "full"\)/);
  assert.match(server, /resize\(sourceWidth, sourceHeight, \{ fit:"fill", kernel:"lanczos3" \}\)/);
  assert.doesNotMatch(server, /const outwardShift = points\.length > 1/);
  assert.doesNotMatch(app, /tracePsdRegion\(layerCtx, body, false\); tracePsdRegion\(layerCtx, breakout, false\)/);
  assert.match(app, /asset\.protectedRegions\.map/);
  assert.match(app, /applyCharacterEdgeFade\(layerCtx, body, breakout, contentTop\)/);
  assert.match(app, /const draw = getElementLayout\(state\.task, template, "character"\)/);
});
