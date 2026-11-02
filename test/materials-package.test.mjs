import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
const server = fs.readFileSync(new URL("../server.mjs", import.meta.url), "utf8");

test("完成任务只显示一个成套下载入口", () => {
  const header = app.slice(app.indexOf("function renderTaskDetail"), app.indexOf("function editorTargetDock"));
  assert.match(header, /task\.status !== "已完成" && !\(task\.status === "成套审核" && task\.qc\?\.passed\)/);
  assert.match(header, /href="\/api\/tasks\/\$\{task\.id\}\/package">成套下载/);
  assert.doesNotMatch(header, /class="editor-more"/);
});

test("社区任务主按钮直接生成并下载整套素材", () => {
  const fn = app.slice(app.indexOf("async function downloadMaterialPackage"), app.indexOf("async function approveAndDownloadSuite"));
  assert.match(fn, /renderArtifacts\(false, button\)/);
  assert.match(fn, /\/materials-package/);
  assert.match(app, /id="editor-download-materials">确认并下载整套（/);
  assert.match(app, /return Boolean\(passed && state\.task\?\.artifacts\?\.length === state\.task\?\.targetTemplateIds\?\.length\)/);
});

test("首页任务缩略图优先展示完整合成图，返回编辑器时保存预览", () => {
  const thumb = app.slice(app.indexOf("function taskThumb"), app.indexOf("function modeLabel"));
  assert.match(thumb, /task\.coverPreview\?\.url \|\| finished\?\.url/);
  const preview = app.slice(app.indexOf("async function saveTaskCoverPreview"), app.indexOf("async function uploadCommunityInput"));
  assert.match(preview, /renderCanvas\(template, false\)/);
  assert.match(preview, /\/cover-preview/);
  // 返回按钮：先保存封面预览，再回到列表（goDashboardView 会清掉当前任务）。
  assert.match(app, /await saveTaskCoverPreview\(\);\s*const returnView=[^\n]*\n\s*state\.sourceImage = null; goDashboardView\(returnView\);/);
  assert.match(server, /const coverPreviewMatch = matchRoute\(url\.pathname, "\/api\/tasks\/:id\/cover-preview"\)/);
});

test("当前素材包接口不要求任务先进入已完成状态", () => {
  const start = server.indexOf("const materialsPackageMatch");
  const end = server.indexOf("const packageMatch", start);
  const route = server.slice(start, end);
  assert.match(route, /working-materials/);
  assert.doesNotMatch(route, /task\.status !== "已完成"/);
  assert.match(route, /task\.artifacts/);
});

