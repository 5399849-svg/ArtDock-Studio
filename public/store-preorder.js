import {bindProjectLogoChoice} from './project-logos.js?v=20261023-project-create';
const launch = new URL(import.meta.url).searchParams.get('phase') === 'launch';
import { psdEditor, bindPsdEditors } from './store-psd-editor.js?v=20261022-project-logo-reuse-v2';
const psdImportDrafts = new Map();
const state = { config: null, projects:[], jobs: [], selectedJobId: "", selectedSpec: "", onlyWarnings:false, sourceExpanded:{}, editingOutput: "", pollTimer: null, busy: false, isActive: () => true };

function esc(value) { return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[char]); }
function specKey(spec) { return `${spec.channel}/${spec.width}x${spec.height}`; }
const advancedKeys = new Set(["VIVO/1080x720", "小米/2048x1536", "九游UC/1080x720", "4399/1600x960", "黑鲨/600x600"]);
const layerOrder = ["background", "character", "screenshot", "copy", "logo"];
const layerLabels = { background:"背景", character:"人物", screenshot:"截图", copy:"文案", logo:"Logo" };
function defaultLayers() { return Object.fromEntries(layerOrder.map((id) => [id, { x:0, y:0, scale:100, visible:true, locked:id === "background" }])); }
async function call(url, options = {}) {
  const response = await fetch(launch ? url.replace('/api/store-preorder/','/api/store-launch/') : url, { headers: { "Content-Type": "application/json" }, ...options });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || `请求失败（${response.status}）`);
  return value;
}
function readFile(file) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); }); }
function job() { return state.jobs.find((item) => item.id === state.selectedJobId) || null; }
function notify(message) { const el = document.querySelector("#store-message"); if (el) el.textContent = message; }

function pageNumberFromName(name) {
  const stem = String(name || "").replace(/\.[^.]+$/, "");
  const match = stem.match(/(?:^|[-_\s])0*([1-6])$/) || stem.match(/0*([1-6])$/);
  return match ? Number(match[1]) : null;
}

function orderedBatch(files) {
  const items = [...files].map((file, index) => ({ file, index, page: pageNumberFromName(file.name) }));
  const numbered = items.every((item) => item.page) && new Set(items.map((item) => item.page)).size === items.length;
  return items.sort((a, b) => numbered ? a.page - b.page : a.file.name.localeCompare(b.file.name, "zh-CN", { numeric: true })).map((item, index) => ({ file: item.file, page: numbered ? item.page : index + 1 }));
}

function batchUploadCard(current, variant) {
  const label = variant === "landscape" ? "横版" : "竖版";
  const ratio = variant === "landscape" ? "示例：1920×1080-1～6" : "示例：1080×1920-1～6";
  const sources = (current?.sources || []).filter((item) => item.variant === variant).sort((a, b) => a.page - b.page);
  const previews = Array.from({ length: 6 }, (_, index) => {
    const source = sources.find((item) => item.page === index + 1);
    return `<li>${source?.url ? `<img src="${source.url}" alt="${label}第${index + 1}张">` : `<span>${index + 1}</span>`}<small>${source ? esc(source.name) : `第${index + 1}张`}</small></li>`;
  }).join("");
  return `<article class="store-batch-card ${sources.length === 6 ? "complete" : ""}"><header><div><b>${label}六张源图</b><small>${ratio}</small></div><em>${sources.length}/6</em></header><ol>${previews}</ol><label class="store-batch-upload">${sources.length === 6 ? `重新上传${label}六张` : `一次上传${label}六张`}<input type="file" multiple accept="image/png,image/jpeg,image/webp" data-source-batch="${variant}"></label><p>选择6个独立文件；优先按文件名末尾 -1 至 -6 排序，否则按文件名数字顺序排列。</p></article>`;
}

function specRows(current) {
  return state.config.specs.filter(spec=>!state.onlyWarnings||current?.outputs?.some(o=>o.channel===spec.channel&&o.width===spec.width&&o.height===spec.height&&o.warnings?.length)).map((spec) => {
    const selected = state.selectedSpec === specKey(spec);
    const done = current?.outputs?.filter((item) => item.channel === spec.channel && item.width === spec.width && item.height === spec.height).length || 0;
    return `<button class="store-spec-row ${selected ? "active" : ""}" data-store-spec="${esc(specKey(spec))}"><b>${esc(spec.channel)}</b><span>${spec.width}×${spec.height}</span><span>JPG ≤${spec.maxKB}KB</span><em>${done}/6</em>${spec.safeTopPx ? `<small>上下各${spec.safeTopPx}px文案遮挡区</small>` : ""}</button>`;
  }).join("");
}

function outputGallery(current) {
  if(state.onlyWarnings&&!current?.outputs?.some(o=>o.warnings?.length))return `<div class="wb-empty">当前没有提示项，可取消筛选查看全部尺寸。</div>`;
  const spec = state.config.specs.find((item) => specKey(item) === state.selectedSpec) || state.config.specs[0];
  const results = (current?.outputs || []).filter((item) => item.channel === spec.channel && item.width === spec.width && item.height === spec.height).sort((a, b) => a.page - b.page);
  const cards = Array.from({ length: 6 }, (_, index) => {
    const output = results.find((item) => item.page === index + 1);
    const outputKey = `${specKey(spec)}/${index + 1}`;
    const editing = state.editingOutput === outputKey;
    const adjustment = output?.adjustment || { zoom:100, focalX:50, focalY:50 };
    const advanced = (spec.composition ? spec.composition === 'extend' : advancedKeys.has(specKey(spec))) || Boolean(output?.layerMethod?.startsWith("psd-direct"));
    const variant = spec.height > spec.width ? "portrait" : "landscape";
    const layerSet = current?.layerSets?.[`${variant}-${index + 1}`];
    const layerAdjustment = output?.layerAdjustment || defaultLayers();
    const safeTop = spec.safeTopPx / spec.height * 100 || 0;
    const safeBottom = spec.safeBottomPx / spec.height * 100 || 0;
    const basicPanel = `<form class="store-adjust-panel" data-adjust-form data-channel="${esc(spec.channel)}" data-width="${spec.width}" data-height="${spec.height}" data-page="${index + 1}"><label>画面缩放 <output>${adjustment.zoom}%</output><input name="zoom" type="range" min="100" max="200" value="${adjustment.zoom}"></label><label>水平位置 <output>${adjustment.focalX}</output><input name="focalX" type="range" min="0" max="100" value="${adjustment.focalX}"></label><label>垂直位置 <output>${adjustment.focalY}</output><input name="focalY" type="range" min="0" max="100" value="${adjustment.focalY}"></label><div><button type="button" data-adjust-reset>恢复默认</button><button class="button primary" type="submit">保存当前构图</button></div></form>`;
    const layers = layerSet?.manifest?.layers || [];
    const layerStage = layers.length ? `<div class="store-layer-stage" style="aspect-ratio:${spec.width}/${spec.height}">${layerOrder.map((id) => { const layer = layers.find((item) => item.id === id); const value = layerAdjustment[id] || defaultLayers()[id]; return layer?.url && value.visible !== false ? `<img data-layer-preview="${id}" data-layer-kind="${id}" src="${layer.url}" style="--lx:${value.x};--ly:${value.y};--ls:${value.scale / 100}">` : ""; }).join("")}</div>` : "";
    const advancedPanel = layerSet?.status === "ready" ? `<form class="store-layer-panel" data-layer-form data-channel="${esc(spec.channel)}" data-width="${spec.width}" data-height="${spec.height}" data-page="${index + 1}">${layerStage}<div class="store-layer-note"><b>原JPG像素拆层</b><span>背景、人物、截图、文案、Logo 可分别移动和等比缩放。数值框可精确输入，修改后预览立即更新。</span></div><div class="store-layer-list">${layerOrder.map((id) => { const value = layerAdjustment[id] || defaultLayers()[id]; const available = layers.find((item) => item.id === id)?.visible !== false; const control = (key, label, min, max, suffix = "") => `<label>${label}<input class="store-layer-number" type="number" data-number-for="${id}.${key}" min="${min}" max="${max}" step="1" value="${value[key]}"><input type="range" name="${id}.${key}" min="${min}" max="${max}" value="${value[key]}" aria-label="${layerLabels[id]}${label}"><small>${suffix}</small></label>`; return `<fieldset data-layer-row="${id}" ${available ? "" : "disabled"}><legend>${layerLabels[id]}${id === "background" && index + 1 > 1 ? " · 第2–6张共用底图" : ""}</legend><label><input type="checkbox" name="${id}.visible" ${value.visible !== false ? "checked" : ""}>显示</label>${control("x", "X", -100, 100)}${control("y", "Y", -100, 100)}${control("scale", "缩放", 40, 240, "%")}</fieldset>`; }).join("")}</div><label class="store-layer-sync"><input type="checkbox" name="syncPages" ${index + 1 > 1 ? "checked" : "disabled"}>将当前图层参数同步到第2–6张（背景始终共用）</label><div class="store-layer-actions"><button type="button" data-layer-reset>恢复全部图层</button><button class="button primary" type="submit">保存分层构图</button></div></form>` : `<div class="store-layer-prepare"><p>这个尺寸比例改动较大。系统将一次性拆分并重绘整套六张，避免同一套混用不同背景。</p><button class="button primary" data-layer-prepare data-channel="${esc(spec.channel)}" data-width="${spec.width}" data-height="${spec.height}" data-page="${index + 1}">${layerSet?.status === "running" ? "正在拆分整套六张…" : "拆分整套六张并进入调整"}</button></div>`;
    return `<article class="store-output-card ${editing ? "editing" : ""}"><div class="store-output-image" style="aspect-ratio:${spec.width}/${spec.height}">${output ? `<img src="${output.url}?v=${current.version}" alt="${esc(spec.channel)} ${spec.width}×${spec.height} 第${index + 1}张">${safeTop ? `<i class="store-safe-zone top" style="height:${safeTop}%"></i><i class="store-safe-zone bottom" style="height:${safeBottom}%"></i>` : ""}` : `<span>第${index + 1}张待生成</span>`}</div><b>${spec.width}x${spec.height}-${index + 1}.jpg</b><small>${output ? `${Math.ceil(output.bytes / 1024)}KB / ${spec.maxKB}KB${output.quality ? ` · Q${output.quality}` : ""}${output.layerMethod?.startsWith("psd-direct") ? " · PSD真实图层" : output.layerMethod ? " · 原图像素分层" : output.outpaintApplied ? " · Nano真实扩图" : ""}` : ""}</small>${output?.warnings?.length ? `<p>${output.warnings.map(esc).join("；")}</p>` : ""}${output ? `<button class="store-adjust-toggle" ${current.status !== "complete" ? "disabled" : ""} data-store-adjust="${esc(outputKey)}">${editing ? "收起调整" : advanced ? "高级分层调整" : "调整画面"}</button>` : ""}${editing && current.status === "complete" ? (layerSet?.method?.startsWith("psd-direct") ? psdEditor(current, output, layerSet, spec) : advanced ? advancedPanel : basicPanel) : ""}</article>`;
  }).join("");
  return `<div class="store-preview-head"><div><h3>${esc(spec.channel)} ${spec.width}×${spec.height}</h3><span>六张顺序预览 · JPG ≤${spec.maxKB}KB</span></div>${spec.note ? `<small>${esc(spec.note)}</small>` : ""}</div><div class="store-output-gallery">${cards}</div>`;
}

function render(content) {
  const previousImport = content.querySelector('.psd-import');
  const previousOwner = previousImport?.dataset.jobId;
  const focusedPath = previousImport?.contains(document.activeElement) ? document.activeElement.dataset.psdPath : null;
  const selection = focusedPath ? [document.activeElement.selectionStart, document.activeElement.selectionEnd] : null;
  if (previousOwner) psdImportDrafts.set(previousOwner, {
    open:previousImport.open,
    landscape:previousImport.querySelector('[data-psd-path="landscape"]').value,
    portrait:previousImport.querySelector('[data-psd-path="portrait"]').value,
  });
  const current = job();
  const draft = psdImportDrafts.get(current?.id);
  const completed = current?.status === "complete" && current.outputs?.length === current.total;
  const warningCount = current?.outputs?.filter((item) => item.warnings?.length).length || 0;
  content.innerHTML = `<div class="store-workbench"><header class="store-hero"><div><span>六页成套制作</span><h2>${launch?"测试和首发商店图":"预约商店图"}</h2><p>六张有序源图生成一套；${new Set(state.config.specs.map(s=>s.channel)).size} 个商店、${state.config.specs.length} 个尺寸，共 ${state.config.specs.length*6} 张 JPG。</p></div><div><b>规格版本：${esc(state.config.id)}</b><small>按当前阶段的渠道规格制作</small></div></header>
    <section class="store-create"><form id="store-create-form"><label>所属项目<select name="projectId"><option value="">未归档</option>${state.projects.filter(p=>p.status==='active').map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></label><label>任务名称<input name="project" maxlength="80" required placeholder="例如：甄嬛许愿"></label><button class="button primary" ${state.busy ? "disabled" : ""}>新建六页商店图任务</button></form><span id="store-message"></span></section>
    <div class="store-layout"><aside class="store-job-list"><h3>商店图任务</h3>${state.jobs.map((item) => `<button data-store-job="${item.id}" class="${item.id === current?.id ? "active" : ""}"><b>${esc(item.project)}</b><small>${item.status === "complete" ? (item.reviewed ? "已完成" : "待检查") : item.status === "running" ? `生成中 ${item.progress}/${item.total}` : item.status === "paused" ? "已保留预览，待导入PSD" : item.status === "failed" ? "需要处理" : "草稿 · 待上传素材"} · v${item.version}</small></button>`).join("") || `<p>先创建任务，再上传六张独立图片。</p>`}</aside>
    <main class="store-main">${current ? `<details class="store-source-section" ${state.sourceExpanded[current.id] ?? !completed ? "open" : ""}><summary>源素材与生成设置 · ${current.psdSource ? "PSD 已导入" : "横竖版源图"}</summary><details class="psd-import" data-job-id="${esc(current.id)}" ${draft?.open ? "open" : ""}><summary>导入 / 更新横竖版 PSD 真实图层</summary><p>填写同一个文件夹路径即可按“横版 / 竖版”文件名自动识别，也可分别填写具体 PSD 文件路径。读取六页图层并重新生成全部尺寸。</p><label>横版 PSD<input data-psd-path="landscape" value="${esc(draft?.landscape ?? current.psdSource?.landscape ?? "")}" placeholder="PSD 文件夹或横版 PSD 文件路径"></label><label>竖版 PSD<input data-psd-path="portrait" value="${esc(draft?.portrait ?? current.psdSource?.portrait ?? "")}" placeholder="留空使用上方文件夹，或填写竖版 PSD 文件路径"></label><button type="button" data-psd-import ${current.status === "running" ? "disabled" : ""}>读取 PSD 并更新任务</button></details><div class="store-section-head"><div><h3>横版、竖版源图</h3><p>每个入口一次选择六张独立图片，系统按页码排序；横竖目标尺寸分别使用对应构图。</p></div><span>${current.sources.filter((item) => item.variant === "landscape").length}/6 横版 · ${current.sources.filter((item) => item.variant === "portrait").length}/6 竖版</span></div><div class="store-batch-grid">${batchUploadCard(current, "landscape")}${batchUploadCard(current, "portrait")}</div><div class="store-actions"><button class="button primary" id="store-generate" ${["landscape", "portrait"].some((variant) => current.sources.filter((item) => item.variant === variant).length !== 6) || current.status === "running" || state.busy ? "disabled" : ""}>${current.status === "running" ? `生成中 ${current.progress}/${current.total}` : `生成全部${state.config.specs.length}套 · ${state.config.specs.length*6}张`}</button><span>${current.status === "paused" ? esc(current.phase) : current.status === "failed" ? esc(current.error) : current.status === "running" ? esc(current.phase || (current.progress >= current.total ? "尺寸图已生成，正在准备图层与优化构图" : "正在生成尺寸预览，涉及扩图的页面需要等待 AI 返回")) : completed ? `生成完成；${warningCount}张有构图或清晰度提示，请检查预览` : "横竖两组各六张完整后可生成；不拉伸、不盲裁、不用AI重绘"}</span></div></details>` : `<section class="store-empty"><h3>从横版、竖版两套源图开始</h3><p>新建任务后分别一次上传横版六张与竖版六张。拼接预览图不能替代独立文件。</p></section>`}
    <section class="store-spec-section"><div class="store-section-head"><div><h3>尺寸与逐张预览</h3><p>按当前阶段的规格表生成。</p></div><span>${state.config.specs.length}套 × 6张</span></div><div class="wb-output-tools"><label><input type="checkbox" id="store-warnings-only" ${state.onlyWarnings ? "checked" : ""}>只看有提示的尺寸</label><small>保留每套六张，方便对照检查</small></div><div class="store-spec-grid"><div class="store-spec-list">${specRows(current)}</div><div class="store-spec-preview">${outputGallery(current)}</div></div>${current && completed ? `<div class="store-delivery"><p>技术规格全部通过。请逐套检查横竖构图、游戏文字和各尺寸构图。</p>${current.reviewed ? `<a class="button primary" href="/api/store-preorder/jobs/${current.id}/package">下载六页商店图 ZIP</a>` : `<button class="button primary" id="store-review">已检查六页成套预览，确认可下载</button>`}</div>` : ""}</section></main></div></div>`;
  if (previousImport && previousOwner === current?.id) {
    content.querySelector('.psd-import').replaceWith(previousImport);
    previousImport.querySelector('[data-psd-import]').disabled = current.status === 'running';
    if (focusedPath) {
      const input = previousImport.querySelector(`[data-psd-path="${focusedPath}"]`);
      input.focus({preventScroll:true}); input.setSelectionRange(...selection);
    }
  }
  const replaceJob = updated => { state.jobs = state.jobs.map(item => item.id === updated.id ? updated : item); render(content); startPolling(content); };
  bindPsdEditors(content, {current, call, updated:replaceJob, notify});
  content.querySelector('.store-source-section')?.addEventListener('toggle',e=>{if(current)state.sourceExpanded[current.id]=e.currentTarget.open;});
  content.querySelector('#store-warnings-only')?.addEventListener('change',e=>{
    state.onlyWarnings=e.target.checked;
    if(state.onlyWarnings){const first=state.config.specs.find(spec=>current?.outputs?.some(o=>o.channel===spec.channel&&o.width===spec.width&&o.height===spec.height&&o.warnings?.length));if(first)state.selectedSpec=specKey(first);}
    render(content);
  });
  if (launch) content.querySelectorAll('a[href]').forEach(a=>a.href=a.href.replace('/api/store-preorder/','/api/store-launch/'));
  const importButton = content.querySelector('[data-psd-import]');
  if (importButton) importButton.onclick = async event => {
    event.currentTarget.disabled = true;
    try { const result = await call(`/api/store-preorder/jobs/${current.id}/psd/import`, {method:'POST',body:JSON.stringify({landscape:content.querySelector('[data-psd-path="landscape"]').value.trim(),portrait:content.querySelector('[data-psd-path="portrait"]').value.trim()})}); replaceJob(result); notify('正在读取 PSD 图层…'); }
    catch(error) {notify(error.message);event.target.disabled=false;}
  };
  if(current?.projectLogo){const panel=document.createElement('div');panel.className='project-logo-current';panel.innerHTML=`<img src="${esc(current.projectLogo.url)}" alt="项目 Logo"><div><b>${esc(current.projectLogo.name)}</b><small>任务创建时选用的项目 Logo</small></div><a class="button secondary" href="${esc(current.projectLogo.url)}" download="${esc(current.projectLogo.name)}">使用此 Logo 素材</a>`;content.querySelector('.store-main')?.prepend(panel);}
  bindProjectLogoChoice(content.querySelector('#store-create-form [name=projectId]'),state.projects,{api:call,businessLineIds:['channel-distribution'],anchor:content.querySelector('#store-create-form').lastElementChild,note:'项目 Logo 已作为独立素材带入，原图中的 Logo 可在制作时保留或替换。'});
  content.querySelector("#store-create-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();if(state.busy)return;
    try { state.busy = true; const form=new FormData(event.currentTarget),project=form.get("project"),projectId=form.get("projectId"); const created = await call("/api/store-preorder/jobs", { method: "POST", body: JSON.stringify({ project,projectId,projectLogoId:form.get("projectLogoId")??"default" }) }); state.jobs.unshift(created); state.selectedJobId = created.id; let notice='';if(projectId){try{await call('/api/workbench/project-links',{method:'PUT',body:JSON.stringify({key:`${launch?'store-launch':'store-preorder'}:${created.id}`,projectId})});}catch{notice='任务已创建，项目归档未完成，可在“项目 → 未归档”中处理。';}}state.busy = false; render(content);if(notice)content.querySelector('#store-message').textContent=notice; }
    catch (error) { notify(error.message); }
    finally { state.busy = false; }
  });
  content.querySelectorAll("[data-store-job]").forEach((button) => button.addEventListener("click", () => { state.selectedJobId = button.dataset.storeJob; render(content); startPolling(content); }));
  content.querySelectorAll("[data-store-spec]").forEach((button) => button.addEventListener("click", () => { state.selectedSpec = button.dataset.storeSpec; render(content); }));
  content.querySelectorAll("[data-store-adjust]").forEach((button) => button.addEventListener("click", () => { state.editingOutput = state.editingOutput === button.dataset.storeAdjust ? "" : button.dataset.storeAdjust; render(content); }));
  content.querySelectorAll("[data-adjust-form]").forEach((form) => {
    form.querySelectorAll('input[type="range"]').forEach((input) => input.addEventListener("input", () => { input.closest("label").querySelector("output").textContent = input.name === "zoom" ? `${input.value}%` : input.value; }));
    form.querySelector("[data-adjust-reset]")?.addEventListener("click", () => {
      for (const [name, value] of Object.entries({ zoom:100, focalX:50, focalY:50 })) { const input = form.elements[name]; input.value = value; input.dispatchEvent(new Event("input")); }
    });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        state.busy = true; notify("正在保存当前画面构图…");
        const values = new FormData(form);
        const updated = await call(`/api/store-preorder/jobs/${state.selectedJobId}/adjust`, { method:"POST", body:JSON.stringify({ channel:form.dataset.channel, width:Number(form.dataset.width), height:Number(form.dataset.height), page:Number(form.dataset.page), zoom:Number(values.get("zoom")), focalX:Number(values.get("focalX")), focalY:Number(values.get("focalY")) }) });
        state.jobs = state.jobs.map((item) => item.id === updated.id ? updated : item);
        state.busy = false; render(content); notify("当前画面已保存，可继续调整或恢复默认");
      } catch (error) { notify(error.message); }
      finally { state.busy = false; }
    });
  });
  content.querySelectorAll("[data-layer-prepare]").forEach((button) => button.addEventListener("click", async () => {
    try {
      state.busy = true; button.disabled = true; notify("正在本机拆分并重绘整套六张，首次约需1–3分钟；完成前请不要关闭页面…");
      const value = await call(`/api/store-preorder/jobs/${state.selectedJobId}/layers/prepare`, { method:"POST", body:JSON.stringify({ channel:button.dataset.channel, width:Number(button.dataset.width), height:Number(button.dataset.height), page:Number(button.dataset.page) }) });
      state.jobs = state.jobs.map((item) => item.id === value.job.id ? value.job : item);
      state.busy = false; render(content); notify("整套六张已统一改为分层合成。前景层只使用原JPG像素，请检查边缘后保存构图。");
    } catch (error) { notify(error.message); button.disabled = false; }
    finally { state.busy = false; }
  }));
  content.querySelectorAll("[data-layer-form]").forEach((form) => {
    const updatePreview = () => {
      for (const id of layerOrder) {
        const row = form.querySelector(`[data-layer-row="${id}"]`); const image = form.querySelector(`[data-layer-preview="${id}"]`); if (!row || !image) continue;
        const visible = row.querySelector(`[name="${id}.visible"]`).checked;
        const x = row.querySelector(`[name="${id}.x"]`).value, y = row.querySelector(`[name="${id}.y"]`).value, scale = row.querySelector(`[name="${id}.scale"]`).value;
        image.hidden = !visible; image.style.setProperty("--lx", x); image.style.setProperty("--ly", y); image.style.setProperty("--ls", Number(scale) / 100);
      }
    };
    form.querySelectorAll('input[type="range"]').forEach((input) => input.addEventListener("input", () => { const number = form.querySelector(`[data-number-for="${input.name}"]`); if (number) number.value = input.value; updatePreview(); }));
    form.querySelectorAll("[data-number-for]").forEach((number) => number.addEventListener("input", () => { const range = form.elements[number.dataset.numberFor]; const value = Math.max(Number(number.min), Math.min(Number(number.max), Number(number.value) || 0)); range.value = value; updatePreview(); }));
    form.querySelectorAll('input[type="checkbox"]').forEach((input) => input.addEventListener("change", updatePreview));
    form.querySelector("[data-layer-reset]")?.addEventListener("click", () => {
      const defaults = defaultLayers();
      for (const id of layerOrder) { const row = form.querySelector(`[data-layer-row="${id}"]`); if (!row) continue; row.querySelector(`[name="${id}.visible"]`).checked = true; for (const key of ["x", "y", "scale"]) { const input = row.querySelector(`[name="${id}.${key}"]`); input.value = defaults[id][key]; input.dispatchEvent(new Event("input")); } }
    });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        state.busy = true; notify("正在按图层重绘当前尺寸并校验文件大小…");
        const adjustment = {};
        for (const id of layerOrder) { const row = form.querySelector(`[data-layer-row="${id}"]`); adjustment[id] = { visible:row.querySelector(`[name="${id}.visible"]`).checked, x:Number(row.querySelector(`[name="${id}.x"]`).value), y:Number(row.querySelector(`[name="${id}.y"]`).value), scale:Number(row.querySelector(`[name="${id}.scale"]`).value), locked:id === "background" }; }
        const updated = await call(`/api/store-preorder/jobs/${state.selectedJobId}/layers/adjust`, { method:"POST", body:JSON.stringify({ channel:form.dataset.channel, width:Number(form.dataset.width), height:Number(form.dataset.height), page:Number(form.dataset.page), syncPages:form.elements.syncPages?.checked, adjustment }) });
        state.jobs = state.jobs.map((item) => item.id === updated.id ? updated : item);
        state.busy = false; render(content); notify("分层构图已保存，导出图已重新压缩并通过尺寸校验。");
      } catch (error) { notify(error.message); }
      finally { state.busy = false; }
    });
    updatePreview();
  });
  content.querySelectorAll("[data-source-batch]").forEach((input) => input.addEventListener("change", async () => {
    const files = [...(input.files || [])]; if (!files.length) return;
    const variant = input.dataset.sourceBatch;
    if (files.length !== 6) { notify(`${variant === "landscape" ? "横版" : "竖版"}必须一次选择6张图片，当前选择了${files.length}张`); input.value = ""; return; }
    try {
      state.busy = true; notify(`正在上传${variant === "landscape" ? "横版" : "竖版"}六张…`);
      const ordered = orderedBatch(files);
      const payload = await Promise.all(ordered.map(async ({ file, page }) => ({ page, variant, name: file.name, dataUrl: await readFile(file) })));
      const updated = await call(`/api/store-preorder/jobs/${state.selectedJobId}/sources`, { method: "POST", body: JSON.stringify({ files: payload }) });
      state.jobs = state.jobs.map((item) => item.id === updated.id ? updated : item);
      state.busy = false; render(content); notify(`${variant === "landscape" ? "横版" : "竖版"}六张已按页码保存`);
    } catch (error) { notify(error.message); }
    finally { state.busy = false; }
  }));
  content.querySelector("#store-generate")?.addEventListener("click", async () => {
    try { state.busy = true; const updated = await call(`/api/store-preorder/jobs/${state.selectedJobId}/generate`, { method: "POST", body: "{}" }); state.jobs = state.jobs.map((item) => item.id === updated.id ? updated : item); render(content); startPolling(content); }
    catch (error) { notify(error.message); }
    finally { state.busy = false; }
  });
  content.querySelector("#store-review")?.addEventListener("click", async () => {
    try { const updated = await call(`/api/store-preorder/jobs/${state.selectedJobId}/review`, { method: "POST", body: "{}" }); state.jobs = state.jobs.map((item) => item.id === updated.id ? updated : item); render(content); }
    catch (error) { notify(error.message); }
  });
}

function startPolling(content, isActive = state.isActive) {
  clearInterval(state.pollTimer);
  if (!job() || (job().status !== "running" && !job().candidates?.some(c => c.status === "running"))) return;
  state.pollTimer = setInterval(async () => {
    if (!isActive()) { clearInterval(state.pollTimer); return; }
    try {
      const updated = await call(`/api/store-preorder/jobs/${state.selectedJobId}`);
      if (!isActive() || updated.id !== state.selectedJobId) return;
      state.jobs = state.jobs.map((item) => item.id === updated.id ? updated : item);
      if (updated.status !== "complete" || !updated.candidates?.some(c => c.status === "running")) render(content);
      if (updated.status !== "running" && !updated.candidates?.some(c => c.status === "running")) clearInterval(state.pollTimer);
    } catch (error) { notify(error.message); clearInterval(state.pollTimer); }
  }, 1500);
}

export async function mountStorePreorder(content, title, isActive = () => true, selectedJobId = "") {
  clearInterval(state.pollTimer);
  state.isActive = isActive;
  title.textContent = launch ? "测试和首发商店图" : "预约商店图";
  content.innerHTML = `<div class="store-loading">正在读取商店图规格…</div>`;
  try {
    const [config, jobs, bootstrap] = await Promise.all([call("/api/store-preorder/specs"), call("/api/store-preorder/jobs"),call("/api/bootstrap").catch(()=>({projects:[]}))]);
    if (!isActive()) return;
    state.config = config; state.jobs = jobs; state.projects=bootstrap.projects||[];
    if (selectedJobId && jobs.some(j=>j.id===selectedJobId)) state.selectedJobId=selectedJobId;
    if (!jobs.some((item) => item.id === state.selectedJobId)) state.selectedJobId = jobs[0]?.id || "";
    if (!state.selectedSpec) state.selectedSpec = specKey(config.specs[0]);
    render(content); startPolling(content, isActive);
  } catch (error) { if (isActive()) content.innerHTML = `<div class="store-loading">${esc(error.message)}</div>`; }
}

