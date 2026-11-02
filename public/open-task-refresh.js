// 重新读列表时（列表里只有任务摘要，/api/bootstrap?tasks=summary），打开着的任务换成同时读到的完整任务（GET /api/tasks/:id）：
// 编辑器要的字段只在完整任务里。列表里已经没有它（删了、移交了）就关掉；还在却没读到完整的，照常报错，不拿摘要顶上。
export function keepOpenTaskFull(tasks, openId, full) {
  const listed = tasks.findIndex((task) => task.id === openId);
  if (listed < 0) return null;
  if (!full || full.error) throw full?.error || new Error("任务没有读到，请刷新页面");
  tasks[listed] = full;
  return full;
}
