import {createProjectLogoLibrary} from './project-logos.mjs';
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createStoreZip, safeChild, sanitizeFileName } from "./core.mjs";
import { iconOutputName, iconZipPath, inspectIconSource, loadIconPreorderSpecs, renderIcon } from "./icon-preorder.mjs";
import {setProjectHint} from '../platform/request-context.mjs';

async function requestJson(req) {
  const chunks = []; let bytes = 0;
  for await (const chunk of req) { bytes += chunk.length; if (bytes > 45 * 1024 * 1024) throw Object.assign(new Error("上传数据超过45MB"), { status: 413 }); chunks.push(chunk); }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); } catch { throw Object.assign(new Error("上传数据不是有效JSON"), { status: 400 }); }
}
function respond(res, status, value) { const body = Buffer.from(JSON.stringify(value)); res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": body.length }); res.end(body); }
function sourceBytes(dataUrl) {
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/i.exec(String(dataUrl || ""));
  if (!match) throw Object.assign(new Error("只接受 JPG、PNG、WebP 原始ICON"), { status: 422 });
  const buffer = Buffer.from(match[2], "base64");
  if (!buffer.length || buffer.length > 30 * 1024 * 1024) throw Object.assign(new Error("原始ICON须小于30MB"), { status: 422 });
  return buffer;
}

export async function createIconPreorderHandler({ root, runtimeDir, storageDir, namespace = "icon-preorder", configUrl ,taskName=(key,fallback)=>fallback,projectLogos=createProjectLogoLibrary({runtimeDir,storageDir}),recycleBin}) {
  recycleBin ||= await (await import('./recycle-bin.mjs')).getRecycleBin({runtimeDir,storageDir});
  const config = await loadIconPreorderSpecs(configUrl);
  const assetsDir = path.join(root, "public", `${namespace}-assets`);
  const jobsFile = path.join(runtimeDir, `${namespace}-jobs.json`);
  let jobs = [];
  try { jobs = JSON.parse(await fs.readFile(jobsFile, "utf8")); } catch (error) { if (error.code !== "ENOENT") throw error; }
  for (const job of jobs) if (job.status === "running") { job.status = "failed"; job.error = "服务重启中断了生成，可重新生成"; }
  let saveQueue = Promise.resolve();
  const persist = () => saveQueue = saveQueue.catch(() => {}).then(() => fs.writeFile(jobsFile, `${JSON.stringify(jobs, null, 2)}\n`, "utf8"));
  const folder = (id) => `${namespace}-${id}`;
  recycleBin.register(namespace,{
    list:()=>jobs.map(job=>({key:`${namespace}:${job.id}`,label:taskName(`${namespace}:${job.id}`,job.project),projectId:job.projectId,folder:folder(job.id),data:job,busy:job.status==='running'})),
    drop:async key=>{jobs=jobs.filter(job=>`${namespace}:${job.id}`!==key);await persist();},
  });
  const publicJob = (job) => ({ ...job,project:taskName(`${namespace}:${job.id}`,job.project), source: job.source ? { ...job.source, url: `/storage/${folder(job.id)}/source/${encodeURIComponent(job.source.file)}` } : null });
  async function runGeneration(id) {
    const job = jobs.find((item) => item.id === id); if (!job) return;
    try {
      const source = await fs.readFile(safeChild(storageDir, folder(id), "source", job.source.file));
      const outputs = [];
      for (const spec of config.specs) {
        const rendered = await renderIcon(source, spec, { assetsDir });
        const file = iconOutputName(spec); const target = safeChild(storageDir, folder(id), "output", file);
        await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target, rendered.buffer);
        outputs.push({ specId: spec.id, format: spec.outputFormat || "PNG", channel: spec.channel, width: spec.width, height: spec.height, cornerRadiusPx: spec.cornerRadiusPx, badge: spec.badge, minBytes: (spec.minKB || 0) * 1024, maxBytes: spec.maxKB ? spec.maxKB * 1024 : null, file, url: `/storage/${folder(id)}/output/${encodeURIComponent(file)}`, bytes: rendered.bytes, compression: rendered.compression, warnings: rendered.warnings });
        job.progress = outputs.length; await persist();
      }
      job.outputs = outputs; job.status = "complete"; job.error = ""; job.updatedAt = new Date().toISOString(); await persist();
    } catch (error) { job.status = "failed"; job.error = error.message; job.updatedAt = new Date().toISOString(); await persist(); }
  }
  return async function handle(req, res, url) {
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[0] !== "api" || parts[1] !== namespace) return false;
    if (parts.length === 3 && parts[2] === "specs" && req.method === "GET") return respond(res, 200, config);
    if (parts.length === 3 && parts[2] === "jobs") {
      if (req.method === "GET") return respond(res, 200, jobs.filter(job=>!recycleBin.isTaskHidden(`${namespace}:${job.id}`)).map(publicJob).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
      if (req.method === "POST") {
        const input = await requestJson(req); const project = String(input.project || "").trim();
        if (!project || project.length > 80) return respond(res, 422, { error: "请填写80字以内的素材名称" });
        const now = new Date().toISOString(); const job = { id: randomUUID(), project, specId: config.id, status: "draft", source: null, outputs: [], progress: 0, total: config.specs.length, version: 1, reviewed: false, error: "", createdAt: now, updatedAt: now };
        job.projectId=input.projectId||'';job.projectLogo=await projectLogos.copyToTask({projectId:job.projectId,logoId:input.projectLogoId,folder:`${namespace}-${job.id}`,bucket:'project-logo'});
        jobs.unshift(job); await persist(); return respond(res, 201, publicJob(job));
      }
    }
    const id = parts[3]; const job = parts[2] === "jobs" && jobs.find((item) => item.id === id);
    if (job) setProjectHint(job.projectId || "");
    if (!job) return respond(res, 404, { error: "ICON任务不存在" });
    if(recycleBin.isTaskHidden(`${namespace}:${id}`)&&!(parts.length===4&&req.method==='DELETE'))return respond(res,410,{error:'任务已移至回收站，请恢复后再使用'});
    if (parts.length === 4 && req.method === "DELETE") {
      if (job.status === "running") return respond(res, 409, { error: "任务正在制作，请完成后再删除" });
      return respond(res, 200, await recycleBin.trashTask(`${namespace}:${id}`));
    }
    if (parts.length === 4 && req.method === "GET") return respond(res, 200, publicJob(job));
    if (parts[4] === "source" && parts.length === 5 && req.method === "POST") {
      if (job.status === "running") return respond(res, 409, { error: "正在生成，请稍后再更换原图" });
      const input = await requestJson(req); const buffer = sourceBytes(input.dataUrl); const info = await inspectIconSource(buffer); const ext = info.format === "jpeg" ? "jpg" : info.format; const file = `source.${ext}`;
      const target = safeChild(storageDir, folder(id), "source", file); await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target, buffer);
      job.source = { name: String(input.name || file), file, width: info.width, height: info.height, bytes: buffer.length }; job.outputs = []; job.status = "draft"; job.progress = 0; job.reviewed = false; job.version += 1; job.updatedAt = new Date().toISOString(); await persist();
      return respond(res, 200, publicJob(job));
    }
    if (parts[4] === "generate" && parts.length === 5 && req.method === "POST") {
      if (!job.source) return respond(res, 422, { error: "请先上传正方形原始ICON" });
      if (job.status === "running") return respond(res, 409, { error: "ICON正在生成" });
      job.status = "running"; job.progress = 0; job.outputs = []; job.reviewed = false; job.error = ""; job.version += 1; job.updatedAt = new Date().toISOString(); await persist(); void runGeneration(id); return respond(res, 202, publicJob(job));
    }
    if (parts[4] === "review" && parts.length === 5 && req.method === "POST") { if (job.status !== "complete" || job.outputs.length !== job.total) return respond(res, 409, { error: "请等待全部规格生成" }); job.reviewed = true; job.updatedAt = new Date().toISOString(); await persist(); return respond(res, 200, publicJob(job)); }
    if (parts[4] === "package" && parts.length === 5 && req.method === "GET") {
      if (job.status !== "complete" || !job.reviewed || job.outputs.length !== job.total) return respond(res, 409, { error: "请检查全部预览并确认后再下载" });
      const files = [];
      for (const output of job.outputs) { const spec = config.specs.find((item) => item.id === output.specId); files.push({ name: iconZipPath(sanitizeFileName(taskName(`${namespace}:${job.id}`,job.project)), spec), data: await fs.readFile(safeChild(storageDir, folder(id), "output", output.file)) }); }
      files.push({ name: `${sanitizeFileName(taskName(`${namespace}:${job.id}`,job.project))}/生产与校验报告.json`, data: Buffer.from(JSON.stringify({ project: taskName(`${namespace}:${job.id}`,job.project), specId: config.id, source: job.source, outputs: job.outputs }, null, 2)) });
      const zip = createStoreZip(files); const name = `${sanitizeFileName(taskName(`${namespace}:${job.id}`,job.project))}_${config.name}_v${job.version}.zip`; res.writeHead(200, { "Content-Type": "application/zip", "Content-Length": zip.length, "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}` }); res.end(zip); return;
    }
    return respond(res, 404, { error: "ICON接口不存在" });
  };
}
