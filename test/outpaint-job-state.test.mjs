import test from "node:test";
import assert from "node:assert/strict";
import { recoverOrphanedOutpaintState } from "../lib/outpaint-job-state.mjs";

test("服务重启后自动释放没有内存作业的扩图 running 状态", () => {
  const running = { status: "running", templateId: "banner", startedAt: "2026-09-08T13:20:23.075Z" };
  const recovered = recoverOrphanedOutpaintState(running, { now: new Date("2026-09-15T02:00:00.000Z") });
  assert.equal(recovered.status, "failed");
  assert.equal(recovered.templateId, "banner");
  assert.match(recovered.error, /请重新扩图/);
});

test("仍在内存执行的扩图作业保持 running", () => {
  const running = { status: "running", templateId: "banner" };
  assert.equal(recoverOrphanedOutpaintState(running, { active: true }), running);
});
