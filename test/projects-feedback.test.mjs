import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../public/styles.css", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../public/index.html", import.meta.url), "utf8");

test("项目中心包含搜索筛选、排序、视图切换和新建入口", () => {
  for (const id of ["project-search", "project-type-filter", "project-category-filter", "project-owner-filter", "project-date-filter", "project-sort", "project-view-toggle", "new-project"]) assert.match(app, new RegExp(`id=\\"${id}\\"`));
  assert.match(app, /data-tooltip=/);
});

test("最近项目可左右滚动并保留原项目管理功能", () => {
  assert.match(app, /id="project-prev"/);
  assert.match(app, /id="project-next"/);
  assert.match(app, /scrollBy\(\{ left:/);
  assert.match(app, /data-project-edit=/);
  assert.match(app, /data-project-toggle=/);
  assert.match(app, /data-project-upload=/);
});

test("上传图片列表完整展示横图和竖图", () => {
  assert.match(app, /class="project-images"/);
  assert.match(app, /class="project-image-list"/);
  assert.match(css, /\.project-image-card img\{[^}]*object-fit:contain/);
});

test("顶部消息入口使用描边铃铛图标", () => {
  assert.match(html, /id="topbar-notification"[\s\S]*?<svg viewBox="0 0 24 24"/);
  assert.match(css, /\.topbar-notification svg\{[^}]*stroke:currentColor/);
});
