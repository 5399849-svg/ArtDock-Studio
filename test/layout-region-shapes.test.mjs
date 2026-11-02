import test from "node:test";
import assert from "node:assert/strict";
import { updateLayoutRegions } from "../lib/layout-regions.mjs";

test("异形区域编辑保留圆形、路径来源和KV自适应固定效果", () => {
  const template = { id: "popup", width: 640, height: 900 };
  const current = {
    templateId: "popup",
    revision: 0,
    globalRegions: [
      { type: "fixed", name: "固定_圆形边框_外圈_KV取色", shape: "ellipse", bounds: { x: 22, y: 139, width: 595, height: 595 }, effect: { kind: "adaptive-stroke", colorSource: "kv-dominant", export: true } },
    ],
    variants: [{ id: "layout-01", name: "默认版式", regions: [
      { type: "body-boundary", name: "13_成品主体边界", shape: "ellipse", bounds: { x: 30, y: 147, width: 578, height: 578 } },
      { type: "character-breakout", name: "14_角色允许破界区", shape: "path", bounds: { x: 31, y: 78, width: 578, height: 374 }, pathSource: { fileName: "popup.psd", layerName: "区域路径_角色允许破界区" } },
    ]}],
  };
  const input = structuredClone(current);
  input.variants[0].regions[1].bounds.y = 79;
  delete input.globalRegions[0].effect;
  delete input.variants[0].regions[1].pathSource;
  const next = updateLayoutRegions(template, current, input);
  assert.equal(next.globalRegions[0].shape, "ellipse");
  assert.equal(next.globalRegions[0].effect.kind, "adaptive-stroke");
  assert.equal(next.variants[0].regions[0].type, "body-boundary");
  assert.equal(next.variants[0].regions[1].shape, "path");
  assert.equal(next.variants[0].regions[1].pathSource.layerName, "区域路径_角色允许破界区");
  assert.equal(next.variants[0].regions[1].bounds.y, 79);
});
