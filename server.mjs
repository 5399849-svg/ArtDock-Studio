import {createCommunitySuiteDelivery} from './lib/community-suite-delivery.mjs';
import {createCommunityCanvasMaterials} from './lib/community-canvas-materials.mjs';
import {belongsToCommunityMaster} from './lib/community-master-assets.mjs';
import {createSourcePopupButtonJobs} from './lib/source-popup-button-jobs.mjs';
import {createSourceClipboard} from './lib/source-clipboard.mjs';
import {receiveAdAssetUpload} from './lib/ad-asset-upload.mjs';
import {getRecycleBin} from './lib/recycle-bin.mjs';
import {sourceCopyrightKey,sourceCopyrightArtifactsCurrent} from './public/source-copyright.js';
import {createSourceAdaptation,rememberSourceVersion,registerSourceMaster,sourceFingerprint,assertSourceParameterSave,prepareSourceScene,sourceFileHash} from './lib/source-adaptation.mjs';
import {isSourceAdaptation,assertSourceExport} from './public/source-adaptation-model.js';
import {assetLibraryKey} from './public/asset-library-key.js';
import {createAssetLibraryCleanup} from './lib/asset-library-cleanup.mjs';
import http from "node:http";
import os from "node:os";
import fs from "node:fs/promises";
import { loadCanvasConfig, listGameTags } from "./platform/canvas.mjs";
import { currentIdentity, setProjectHint } from "./platform/request-context.mjs";
import { runLocalPython } from "./platform/local-compute.mjs";
import {createAdAiPreviewHandler} from './lib/ad-ai-preview-server.mjs';
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import sharp from "sharp";
import { updateLayoutRegions } from "./lib/layout-regions.mjs";
import { optimizePngLosslessly } from "./lib/png-optimize.mjs";
import { prepareNanoOutpaintInput, assertNanoBlankFilled } from "./lib/nano-outpaint-input.mjs";
import { createSafeOutpaint } from "./lib/safe-outpaint.mjs";
import { recoverOrphanedOutpaintState } from "./lib/outpaint-job-state.mjs";
import { isLocalWorkbenchRequest } from "./lib/local-folder-access.mjs";
import { isPhotoshopAsset, extractTaskPsdAssets } from './lib/task-psd-assets.mjs';
import { CHARACTER_ROLES, assessCharacterTransparency, prepareCharacterAssets, replaceCharacterAsset } from './lib/character-preflight.mjs';
import { protectedComposition } from "./public/outpaint-composite.js";
import { coverPlacement, keepImageAspect } from "./public/breakout-layer.js";
import { createStorePreorderHandler } from "./lib/store-preorder-server.mjs";
import { createIconPreorderHandler } from "./lib/icon-preorder-server.mjs";
import { createChannelResourcesHandler } from "./lib/channel-resources-server.mjs";
import { createAdResourcesHandler } from "./lib/ad-resources-server.mjs";
import {createWorkbenchDownloads} from './lib/workbench-downloads.mjs';
import { communityPlacements, communityTemplate, communityResourceRule } from "./lib/community-placements.mjs";
import { communityImageModels, communityImageRequest, communityTypographyRequest, communityReferenceAssets } from "./lib/community-ai-generation.mjs";
import { analyzeCommunityTone, assessCommunityTone, communityToneGuide } from "./lib/community-tone.mjs";
import { confirmedMasterBackground, communityContainPlacement, composeCommunityExtension } from "./lib/community-background-extension.mjs";
import {readCommunityExtensionCache,writeCommunityExtensionCache} from './lib/community-extension-cache.mjs';
import { assertCommunityMasterReady, validateCommunityMasterSelections, propagateCommunityMaster } from './lib/community-master-propagation.mjs';
import { readCompanyFontLibrary, readCompanyFontBytes, readCompanyFontCatalog, importCompanyFontFile, removeCompanyFont } from './lib/company-font-library.mjs';
import {runBannerDesign} from './lib/community-banner-design.mjs';
import {bannerSourceToken,validateBannerDesignInput,commitBannerDesign,restoreBannerVersion} from './lib/community-banner-session.mjs';
import {prepareCommunityArtwork,communityArtworkRequest,fitCommunityArtwork,saveCommunityArtwork,applyCommunityArtwork,bindCommunityArtwork,communityArtworkRunSourceToken} from './lib/community-artwork.mjs';
import {communityReferences} from './public/community-references.js';
import {communityArtworkTargetPending} from './public/community-artwork-state.js';
import {communityMasterTemplate,ensureCommunityMasterWorkspace,remapLegacyMasterSnapshot,renderCommunityArtworkEditSource} from './lib/community-master-workspace.mjs';
import {customCanvasSpec,customCanvasTemplate,registerCustomCanvas} from './public/custom-canvas-model.js';
import {registerCustomTargets} from './public/custom-target-sizes.js';
import {createTaskTargetSizes} from './lib/task-target-sizes.mjs';
import {createCommunityPopup,assertPopupParameterSave,assertPopupPng} from './lib/community-popup.mjs';
import {popupConfig} from './public/community-popup-model.js';
import {createCustomCanvasExporter} from './lib/custom-canvas-export.mjs';
import {createCustomCanvasResizer,remapCustomCanvasSnapshot} from './lib/custom-canvas-resize.mjs';
import {writeJson,mutateJson} from './lib/json-store.mjs';
import {createCommunityMaterialJobs} from './lib/community-material-jobs.mjs';
import {createCommunityTargetReflowJobs} from './lib/community-target-reflow-jobs.mjs';
import {usesLayeredCommunityReflow} from './lib/community-target-reflow.mjs';
import {assertCommunityTargetSaveCurrent} from './lib/community-target-save-guard.mjs';
import {selectCommunityMaterial,removeCommunityMaterial,materialKind} from './lib/community-materials.mjs';
import {addCommunityMaterialReferences,removeCommunityMaterialReference,assertReferenceScope} from './lib/community-material-references.mjs';
import {createCommunityTextCleanup} from './lib/community-text-cleanup.mjs';
import {createCommunityFontTypesetting} from './lib/community-font-typesetting.mjs';
import {createCommunityObjectController} from './lib/community-object-server.mjs';
import {validateCommunityObjectLayers} from './public/community-object-layers.js';
import {approveCommunityTargetDrafts} from './lib/community-target-review.mjs';
import {createWorkbenchProjectLinks} from './lib/workbench-project-links.mjs';
import {createWorkbenchTaskNames} from './lib/workbench-task-names.mjs';
import {createProjectLogoLibrary} from './lib/project-logos.mjs';
import {createProjectDesignLibrary} from './lib/project-design-library.mjs';
import {loadWorkbenchIndex} from './public/workbench-model.js';
import {taskArtifactExportName,renamedTaskArchive} from './lib/task-export-names.mjs';
import {measureBannerBackingContent,centerSubtitleInBacking,fitBannerBackingArtwork} from './lib/banner-backing-content.mjs';
import {resolveBannerBackingFollow} from './lib/banner-backing-follow.mjs';
import {finishLicensedTitle} from './lib/licensed-title-finish.mjs';
import { ApiError, buildOutpaintRequest, composeOutpaintPrompt, createCanvas, detectImageFormat, downloadRaw, nearestBananaRatio, nearestRatio, parseImageSize, placementPixelGaps, pollJob, submitGeneration, translateApiError } from "./lib/ai-huabu.mjs";
import {
  TASK_STATES,
  TRANSITIONS,
  artifactName,
  resourceOutputName,
  canTransition,
  createStoreZip,
  decodeDataUrl,
  qcArtifact,
  safeChild,
  sanitizeFileName,
  validateTask,
  validateDeliveryReadiness,
} from "./lib/core.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(root, "public");
const runtimeDir = process.env.WORKBENCH_RUNTIME_DIR || path.join(root, "data", "runtime");
const storageDir = path.join(runtimeDir, "storage");
const adAiPreviewHandler=createAdAiPreviewHandler({storageDir});
const tasksFile = path.join(runtimeDir, "tasks.json");
const brandsFile = path.join(runtimeDir, "brands.json");
const jobsFile = path.join(runtimeDir, "jobs.json");
const categoriesFile = path.join(runtimeDir, "categories.json");
const referencesFile = path.join(runtimeDir, "references.json");
const specificationsFile = path.join(runtimeDir, "specifications.json");
const layoutDefaultsFile = path.join(runtimeDir, "layout-defaults.json");
const businessLinesFile = path.join(runtimeDir, "business-lines.json");
const projectsFile = path.join(runtimeDir, "projects.json");
const projectLinksFile = path.join(runtimeDir, "workbench-project-links.json");
let workbenchProjectLinks={};
const workbenchProjectLinkStore=createWorkbenchProjectLinks({runtimeDir,onChange:links=>{workbenchProjectLinks=links;},readChannelBatches:()=>channelResourcesHandler.listProjectBatches()});
let taskNames={};
const taskName=(key,fallback)=>taskNames[key]||fallback;
const workbenchTaskNames=createWorkbenchTaskNames({runtimeDir,readChannelBatches:()=>channelResourcesHandler.listProjectBatches(),onChange:names=>{taskNames=names;}});
const projectLogos=createProjectLogoLibrary({runtimeDir,storageDir});
const resourceProfilesFile = path.join(runtimeDir, "resource-profiles.json");
const resourceRulesFile = path.join(root, "config", "resource-rules.json");
const resourceRulesOverlayFile = path.join(runtimeDir, "resource-rules.json");
const localAiDir = path.join(root, "local-ai");
const localAiPipeline = path.join(localAiDir, "pipeline.py");
const sam2Cutout = path.join(root, "scripts", "sam2-character-cutout.py");
const localAiModels = path.join(localAiDir, "models");
// 浏览器计算用的模型随工作台部署在 public/platform/models 下，由使用者的浏览器下载后在本机运行。
const browserSam2Model = path.join(publicDir, "platform", "models", "sam2.1-hiera-small", "vision_encoder.onnx");
const channelSampleDir = path.join(runtimeDir, "channel-analysis", "0922-test");
function elementEffectsOutputStale(task) {
  const edited = Date.parse(task.parameters?.elementEffectsUpdatedAt || "");
  const generated = Date.parse(task.qc?.checkedAt || "");
  return Number.isFinite(edited) && (!Number.isFinite(generated) || edited > generated);
}
const execFileAsync = promisify(execFile);
// 原来在本机跑的 Python 脚本，现在交给发起操作的使用者的浏览器计算（platform/local-compute.mjs）。
const localPython = ([script, ...args], options) => runLocalPython(script, args, options);
// 工作台里新建的资源位存在数据目录（随数据存进库），不改代码里的 config/templates.json：平台上代码目录重新部署就还原。
const customTemplatesFile = path.join(runtimeDir, "custom-templates.json");
const savedCustomTemplates = await fs.readFile(customTemplatesFile, "utf8").then(JSON.parse).catch((error) => { if (error.code === "ENOENT") return []; throw error; });
const templates = [...JSON.parse(await fs.readFile(path.join(root, "config", "templates.json"), "utf8")), ...savedCustomTemplates, ...communityPlacements.map(communityTemplate),communityMasterTemplate].map((template) => ({
  ...template,
  businessLineId: template.businessLineId || "platform-community",
  segmentId: template.segmentId || template.categoryId,
}));
const psdBaseline = JSON.parse(await fs.readFile(path.join(root, "data", "psd-baseline-v1.json"), "utf8"));
const psdLayoutRules = JSON.parse(await fs.readFile(path.join(root, "config", "psd-layout-rules-v1.json"), "utf8"));
const layoutRegionsFile = path.join(runtimeDir, "layout-regions.json");
let layoutOverlays = [];
try { layoutOverlays = JSON.parse(await fs.readFile(layoutRegionsFile, "utf8")); }
catch (error) { if (error.code !== "ENOENT") throw error; }
for (const rule of layoutOverlays) {
  const index = psdLayoutRules.templates.findIndex(item => item.templateId === rule.templateId);
  if (index >= 0) psdLayoutRules.templates[index] = rule; else psdLayoutRules.templates.push(rule);
}
let layoutSaveQueue = Promise.resolve();
const kvSourcePack = JSON.parse(await fs.readFile(path.join(root, "data", "kv-source-pack-v1.json"), "utf8"));

async function loadResourceRules() {
  const base = [...JSON.parse(await fs.readFile(resourceRulesFile, "utf8")), ...communityPlacements.map(communityResourceRule)];
  try {
    const overlay = JSON.parse(await fs.readFile(resourceRulesOverlayFile, "utf8"));
    if (!Array.isArray(overlay) || !overlay.length) return base;
    const overlayMap = new Map(overlay.map((rule) => [rule.templateId, rule]));
    const merged = base.map((rule) => overlayMap.get(rule.templateId) || rule);
    for (const rule of overlay) {
      if (!merged.some((item) => item.templateId === rule.templateId)) merged.push(rule);
    }
    return merged;
  } catch {
    return base;
  }
}

const resourceRules = await loadResourceRules();
const resourceRuleMap = new Map(resourceRules.map((rule) => [rule.templateId, rule]));
const templateMap = new Map(templates.map((template) => [template.id, template]));
const readyTemplateIds = new Set(templates.filter((template) => template.automationReady !== false).map((template) => template.id));

await fs.mkdir(storageDir, { recursive: true });
await ensureJson(tasksFile, []);
for(const task of await readJson(tasksFile)){registerCustomCanvas(task,templateMap);registerCustomTargets(task,templateMap);registerSourceMaster(task,templateMap);}
await ensureJson(jobsFile, []);
await ensureJson(brandsFile, JSON.parse(await fs.readFile(path.join(root, "data", "seed-brands.json"), "utf8")));
await ensureJson(categoriesFile, JSON.parse(await fs.readFile(path.join(root, "data", "seed-categories.json"), "utf8")));
await ensureJson(referencesFile, JSON.parse(await fs.readFile(path.join(root, "data", "seed-references.json"), "utf8")));
await ensureJson(specificationsFile, []);
const seedBusinessLines = JSON.parse(await fs.readFile(path.join(root, "data", "seed-business-lines.json"), "utf8"));
await ensureJson(businessLinesFile, seedBusinessLines);
await ensureCommunityBusinessSegments(seedBusinessLines);
await ensureJson(projectsFile, JSON.parse(await fs.readFile(path.join(root, "data", "seed-projects.json"), "utf8")));
await ensureJson(resourceProfilesFile, []);
await ensureJson(resourceRulesOverlayFile, []);
const recycleBin=await getRecycleBin({runtimeDir,storageDir});
await migrateStaleTaskData();
await ensureJson(projectLinksFile, {});
await workbenchProjectLinkStore.read();
await workbenchTaskNames.read();
const storePreorderHandler = await createStorePreorderHandler({ runtimeDir, storageDir , taskName, projectLogos, recycleBin });
const iconPreorderHandler = await createIconPreorderHandler({ root, runtimeDir, storageDir , taskName, projectLogos, recycleBin });
const iconLaunchHandler = await createIconPreorderHandler({ root, runtimeDir, storageDir, namespace:'icon-launch', configUrl:new URL('./config/icon-launch-v1.json',import.meta.url) , taskName, projectLogos, recycleBin });
const channelResourcesHandler = await createChannelResourcesHandler({ root, runtimeDir, storageDir , taskName, projectLogos, recycleBin });
const adResourcesHandler = await createAdResourcesHandler({ root, runtimeDir, storageDir , taskName, projectLogos, recycleBin });
const storeLaunchHandler = await createStorePreorderHandler({ runtimeDir, storageDir, namespace:'store-launch', configUrl:new URL('./config/store-launch-v1.json',import.meta.url) , taskName, projectLogos, recycleBin });

async function ensureJson(file, initial) {
  try {
    await fs.access(file);
  } catch {
    await fs.writeFile(file, `${JSON.stringify(initial, null, 2)}\n`, "utf8");
  }
}

async function fileExists(file) {
  return fs.access(file).then(() => true).catch(() => false);
}

// 一次性迁移：逐尺寸裁切与版式预览下线后，清理旧任务数据中的 composition 字段与候选派生参数，并清空已废弃的默认布局文件。
async function migrateStaleTaskData() {
  try {
    const tasks = await readJson(tasksFile);
    const before = JSON.stringify(tasks);
    for (const task of tasks) {
      if(recycleBin.isTaskHidden(`core:${task.id}`))continue;
      delete task.composition;
      if (task.parameters) {
        delete task.parameters.protectedRectsByTemplate;
        delete task.parameters.titleVariant;
      }
      if (task.outpaint?.status === "running") {
        task.outpaint = recoverOrphanedOutpaintState(task.outpaint);
        task.history ||= [];
        task.history.push({
          at: task.outpaint.recoveredAt,
          action: "恢复中断的 AI 扩图任务，可重新发起扩图",
          by: "工作台恢复器",
          status: task.status,
        });
      }
    }
    if (JSON.stringify(tasks) !== before) await writeJson(tasksFile, tasks);
  } catch {}
  try {
    const defaults = await readJson(layoutDefaultsFile);
    if (Array.isArray(defaults) && defaults.length) await writeJson(layoutDefaultsFile, []);
  } catch {}
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

async function localAiStatus() {
  const required = [localAiPipeline, path.join(publicDir, "platform", "models", "u2net.onnx")];
  const checks = await Promise.all(required.map((file) => fs.access(file).then(() => true).catch(() => false)));
  return {
    installed: checks.every(Boolean),
    engine: "rembg/u2net + OpenCV（在你的浏览器里计算）",
    mode: "browser",
    externalAiAllowed: false,
    capabilities: ["干净KV前景自动抠图", "按人工标注细分对象", "背景修补草稿"],
    limitations: ["多人对象自动分类仍需人工确认", "大面积背景生成未安装", "缺失肢体补全未安装", "输出必须人工审核"],
  };
}

const removeBgConfigPath = process.env.REMOVE_BG_CONFIG || path.join(root, "config", "remove-bg.json");

async function loadRemoveBgKey() {
  if (String(process.env.REMOVE_BG_API_KEY || "").trim()) return String(process.env.REMOVE_BG_API_KEY).trim();
  try {
    const config = JSON.parse(await fs.readFile(removeBgConfigPath, "utf8"));
    if (config.enabled === false || !String(config.apiKey || "").trim()) return "";
    return String(config.apiKey).trim();
  } catch { return ""; }
}

// 画布用发起操作的使用者自己的微光凭据，积分记在他的账号下（不再读 config/ai-huabu.json 里的共用令牌）。
async function aiHuabuStatus() {
  return { configured: true, enabled: true, apiRoot: "https://ai-huabu.r3062.com/api", models: ["banana_pro", "rh_image_outpaint"], billing: "user" };
}

// project：任务、批次或项目编号，用来找归属游戏。
async function loadAiHuabuConfig(project) {
  return loadCanvasConfig(project);
}

// 同一资源位同时只允许一个扩图任务，key=任务ID:模板ID
const outpaintJobs = new Map();
const communityGenerationJobs = new Map();
recycleBin.register('core',{
  list:async()=>{const jobs=await readJson(jobsFile);return (await readJson(tasksFile)).map(task=>({key:`core:${task.id}`,label:task.project||task.name,projectId:task.projectId,folder:task.id,data:task,busy:communityGenerationJobs.has(task.id)||[...outpaintJobs.keys()].some(key=>key.startsWith(task.id+':'))||jobs.some(job=>job.taskId===task.id&&['running','queued','processing'].includes(job.status))}));},
  drop:async key=>{const id=key.slice(5);await mutateJson(tasksFile,tasks=>{const index=tasks.findIndex(task=>task.id===id);if(index>=0)tasks.splice(index,1);});await mutateJson(jobsFile,jobs=>{for(let i=jobs.length-1;i>=0;i--)if(jobs[i].taskId===id)jobs.splice(i,1);});},
  dropAsset:async asset=>{await mutateJson(tasksFile,tasks=>{for(const task of tasks)task.assets=(task.assets||[]).filter(a=>(a.url||`/storage/${task.id}/assets/${encodeURIComponent(a.name)}`)!==asset.url);});},
});
const communityPopup=createCommunityPopup({tasksFile,storageDir,templateMap,jobs:communityGenerationJobs,invalidate:invalidateTaskArtifacts,reconcile:reconcileCommunityTargetExtension,readFonts:()=>readCompanyFontLibrary({root})});
const communityCanvasMaterials=createCommunityCanvasMaterials({tasksFile,storageDir,templateMap,jobs:communityGenerationJobs,invalidate:invalidateTaskArtifacts,readProjectMaterial:(task,assetId)=>projectDesignLibrary.readImageForTask(task,assetId)});
const sourceAdaptation=createSourceAdaptation({root,storageDir,tasksFile,templateMap,jobs:communityGenerationJobs,invalidate:invalidateTaskArtifacts,readFonts:()=>readCompanyFontLibrary({root}),readProjectMaterial:(task,assetId)=>projectDesignLibrary.readImageForTask(task,assetId)});
const confirmCommunitySuite=createCommunitySuiteDelivery({tasksFile,storageDir,templateMap,jobs:communityGenerationJobs,assertReady:async(task,targets)=>{
 const project=(await readJson(projectsFile)).find(p=>p.id===task.projectId);
 if(!task.communityMasterApproval?.fingerprint||task.communityMasterApproval.fingerprint!==communityMasterFingerprint(task,project))throw Object.assign(Error('母稿已更新，请重新输出当前尺寸稿'),{status:409});
 if(targets.some(t=>communityArtworkTargetPending(task,t))||elementEffectsOutputStale(task)||!sourceCopyrightArtifactsCurrent(task,targets,project))throw Object.assign(Error('尺寸稿或版权已更新，请重新输出'),{status:409});
 const errors=validateDeliveryReadiness({...task,targetTemplateIds:targets.filter(t=>!t.customTarget).map(t=>t.id)},resourceRuleMap);if(errors.length)throw Object.assign(Error(errors.join('；')),{status:409});
}});
const sourceClipboard=createSourceClipboard();
async function uploadQuickSource(id,req,{name,expectedUpdatedAt}){
 const before=(await readJson(tasksFile)).find(t=>t.id===id);if(!before)throw Object.assign(Error('任务不存在'),{status:404});
 if(isSourceAdaptation(before))return sourceAdaptation.upload(id,req,{name,expectedUpdatedAt});
 const check=task=>{if(task.updatedAt!==expectedUpdatedAt||communityGenerationJobs.has(id)||task.communityGeneration?.status==='running'||task.outpaint?.status==='running')throw Object.assign(Error('任务已更新或正在生成，请刷新后再导入'),{status:409});};check(before);
 const original=path.basename(String(name||'')),extension=path.extname(original).toLowerCase();
 const upload=await receiveAdAssetUpload(req,{runtimeDir,name:extension==='.psb'?original.slice(0,-4)+'.psd':original,mime:'application/octet-stream'});
 try{return await mutateJson(tasksFile,async tasks=>{
  const task=tasks.find(t=>t.id===id);if(!task)throw Object.assign(Error('任务不存在'),{status:404});check(task);
  const saved=await saveLocalAsset(id,upload.sourcePath,path.basename(original,extension)+'-'+randomUUID().slice(0,8)+extension),psd=/\.ps[db]$/i.test(original);
  const asset={...saved,label:original,role:psd?'source-psd':'master',createdAt:new Date().toISOString()};task.assets.push(asset);
  if(psd)await extractTaskPsdAssets({root,storageDir,task,source:asset,role:'master'});
  invalidateTaskArtifacts(task,'导入源素材，保留原有文件');task.updatedAt=new Date().toISOString();return task;
 });}finally{await upload.cleanup();}
}
const communityTextCleanup=createCommunityTextCleanup({tasksFile,storageDir,templateMap,jobs:communityGenerationJobs,invalidate:invalidateTaskArtifacts,readFonts:()=>readCompanyFontLibrary({root})});
const communityFontTypesetting=createCommunityFontTypesetting({tasksFile,storageDir,templateMap,jobs:communityGenerationJobs,invalidate:invalidateTaskArtifacts,readFonts:()=>readCompanyFontLibrary({root})});
const communityMaterials=createCommunityMaterialJobs({tasksFile,storageDir,templateMap,jobs:communityGenerationJobs,loadConfig:loadAiHuabuConfig,createCanvas,submitGeneration,pollJob,downloadRaw,invalidate:invalidateTaskArtifacts});
const sourcePopupButtons=createSourcePopupButtonJobs({tasksFile,storageDir,jobs:communityGenerationJobs,loadConfig:loadAiHuabuConfig,createCanvas,submitGeneration,pollJob,downloadRaw,invalidate:invalidateTaskArtifacts});
await sourcePopupButtons.restore();
const exportCustomCanvas=createCustomCanvasExporter({tasksFile,storageDir,jobs:communityGenerationJobs});
const resizeCustomCanvas=createCustomCanvasResizer({tasksFile,templateMap,jobs:communityGenerationJobs});
const addTaskTargetSizes=createTaskTargetSizes({tasksFile,templateMap,jobs:communityGenerationJobs,invalidate:invalidateTaskArtifacts,reconcile:reconcileCommunityTargetExtension,readFonts:()=>readCompanyFontLibrary({root})});
await communityMaterials.restore();
const communityObjects=createCommunityObjectController({tasksFile,storageDir,templateMap,jobs:communityGenerationJobs,publicTask,readBody,loadConfig:loadAiHuabuConfig,createCanvas,submitGeneration,pollJob,downloadRaw,invalidate:invalidateTaskArtifacts,
  segmentAvailable:async()=>await fileExists(browserSam2Model),
  segment:async({sourceBuffer,selection,workDir})=>{
    const metadata=await sharp(sourceBuffer).metadata(),width=metadata.width,height=metadata.height;
    const positive=selection.points.filter(p=>p.label===1),negative=selection.points.filter(p=>p.label===0),box=selection.box.map((n,i)=>Math.round(n*(i%2?height:width)));
    const objects=[{name:'当前稿完整主体',box,points:[...positive,...negative].map(p=>[Math.round(p.x*width),Math.round(p.y*height)]),labels:[...positive.map(()=>1),...negative.map(()=>0)]}];
    const input=safeChild(workDir,'source.png'),prompts=safeChild(workDir,'prompts.json'),output=safeChild(workDir,'segmented.png');await fs.writeFile(input,sourceBuffer);await fs.writeFile(prompts,JSON.stringify({objects}));
    await localPython([sam2Cutout,'--input',input,'--prompts',prompts,'--output',output],{cwd:root,windowsHide:true,timeout:10*60*1000,maxBuffer:4*1024*1024});
    const refined=safeChild(workDir,'refined.png');await localPython([path.join(root,'scripts','refine-community-cutout.py'),'--input',input,'--mask',output,'--prompts',prompts,'--output',refined],{cwd:root,windowsHide:true,timeout:3*60*1000,maxBuffer:1024*1024});return fs.readFile(refined);
  }
});
await communityObjects.restore();
const communityTargetReflow=createCommunityTargetReflowJobs({tasksFile,storageDir,templateMap,jobs:communityGenerationJobs,loadConfig:loadAiHuabuConfig,createCanvas,submitGeneration,pollJob,downloadRaw,confirmedSource:confirmedCommunityBackgroundSource,fingerprint:async task=>communityMasterFingerprint(task,(await readJson(projectsFile)).find(p=>p.id===task.projectId)),invalidate:invalidateTaskArtifacts});
await communityTargetReflow.restore();

function json(res, status, data) {
  const body = Buffer.from(JSON.stringify(data));
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": body.length,
    "Cache-Control": "no-store",
  });
  res.end(body);
}

async function readBody(req, maxBytes = 80 * 1024 * 1024) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBytes) throw Object.assign(new Error("上传内容超过 80MB 限制"), { status: 413 });
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw Object.assign(new Error("请求数据不是有效 JSON"), { status: 400 });
  }
}

async function readRawBody(req, maxBytes) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBytes) throw Object.assign(new Error("上传的文件太大"), { status: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

// 项目的归属游戏：画布生成按它归到使用者的归属画布（从画布的游戏清单里选，不用「其他游戏」兜底）。
async function projectGameTag(input) {
  if (input.gameTagId === null || input.gameTagId === "" || input.gameTagId === undefined) return { gameTagId: null, gameTagName: "" };
  const id = Number(input.gameTagId);
  if (!Number.isInteger(id) || id <= 0) throw Object.assign(new Error("归属游戏无效"), { status: 422 });
  const tag = (await listGameTags()).find((item) => item.id === id);
  if (!tag) throw Object.assign(new Error("画布的游戏清单里没有这个游戏，请刷新后重新选择"), { status: 422 });
  return { gameTagId: id, gameTagName: tag.name };
}

function matchRoute(pathname, pattern) {
  const names = [];
  const source = pattern.replace(/:([A-Za-z]+)/g, (_, name) => {
    names.push(name);
    return "([^/]+)";
  });
  const match = new RegExp(`^${source}$`).exec(pathname);
  if (!match) return null;
  return Object.fromEntries(names.map((name, index) => [name, decodeURIComponent(match[index + 1])]));
}

function publicTask(task) {
  const sourceMaster=registerSourceMaster(task,templateMap);
  const customTemplate=registerCustomCanvas(task,templateMap);
  registerCustomTargets(task,templateMap);
  const outpaintKey = task.outpaint?.templateId ? `${task.id}:${task.outpaint.templateId}` : "";
  const outpaint = recoverOrphanedOutpaintState(task.outpaint, { active: Boolean(outpaintKey && outpaintJobs.has(outpaintKey)) });
  return {
    ...task,
    recycledAssetUrls:(task.assets||[]).map(a=>a.url||`/storage/${task.id}/assets/${encodeURIComponent(a.name)}`).filter(url=>recycleBin.isAssetHidden(url)),
    archiveProjectId: Object.hasOwn(workbenchProjectLinks,`core:${task.id}`)?workbenchProjectLinks[`core:${task.id}`]:task.projectId||'',
    outpaint,
    communityGeneration: task.communityGeneration?.status === 'running' && !communityGenerationJobs.has(task.id)
      ? { ...task.communityGeneration, status:'interrupted', error:'服务重启中断了生图；已完成的候选仍可使用，请重新生成剩余方案' }
      : task.communityGeneration,
    templates: task.targetTemplateIds.map((id) => templateMap.get(id)).filter(Boolean),
    masterTemplate: templateMap.get(task.masterTemplateId) || null,
    masterCanvas: sourceMaster?{id:'source-original',name:'源稿画布',width:sourceMaster.width,height:sourceMaster.height}:customTemplate?{id:'custom',name:'自定义画布',width:customTemplate.width,height:customTemplate.height}:task.masterCanvasId === "portrait-1080x1920" ? { id: task.masterCanvasId, name: "竖版主图", width: 1080, height: 1920 } : { id: task.masterCanvasId || "landscape-1920x1080", name: "横版主图", width: 1920, height: 1080 },
  };
}

function normalizeTask(task) {
  task.projectId ||= "";
  task.businessLineId ||= "platform-community";
  task.segmentId ||= templateMap.get(task.targetTemplateIds?.[0])?.segmentId || "platform";
  task.segmentIds ||= [task.segmentId].filter(Boolean);
  task.annotations ||= { objects: [], activeType: "core-character", updatedAt: null };
  // 逐尺寸裁切与版式预览已下线；旧任务数据里可能残留 composition 字段与候选派生参数，读取时统一清理。
  delete task.composition;
  if (task.parameters) {
    delete task.parameters.protectedRectsByTemplate;
    delete task.parameters.titleVariant;
  }
  task.pagePreviews ||= [];
  task.resourceReviews ||= {};
  task.primaryAssetName ||= "";
  syncReviewedPopupLayers(task);
  return task;
}

function syncReviewedPopupLayers(task) {
  const outputs = task.localAi?.outputs || [];
  const foregrounds = outputs.filter((item) => item.kind === "foreground" && /reviewed-source-pixel-cutout/.test(item.qualityStatus || "") && item.sourceAssetName);
  if (!foregrounds.length) return;
  task.parameters ||= {};
  task.parameters.assetByTemplate ||= {};
  for (const id of task.targetTemplateIds || []) {
    const template = templateMap.get(id);
    if (template?.renderMode !== "masked-popup") continue;
    const binding = task.parameters.assetByTemplate[id] ||= {};
    const manual = task.assets?.find((item) => item.name === binding.character && ["character", "core-character"].includes(item.role) && !item.derived);
    if (manual) continue;
    let chosen = foregrounds.find((item) => item.sourceAssetName === binding.background || item.sourceAssetName === task.parameters.backgroundByTemplate?.[id]?.sourceAssetName);
    if (!chosen) {
      const ratio = template.width / template.height;
      chosen = [...foregrounds].sort((a, b) => Math.abs(Math.log(ratio / (a.width / a.height))) - Math.abs(Math.log(ratio / (b.width / b.height))))[0];
    }
    if (!chosen) continue;
    binding.background = chosen.sourceAssetName;
    binding.character = chosen.name;
    task.parameters.layoutByTemplate ||= {};
    task.parameters.layoutByTemplate[id] ||= {};
    let layout = task.parameters.layoutByTemplate[id].character;
    if (!layout && chosen.width > 0 && chosen.height > 0) {
      const background = task.parameters.backgroundByTemplate?.[id] || {};
      layout = { ...coverPlacement(chosen.width, chosen.height, template.width, template.height, {
        scale: background.scale ?? 100,
        focalX: background.focalX ?? 50,
        focalY: background.focalY ?? 50,
      }), visible: true };
      task.parameters.layoutByTemplate[id].character = layout;
    }
    if (layout?.width > 0 && layout?.height > 0 && chosen.width > 0 && chosen.height > 0
      && Math.abs(layout.width / layout.height - chosen.width / chosen.height) > .005) {
      layout = keepImageAspect(layout, chosen.width, chosen.height);
      task.parameters.layoutByTemplate[id].character = layout;
    }
    if (layout?.visible !== false && chosen.subjectBounds?.y >= 0 && chosen.height > 0) {
      const headTop = layout.y + chosen.subjectBounds.y / chosen.height * layout.height;
      if (headTop < 8) task.parameters.layoutByTemplate[id].character = { ...layout, y: layout.y + 8 - headTop };
    }
  }
}

function invalidateTaskArtifacts(task, action) {
  // 输入或确认信息变化后，旧成品与页面预览一律撤回，避免过期成品进入交付。
  const hadArtifacts = Boolean(task.artifacts?.length);
  if (hadArtifacts) task.version += 1;
  task.artifacts = [];
  task.pagePreviews = [];
  task.qc = null;
  task.visualReview = { status: "pending", note: hadArtifacts ? `${action}，旧版结果已撤回` : "输入已更新，等待重新处理" };
  // A downloaded delivery is an immutable milestone. Later working edits must
  // never silently turn that completed delivery back into an unfinished task.
  if (task.status === "已完成" && task.deliveredPackage) task.unreleasedChanges = true;
  else if (["成套审核","已完成"].includes(task.status)) task.status = task.customCanvas?"主图制作":"批量生成";
  if (hadArtifacts) task.history.push({ at: new Date().toISOString(), action, by: "设计师", status: task.status });
  return hadArtifacts;
}

function resourceProfile(template, profiles) {
  const saved = profiles.find((item) => item.templateId === template.id) || {};
  return {
    templateId: template.id,
    businessLineId: saved.businessLineId || template.businessLineId,
    segmentId: saved.segmentId || template.segmentId,
    version: saved.version || 1,
    technical: saved.technical || { width: template.width, height: template.height, format: template.format, maxBytes: template.maxBytes, transparent: Boolean(template.transparent) },
    elements: {
      title: "unspecified", logo: "unspecified", ipCopyright: "unspecified", secondaryCopy: "unspecified", button: "unspecified",
      ...(saved.elements || {}),
    },
    geometry: saved.geometry || { coreZones: [], uiOcclusionZones: [], allowedCropZones: [], extensionZones: [], elementZones: {} },
    exportRules: saved.exportRules || { pagePreview: Boolean(template.pagePreviewPsd), naming: (saved.segmentId || template.segmentId) === "platform" ? "资源位名称_尺寸" : "项目_资源位_尺寸_版本" },
    notes: saved.notes || "",
    status: saved.status || "draft",
    updatedAt: saved.updatedAt || null,
  };
}

async function saveDataFile(taskId, bucket, originalName, dataUrl) {
  const { mime, buffer } = decodeDataUrl(dataUrl);
  const directory = safeChild(storageDir, taskId, bucket);
  await fs.mkdir(directory, { recursive: true });
  const name = sanitizeFileName(originalName);
  const target = safeChild(directory, name);
  await fs.writeFile(target, buffer);
  return { name, mime, bytes: buffer.length, url: `/storage/${encodeURIComponent(taskId)}/${bucket}/${encodeURIComponent(name)}` };
}

function localMime(file) {
  const extension = path.extname(file).toLowerCase();
  return ({ ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".psd": "image/vnd.adobe.photoshop", ".psb": "image/vnd.adobe.photoshop" })[extension] || "application/octet-stream";
}

async function saveLocalAsset(taskId, source, originalName) {
  const directory = safeChild(storageDir, taskId, "assets");
  await fs.mkdir(directory, { recursive: true });
  const name = sanitizeFileName(originalName || path.basename(source));
  const target = safeChild(directory, name);
  await fs.copyFile(source, target);
  const stat = await fs.stat(target);
  return { name, mime: localMime(name), bytes: stat.size, url: `/storage/${encodeURIComponent(taskId)}/assets/${encodeURIComponent(name)}` };
}

// 浏览器选中的素材包文件夹先传到这里（upload:<编号>），导入时照旧按文件夹读取；导入后的文件存进任务，这里只是中转。
const materialUploadRoot = path.join(os.tmpdir(), "wb-material-uploads");
function resolveWorkspaceFolder(inputPath, request) {
  const raw = String(inputPath || "").trim().replace(/^['"]|['"]$/g, "");
  if (!raw) throw Object.assign(new Error("请选择素材包文件夹"), { status: 422 });
  const uploaded = /^upload:([0-9a-f-]{36})$/.exec(raw);
  if (uploaded) return path.join(materialUploadRoot, uploaded[1]);
  if (process.env.DATABASE_URL) throw Object.assign(new Error("请用「选择素材包文件夹」从你的电脑选取素材，服务器读不到你电脑上的路径"), { status: 422 });
  const legacyPrefix = "C:\\Users\\Administrator\\Documents\\ChatGPT\\平台&社区";
  const mapped = raw.toLowerCase().startsWith(legacyPrefix.toLowerCase())
    ? path.join(root, raw.slice(legacyPrefix.length).replace(/^[\\/]+/, ""))
    : raw;
  const resolved = path.resolve(root, mapped);
  const relative = path.relative(root, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    if (!isLocalWorkbenchRequest(request)) {
      throw Object.assign(new Error("工作区外的素材文件夹只能从本机工作台页面导入"), { status: 403 });
    }
    if (resolved === path.parse(resolved).root) {
      throw Object.assign(new Error("请选择具体的素材文件夹，不能导入整个磁盘"), { status: 422 });
    }
  }
  return resolved;
}

async function listAssetFiles(folder, limit = 120) {
  const supported = new Set([".jpg", ".jpeg", ".png", ".webp", ".psd", ".psb"]);
  const result = [];
  async function visit(directory) {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      if (result.length >= limit) throw Object.assign(new Error(`素材包文件超过 ${limit} 个，请精简后重试`), { status: 422 });
      if (entry.name.startsWith(".")) continue;
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(fullPath);
      else if (entry.isFile() && supported.has(path.extname(entry.name).toLowerCase())) result.push(fullPath);
    }
  }
  await visit(folder);
  return result;
}

function classifyLocalAsset(fileName, size) {
  const name = String(fileName || "");
  const portrait = size?.height > size?.width;
  const orientation = portrait ? "portrait" : "landscape";
  if (/\.ps[db]$/i.test(name)) return { role: "source-psd", variant: orientation };
  if (/纯图|无文案|干净.?kv|clean.?kv|(?:横|竖).?版?.?背景|背景.?纯图|background/i.test(name)) return { role: `background-${orientation}`, variant: orientation };
  if (/完整|成品|效果|master/i.test(name)) return { role: `master-${orientation}`, variant: "complete" };
  if (/副标|sub.?title/i.test(name)) return { role: "subtitle", variant: "default" };
  if (/主标|标题|title|文案/i.test(name)) {
    const variant = /竖排|vertical/i.test(name) ? "vertical" : /两行|二行|two.?line/i.test(name) ? "two-line" : /一行|one.?line/i.test(name) ? "one-line" : "default";
    return { role: "title", variant };
  }
  if (/logo/i.test(name)) return { role: "logo", variant: "default" };
  if (/次要人物|secondary.?character/i.test(name)) return { role: 'secondary-character', variant: 'default' };
  if (/角色|人物|立绘|character/i.test(name)) return { role: 'character', variant: 'default' };
  if (/版权|著作权|ip标|ip.?copyright|copyright/i.test(name)) return { role: "ip-copyright", variant: "default" };
  if (/按钮|button|cta|立即|前往|进入|已下载/i.test(name)) return {
    role: "button",
    variant: /已下载/i.test(name) ? "downloaded" : "cta",
    copy: /已下载/i.test(name) ? "已下载" : /前往/i.test(name) ? "立即前往" : "立即下载",
  };
  if (/kv/i.test(name) && size) return { role: `master-${orientation}`, variant: "complete" };
  return { role: "supplement", variant: "default" };
}

async function ensureCommunityBusinessSegments(seedLines) {
  const lines = await readJson(businessLinesFile);
  const platform = lines.find(line => line.id === "platform-community");
  const defaults = seedLines.find(line => line.id === "platform-community");
  if (!platform || !defaults) return;
  platform.segments ||= [];
  let changed = false;
  for (const id of ["community", "official-media"]) {
    if (platform.segments.some(segment => segment.id === id)) continue;
    const source = defaults.segments.find(segment => segment.id === id);
    if (source) { platform.segments.push({ ...source }); changed = true; }
  }
  if (changed) await writeJson(businessLinesFile, lines);
}

function communityMasterFingerprint(task, project) {
  if(task.sourceAdaptation)return sourceFingerprint(task);
  const master = task.masterTemplateId;
  const source = {
    assets:(task.assets || []).filter(asset => belongsToCommunityMaster(task,asset)&&!asset.objectRunId&&!['mother-candidate','generated-background','confirmed-master-background'].includes(asset.role)).map(({ name, url, bytes, role }) => ({ name, url, bytes, role })),
    copy:task.copy || '', subtitle:task.parameters?.subtitleText || '',
    projectIp:Boolean(project?.isIpProject),copyright:project?.copyrightNotice || '',
    masterTemplateId:master,
    ...((task.parameters?.titleFontAsset || task.parameters?.subtitleFontAsset || task.parameters?.titleFontId || task.parameters?.subtitleFontId) ? { copyFonts:{title:task.parameters.titleFontAsset||'',subtitle:task.parameters.subtitleFontAsset||'',...(task.parameters.titleFontId ? {titleId:task.parameters.titleFontId} : {}),...(task.parameters.subtitleFontId ? {subtitleId:task.parameters.subtitleFontId} : {})} } : {}),
    masterLayout:task.parameters?.layoutByTemplate?.[master] || {},
    masterAssets:task.parameters?.assetByTemplate?.[master] || {},
    ...(task.parameters?.communityObjectLayersByTemplate?.[master]?.length?{masterObjects:task.parameters.communityObjectLayersByTemplate[master]}:{}),
    ...((task.assets || []).some(asset => asset.name === task.parameters?.assetByTemplate?.[master]?.background && asset.role === 'mother-candidate')
      ? { selectedCandidate:(task.assets || []).filter(asset => asset.name === task.parameters?.assetByTemplate?.[master]?.background && asset.role === 'mother-candidate').map(({name,url,bytes})=>({name,url,bytes})) }
      : {}),
    masterBackground:task.parameters?.backgroundByTemplate?.[master] || {},
  };
  return createHash('sha256').update(JSON.stringify(source)).digest('hex');
}

function reconcileCommunityTargetExtension(task) {
  const run = task.communityGeneration;
  const fingerprint = task.communityMasterApproval?.fingerprint;
  if (run?.phase !== 'targets' || run.status === 'running' || !fingerprint) return;
  const ids = task.targetTemplateIds.filter(id => id !== task.masterTemplateId);
  const covered = new Set(ids.filter(id => {
    const selected = task.parameters?.assetByTemplate?.[id]?.background;
    return !communityArtworkTargetPending(task,templateMap.get(id)) && (popupConfig(task,templateMap.get(id))||task.assets.some(asset => asset.name === selected && asset.role === 'generated-background'));
  }));
  const errors = (run.errors || []).filter(error => ids.some(id => error.startsWith(`${templateMap.get(id)?.name}：`) && !covered.has(id)));
  for (const id of ids) if (!covered.has(id) && !errors.some(error => error.startsWith(`${templateMap.get(id)?.name}：`))) {
    errors.push(`${templateMap.get(id)?.name || id}：新增尺寸待按确认母版延展`);
  }
  run.total = ids.length;
  run.done = covered.size;
  run.errors = errors;
  run.status = covered.size === ids.length ? 'done' : 'partial';
}

async function maybePrepareSourceTask(task){
 if(!isSourceAdaptation(task)||task.sourceAdaptation||task.communityGeneration||task.assets.some(a=>a.role==='mother-candidate'))return;
 const psds=task.assets.filter(isPhotoshopAsset),images=task.assets.filter(a=>['master','master-landscape','master-portrait','source-original','background-landscape','background-portrait','clean-kv'].includes(a.role)&&a.mime?.startsWith('image/')),candidates=psds.length?psds:images;
 if(candidates.length!==1)return;
 try{await prepareSourceScene({root,storageDir,task,name:candidates[0].name,templateMap,invalidate:invalidateTaskArtifacts});delete task.sourceImportError;}
 catch(error){task.sourceImportError=`源文件已保存，还原未完成：${String(error.stderr||error.message).trim().split(/\r?\n/).at(-1)}`;}
}
async function importAssetsFromFolder(task, folder) {
  const sourceFiles = await listAssetFiles(folder);
  if (!sourceFiles.length) throw Object.assign(new Error("素材包中没有可导入的 JPG、PNG、WebP、PSD 或 PSB 文件"), { status: 422 });
  const imported = [];
  const usedNames = new Set(task.assets.map((asset) => asset.name.toLowerCase()));
  const relativeFolder = path.relative(root, folder);
  const sourceFolder = relativeFolder.startsWith('..') || path.isAbsolute(relativeFolder) ? folder : relativeFolder;
  for (const source of sourceFiles) {
    if(isSourceAdaptation(task)&&/\.ps[db]$/i.test(source)){
      const stat=await fs.stat(source),existing=task.assets.find(a=>a.name===path.basename(source)&&a.bytes===stat.size);
      if(existing&&await sourceFileHash(source)===await sourceFileHash(safeChild(storageDir,task.id,'assets',existing.name)).catch(()=>null))continue;
      const extension=path.extname(source),stem=path.basename(source,extension);let name=path.basename(source),suffix=2;
      while(usedNames.has(sanitizeFileName(name).toLowerCase()))name=`${stem}_${suffix++}${extension}`;
      const saved=await saveLocalAsset(task.id,source,name);usedNames.add(saved.name.toLowerCase());
      imported.push({...saved,...classifyLocalAsset(path.basename(source),null),sourceFolder,createdAt:new Date().toISOString()});continue;
    }
    const buffer = await fs.readFile(source);
    const existing = task.assets.find((asset) => asset.name === path.basename(source) && asset.bytes === buffer.length);
    if (existing) {
      const stored = await fs.readFile(safeChild(storageDir, task.id, "assets", existing.name)).catch(() => null);
      if (stored?.equals(buffer)) continue;
    }
    const size = parseImageSize(buffer);
    const extension = path.extname(source);
    const stem = path.basename(source, extension);
    let name = path.basename(source);
    let suffix = 2;
    while (usedNames.has(sanitizeFileName(name).toLowerCase())) name = `${stem}_${suffix++}${extension}`;
    const saved = await saveLocalAsset(task.id, source, name);
    usedNames.add(saved.name.toLowerCase());
    imported.push({ ...saved, ...classifyLocalAsset(path.basename(source), size), width: size?.width || null, height: size?.height || null, sourceFolder, createdAt: new Date().toISOString() });
  }
  task.assets.push(...imported);
  imported.push(...await prepareCharacterAssets({ storageDir, task, assets: imported }));
  for (const source of task.assets.filter(asset => !isSourceAdaptation(task) && isPhotoshopAsset(asset) && asset.psdExtraction?.status !== 'done')) {
    const extracted = await extractTaskPsdAssets({ root, storageDir, task, source });
    imported.push(...extracted);
  }
  if (!imported.length) return imported;
  invalidateTaskArtifacts(task, `自动导入素材包 ${path.basename(folder)}，旧版结果已撤回`);
  const preferred = imported.find((asset) => asset.role === "background-landscape")
    || imported.find((asset) => asset.role === "background-portrait")
    || imported.find((asset) => asset.role === "master-landscape")
    || imported.find((asset) => asset.role !== 'source-character' && !isPhotoshopAsset(asset) && asset.mime?.startsWith("image/"));
  if (preferred) task.primaryAssetName = preferred.name;
  task.parameters ||= {};
  task.parameters.sourceFolder = sourceFolder;
  task.parameters.automaticProduction = { status: "assets-imported", importedCount: imported.length, updatedAt: new Date().toISOString() };
  await maybePrepareSourceTask(task);
  task.updatedAt = new Date().toISOString();
  task.history.push({ at: task.updatedAt, action: `导入素材包：${path.basename(folder)}（${imported.length}个文件）`, by: "设计师", status: task.status });
  return imported;
}

// —— AI 扩图（画布平台）——

// 只允许原始素材；重试不得再次加工旧的 AI 输出。
function resolveOutpaintSource(task, template, input) {
  const url = String(input?.sourceUrl || "");
  if (url) {
    const storage = matchRoute(String(url), "/storage/:taskId/:bucket/:name");
    if (storage?.taskId === task.id && storage.bucket === "assets" && task.assets?.some(asset => asset.name === storage.name)) return { url, bucket: storage.bucket, name: storage.name };
  }
  const assetByName = (name) => task.assets?.find((item) => item.name === name && item.mime?.startsWith("image/"));
  const asset = assetByName(task.parameters?.assetByTemplate?.[template.id]?.background) || assetByName(task.primaryAssetName);
  return asset ? { url: asset.url, bucket: "assets", name: asset.name } : null;
}

async function cleanupOutpaintFiles(taskId, templateId, keepName) {
  try {
    const directory = safeChild(storageDir, taskId, "outpaint");
    for (const name of await fs.readdir(directory)) {
      if (name !== keepName && name.startsWith(`${templateId}.`) && /\.(jpg|png)$/i.test(name)) {
        await fs.unlink(safeChild(directory, name)).catch(() => {});
      }
    }
  } catch {}
}

// Respect the selected model: a failed generation must not silently change style via another provider.
async function runOutpaint(task, template, config, input, job, sourceAsset, sourceBuffer, sourceSize) {
  const base64 = sourceBuffer.toString("base64");
  const userPrompt = String(input?.prompt || "").trim().slice(0, 500);
  const allowNewSubjects = input?.allowNewSubjects === true;
  const prompt = composeOutpaintPrompt(userPrompt, { allowNewSubjects });
  // 腾讯扩图的公开 schema 明确说明 prompt 只透传记录、不参与生成，不能作为
  // 带生产约束请求的自动降级项。auto 模式只使用真正消费 prompt 的 RH 扩图。
  const ordered = job.model === "rh" ? ["rh_image_outpaint"] : ["banana_pro"];
  let lastError = null;
  for (const model of ordered) {
    let body;
    let nanoPrepared;
    if (model === "rh_image_outpaint") {
      const placement = job.originalPlacement || task.parameters?.backgroundByTemplate?.[template.id] || {};
      const gaps = placementPixelGaps(sourceSize.width, sourceSize.height, template.width, template.height, placement);
      body = buildOutpaintRequest({ model, base64, prompt, ...gaps });
    } else if (model === "banana_pro") {
      const placement = job.originalPlacement || task.parameters?.backgroundByTemplate?.[template.id] || {};
      const prepared = await prepareNanoOutpaintInput(sourceBuffer, template.width, template.height, placement);
      nanoPrepared = prepared;
      const rect = prepared.sourceRect;
      const bounds = [rect.x,rect.y,rect.width,rect.height].map(v=>(v*100).toFixed(2)).join(", ");
      const bananaPrompt = `${prompt}\n【扩图画布 v2】输入已按当前构图留出浅灰色待补区域。原图矩形的左、上、宽、高百分比分别为 ${bounds}。保持此矩形的位置、大小与内容不变，仅将矩形之外的浅灰区域补成连续环境。浅灰色是空白标记，不是场景；输出须填满整个 ${prepared.ratio} 画布，不得裁掉空白、放大原图填满或原样返回。`;
      const imageSize = Math.max(template.width, template.height) > 1600 ? "4K" : "2K";
      body = buildOutpaintRequest({ model, base64:prepared.buffer.toString("base64"), prompt:bananaPrompt, ratio:prepared.ratio, imageSize });
    } else {
      const ratio = input?.ratio || nearestRatio(template.width, template.height, sourceSize.width, sourceSize.height);
      if (!ratio) {
        lastError = new ApiError("ratio", "无法选择扩图比例（源图比例与全部候选冲突）");
        continue;
      }
      body = buildOutpaintRequest({ model, base64, prompt, ratio });
    }
    try {
      // 幂等键来自任务+模板+模型+源图：同一逻辑操作重试命中同一任务，不重复扣积分
      const sourceHash = createHash("sha256").update(sourceBuffer).digest("hex").slice(0, 16);
      const requestSignature = model === "rh_image_outpaint"
        ? `${body.top}:${body.left}:${body.right}:${body.bottom}:${body.prompt}`
        : `${body.ratio}:${body.image_size || ""}:${body.prompt}`;
      const idempotencyKey = createHash("sha256").update(`${task.id}:${template.id}:${model}:${sourceAsset.name}:${sourceHash}:${requestSignature}`).digest("hex").slice(0, 32);
      const jobId = await submitGeneration(config, body, { idempotencyKey });
      await pollJob(config, jobId);
      const raw = await downloadRaw(config, jobId);
      const detected = detectImageFormat(raw);
      const parsed = parseImageSize(raw.buffer) || sourceSize;
      let registration;
      const temporary = path.join(runtimeDir, "registration", jobId.replace(/[^a-zA-Z0-9_-]/g, ""));
      await fs.mkdir(temporary, { recursive:true });
      const generatedPath = path.join(temporary, "generated." + detected.format);
      await fs.writeFile(generatedPath, raw.buffer);
      try {
        const { stdout } = await localPython([path.join(root,"scripts","register-outpaint.py"), "--source", safeChild(storageDir,task.id,sourceAsset.bucket,sourceAsset.name), "--generated",generatedPath], {timeout:60000,windowsHide:true,maxBuffer:1024*1024,env:{...process.env,PYTHONIOENCODING:"utf-8"}});
        registration = JSON.parse(stdout);
        if (model === "rh_image_outpaint") {
          const expectedWidth = sourceSize.width + body.left + body.right;
          const expectedHeight = sourceSize.height + body.top + body.bottom;
          const extraX = Math.max(0, parsed.width - expectedWidth) / 2;
          const extraY = Math.max(0, parsed.height - expectedHeight) / 2;
          registration.sourceRect = {
            x:(body.left + extraX) / parsed.width,
            y:(body.top + extraY) / parsed.height,
            width:sourceSize.width / parsed.width,
            height:sourceSize.height / parsed.height,
          };
          registration.method = "rh-exact-pixel-placement-v1";
        }
        if (model === "banana_pro") {
          if (registration.sourceRect.width > nanoPrepared.sourceRect.width * 1.25 || registration.sourceRect.width > .95) {
            throw new ApiError("ignored-extension", "Nano 忽略了待补区域并重新放大原图，当前参数不能安全扩图");
          }
          await assertNanoBlankFilled(raw.buffer, registration.sourceRect);
        }
        const geometry = protectedComposition(template.width,template.height,sourceSize.width,sourceSize.height,job.originalPlacement,registration.sourceRect);
        if (!geometry.covered) throw new Error("扩展范围不足以覆盖当前构图");
      } catch (error) {
        const reason = String(error.stderr || error.message || "未知校验错误").trim().split(/\r?\n/).filter(Boolean).at(-1).slice(0, 500);
        await fs.writeFile(path.join(temporary, "validation-error.json"), JSON.stringify({model, taskId:task.id, templateId:template.id, reason, registration, generatedSize:parsed, time:new Date().toISOString()}, null, 2));
        if (error instanceof ApiError) throw error;
        throw new ApiError("alignment", `${model === "banana_pro" ? "Nano" : "RH"} 扩图校验失败：${reason}。已保留当前画面`);
      }
      const safe = await createSafeOutpaint({
        sourceBuffer,
        generatedBuffer:raw.buffer,
        width:parsed.width,
        height:parsed.height,
        sourceRect:registration.sourceRect,
        preserveEdgeDetail:/纯图|无文案|干净.?kv|clean.?kv|background/i.test(sourceAsset.name),
      });
      registration = { ...registration, sourceRect:safe.sourceRect, safetyMethod:safe.safetyMethod };
      return { model, jobId, registration, buffer:safe.buffer, format:safe.format, mime:safe.mime, width:safe.width, height:safe.height, safetyMethod:safe.safetyMethod };
    } catch (error) {
      lastError = error instanceof ApiError ? error : new ApiError("network", error?.message || "扩图请求失败");
    }
  }
  throw Object.assign(new Error(lastError ? translateApiError(lastError.code, lastError.message) : "扩图失败"), {
    code: lastError instanceof ApiError ? lastError.code : "unknown",
    status: lastError instanceof ApiError ? lastError.status : 502,
  });
}

async function communityGenerationReferences(task, phase, kind) {
  const selected = communityReferenceAssets(task, phase, kind);
  return Promise.all(selected.map(async asset => {
    const buffer = await fs.readFile(safeChild(storageDir,task.id,asset.bucket || 'assets',asset.name));
    const metadata = await sharp(buffer).metadata();
    const factor=Math.max(1,300/Math.max(1,metadata.width),300/Math.max(1,metadata.height));
    return factor>1
      ? sharp(buffer).resize(Math.ceil(metadata.width*factor),Math.ceil(metadata.height*factor)).png().toBuffer()
      : buffer;
  }));
}

async function confirmedCommunityBackgroundSource(task) {
  const master = templateMap.get(task.masterTemplateId);
  const selectedName = task.parameters?.assetByTemplate?.[task.masterTemplateId]?.background;
  const placement = task.parameters?.backgroundByTemplate?.[task.masterTemplateId] || {};
  const asset = task.assets.find(item => item.name === selectedName && item.mime?.startsWith('image/'))
    || task.assets.find(item => item.name === task.primaryAssetName && item.mime?.startsWith('image/'))
    || task.assets.find(item => ['mother-candidate','background','clean-kv'].includes(item.role) && item.mime?.startsWith('image/'));
  if (!master || (!asset && !placement.url)) throw new Error('已确认母版缺少可延展的背景图层');
  let original, assetName = asset?.name || '';
  if (placement.url && Number(placement.pipelineVersion || 0) >= 2) {
    const parts = new URL(placement.url,'http://localhost').pathname.split('/').filter(Boolean).map(decodeURIComponent);
    if (parts.length !== 4 || parts[0] !== 'storage' || parts[1] !== task.id || !['outpaint','assets'].includes(parts[2])) throw new Error('已确认母版的扩图背景来源无效');
    original = await fs.readFile(safeChild(storageDir,task.id,parts[2],parts[3]));
    assetName = parts[3];
  } else {
    original = await fs.readFile(safeChild(storageDir,task.id,asset.bucket || 'assets',asset.name));
  }
  const buffer = await confirmedMasterBackground(original,master.width*2,master.height*2,placement,task.parameters?.background || '#ffffff');
  return {buffer,assetName,masterFingerprint:task.communityMasterApproval?.fingerprint};
}

async function extendConfirmedCommunityBackground(task, run, template, config, source, index) {
  const sourceSize = await sharp(source.buffer).metadata();
  const width = template.width*2, height = template.height*2;
  if (Math.abs(Math.log((width/height)/(sourceSize.width/sourceSize.height))) < .005) {
    return {buffer:await sharp(source.buffer).resize(width,height).png().toBuffer(),modelUsed:'confirmed-master-resize'};
  }
  const placement = communityContainPlacement(sourceSize.width,sourceSize.height,width,height);
  const prepared = await prepareNanoOutpaintInput(source.buffer,width,height,placement);
  const rect = prepared.sourceRect;
  const identity={taskId:task.id,templateId:template.id,sourceMasterFingerprint:source.masterFingerprint,
    sourceSha256:createHash('sha256').update(source.buffer).digest('hex'),model:run.model};
  const validationVersion='community-axis-registration-v2';
  let cached=await readCommunityExtensionCache(runtimeDir,identity);
  const failedCurrent=cached?.record.validation?.status==='failed' && cached.record.validation.version===validationVersion;
  const reusedCache=Boolean(cached && (!failedCurrent || run.reuseCachedOnly));
  if(cached && (cached.record.targetWidth!==width || cached.record.targetHeight!==height))throw new Error('资源位尺寸已变化，缓存不能覆盖当前画面');
  if(!reusedCache){
    if(run.reuseCachedOnly)throw new Error('没有可复用的延展缓存，未重新调用生图服务');
    const bounds = [rect.x,rect.y,rect.width,rect.height].map(value => (value*100).toFixed(2)).join(', ');
    const body = communityImageRequest({model:run.model,prompt:'',template,images:[prepared.buffer],phase:'targets',variant:index+1});
    body.ratio = prepared.ratio;
    body.prompt += `\n【母版保护区域】输入图中非灰色母版的左、上、宽、高百分比为 ${bounds}。必须原位保留这块画面，只在其外侧灰色区域延展同一场景；不可把整幅画重新生成或缩放填满。`;
    const idempotencyKey = createHash('sha256').update(`community-extension:${task.id}:${run.runId}:${template.id}:${identity.sourceSha256}`).digest('hex').slice(0,32);
    const jobId = await submitGeneration(config,body,{idempotencyKey});
    await pollJob(config,jobId);
    const raw = await downloadRaw(config,jobId);
    const detected = detectImageFormat(raw);
    const safeJobId=jobId.replace(/[^a-zA-Z0-9_-]/g,'');
    const temporary=path.join(runtimeDir,'registration',safeJobId);
    await fs.mkdir(temporary,{recursive:true});
    await Promise.all([fs.writeFile(path.join(temporary,'confirmed-master.png'),source.buffer),fs.writeFile(path.join(temporary,`extended.${detected.format}`),raw.buffer)]);
    cached=await writeCommunityExtensionCache(runtimeDir,identity,{jobId:safeJobId,format:detected.format,preparedSourceRect:rect,
      sourceWidth:sourceSize.width,sourceHeight:sourceSize.height,targetWidth:width,targetHeight:height});
  }
  const {sourcePath,generatedPath,buffer:rawBuffer}=cached;
  let registration,protectedImage;
  try {
    const {stdout} = await localPython([path.join(root,'scripts','register-outpaint.py'),'--source',sourcePath,'--generated',generatedPath,'--allow-axis-scale'],{timeout:60000,windowsHide:true,maxBuffer:1024*1024,env:{...process.env,PYTHONIOENCODING:'utf-8'}});
    registration = JSON.parse(stdout);
    if (registration.sourceRect.width > rect.width*1.25 || registration.sourceRect.height > rect.height*1.25) throw new Error('AI 放大了母版画面，没有按要求延展边缘');
    await assertNanoBlankFilled(rawBuffer,registration.sourceRect);
    protectedImage=await composeCommunityExtension(source.buffer,rawBuffer,registration.sourceRect,width,height);
  } catch (error) {
    const reason=String(error.stderr || error.message).trim().split(/\r?\n/).at(-1).replace(/^ValueError:\s*/,'');
    await writeCommunityExtensionCache(runtimeDir,identity,{...cached.record,validation:{version:validationVersion,status:'failed',reason:reason.slice(0,500)}}).catch(()=>{});
    throw new Error(`延展背景与母版未通过位置校验，已保留当前尺寸：${reason}`);
  }
  await writeCommunityExtensionCache(runtimeDir,identity,{...cached.record,validation:{version:validationVersion,status:'passed'}});
  return {buffer:protectedImage.buffer,modelUsed:run.model,reusedCache,jobId:cached.record.jobId,registration};
}

async function runCommunityGeneration(taskId, runId) {
  try {
    const initial = (await readJson(tasksFile)).find(task => task.id === taskId);
    if (!initial || initial.communityGeneration?.runId !== runId) return;
    const run = initial.communityGeneration;
    const config=run.phase==='targets' && run.reuseCachedOnly?null:await loadAiHuabuConfig(initial);
    if (config?.enabled === false) throw new Error('画布平台当前未启用');
    const targetIds = run.phase === 'targets'
      ? (run.targetTemplateIds || initial.targetTemplateIds.filter(id => id !== initial.masterTemplateId))
      : run.phase === 'typography' ? [] : Array.from({length:run.backgroundCount},(_,index) => `${initial.masterTemplateId}:${index + 1}`);
    const confirmedSource = run.phase === 'targets' ? await confirmedCommunityBackgroundSource(initial) : null;
    const references = targetIds.length && run.phase !== 'targets' ? await communityGenerationReferences(initial,run.phase) : [];
    const referenceAssets = communityReferenceAssets(initial,run.phase);
    // Palette follows the numbered designer brief, not old upload categories.
    const referenceTone = null;
    const wholeMaster=initial.parameters?.communityArtworkByTemplate?.[initial.masterTemplateId];
    for (let index = 0; index < targetIds.length; index++) {
      const current = (await readJson(tasksFile)).find(task => task.id === taskId);
      if (!current || current.communityGeneration?.runId !== runId) return;
      if (confirmedSource && current.communityMasterApproval?.fingerprint !== confirmedSource.masterFingerprint) throw new Error('确认母版已变化，已停止其它尺寸延展');
      const template = templateMap.get(run.phase === 'targets' ? targetIds[index] : current.masterTemplateId);
      if (!template) continue;
      try {
        let buffer, modelUsed, extensionDetails,wholeTarget;
        if(run.phase==='targets' && wholeMaster){
          if(run.reuseCachedOnly)throw new Error('整稿尺寸重排尚无可复用的成稿，请重新提交此尺寸');
          wholeTarget=prepareCommunityArtwork(current,{mode:'adapt',model:run.model,expectedUpdatedAt:current.updatedAt},template,{logoAspect:current.parameters.layoutByTemplate?.[current.masterTemplateId]?.logo?.width/Math.max(1,current.parameters.layoutByTemplate?.[current.masterTemplateId]?.logo?.height) || 3});
          if(!template.brandLogo)wholeTarget.logo=null;
          wholeTarget.runId=runId;
          const body=communityArtworkRequest({run:wholeTarget,template,current:confirmedSource.buffer});
          const idempotencyKey=createHash('sha256').update(`community-artwork-target:${taskId}:${runId}:${template.id}`).digest('hex').slice(0,32);
          const jobId=await submitGeneration(config,body,{idempotencyKey});
          await pollJob(config,jobId);const raw=await downloadRaw(config,jobId);
          const directory=safeChild(storageDir,taskId,'banner-generation',runId);await fs.mkdir(directory,{recursive:true});
          await fs.writeFile(safeChild(directory,`${template.id}.${detectImageFormat(raw).format}`),raw.buffer);
          buffer=await fitCommunityArtwork(raw.buffer,template);modelUsed=run.model;extensionDetails={sourceJobId:jobId,artworkMode:'whole-artwork'};
        }else if (run.phase === 'targets') {
          const extended = await extendConfirmedCommunityBackground(current,run,template,config,confirmedSource,index);
          buffer = extended.buffer;
          modelUsed = extended.modelUsed;
          extensionDetails={sourceJobId:extended.jobId,registration:extended.registration,reusedRaw:extended.reusedCache};
        } else {
          const body = communityImageRequest({model:run.model,prompt:run.prompt,template,images:references,imageRoles:referenceAssets.map(asset=>asset.role),phase:run.phase,variant:index+1,toneGuide:communityToneGuide(referenceTone)});
          const idempotencyKey = createHash('sha256').update(`community-ai:${taskId}:${runId}:${targetIds[index]}`).digest('hex').slice(0,32);
          const jobId = await submitGeneration(config,body,{idempotencyKey});
          await pollJob(config,jobId);
          const raw = await downloadRaw(config,jobId);
          buffer = await sharp(raw.buffer).resize(template.width*2,template.height*2,{fit:'cover',position:'centre'}).png().toBuffer();
          modelUsed = run.model;
        }
        const name = sanitizeFileName(`画布-${run.phase === 'targets' ? 'extension' : run.phase}-${template.id}-${runId.slice(0,8)}-${index+1}.png`);
        const directory = safeChild(storageDir,taskId,'assets');
        await fs.mkdir(directory,{recursive:true});
        await fs.writeFile(safeChild(directory,name),buffer);
        const toneIssues = run.phase === 'master' || run.phase === 'background'
          ? assessCommunityTone(referenceTone, await analyzeCommunityTone(buffer)) : [];
        const tasks = await readJson(tasksFile);
        const task = tasks.find(item => item.id === taskId);
        if (!task || task.communityGeneration?.runId !== runId) return;
        if(confirmedSource && task.communityMasterApproval?.fingerprint!==confirmedSource.masterFingerprint)throw new Error('确认母版已变化，结果未覆盖当前画面');
        const now = new Date().toISOString();
        const asset = {name,mime:'image/png',bytes:buffer.length,url:`/storage/${encodeURIComponent(taskId)}/assets/${encodeURIComponent(name)}`,role:run.phase==='master'||run.phase==='background'?'mother-candidate':'generated-background',generatorModel:modelUsed,sourceTemplateId:template.id,createdAt:now,...(referenceTone ? {toneIssues} : {}),
          ...(confirmedSource ? {extensionMode:wholeTarget?'confirmed-artwork-reflow-v1':'confirmed-master-outpaint-v2',sourceBackgroundName:confirmedSource.assetName,sourceMasterFingerprint:confirmedSource.masterFingerprint,...extensionDetails} : {})};
        task.assets.push(asset);
        if ((run.phase === 'master' || run.phase === 'background') && !toneIssues.length && !task.parameters?.assetByTemplate?.[template.id]?.background) {
          task.parameters ||= {};
          task.parameters.assetByTemplate ||= {};
          task.parameters.assetByTemplate[template.id] ||= {};
          task.parameters.assetByTemplate[template.id].background = name;
          task.communityMasterApproval = null;
          invalidateTaskArtifacts(task, '选用画布生成的母版背景');
        }
        if (run.phase === 'targets') {
          if(wholeTarget)bindCommunityArtwork(task,{run:wholeTarget,asset,templateId:template.id});
          task.parameters ||= {};
          task.parameters.assetByTemplate ||= {};
          task.parameters.assetByTemplate[template.id] ||= {};
          task.parameters.assetByTemplate[template.id].background = name;
          task.parameters.backgroundByTemplate ||= {};
          task.parameters.backgroundByTemplate[template.id] = {focalX:50,focalY:50,scale:100,smartExpand:false,url:''};
          invalidateTaskArtifacts(task,`按确认母版延展 ${template.name} 背景`);
        }
        task.communityGeneration.done += 1;
        task.updatedAt = now;
        await writeJson(tasksFile,tasks);
      } catch (error) {
        const tasks = await readJson(tasksFile);
        const task = tasks.find(item => item.id === taskId);
        if (!task || task.communityGeneration?.runId !== runId) return;
        task.communityGeneration.errors ||= [];
        task.communityGeneration.errors.push(`${template.name}：${error.message}`);
        task.updatedAt = new Date().toISOString();
        await writeJson(tasksFile,tasks);
      }
    }
    if (run.phase === 'master' || run.phase === 'typography') {
      for (const kind of ['title','subtitle']) {
        const current = (await readJson(tasksFile)).find(task => task.id === taskId);
        if (!current || current.communityGeneration?.runId !== runId) return;
        const copy = kind === 'title' ? current.copy : current.parameters?.subtitleText;
        if (!String(copy || '').trim()) continue;
        try {
          const template = templateMap.get(current.masterTemplateId);
          const textReferences = await communityGenerationReferences(current,'typography',kind);
          const body = communityTypographyRequest({kind,text:copy,template,images:textReferences,imageRoles:communityReferenceAssets(current,'typography',kind).map(asset=>asset.role),direction:run.prompt || current.parameters?.communityImagePrompt,copyReference:current.parameters?.communityCopyReference,companionText:kind==='title'?current.parameters?.subtitleText:current.copy,layout:current.parameters?.layoutByTemplate?.[template.id]?.[kind]});
          const idempotencyKey = createHash('sha256').update(`community-type:${taskId}:${runId}:${kind}`).digest('hex').slice(0,32);
          const jobId = await submitGeneration(config,body,{idempotencyKey});
          await pollJob(config,jobId);
          const raw = await downloadRaw(config,jobId);
          const raster = await sharp(raw.buffer).ensureAlpha().raw().toBuffer({resolveWithObject:true});
          let transparent = 0;
          for (let i=3;i<raster.data.length;i+=4) if (raster.data[i]<240) transparent++;
          if (transparent < raster.info.width*raster.info.height*.02) throw new Error('生成结果缺少透明区域，未覆盖现有文案图层');
          const buffer = await sharp(raw.buffer).trim({background:'#00000000',threshold:5}).png().toBuffer();
          const name = sanitizeFileName(`画布-${kind}-${runId.slice(0,8)}.png`);
          const directory = safeChild(storageDir,taskId,'assets');
          await fs.mkdir(directory,{recursive:true});
          await fs.writeFile(safeChild(directory,name),buffer);
          const tasks = await readJson(tasksFile);
          const task = tasks.find(item => item.id === taskId);
          if (!task || task.communityGeneration?.runId !== runId) return;
          const now = new Date().toISOString();
          task.assets.push({name,mime:'image/png',bytes:buffer.length,url:`/storage/${encodeURIComponent(taskId)}/assets/${encodeURIComponent(name)}`,role:kind,generatorModel:communityImageModels.image,sourceTemplateId:template.id,createdAt:now});
          task.parameters ||= {};
          task.parameters.assetByTemplate ||= {};
          for (const id of task.targetTemplateIds) {
            if (!templateMap.get(id)?.communityPlacement) continue;
            task.parameters.assetByTemplate[id] ||= {};
            task.parameters.assetByTemplate[id][kind] = name;
          }
          task.communityMasterApproval = null;
          invalidateTaskArtifacts(task,`画布根据参考重做${kind === 'title' ? '主文案' : '副文案'}图层`);
          task.communityGeneration.done += 1;
          task.updatedAt = now;
          await writeJson(tasksFile,tasks);
        } catch (error) {
          const tasks = await readJson(tasksFile);
          const task = tasks.find(item => item.id === taskId);
          if (!task || task.communityGeneration?.runId !== runId) return;
          task.communityGeneration.errors ||= [];
          task.communityGeneration.errors.push(`${kind === 'title' ? '主文案' : '副文案'}：${error.message}`);
          task.updatedAt = new Date().toISOString();
          await writeJson(tasksFile,tasks);
        }
      }
    }
    const tasks = await readJson(tasksFile);
    const task = tasks.find(item => item.id === taskId);
    if (task?.communityGeneration?.runId === runId) {
      task.communityGeneration.status = task.communityGeneration.errors?.length ? 'partial' : 'done';
      if (run.phase === 'targets') reconcileCommunityTargetExtension(task);
      task.communityGeneration.completedAt = new Date().toISOString();
      task.updatedAt = task.communityGeneration.completedAt;
      task.history.push({at:task.updatedAt,action:`画布 ${run.model} ${run.phase==='master'?'生成母版背景与文案图层':run.phase==='typography'?'重做文案图层':run.phase==='background'?'重做母版背景':'重构目标尺寸'}：成功 ${task.communityGeneration.done}/${task.communityGeneration.total}`,by:'设计师',status:task.status});
      await writeJson(tasksFile,tasks);
    }
  } catch (error) {
    const tasks = await readJson(tasksFile);
    const task = tasks.find(item => item.id === taskId);
    if (task?.communityGeneration?.runId === runId) {
      task.communityGeneration.status = 'failed';
      task.communityGeneration.error = error.message;
      task.updatedAt = new Date().toISOString();
      await writeJson(tasksFile,tasks);
    }
  } finally { communityGenerationJobs.delete(taskId); }
}

async function runCommunityBanner(taskId,runId,inputs) {
  try {
    const first=(await readJson(tasksFile)).find(t=>t.id===taskId);
    if(first?.communityGeneration?.runId!==runId)return;
    const run=first.communityGeneration;
    const config=run.aiKinds.length?await loadAiHuabuConfig(first):null;
    if(config?.enabled===false)throw new Error('画布服务当前未启用，已保留原母版');
    let canvasId=run.canvasId;
    if(config&&!canvasId){
      canvasId=await createCanvas(config,{title:`${first.project || '社区外媒'} 母版创作`});
      const tasks=await readJson(tasksFile),task=tasks.find(t=>t.id===taskId);
      if(task?.communityGeneration?.runId!==runId)throw new Error('本次母版任务已结束');
      task.communityGeneration.canvasId=canvasId;await writeJson(tasksFile,tasks);
    }
    const template=templateMap.get(first.masterTemplateId);
    let runWrites=Promise.resolve();
    const updateRun=mutate=>{
      const operation=runWrites.then(async()=>{
        const tasks=await readJson(tasksFile),task=tasks.find(t=>t.id===taskId);
        if(task?.communityGeneration?.runId!==runId)throw new Error('本次母版任务已结束');
        mutate(task.communityGeneration);await writeJson(tasksFile,tasks);
      });
      runWrites=operation.catch(()=>{});return operation;
    };
    const updateStage=stage=>updateRun(job=>{job.stage=stage;job.done=Math.min(job.total-1,(job.done || 0)+1)});
    const result=run.aiKinds.length?await runBannerDesign({mode:run.mode,prompt:run.prompt,template,model:run.model,affectedKinds:run.aiKinds,
      inputs:{...inputs,layouts:run.layouts,includeBacking:run.includeBacking,titleFont:run.titleFont,titleDesignTheme:run.titleDesignTheme,copy:first.copy,subtitle:first.parameters?.subtitleText || ''},
      onProgress:updateStage,
      generate:async(body,{stage})=>{
        const current=(await readJson(tasksFile)).find(t=>t.id===taskId);
        if(current?.communityGeneration?.runId!==runId || bannerSourceToken(current)!==run.sourceToken)throw new Error('母版已变化，停止本次生成，保留当前画面');
        const idempotencyKey=createHash('sha256').update(`banner:${taskId}:${runId}:${stage}`).digest('hex').slice(0,32);
        const jobId=await submitGeneration(config,{...body,canvas_id:canvasId},{idempotencyKey});
        await updateRun(job=>{job.providerJobs ||={};job.providerJobs[stage]={jobId,canvasId,idempotencyKey,submittedAt:new Date().toISOString()}});
        await pollJob(config,jobId);
        const raw=await downloadRaw(config,jobId),format=detectImageFormat(raw).format;
        const directory=safeChild(storageDir,taskId,'banner-generation',runId);await fs.mkdir(directory,{recursive:true});
        await fs.writeFile(safeChild(directory,`${stage}.${format}`),raw.buffer);
        await updateRun(job=>{Object.assign(job.providerJobs[stage],{completedAt:new Date().toISOString(),rawFile:`${stage}.${format}`})});
        return raw.buffer;
      }}):{layers:[],designPreview:null,stages:[]};
    const directory=safeChild(storageDir,taskId,'assets');await fs.mkdir(directory,{recursive:true});
    const assets=[],bindings={};
    for(const layer of result.layers){
      const name=sanitizeFileName(`母版-${layer.kind}-${runId.slice(0,8)}.png`);
      await fs.writeFile(safeChild(directory,name),layer.buffer);
      assets.push({name,mime:'image/png',bytes:layer.buffer.length,url:`/storage/${taskId}/assets/${encodeURIComponent(name)}`,
        role:layer.kind==='background'?'mother-candidate':layer.kind,sourceTemplateId:template.id,generatorModel:run.model,
          bannerVersionId:runId,...(layer.fontProvenance?{fontProvenance:layer.fontProvenance}:{}),...(layer.kind==='background'&&result.sceneCharacters?{sceneCharacters:result.sceneCharacters}:{}),createdAt:new Date().toISOString()});
      if(layer.kind==='subtitle-backing'){
        let rect=run.layouts['subtitle-backing'];
        if(!rect)throw new Error('副标底板缺少独立图层布局');
        rect=run.layouts['subtitle-backing']=fitBannerBackingArtwork(rect,await sharp(layer.buffer).metadata(),template);
        rect.visible=true;rect.backing={enabled:true,shape:'rect',fill:'#fff1d8',opacity:100,radius:0,assetName:name};
        const content=await measureBannerBackingContent(layer.buffer);
        rect.backing.contentRect=content;
        if(run.mode==='design'){
          run.layouts.subtitle=centerSubtitleInBacking(run.layouts.subtitle,rect,content);
          if(layer.suggestedTextColor)run.layouts.subtitle.textColor=layer.suggestedTextColor;
        }else if(run.layouts.subtitle.align==='center'){
          const sub=run.layouts.subtitle;
          rect.x=sub.x+sub.width/2-(content.x+content.width/2)*rect.width;
          rect.y=sub.y+sub.height/2-(content.y+content.height/2)*rect.height;
        }
      }else bindings[layer.kind]=name;
    }
    if(inputs.titleMask && bindings.title){
      const name=`母版-字形-${runId.slice(0,8)}.png`;
      await fs.writeFile(safeChild(directory,name),inputs.titleMask);
      assets.push({name,mime:'image/png',bytes:inputs.titleMask.length,url:`/storage/${taskId}/assets/${encodeURIComponent(name)}`,role:'title-glyph-source',fontId:run.titleFont.id,sha256:run.titleFont.sha256,bannerVersionId:runId});
      assets.find(a=>a.name===bindings.title).glyphSourceName=name;
    }
    if(run.aiKinds.includes('subtitle-backing'))await resolveBannerBackingFollow(run,{readBacking:name=>fs.readFile(safeChild(directory,name))});
    const tasks=await readJson(tasksFile),task=tasks.find(t=>t.id===taskId);
    if(task?.communityGeneration?.runId!==runId)return;
    commitBannerDesign(task,{run,assets,bindings});
    if(task.status==='草稿')task.status='主图制作';
    task.communityGeneration={...task.communityGeneration,status:'done',stage:'ready',done:run.total,completedAt:task.updatedAt};
    invalidateTaskArtifacts(task,run.mode==='edit'?'按文字要求修改当前母版':'生成完整可编辑母版');
    task.history.push({at:task.updatedAt,action:`${run.mode==='edit'?'修改当前母版':'生成完整母版'}：${run.prompt}`,by:'设计师',status:task.status});
    await writeJson(tasksFile,tasks);
  }catch(error){
    const tasks=await readJson(tasksFile),task=tasks.find(t=>t.id===taskId);
    if(task?.communityGeneration?.runId===runId){
      const message=/Input buffer contains unsupported image format|corrupt header|invalid png/i.test(error.message)?'AI 返回的图片无法读取，本次修改未应用，原母版已保留。':error.message;
      task.communityGeneration={...task.communityGeneration,status:'failed',error:message,completedAt:new Date().toISOString()};
      await writeJson(tasksFile,tasks);
    }
  }finally{communityGenerationJobs.delete(taskId);}
}

async function runCommunityArtwork(taskId,runId,inputs){
  const update=mutate=>mutateJson(tasksFile,async tasks=>{
    const task=tasks.find(t=>t.id===taskId);
    if(task?.communityGeneration?.runId!==runId)throw new Error('整稿任务已结束');
    mutate(task);return task;
  });
  try{
    const initial=(await readJson(tasksFile)).find(t=>t.id===taskId),run=initial.communityGeneration,template=templateMap.get(run.templateId);
    let raw;
    if(inputs.resume){
      const file=run.providerJobs?.artwork?.rawFile;
      if(!/^artwork\.(png|jpg|jpeg|webp)$/.test(file || ''))throw new Error('没有可恢复的整稿原图');
      raw={buffer:await fs.readFile(safeChild(storageDir,taskId,'banner-generation',runId,file))};
    }else{
    const config=await loadAiHuabuConfig(initial);if(config.enabled===false)throw new Error('画布服务未启用');
    const canvasId=await createCanvas(config,{title:`${initial.project} 整稿设计`});
    await update(task=>{task.communityGeneration.canvasId=canvasId;task.communityGeneration.stage='artwork'});
    const body=communityArtworkRequest({run,template,...inputs});
    const idempotencyKey=createHash('sha256').update(`community-artwork:${taskId}:${runId}`).digest('hex').slice(0,32);
    const jobId=await submitGeneration(config,{...body,canvas_id:canvasId},{idempotencyKey});
    await update(task=>{task.communityGeneration.providerJobs={artwork:{jobId,canvasId,idempotencyKey,submittedAt:new Date().toISOString()}}});
    await pollJob(config,jobId);raw=await downloadRaw(config,jobId);
    const directory=safeChild(storageDir,taskId,'banner-generation',runId);await fs.mkdir(directory,{recursive:true});
    const rawFile=`artwork.${detectImageFormat(raw).format}`;await fs.writeFile(safeChild(directory,rawFile),raw.buffer);
    await update(task=>Object.assign(task.communityGeneration.providerJobs.artwork,{rawFile,completedAt:new Date().toISOString()}));
    }
    const buffer=await fitCommunityArtwork(raw.buffer,template),name=`${run.mode==='adapt'?`尺寸重排-${template.width}x${template.height}`:'整稿母版'}-${runId.slice(0,8)}.png`;
    const assetDir=safeChild(storageDir,taskId,'assets');await fs.mkdir(assetDir,{recursive:true});await fs.writeFile(safeChild(assetDir,name),buffer);
    await update(task=>{
      const now=new Date().toISOString(),asset={name,mime:'image/png',bytes:buffer.length,url:`/storage/${taskId}/assets/${encodeURIComponent(name)}`,role:run.mode==='adapt'?'generated-background':'mother-candidate',sourceTemplateId:template.id,generatorModel:run.model,bannerVersionId:runId,artworkMode:'whole-artwork',createdAt:now,...(run.mode==='adapt'?{sourceBackgroundName:run.sourceArtworkName,sourceArtworkRunId:run.sourceArtworkRunId,extensionMode:'artwork-size-reflow-v1'}:{})};
      const {applied}=saveCommunityArtwork(task,{run,asset},{now});
      task.communityGeneration={...task.communityGeneration,status:applied?'done':'candidate-ready',stage:'ready',done:1,total:1,completedAt:now};
      if(applied){if(task.status==='草稿')task.status='主图制作';invalidateTaskArtifacts(task,run.mode==='adapt'?'按母版生成当前尺寸试稿':'AI整稿设计，待确认母版');}
      task.history.push({at:now,action:`${applied?run.mode==='adapt'?'按母版重排当前尺寸':'生成整稿母版':'已保存整稿方案，当前修改保留'}：${run.prompt}`,by:'设计师',status:task.status});
    });
  }catch(error){
    await update(task=>{task.communityGeneration={...task.communityGeneration,status:'failed',error:error.message,completedAt:new Date().toISOString()}}).catch(()=>{});
  }finally{communityGenerationJobs.delete(taskId);}
}

async function routeApi(req, res, url) {
  const taskMutation = /^\/api\/tasks\/([a-f0-9-]{36})(?:\/|$)/i.exec(url.pathname);
  const recycleDelete=taskMutation&&req.method==='DELETE'&&url.pathname===`/api/tasks/${taskMutation[1]}`;
  if(taskMutation&&recycleBin.isTaskHidden(`core:${taskMutation[1]}`)&&!recycleDelete)return json(res,410,{error:'任务已移至回收站，请恢复后再使用'});
  if (taskMutation && !recycleDelete && !['GET', 'HEAD'].includes(req.method) && url.pathname !== `/api/tasks/${taskMutation[1]}/start-revision`) {
    const task = (await readJson(tasksFile)).find(item => item.id === taskMutation[1]);
    if (task?.status === '已完成' && task.deliveredPackage && url.pathname !== `/api/tasks/${task.id}/confirm-materials-package`) {
      return json(res, 409, { error: '该任务已成套下载并完成；如需修改，请先点击“开始新版本”' });
    }
    if(isSourceAdaptation(task)&&/\/(community-generate|community-materials(?:\/(?:resume|select|cleanup|typeset))?|community-compose|community-typeset|community-import-master|community-artwork-apply|community-artwork-resume|community-design-restore|community-extension-repair|community-master-workspace|approve-community-master|reflow-community-targets|community-target-reflow|community-target-resume|community-target-sync|community-popup|community-objects\/[^/]+|local-ai\/[^/]+|outpaint(?:\/[^/]+)?)$/.test(url.pathname))return json(res,409,{error:'当前是源文件适配任务，请使用源稿确认与尺寸适配；重新设计请新建“制作主图”任务。'});
  }
  if(url.pathname==='/api/source-clipboard'&&req.method==='POST')return json(res,200,await sourceClipboard.read(req));
  const quickUpload=matchRoute(url.pathname,'/api/tasks/:id/assets/source-upload');
  if(quickUpload&&req.method==='POST')return json(res,201,publicTask(await uploadQuickSource(quickUpload.id,req,{name:url.searchParams.get('name'),expectedUpdatedAt:url.searchParams.get('expectedUpdatedAt')})));
  const clipboardUpload=matchRoute(url.pathname,'/api/tasks/:id/assets/source-clipboard');
  if(clipboardUpload&&req.method==='POST'){
   const input=await readBody(req),file=await sourceClipboard.open(req,input.ticket);
   try{return json(res,201,publicTask(await uploadQuickSource(clipboardUpload.id,file.stream,{name:file.name,expectedUpdatedAt:input.expectedUpdatedAt})));}finally{file.close();}
  }
  const canvasMaterialMatch=matchRoute(url.pathname,'/api/tasks/:id/community-canvas-materials');
  if(canvasMaterialMatch&&req.method==='POST')return json(res,201,publicTask(await communityCanvasMaterials(canvasMaterialMatch.id,await readBody(req))));
  const popupButtonMatch=matchRoute(url.pathname,'/api/tasks/:id/source-popup-button');
  if(popupButtonMatch&&req.method==='POST'){const input=await readBody(req);if(!['generate','resume'].includes(input.action))return json(res,422,{error:'按钮操作无效'});return json(res,202,publicTask(await sourcePopupButtons[input.action==='resume'?'resume':'submit'](popupButtonMatch.id,input)));}
  const sourceMatch=matchRoute(url.pathname,'/api/tasks/:id/source-adaptation');
  if(sourceMatch&&req.method==='POST')return json(res,200,publicTask(await sourceAdaptation(sourceMatch.id,await readBody(req))));
  const sourceUploadMatch=matchRoute(url.pathname,'/api/tasks/:id/source-file');
  if(sourceUploadMatch&&req.method==='POST')return json(res,201,publicTask(await sourceAdaptation.upload(sourceUploadMatch.id,req,{name:url.searchParams.get('name'),expectedUpdatedAt:url.searchParams.get('expectedUpdatedAt')})));
  const materialMatch=/^\/api\/tasks\/([a-f0-9-]{36})\/community-materials(?:\/(select|resume|download|remove|cleanup|typeset))?$/.exec(url.pathname);
  if(await communityObjects.handle(req,res,url))return;
  if(materialMatch){
    const [,id,action]=materialMatch;
    try{
      if(req.method==='POST'&&!action)return json(res,202,publicTask(await communityMaterials.submit(id,await readBody(req))));
      if(req.method==='POST'&&action==='resume')return json(res,202,publicTask(await communityMaterials.resume(id)));
      if(req.method==='POST'&&action==='cleanup')return json(res,201,publicTask(await communityTextCleanup.save(id,await readBody(req))));
      if(req.method==='POST'&&action==='typeset')return json(res,201,publicTask(await communityFontTypesetting.save(id,await readBody(req))));
      if(req.method==='POST'&&action==='remove'){
        const input=await readBody(req),saved=await mutateJson(tasksFile,tasks=>{
          const task=tasks.find(t=>t.id===id);if(!task)throw Object.assign(Error('任务不存在'),{status:404});
          if(communityGenerationJobs.has(id)||task.communityGeneration?.status==='running'||task.outpaint?.status==='running')throw Object.assign(Error('请等待当前生成完成后再移除素材'),{status:409});
          const result=removeCommunityMaterial(task,input,templateMap.get(task.masterTemplateId));if(result.masterChanged)invalidateTaskArtifacts(task,'移除母版素材，待确认母版');return task;
        });return json(res,200,publicTask(saved));
      }
      if(req.method==='POST'&&action==='select'){
        const input=await readBody(req),saved=await mutateJson(tasksFile,async tasks=>{
          const task=tasks.find(t=>t.id===id);if(!task)throw Object.assign(Error('任务不存在'),{status:404});
          if(communityGenerationJobs.has(id)||task.communityGeneration?.status==='running'||task.outpaint?.status==='running')throw Object.assign(Error('请等待当前生成完成后再切换素材'),{status:409});
          const asset=task.assets.find(a=>a.name===input.name);if(asset&&(!asset.width||!asset.height)){const meta=await sharp(await fs.readFile(safeChild(storageDir,id,asset.bucket||'assets',asset.name))).metadata();asset.width=meta.width;asset.height=meta.height;}
          selectCommunityMaterial(task,input,templateMap.get(task.masterTemplateId));invalidateTaskArtifacts(task,'选择独立素材，待确认母版');return task;
        });return json(res,200,publicTask(saved));
      }
      if(req.method==='GET'&&action==='download'){
        const task=(await readJson(tasksFile)).find(t=>t.id===id);if(!task)return json(res,404,{error:'任务不存在'});
        const assets=task.assets.filter(a=>['illustration','title','subtitle','logo'].includes(materialKind(a))&&!a.libraryDeletedAt);
        const files=await Promise.all(assets.map(async a=>({name:`${materialKind(a)}/${a.name}`,data:await fs.readFile(safeChild(storageDir,id,a.bucket||'assets',a.name))})));
        if(task.communityObjects||url.searchParams.get('includeObjects')==='1')files.push(...await communityObjects.downloadFiles(task));
        files.push({name:'母版布局.json',data:Buffer.from(JSON.stringify({copy:task.copy,subtitle:task.parameters?.subtitleText,templateId:task.masterTemplateId,layout:task.parameters?.layoutByTemplate?.[task.masterTemplateId],assets:task.parameters?.assetByTemplate?.[task.masterTemplateId],objectLayers:task.parameters?.communityObjectLayersByTemplate?.[task.masterTemplateId]||[]},null,2))});
        const zip=createStoreZip(files);res.writeHead(200,{'Content-Type':'application/zip','Content-Length':zip.length,'Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(task.project+'_独立素材.zip')}`});return res.end(zip);
      }
      return json(res,405,{error:'不支持的素材操作'});
    }catch(error){return json(res,error.status||422,{error:error.message});}
  }
  const scopedReferenceMatch=matchRoute(url.pathname,'/api/tasks/:id/community-material-references');
  const scopedReferenceRemove=matchRoute(url.pathname,'/api/tasks/:id/community-material-references/:name');
  if(scopedReferenceMatch&&req.method==='POST'||scopedReferenceRemove&&req.method==='DELETE'){
    try{
      const id=(scopedReferenceMatch||scopedReferenceRemove).id,input=await readBody(req);assertReferenceScope(input.scope);
      const saved=await mutateJson(tasksFile,async tasks=>{
        const task=tasks.find(t=>t.id===id);if(!task)throw Object.assign(Error('任务不存在'),{status:404});
        if(!templateMap.get(task.masterTemplateId)?.communityMaster)throw Error('请在素材生成页面管理参考图');
        if(communityGenerationJobs.has(id)||task.communityGeneration?.status==='running'||task.outpaint?.status==='running')throw Object.assign(Error('请等待当前生成完成后再调整参考图'),{status:409});
        if(input.expectedUpdatedAt!==task.updatedAt)throw Object.assign(Error('参考图已更新，请刷新后再操作'),{status:409});
        if(scopedReferenceRemove){removeCommunityMaterialReference(task,{...input,name:scopedReferenceRemove.name});return task;}
        if(!Array.isArray(input.files)||!input.files.length||input.files.length>20)throw Error('请选择参考图片');
        const assets=[];
        for(const file of input.files){
          const {mime}=decodeDataUrl(file.dataUrl);if(!['image/png','image/jpeg','image/webp'].includes(mime))throw Error('参考图需要 PNG、JPG 或 WebP 图片');
          let name=sanitizeFileName(file.name);if(task.assets.some(a=>a.name===name)||assets.some(a=>a.name===name))name=`${randomUUID()}-${name}`;
          const asset=await saveDataFile(id,'assets',name,file.dataUrl);assets.push({...asset,role:'reference-image',referenceScope:input.scope,createdAt:new Date().toISOString()});
        }
        addCommunityMaterialReferences(task,{scope:input.scope,assets,expectedUpdatedAt:input.expectedUpdatedAt});
        task.communityMasterApproval=null;invalidateTaskArtifacts(task,'上传生成参考图');return task;
      });return json(res,scopedReferenceMatch?201:200,publicTask(saved));
    }catch(error){return json(res,error.status||422,{error:error.message});}
  }
  if(url.pathname === '/api/workbench/task-names') {
    try{
      if(req.method==='GET')return json(res,200,await workbenchTaskNames.read());
      if(req.method==='PUT')return json(res,200,await workbenchTaskNames.rename(await readBody(req)));
      return json(res,405,{error:'不支持的任务名称操作'});
    }catch(error){return json(res,error.status||422,{error:error.message});}
  }
  if(url.pathname === '/api/workbench/project-links') {
    if(req.method === 'GET') return json(res,200,await workbenchProjectLinkStore.read());
    if(req.method === 'PUT') {
      const input=await readBody(req);
      try{return json(res,200,await workbenchProjectLinkStore.assign(input));}
      catch(error){if(error.status)return json(res,error.status,{error:error.message});throw error;}
    }
  }

  if (req.method === "GET" && url.pathname === "/api/bootstrap") {
    const [tasks, brands, jobs, categories, references, specifications, businessLines, projects, resourceProfiles, localAi, aiHuabu] = await Promise.all([readJson(tasksFile), readJson(brandsFile), readJson(jobsFile), readJson(categoriesFile), readJson(referencesFile), readJson(specificationsFile), readJson(businessLinesFile), readJson(projectsFile), readJson(resourceProfilesFile), localAiStatus(), aiHuabuStatus()]);
    return json(res, 200, {
      templates,
      brands,
      tasks: tasks.filter(task=>!recycleBin.isTaskHidden(`core:${task.id}`)).map((task) => publicTask(normalizeTask(task))),
      categories: categories.sort((a, b) => a.order - b.order),
      references,
      specifications,
      businessLines: businessLines.sort((a, b) => a.order - b.order).map((line) => ({ ...line, segments: [...(line.segments || [])].sort((a, b) => a.order - b.order) })),
      projects,
      resourceProfiles: templates.map((template) => resourceProfile(template, resourceProfiles)),
      jobs,
      states: TASK_STATES,
      transitions: TRANSITIONS,
      resourceRules,
      psdBaseline,
      psdLayoutRules,
      kvSourcePack,
      localAi,
      aiHuabu,
      privacy: {
        externalAiAllowed: true,
        message: "已允许按任务将素材发送至外部AI；每次调用必须显示模型、用途和记录",
        policy: "explicit-per-task",
        approvedModels: [
          { id: "qwen_2511", name: "Qwen-Edit 2511", purpose: "参考图编辑、局部重构", points: 15, channel: "公司AI平台 / ComfyUI" },
          { id: "banana2", name: "Nano Banana 2", purpose: "多参考画面重构与扩图", points: 2, channel: "公司AI平台 / 外部模型" },
          { id: "gpt-image-2", name: "GPT-Image2", purpose: "高一致性编辑与补画", points: 2, channel: "公司AI平台 / 外部模型" },
          { id: "rh_image_outpaint", name: "RH 扩图", purpose: "背景扩图（按上下左右像素）", points: 2, channel: "公司AI平台 / 画布" },
          { id: "tx_image_outpaint", name: "腾讯云扩图", purpose: "背景扩图（按比例）", points: 2, channel: "公司AI平台 / 画布" }
        ]
      },
    });
  }

  if (req.method === "POST" && url.pathname === "/api/business-lines") {
    const input = await readBody(req);
    if (!String(input.name || "").trim()) return json(res, 422, { error: "业务线名称不能为空" });
    const lines = await readJson(businessLinesFile);
    const line = { id: randomUUID(), name: input.name.trim(), order: Math.max(0, ...lines.map((item) => item.order || 0)) + 10, enabled: true, segments: [] };
    lines.push(line); await writeJson(businessLinesFile, lines); return json(res, 201, line);
  }

  const businessLineMatch = matchRoute(url.pathname, "/api/business-lines/:id");
  if (businessLineMatch && req.method === "PATCH") {
    const input = await readBody(req); const lines = await readJson(businessLinesFile);
    const line = lines.find((item) => item.id === businessLineMatch.id); if (!line) return json(res, 404, { error: "业务线不存在" });
    for (const key of ["name", "order", "enabled"]) if (key in input) line[key] = key === "name" ? String(input[key]).trim() : input[key];
    await writeJson(businessLinesFile, lines); return json(res, 200, line);
  }

  const segmentCreateMatch = matchRoute(url.pathname, "/api/business-lines/:id/segments");
  if (segmentCreateMatch && req.method === "POST") {
    const input = await readBody(req); const lines = await readJson(businessLinesFile);
    const line = lines.find((item) => item.id === segmentCreateMatch.id); if (!line) return json(res, 404, { error: "业务线不存在" });
    if (!String(input.name || "").trim()) return json(res, 422, { error: "细分类型名称不能为空" });
    const segment = { id: randomUUID(), name: input.name.trim(), order: Math.max(0, ...(line.segments || []).map((item) => item.order || 0)) + 10, enabled: true };
    line.segments ||= []; line.segments.push(segment); await writeJson(businessLinesFile, lines); return json(res, 201, segment);
  }

  const segmentMatch = matchRoute(url.pathname, "/api/business-lines/:id/segments/:segmentId");
  if (segmentMatch && req.method === "PATCH") {
    const input = await readBody(req); const lines = await readJson(businessLinesFile);
    const line = lines.find((item) => item.id === segmentMatch.id); const segment = line?.segments?.find((item) => item.id === segmentMatch.segmentId);
    if (!segment) return json(res, 404, { error: "细分类型不存在" });
    for (const key of ["name", "order", "enabled"]) if (key in input) segment[key] = key === "name" ? String(input[key]).trim() : input[key];
    await writeJson(businessLinesFile, lines); return json(res, 200, segment);
  }

  if (req.method === "POST" && url.pathname === "/api/projects") {
    const input = await readBody(req); if (!String(input.name || "").trim()) return json(res, 422, { error: "项目名称不能为空" });
    const game = await projectGameTag(input);
    const projects = await readJson(projectsFile); const now = new Date().toISOString();
    const project = { id: randomUUID(), name: input.name.trim(), code: String(input.code || "").trim(), status: "active", brandId: input.brandId || "", isIpProject: Boolean(input.isIpProject), copyrightNotice: String(input.copyrightNotice || (input.isIpProject ? "©YUEWEN" : "")), businessLineIds: input.businessLineIds || [], ...game, assets: [], members: [], createdAt: now, updatedAt: now };
    projects.unshift(project); await writeJson(projectsFile, projects); return json(res, 201, project);
  }

  const projectMatch = matchRoute(url.pathname, "/api/projects/:id");
  if (projectMatch && req.method === "PATCH") {
    const input = await readBody(req); const projects = await readJson(projectsFile); const project = projects.find((item) => item.id === projectMatch.id);
    if (!project) return json(res, 404, { error: "项目不存在" });
    if('recommendedFontIds' in input){
      if(!Array.isArray(input.recommendedFontIds)||input.recommendedFontIds.some(id=>typeof id!=='string'))return json(res,422,{error:'推荐字体须为字体编号列表'});
      const available=new Set((await readCompanyFontLibrary({root})).fonts.map(font=>font.id));
      if(input.recommendedFontIds.some(id=>!available.has(id)))return json(res,422,{error:'推荐字体不在公司字体库中'});
      project.recommendedFontIds=[...new Set(input.recommendedFontIds)];
    }
    if ('gameTagId' in input) Object.assign(project, await projectGameTag(input));
    const oldCopyright=`${Boolean(project.isIpProject)}|${project.copyrightNotice||''}`;
    for (const key of ["name", "code", "status", "brandId", "isIpProject", "copyrightNotice", "businessLineIds", "members"]) if (key in input) project[key] = input[key];
    if (project.isIpProject && !String(project.copyrightNotice || "").trim()) project.copyrightNotice = "©YUEWEN";
    if (oldCopyright !== `${Boolean(project.isIpProject)}|${project.copyrightNotice||''}`) {
      const tasks=await readJson(tasksFile);
      for (const task of tasks) if (task.projectId===project.id&&task.targetTemplateIds?.some(id=>templateMap.get(id)?.communityPlacement)) {
        invalidateTaskArtifacts(task,'项目 IP 版权规则变更');
      }
      await writeJson(tasksFile,tasks);
    }
    project.updatedAt = new Date().toISOString(); await writeJson(projectsFile, projects); return json(res, 200, project);
  }

  const projectLogoMatch=matchRoute(url.pathname,'/api/projects/:id/logos');
  const projectLogoDefaultMatch=matchRoute(url.pathname,'/api/projects/:id/logos/default');
  if(projectLogoMatch||projectLogoDefaultMatch){
    try{
      if(projectLogoMatch&&req.method==='GET')return json(res,200,await projectLogos.list(projectLogoMatch.id));
      if(projectLogoMatch&&req.method==='POST')return json(res,201,await projectLogos.add(projectLogoMatch.id,await readBody(req)));
      if(projectLogoDefaultMatch&&req.method==='PUT')return json(res,200,await projectLogos.setDefault(projectLogoDefaultMatch.id,(await readBody(req)).logoId));
      return json(res,405,{error:'不支持的项目 Logo 操作'});
    }catch(error){return json(res,error.status||422,{error:error.message});}
  }
  const projectAssetMatch = matchRoute(url.pathname, "/api/projects/:id/assets");
  if (projectAssetMatch && req.method === "POST") {
    const input = await readBody(req); const projects = await readJson(projectsFile); const project = projects.find((item) => item.id === projectAssetMatch.id);
    if (!project) return json(res, 404, { error: "项目不存在" });
    const saved = []; for (const file of input.files || []) saved.push(await saveDataFile("projects", project.id, file.name, file.dataUrl));
    project.assets.push(...saved.map((file) => ({ ...file, role: input.role || "supplement", createdAt: new Date().toISOString() })));
    project.updatedAt = new Date().toISOString(); await writeJson(projectsFile, projects); return json(res, 201, project);
  }

  const resourceProfileMatch = matchRoute(url.pathname, "/api/resource-profiles/:templateId");
  if (resourceProfileMatch && req.method === "PUT") {
    const input = await readBody(req); const template = templateMap.get(resourceProfileMatch.templateId); if (!template) return json(res, 404, { error: "资源位不存在" });
    const profiles = await readJson(resourceProfilesFile); const current = resourceProfile(template, profiles);
    const next = { ...current, ...input, templateId: template.id, technical: { ...current.technical, ...(input.technical || {}) }, elements: { ...current.elements, ...(input.elements || {}) }, geometry: { ...current.geometry, ...(input.geometry || {}) }, exportRules: { ...current.exportRules, ...(input.exportRules || {}) }, version: current.version + 1, updatedAt: new Date().toISOString() };
    const index = profiles.findIndex((item) => item.templateId === template.id); if (index >= 0) profiles[index] = next; else profiles.push(next);
    await writeJson(resourceProfilesFile, profiles); return json(res, 200, next);
  }

  const layoutMatch = matchRoute(url.pathname, "/api/templates/:templateId/regions");
  if (layoutMatch && req.method === "PUT") {
    const input = await readBody(req);
    const template = templateMap.get(layoutMatch.templateId);
    if (!template) return json(res, 404, { error: "资源位不存在" });
    const operation = layoutSaveQueue.then(async () => {
      const index = psdLayoutRules.templates.findIndex(item => item.templateId === template.id);
      const next = updateLayoutRegions(template, psdLayoutRules.templates[index], input);
      // Revoke delivery before changing coordinates, including on partial write failures.
      const existing = resourceRuleMap.get(template.id) || { templateId:template.id };
      const pending = { ...existing, status:"draft", deliveryAllowed:false, missing:[...new Set([...(existing.missing || []), "画面区域修改后需重新核实"])], updatedAt:next.updatedAt };
      const rules = await readJson(resourceRulesOverlayFile);
      const ruleIndex = rules.findIndex(item => item.templateId === template.id);
      if (ruleIndex >= 0) rules[ruleIndex] = pending; else rules.push(pending);
      await writeJson(resourceRulesOverlayFile, rules);
      resourceRuleMap.set(template.id, pending);
      const mergedIndex = resourceRules.findIndex(item => item.templateId === template.id);
      if (mergedIndex >= 0) resourceRules[mergedIndex] = pending; else resourceRules.push(pending);
      const overlays = layoutOverlays.filter(item => item.templateId !== template.id).concat(next);
      await fs.writeFile(layoutRegionsFile + ".tmp", JSON.stringify(overlays, null, 2));
      await fs.rename(layoutRegionsFile + ".tmp", layoutRegionsFile);
      layoutOverlays = overlays;
      if (index >= 0) psdLayoutRules.templates[index] = next; else psdLayoutRules.templates.push(next);
      return next;
    });
    layoutSaveQueue = operation.catch(() => {});
    return json(res, 200, await operation);
  }

  if (req.method === "POST" && url.pathname === "/api/templates") {
    const input = await readBody(req);
    const width = Math.trunc(Number(input.width));
    const height = Math.trunc(Number(input.height));
    const format = String(input.format || "JPG").toUpperCase();
    const line = (await readJson(businessLinesFile)).find((item) => item.id === input.businessLineId);
    const segment = line?.segments?.find((item) => item.id === input.segmentId);
    if (!String(input.name || "").trim()) return json(res, 422, { error: "资源位名称不能为空" });
    if (!line || !segment) return json(res, 422, { error: "业务线分类不存在" });
    if (!(width > 0 && height > 0)) return json(res, 422, { error: "资源位尺寸无效" });
    if (!["JPG", "PNG"].includes(format)) return json(res, 422, { error: "仅支持 JPG 或 PNG" });
    const template = {
      id: `custom-${randomUUID().slice(0, 8)}`,
      categoryId: input.segmentId,
      businessLineId: input.businessLineId,
      segmentId: input.segmentId,
      family: segment.name,
      name: String(input.name).trim(),
      width,
      height,
      format,
      maxBytes: Math.max(1024, Math.trunc(Number(input.maxBytes) || 600 * 1024)),
      textMax: 0,
      automationReady: false,
      readinessNote: "新建资源位，等待上传规范图并核实视觉规则",
      specification: { rules: [] },
    };
    templates.push(template);
    templateMap.set(template.id, template);
    await writeJson(customTemplatesFile, [...savedCustomTemplates.filter((item) => item.id !== template.id), template]);
    savedCustomTemplates.push(template);
    const rule = { templateId: template.id, status: "draft", deliveryAllowed: false, verifiedVisualRules: [], missing: ["规范图", "画面区域", "内容规则"], note: "工作台新增，待人工核实" };
    resourceRules.push(rule);
    resourceRuleMap.set(template.id, rule);
    const overlays = await readJson(resourceRulesOverlayFile);
    overlays.push(rule);
    await writeJson(resourceRulesOverlayFile, overlays);
    return json(res, 201, template);
  }

  const resourceRuleMatch = matchRoute(url.pathname, "/api/resource-rules/:templateId");
  if (resourceRuleMatch && req.method === "PUT") {
    const input = await readBody(req);
    const operation = layoutSaveQueue.then(async () => {
    const current = resourceRuleMap.get(resourceRuleMatch.templateId);
    if (!current) return json(res, 404, { error: "资源位视觉规则不存在" });
    const allowedStatuses = new Set(["verified", "partial", "technical_only", "provisional", "draft"]);
    const status = String(input.status || current.status);
    if (!allowedStatuses.has(status)) return json(res, 422, { error: "规则状态无效" });
    const deliveryAllowed = Boolean(input.deliveryAllowed);
    if (deliveryAllowed && status !== "verified") return json(res, 409, { error: "仅当视觉规则状态为“已核实”时才能允许交付" });
    const verifiedVisualRules = Array.isArray(input.verifiedVisualRules) ? input.verifiedVisualRules.map(String).filter(Boolean) : (current.verifiedVisualRules || []);
    if (deliveryAllowed && !verifiedVisualRules.length) return json(res, 422, { error: "允许交付前请填写至少一条人工核实的视觉规则" });
    const editedLayout = layoutOverlays.find(item => item.templateId === current.templateId);
    if (deliveryAllowed && Number(input.layoutRevision || 0) !== (editedLayout?.revision || 0)) return json(res, 409, { error: "区域已变更，请重新打开规则表单核实最新版本" });
    if (deliveryAllowed && editedLayout && (!String(input.note || "").trim() || editedLayout.variants.some(v => !v.regions.length && !editedLayout.globalRegions.length))) return json(res, 422, { error: "修改区域后，请补齐各版式区域并填写人工核实说明" });
    const next = {
      ...current,
      status,
      deliveryAllowed,
      verifiedVisualRules,
      missing: Array.isArray(input.missing) ? input.missing.map(String).filter(Boolean) : (current.missing || []),
      note: String(input.note || current.note || ""),
      updatedAt: new Date().toISOString(),
      updatedBy: input.by || "设计师",
    };
    const overlay = await readJson(resourceRulesOverlayFile);
    const index = overlay.findIndex((item) => item.templateId === next.templateId);
    if (index >= 0) overlay[index] = next; else overlay.push(next);
    await writeJson(resourceRulesOverlayFile, overlay);
    const merged = await loadResourceRules();
    resourceRules.splice(0, resourceRules.length, ...merged);
    for (const rule of resourceRules) resourceRuleMap.set(rule.templateId, rule);
    return json(res, 200, next);
    });
    layoutSaveQueue = operation.catch(() => {});
    return await operation;
  }

  if (req.method === "POST" && url.pathname === "/api/categories") {
    const input = await readBody(req);
    if (!String(input.name || "").trim()) return json(res, 422, { error: "大类名称不能为空" });
    const categories = await readJson(categoriesFile);
    const category = { id: randomUUID(), name: input.name.trim(), order: Math.max(0, ...categories.map((item) => item.order || 0)) + 10, enabled: true };
    categories.push(category); await writeJson(categoriesFile, categories); return json(res, 201, category);
  }

  const categoryMatch = matchRoute(url.pathname, "/api/categories/:id");
  if (categoryMatch && req.method === "PATCH") {
    const input = await readBody(req); const categories = await readJson(categoriesFile);
    const category = categories.find((item) => item.id === categoryMatch.id);
    if (!category) return json(res, 404, { error: "大类不存在" });
    if ("name" in input && !String(input.name).trim()) return json(res, 422, { error: "大类名称不能为空" });
    for (const key of ["name", "order", "enabled"]) if (key in input) category[key] = key === "name" ? input[key].trim() : input[key];
    await writeJson(categoriesFile, categories); return json(res, 200, category);
  }

  if (req.method === "POST" && url.pathname === "/api/references") {
    const input = await readBody(req); const references = await readJson(referencesFile);
    if (!String(input.name || "").trim() || !String(input.categoryId || "")) return json(res, 422, { error: "案例名称和所属大类不能为空" });
    const reference = { id: randomUUID(), categoryId: input.categoryId, name: input.name.trim(), description: String(input.description || ""), tags: input.tags || [], layoutReusable: input.layoutReusable !== false, source: input.source || "manual", assets: [], createdAt: new Date().toISOString() };
    for (const file of input.files || []) reference.assets.push(await saveDataFile("references", reference.id, file.name, file.dataUrl));
    references.push(reference); await writeJson(referencesFile, references); return json(res, 201, reference);
  }

  const specificationMatch = matchRoute(url.pathname, "/api/templates/:id/specifications");
  if (specificationMatch && req.method === "POST") {
    const input = await readBody(req); const template = templateMap.get(specificationMatch.id);
    if (!template) return json(res, 404, { error: "资源位不存在" });
    if (!(input.files || []).length) return json(res, 422, { error: "请选择至少一张规范图" });
    const specifications = await readJson(specificationsFile);
    const item = { id: randomUUID(), templateId: template.id, name: String(input.name || `${template.name}规范图`).trim(), notes: String(input.notes || ""), assets: [], createdAt: new Date().toISOString() };
    for (const file of input.files) item.assets.push(await saveDataFile("specifications", item.id, file.name, file.dataUrl));
    specifications.push(item); await writeJson(specificationsFile, specifications); return json(res, 201, item);
  }

  if (req.method === "POST" && url.pathname === "/api/tasks") {
    let input = await readBody(req);
    if('customTargetSizes' in input){
      if(!Array.isArray(input.customTargetSizes)||input.customTargetSizes.length>100||input.customCanvas)return json(res,422,{error:'自定义延展尺寸无效'});
      try{input.customTargetSizes=input.customTargetSizes.map(customCanvasSpec);registerCustomTargets(input,templateMap);}catch(error){return json(res,422,{error:error.message});}
    }
    if(input.customCanvas){
      let spec;try{spec=customCanvasSpec(input.customCanvas);}catch(e){return json(res,422,{error:e.message});}
      const template=customCanvasTemplate(spec);templateMap.set(template.id,template);
      input={...input,customCanvas:spec,mode:'master',submit:false,businessLineId:'platform-community',segmentId:'custom-canvas',segmentIds:['custom-canvas'],masterCanvasId:'custom',masterTemplateId:template.id,targetTemplateIds:[template.id]};
    }
    const errors = validateTask(input, new Set(templateMap.keys()));
    const ownCustomTargets=new Set(registerCustomTargets(input,templateMap).map(t=>t.id));
    if(Array.isArray(input.targetTemplateIds)&&input.targetTemplateIds.some(id=>templateMap.get(id)?.customTarget&&!ownCustomTargets.has(id)))errors.push('请提供当前任务的自定义尺寸');
    if(!input.customCanvas&&input.targetTemplateIds?.some(id=>templateMap.get(id)?.communityMaster))errors.push('母版画布不属于交付资源位，请选择实际目标尺寸');
    if (errors.length) return json(res, 422, { errors });
    const now = new Date().toISOString();
    const task = {
      id: randomUUID(),
      project: input.project.trim(),
      projectId: input.projectId || "",
      businessLineId: input.businessLineId || "platform-community",
      segmentId: input.segmentId || templateMap.get(input.targetTemplateIds[0])?.segmentId || "platform",
      segmentIds: Array.isArray(input.segmentIds) && input.segmentIds.length ? [...new Set(input.segmentIds)] : [input.segmentId || templateMap.get(input.targetTemplateIds[0])?.segmentId || "platform"],
      requester: input.requester.trim(),
      mode: input.mode,
      copy: String(input.copy || ""),
      notes: String(input.notes || ""),
      dueDate: input.dueDate || "",
      brandId: input.brandId || "",
      masterCanvasId: input.masterCanvasId || "landscape-1920x1080",
      masterTemplateId: input.masterTemplateId || input.targetTemplateIds[0],
      targetTemplateIds: [...new Set(input.targetTemplateIds)],
      ...(input.customCanvas?{customCanvas:input.customCanvas}:{}),
      ...(input.customTargetSizes?.length?{customTargetSizes:input.customTargetSizes}:{}),
      status: input.submit ? "批量生成" : "草稿",
      assignee: "",
      version: 1,
      parameters: {
        focalX: 50,
        focalY: 50,
        scale: 100,
        textX: 10,
        textY: 72,
        fontSize: 52,
        textColor: "#ffffff",
        overlay: templateMap.get(input.masterTemplateId || input.targetTemplateIds[0])?.communityPlacement ? 0 : 22,
        background: "#111827",
        showText: input.mode === "copy-replace",
      },
      assets: [],
      artifacts: [],
      qc: null,
      visualReview: { status: "pending", note: "" },
      annotations: { objects: [], activeType: "core-character", updatedAt: null },
      pagePreviews: [],
      history: [{ at: now, action: "创建任务", by: input.requester.trim(), status: input.submit ? "批量生成" : "草稿" }],
      createdAt: now,
      updatedAt: now,
    };
    if(task.customCanvas)task.parameters.communityImageModel='gpt-image-2';
    if(task.targetTemplateIds.every(id=>templateMap.get(id)?.communityPlacement&&!templateMap.get(id)?.communityMaster)){
      task.masterTemplateId=communityMasterTemplate.id;task.masterCanvasId='landscape-1920x1080';task.parameters.communityImageModel='gpt-image-2';
    }
    const projectLogo=await projectLogos.copyToTask({projectId:task.projectId,logoId:input.projectLogoId,folder:task.id});
    if(projectLogo)task.assets.push({...projectLogo,name:projectLogo.file,originalName:projectLogo.name});
    if(input.projectLibraryUse)await projectDesignLibrary.importIntoTask(task,input.projectLibraryUse);
    const tasks = await readJson(tasksFile);
    tasks.unshift(task);
    await writeJson(tasksFile, tasks);
    return json(res, 201, publicTask(task));
  }

  const customExportMatch=matchRoute(url.pathname,'/api/tasks/:id/custom-canvas/export');
  const customResizeMatch=matchRoute(url.pathname,'/api/tasks/:id/custom-canvas/resize');
  if(customResizeMatch&&req.method==='POST')return json(res,200,publicTask(await resizeCustomCanvas(customResizeMatch.id,await readBody(req))));
  if(customExportMatch&&req.method==='POST'){
    const saved=await exportCustomCanvas(customExportMatch.id,await readBody(req,96*1024*1024));return json(res,201,publicTask(saved));
  }
  const workspaceMatch=matchRoute(url.pathname,'/api/tasks/:id/community-master-workspace');
  if(workspaceMatch&&req.method==='POST'){
    try{
      const input=await readBody(req);
      const saved=await mutateJson(tasksFile,tasks=>{
        const task=tasks.find(t=>t.id===workspaceMatch.id);if(!task)throw Object.assign(Error('任务不存在'),{status:404});
        if(input.expectedUpdatedAt&&input.expectedUpdatedAt!==task.updatedAt)throw Object.assign(Error('任务已更新，请重新打开'),{status:409});
        ensureCommunityMasterWorkspace(task,templateMap.get(task.masterTemplateId));return task;
      });
      return json(res,200,publicTask(saved));
    }catch(error){return json(res,error.status||422,{error:error.message});}
  }
  const syncCommunityTargetsMatch=matchRoute(url.pathname,'/api/tasks/:id/community-target-sync');
  if(syncCommunityTargetsMatch&&req.method==='POST'){
    try{return json(res,200,publicTask(await communityTargetReflow.synchronize(syncCommunityTargetsMatch.id,await readBody(req))));}
    catch(error){return json(res,error.status||422,{error:error.message});}
  }
  const resumeCommunityTargetMatch=matchRoute(url.pathname,'/api/tasks/:id/community-target-resume');
  if(resumeCommunityTargetMatch&&req.method==='POST'){
    try{return json(res,202,publicTask(await communityTargetReflow.resume(resumeCommunityTargetMatch.id,await readBody(req))));}
    catch(error){return json(res,error.status||422,{error:error.message});}
  }
  const approveCommunityMasterMatch = matchRoute(url.pathname, "/api/tasks/:id/approve-community-master");
  const approveCommunityTargetsMatch=matchRoute(url.pathname,'/api/tasks/:id/approve-community-targets');
  if(approveCommunityTargetsMatch&&req.method==='POST'){
    try{
      const input=await readBody(req),saved=await mutateJson(tasksFile,async tasks=>{
        const task=tasks.find(t=>t.id===approveCommunityTargetsMatch.id);if(!task)throw Object.assign(Error('任务不存在'),{status:404});
        if(communityGenerationJobs.has(task.id))throw Object.assign(Error('请等待当前生成完成'),{status:409});
        const project=(await readJson(projectsFile)).find(p=>p.id===task.projectId);
        if(task.communityMasterApproval?.fingerprint!==communityMasterFingerprint(task,project))throw Object.assign(Error('母版已变化，请重新确认母版'),{status:409});
        approveCommunityTargetDrafts(task,input,task.targetTemplateIds.map(id=>templateMap.get(id)).filter(Boolean));
        reconcileCommunityTargetExtension(task);return task;
      });return json(res,200,publicTask(saved));
    }catch(error){return json(res,error.status||422,{error:error.message});}
  }
  if (approveCommunityMasterMatch && req.method === "POST") {
    const tasks = await readJson(tasksFile);
    const task = tasks.find(item => item.id === approveCommunityMasterMatch.id);
    if (!task) return json(res, 404, { error:"任务不存在" });
    if (!templateMap.get(task.masterTemplateId)?.communityPlacement) return json(res, 422, { error:"当前任务不是平台社区母稿任务" });
    if (communityGenerationJobs.has(task.id) || task.communityGeneration?.status==='running' || task.outpaint?.status==='running') return json(res,409,{error:'生成尚未结束，请等待所有图层完成后再确认母版'});
    if (!String(task.copy || '').trim()) return json(res, 422, { error:"请先填写母稿主文案" });
    if(task.masterTemplateId===communityMasterTemplate.id&&!task.parameters?.assetByTemplate?.[task.masterTemplateId]?.background&&!task.parameters?.backgroundByTemplate?.[task.masterTemplateId]?.url)return json(res,422,{error:'请先生成或导入母版，再进入尺寸延展'});
    const artwork=task.parameters?.communityArtworkByTemplate?.[task.masterTemplateId];
    if(artwork && (artwork.copy!==String(task.copy).trim() || artwork.subtitle!==String(task.parameters?.subtitleText || '').trim()))return json(res,409,{error:'文案已修改，请先生成对应的整稿修改版再确认母版'});
    if (!(task.assets || []).some(asset => asset.mime?.startsWith('image/'))) return json(res, 422, { error:"请先添加角色或背景素材" });
    if (task.targetTemplateIds.some(id => templateMap.get(id)?.brandLogo) && !(task.assets || []).some(asset => asset.role === 'logo' && asset.mime?.startsWith('image/'))) {
      return json(res, 422, { error:"所选尺寸包含必须带游戏品牌 Logo 的资源位，请先上传独立 Logo 素材" });
    }
    const project = (await readJson(projectsFile)).find(item => item.id === task.projectId);
    const saved=await mutateJson(tasksFile,async currentTasks=>{
      const current=currentTasks.find(t=>t.id===task.id);
      if(!current||current.updatedAt!==task.updatedAt)throw Object.assign(Error('画面已更新，请重新确认母版'),{status:409});
      current.communityMasterApproval={fingerprint:communityMasterFingerprint(current,project),at:new Date().toISOString()};
      if(usesLayeredCommunityReflow(current)){
        const result=await communityTargetReflow.syncTask(current);
        if(result.updated.length){invalidateTaskArtifacts(current,'本地同步母版图层，保留各尺寸构图');current.history.push({at:new Date().toISOString(),action:`本地同步 ${result.updated.length} 张尺寸稿，背景和手动构图保留，无需重新生图`,by:'设计师',status:current.status});}
      }
      current.updatedAt=current.communityMasterApproval.at;
      current.history.push({at:current.updatedAt,action:'确认平台社区母稿，保留既有尺寸稿并允许增量更新',by:'设计师',status:current.status});
      reconcileCommunityTargetExtension(current);return current;
    });
    return json(res,200,publicTask(saved));
  }

  const reflowCommunityMatch=matchRoute(url.pathname,'/api/tasks/:id/reflow-community-targets');
  if(reflowCommunityMatch && req.method==='POST') {
    const input=await readBody(req);
    let tasks=await readJson(tasksFile),task=tasks.find(t=>t.id===reflowCommunityMatch.id);
    if(!task)return json(res,404,{error:'任务不存在'});
    if(!templateMap.get(task.masterTemplateId)?.communityPlacement)return json(res,422,{error:'当前任务不是平台社区母稿任务'});
    try {
      const project=(await readJson(projectsFile)).find(p=>p.id===task.projectId);
      assertCommunityMasterReady(task,input.masterFingerprint,communityMasterFingerprint(task,project));
      if(communityGenerationJobs.has(task.id))throw Object.assign(new Error('生成尚未结束，请稍候再重排'),{status:409});
      const selections=validateCommunityMasterSelections(task,input.masterAssets);
      const targets=task.targetTemplateIds.map(id=>templateMap.get(id)).filter(Boolean);
      let backgroundName=selections.background;
      let snapshot;
      if(selections.background || task.parameters?.backgroundByTemplate?.[task.masterTemplateId]?.url) {
        const source=await confirmedCommunityBackgroundSource({...task,parameters:{...task.parameters,assetByTemplate:{...task.parameters?.assetByTemplate,[task.masterTemplateId]:{...task.parameters?.assetByTemplate?.[task.masterTemplateId],background:selections.background}}}});
        backgroundName=`确认母版背景-${input.masterFingerprint.slice(0,16)}.png`;
        const directory=safeChild(storageDir,task.id,'assets');await fs.mkdir(directory,{recursive:true});
        await fs.writeFile(safeChild(directory,backgroundName),source.buffer);
        snapshot={name:backgroundName,mime:'image/png',bytes:source.buffer.length,url:`/storage/${task.id}/assets/${encodeURIComponent(backgroundName)}`,role:'confirmed-master-background',sourceTemplateId:task.masterTemplateId,sourceBackgroundName:source.assetName,sourceMasterFingerprint:input.masterFingerprint,createdAt:new Date().toISOString()};
      }
      tasks=await readJson(tasksFile);task=tasks.find(t=>t.id===reflowCommunityMatch.id);
      if(!task)return json(res,404,{error:'任务不存在'});
      assertCommunityMasterReady(task,input.masterFingerprint,communityMasterFingerprint(task,project));
      const masterAssets=validateCommunityMasterSelections(task,input.masterAssets);
      const parameters=propagateCommunityMaster(task,{templates:targets,masterAssets,targetLayouts:input.layoutByTemplate,backgroundName,masterFingerprint:input.masterFingerprint,isIpProject:Boolean(project?.isIpProject)});
      if(snapshot && !task.assets.some(a=>a.name===snapshot.name))task.assets.push(snapshot);
      task.parameters=parameters;
      invalidateTaskArtifacts(task,'按确认母版同步素材并重排其它尺寸');
      reconcileCommunityTargetExtension(task);
      task.updatedAt=parameters.communityAutoLayoutAt;
      task.history.push({at:task.updatedAt,action:'按确认母版同步背景、人物与文案并重排其它尺寸',by:'设计师',status:task.status});
      await writeJson(tasksFile,tasks);
      return json(res,200,publicTask(task));
    } catch(error){return json(res,error.status || 422,{error:error.message});}
  }

  // Apply an already reviewed native-font composition without regenerating the
  // scene. The real font alpha is finished on the server and committed once.
  const bannerTypesetMatch=matchRoute(url.pathname,'/api/tasks/:id/community-typeset');
  if(bannerTypesetMatch && req.method==='POST'){
    const input=await readBody(req),tasks=await readJson(tasksFile),task=tasks.find(t=>t.id===bannerTypesetMatch.id);
    if(!task)return json(res,404,{error:'任务不存在'});
    const template=templateMap.get(task.masterTemplateId);
    if(!template?.communityPlacement)return json(res,422,{error:'当前任务不是平台社区母版任务'});
    if(communityGenerationJobs.has(task.id)||task.outpaint?.status==='running')return json(res,409,{error:'生成中不能重排母版'});
    try{
      if(input.sourceToken!==bannerSourceToken(task))return json(res,409,{error:'母版已变化，未覆盖当前画面'});
      const run={...validateBannerDesignInput(task,{...input,mode:'design'},template,await readCompanyFontLibrary()),runId:randomUUID(),masterAssets:validateCommunityMasterSelections(task,input.masterAssets)};
      const {mime,buffer:mask}=decodeDataUrl(input.titleMaskDataUrl);
      if(mime!=='image/png'||mask.length>18*1024*1024)throw new Error('主标字形须为不超过18MB的透明 PNG');
      await readCompanyFontBytes(run.titleFont.id);
      const result=await finishLicensedTitle({mask,theme:run.titleDesignTheme==='playful'?'playful':'restrained',palette:input.titlePalette || {}});
      if(result.quality.flags.includes('effects-reach-canvas-edge'))throw new Error('主标效果超出边缘，未替换当前画面');
      const name=`母版-修正主标-${run.runId.slice(0,8)}.png`,glyphName=`母版-修正字形-${run.runId.slice(0,8)}.png`;
      const directory=safeChild(storageDir,task.id,'assets');
      await fs.writeFile(safeChild(directory,name),result.buffer);await fs.writeFile(safeChild(directory,glyphName),mask);
      const now=new Date().toISOString();
      const fontProvenance={fontId:run.titleFont.id,sha256:run.titleFont.sha256,fontName:run.titleFont.name,maskSha256:createHash('sha256').update(mask).digest('hex'),method:'licensed-glyph-mask-material-v1',effectStyle:result.effectStyle,quality:result.quality,outlineRadius:result.outlineRadius};
      const added=[{name,mime:'image/png',bytes:result.buffer.length,url:`/storage/${task.id}/assets/${encodeURIComponent(name)}`,role:'title',fontProvenance,glyphSourceName:glyphName,bannerVersionId:run.runId,createdAt:now},
        {name:glyphName,mime:'image/png',bytes:mask.length,url:`/storage/${task.id}/assets/${encodeURIComponent(glyphName)}`,role:'title-glyph-source',fontId:run.titleFont.id,sha256:run.titleFont.sha256,bannerVersionId:run.runId,createdAt:now}];
      const latestTasks=await readJson(tasksFile),latest=latestTasks.find(t=>t.id===task.id);
      if(!latest)return json(res,404,{error:'任务不存在'});
      commitBannerDesign(latest,{run,assets:added,bindings:{title:name},now});
      latest.communityGeneration={phase:'compose',mode:'design',runId:run.runId,model:'licensed-native-finish',status:'done',stage:'ready',total:1,done:1,errors:[],completedAt:now};
      invalidateTaskArtifacts(latest,'本地修正主标字效与副标对齐');
      latest.history.push({at:now,action:run.prompt,by:'设计师',status:latest.status});
      await writeJson(tasksFile,latestTasks);return json(res,200,publicTask(latest));
    }catch(error){return json(res,error.status || 422,{error:error.message});}
  }

  const bannerComposeMatch=matchRoute(url.pathname,'/api/tasks/:id/community-compose');
  if(bannerComposeMatch && req.method==='POST'){
    const input=await readBody(req),tasks=await readJson(tasksFile),task=tasks.find(t=>t.id===bannerComposeMatch.id);
    if(!task)return json(res,404,{error:'任务不存在'});
    const template=templateMap.get(task.masterTemplateId);
    if(!template?.communityPlacement)return json(res,422,{error:'当前任务不是平台社区母版任务'});
    if(communityGenerationJobs.has(task.id) || task.outpaint?.status==='running')return json(res,409,{error:'此任务正在生成，请等待完成'});
    try{
      if(['concept','concept-edit','adapt'].includes(input.mode)){
        const artworkTemplate=input.mode==='adapt'?templateMap.get(input.targetTemplateId):template;
        if(input.mode==='adapt'&&template.communityMaster){const project=(await readJson(projectsFile)).find(p=>p.id===task.projectId);assertCommunityMasterReady(task,task.communityMasterApproval?.fingerprint,communityMasterFingerprint(task,project));}
        if(!artworkTemplate?.communityPlacement || !(artworkTemplate.id===task.masterTemplateId||task.targetTemplateIds.includes(artworkTemplate.id)))throw new Error('目标尺寸不存在');
        const selectedLogo=task.assets.find(a=>a.name===task.parameters?.assetByTemplate?.[task.masterTemplateId]?.logo) || task.assets.find(a=>a.role==='logo');
        const logoMeta=selectedLogo?await sharp(await fs.readFile(safeChild(storageDir,task.id,selectedLogo.bucket || 'assets',selectedLogo.name))).metadata():null;
        const prepared=prepareCommunityArtwork(task,input,artworkTemplate,{logoAspect:logoMeta?logoMeta.width/logoMeta.height:3});
        const references=input.mode==='adapt'?[]:communityReferences(task);
        if(references.length>8)throw new Error('整稿设计最多支持8张参考图，请移除多余参考');
        const characters=input.mode==='adapt'?[]:communityReferenceAssets(task,'master').filter(a=>['character','core-character','secondary-character'].includes(a.role));
        const inputs={references:await Promise.all(references.map(a=>fs.readFile(safeChild(storageDir,task.id,a.bucket || 'assets',a.name)))),referenceRoles:references.map(a=>a.role),characters:await Promise.all(characters.slice(0,2).map(a=>fs.readFile(safeChild(storageDir,task.id,a.bucket || 'assets',a.name))))};
        if(prepared.mode==='adapt')inputs.current=(await confirmedCommunityBackgroundSource(task)).buffer;
        else if(prepared.mode==='concept-edit'){
          const binding=task.parameters?.assetByTemplate?.[task.masterTemplateId]?.background;
          const art=task.parameters?.communityArtworkByTemplate?.[task.masterTemplateId];
          const source=task.assets.find(a=>a.name===binding);
          const flat=source&&art?.assetName===source.name&&['character','character2','foreground','title','subtitle','subtitle-backing'].every(k=>task.parameters?.layoutByTemplate?.[task.masterTemplateId]?.[k]?.visible===false);
          if(flat){
            let buffer=await fs.readFile(safeChild(storageDir,task.id,source.bucket||'assets',source.name));
            if(source.bannerVersionId){const raw=safeChild(storageDir,task.id,'banner-generation',source.bannerVersionId,'artwork.png');buffer=await fs.readFile(raw).catch(e=>{if(e.code!=='ENOENT')throw e;return buffer;});}
            const place=task.parameters?.backgroundByTemplate?.[template.id];
            if(place?.url){const parts=new URL(place.url,'http://localhost').pathname.split('/').filter(Boolean).map(decodeURIComponent);if(parts.length!==4||parts[0]!=='storage'||parts[1]!==task.id||!['outpaint','assets'].includes(parts[2]))throw Error('当前母版背景来源无效');buffer=await fs.readFile(safeChild(storageDir,task.id,parts[2],parts[3]));}
            inputs.current=await renderCommunityArtworkEditSource(buffer,template,task.parameters?.backgroundByTemplate?.[template.id]);
          }else{
            const {mime,buffer}=decodeDataUrl(input.currentDataUrl || '');
            if(mime!=='image/png'||buffer.length>32*1024*1024)throw new Error('当前整稿须为32MB以内的PNG');
            await sharp(buffer,{limitInputPixels:40000000}).metadata();inputs.current=buffer;
          }
        }
        const runId=randomUUID();
        const saved=await mutateJson(tasksFile,currentTasks=>{
          const current=currentTasks.find(t=>t.id===task.id);
          if(!current || communityArtworkRunSourceToken(current,prepared)!==prepared.sourceToken)throw Object.assign(new Error('准备素材期间画面已变化，请重新提交'),{status:409});
          current.communityGeneration={...prepared,runId,phase:'artwork',status:'running',stage:'preparing',done:0,total:1,startedAt:new Date().toISOString(),referenceNames:references.map(a=>a.name)};return current;
        });
        communityGenerationJobs.set(task.id,runId);void runCommunityArtwork(task.id,runId,inputs);
        return json(res,202,publicTask(saved));
      }
      const library=await readCompanyFontLibrary();
      const prepared=validateBannerDesignInput(task,input,template,library);
      if(prepared.mode==='design' && !String(task.copy || '').trim())throw new Error('请先填写最终主文案');
      const model=String(input.model || 'banana_pro');
      if(!Object.values(communityImageModels).includes(model))throw new Error('生图模型无效');
      const masterAssets=validateCommunityMasterSelections(task,input.masterAssets);
      if(prepared.mode==='edit' && !masterAssets.background && !task.parameters?.backgroundByTemplate?.[task.masterTemplateId]?.url)throw new Error('请先生成完整母版');
      if(!prepared.aiKinds.includes('subtitle-backing'))await resolveBannerBackingFollow(prepared,{readBacking:name=>{
        const asset=task.assets.find(a=>a.name===name && a.role==='subtitle-backing');
        if(!asset)throw new Error('副标底板素材不存在');
        return fs.readFile(safeChild(storageDir,task.id,asset.bucket || 'assets',asset.name));
      }});
      for(const op of prepared.plan.operations)if(['character','character2','logo'].includes(op.kind) && !masterAssets[op.kind])throw new Error('要修改的图层尚未添加素材');
      const selectedCharacters=task.assets.filter(a=>['character','character2'].some(k=>masterAssets[k]===a.name));
      if(selectedCharacters.some(a=>a.needsCutout))throw new Error('人物素材仍带背景，请先完成人物抠图');
      const decode=async(value,label,required=true)=>{
        if(!value){if(required)throw new Error(`缺少${label}，请重新提交`);return null;}
        const {mime,buffer}=decodeDataUrl(value);
        if(mime!=='image/png' || buffer.length>18*1024*1024)throw new Error(`${label}须为不超过18MB的 PNG`);
        const metadata=await sharp(buffer,{limitInputPixels:20000000}).metadata();
        if(metadata.width>4096 || metadata.height>4096)throw new Error(`${label}尺寸过大`);
        return buffer;
      };
      const inputs={guide:await decode(input.guideDataUrl,'母版设计图',Boolean(prepared.aiKinds.length)),current:await decode(input.currentDataUrl,'当前母版',Boolean(prepared.aiKinds.length)),titleMask:await decode(input.titleMaskDataUrl,'真实字形',prepared.aiKinds.includes('title'))};
      if(prepared.aiKinds.includes('title'))await readCompanyFontBytes(prepared.titleFont.id);
      const references=communityReferenceAssets(task,'master');
      inputs.references=await Promise.all(references.slice(0,8).map(a=>fs.readFile(safeChild(storageDir,task.id,a.bucket || 'assets',a.name))));
      inputs.referenceRoles=references.slice(0,8).map(a=>a.role);
      inputs.characters=await Promise.all(selectedCharacters.map(a=>fs.readFile(safeChild(storageDir,task.id,a.bucket || 'assets',a.name))));
      inputs.sceneCharacters=task.assets.find(a=>a.name===masterAssets.background)?.sceneCharacters;
      const runId=randomUUID(),now=new Date().toISOString();
      const total=prepared.mode==='design'?prepared.aiKinds.length+2:Math.max(1,prepared.aiKinds.length+1);
      task.communityGeneration={...prepared,runId,phase:'compose',model,masterAssets,status:'running',stage:'preparing',total,done:0,errors:[],startedAt:now};
      await writeJson(tasksFile,tasks);
      communityGenerationJobs.set(task.id,runId);
      void runCommunityBanner(task.id,runId,inputs);
      return json(res,202,publicTask(task));
    }catch(error){return json(res,error.status || 422,{error:error.message});}
  }
  const importMasterMatch=matchRoute(url.pathname,'/api/tasks/:id/community-import-master');
  if(importMasterMatch&&req.method==='POST'){
    try{
      const input=await readBody(req);
      const saved=await mutateJson(tasksFile,async tasks=>{
        const task=tasks.find(t=>t.id===importMasterMatch.id);if(!task)throw Object.assign(Error('任务不存在'),{status:404});
        if(task.masterTemplateId!==communityMasterTemplate.id&&!task.customCanvas)throw Error('请先进入母版制作界面');
        if(task.status==='已完成'&&task.deliveredPackage)throw Object.assign(Error('请先开始新版本再导入母版'),{status:409});
        if(communityGenerationJobs.has(task.id)||task.outpaint?.status==='running')throw Object.assign(Error('请等待生成完成后再导入母版'),{status:409});
        const asset=task.assets.find(a=>a.name===input.name&&a.role==='mother-candidate');if(!asset)throw Error('母版候选不存在');
        const meta=await sharp(await fs.readFile(safeChild(storageDir,task.id,asset.bucket||'assets',asset.name))).metadata();
        if(!meta.width||!meta.height||!task.customCanvas&&Math.abs(Math.log((meta.width/meta.height)/(16/9)))>.025)throw Error('导入母版需要16:9画幅，请使用1920×1080或3840×2160的完整成稿');
        const run={...prepareCommunityArtwork(task,{mode:'concept',prompt:'导入完整画布',model:task.parameters.communityImageModel||'gpt-image-2',expectedUpdatedAt:input.expectedUpdatedAt},templateMap.get(task.masterTemplateId)),runId:'import-'+randomUUID()};
        applyCommunityArtwork(task,{run,asset});invalidateTaskArtifacts(task,'导入完整母版，待确认');
        task.history.push({at:task.updatedAt,action:'导入完整母版，保留原始分辨率',by:'设计师',status:task.status});return task;
      });
      return json(res,200,publicTask(saved));
    }catch(error){return json(res,error.status||422,{error:error.message});}
  }
  const applyArtworkMatch=matchRoute(url.pathname,'/api/tasks/:id/community-artwork-apply');
  if(applyArtworkMatch && req.method==='POST'){
    const input=await readBody(req),tasks=await readJson(tasksFile),task=tasks.find(t=>t.id===applyArtworkMatch.id);
    if(!task)return json(res,404,{error:'任务不存在'});
    if(communityGenerationJobs.has(task.id) || task.outpaint?.status==='running')return json(res,409,{error:'请等待生成完成'});
    try{
      const proposal=task.communityArtworkProposals?.find(p=>p.run.runId===input.runId);if(!proposal)throw new Error('整稿方案不存在');
      applyCommunityArtwork(task,proposal,{expectedUpdatedAt:input.expectedUpdatedAt});invalidateTaskArtifacts(task,'应用整稿方案，待确认母版');
      if(task.communityGeneration?.runId===input.runId)task.communityGeneration.status='done';
      task.history.push({at:task.updatedAt,action:'应用保留的整稿方案',by:'设计师',status:task.status});await writeJson(tasksFile,tasks);return json(res,200,publicTask(task));
    }catch(error){return json(res,error.status || 422,{error:error.message});}
  }
  const resumeArtworkMatch=matchRoute(url.pathname,'/api/tasks/:id/community-artwork-resume');
  if(resumeArtworkMatch && req.method==='POST'){
    const input=await readBody(req),tasks=await readJson(tasksFile),task=tasks.find(t=>t.id===resumeArtworkMatch.id);
    if(!task)return json(res,404,{error:'任务不存在'});
    if(communityGenerationJobs.has(task.id) || task.outpaint?.status==='running')return json(res,409,{error:'任务仍在执行'});
    const run=task.communityGeneration;
    if(run?.phase!=='artwork' || run.runId!==input.runId || !run.providerJobs?.artwork?.rawFile || !['failed','interrupted','running'].includes(run.status))return json(res,422,{error:'没有可恢复的整稿原图'});
    task.communityGeneration={...run,status:'running',stage:'saving'};delete task.communityGeneration.error;
    await writeJson(tasksFile,tasks);communityGenerationJobs.set(task.id,run.runId);void runCommunityArtwork(task.id,run.runId,{resume:true});
    return json(res,202,publicTask(task));
  }
  const bannerRestoreMatch=matchRoute(url.pathname,'/api/tasks/:id/community-design-restore');
  if(bannerRestoreMatch && req.method==='POST'){
    const input=await readBody(req),tasks=await readJson(tasksFile),task=tasks.find(t=>t.id===bannerRestoreMatch.id);
    if(!task)return json(res,404,{error:'任务不存在'});
    if(communityGenerationJobs.has(task.id) || task.outpaint?.status==='running')return json(res,409,{error:'生成中不能切换母版版本'});
    try{
      const legacy=task.communityDesign?.versions?.find(v=>v.id===input.versionId);
      if(task.customCanvas&&legacy?.snapshot?.masterTemplateId!==task.masterTemplateId){
        const temporary=structuredClone(task);temporary.communityDesign.versions.find(v=>v.id===input.versionId).snapshot=remapCustomCanvasSnapshot(legacy.snapshot,templateMap.get(task.masterTemplateId));
        restoreBannerVersion(temporary,input.versionId);Object.assign(task,{parameters:temporary.parameters,copy:temporary.copy,communityDesign:temporary.communityDesign,communityMasterApproval:null,updatedAt:temporary.updatedAt});task.communityDesign.versions.find(v=>v.id===input.versionId).snapshot=legacy.snapshot;
      }else if(task.masterTemplateId===communityMasterTemplate.id&&legacy?.snapshot?.masterTemplateId!==task.masterTemplateId&&templateMap.get(legacy?.snapshot?.masterTemplateId)){
        const temporary=structuredClone(task);temporary.communityDesign.versions.find(v=>v.id===input.versionId).snapshot=remapLegacyMasterSnapshot(legacy.snapshot,templateMap.get(legacy.snapshot.masterTemplateId));
        restoreBannerVersion(temporary,input.versionId);Object.assign(task,{parameters:temporary.parameters,copy:temporary.copy,communityDesign:temporary.communityDesign,communityMasterApproval:null,updatedAt:temporary.updatedAt});
        task.communityDesign.versions.find(v=>v.id===input.versionId).snapshot=legacy.snapshot;
      }else restoreBannerVersion(task,input.versionId);
      invalidateTaskArtifacts(task,'恢复母版历史版本');
      task.history.push({at:task.updatedAt,action:'恢复母版历史版本，待重新确认',by:'设计师',status:task.status});
      await writeJson(tasksFile,tasks);return json(res,200,publicTask(task));
    }catch(error){return json(res,error.status || 422,{error:error.message});}
  }

  const communityGenerateMatch = matchRoute(url.pathname, '/api/tasks/:id/community-generate');
  if (communityGenerateMatch && req.method === 'POST') {
    const input = await readBody(req);
    const tasks = await readJson(tasksFile);
    const task = tasks.find(item => item.id === communityGenerateMatch.id);
    if (!task) return json(res,404,{error:'任务不存在'});
    if (!templateMap.get(task.masterTemplateId)?.communityPlacement) return json(res,422,{error:'当前任务不是社区外媒母版任务'});
    if (communityGenerationJobs.has(task.id)) return json(res,409,{error:'此任务已有画布生图正在进行，请等待完成'});
    const phase = ['targets','typography','background'].includes(input.phase) ? input.phase : 'master';
    if(phase==='targets'&&input.targetTemplateIds?.some(id=>popupConfig(task,{id})))return json(res,409,{error:'透明弹窗请在弹窗面板保存或重新排版，原方案已保留'});
    if(phase==='targets'&&usesLayeredCommunityReflow(task)){
      try{return json(res,202,publicTask(await communityTargetReflow.submit(task.id,input)));}
      catch(error){return json(res,error.status||422,{error:error.message});}
    }
    const model = String(input.model || '');
    if (!Object.values(communityImageModels).includes(model)) return json(res,422,{error:'请选择 Nano Banana 或 GPT Image 模型'});
    const prompt = String(input.prompt || '').trim().slice(0,1200);
    if (!prompt && phase !== 'typography' && phase !== 'targets') return json(res,422,{error:'请先填写画面创作要求'});
    await prepareCharacterAssets({ storageDir, task, assets: task.assets.filter(asset => !asset.cutoutPreflight) });
    const pendingCutouts = communityReferenceAssets(task, 'background').filter(asset => CHARACTER_ROLES.includes(asset.role) && asset.needsCutout);
    if (pendingCutouts.length) {
      await writeJson(tasksFile, tasks);
      return json(res, 422, { error: `人物素材仍带背景，请先使用「人物抠图」：${pendingCutouts.map(asset => asset.name).join('、')}` });
    }
    if (phase === 'targets') {
      const project = (await readJson(projectsFile)).find(item => item.id === task.projectId);
      if (!task.communityMasterApproval?.fingerprint || task.communityMasterApproval.fingerprint !== communityMasterFingerprint(task,project)) return json(res,409,{error:'母版已更新，请先重新确认母版'});
    }
    const typographyCount = [task.copy,task.parameters?.subtitleText].filter(value => String(value || '').trim()).length;
    const backgroundCount = phase === 'master' || phase === 'background' ? Math.max(1,Math.min(3,Number(input.count) || 3)) : 0;
    const availableTargetIds = task.targetTemplateIds.filter(id => id !== task.masterTemplateId&&!popupConfig(task,{id}));
    const selectedTargetIds = phase === 'targets' && Array.isArray(input.targetTemplateIds) ? [...new Set(input.targetTemplateIds)] : availableTargetIds;
    if (phase === 'targets' && selectedTargetIds.some(id => !availableTargetIds.includes(id))) return json(res,422,{error:'延展尺寸不属于当前任务'});
    const requestedTargetIds=phase==='targets' && task.parameters?.communityArtworkByTemplate?.[task.masterTemplateId]?selectedTargetIds.filter(id=>communityArtworkTargetPending(task,templateMap.get(id))):selectedTargetIds;
    const total = phase === 'targets' ? requestedTargetIds.length : backgroundCount + (phase === 'master' || phase === 'typography' ? typographyCount : 0);
    if (!total){
      if(phase==='targets' && availableTargetIds.length && availableTargetIds.every(id=>!communityArtworkTargetPending(task,templateMap.get(id)))){
        task.communityGeneration={runId:randomUUID(),phase,model,status:'done',total:availableTargetIds.length,done:availableTargetIds.length,errors:[],completedAt:new Date().toISOString()};
        await writeJson(tasksFile,tasks);return json(res,200,publicTask(task));
      }
      return json(res,422,{error:'没有需要延展的目标尺寸'});
    }
    const runId = randomUUID();
    task.communityGeneration = {runId,phase,model,prompt,backgroundCount,referencePolicy:phase==='targets'?'confirmed-master-extension':'designer-numbered-references-v2',referenceAssets:communityReferenceAssets(task,phase).map(asset=>({name:asset.name,role:asset.role})),...(phase === 'targets' ? {targetTemplateIds:requestedTargetIds,...(input.reuseCachedOnly===true?{reuseCachedOnly:true}:{})} : {}),status:'running',total,done:0,errors:[],startedAt:new Date().toISOString()};
    task.updatedAt = task.communityGeneration.startedAt;
    await writeJson(tasksFile,tasks);
    communityGenerationJobs.set(task.id,runId);
    void runCommunityGeneration(task.id,runId);
    return json(res,202,publicTask(task));
  }

  const communityRepairMatch = matchRoute(url.pathname, '/api/tasks/:id/community-extension-repair');
  if (communityRepairMatch && req.method === 'POST') {
    const input = await readBody(req);
    const tasks = await readJson(tasksFile);
    const task = tasks.find(item => item.id === communityRepairMatch.id);
    if (!task) return json(res,404,{error:'任务不存在'});
    const template = templateMap.get(input.templateId);
    if (!template || input.templateId === task.masterTemplateId || !task.targetTemplateIds.includes(input.templateId)) return json(res,422,{error:'修复尺寸不属于当前任务'});
    const project = (await readJson(projectsFile)).find(item => item.id === task.projectId);
    const fingerprint = communityMasterFingerprint(task,project);
    if (!task.communityMasterApproval?.fingerprint || task.communityMasterApproval.fingerprint !== fingerprint || input.masterFingerprint !== fingerprint) return json(res,409,{error:'确认母版已变化，请重新确认后再导入延展图'});
    const {mime,buffer} = decodeDataUrl(input.dataUrl);
    const size = await sharp(buffer).metadata();
    if (mime !== 'image/png' || size.width !== template.width*2 || size.height !== template.height*2) return json(res,422,{error:`延展背景须为 ${template.width*2}×${template.height*2} PNG`});
    const name = sanitizeFileName(`母版延展修复-${template.id}-${Date.now()}.png`);
    const saved = await saveDataFile(task.id,'assets',name,input.dataUrl);
    const now = new Date().toISOString();
    task.assets.push({...saved,role:'generated-background',sourceTemplateId:template.id,sourceBackgroundName:task.parameters?.assetByTemplate?.[task.masterTemplateId]?.background,sourceMasterFingerprint:fingerprint,extensionMode:'confirmed-master-repair-v1',createdAt:now});
    task.parameters ||= {};
    task.parameters.assetByTemplate ||= {};
    task.parameters.assetByTemplate[template.id] ||= {};
    task.parameters.assetByTemplate[template.id].background = name;
    task.parameters.backgroundByTemplate ||= {};
    task.parameters.backgroundByTemplate[template.id] = {focalX:50,focalY:50,scale:100,smartExpand:false,url:''};
    invalidateTaskArtifacts(task,`修复 ${template.name} 的母版延展背景`);
    if (task.communityGeneration?.phase === 'targets' && task.communityGeneration.status !== 'running') {
      task.communityGeneration.errors = (task.communityGeneration.errors || []).filter(error => !error.startsWith(`${template.name}：`));
      const covered = task.targetTemplateIds.filter(id => id !== task.masterTemplateId).filter(id => {
        const selected = task.parameters.assetByTemplate?.[id]?.background;
        return task.assets.some(asset => asset.name === selected && asset.role === 'generated-background' && asset.sourceMasterFingerprint === fingerprint);
      }).length;
      task.communityGeneration.done = covered;
      task.communityGeneration.total = task.targetTemplateIds.filter(id => id !== task.masterTemplateId).length;
      task.communityGeneration.status = covered === task.communityGeneration.total ? 'done' : 'partial';
      task.communityGeneration.repairedAt = now;
    }
    task.updatedAt = now;
    await writeJson(tasksFile,tasks);
    return json(res,201,publicTask(task));
  }

  const startRevisionMatch = matchRoute(url.pathname, "/api/tasks/:id/start-revision");
  if (startRevisionMatch && req.method === "POST") {
    const tasks = await readJson(tasksFile);
    const task = tasks.find(item => item.id === startRevisionMatch.id);
    if (!task) return json(res, 404, { error: "任务不存在" });
    if (task.status !== "已完成" || !task.deliveredPackage) return json(res, 409, { error: "只有已交付任务可以开始新版本" });
    task.status = "批量生成";
    task.unreleasedChanges = false;
    invalidateTaskArtifacts(task, "开始新版本，保留已交付 ZIP");
    task.version = Math.max(task.version || 1, task.deliveredPackage.version + 1);
    ensureCommunityMasterWorkspace(task,templateMap.get(task.masterTemplateId));
    task.updatedAt = new Date().toISOString();
    task.history.push({ at: task.updatedAt, action: "开始新版本，已交付版本保留", by: "设计师", status: task.status });
    await writeJson(tasksFile, tasks);
    return json(res, 200, publicTask(task));
  }

  const taskMatch = matchRoute(url.pathname, "/api/tasks/:id");
  if (taskMatch && req.method === "GET") {
    const tasks = await readJson(tasksFile);
    const task = tasks.find((item) => item.id === taskMatch.id);
    if (task) normalizeTask(task);
    return task ? json(res, 200, publicTask(task)) : json(res, 404, { error: "任务不存在" });
  }

  if (taskMatch && req.method === "DELETE") {
    const tasks = await readJson(tasksFile);
    const index = tasks.findIndex((item) => item.id === taskMatch.id);
    if (index < 0) return json(res, 404, { error: "任务不存在" });
    return json(res, 200, await recycleBin.trashTask(`core:${taskMatch.id}`));
  }

  if (taskMatch && req.method === "PATCH") {
    const input = await readBody(req);
    const saved=await mutateJson(tasksFile,async tasks=>{
    const reject=(status,error)=>{throw Object.assign(new Error(error),{status})};
    const index = tasks.findIndex((item) => item.id === taskMatch.id);
    if (index < 0) reject(404,"任务不存在");
    const task = normalizeTask(tasks[index]);
    if(task.customCanvas){
      if('customCanvas'in input||'masterCanvasId'in input&&input.masterCanvasId!==task.masterCanvasId||'masterTemplateId'in input&&input.masterTemplateId!==task.masterTemplateId||'targetTemplateIds'in input&&JSON.stringify(input.targetTemplateIds)!==JSON.stringify(task.targetTemplateIds)||'mode'in input&&input.mode!=='master')reject(422,'自定义尺寸任务只制作当前画布，不支持添加延展尺寸');
      if('targetTemplateIds'in input)delete input.targetTemplateIds;
    }
    const communityTask=task.targetTemplateIds.some(id=>templateMap.get(id)?.communityPlacement);
    if(communityTask){assertSourceParameterSave(task,input);assertPopupParameterSave(task,input);assertCommunityTargetSaveCurrent(task,input);validateCommunityObjectLayers(task,input.parameters?.communityObjectLayersByTemplate,[task.masterTemplateId,...task.targetTemplateIds]);}
    const beforeCommunityInputs=communityTask?JSON.stringify({copy:task.copy,parameters:task.parameters,projectId:task.projectId,masterTemplateId:task.masterTemplateId,targetTemplateIds:task.targetTemplateIds}):'';
    const previousStatus = task.status;
    if (input.status && input.status !== task.status && !canTransition(task.status, input.status)) {
      reject(409,`不能从“${task.status}”进入“${input.status}”`);
    }
    if (input.status === "已完成") {
      if (communityTask) {
        const project=(await readJson(projectsFile)).find(item=>item.id===task.projectId);
        if (!task.communityMasterApproval?.fingerprint || task.communityMasterApproval.fingerprint!==communityMasterFingerprint(task,project)) reject(409,'母稿已更新，请重新确认并生成七尺寸候选');
      }
      if (elementEffectsOutputStale(task)) reject(409,"描边或投影已修改，请重新生成并审核成套成品");
      const readinessErrors = validateDeliveryReadiness(task, resourceRuleMap);
      if (readinessErrors.length) reject(409,readinessErrors.join("；"));
    }
    if ("targetTemplateIds" in input) {
      const ids = Array.isArray(input.targetTemplateIds) ? [...new Set(input.targetTemplateIds)] : [];
      const ownCustomTargets=new Set(registerCustomTargets(task,templateMap).map(t=>t.id));
      if (!ids.length || ids.some((id) => !templateMap.has(id)||templateMap.get(id)?.communityMaster||templateMap.get(id)?.customTarget&&!ownCustomTargets.has(id))) {
        reject(422,"目标资源位无效，至少选择一个有效资源位");
      }
      if (JSON.stringify(ids) !== JSON.stringify(task.targetTemplateIds || [])) {
        invalidateTaskArtifacts(task, "目标资源位变更，旧版结果已撤回");
      }
    }
    const editable = ["project", "status", "assignee", "mode", "copy", "notes", "dueDate", "brandId", "projectId", "businessLineId", "segmentId", "masterCanvasId", "masterTemplateId", "targetTemplateIds", "parameters"];
    for (const key of editable) if (key in input) task[key] = key === "parameters" ? { ...task.parameters, ...input.parameters } : input[key];
    const afterCommunityInputs = communityTask ? JSON.stringify({copy:task.copy,parameters:task.parameters,projectId:task.projectId,masterTemplateId:task.masterTemplateId,targetTemplateIds:task.targetTemplateIds}) : '';
    if (communityTask && previousStatus === '已完成' && task.deliveredPackage && beforeCommunityInputs !== afterCommunityInputs) {
      reject(409,'该任务已成套下载并完成；如需修改，请先点击“开始新版本”');
    }
    if (communityTask && task.communityMasterApproval?.fingerprint) {
      const project=(await readJson(projectsFile)).find(item=>item.id===task.projectId);
      if(task.communityMasterApproval.fingerprint!==communityMasterFingerprint(task,project))task.communityMasterApproval=null;
    }
    if (communityTask && 'targetTemplateIds' in input) reconcileCommunityTargetExtension(task);
    if (communityTask && beforeCommunityInputs!==afterCommunityInputs) {
      invalidateTaskArtifacts(task,'平台社区母稿或尺寸布局变更');
    }
    syncReviewedPopupLayers(task);
    if (input.status === "已完成") task.visualReview = { status: "approved", note: input.note || "" };
    if (previousStatus === "成套审核" && input.status === "批量生成") task.visualReview = { status: "rejected", note: input.note || "" };
    task.updatedAt = new Date().toISOString();
    if (input.status) task.history.push({ at: task.updatedAt, action: input.action || "更新状态", by: input.by || "设计师", status: task.status, note: input.note || "" });
    tasks[index] = task;
    return publicTask(task);
    });
    return json(res,200,saved);
  }

  const popupMatch=matchRoute(url.pathname,'/api/tasks/:id/community-popup');
  if(popupMatch&&req.method==='POST')return json(res,200,publicTask(await communityPopup(popupMatch.id,await readBody(req))));

  const targetSizesMatch=matchRoute(url.pathname,'/api/tasks/:id/target-sizes');
  if(targetSizesMatch&&req.method==='POST')return json(res,200,publicTask(await addTaskTargetSizes(targetSizesMatch.id,await readBody(req))));

  const resourceReviewMatch = matchRoute(url.pathname, "/api/tasks/:id/resource-reviews/:templateId");
  if (resourceReviewMatch && req.method === "PUT") {
    const input = await readBody(req);
    const tasks = await readJson(tasksFile);
    const index = tasks.findIndex((item) => item.id === resourceReviewMatch.id);
    if (index < 0) return json(res, 404, { error: "任务不存在" });
    const task = normalizeTask(tasks[index]);
    const template = templateMap.get(resourceReviewMatch.templateId);
    if (!template || !task.targetTemplateIds.includes(template.id)) return json(res, 404, { error: "资源位不存在" });
    const allowed = new Set(["submitted", "approved", "rejected"]);
    if (!allowed.has(input.status)) return json(res, 400, { error: "资源位审核状态无效" });
    const artifact = task.artifacts?.find((item) => item.templateId === template.id);
    if (artifact) {
      const artifactPath = safeChild(storageDir, task.id, "artifacts", artifact.name);
      const stat = await fs.stat(artifactPath).catch(() => null);
      if (stat) {
        artifact.bytes = stat.size;
        artifact.qc = qcArtifact(artifact, template);
        task.qc = {
          passed: task.artifacts.length === task.targetTemplateIds.length && task.artifacts.every((item) => item.qc?.passed),
          checkedAt: new Date().toISOString(),
        };
      }
    }
    if (["submitted", "approved"].includes(input.status) && !artifact?.qc?.passed) {
      return json(res, 409, { error: `${template.name}尚未通过尺寸、格式和文件大小质检` });
    }
    const now = new Date().toISOString();
    task.resourceReviews[template.id] = {
      status: input.status,
      note: input.note || "",
      by: input.by || "设计师",
      updatedAt: now,
    };
    task.updatedAt = now;
    const action = input.status === "submitted" ? `提交单资源位审核：${template.name}` : input.status === "approved" ? `单资源位审核通过：${template.name}` : `单资源位审核退回：${template.name}`;
    task.history.push({ at: now, action, by: input.by || "设计师", status: task.status, note: input.note || "" });
    tasks[index] = task;
    await writeJson(tasksFile, tasks);
    return json(res, 200, publicTask(task));
  }

  // 浏览器逐个上传选中文件夹里的素材：PUT /api/material-folder/upload/<编号>?path=<文件夹里的相对路径>
  const materialUploadMatch = /^\/api\/material-folder\/upload\/([0-9a-f-]{36})$/.exec(url.pathname);
  if (materialUploadMatch && req.method === 'PUT') {
    const relative = String(url.searchParams.get('path') || '').split('/').filter(Boolean);
    if (!relative.length || relative.length > 8 || relative.some(part => part === '..' || part.startsWith('.') || /[\\:*?"<>|\u0000-\u001f]/.test(part)))
      return json(res, 422, { error: '素材文件路径无效' });
    if (!['.jpg','.jpeg','.png','.webp','.psd','.psb'].includes(path.extname(relative.at(-1)).toLowerCase())) return json(res, 422, { error: '只接收 JPG、PNG、WebP、PSD、PSB 素材' });
    const folder = path.join(materialUploadRoot, materialUploadMatch[1]);
    await fs.mkdir(folder, { recursive: true });
    const existing = await listAssetFiles(folder).catch(() => []);
    if (existing.length >= 120) return json(res, 422, { error: '素材包文件超过 120 个，请精简后重试' });
    const target = safeChild(folder, ...relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, await readRawBody(req, 2 * 1024 * 1024 * 1024));
    // 中转文件 24 小时后清理
    for (const entry of await fs.readdir(materialUploadRoot, { withFileTypes: true }).catch(() => [])) {
      const stat = await fs.stat(path.join(materialUploadRoot, entry.name)).catch(() => null);
      if (stat && Date.now() - stat.mtimeMs > 24 * 3600 * 1000) await fs.rm(path.join(materialUploadRoot, entry.name), { recursive: true, force: true });
    }
    return json(res, 201, { ok: true });
  }
  if (url.pathname === '/api/material-folder/inspect' && req.method === 'POST') {
    const input=await readBody(req), folder=resolveWorkspaceFolder(input.folderPath,req);
    const stat=await fs.stat(folder).catch(()=>null);
    if(!stat?.isDirectory()) return json(res,404,{error:'素材文件夹不存在，请检查路径'});
    const files=await listAssetFiles(folder);
    if(!files.length) return json(res,422,{error:'文件夹中没有 JPG、PNG、WebP、PSD 或 PSB 素材'});
    return json(res,200,{files:files.map(file=>({name:path.basename(file)}))});
  }

  const folderPackMatch = matchRoute(url.pathname, "/api/tasks/:id/assets/import-folder");
  if (folderPackMatch && req.method === "POST") {
    const input = await readBody(req);
    const tasks = await readJson(tasksFile);
    const task = tasks.find((item) => item.id === folderPackMatch.id);
    if (!task) return json(res, 404, { error: "任务不存在" });
    normalizeTask(task);
    const folder = resolveWorkspaceFolder(input.folderPath,req);
    const stat = await fs.stat(folder).catch(() => null);
    if (!stat?.isDirectory()) return json(res, 404, { error: "素材包文件夹不存在，请检查路径" });
    const imported = await importAssetsFromFolder(task, folder);
    await writeJson(tasksFile, tasks);
    return json(res, imported.length ? 201 : 200, { ...publicTask(task), importedCount: imported.length });
  }

  const kvPackMatch = matchRoute(url.pathname, "/api/tasks/:id/assets/import-kv-pack");
  if (kvPackMatch && req.method === "POST") {
    const input = await readBody(req);
    const tasks = await readJson(tasksFile);
    const task = tasks.find((item) => item.id === kvPackMatch.id);
    if (!task) return json(res, 404, { error: "任务不存在" });
    normalizeTask(task);
    const folder = resolveWorkspaceFolder(input.folderPath || task.parameters?.sourceFolder,req);
    const stat = await fs.stat(folder).catch(() => null);
    if (!stat?.isDirectory()) return json(res, 404, { error: "素材包文件夹不存在，请检查路径" });
    const imported = await importAssetsFromFolder(task, folder);
    await writeJson(tasksFile, tasks);
    return json(res, imported.length ? 201 : 200, { ...publicTask(task), importedCount: imported.length });
  }

  const psdExtractMatch = matchRoute(url.pathname, '/api/tasks/:id/assets/extract-psd');
  if (psdExtractMatch && req.method === 'POST') {
    const input = await readBody(req);
    const tasks = await readJson(tasksFile);
    const task = tasks.find(item => item.id === psdExtractMatch.id);
    if (!task) return json(res, 404, { error: '任务不存在' });
    if (task.status === '已完成') return json(res, 409, { error: '请先开始新版本再添加角色' });
    const source = task.assets.find(asset => asset.name === input.name && isPhotoshopAsset(asset));
    if (!source) return json(res, 404, { error: '未找到 PSD / PSB 源文件' });
    const role = ['character','secondary-character','background','title','subtitle','logo','foreground','supplement'].includes(input.role) ? input.role : 'character';
    const extracted = await extractTaskPsdAssets({ root, storageDir, task, source, role });
    // Parsing can take time: merge only assets into the latest saved task, preserving designer edits.
    const latestTasks = await readJson(tasksFile);
    const latest = latestTasks.find(item => item.id === task.id);
    if (!latest) return json(res, 404, { error: '任务已删除' });
    const latestSource = latest.assets.find(asset => asset.name === source.name);
    if (!latestSource) return json(res, 409, { error: '源文件已移除，请重新导入' });
    Object.assign(latestSource, { role: 'source-psd', psdExtraction: source.psdExtraction });
    latest.assets.push(...extracted.filter(asset => !latest.assets.some(existing => existing.name === asset.name)));
    for (const asset of extracted) {
      const saved = latest.assets.find(existing => existing.name === asset.name);
      if (saved && asset.cutoutPreflight) Object.assign(saved, { cutoutPreflight: asset.cutoutPreflight, needsCutout: asset.needsCutout, transparent: asset.transparent });
      if (asset.cutoutReplacementName) replaceCharacterAsset(latest, asset.name, asset.cutoutReplacementName);
    }
    if (extracted.length) {
      invalidateTaskArtifacts(latest, '从 PSD / PSB 提取原始图层');
      latest.updatedAt = new Date().toISOString();
    }
    await writeJson(tasksFile, latestTasks);
    return json(res, 200, { ...publicTask(latest), extractedCount: extracted.length });
  }

  const replaceCharacterMatch = matchRoute(url.pathname, '/api/tasks/:id/assets/replace-character');
  if (replaceCharacterMatch && req.method === 'POST') {
    const input = await readBody(req);
    const tasks = await readJson(tasksFile);
    const task = tasks.find(item => item.id === replaceCharacterMatch.id);
    if (!task) return json(res, 404, { error: '任务不存在' });
    if (task.status === '已完成') return json(res, 409, { error: '请先开始新版本再替换角色' });
    const replacement = task.assets.find(asset => asset.name === input.replacementName && asset.mime?.startsWith('image/'));
    if (!replacement) return json(res, 404, { error: '未找到透明人物素材' });
    const report = await assessCharacterTransparency(safeChild(storageDir, task.id, replacement.bucket || 'assets', replacement.name));
    if (!report.actualTransparency) return json(res, 422, { error: '替换素材仍带背景，请提供已抠图的透明人物素材' });
    // Read the latest edits after image analysis; replacement never resets layout or effects.
    const latestTasks = await readJson(tasksFile);
    const latest = latestTasks.find(item => item.id === task.id);
    if (!latest) return json(res, 404, { error: '任务已删除' });
    normalizeTask(latest);
    if (latest.status === '已完成') return json(res, 409, { error: '请先开始新版本再替换角色' });
    try {
      const output = replaceCharacterAsset(latest, input.sourceName, input.replacementName);
      output.cutoutPreflight = report;
    } catch (error) { return json(res, 422, { error: error.message }); }
    invalidateTaskArtifacts(latest, '已替换透明人物素材，保留原文件和所有手工排版');
    latest.communityMasterApproval = null;
    latest.updatedAt = new Date().toISOString();
    await writeJson(tasksFile, latestTasks);
    return json(res, 200, publicTask(latest));
  }

  const assetMatch = matchRoute(url.pathname, "/api/tasks/:id/assets");
  if (assetMatch && req.method === "POST") {
    const input = await readBody(req);
    const tasks = await readJson(tasksFile);
    const task = tasks.find((item) => item.id === assetMatch.id);
    if (!task) return json(res, 404, { error: "任务不存在" });
    const saved = [];
    for (const file of input.files || []) {const extension=path.extname(file.name),name=isSourceAdaptation(task)?`${path.basename(file.name,extension)}-${randomUUID().slice(0,8)}${extension}`:file.name;saved.push(await saveDataFile(task.id, "assets", name, file.dataUrl));}
    if (input.role !== 'mother-candidate') invalidateTaskArtifacts(task, `上传素材 ${saved.map((file) => file.name).join("、")}，旧版结果已撤回`);
    if (!isSourceAdaptation(task)&&['logo','ip-copyright','copyright'].includes(input.role) && task.targetTemplateIds.some(id => templateMap.get(id)?.communityPlacement)) {
      const kind=input.role==='logo'?'logo':'ip-copyright';
      task.assets = task.assets.filter(asset => kind==='logo' ? asset.role!=='logo' : !['ip-copyright','copyright'].includes(asset.role));
      task.parameters ||= {};
      task.parameters.assetByRole ||= {};
      task.parameters.assetByRole[kind] = saved.at(-1)?.name || '';
      for (const id of task.targetTemplateIds) if (task.parameters.assetByTemplate?.[id]) delete task.parameters.assetByTemplate[id][kind];
    }
    const toneAsset = input.role === 'mother-candidate' ? task.assets.find(asset => asset.role === 'reference-tone' && asset.mime?.startsWith('image/')) : null;
    const toneReference = toneAsset ? await analyzeCommunityTone(await fs.readFile(safeChild(storageDir,task.id,toneAsset.bucket || 'assets',toneAsset.name))) : null;
    const uploaded = [];
    for (const file of saved) {
      const toneIssues = toneReference ? assessCommunityTone(toneReference, await analyzeCommunityTone(await fs.readFile(safeChild(storageDir,task.id,file.bucket || 'assets',file.name)))) : [];
      uploaded.push({ ...file, role: input.role || 'supplement', createdAt: new Date().toISOString(), ...(toneReference ? {toneIssues} : {}), ...(input.generatorModel && input.role === 'mother-candidate' ? {generatorModel:input.generatorModel} : {}) });
    }
    const uploadedPsdNames = new Set(uploaded.filter(isPhotoshopAsset).map(asset => asset.name));
    task.assets = task.assets.filter(asset => !uploadedPsdNames.has(asset.name));
    if(input.role==='logo')task.assets.unshift(...uploaded);else task.assets.push(...uploaded);
    await prepareCharacterAssets({ storageDir, task, assets: uploaded });
    for (const source of uploaded.filter(isPhotoshopAsset)) {
      source.role = 'source-psd';
      if(!isSourceAdaptation(task))await extractTaskPsdAssets({ root, storageDir, task, source, role: input.role || 'supplement' });
    }
    await maybePrepareSourceTask(task);
    if (task.communityMasterApproval?.fingerprint && task.targetTemplateIds.some(id => templateMap.get(id)?.communityPlacement)) {
      const project=(await readJson(projectsFile)).find(item=>item.id===task.projectId);
      if(task.communityMasterApproval.fingerprint!==communityMasterFingerprint(task,project))task.communityMasterApproval=null;
    }
    task.updatedAt = new Date().toISOString();
    await writeJson(tasksFile, tasks);
    return json(res, 201, publicTask(task));
  }

  const assetDeleteMatch = matchRoute(url.pathname, "/api/tasks/:id/assets/:name");
  if (assetDeleteMatch && req.method === "DELETE") {
    const tasks = await readJson(tasksFile); const task = tasks.find((item) => item.id === assetDeleteMatch.id);
    if (!task) return json(res, 404, { error: "任务不存在" });
    const index = task.assets.findIndex((item) => item.name === assetDeleteMatch.name);
    if (index < 0) return json(res, 404, { error: "素材不存在" });
    if(templateMap.get(task.masterTemplateId)?.communityMaster&&['reference-image','reference-copy','reference-tone'].includes(task.assets[index].role))return json(res,409,{error:'请刷新页面后，在插画或文案各自的参考图区域移除图片'});
    const asset={...task.assets[index],url:task.assets[index].url||`/storage/${task.id}/assets/${encodeURIComponent(task.assets[index].name)}`,projectId:task.projectId||'',kind:'源素材',sources:[{taskKey:`core:${task.id}`,taskId:task.id,module:'core'}]};
    await recycleBin.trashAssets([{...asset,recycleAssetId:assetLibraryKey(asset)}]);
    return json(res,200,publicTask(task));
  }

  const primaryAssetMatch = matchRoute(url.pathname, "/api/tasks/:id/assets/:name/primary");
  if (primaryAssetMatch && req.method === "PUT") {
    const tasks = await readJson(tasksFile); const task = tasks.find((item) => item.id === primaryAssetMatch.id);
    if (!task) return json(res, 404, { error: "任务不存在" }); normalizeTask(task);
    const asset = task.assets.find((item) => item.name === primaryAssetMatch.name && item.mime.startsWith("image/"));
    if (!asset) return json(res, 404, { error: "图片素材不存在" });
    if (task.primaryAssetName !== asset.name) {
      invalidateTaskArtifacts(task, `完整主图更换为 ${asset.name}，旧版结果已撤回`);
    }
    task.primaryAssetName = asset.name; task.updatedAt = new Date().toISOString();
    task.history.push({at:task.updatedAt,action:`设为完整主图：${asset.name}`,by:"设计师",status:task.status});
    await writeJson(tasksFile, tasks); return json(res, 200, publicTask(task));
  }

  const annotationMatch = matchRoute(url.pathname, "/api/tasks/:id/annotations");
  if (annotationMatch && req.method === "PUT") {
    const input = await readBody(req); const tasks = await readJson(tasksFile);
    const task = tasks.find((item) => item.id === annotationMatch.id); if (!task) return json(res, 404, { error: "任务不存在" });
    normalizeTask(task); task.annotations = { objects: input.objects || [], activeType: input.activeType || "core-character", updatedAt: new Date().toISOString() };
    invalidateTaskArtifacts(task, "对象标注已更新，旧版结果已撤回");
    task.updatedAt = task.annotations.updatedAt; await writeJson(tasksFile, tasks); return json(res, 200, publicTask(task));
  }

  const characterCutoutMatch = matchRoute(url.pathname, "/api/tasks/:id/local-ai/cutout");
  if (characterCutoutMatch && req.method === "POST") {
    const input = await readBody(req);
    const tasks = await readJson(tasksFile);
    const task = tasks.find((item) => item.id === characterCutoutMatch.id);
    if (!task) return json(res, 404, { error:"任务不存在" });
    normalizeTask(task);
    const engine = input.engine === "removebg" ? "removebg" : "sam2";
    if (engine === "sam2" && !await fileExists(browserSam2Model)) return json(res, 503, { error:"浏览器抠图模型没有随工作台部署，请联系工作台维护人" });
    const removeBgKey = engine === "removebg" ? await loadRemoveBgKey() : "";
    if (engine === "removebg" && !removeBgKey) return json(res, 503, { error:"remove.bg 没有配置：请工作台负责人在应用「设置 › 环境变量」里填 REMOVE_BG_API_KEY（使用时会把图片发到 remove.bg）；也可以改用浏览器里的 SAM2 抠图" });
    const sourceAsset = task.assets.find((asset) => asset.name === input.sourceAssetName && asset.mime?.startsWith("image/") && ["clean-kv","background","background-landscape","background-portrait","master","master-landscape","master-portrait","generated-background",...CHARACTER_ROLES].includes(asset.role));
    if (!sourceAsset) return json(res, 422, { error:"请选择任务中的人物素材、干净KV或完整主视觉" });
    const points = (Array.isArray(input.points) ? input.points : []).slice(0, 6).map((point) => ({ x:Number(point.x), y:Number(point.y) })).filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
    if (!points.length) return json(res, 422, { error:"请至少点击一个人物脸部；精细模式会按选点逐人裁切" });
    const sourcePath = safeChild(storageDir, task.id, sourceAsset.bucket || "assets", sourceAsset.name);
    const sourceBuffer = await fs.readFile(sourcePath);
    const size = parseImageSize(sourceBuffer);
    if (!size) return json(res, 422, { error:"源图不是可解析的 JPG/PNG 图片" });
    const objects = points.map((point, index) => {
      const x = Math.max(0, Math.min(size.width - 1, point.x));
      const y = Math.max(0, Math.min(size.height - 1, point.y));
      const left = Math.max(0, x - size.width * .2), right = Math.min(size.width, x + size.width * .2);
      const top = Math.max(0, y - size.height * .28), bottom = Math.min(size.height, y + size.height * .55);
      return {
        name:`人物${index + 1}`,
        box:[Math.round(left),Math.round(top),Math.round(right),Math.round(bottom)],
        points:[
          [Math.round(x),Math.round(y)],
          [Math.round(x),Math.round(Math.min(bottom - 2, y + size.height * .18))],
          [Math.round(left + (right - left) * .04),Math.round(y)],
          [Math.round(right - (right - left) * .04),Math.round(y)],
        ],
        labels:[1,1,0,0],
      };
    });
    const outputDir = safeChild(storageDir, task.id, "local-ai");
    await fs.mkdir(outputDir, { recursive:true });
    const tag = path.parse(sourceAsset.name).name.replace(/[^\p{L}\p{N}._-]+/gu, "-");
    const promptPath = safeChild(outputDir, `人物抠图选点__${tag}.json`);
    const outputName = `人物精细抠图-${engine}__${tag}${input.templateId==="community-community-popup"?"-"+randomUUID():""}.png`;
    const outputPath = safeChild(outputDir, outputName);
    try {
      let report = { bounds:null };
      if (engine === "removebg") {
        const sourceWidth = Number(size.width || sourceAsset.width), sourceHeight = Number(size.height || sourceAsset.height);
        // Send the complete KV once. Per-person crops overlap when characters
        // stand close together, which duplicated faces and introduced visible
        // crop seams. A single full-frame segmentation preserves the source
        // pixels, relative scale, and every connected part of the group.
        const apiInput = await sharp(sourceBuffer, { failOn:"none" }).jpeg({ quality:95, chromaSubsampling:"4:4:4" }).toBuffer();
        const form = new FormData();
        form.append("image_file", new Blob([apiInput], { type:"image/jpeg" }), "character-group.jpg");
        form.append("size", "full");
        form.append("type", "person");
        const response = await fetch("https://api.remove.bg/v1.0/removebg", { method:"POST", headers:{ "X-Api-Key":removeBgKey }, body:form });
        if (!response.ok) throw new Error(`remove.bg 整体人物识别失败（${response.status}）：${(await response.text()).slice(0,300)}`);
        const removedBuffer = Buffer.from(await response.arrayBuffer());
        const removedMeta = await sharp(removedBuffer).metadata();
        const alignedBuffer = removedMeta.width === sourceWidth && removedMeta.height === sourceHeight
          ? removedBuffer
          : await sharp(removedBuffer).resize(sourceWidth, sourceHeight, { fit:"fill", kernel:"lanczos3" }).png().toBuffer();
        await sharp(alignedBuffer).png().toFile(outputPath);
        const alpha = await sharp(alignedBuffer).ensureAlpha().extractChannel(3).raw().toBuffer({ resolveWithObject:true });
        const missingFaces = points.map((point, index) => ({ index, x:Math.round(point.x), y:Math.round(point.y) }))
          .filter((point) => point.x < 0 || point.x >= alpha.info.width || point.y < 0 || point.y >= alpha.info.height || alpha.data[point.y * alpha.info.width + point.x] < 64);
        if (missingFaces.length) throw new Error(`整图抠图遗漏 ${missingFaces.length} 位已选人物，请检查结果或改用更合适的抠图模型`);
        let minX = sourceWidth, minY = sourceHeight, maxX = -1, maxY = -1;
        for (let y = 0; y < alpha.info.height; y += 1) for (let x = 0; x < alpha.info.width; x += 1) {
          if (alpha.data[y * alpha.info.width + x] > 8) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
        }
        report.bounds = maxX >= minX ? { x:minX, y:minY, width:maxX - minX + 1, height:maxY - minY + 1 } : { x:0, y:0, width:sourceWidth, height:sourceHeight };
      } else {
        await fs.writeFile(promptPath, JSON.stringify({ objects }, null, 2), "utf8");
        const { stdout } = await localPython([sam2Cutout, "--input",sourcePath,"--prompts",promptPath,"--output",outputPath], { cwd:root, windowsHide:true, timeout:10 * 60 * 1000, maxBuffer:4 * 1024 * 1024 });
        report = JSON.parse(stdout);
      }
      const createdAt = new Date().toISOString();
      const outputSize = parseImageSize(await fs.readFile(outputPath)) || size;
      const method = engine === "removebg" ? "remove-bg-api" : "sam2-click-prompt";
      const output = { name:outputName, label:`精细人物层 · ${sourceAsset.name}`, kind:"foreground", role:"core-character", mime:"image/png", bucket:"local-ai", derived:true, ...(input.templateId==='community-community-popup'?{popupUpload:true}:{}), width:outputSize.width, height:outputSize.height, bytes:(await fs.stat(outputPath)).size, sourceAssetName:sourceAsset.name, subjectBounds:report.bounds, method, qualityStatus:engine === "removebg" ? "external-fine-cutout" : "designer-point-guided", createdAt, url:`/storage/${encodeURIComponent(task.id)}/local-ai/${encodeURIComponent(outputName)}` };
      task.localAi ||= { status:"completed", outputs:[] };
      task.localAi.status = "completed"; task.localAi.completedAt = createdAt; task.localAi.method = method;
      task.localAi.outputs = [...(task.localAi.outputs || []).filter((item) => input.templateId==='community-community-popup'||!(item.kind === "foreground" && item.sourceAssetName === sourceAsset.name)), output];
      task.assets = [...task.assets.filter((asset) => input.templateId==='community-community-popup'||!(asset.derived && asset.role === "core-character" && asset.sourceAssetName === sourceAsset.name)), output];
      if (CHARACTER_ROLES.includes(sourceAsset.role)) replaceCharacterAsset(task, sourceAsset.name, outputName);
      else { task.parameters.assetByRole ||= {}; task.parameters.assetByRole.character = outputName; }
      task.parameters.assetByTemplate ||= {};
      for (const templateId of task.targetTemplateIds) {
        const target = templateMap.get(templateId);
        const background = task.parameters.backgroundByTemplate?.[templateId];
        const explicitBackground = background?.sourceAssetName || task.parameters.assetByTemplate?.[templateId]?.background;
        const sourceMatchesAutomatic = !explicitBackground && ((target?.width / target?.height < 1 && /竖|portrait/i.test(sourceAsset.name)) || (target?.width / target?.height >= 1 && /横|landscape/i.test(sourceAsset.name)));
        if (target?.renderMode === "masked-popup" && (explicitBackground === sourceAsset.name || sourceMatchesAutomatic)) {
          task.parameters.assetByTemplate[templateId] ||= {};
          task.parameters.assetByTemplate[templateId].character = outputName;
          delete task.parameters.layoutByTemplate?.[templateId]?.character;
        }
      }
      task.history.push({ at:createdAt, action:`生成人物精细抠图（${points.length}人）`, by:engine === "removebg" ? "remove.bg API" : "本机 SAM2", status:task.status });
      task.version = Number(task.version || 0) + 1;
      await writeJson(tasksFile, tasks);
      return json(res, 200, publicTask(task));
    } catch (error) {
      return json(res, 500, { error:`人物抠图失败：${error.message}` });
    }
  }

  const localPreprocessMatch = matchRoute(url.pathname, "/api/tasks/:id/local-ai/preprocess");
  if (localPreprocessMatch && req.method === "POST") {
    const tasks = await readJson(tasksFile);
    const task = tasks.find((item) => item.id === localPreprocessMatch.id);
    if (!task) return json(res, 404, { error: "任务不存在" });
    normalizeTask(task);
    const status = await localAiStatus();
    if (!status.installed) return json(res, 503, { error: "本地视觉处理尚未安装完整" });
    const cleanRoles = new Set(["clean-kv", "background", "background-landscape", "background-portrait"]);
    const cleanSources = task.assets.filter((item) => cleanRoles.has(item.role) && item.mime.startsWith("image/"));
    const fallback = task.assets.find((item) => item.name === task.primaryAssetName && item.mime.startsWith("image/"))
      || task.assets.find((item) => ["master-landscape", "master-portrait", "master"].includes(item.role) && item.mime.startsWith("image/"));
    const sourceAssets = task.annotations.objects.length ? [fallback || cleanSources[0]].filter(Boolean) : (cleanSources.length ? cleanSources : [fallback].filter(Boolean));
    if (!sourceAssets.length) return json(res, 422, { error: "请先上传一张不带标题和Logo的干净KV" });
    const outputDir = safeChild(storageDir, task.id, "local-ai");
    const annotationPath = safeChild(outputDir, "annotations.json");
    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(annotationPath, JSON.stringify({ annotations: task.annotations.objects }, null, 2), "utf8");
    for (const name of await fs.readdir(outputDir)) {
      if (/^(前景总图|背景修补草稿|移除蒙版|处理报告)/.test(name)) await fs.unlink(path.join(outputDir, name)).catch(() => {});
    }
    task.localAi = { status: "running", source: sourceAssets[0].name, sources: sourceAssets.map((item) => item.name), startedAt: new Date().toISOString(), offline: true };
    await writeJson(tasksFile, tasks);
    try {
      const reports = [];
      for (const sourceAsset of sourceAssets) {
        const sourcePath = safeChild(storageDir, task.id, "assets", sourceAsset.name);
        const tag = path.parse(sourceAsset.name).name;
        const { stdout } = await localPython([localAiPipeline, "segment", "--input", sourcePath, "--annotations", annotationPath, "--output", outputDir, "--max-side", "1280", "--tag", tag], {
          cwd: root,
          env: { ...process.env, U2NET_HOME: localAiModels },
          windowsHide: true,
          timeout: 10 * 60 * 1000,
          maxBuffer: 4 * 1024 * 1024,
        });
        reports.push({ sourceAsset, report: JSON.parse(stdout) });
      }
      const outputs = reports.flatMap(({ sourceAsset, report }) => [
        { name: report.outputs.foreground, kind: "foreground", sourceAssetName: sourceAsset.name, subjectBounds: report.foreground_bounds },
        { name: report.outputs.repaired_background, kind: "repaired-background", sourceAssetName: sourceAsset.name },
      ]).map((item) => ({ ...item, url: `/storage/${encodeURIComponent(task.id)}/local-ai/${encodeURIComponent(item.name)}` }));
      task.localAi = {
        status: "completed",
        source: sourceAssets[0].name,
        sources: sourceAssets.map((item) => item.name),
        completedAt: new Date().toISOString(),
        offline: true,
        warning: reports[0].report.warning,
        objects: reports.flatMap(({ report }) => report.objects),
        outputs,
      };
      task.history.push({ at: task.localAi.completedAt, action: `完成${sourceAssets.length}套KV的背景与人物拆分`, by: "本地视觉处理器", status: task.status });
      await writeJson(tasksFile, tasks);
      return json(res, 200, publicTask(task));
    } catch (error) {
      task.localAi = { status: "failed", source: sourceAssets[0].name, sources: sourceAssets.map((item) => item.name), failedAt: new Date().toISOString(), offline: true, error: error.message };
      await writeJson(tasksFile, tasks);
      return json(res, 500, { error: `本地处理失败：${error.message}` });
    }
  }
  const candidateMatch = matchRoute(url.pathname, "/api/tasks/:id/outpaint/import-candidate");
  if (candidateMatch && req.method === "POST") {
    const input = await readBody(req);
    const tasks = await readJson(tasksFile);
    const task = tasks.find(item => item.id === candidateMatch.id);
    if (!task) return json(res, 404, { error:"任务不存在" });
    normalizeTask(task);
    const template = templateMap.get(String(input.templateId || ""));
    if (!template || !task.targetTemplateIds.includes(template.id)) return json(res, 404, { error:"资源位不存在" });
    if (outpaintJobs.has(`${task.id}:${template.id}`)) return json(res, 409, { error:"当前资源位正在扩图，请稍后导入" });
    const sourceAsset = resolveOutpaintSource(task, template, input);
    if (!sourceAsset) return json(res, 422, { error:"请先选择原始背景素材" });
    const sourcePath = safeChild(storageDir, task.id, sourceAsset.bucket, sourceAsset.name);
    const sourceBuffer = await fs.readFile(sourcePath);
    const sourceSize = parseImageSize(sourceBuffer);
    const candidate = decodeDataUrl(input.dataUrl);
    const candidateSize = parseImageSize(candidate.buffer);
    if (!sourceSize || !candidateSize || !candidate.mime.startsWith("image/")) return json(res, 422, { error:"请导入 PNG 或 JPG 扩图候选" });
    const savedPlacement = task.parameters?.backgroundByTemplate?.[template.id] || {};
    const placement = savedPlacement.url && savedPlacement.sourceAssetName === sourceAsset.name && savedPlacement.originalPlacement
      ? savedPlacement.originalPlacement : savedPlacement;
    const temporary = path.join(runtimeDir, "registration", `import-${randomUUID()}`);
    await fs.mkdir(temporary, { recursive:true });
    const candidatePath = path.join(temporary, "candidate.png");
    await fs.writeFile(candidatePath, candidate.buffer);
    let registration;
    try {
      const { stdout } = await localPython([path.join(root,"scripts","register-outpaint.py"), "--source", sourcePath, "--generated", candidatePath], { timeout:60000, windowsHide:true, maxBuffer:1024*1024, env:{...process.env,PYTHONIOENCODING:"utf-8"} });
      registration = JSON.parse(stdout);
      if (!protectedComposition(template.width,template.height,sourceSize.width,sourceSize.height,placement,registration.sourceRect).covered) {
        return json(res, 422, { error:"候选图的扩展范围不足以覆盖当前画布" });
      }
      await assertNanoBlankFilled(candidate.buffer, registration.sourceRect);
    } catch (error) {
      return json(res, 422, { error:`候选图与原图无法安全对齐：${String(error.stderr || error.message || "未知错误").trim().split(/\r?\n/).at(-1).slice(0,160)}` });
    } finally {
      await fs.rm(temporary, { recursive:true, force:true });
    }
    const result = await createSafeOutpaint({ sourceBuffer, generatedBuffer:candidate.buffer, width:candidateSize.width, height:candidateSize.height, sourceRect:registration.sourceRect });
    const latestTasks = await readJson(tasksFile);
    const latest = latestTasks.find(item => item.id === task.id);
    if (!latest || latest.outpaint?.status === "running") return json(res, 409, { error:"任务状态已变化，请重新打开任务后导入" });
    const latestBackground = latest.parameters?.backgroundByTemplate?.[template.id] || {};
    if (latestBackground.sourceAssetName && latestBackground.sourceAssetName !== sourceAsset.name) return json(res, 409, { error:"原始背景已变化，请重新选择候选图" });
    const saved = await saveDataFile(task.id,"outpaint",`${template.id}-candidate-${Date.now()}.png`,`data:image/png;base64,${result.buffer.toString("base64")}`);
    const completedAt = new Date().toISOString();
    registration = {...registration, sourceRect:result.sourceRect, safetyMethod:result.safetyMethod};
    latest.parameters ||= {};
    latest.parameters.backgroundByTemplate ||= {};
    latest.parameters.backgroundByTemplate[template.id] = {...latestBackground, url:saved.url, sourceAssetName:sourceAsset.name,
      modelUsed:"imported_candidate", registration, originalPlacement:placement, safetyMethod:result.safetyMethod,
      pipelineVersion:6, qualityStatus:"manual-style-review-required", smartExpand:false, scale:100, focalX:50, focalY:50};
    latest.outpaint = {status:"completed",templateId:template.id,model:"imported_candidate",modelUsed:"imported_candidate",sourceName:sourceAsset.name,
      originalPlacement:placement,completedAt,qualityStatus:"manual-style-review-required",reviewRequired:["style-consistency","seam-continuity"],
      outputs:[{templateId:template.id,model:"imported_candidate",url:saved.url,width:result.width,height:result.height,format:"PNG",bytes:saved.bytes,safetyMethod:result.safetyMethod,createdAt:completedAt}]};
    invalidateTaskArtifacts(latest, `扩图候选更新“${template.name}”背景`);
    latest.history.push({at:completedAt,action:`导入扩图候选：${template.name}`,by:"设计师",status:latest.status});
    await writeJson(tasksFile, latestTasks);
    return json(res, 200, publicTask(latest));
  }
  const outpaintMatch = matchRoute(url.pathname, "/api/tasks/:id/outpaint");
  if (outpaintMatch && req.method === "POST") {
    const input = await readBody(req);
    const tasks = await readJson(tasksFile);
    const task = tasks.find((item) => item.id === outpaintMatch.id);
    if (!task) return json(res, 404, { error: "任务不存在" });
    normalizeTask(task);
    const template = templateMap.get(String(input.templateId || ""));
    if (!template || !task.targetTemplateIds.includes(template.id)) return json(res, 404, { error: "资源位不存在" });
    if (input.model === "tx") return json(res, 422, { error: "腾讯扩图不执行提示词约束，已禁止用于生产扩图；请使用默认的 RH 扩图" });
    const config = await loadAiHuabuConfig(task);
    if (config.enabled === false) return json(res, 503, { error: "外部 AI 扩图未启用" });

    const sourceAsset = resolveOutpaintSource(task, template, input);
    if (!sourceAsset) return json(res, 422, { error: "当前资源位没有可用的背景素材，请先上传并设为背景" });
    let sourceBuffer;
    try {
      sourceBuffer = await fs.readFile(safeChild(storageDir, task.id, sourceAsset.bucket, sourceAsset.name));
    } catch {
      return json(res, 422, { error: "模板源图不存在，请先为当前资源位选择背景素材" });
    }
    const sourceSize = parseImageSize(sourceBuffer);
    if (!sourceSize) return json(res, 422, { error: "源图不是可解析的 JPG/PNG 图片" });
    const savedPlacement = task.parameters?.backgroundByTemplate?.[template.id] || {};
    // Re-running an existing outpaint must use the original KV placement. The
    // generated canvas itself is stored at 100%, which would otherwise make the
    // endpoint incorrectly report that no extension is needed.
    const placement = savedPlacement.url && savedPlacement.sourceAssetName === sourceAsset.name && savedPlacement.originalPlacement
      ? savedPlacement.originalPlacement
      : savedPlacement;
    const requestedModel = input.model === "rh" ? "rh" : "banana";
    const requestFingerprint = createHash("sha256").update(sourceBuffer).update(JSON.stringify({
      templateId:template.id, model:requestedModel,
      focalX:Number(placement.focalX ?? 50), focalY:Number(placement.focalY ?? 50), scale:Number(placement.scale ?? 100),
      prompt:String(input.prompt || "").trim(), allowNewSubjects:input.allowNewSubjects === true,
    })).digest("hex");
    if (requestedModel === "banana" && task.outpaintFailureFingerprints?.includes(requestFingerprint)) {
      return json(res, 409, { error:"这张源图与当前构图已验证：Nano 会忽略待补区域。相同设置不再重复提交。请使用已生成的候选图、调整构图，或导入其他扩图候选。" });
    }
    const requestedGaps = placementPixelGaps(sourceSize.width, sourceSize.height, template.width, template.height, placement);
    if (!requestedGaps.gaps) {
      return json(res, 200, { message: `当前背景已覆盖 ${template.width}×${template.height} 画布，无需扩图（可继续用焦点裁剪）` });
    }

    const key = `${task.id}:${template.id}`;
    if (outpaintJobs.has(key)) return json(res, 202, { message: "该资源位扩图正在执行，请稍候", outpaint: outpaintJobs.get(key).state });
    if (task.outpaint?.status === "running") {
      task.outpaint = { status: "failed", templateId: template.id, failedAt: new Date().toISOString(), error: "上一次扩图中断（服务重启），请重试" };
    }
    const job = {
      status: "running",
      templateId: template.id,
      model: input.model === "tx" ? "tx" : input.model === "rh" ? "rh" : input.model === "banana" || input.model === "banana_pro" ? "banana" : "auto",
      prompt: String(input.prompt || ""),
      allowNewSubjects: input.allowNewSubjects === true,
      safetyPolicy: input.allowNewSubjects === true ? "subject-generation-exception" : "environment-only",
      source: sourceAsset.url,
      sourceName: sourceAsset.name,
      requestFingerprint,
      originalPlacement: {
        focalX: Number(placement.focalX ?? 50),
        focalY: Number(placement.focalY ?? 50),
        scale: Number(placement.scale ?? 100),
      },
      startedAt: new Date().toISOString(),
    };
    task.outpaint = job;
    task.history.push({ at: job.startedAt, action: `开始 AI 扩图：${template.name}`, by: "AI 扩图执行器", status: task.status });
    await writeJson(tasksFile, tasks);

    const promise = (async () => {
      try {
        const result = await runOutpaint(task, template, config, input, job, sourceAsset, sourceBuffer, sourceSize);
        const dataUrl = `data:${result.mime};base64,${result.buffer.toString("base64")}`;
        const saved = await saveDataFile(task.id, "outpaint", `${template.id}-${Date.now()}.${result.format}`, dataUrl);
        await cleanupOutpaintFiles(task.id, template.id, saved.name);
        // 写回前重新读取，避免覆盖并发参数保存
        const latestTasks = await readJson(tasksFile);
        const latest = latestTasks.find((item) => item.id === task.id);
        if (!latest) throw new ApiError("gone", "任务已被删除");
        const completedAt = new Date().toISOString();
        latest.outpaint = {
          ...job,
          status: "completed",
          pipelineVersion: 5,
          qualityStatus: "manual-style-review-required",
          safetyChecks: ["original-preserved", "canvas-coverage"],
          reviewRequired: ["style-consistency", "no-new-subjects", "no-text-logo-watermark", "seam-continuity"],
          modelUsed: result.model,
          jobId: result.jobId,
          completedAt,
          outputs: [{ templateId: template.id, model: result.model, url: saved.url, width: result.width, height: result.height, format: result.format.toUpperCase(), bytes: saved.bytes, safetyMethod:result.safetyMethod, createdAt: completedAt }],
        };
        latest.parameters ||= {};
        latest.parameters.backgroundByTemplate ||= {};
        latest.parameters.backgroundByTemplate[template.id] = {
          ...(latest.parameters.backgroundByTemplate[template.id] || {}),
          url: saved.url,
          modelUsed: result.model,
          sourceAssetName: job.sourceName,
          registration: result.registration,
          originalPlacement: job.originalPlacement,
          pipelineVersion: 5,
          qualityStatus: "manual-style-review-required",
          safetyMethod: result.safetyMethod,
          allowNewSubjects: input.allowNewSubjects === true,
          safetyPolicy: input.allowNewSubjects === true ? "subject-generation-exception" : "environment-only",
          scale: 100,
          focalX: result.registration ? 50 : Number(placement.focalX ?? 50),
          focalY: result.registration ? 50 : Number(placement.focalY ?? 50),
          smartExpand: false,
        };
        const modelLabel = result.model === "banana_pro" ? "Nano Banana Pro" : result.model === "rh_image_outpaint" ? "RH 扩图" : "腾讯云扩图";
        invalidateTaskArtifacts(latest, `AI 扩图更新“${template.name}”背景，旧版结果已撤回`);
        latest.history.push({ at: completedAt, action: `完成 AI 扩图：${template.name}（${modelLabel}）`, by: "AI 扩图执行器", status: latest.status });
        await writeJson(tasksFile, latestTasks);
        return publicTask(latest);
      } catch (error) {
        const errorText = error instanceof ApiError ? translateApiError(error.code, error.message) : error.message;
        try {
          const latestTasks = await readJson(tasksFile);
          const latest = latestTasks.find((item) => item.id === task.id);
          if (latest) {
            latest.outpaint = { ...job, status: "failed", failedAt: new Date().toISOString(), error: errorText };
            if (job.model === "banana" && ["ignored-extension", "alignment"].includes(error.code)) {
              latest.outpaintFailureFingerprints = [...new Set([...(latest.outpaintFailureFingerprints || []), requestFingerprint])].slice(-20);
            }
            latest.history.push({ at: latest.outpaint.failedAt, action: `AI 扩图失败：${template.name}`, by: "AI 扩图执行器", status: latest.status });
            await writeJson(tasksFile, latestTasks);
          }
        } catch {}
        throw new ApiError("failed", errorText, error instanceof ApiError ? error.status : 502);
      }
    })();
    outpaintJobs.set(key, { state: job, promise });
    try {
      const result = await promise;
      outpaintJobs.delete(key);
      return json(res, 200, result);
    } catch (error) {
      outpaintJobs.delete(key);
      return json(res, error.status || 502, { error: error.message });
    }
  }

  if (req.method === "POST" && url.pathname === "/api/png/optimize") {
    const input = await readBody(req);
    const decoded = decodeDataUrl(input.dataUrl);
    if (decoded.mime !== "image/png") return json(res, 422, { error: "仅支持优化PNG文件" });
    const optimized = await optimizePngLosslessly(decoded.buffer);
    return json(res, 200, { bytes: optimized.length, dataUrl: `data:image/png;base64,${optimized.toString("base64")}` });
  }
  const artifactMatch = matchRoute(url.pathname, "/api/tasks/:id/artifacts");
  if (artifactMatch && req.method === "POST") {
    const input = await readBody(req);
    const tasks = await readJson(tasksFile);
    const task = tasks.find((item) => item.id === artifactMatch.id);
    if (!task) return json(res, 404, { error: "任务不存在" });
    if(input.expectedUpdatedAt&&input.expectedUpdatedAt!==task.updatedAt)return json(res,409,{error:'尺寸画面已更新，请按当前画面重新输出，旧稿未覆盖'});
    normalizeTask(task);
    const communityTask = task.targetTemplateIds.some(id => templateMap.get(id)?.communityPlacement);
    if(task.sourceAdaptation&&(communityGenerationJobs.has(task.id)||input.expectedUpdatedAt!==task.updatedAt))return json(res,409,{error:'源稿正在处理或已更新，请等待完成后重新输出'});
    if (communityTask) {
      const project = (await readJson(projectsFile)).find(item => item.id === task.projectId);
      if (!task.communityMasterApproval?.fingerprint || task.communityMasterApproval.fingerprint !== communityMasterFingerprint(task,project)) {
        return json(res,409,{error:'母稿素材、文案或项目版权标识已变化，请先在工作台重新确认母稿'});
      }
      const pending=task.targetTemplateIds.map(id=>templateMap.get(id)).filter(template=>communityArtworkTargetPending(task,template));
      if(pending.length)return json(res,409,{error:`还有 ${pending.length} 个尺寸没有对应当前母版的重排稿，不能把母版参考作为成品提交`});
    }
    const files = input.files || [];
    const sourceCopyrightProject=task.sourceAdaptation?(await readJson(projectsFile)).find(p=>p.id===task.projectId):null;
    if(task.sourceAdaptation)for(const file of files){const key=sourceCopyrightKey(task,templateMap.get(file.templateId),sourceCopyrightProject);if(key&&file.sourceCopyrightKey!==key)return json(res,409,{error:'源稿版权标识已更新，请刷新工作台后重新输出'});}
    if (files.length !== task.targetTemplateIds.length || new Set(files.map(item => item.templateId)).size !== files.length) {
      return json(res, 422, { error: "每个目标资源位必须恰好提交一张成品" });
    }
    const uploadedIds = new Set(files.map((item) => item.templateId).filter((id) => templateMap.has(id)));
    const missing = task.targetTemplateIds.filter((id) => !uploadedIds.has(id));
    const extra = [...uploadedIds].filter((id) => !task.targetTemplateIds.includes(id));
    if (missing.length || extra.length) {
      return json(res, 422, { error: `成品与目标资源位不一致（缺少 ${missing.map((id) => templateMap.get(id)?.name || id).join("、") || "无"}；多余 ${extra.map((id) => templateMap.get(id)?.name || id).join("、") || "无"}），请重新生成` });
    }
    if (communityTask && task.communityGeneration?.phase === 'targets') {
      reconcileCommunityTargetExtension(task);
      if (task.communityGeneration.status !== 'done' || task.communityGeneration.done !== task.communityGeneration.total) {
        return json(res, 409, { error: `还有 ${task.communityGeneration.total - task.communityGeneration.done} 个尺寸未按确认母版延展，不能输出整套素材` });
      }
    }
    if (communityTask) {
      for (const file of files) {
        const template = templateMap.get(file.templateId);
        const { mime, buffer } = decodeDataUrl(file.dataUrl);
        const actual = await sharp(buffer).metadata();
        if(task.sourceAdaptation){try{assertSourceExport(task,template,await sharp(buffer,{limitInputPixels:40000000}).ensureAlpha().raw().toBuffer());}catch(error){return json(res,422,{error:error.message});}}
        if(popupConfig(task,template))await assertPopupPng(buffer);
        const format=template.customTarget&&template.format==='JPG'?'JPG':'PNG',mimeType=format==='JPG'?'image/jpeg':'image/png',imageFormat=format==='JPG'?'jpeg':'png';
        if (mime !== mimeType || actual.format !== imageFormat || actual.width !== template.width || actual.height !== template.height || buffer.length > template.maxBytes || file.width !== actual.width || file.height !== actual.height || String(file.format).toUpperCase() !== format) {
          return json(res, 422, { error: `${template.name} 成品须为 ${template.width}×${template.height} ${format} 且不超过 ${Math.round(template.maxBytes / 1024)}KB` });
        }
      }
    }
    const platformTemplateIds = new Set((await readJson(resourceProfilesFile)).filter(profile => profile.segmentId === "platform").map(profile => profile.templateId));
    const staleSourceCopyright=task.sourceAdaptation&&task.artifacts?.some(a=>{const key=sourceCopyrightKey(task,templateMap.get(a.templateId),sourceCopyrightProject);return key&&a.sourceCopyrightKey!==key;});
    if(staleSourceCopyright){rememberSourceVersion(task,'补齐 IP 版权前的成品');task.version=(task.version||1)+1;}
    const artifacts = [];
    for (const file of files) {
      const template = templateMap.get(file.templateId);
      if (!template) continue;
      const finalName = platformTemplateIds.has(template.id)
        ? resourceOutputName(template)
        : artifactName(task.project, template, task.version);
      const saved = await saveDataFile(task.id, "artifacts", finalName, file.dataUrl);
      const hasPsdRule = psdLayoutRules.templates.some((rule) => rule.templateId === template.id && (rule.variants?.length || rule.globalRegions?.length));
      const artifact = { ...saved, ...(task.sourceAdaptation?{sourceCopyrightKey:sourceCopyrightKey(task,template,sourceCopyrightProject)}:{}), templateId: template.id, width: file.width, height: file.height, format: file.format, templateApplied: !template.requiresPsd || (Boolean(file.templateApplied) && hasPsdRule), createdAt: new Date().toISOString() };
      artifact.qc = qcArtifact(artifact, template);
      artifacts.push(artifact);
    }
    task.artifacts = artifacts;
    task.qc = { passed: artifacts.length === task.targetTemplateIds.length && artifacts.every((item) => item.qc.passed), checkedAt: new Date().toISOString() };
    task.visualReview = { status: "pending", note: "等待设计师成套视觉审核" };
    task.status = task.qc.passed ? "成套审核" : "生成失败";
    task.updatedAt = new Date().toISOString();
    task.history.push({ at: task.updatedAt, action: "完成批量生成与技术质检", by: input.by || "本地执行器", status: task.status });
    await writeJson(tasksFile, tasks);
    return json(res, 201, publicTask(task));
  }

  const coverPreviewMatch = matchRoute(url.pathname, "/api/tasks/:id/cover-preview");
  if (coverPreviewMatch && req.method === "POST") {
    const input = await readBody(req, 2 * 1024 * 1024);
    const tasks = await readJson(tasksFile);
    const task = tasks.find((item) => item.id === coverPreviewMatch.id);
    if (!task) return json(res, 404, { error: "任务不存在" });
    if (input.templateId!==task.masterTemplateId&&!task.targetTemplateIds.includes(input.templateId)) return json(res, 422, { error: "预览尺寸不属于当前任务" });
    const decoded = decodeDataUrl(input.dataUrl);
    if (decoded.mime !== "image/jpeg" || decoded.buffer.length > 1024 * 1024) return json(res, 422, { error: "首页预览需要小于 1MB 的 JPG" });
    const metadata = await sharp(decoded.buffer).metadata();
    if (metadata.format !== "jpeg" || !metadata.width || !metadata.height || Math.max(metadata.width, metadata.height) > 800) return json(res, 422, { error: "首页预览尺寸无效" });
    const saved = await saveDataFile(task.id, "covers", "home-cover.jpg", input.dataUrl);
    task.coverPreview = { ...saved, templateId: input.templateId, width: metadata.width, height: metadata.height, updatedAt: new Date().toISOString() };
    task.coverPreview.url += `?v=${encodeURIComponent(task.coverPreview.updatedAt)}`;
    await writeJson(tasksFile, tasks);
    return json(res, 201, publicTask(task));
  }

  const previewMatch = matchRoute(url.pathname, "/api/tasks/:id/previews");
  if (previewMatch && req.method === "POST") {
    const input = await readBody(req); const tasks = await readJson(tasksFile);
    const platformTemplateIds = new Set((await readJson(resourceProfilesFile)).filter(profile => profile.segmentId === "platform").map(profile => profile.templateId));
    const task = tasks.find((item) => item.id === previewMatch.id); if (!task) return json(res, 404, { error: "任务不存在" }); normalizeTask(task);
    const previews = [];
    for (const file of input.files || []) {
      const template = templateMap.get(file.templateId);
      if (!template || !task.targetTemplateIds.includes(template.id)) continue;
      const extension = file.format === "PNG" ? "png" : "jpg";
      const outputName = platformTemplateIds.has(template.id)
        ? resourceOutputName({ ...template, format:file.format })
        : `${sanitizeFileName(task.project)}_${sanitizeFileName(template.name)}_页面效果_v${task.version}.${extension}`;
      const saved = await saveDataFile(task.id, "previews", outputName, file.dataUrl);
      previews.push({ ...saved, templateId: template.id, width: file.width, height: file.height, format: file.format, createdAt: new Date().toISOString() });
    }
    task.pagePreviews = previews; task.updatedAt = new Date().toISOString(); await writeJson(tasksFile, tasks); return json(res, 201, publicTask(task));
  }

  const queueMatch = matchRoute(url.pathname, "/api/tasks/:id/queue");
  if (queueMatch && req.method === "POST") {
    const tasks = await readJson(tasksFile);
    const task = tasks.find((item) => item.id === queueMatch.id);
    if (!task) return json(res, 404, { error: "任务不存在" });
    if (!["生成失败", "批量生成"].includes(task.status)) return json(res, 409, { error: "任务必须处于批量生成或返工生成状态" });
    const jobs = await readJson(jobsFile);
    const pendingJob = jobs.find((item) => item.taskId === task.id && ["queued", "processing"].includes(item.status));
    if (pendingJob) return json(res, 409, { error: "该任务已有排队或执行中的 Photoshop 任务，不能重复发送" });
    invalidateTaskArtifacts(task, "进入 Photoshop 执行队列，旧版结果已撤回");
    const job = { id: randomUUID(), taskId: task.id, status: "queued", attempts: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    jobs.push(job);
    task.status = "批量生成";
    task.updatedAt = job.updatedAt;
    task.history.push({ at: job.updatedAt, action: "进入 Photoshop 执行队列", by: "设计师", status: task.status });
    await Promise.all([writeJson(jobsFile, jobs), writeJson(tasksFile, tasks)]);
    return json(res, 201, job);
  }

  const confirmSuiteMatch=matchRoute(url.pathname,'/api/tasks/:id/confirm-materials-package');
  if(confirmSuiteMatch&&req.method==='POST')return json(res,200,publicTask(await confirmCommunitySuite(confirmSuiteMatch.id,await readBody(req))));
  const materialsPackageMatch = matchRoute(url.pathname, "/api/tasks/:id/materials-package");
  if (materialsPackageMatch && req.method === "GET") {
    const tasks = await readJson(tasksFile);
    const task = tasks.find((item) => item.id === materialsPackageMatch.id);
    if (!task) return json(res, 404, { error: "任务不存在" });
    if (!task.artifacts?.length) return json(res, 409, { error: "任务尚无可下载成品，请先生成全部尺寸" });
    const files = [];
    for (const artifact of task.artifacts) {
      const filePath = safeChild(storageDir, task.id, "artifacts", artifact.name);
      files.push({ name: "01_Banner成品/" + taskArtifactExportName(task,artifact,templateMap.get(artifact.templateId)), data: await fs.readFile(filePath) });
    }
    for (const preview of task.pagePreviews || []) {
      const filePath = safeChild(storageDir, task.id, "previews", preview.name);
      files.push({ name: "02_页面效果预览/" + preview.name, data: await fs.readFile(filePath) });
    }
    const report = {
      packageType: "working-materials",
      note: "当前生产素材包；技术质检和视觉审核状态以本报告为准",
      taskId: task.id,
      project: task.project,
      version: task.version,
      status: task.status,
      qc: task.qc,
      artifacts: task.artifacts.map(artifact=>({...artifact,name:taskArtifactExportName(task,artifact,templateMap.get(artifact.templateId))})),
      pagePreviews: task.pagePreviews || []
    };
    files.push({ name: "03_生产与质检报告/生产与质检报告.json", data: Buffer.from(JSON.stringify(report, null, 2)) });
    const zip = createStoreZip(files);
    const filename = sanitizeFileName(task.project) + (task.targetTemplateIds.some(id => templateMap.get(id)?.communityPlacement) ? "_成套素材_v" : "_当前素材包_v") + task.version + ".zip";
    res.writeHead(200, {
      "Content-Type": "application/zip",
      "Content-Length": zip.length,
      "Content-Disposition": "attachment; filename*=UTF-8''" + encodeURIComponent(filename)
    });
    return res.end(zip);
  }
  const packageMatch = matchRoute(url.pathname, "/api/tasks/:id/package");
  if (packageMatch && req.method === "GET") {
    const tasks = await readJson(tasksFile);
    const task = tasks.find((item) => item.id === packageMatch.id);
    if (!task) return json(res, 404, { error: "任务不存在" });
    if(task.customCanvas){
      if(task.status!=='已完成'||!task.artifacts?.length)return json(res,409,{error:'请先在制作界面导出当前自定义画布'});
      const files=await Promise.all(task.artifacts.map(async artifact=>({name:artifact.displayName||artifact.name,data:await fs.readFile(safeChild(storageDir,task.id,'artifacts',artifact.name))}))),zip=createStoreZip(files);
      res.writeHead(200,{'Content-Type':'application/zip','Content-Length':zip.length,'Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(sanitizeFileName(task.project)+'_自定义尺寸.zip')}`});return res.end(zip);
    }
    const archivedDeliveryRequested = url.searchParams.get('delivery') === 'latest';
    if (task.deliveredPackage?.name && (task.status === '已完成' || archivedDeliveryRequested)) {
      const storedName = task.deliveredPackage.name;
      const archived = await fs.readFile(safeChild(storageDir, task.id, "deliveries", storedName));
      const {buffer:zip,name:filename}=renamedTaskArchive(archived,storedName,task.project);
      res.writeHead(200, { "Content-Type": "application/zip", "Content-Length": zip.length, "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}` });
      return res.end(zip);
    }
    if (task.status !== "已完成") return json(res, 409, { error: "成套视觉审核通过后才能下载交付 ZIP" });
    if (task.targetTemplateIds.some(id=>templateMap.get(id)?.communityPlacement)) {
      const project=(await readJson(projectsFile)).find(item=>item.id===task.projectId);
      if (!task.communityMasterApproval?.fingerprint || task.communityMasterApproval.fingerprint!==communityMasterFingerprint(task,project)) return json(res,409,{error:'母稿已更新，旧版成品不可交付'});
    }
    if (elementEffectsOutputStale(task)) return json(res, 409, { error: "描边或投影已修改，请重新生成并审核成套成品" });
    const readinessErrors = validateDeliveryReadiness(task, resourceRuleMap);
    if (readinessErrors.length) return json(res, 409, { error: readinessErrors.join("；") });
    if (!task.artifacts.length) return json(res, 409, { error: "任务尚无可下载成品" });
    const files = [];
    for (const artifact of task.artifacts) {
      const filePath = safeChild(storageDir, task.id, "artifacts", artifact.name);
      files.push({ name: `01_Banner成品/${taskArtifactExportName(task,artifact,templateMap.get(artifact.templateId))}`, data: await fs.readFile(filePath) });
    }
    for (const preview of task.pagePreviews || []) {
      const filePath = safeChild(storageDir, task.id, "previews", preview.name);
      files.push({ name: `02_页面效果预览/${preview.name}`, data: await fs.readFile(filePath) });
    }
    const report = { taskId: task.id, project: task.project, version: task.version, categoryReferences: task.referenceIds || [], qc: task.qc, annotations: task.annotations || {}, artifacts: task.artifacts.map(artifact=>({...artifact,name:taskArtifactExportName(task,artifact,templateMap.get(artifact.templateId))})), pagePreviews: task.pagePreviews || [] };
    files.push({ name: "03_生产与质检报告/生产与质检报告.json", data: Buffer.from(JSON.stringify(report, null, 2)) });
    const zip = createStoreZip(files);
    const filename = `${sanitizeFileName(task.project)}_成套素材_v${task.version}.zip`;
    const now = new Date().toISOString();
    const archivePath = safeChild(storageDir, task.id, "deliveries", filename);
    await fs.mkdir(path.dirname(archivePath), { recursive: true });
    await fs.writeFile(archivePath, zip);
    task.deliveredPackage = { name: filename, version: task.version, bytes: zip.length, sha256: createHash("sha256").update(zip).digest("hex"), at: now, targetTemplateIds: [...task.targetTemplateIds] };
    task.unreleasedChanges = false;
    task.updatedAt = now;
    task.history.push({ at: now, action: "下载成套ZIP", by: "设计师", status: task.status });
    await writeJson(tasksFile, tasks);
    res.writeHead(200, { "Content-Type": "application/zip", "Content-Length": zip.length, "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}` });
    return res.end(zip);
  }

  if (req.method === "POST" && url.pathname === "/api/brands") {
    const input = await readBody(req);
    if (!String(input.name || "").trim()) return json(res, 422, { error: "品牌包名称不能为空" });
    const brands = await readJson(brandsFile);
    const brand = { id: randomUUID(), name: input.name.trim(), colors: input.colors || [], fonts: input.fonts || [], rules: input.rules || "", assets: [] };
    brands.push(brand);
    await writeJson(brandsFile, brands);
    return json(res, 201, brand);
  }

  const brandAssetMatch = matchRoute(url.pathname, "/api/brands/:id/assets");
  if (brandAssetMatch && req.method === "POST") {
    const input = await readBody(req);
    const brands = await readJson(brandsFile);
    const brand = brands.find((item) => item.id === brandAssetMatch.id);
    if (!brand) return json(res, 404, { error: "品牌包不存在" });
    const saved = [];
    for (const file of input.files || []) saved.push(await saveDataFile("brands", brand.id, file.name, file.dataUrl));
    brand.assets.push(...saved.map((file) => ({ ...file, createdAt: new Date().toISOString() })));
    await writeJson(brandsFile, brands);
    return json(res, 201, brand);
  }

  if (req.method === "GET" && url.pathname === "/api/worker/next") {
    let jobs = await readJson(jobsFile);
    const requestedJobId = url.searchParams.get("jobId");
    const leaseMs = Number(url.searchParams.get("leaseMs")) || 30 * 60 * 1000;
    const now = Date.now();
    let changed = false;
    // 回收超时未回报的 processing 任务（worker 崩溃/本机重启），允许重新执行。
    for (const item of jobs) {
      if (item.status === "processing" && now - new Date(item.updatedAt).getTime() > leaseMs) {
        item.status = "queued";
        item.updatedAt = new Date().toISOString();
        changed = true;
      }
    }
    const tasks = await readJson(tasksFile);
    let claimed = null;
    let claimedTask = null;
    for (const job of jobs) {
      if (job.status !== "queued" || (requestedJobId && job.id !== requestedJobId)) continue;
      const task = tasks.find((item) => item.id === job.taskId);
      if (!task || task.status !== "批量生成") {
        job.status = "failed";
        job.message = "任务状态已变化，忽略过期执行任务";
        job.updatedAt = new Date().toISOString();
        changed = true;
        continue;
      }
      job.status = "processing";
      job.workerId = url.searchParams.get("workerId") || "unknown-worker";
      job.attempts += 1;
      job.updatedAt = new Date().toISOString();
      claimed = job;
      claimedTask = task;
      break;
    }
    if (changed) await writeJson(jobsFile, jobs);
    if (!claimed) return json(res, 204, {});
    return json(res, 200, { job: claimed, task: publicTask(claimedTask), templates: claimedTask.targetTemplateIds.map((id) => templateMap.get(id)) });
  }

  const reportMatch = matchRoute(url.pathname, "/api/worker/jobs/:id/report");
  if (reportMatch && req.method === "POST") {
    const input = await readBody(req);
    const jobs = await readJson(jobsFile);
    const job = jobs.find((item) => item.id === reportMatch.id);
    if (!job) return json(res, 404, { error: "执行任务不存在" });
    job.status = input.success ? "completed" : "failed";
    job.message = input.message || "";
    job.updatedAt = new Date().toISOString();
    await writeJson(jobsFile, jobs);
    return json(res, 200, job);
  }

  return false;
}

const mimeTypes = { ".ttf":"font/ttf", ".otf":"font/otf", ".woff":"font/woff", ".woff2":"font/woff2", ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".json": "application/json; charset=utf-8" };

async function serveFile(res, filePath) {
  try {
    const body = await fs.readFile(filePath);
    res.writeHead(200, { "Content-Type": mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream", "Content-Length": body.length });
    res.end(body);
  } catch {
    json(res, 404, { error: "文件不存在" });
  }
}

const workbenchDownloads=createWorkbenchDownloads({
  dispatch:async(req,res,url)=>{
    const handlers=[['ad-resources',adResourcesHandler],['channel-resources',channelResourcesHandler],['store-preorder',storePreorderHandler],['store-launch',storeLaunchHandler],['icon-preorder',iconPreorderHandler],['icon-launch',iconLaunchHandler]];
    const target=handlers.find(([module])=>url.pathname.startsWith(`/api/${module}`));
    if(target)return target[1](req,res,url);
    return routeApi(req,res,url);
  },
  readChannelFile:async(batch,url)=>{
    const prefix=`/storage/channel-resources-${batch.id}/`;
    if(typeof url!=='string'||!url.startsWith(prefix))throw Error('渠道成品地址无效');
    const parts=url.slice(prefix.length).split('/').map(decodeURIComponent);
    if(parts.length!==2||parts.some(part=>!part||/[\\/]/.test(part)))throw Error('渠道成品地址无效');
    return fs.readFile(safeChild(storageDir,`channel-resources-${batch.id}`,...parts));
  }
});

async function workbenchSourceIndex(){
 const projects=await readJson(projectsFile),index=await loadWorkbenchIndex({projects,tasks:(await readJson(tasksFile)).filter(task=>!recycleBin.isTaskHidden(`core:${task.id}`)).map(publicTask)},async endpoint=>{
  const request={method:'GET',headers:{},[Symbol.asyncIterator]:async function*(){}},url=new URL(endpoint,'http://workbench.internal');let status=200,buffer;
  const response={writeHead(code){status=code},setHeader(){},end(value){buffer=Buffer.from(value||'')}};
  const handler=[['ad-resources',adResourcesHandler],['channel-resources',channelResourcesHandler],['store-preorder',storePreorderHandler],['store-launch',storeLaunchHandler],['icon-preorder',iconPreorderHandler],['icon-launch',iconLaunchHandler]].find(([name])=>url.pathname.startsWith(`/api/${name}`));
  if(handler)await handler[1](request,response,url);else await routeApi(request,response,url);
  const result=JSON.parse(buffer);if(status>=400)throw Error(result.error||'模块读取失败');return result;
 });
 return {...index,projects};
}
const projectDesignLibrary=createProjectDesignLibrary({runtimeDir,storageDir,templateMap,jobs:communityGenerationJobs,invalidate:invalidateTaskArtifacts,readFonts:()=>readCompanyFontLibrary({root}),sourceIndex:workbenchSourceIndex});
const assetLibraryCleanup=createAssetLibraryCleanup({runtimeDir,storageDir,recycleBin,sourceIndex:workbenchSourceIndex});

export async function handleRequest(req, res) {
  let finishMutation;
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    if(url.pathname==='/api/company-fonts'||url.pathname.startsWith('/api/company-fonts/')){
      // 平台上字体库给能打开工作台的同事用（字体由有授权的人在线导入）；本机没有库时照旧只给本机页面。
      if(!process.env.DATABASE_URL){
        const localAddress=['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
        const localHost=['127.0.0.1','localhost','[::1]'].includes(url.hostname);
        const origin=req.headers.origin;
        if(!localAddress||!localHost||(origin&&origin!==url.origin))return json(res,403,{error:'公司字体库仅供本机工作台使用'});
      }
      if(url.pathname==='/api/company-fonts/import'&&req.method==='POST'){
        const identity=await currentIdentity({required:Boolean(process.env.DATABASE_URL)});
        let fileName='';try{fileName=decodeURIComponent(String(req.headers['x-file-name']||''));}catch{}
        const result=await importCompanyFontFile({root,buffer:await readRawBody(req,128*1024*1024),fileName,importedBy:identity,licenseConfirmed:req.headers['x-license-confirmed']==='1'});
        return json(res,201,{...result,library:await readCompanyFontLibrary({root})});
      }
      const removeMatch=matchRoute(url.pathname,'/api/company-fonts/:id');
      if(removeMatch&&req.method==='DELETE'){
        const identity=await currentIdentity({required:Boolean(process.env.DATABASE_URL)});
        const font=(await readCompanyFontCatalog({root})).fonts.find(item=>item.id===removeMatch.id);
        if(identity&&font?.importedBy&&font.importedBy.accountId!==identity.accountId)return json(res,403,{error:`这个字体由 ${font.importedBy.name||'其他同事'} 导入，只能由导入的人删除`});
        await removeCompanyFont({root,id:removeMatch.id});
        return json(res,200,await readCompanyFontLibrary({root}));
      }
      if(req.method!=='GET')return json(res,405,{error:'字体库不支持这个操作'});
      res.setHeader('Cache-Control','private, no-cache');
      if(url.pathname==='/api/company-fonts')return json(res,200,await readCompanyFontLibrary({root}));
      const fontMatch=matchRoute(url.pathname,'/api/company-fonts/:id/file');
      if(!fontMatch)return json(res,404,{error:'字体不存在'});
      const fontFile=await readCompanyFontBytes(fontMatch.id,{root});
      if(!fontFile)return json(res,404,{error:'字体不存在'});
      res.writeHead(200,{'Content-Type':fontFile.contentType,'Content-Length':fontFile.bytes.length,'X-Content-Type-Options':'nosniff'});
      return res.end(fontFile.bytes);
    }
    if (url.pathname.startsWith("/api/")) {
        if(!['GET','HEAD'].includes(req.method)&&url.pathname!=='/api/workbench/recycle-bin/purge')finishMutation=recycleBin.beginMutation();
        if(url.pathname==='/api/workbench/recycle-bin'&&req.method==='GET')return json(res,200,await recycleBin.list());
        if(url.pathname==='/api/workbench/recycle-bin/restore'&&req.method==='POST')return json(res,200,await recycleBin.restore(await readBody(req)));
        if(url.pathname==='/api/workbench/recycle-bin/purge-preview'&&req.method==='POST')return json(res,200,await recycleBin.preview(await readBody(req)));
        if(url.pathname==='/api/workbench/recycle-bin/purge'&&req.method==='POST')return json(res,200,await recycleBin.purge(await readBody(req)));
        const designMatch=/^\/api\/projects\/([^/]+)\/design-library(?:\/(sources|assets|fonts|colors|default-logo|templates))?(?:\/([^/]+))?(?:\/(use))?$/.exec(url.pathname);
        if(designMatch){
          const [,projectId,area,assetId,action]=designMatch,input=['POST','PATCH','PUT'].includes(req.method)?await readBody(req):{};
          if(!area&&req.method==='GET')return json(res,200,await projectDesignLibrary.list(projectId));
          if(area==='sources'&&req.method==='GET')return json(res,200,await projectDesignLibrary.sources(projectId));
          if(area==='assets'&&!assetId&&req.method==='POST')return json(res,201,await projectDesignLibrary.add(projectId,input));
          if(area==='assets'&&assetId&&!action&&req.method==='PATCH')return json(res,200,await projectDesignLibrary.updateAsset(projectId,assetId,input));
          if(area==='assets'&&assetId&&action==='use'&&req.method==='POST')return json(res,200,publicTask(await projectDesignLibrary.useAsset(projectId,assetId,input)));
          if(area==='default-logo'&&req.method==='PUT')return json(res,200,await projectDesignLibrary.setDefault(projectId,input.assetId));
          if(area==='fonts'&&req.method==='POST')return json(res,201,await projectDesignLibrary.addFont(projectId,input));
          if(area==='colors'&&req.method==='PUT')return json(res,200,await projectDesignLibrary.colors(projectId,input.colors));
          if(area==='templates'&&!assetId&&req.method==='POST')return json(res,201,await projectDesignLibrary.saveTemplate(projectId,input));
          if(area==='templates'&&assetId&&action==='use'&&req.method==='POST')return json(res,201,publicTask(await projectDesignLibrary.useTemplate(projectId,assetId,input)));
          return json(res,405,{error:'不支持此项目素材操作'});
        }
        if(url.pathname==='/api/workbench/asset-library'&&req.method==='GET')return json(res,200,await assetLibraryCleanup.status());
        if(url.pathname==='/api/workbench/asset-library/index'&&req.method==='GET')return json(res,200,await assetLibraryCleanup.index());
        if(url.pathname==='/api/workbench/asset-library/delete-preview'&&req.method==='POST')return json(res,200,await assetLibraryCleanup.preview(await readBody(req)));
        if(url.pathname==='/api/workbench/asset-library/delete'&&req.method==='POST')return json(res,200,await assetLibraryCleanup.erase(await readBody(req)));
        if(await workbenchDownloads(req,res,url))return;
        if (url.pathname.startsWith('/api/ad-resources')) { await adResourcesHandler(req,res,url); return; }
        if (url.pathname.startsWith('/api/channel-resources')) { await channelResourcesHandler(req,res,url); return; }
        if (url.pathname.startsWith('/api/icon-launch/')) { await iconLaunchHandler(req,res,url); return; }
        if (url.pathname.startsWith('/api/store-launch/')) { await storeLaunchHandler(req,res,url); return; }
        if (url.pathname.startsWith("/api/store-preorder/")) {
          await storePreorderHandler(req, res, url);
          return;
        }
        if (url.pathname.startsWith("/api/icon-preorder/")) {
          await iconPreorderHandler(req, res, url);
          return;
        }
      const handled = await routeApi(req, res, url);
      if (handled === false) json(res, 404, { error: "接口不存在" });
      return;
    }
    if(await adAiPreviewHandler(req,res,url))return;
    const storageMatch = matchRoute(url.pathname, "/storage/:taskId/:bucket/:name");
    if (storageMatch) return serveFile(res, safeChild(storageDir, storageMatch.taskId, storageMatch.bucket, storageMatch.name));
    const adReferenceMatch = matchRoute(url.pathname, "/ad-reference/:name");
    if (adReferenceMatch && /^row-\d{4}-\d{2}\.(?:jpe?g|png|webp)$/i.test(adReferenceMatch.name))
      return serveFile(res, safeChild(runtimeDir, 'ad-resources', 'references', adReferenceMatch.name));
    const channelSampleMatch = matchRoute(url.pathname, "/channel-sample/:folder/:name");
    if (channelSampleMatch && ['candidates-v1','candidates-v2','scene-previews-v1','psd-scenes'].includes(channelSampleMatch.folder))
      return serveFile(res, safeChild(channelSampleDir, channelSampleMatch.folder, channelSampleMatch.name));
    if (channelSampleMatch?.folder === 'source' && /^image[1-6]\.(?:png|jpe?g)$/i.test(channelSampleMatch.name))
      return serveFile(res, safeChild(channelSampleDir, channelSampleMatch.name));
    const requested = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
    const filePath = safeChild(publicDir, requested);
    await serveFile(res, filePath);
  } catch (error) {
    if (!error.status || error.status >= 500) console.error(error);
    // 登录失效按平台的格式回（页面据此提示重新连接，不自动刷新）；其他错误带上 code 方便页面区分。
    if (!res.headersSent) json(res, error.status || 500, error.code === "LOGIN_REQUIRED"
      ? { error: { code: "LOGIN_REQUIRED", message: error.message } }
      : { error: error.message || "服务器错误", ...(typeof error.code === "string" ? { code: error.code } : {}) });
    else res.end();
  } finally {finishMutation?.();}
}

// 平时由 platform/bootstrap.mjs 启动（健康检查、数据同步、登录身份都在那里）；直接 node server.mjs 时只在本机运行。
if (!process.env.WORKBENCH_BOOTSTRAP) {
  const server = http.createServer(handleRequest);
  const port = Number(process.env.PORT || 4173);
  server.listen(port, "0.0.0.0", () => {
    console.log(`平台与社区素材工作台已启动：http://localhost:${port}（建议用 npm start，经 platform/bootstrap.mjs 启动）`);
  });
}





