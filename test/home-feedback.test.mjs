import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {taskIndex} from '../public/workbench-model.js';

const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
const css = await readFile(new URL("../public/styles.css", import.meta.url), "utf8");
const recentCss = await readFile(new URL("../public/home-recent-cards.css", import.meta.url), "utf8");
const dashboard = await readFile(new URL("../public/home-dashboard.js", import.meta.url), "utf8");
const taskMenu = await readFile(new URL("../public/home-task-menu.js", import.meta.url), "utf8");

test("首页最近任务按更新时间排序并默认展示卡片", () => {
  const start = app.indexOf("function renderHome()");
  const end = app.indexOf("function taskNameFromInstruction", start);
  const home = app.slice(start, end);
  assert.match(home, /mountDashboard\(content/);
  assert.match(home, /例如：为XXX项目XXXKV生成平台全套资源位图/);
  assert.match(dashboard, /最近任务/);
  assert.deepEqual(taskIndex({tasks:[{id:'older',updatedAt:'2026-10-20T00:00:00Z'},{id:'newer',updatedAt:'2026-10-28T00:00:00Z'}]}).map(t=>t.id),['newer','older']);
  assert.match(dashboard, /layout='grid'/);
});

test("首页顶部只保留侧栏收起按钮并把搜索置于内容左侧", () => {
  assert.match(html, /id="topbar-search-input"/);
  assert.match(html, /id="topbar-notification"/);
  assert.match(html, /id="topbar-user-button"/);
  assert.match(html, /id="sidebar-toggle"/);
  assert.doesNotMatch(html, /id="topbar-sidebar-toggle"/);
  assert.doesNotMatch(html, /id="new-task"/);
});

test("最近任务统一封面高度，悬停提供选择、收藏和更多操作", () => {
  const card=app.slice(app.indexOf('function homeRecentTaskCard('),app.indexOf('function homeTaskUrl('));
  assert.match(card, /data-dash-select/);
  assert.match(card, /data-dash-favorite/);
  assert.doesNotMatch(card, /projectName\(task.projectId\)/);
  assert.match(card, /homeTaskMenu\(\{taskId:task.id\}\)/);
  for(const action of ['rename','copy','download','trash'])assert.match(taskMenu,new RegExp(`\\['${action}','`));
  assert.doesNotMatch(taskMenu,/\['(?:move|share|link)','/);
  assert.match(dashboard, /layout='grid'/);
  assert.match(dashboard, /data-dash-menu/);
  assert.match(recentCss, /home-card-cover\{[^}]*height:192px/);
  assert.match(css, /home-recent-task-card:hover \.home-task-card-tools/);
  assert.match(css, /background:rgba\(255,255,255,\.82\)/);
});

test("最近任务状态使用独立语义颜色", () => {
  for (const status of ["草稿", "主图制作", "批量生成", "成套审核", "已完成", "生成失败", "已退回", "已交付"]) {
    assert.match(css, new RegExp(`home-card-status\\[data-status="${status}"\\]`));
  }
});

test("工作台不再包含待接单和主图确认状态", () => {
  for (const source of [app, html, css]) {
    assert.doesNotMatch(source, /待接单|主图确认/);
  }
});
