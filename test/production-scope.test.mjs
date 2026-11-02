import test from "node:test";
import assert from "node:assert/strict";
import { resolveProductionScope, selectProductionTemplates } from "../public/production-scope.js";

const businessLines = [
  { id: "platform-community", name: "平台社区", enabled: true, segments: [{ id: "platform", name: "平台资源位", enabled: true }] },
  { id: "performance-marketing", name: "投放", enabled: true, segments: [{ id: "mumu", name: "MuMu模拟器", enabled: true }, { id: "leidian", name: "雷电模拟器", enabled: true }] },
];

test("一句话中的MUMU模拟器会选择投放下的MuMu资源位", () => {
  const scope = resolveProductionScope("《梦回甄嬛传》甄嬛许愿KV延展MUMU模拟器尺寸", businessLines);
  assert.deepEqual(scope, { businessLineId: "performance-marketing", segmentIds: ["mumu"], label: "MuMu模拟器", explicit: true });
  const templates = [{ id: "platform-a", businessLineId: "platform-community", segmentId: "platform", automationReady: true }, { id: "mumu-a", businessLineId: "performance-marketing", segmentId: "mumu", automationReady: false }];
  const selected = selectProductionTemplates(templates, [{ templateId: "platform-a", deliveryAllowed: true }, { templateId: "mumu-a", deliveryAllowed: false }], scope);
  assert.deepEqual(selected.templates.map((item) => item.id), ["mumu-a"]);
  assert.equal(selected.validationOnly, true);
});

test("未写业务方向时继续默认平台社区", () => {
  const scope = resolveProductionScope("甄嬛许愿KV延展一套尺寸", businessLines);
  assert.equal(scope.businessLineId, "platform-community");
  assert.equal(scope.explicit, false);
});
