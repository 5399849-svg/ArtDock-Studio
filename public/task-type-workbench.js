import {taskStatusBucket, statusLabels} from '/workbench-model.js?v=20261022-bulk-create';

const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));

const workspace = (id, name, line, segment, segments, description) => Object.freeze({
  id, name, line, segment, segments:Object.freeze(segments), description
});

export const taskTypeWorkspaces = Object.freeze({
  custom:workspace('custom','自定义尺寸','platform-community','custom-canvas',['custom-canvas'],'自由设置画布尺寸，制作背景、角色与文案'),
  platform:workspace('platform','平台资源位','platform-community','platform',['platform'],'平台展示资源的尺寸适配与制作'),
  community:workspace('community','社区外媒','platform-community','community-media',['community','official-media','community-media'],'社区、公众号与外媒 Banner 制作'),
  mumu:workspace('mumu','MuMu模拟器','performance-marketing','mumu',['mumu'],'MuMu 模拟器资源位的尺寸适配与制作'),
  leidian:workspace('leidian','雷电模拟器','performance-marketing','leidian',['leidian'],'雷电模拟器资源位的尺寸适配与制作')
});

function taskMatches(task, config, templates) {
  if (!task || !config || (task.module && task.module !== 'core')) return false;
  if (task.businessLineId && task.businessLineId !== config.line) return false;
  const segments = [task.segmentId, ...(Array.isArray(task.segmentIds) ? task.segmentIds : [])].filter(Boolean);
  const references = new Set([task.masterTemplateId, ...(Array.isArray(task.targetTemplateIds) ? task.targetTemplateIds : [])].filter(Boolean));
  const related = templates.filter(template => references.has(template.id));
  const lines = new Set([task.businessLineId, ...related.map(template => template.businessLineId)].filter(Boolean));
  if (!lines.has(config.line)) return false;
  return segments.some(segment => config.segments.includes(segment))
    || related.some(template => template.businessLineId === config.line && config.segments.includes(template.segmentId));
}

/** Select core tasks by saved scope and referenced resource definitions. */
export function selectTaskTypeTasks(data, type) {
  const config = taskTypeWorkspaces[type];
  if (!config) return [];
  return (data?.tasks || []).filter(task => taskMatches(task, config, data.templates || []))
    .sort((a,b) => (Date.parse(b.updatedAt || b.createdAt) || 0) - (Date.parse(a.updatedAt || a.createdAt) || 0));
}

function dateLabel(value) {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return '刚刚';
  const days = Math.max(0, Math.floor((Date.now() - time) / 86400000));
  return days ? `${days} 天前` : '今天';
}

/** Mount an existing-task landing page; all mutations belong to callbacks. */
export function mountTaskTypeWorkbench(content, {
  type, data = {}, thumb = () => '', openTask, create, browse, isActive = () => true
}) {
  const config = taskTypeWorkspaces[type];
  if (!config) throw new Error('未知任务工作台');
  const tasks = selectTaskTypeTasks(data, type);
  const templates = (data.templates || []).filter(template => template.businessLineId === config.line
    && config.segments.includes(template.segmentId) && template.enabled !== false);
  const projects = new Map((data.projects || []).map(project => [project.id, project.name]));
  const taskMap = new Map(tasks.map(task => [String(task.id), task]));
  let status = 'all';
  let query = '';
  let view = 'grid';
  content.innerHTML = `<section class="task-type-workbench" data-task-type="${config.id}">
    <header class="ttw-heading">
      <div><h2>${esc(config.name)}工作台</h2>
      <p>${esc(config.description)}${type==='custom'?'':`<span>·</span>${templates.length} 个资源位`}</p></div>
      <div class="ttw-actions">${type==='custom'?'':'<button type="button" class="button secondary" data-task-type-browse>查看规范</button>'}
      <button type="button" class="button primary" data-task-type-create>新建任务</button></div>
    </header>
    <section class="ttw-tasks" aria-label="${esc(config.name)}任务">
      <div class="ttw-task-heading"><h3>最近任务</h3>
        <div class="ttw-status-tabs" role="group" aria-label="按任务状态筛选">
          ${Object.entries(statusLabels).map(([key,label]) => `<button type="button" data-task-type-status="${key}" aria-pressed="${key === 'all'}">${label}<span>${tasks.filter(task => key === 'all' || taskStatusBucket(task) === key).length}</span></button>`).join('')}
        </div>
        <div class="ttw-task-tools">
        <label class="ttw-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg>
        <input type="search" data-task-type-search placeholder="搜索任务或项目" aria-label="搜索${esc(config.name)}任务或项目"></label>
        <div class="ttw-view-switch" role="group" aria-label="任务展示方式">
          <button type="button" data-task-type-view="list" aria-label="列表视图" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5h13M8 12h13M8 19h13"/><circle cx="3" cy="5" r=".75"/><circle cx="3" cy="12" r=".75"/><circle cx="3" cy="19" r=".75"/></svg></button>
          <button type="button" data-task-type-view="grid" aria-label="卡片视图" aria-pressed="true"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3h18v18H3zM3 9h18M3 15h18M9 3v18M15 3v18"/></svg></button>
        </div></div>
      </div>
      <div class="ttw-task-results" aria-live="polite"></div>
    </section>
  </section>`;
  const root = content.querySelector('.task-type-workbench');
  const current = () => root.isConnected && isActive();
  root.querySelector('[data-task-type-create]').onclick = () => {
    if (current()) create?.(config.line, config.segment);
  };
  if(type!=='custom')root.querySelector('[data-task-type-browse]').onclick = () => {
    if (current()) browse?.(config.line, config.segment);
  };
  const render = () => {
    if (!current()) return;
    const rows = tasks.filter(task => (status === 'all' || taskStatusBucket(task) === status)
      && `${task.project || task.name || ''} ${projects.get(task.archiveProjectId??task.projectId) || ''}`.toLocaleLowerCase().includes(query));
    root.querySelectorAll('[data-task-type-status]').forEach(button => {
      const active = button.dataset.taskTypeStatus === status;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    root.querySelectorAll('[data-task-type-view]').forEach(button => {
      const active = button.dataset.taskTypeView === view;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    const results = root.querySelector('.ttw-task-results');
    results.innerHTML = rows.length ? `<div class="ttw-task-grid${view === 'list' ? ' ttw-task-list' : ''}">${rows.map(task => {
      const cover = thumb(task);
      const title = task.project || task.name || '未命名任务';
      const state = taskStatusBucket(task);
      const project = projects.get(task.archiveProjectId??task.projectId) || '未归档';
      const count = Array.isArray(task.targetTemplateIds) ? task.targetTemplateIds.length : 0;
      return `<article class="ttw-task-card"><button type="button" data-task-type-open="${esc(task.id)}" aria-label="打开任务：${esc(title)}">
        <span class="ttw-task-cover">${cover ? `<img src="${esc(cover)}" alt="" loading="lazy">` : '<span class="ttw-cover-placeholder">暂无预览</span>'}</span>
        <span class="ttw-task-info"><span class="ttw-task-title"><strong title="${esc(title)}">${esc(title)}</strong><small>更新于 ${dateLabel(task.updatedAt || task.createdAt)}</small></span>
        <span class="ttw-task-context" title="${esc(project)}">${esc(project)} · ${task.customCanvas?`${task.customCanvas.width} × ${task.customCanvas.height} px`:count+' 个资源位'}</span>
        <span class="ttw-status ttw-status-${state}">${statusLabels[state]}</span></span>
      </button></article>`;
    }).join('')}</div>` : `<div class="ttw-empty"><strong>${tasks.length ? '暂无符合条件的任务' : '还没有此类型的任务'}</strong><p>${tasks.length ? '试试其他状态或搜索关键词。' : '点击“新建任务”，开始制作。'}</p></div>`;
    results.querySelectorAll('[data-task-type-open]').forEach(button => {
      button.onclick = () => {
        if (current() && taskMap.has(button.dataset.taskTypeOpen)) openTask?.(button.dataset.taskTypeOpen);
      };
    });
    results.querySelectorAll('.ttw-task-cover img').forEach(image => {
      image.addEventListener('error', () => {
        if (!image.isConnected) return;
        const placeholder = document.createElement('span');
        placeholder.className = 'ttw-cover-placeholder';
        placeholder.textContent = '预览暂不可用';
        image.replaceWith(placeholder);
      }, {once:true});
    });
  };
  root.querySelector('[data-task-type-search]').oninput = event => {
    query = event.target.value.trim().toLocaleLowerCase();
    render();
  };
  root.querySelectorAll('[data-task-type-status]').forEach(button => {
    button.onclick = () => { status = button.dataset.taskTypeStatus; render(); };
  });
  root.querySelectorAll('[data-task-type-view]').forEach(button => {
    button.onclick = () => { view = button.dataset.taskTypeView; render(); };
  });
  render();
  return {config, tasks};
}

