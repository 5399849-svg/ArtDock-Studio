import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const layouts = JSON.parse(fs.readFileSync(new URL("../data/runtime/layout-regions.json", import.meta.url), "utf8"));
const splashIds = ["mumu-splash-before-click", "mumu-splash-hover", "mumu-splash-after-click"];

test("MuMu三个开屏状态只使用PSD当前显示的版式", () => {
  for (const templateId of splashIds) {
    const layout = layouts.find((item) => item.templateId === templateId);
    assert.ok(layout, templateId + " 缺少版式规则");
    assert.equal(layout.selectionMode, "psd-visible-layout");
    assert.equal(layout.variants.length, 1);
    assert.equal(layout.variants[0].name, "版式_01_左Logo_下居中文");
    assert.equal(layout.variants[0].defaultVisible, true);
  }
});
