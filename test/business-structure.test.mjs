import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const lines = JSON.parse(await readFile(new URL("../data/seed-business-lines.json", import.meta.url), "utf8"));

test("渠道发行包含首批五个渠道", () => {
  const channel = lines.find((line) => line.id === "channel-distribution");
  assert.deepEqual(channel.segments.map((item) => item.name), ["华为", "OPPO", "VIVO", "小米", "荣耀"]);
});

test("投放包含模拟器和信息流三类", () => {
  const marketing = lines.find((line) => line.id === "performance-marketing");
  assert.deepEqual(marketing.segments.map((item) => item.name), ["MuMu模拟器", "雷电模拟器", "信息流"]);
});

test("业务线和细分类型标识不重复", () => {
  const ids = lines.flatMap((line) => [line.id, ...line.segments.map((item) => `${line.id}/${item.id}`)]);
  assert.equal(new Set(ids).size, ids.length);
});
