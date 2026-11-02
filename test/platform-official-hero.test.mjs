import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const readJson = (name) => JSON.parse(fs.readFileSync(new URL(name, import.meta.url), "utf8"));
const templates = readJson("../config/templates.json");
const layouts = readJson("../config/psd-layout-rules-v1.json").templates;
const rules = readJson("../data/runtime/resource-rules.json");
const specs = readJson("../data/runtime/specifications.json");
const appSource = fs.readFileSync(new URL("../public/app.js", import.meta.url), "utf8");

test("平台官网头图录入平台业务并保留PSD技术参数", () => {
  const pc = templates.find((item) => item.id === "platform-pc-official-hero");
  const mobile = templates.find((item) => item.id === "platform-mobile-official-hero");
  assert.deepEqual([pc.businessLineId, pc.segmentId, pc.categoryId], ["platform-community", "platform", "platform"]);
  assert.deepEqual([pc.width, pc.height, pc.format, pc.maxBytes], [1920, 1080, "JPG", 614400]);
  assert.deepEqual([mobile.width, mobile.height, mobile.format, mobile.maxBytes, mobile.transparent], [750, 1059, "PNG", 614400, true]);
  assert.equal(pc.automationReady, true);
  assert.equal(mobile.automationReady, true);
});

test("PC官网头图按PSD录入五个版式", () => {
  const layout = layouts.find((item) => item.templateId === "platform-pc-official-hero");
  assert.equal(layout.selectionMode, "auto-from-complete-kv");
  assert.equal(layout.variants.length, 5);
  assert.deepEqual(layout.variants.map((item) => item.name), [
    "版式_01_中下文",
    "版式_02_左文",
    "版式_03_右文",
    "版式_04_左文竖排",
    "版式_05_右文竖排",
  ]);
  assert.equal(layout.deliveryAllowed, true);
});

test("移动端官网头图底部192px在最终合成后写入透明渐变", () => {
  const layout = layouts.find((item) => item.templateId === "platform-mobile-official-hero");
  const fade = layout.variants[0].regions.find((item) => item.type === "transparent-fade");
  assert.deepEqual(fade.bounds, { x: 0, y: 867, width: 750, height: 192 });
  assert.equal(layout.variants[0].regions.some((item) => item.type === "fixed"), false);
  assert.equal(fade.effect.kind, "alpha-fade");
  assert.equal(fade.effect.layerOrder, "final");
  const finalEffect = appSource.match(/function drawFinalPsdEffects[\s\S]*?\n}/)?.[0] || "";
  assert.match(finalEffect, /globalCompositeOperation = "destination-out"/);
  const render = appSource.slice(appSource.indexOf("function renderCanvas"), appSource.indexOf("function drawUploadedElement"));
  assert.ok(render.indexOf('drawUploadedElement(ctx, template, "button")') < render.indexOf("drawFinalPsdEffects(ctx, template)"));
});

test("两个规范均已核验发布并归档PSD附件", () => {
  for (const templateId of ["platform-pc-official-hero", "platform-mobile-official-hero"]) {
    const rule = rules.find((item) => item.templateId === templateId);
    const spec = specs.find((item) => item.templateId === templateId);
    assert.equal(rule.status, "verified");
    assert.equal(rule.deliveryAllowed, true);
    assert.equal(rule.missing.length, 0);
    assert.ok(spec.assets.some((asset) => asset.mime === "image/vnd.adobe.photoshop"));
  }
});



