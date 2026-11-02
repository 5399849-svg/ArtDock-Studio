import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("扩图实验清单保持素材来源、种子和非生产状态", () => {
  const path = new URL("../local-ai/experiments/实验1-背景扩图/manifest.json", import.meta.url);
  if (!fs.existsSync(path)) return;
  const manifest = JSON.parse(fs.readFileSync(path, "utf8"));
  assert.equal(manifest.offline, true);
  assert.equal(manifest.model, null);
  assert.equal(manifest.modelLicenseApproved, false);
  assert.equal(manifest.records.length, 5);
  assert.ok(manifest.records.every((item) => item.seed === 3701 && item.promptPolicy.includes("禁止生成人物")));
});

test("SDXL实验策略和视觉评审保持非生产状态", () => {
  const policyPath = new URL("../local-ai/generative/sdxl-model-policy.json", import.meta.url);
  const reviewPath = new URL("../local-ai/experiments/实验1-背景扩图/outputs-sdxl-fp16-v1/visual-review.json", import.meta.url);
  const policy = JSON.parse(fs.readFileSync(policyPath, "utf8"));
  const review = JSON.parse(fs.readFileSync(reviewPath, "utf8"));
  assert.equal(policy.productionApproved, false);
  assert.equal(policy.externalAssetUpload, false);
  assert.equal(policy.downloadPolicy, "fp16-safetensors-only");
  assert.equal(review.status, "failed");
  assert.equal(review.approvedForWorkbench, false);
  assert.equal(review.runs.length, 2);
});
