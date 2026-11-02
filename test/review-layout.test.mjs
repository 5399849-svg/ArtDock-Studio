import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
const css = await readFile(new URL("../public/styles.css", import.meta.url), "utf8");

const start = app.indexOf("function renderReview()");
const end = app.indexOf("function reviewQcChecklist", start);
const review = app.slice(start, end);

test("审核页包含四类状态、批次统计和三列成品网格", () => {
  // 第四类原叫“已交付”，页面上改名为“已下载”（按下载成套 ZIP 的记录归类）。
  for (const tab of ["待审核", "已退回", "已通过", "已下载"]) assert.match(review, new RegExp(`"${tab}"`));
  assert.match(review, /review-batch-summary/);
  assert.match(review, /review-suite-card/);
  assert.match(css, /review-artifact-grid\{grid-template-columns:repeat\(3/);
});

test("审核页保留源文件、大图、单项审核、人工检查、退回、通过与下载", () => {
  assert.match(review, /data-review-source/);
  assert.match(review, /data-review-preview/);
  assert.match(review, /data-review-submit/);
  assert.match(review, /reviewQcChecklist/);
  assert.match(review, /id="review-reject"/);
  assert.match(review, /id="review-pass"/);
  assert.match(review, /\/package/);
  assert.match(app, /deliverAfter/);
  assert.ok(app.includes('const response = await fetch(`/api/tasks/${task.id}/package`);'));
});

test("已通过与已下载任务互斥，下载历史决定交付归类", () => {
  assert.match(review, /"已通过":.*!delivered\(task\)/s);
  assert.match(review, /"已下载":.*delivered\(task\)/s);
});


