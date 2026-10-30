import {createProjectLogoLibrary} from './project-logos.mjs';
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { createStoreZip, safeChild, sanitizeFileName } from "./core.mjs";
import { defaultLayerAdjustments, inspectPageSource, loadStorePreorderSpecs, needsAdvancedComposition, outputName, outputZipPath, renderLayeredStorePage, renderStorePage, selectPageSource, STORE_PAGE_COUNT } from "./store-preorder.mjs";
import { generateStoreOutpaint } from "./store-outpaint.mjs";
import { createPsdActions } from './store-psd-actions.mjs';
import {localPython} from '../platform/local-compute.mjs';
import {setProjectHint} from '../platform/request-context.mjs';

const execFileAsync = promisify(execFile);
const STORE_LAYER_METHOD = "local-best-mask-solid-subjects-v6";

async function requestJson(req) {
  const chunks = []; let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > 120 * 1024 * 1024) { const error = new Error("上传数据超过120MB，请使用较小的独立源图"); error.status = 413; throw error; }
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); }
  catch { const error = new Error("上传数据不是有效JSON"); error.status = 400; throw error; }
}

function respond(res, status, value) {
  const body = Buffer.from(JSON.stringify(value));
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": body.length });
  res.end(body);
}

function sourceBytes(dataUrl) {
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/i.exec(String(dataUrl || ""));
  if (!match) throw new Error("只接受独立 JPG、PNG、WebP 页面源图");
  const buffer = Buffer.from(match[2], "base64");
  if (!buffer.length || buffer.length > 30 * 1024 * 1024) throw new Error("单张源图须小于30MB");
  return buffer;
}

export async function createStorePreorderHandler({ runtimeDir, storageDir, namespace = "store-preorder", configUrl ,taskName=(key,fallback)=>fallback,projectLogos=createProjectLogoLibrary({runtimeDir,storageDir}),recycleBin}) {
  recycleBin ||= await (await import('./recycle-bin.mjs')).getRecycleBin({runtimeDir,storageDir});
  const config = await loadStorePreorderSpecs(configUrl);
  const jobsFile = path.join(runtimeDir, `${namespace}-jobs.json`);
  let jobs = [];
  try { jobs = JSON.parse(await fs.readFile(jobsFile, "utf8")); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  for (const job of jobs) if (job.status === "running") { job.status = "failed"; job.error = "服务重启中断了生成，可重新生成"; }
  for (const job of jobs) for (const candidate of job.candidates || []) if (candidate.status === 'running') { candidate.status='failed'; candidate.error='服务重启中断了候选生成，原图未修改，请重试'; }
  let saveQueue = Promise.resolve();
  function persist() {
    saveQueue = saveQueue.catch(() => {}).then(() => fs.writeFile(jobsFile, `${JSON.stringify(jobs, null, 2)}\n`, "utf8"));
    return saveQueue;
  }
  await persist();
  const jobStorage = (id) => `${namespace}-${id}`;
  recycleBin.register(namespace,{
    list:()=>jobs.map(job=>({key:`${namespace}:${job.id}`,label:taskName(`${namespace}:${job.id}`,job.project),projectId:job.projectId,folder:jobStorage(job.id),data:job,busy:job.status==='running'||job.candidates?.some(c=>c.status==='running')})),
    drop:async key=>{jobs=jobs.filter(job=>`${namespace}:${job.id}`!==key);await persist();},
  });
  const publicJob = (job) => ({
    ...job,project:taskName(`${namespace}:${job.id}`,job.project),
    sources: job.sources.map(({ file, ...item }) => ({ ...item, url: `/storage/${jobStorage(job.id)}/source/${encodeURIComponent(file)}` })),
    layerSets:Object.fromEntries(Object.entries(job.layerSets || {}).map(([key, set]) => [key, set?.manifest ? { ...set, manifest:{ ...set.manifest, layers:set.manifest.layers.map((layer) => ({ ...layer, url:`/storage/${jobStorage(job.id)}/layers/${encodeURIComponent(`${key}/${layer.file}`)}?v=${job.version}` })) } } : set])),
  });
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const layerScript = path.join(root, "scripts", "store-jpg-layer-split.py");
  const layerPython = path.join(root, "local-ai", ".venv", "Scripts", "python.exe");
  const sam2Python = path.join(root, "local-ai", "generative", ".venv", "Scripts", "python.exe");
  const sam2Script = path.join(root, "scripts", "sam2-character-cutout.py");
  const sharedBackgroundScript = path.join(root, "scripts", "store-shared-background.py");

  async function rebuildSharedBackground(job, variant) {
    if (job.layerSets?.[`${variant}-2`]?.method?.startsWith('psd-direct')) return;
    const sources = [], layerDirs = [];
    for (let page = 2; page <= 6; page += 1) {
      const source = job.sources.find((item) => item.page === page && item.variant === variant);
      sources.push(safeChild(storageDir, jobStorage(job.id), "source", source.file));
      layerDirs.push(safeChild(storageDir, jobStorage(job.id), "layers", `${variant}-${page}`));
    }
    const shared = safeChild(storageDir, jobStorage(job.id), "layers", `${variant}-shared-background.jpg`);
    await localPython([sharedBackgroundScript, "--sources", ...sources, "--layer-dirs", ...layerDirs, "--output", shared], { cwd:root, windowsHide:true, timeout:12 * 60 * 1000, maxBuffer:2 * 1024 * 1024 });
    for (let page = 2; page <= 6; page += 1) await fs.copyFile(shared, safeChild(storageDir, jobStorage(job.id), "layers", `${variant}-${page}`, "00-background.jpg"));
  }

  async function ensureLayerSet(job, page, variant) {
    job.layerSets ||= {};
    const key = `${variant}-${page}`;
    if (job.layerSets[key]?.status === 'ready' && job.layerSets[key]?.method?.startsWith('psd-direct')) return job.layerSets[key];
    const expectedMethod = page > 1 ? STORE_LAYER_METHOD : "local-solid-subjects-v6";
    if (job.layerSets[key]?.status === "ready" && job.layerSets[key]?.method === expectedMethod) return job.layerSets[key];
    if (page > 2) await ensureLayerSet(job, 2, variant);
    const source = job.sources.find((item) => item.page === page && item.variant === variant);
    const backgroundSource = job.sources.find((item) => item.page === (page > 1 ? 2 : 1) && item.variant === variant);
    if (!source || !backgroundSource) throw new Error("缺少对应页的横版或竖版源图");
    const outputDir = safeChild(storageDir, jobStorage(job.id), "layers", key);
    await fs.mkdir(outputDir, { recursive:true });
    job.layerSets[key] = { status:"running", page, variant };
    await persist();
    try {
      const sourcePath = safeChild(storageDir, jobStorage(job.id), "source", source.file);
      const characterPath = path.join(outputDir, "sam2-character.png");
      const splitArgs = [layerScript, "--input", sourcePath, "--background-source", safeChild(storageDir, jobStorage(job.id), "source", backgroundSource.file), "--output", outputDir, "--page", String(page), "--orientation", variant];
      if (page > 1) {
        const w = source.width, h = source.height;
        const portrait = variant === "portrait";
        const prompt = { objects:[{ name:"character", box:portrait ? [0, Math.round(h * .48), Math.round(w * .58), h - 1] : [0, 0, Math.round(w * .46), h - 1], points:[portrait ? [Math.round(w * .17), Math.round(h * .72)] : [Math.round(w * .22), Math.round(h * .26)]], labels:[1] }] };
        const promptPath = path.join(outputDir, "sam2-prompts.json");
        await fs.writeFile(promptPath, JSON.stringify(prompt), "utf8");
        await localPython([sam2Script, "--input", sourcePath, "--prompts", promptPath, "--output", characterPath, "--max-side", "1600"], { cwd:root, windowsHide:true, timeout:12 * 60 * 1000, maxBuffer:5 * 1024 * 1024 });
        splitArgs.push("--character-layer", characterPath);
      }
      await localPython(splitArgs, { cwd:root, windowsHide:true, timeout:12 * 60 * 1000, maxBuffer:5 * 1024 * 1024 });
      if (page > 2) await fs.copyFile(safeChild(storageDir, jobStorage(job.id), "layers", `${variant}-2`, "00-background.jpg"), path.join(outputDir, "00-background.jpg"));
      const manifest = JSON.parse(await fs.readFile(path.join(outputDir, "manifest.json"), "utf8"));
      const set = {
        status:"ready", page, variant, method:manifest.method, quality:manifest.quality,
        sharedBackgroundGroup:manifest.sharedBackgroundGroup,
        manifest,
      };
      job.layerSets[key] = set;
      await persist();
      return set;
    } catch (error) {
      job.layerSets[key] = { status:"failed", page, variant, error:error.message };
      await persist();
      throw error;
    }
  }

  async function renderLayerOutput(job, output, spec, set, adjustment) {
    const dir = safeChild(storageDir, jobStorage(job.id), "layers", `${set.variant}-${set.page}`);
    const rawManifest = JSON.parse(await fs.readFile(path.join(dir, "manifest.json"), "utf8"));
    const files = new Map();
    for (const layer of rawManifest.layers) files.set(layer.id, await fs.readFile(path.join(dir, layer.file)));
    for (const layer of rawManifest.layers) {
      const override = output.layerOverrides?.[layer.id];
      if (override) {
        files.set(layer.id, await fs.readFile(safeChild(storageDir, jobStorage(job.id), 'candidates', override.file)));
        Object.assign(layer, override.layer);
      }
    }
    const rendered = await renderLayeredStorePage(files, rawManifest, spec, adjustment);
    await fs.writeFile(safeChild(storageDir, jobStorage(job.id), "output", output.file), rendered.buffer);
    Object.assign(output, { bytes:rendered.bytes, quality:rendered.quality, warnings:rendered.warnings, layerAdjustment:rendered.adjustment, layerMethod:rendered.layerMethod, advancedComposition:true });
  }
  const psdActions = createPsdActions({root, storageDir, jobStorage, config, persist, publicJob, renderLayerOutput, runGeneration});
  async function runGeneration(id) {
    const job = jobs.find((item) => item.id === id);
    try {
      const sourceCache = new Map();
      for (const source of job.sources) {
        const buffer = await fs.readFile(safeChild(storageDir, jobStorage(id), "source", source.file));
        sourceCache.set(source.file, { buffer, info: await inspectPageSource(buffer) });
      }
      const previousOutputs = job.outputs;
      const outputs = [];
      job.outputs = outputs;
      job.phase = "生成尺寸预览";
      const outpaintCache = new Map();
      for (const spec of config.specs) {
        for (let page = 1; page <= STORE_PAGE_COUNT; page += 1) {
          job.phase = `生成 ${spec.channel} ${spec.width}×${spec.height} 第${page}页`;
          const chosen = selectPageSource(job.sources.filter((item) => item.page === page), spec);
          const source = sourceCache.get(chosen.file);
          const directSet = job.layerSets?.[`${chosen.variant}-${page}`];
          if (directSet?.method?.startsWith('psd-direct')) {
            const file = `${sanitizeFileName(spec.channel)}-${outputName(spec, page)}`;
            await fs.mkdir(safeChild(storageDir, jobStorage(id), 'output'), {recursive:true});
            const output = {channel:spec.channel,width:spec.width,height:spec.height,page,file,url:`/storage/${jobStorage(id)}/output/${encodeURIComponent(file)}`,maxBytes:spec.maxKB*1024,sourceFile:chosen.name,outpaintApplied:false};
            const previous=previousOutputs.find(o=>o.channel===spec.channel&&o.width===spec.width&&o.height===spec.height&&o.page===page);
            output.layerOverrides=structuredClone(previous?.layerOverrides||{});
            await renderLayerOutput(job, output, spec, directSet, previous?.layerAdjustment||defaultLayerAdjustments());
            outputs.push(output); job.progress=outputs.length; await persist(); continue;
          }
          const rendered = await renderStorePage(source.buffer, source.info, spec, { outpaintProvider:async () => {
            const key = `${chosen.file}:${chosen.variant}`;
            if (!outpaintCache.has(key)) outpaintCache.set(key, (async () => {
              const generated = await generateStoreOutpaint({ sourceBuffer:source.buffer, sourceInfo:source.info, variant:chosen.variant });
              const file = `page-${chosen.page}-${chosen.variant}.png`;
              const target = safeChild(storageDir, jobStorage(id), "outpaint", file);
              await fs.mkdir(path.dirname(target), { recursive:true });
              await fs.writeFile(target, await sharp(generated.buffer).png().toBuffer());
              return { ...generated, buffer:await fs.readFile(target), masterFile:file };
            })());
            return outpaintCache.get(key);
          } });
          const file = `${sanitizeFileName(spec.channel)}-${outputName(spec, page)}`;
          const target = safeChild(storageDir, jobStorage(id), "output", file);
          await fs.mkdir(path.dirname(target), { recursive: true });
          await fs.writeFile(target, rendered.buffer);
          outputs.push({ channel: spec.channel, width: spec.width, height: spec.height, page, file, url: `/storage/${jobStorage(id)}/output/${encodeURIComponent(file)}`, bytes: rendered.bytes, maxBytes: spec.maxKB * 1024, quality: rendered.quality, warnings: rendered.warnings, outpaintApplied:rendered.outpaintApplied, outpaintMethod:rendered.outpaintMethod, outpaintJobId:rendered.outpaintJobId, sourceRect:rendered.sourceRect, adjustment:rendered.adjustment, advancedComposition:needsAdvancedComposition(spec), layerAdjustment:null, sourceFile: chosen.name });
          job.progress = outputs.length; await persist();
        }
        await persist();
      }
      // Large ratio changes are delivered through the same layered pipeline for
      // all six pages. This prevents a set from mixing Nano flattened pages with
      // locally reconstructed pages after only one card has been edited.
      for (const variant of ["landscape", "portrait"]) {
        for (let page = 1; page <= STORE_PAGE_COUNT; page += 1) {
          job.phase = `尺寸预览已生成，准备${variant === "landscape" ? "横版" : "竖版"}第${page}页图层`; await persist();
          await ensureLayerSet(job, page, variant);
        }
        await rebuildSharedBackground(job, variant);
      }
      for (const spec of config.specs.filter(needsAdvancedComposition)) {
        const variant = spec.height > spec.width ? "portrait" : "landscape";
        for (let page = 1; page <= STORE_PAGE_COUNT; page += 1) {
          job.phase = `优化 ${spec.channel} ${spec.width}×${spec.height} 第${page}页分层构图`; await persist();
          const output = outputs.find((item) => item.channel === spec.channel && item.width === spec.width && item.height === spec.height && item.page === page);
          const set = job.layerSets[`${variant}-${page}`];
          await renderLayerOutput(job, output, spec, set, output.layerAdjustment || defaultLayerAdjustments());
        }
      }
      job.outputs = outputs;
      job.phase = "";
      job.status = "complete";
      job.error = "";
      job.updatedAt = new Date().toISOString();
      await persist();
    } catch (error) {
      job.status = "failed";
      job.error = error.message;
      job.updatedAt = new Date().toISOString();
      await persist();
    }
  }
  return async function handleStorePreorder(req, res, url) {
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[0] !== "api" || parts[1] !== namespace) return false;
    if (parts.length === 3 && parts[2] === "specs" && req.method === "GET") return respond(res, 200, config);
    if (parts.length === 3 && parts[2] === "jobs") {
      if (req.method === "GET") return respond(res, 200, jobs.filter(job=>!recycleBin.isTaskHidden(`${namespace}:${job.id}`)).map(publicJob).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
      if (req.method === "POST") {
        const input = await requestJson(req);
        const project = String(input.project || "").trim();
        if (!project || project.length > 80) return respond(res, 422, { error: "请填写80字以内的素材名称" });
        const now = new Date().toISOString();
        const job = { id: randomUUID(), project, specId: config.id, pagesPerSet: STORE_PAGE_COUNT, status: "draft", sources: [], outputs: [], layerSets:{}, progress: 0, total: config.specs.length * STORE_PAGE_COUNT, version: 1, reviewed: false, error: "", createdAt: now, updatedAt: now };
        job.projectId=input.projectId||'';job.projectLogo=await projectLogos.copyToTask({projectId:job.projectId,logoId:input.projectLogoId,folder:`${namespace}-${job.id}`,bucket:'project-logo'});
        jobs.unshift(job); await persist();
        return respond(res, 201, publicJob(job));
      }
    }
    const id = parts[3];
    const job = parts[2] === "jobs" && jobs.find((item) => item.id === id);
    if (!job) return respond(res, 404, { error: "商店图任务不存在" });
    setProjectHint(job.projectId || "");
    if(recycleBin.isTaskHidden(`${namespace}:${id}`)&&!(parts.length===4&&req.method==='DELETE'))return respond(res,410,{error:'任务已移至回收站，请恢复后再使用'});
    if (parts.length === 4 && req.method === "DELETE") {
      if (job.status === "running" || job.candidates?.some(candidate => candidate.status === "running")) return respond(res, 409, { error: "任务正在制作，请完成后再删除" });
      return respond(res, 200, await recycleBin.trashTask(`${namespace}:${id}`));
    }
    if (parts.length === 4 && req.method === "GET") return respond(res, 200, publicJob(job));
    if (parts[4] === 'psd' && req.method === 'POST') {
      const result = await psdActions(job, parts[5], await requestJson(req));
      return respond(res, result.status || 200, result.value);
    }
    if (parts[4] === "sources" && parts.length === 5 && req.method === "POST") {
      if (job.status === "running" || job.candidates?.some(c=>c.status==='running')) return respond(res, 409, { error: "正在生成，请等待完成后再更换源图" });
      const input = await requestJson(req);
      const files = input.files || [];
      if (!Array.isArray(files) || files.length !== STORE_PAGE_COUNT) return respond(res, 422, { error: "横版或竖版每次必须一次上传6张独立页面源图" });
      const variants = new Set(files.map((file) => String(file.variant || "")));
      const pages = new Set(files.map((file) => Number(file.page)));
      if (variants.size !== 1 || !["portrait", "landscape"].includes([...variants][0]) || pages.size !== STORE_PAGE_COUNT || [...pages].some((page) => page < 1 || page > STORE_PAGE_COUNT)) return respond(res, 422, { error: "同一次上传必须是同一方向，并完整包含第1至第6张" });
      const replacements = [];
      for (const file of files) {
        const page = Number(file.page);
        const variant = String(file.variant || "primary");
        if (!Number.isInteger(page) || page < 1 || page > STORE_PAGE_COUNT || !["primary", "portrait", "landscape"].includes(variant)) return respond(res, 422, { error: "页面编号或方向不正确" });
        const buffer = sourceBytes(file.dataUrl);
        const info = await inspectPageSource(buffer);
        if ((variant === "landscape" && info.width <= info.height) || (variant === "portrait" && info.height <= info.width)) return respond(res, 422, { error: `${file.name || `第${page}张`} 的画面方向与${variant === "landscape" ? "横版" : "竖版"}入口不一致` });
        replacements.push({ page, variant, name: String(file.name || `第${page}页`), file: `page-${page}-${variant}.${info.format === "jpeg" ? "jpg" : info.format}`, buffer, info });
      }
      for (const item of replacements) {
        const target = safeChild(storageDir, jobStorage(id), "source", item.file);
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(target, item.buffer);
        job.sources = job.sources.filter((source) => source.page !== item.page || source.variant !== item.variant);
        job.sources.push({ page: item.page, variant: item.variant, name: item.name, file: item.file, width: item.info.width, height: item.info.height, bytes: item.buffer.length });
      }
      job.sources.sort((a, b) => a.page - b.page || a.variant.localeCompare(b.variant));
      job.outputs = []; job.layerSets = {}; job.candidates = []; job.status = "draft"; job.progress = 0; job.reviewed = false; job.version += 1; job.updatedAt = new Date().toISOString();
      await persist();
      return respond(res, 200, publicJob(job));
    }
    if (parts[4] === "generate" && parts.length === 5 && req.method === "POST") {
      if (job.status === "running" || job.candidates?.some(c=>c.status==='running')) return respond(res, 409, { error: "商店图或 AI 候选正在生成" });
      if (["landscape", "portrait"].some((variant) => Array.from({ length: STORE_PAGE_COUNT }, (_, index) => index + 1).some((page) => !job.sources.some((source) => source.variant === variant && source.page === page)))) return respond(res, 422, { error: "必须先分别上传完整的横版六张和竖版六张源图" });
      job.status = "running"; job.progress = 0; job.reviewed = false; job.error = ""; job.version += 1; job.updatedAt = new Date().toISOString();
      await persist();
      void runGeneration(id);
      return respond(res, 202, publicJob(job));
    }
    if (parts[4] === "adjust" && parts.length === 5 && req.method === "POST") {
      if (job.status !== "complete") return respond(res, 409, { error:"请等待整套生成完成后再调整画面" });
      const input = await requestJson(req);
      const width = Number(input.width), height = Number(input.height), page = Number(input.page);
      const output = job.outputs.find((item) => item.channel === String(input.channel || "") && item.width === width && item.height === height && item.page === page);
      const spec = config.specs.find((item) => item.channel === output?.channel && item.width === width && item.height === height);
      if (!output || !spec) return respond(res, 404, { error:"待调整的商店图不存在" });
      const chosen = selectPageSource(job.sources.filter((item) => item.page === page), spec);
      const sourceBuffer = await fs.readFile(safeChild(storageDir, jobStorage(id), "source", chosen.file));
      const sourceInfo = await inspectPageSource(sourceBuffer);
      const adjustment = {
        zoom:Math.max(100, Math.min(200, Number(input.zoom) || 100)),
        focalX:Math.max(0, Math.min(100, Number(input.focalX) || 50)),
        focalY:Math.max(0, Math.min(100, Number(input.focalY) || 50)),
      };
      const options = { adjustment };
      if (output.outpaintApplied) {
        const masterFile = `page-${page}-${chosen.variant}.png`;
        const masterBuffer = await fs.readFile(safeChild(storageDir, jobStorage(id), "outpaint", masterFile));
        options.outpaintProvider = async () => ({ buffer:masterBuffer, sourceRect:output.sourceRect, jobId:output.outpaintJobId });
      }
      const rendered = await renderStorePage(sourceBuffer, sourceInfo, spec, options);
      await fs.writeFile(safeChild(storageDir, jobStorage(id), "output", output.file), rendered.buffer);
      Object.assign(output, { bytes:rendered.bytes, quality:rendered.quality, warnings:rendered.warnings, adjustment:rendered.adjustment });
      job.reviewed = false; job.version += 1; job.updatedAt = new Date().toISOString();
      await persist();
      return respond(res, 200, publicJob(job));
    }
    if (parts[4] === "layers" && parts[5] === "prepare" && parts.length === 6 && req.method === "POST") {
      if (job.status !== "complete") return respond(res, 409, { error:"请等待整套生成完成后再自动拆层" });
      const input = await requestJson(req);
      const width = Number(input.width), height = Number(input.height), page = Number(input.page);
      const spec = config.specs.find((item) => item.channel === String(input.channel || "") && item.width === width && item.height === height);
      if (!spec || !needsAdvancedComposition(spec) || !Number.isInteger(page) || page < 1 || page > 6) return respond(res, 422, { error:"该尺寸不需要高级拆层调整" });
      const variant = spec.height > spec.width ? "portrait" : "landscape";
      for (let currentPage = 1; currentPage <= STORE_PAGE_COUNT; currentPage += 1) await ensureLayerSet(job, currentPage, variant);
      await rebuildSharedBackground(job, variant);
      for (let currentPage = 1; currentPage <= STORE_PAGE_COUNT; currentPage += 1) {
        const currentSet = job.layerSets[`${variant}-${currentPage}`];
        const output = job.outputs.find((item) => item.channel === spec.channel && item.width === width && item.height === height && item.page === currentPage);
        await renderLayerOutput(job, output, spec, currentSet, output.layerAdjustment || defaultLayerAdjustments());
      }
      const set = job.layerSets[`${variant}-${page}`];
      job.reviewed = false; job.version += 1; job.updatedAt = new Date().toISOString(); await persist();
      return respond(res, 200, { job:publicJob(job), layerSet:set });
    }
    if (parts[4] === "layers" && parts[5] === "adjust" && parts.length === 6 && req.method === "POST") {
      if (job.status !== "complete") return respond(res, 409, { error:"请等待整套生成完成后再调整图层" });
      const input = await requestJson(req);
      const width = Number(input.width), height = Number(input.height), page = Number(input.page);
      const output = job.outputs.find((item) => item.channel === String(input.channel || "") && item.width === width && item.height === height && item.page === page);
      const spec = config.specs.find((item) => item.channel === output?.channel && item.width === width && item.height === height);
      if (!output || !spec || (!needsAdvancedComposition(spec) && !output.layerMethod?.startsWith('psd-direct'))) return respond(res, 404, { error:"高级拆层输出不存在" });
      const variant = spec.height > spec.width ? "portrait" : "landscape";
      const set = await ensureLayerSet(job, page, variant);
      const adjustment = input.adjustment || defaultLayerAdjustments();
      await renderLayerOutput(job, output, spec, set, adjustment);
      if (page >= 2) {
        for (let siblingPage = 2; siblingPage <= 6; siblingPage += 1) {
          if (siblingPage === page) continue;
          const sibling = job.outputs.find((item) => item.channel === spec.channel && item.width === width && item.height === height && item.page === siblingPage);
          if (!sibling) continue;
          const siblingSet = await ensureLayerSet(job, siblingPage, variant);
          const siblingAdjustment = { ...(input.syncPages ? adjustment : sibling.layerAdjustment || defaultLayerAdjustments()), background:adjustment.background };
          await renderLayerOutput(job, sibling, spec, siblingSet, siblingAdjustment);
        }
      }
      job.reviewed = false; job.version += 1; job.updatedAt = new Date().toISOString(); await persist();
      return respond(res, 200, publicJob(job));
    }
    if (parts[4] === "review" && parts.length === 5 && req.method === "POST") {
      if (job.status !== "complete" || job.outputs.length !== job.total) return respond(res, 409, { error: "请先生成完整六页商店图" });
      job.reviewed = true; job.updatedAt = new Date().toISOString(); await persist();
      return respond(res, 200, publicJob(job));
    }
    if (parts[4] === "package" && parts.length === 5 && req.method === "GET") {
      if (job.status !== "complete" || !job.reviewed || job.outputs.length !== job.total) return respond(res, 409, { error: "请检查六页预览并确认成套后再下载" });
      const files = [];
      for (const output of job.outputs) {
        const spec = config.specs.find((item) => item.channel === output.channel && item.width === output.width && item.height === output.height);
        files.push({ name: outputZipPath(sanitizeFileName(taskName(`${namespace}:${job.id}`,job.project)), spec, output.page), data: await fs.readFile(safeChild(storageDir, jobStorage(id), "output", output.file)) });
      }
      files.push({ name: `${sanitizeFileName(taskName(`${namespace}:${job.id}`,job.project))}/生产与校验报告.json`, data: Buffer.from(JSON.stringify({ project: taskName(`${namespace}:${job.id}`,job.project), specId: config.id, pagesPerSet: STORE_PAGE_COUNT, outputs: job.outputs }, null, 2)) });
      const zip = createStoreZip(files);
      const name = `${sanitizeFileName(taskName(`${namespace}:${job.id}`,job.project))}_${config.name}_六页_v${job.version}.zip`;
      res.writeHead(200, { "Content-Type": "application/zip", "Content-Length": zip.length, "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}` });
      res.end(zip);
      return;
    }
    return respond(res, 404, { error: "商店图接口不存在" });
  };
}
