export const AD_MOTION_MODEL_LABEL = '微光画布 · 可灵 V3';

const activeStatuses = new Set(['queued', 'preparing', 'submitting', 'submitted', 'processing', 'downloading', 'encoding']);
const statusLabels = {
  queued: '等待制作',
  preparing: '正在准备动效画面',
  submitting: '正在提交视频任务',
  submitted: '视频任务已提交',
  processing: '正在生成视频',
  downloading: '正在保存生成视频',
  encoding: '正在制作 GIF',
  completed: '动效已生成',
  failed: '动效制作失败',
  cancelled: '动效制作已停止',
  result_uncertain: '视频任务结果待确认',
};

export const isAdMotionRunning = job => activeStatuses.has(job?.status);
export const isAdMotionUncertain = job => job?.status === 'result_uncertain';
export const hasAdMotionVersion = (job, version) => job?.status === 'completed' && Boolean(version?.number || job.versionNumber);
export const isAdMotionPending = result => result?.pending === true && Boolean(result.motionJob);

export function adMotionStatusText(job) {
  if (!job) return `默认使用 ${AD_MOTION_MODEL_LABEL} 生成动态`;
  const label = statusLabels[job.status] || '正在读取动效状态';
  return `${AD_MOTION_MODEL_LABEL} · ${label}`;
}

export function adMotionAction(job) {
  if (job?.status === 'completed') return {label: '重新生成动效', payload: {regenerate: true}};
  if (job?.status === 'failed' || job?.status === 'cancelled') return {label: job.videoReady ? '重试转换 GIF' : '重试可灵动效', payload: {retry: true}};
  return {label: '生成可灵动效', payload: {}};
}

export function adGenerationMessage(result) {
  const pending = Array.isArray(result?.pending) ? result.pending.length : 0;
  const errors = Array.isArray(result?.errors) ? result.errors.length : 0;
  const generated = Number(result?.generated) || 0;
  if (pending) return `已生成 ${generated} 张候选，${pending} 张可灵 V3 动效正在后台制作${errors ? `；另有 ${errors} 项失败，请查看原因` : ''}`;
  if (errors) return `已生成 ${generated}/${Number(result?.total) || 0} 张候选，失败项可在工作台查看原因并重试`;
  return `已自动生成 ${generated} 张候选，请逐张检查`;
}

// A page reload only resumes these GET requests. It never submits a paid job.
export function watchAdMotionJob({api, batchId, specId, isActive, onUpdate, onError, intervalMs = 4000, schedule = setTimeout, cancel = clearTimeout}) {
  let stopped = false, timer;
  const active = () => !stopped && isActive();
  const poll = async () => {
    if (!active()) return;
    try {
      const result = await api(`/api/ad-resources/batches/${encodeURIComponent(batchId)}/items/${encodeURIComponent(specId)}/motion-job`);
      if (!active()) return;
      onUpdate(result);
      if (active() && isAdMotionRunning(result.motionJob)) timer = schedule(poll, intervalMs);
    } catch (error) {
      if (!active()) return;
      onError?.(error);
      // A read failure is not proof that the provider failed. Continue checking
      // the persisted job instead of allowing an accidental second submission.
      timer = schedule(poll, intervalMs);
    }
  };
  timer = schedule(poll, intervalMs);
  return () => {stopped = true; if (timer !== undefined) cancel(timer);};
}
