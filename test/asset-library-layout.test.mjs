import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../public/styles.css", import.meta.url), "utf8");

test("资产库使用自适应多列卡片并在图片下显示文件信息", () => {
  assert.match(css, /\.asset-main \.asset-card-grid\{grid-template-columns:repeat\(auto-fill,minmax\(180px,1fr\)\)/);
  assert.match(app, /<b title="\$\{esc\(asset\.name\)\}">/);
  assert.match(app, /▧ \$\{assetCategory\(asset\)\} · \$\{formatBytes\(asset\.bytes\)\}/);
});

test("资产库横图和竖图均在四比三预览框内完整居中", () => {
  assert.match(css, /\.asset-main \.asset-preview\{[^}]*aspect-ratio:4\/3[^}]*padding:12px/);
  assert.match(css, /\.asset-main \.asset-preview img\{[^}]*object-fit:contain[^}]*object-position:center/);
  assert.doesNotMatch(app.match(/const assetCard = \(asset\) =>[^;]+/)?.[0] || "", /<span>/);
});
