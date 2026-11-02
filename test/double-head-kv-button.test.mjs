import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const tasks = JSON.parse(fs.readFileSync(new URL("../data/runtime/tasks.json", import.meta.url), "utf8"));
const task = tasks.find((item) => item.id === "a226caf7-6cc6-48d8-b373-ebd49317abab");

test("双大头KV任务保留全部旧按钮，并为按钮尺寸绑定轻量写实版", () => {
  const names = new Set(task.assets.map((item) => item.name));
  assert.ok(names.has("按钮.png"));
  assert.ok(names.has("按钮-已下载.png"));
  assert.ok(names.has("AI按钮-双大头KV-立即下载.png"));
  assert.ok(names.has("AI按钮-双大头KV-已下载.png"));
  assert.ok(names.has("AI按钮-写实KV-v2-立即下载.png"));
  assert.ok(names.has("AI按钮-写实KV-v2-已下载.png"));
  assert.ok(names.has("AI按钮-写实KV-v3-立即下载.png"));
  assert.ok(names.has("AI按钮-写实KV-v3-已下载.png"));

  const normalTemplates = [
    "mumu-splash-before-click",
    "mumu-splash-hover",
    "mumu-desktop-popup",
    "mumu-desktop-banner",
    "mumu-miniapp-popup",
    "mumu-system-message-banner",
    "mumu-new-game-top-banner",
    "mumu-popup",
  ];
  for (const id of normalTemplates) {
    assert.equal(task.parameters.assetByTemplate[id].button, "AI按钮-写实KV-v3-立即下载.png", id);
  }
  assert.equal(task.parameters.assetByTemplate["mumu-splash-after-click"].button, "AI按钮-写实KV-v3-已下载.png");
});

test("轻量写实版按钮保持MuMu标准PNG尺寸和版权字体来源记录", () => {
  for (const asset of task.assets.filter((item) => item.name.startsWith("AI按钮-写实KV-v3-"))) {
    assert.deepEqual([asset.mime, asset.width, asset.height], ["image/png", 369, 102]);
    assert.equal(asset.fontFamily, "字魂柳叶楷书");
    assert.equal(asset.fontLicensePolicyId, "menghui-zhenhuan-fonts-v1");
    const png = fs.readFileSync(new URL(`../data/runtime/storage/${task.id}/assets/${asset.name}`, import.meta.url));
    assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20), png[25]], [369, 102, 6]);
  }
});
