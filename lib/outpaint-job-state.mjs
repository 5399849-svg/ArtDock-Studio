export function recoverOrphanedOutpaintState(outpaint, { active = false, now = new Date() } = {}) {
  if (!outpaint || outpaint.status !== "running" || active) return outpaint;
  const recoveredAt = now instanceof Date ? now.toISOString() : new Date(now).toISOString();
  return {
    ...outpaint,
    status: "failed",
    failedAt: recoveredAt,
    recoveredAt,
    error: "上一次扩图已中断（服务重启或连接中止），请重新扩图",
  };
}
