import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { transformButtonPixels } from "../public/button-state.js";

const templates = JSON.parse(fs.readFileSync(new URL("../config/templates.json", import.meta.url), "utf8"));
const profiles = JSON.parse(fs.readFileSync(new URL("../data/runtime/resource-profiles.json", import.meta.url), "utf8"));

test("MuMu三个开屏模板声明正常、Hover金色和点击后灰色按钮状态", () => {
  const states = Object.fromEntries(templates.filter((item) => item.id.startsWith("mumu-splash-")).map((item) => [item.id, item.buttonState]));
  assert.deepEqual(states, {
    "mumu-splash-hover": "hover-gold",
    "mumu-splash-after-click": "disabled-gray",
    "mumu-splash-before-click": "normal",
  });
});

test("MuMu三个开屏模板声明对应按钮文案", () => {
  const labels = Object.fromEntries(templates.filter((item) => item.id.startsWith("mumu-splash-")).map((item) => [item.id, item.buttonLabel]));
  assert.deepEqual(labels, {
    "mumu-splash-hover": "立即下载",
    "mumu-splash-after-click": "已下载",
    "mumu-splash-before-click": "立即下载",
  });
});

test("平台资源位使用立即前往，其它含按钮资源位使用立即下载", () => {
  const buttonIds = new Set(profiles.filter((profile) => !["forbidden", "unspecified"].includes(profile.elements?.button)).map((profile) => profile.templateId));
  const mumuDownloadIds = new Set(["mumu-splash-before-click", "mumu-splash-hover", "mumu-desktop-popup", "mumu-miniapp-popup", "mumu-system-message-banner", "mumu-popup"]);
  for (const template of templates.filter((item) => buttonIds.has(item.id) && item.businessLineId === "platform-community")) {
    assert.equal(template.buttonLabel, "立即前往", template.id);
  }
  for (const id of mumuDownloadIds) {
    assert.equal(templates.find((item) => item.id === id)?.buttonLabel, "立即下载", id);
  }
  assert.equal(templates.find((item) => item.id === "leidian-splash-button")?.buttonLabel, "立即下载");
  assert.equal(templates.find((item) => item.id === "mumu-splash-after-click")?.buttonLabel, "已下载");
  const otherMuMuButtons = templates.filter((item) => buttonIds.has(item.id) && item.segmentId === "mumu" && !mumuDownloadIds.has(item.id) && item.id !== "mumu-splash-after-click");
  assert.ok(otherMuMuButtons.every((item) => item.buttonLabel === undefined));
});

test("画布优先使用模板明确绑定的按钮，其余按模板文案自动匹配", () => {
  const app = fs.readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
  assert.match(app, /item\.role === "button" && item\.copy === buttonLabel/);
  assert.match(app, /const hasExplicitButton = kind === "button"/);
  assert.match(app, /const asset = hasExplicitButton \? selectedAsset : \(matchingButton \|\| selectedAsset\)/);
});

test("Hover按钮形成浅金中心和深金边缘并保留原字体颜色，点击后转为灰度", () => {
  const pixels = new Uint8ClampedArray(3 * 3 * 4);
  const set = (x, y, rgba) => pixels.set(rgba, (y * 3 + x) * 4);
  set(0, 0, [30, 140, 230, 255]);
  set(1, 1, [250, 250, 250, 255]);
  set(2, 0, [250, 250, 250, 255]);
  transformButtonPixels(pixels, "hover-gold", 3, 3);
  const center = [...pixels.slice(16, 20)];
  const outerHighlight = [...pixels.slice(8, 12)];
  assert.deepEqual(center, [250, 250, 250, 255]);
  assert.ok(outerHighlight[0] >= outerHighlight[1] && outerHighlight[1] > outerHighlight[2]);
  const clicked = new Uint8ClampedArray([30, 140, 230, 255]);
  transformButtonPixels(clicked, "disabled-gray", 1, 1);
  assert.equal(clicked[0], clicked[1]);
  assert.equal(clicked[1], clicked[2]);
  assert.ok(clicked[0] < 140);
});
