import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const policies = JSON.parse(fs.readFileSync(new URL("../config/font-policies.json", import.meta.url), "utf8"));

test("梦回甄嬛传登记四款公司版权字体并禁止分发字体文件", () => {
  const policy = policies.find((item) => item.id === "menghui-zhenhuan-fonts-v1");
  assert.equal(policy.projectName, "《梦回甄嬛传》");
  assert.equal(policy.licenseAssertion.term, "perpetual");
  assert.equal(policy.licenseAssertion.commercialUse, true);
  assert.deepEqual(policy.licensedFonts.map((font) => font.family), [
    "字魂雅致黑",
    "字魂柳叶楷书",
    "字小魂吐司体",
    "字魂佛山彩灯体",
  ]);
  assert.ok(policy.licensedFonts.every((font) => font.status === "ready"));
  assert.ok(policy.licensedFonts.every((font) => fs.existsSync(new URL(`../${font.file}`, import.meta.url))));
  assert.ok(policy.licensedFonts.every((font) => /^[a-f0-9]{64}$/.test(font.sha256)));
  assert.equal(policy.controls.localRasterizationOnly, true);
  assert.equal(policy.controls.includeFontFilesInAssetPackages, false);
  assert.equal(policy.controls.exposeFontDownload, false);
  assert.equal(policy.controls.officialSiteDownload, "authenticated-entitlement-only");
  assert.equal(policy.controls.rejectAnonymousTrialDownloadForCommercialOutput, true);
  assert.equal(policy.fallback.license, "SIL-OFL-1.1");
  assert.equal(policy.fallback.status, "ready");
  assert.ok(fs.existsSync(new URL(`../${policy.fallback.file}`, import.meta.url)));
  assert.ok(fs.existsSync(new URL(`../${policy.fallback.licenseFile}`, import.meta.url)));
});
