import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");

test("规范中心资源位列表使用中性占位图，不读取生产任务KV", () => {
  const start = app.indexOf("function renderBusinessLines()");
  const end = app.indexOf("function addBusinessLine", start);
  const render = app.slice(start, end);
  assert.match(render, /class="spec-resource-placeholder"/);
  assert.doesNotMatch(render, /resourcePositionThumb/);
  assert.doesNotMatch(app, /function resourcePositionThumb/);
});
