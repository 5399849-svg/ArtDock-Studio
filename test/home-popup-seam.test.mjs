import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../public/app.js", import.meta.url), "utf8");

// v3 的旧结果在服务器上已经把原图保护好（交界不再羽化）；现在服务器出的 v4 和更早的结果照旧羽化。
test("AI扩图与原图的四周交界使用自适应羽化（已做原图保护的 v3 旧结果除外）", () => {
  assert.match(source, /drawRegisteredComposite\(ctx,source,image,geometry,background\.registration\.safetyMethod === "generated-extension-original-protected-v3" \? \{\} : \{featherX,featherY\}\)/);
  assert.match(source, /geometry\.original\.width \* \.12/);
  assert.match(source, /drawFeatheredOriginal\(ctx, image, \{ x, y, width: drawWidth, height: drawHeight \}, \{ featherX: feather, featherY: feather \}\)/);
});

test("恢复原图清除扩图注册信息并回到满画布裁切", () => {
  const restore = source.slice(source.indexOf("async function restoreTemplateBackground"), source.indexOf("function referenceAssetsForTemplate"));
  assert.doesNotMatch(restore, /confirm\(/);
  assert.match(restore, /delete stored\.registration/);
  assert.match(restore, /delete stored\.originalPlacement/);
  assert.match(restore, /stored\.scale = Math\.max\(100/);
  assert.match(source, /background\.url && background\.registration\?\.sourceRect/);
});

test("羽化合成发生在固定元素、标题、Logo和按钮之前", () => {
  const render = source.slice(source.indexOf("function renderCanvas"), source.indexOf("function drawUploadedElement"));
  assert.ok(render.indexOf("drawRegisteredComposite") < render.indexOf("drawFixedPsdElements"));
  assert.ok(render.indexOf("drawRegisteredComposite") < render.indexOf('drawUploadedElement(ctx, template, "title")'));
});

