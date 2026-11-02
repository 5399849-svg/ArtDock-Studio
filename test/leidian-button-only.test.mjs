import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (name) => JSON.parse(fs.readFileSync(new URL(name, import.meta.url), "utf8"));
const templates = read("../config/templates.json");
const layouts = read("../data/runtime/layout-regions.json");
const profiles = read("../data/runtime/resource-profiles.json");
const rules = read("../data/runtime/resource-rules.json");
const tasks = read("../data/runtime/tasks.json");
const app = fs.readFileSync(new URL("../public/app.js", import.meta.url), "utf8");

test("雷电开屏启动按钮仅导出透明PNG按钮", () => {
  const template = templates.find((item) => item.id === "leidian-splash-button");
  const layout = layouts.find((item) => item.templateId === template.id);
  const profile = profiles.find((item) => item.templateId === template.id);
  const rule = rules.find((item) => item.templateId === template.id);
  assert.deepEqual([template.width, template.height, template.format, template.transparent], [460, 160, "PNG", true]);
  assert.equal(template.renderMode, "button-only");
  assert.equal(template.automationReady, true);
  assert.deepEqual(layout.variants[0].regions.map((region) => region.type), ["button"]);
  assert.equal(profile.elements.button, "required");
  assert.ok(["title", "logo", "ipCopyright", "secondaryCopy"].every((key) => profile.elements[key] === "forbidden"));
  assert.equal(rule.deliveryAllowed, true);
  assert.match(rule.verifiedVisualRules.join("；"), /仅包含按钮/);
  assert.match(app, /const buttonOnly = template\.renderMode === "button-only"/);
});

test("当前雷电任务绑定“立即下载”按钮", () => {
  const task = tasks.find((item) => item.id === "093deb9a-4818-4dca-b79b-ad26aca88b91");
  const asset = task.assets.find((item) => item.role === "button" && item.name === "按钮.png");
  assert.equal(asset.copy, "立即下载");
  assert.deepEqual(task.parameters.assetByTemplate["leidian-splash-button"], { button: "按钮.png" });
  const png = fs.readFileSync(new URL("../data/runtime/storage/093deb9a-4818-4dca-b79b-ad26aca88b91/assets/按钮.png", import.meta.url));
  assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20), png[25]], [369, 102, 6]);
});
