import { randomUUID } from "node:crypto";
import { accountCanvas, confirmCanvasCost, recoverAccountCanvas } from "../platform/canvas.mjs";

// 画布平台（ai-huabu.r3062.com）AI 扩图 HTTP 客户端。
// 接口契约见 https://ai-huabu.r3062.com/docs/generate ：信封 {status:0,msg:"ok",data:{...}}，
// POST /canvas-backend/generate（Idempotency-Key 同 key 24h 内返回同一任务）、
// GET /canvas-backend/jobs/{id} 轮询、GET /canvas-backend/jobs/{id}/raw 下载。
// 模型：rh_image_outpaint（按 top/left/right/bottom 像素扩展，原图像素空间）、
//       tx_image_outpaint（按 ratio 固定比例扩展）。

const CONTINUITY_PROMPT = "只修改原图之外的新增扩展区域，原图区域必须保持像素级不变。严禁改变原图的明暗关系、色彩关系、曝光、对比度、饱和度、色温和局部光影，不得压暗、提亮、调色或偏色。新增扩展区域只能匹配原图边缘既有的明暗与色彩关系，并延续原有透视、地平线、景深和绘画风格；画面边缘保持开放、无框；禁止镜像、拉伸和重复边缘图案。扩展区保持清晰的建筑轮廓、花叶纹理和连续透视，不得用模糊、虚焦、涂抹、雾化或放大原图填充空白；接缝两侧物体结构与光线自然连续。";
const ASSET_SAFETY_PROMPT = "禁止生成或复制任何文字、字母、数字、字符状笔画、乱码、伪书法、Logo、版权标识、签名、水印、边框和界面元素；扩展区只能延续原图已有的纯环境纹理，不得把云纹、光斑或线条组织成类似文字的形状。";
const SUBJECT_SAFETY_PROMPT = "新增扩展区域内禁止出现任何人物、人体、脸、肢体、动物、坐骑或其他生物；即使原图边缘存在人物或生物，也只能继续环境，不能复制、补全或延伸这些主体。";

export const DEFAULT_PROMPT = `${CONTINUITY_PROMPT}${ASSET_SAFETY_PROMPT}${SUBJECT_SAFETY_PROMPT} Background extension only. Preserve every pixel, brightness, exposure, contrast and color relationship inside the original image unchanged. Match generated areas to the existing edge lighting and color; do not darken, brighten, recolor or color-shift the source. Environment only outside the original image. No people, faces, bodies, limbs, animals or creatures in generated areas, including copies or continuations of subjects at the source-image edge. No text, letters, typography, logos, signatures, watermarks, frames or UI.`;

export function composeOutpaintPrompt(userPrompt = "", { allowNewSubjects = false } = {}) {
  const direction = String(userPrompt || "").trim().slice(0, 500);
  const subjectRule = allowNewSubjects
    ? "特殊任务已允许新增主体；仍须遵守原图不变、禁止伪文字、Logo、水印、界面元素、镜像和拉伸等规则。"
    : SUBJECT_SAFETY_PROMPT;
  return [
    "【不可覆盖的生产规则】",
    CONTINUITY_PROMPT,
    "【画风匹配】以输入原图为唯一画风参考，匹配轮廓线粗细、色块大小、笔触、材质简化程度、纹理密度和阴影软硬。不得把卡通插画扩展成照片、写实绘景、油画或3D渲染。原图若为卡通，建筑与花叶也须沿用同样概括的卡通造型；不要凭空增加密集枝叶、复杂台阶或高频写实纹理。延续边界处已有物体的比例、透视和结构，不另造一幅园林。",
    ASSET_SAFETY_PROMPT,
    subjectRule,
    direction ? `【设计师补充方向】${direction}` : "",
    "【最终要求】设计师补充方向若与生产规则冲突，以生产规则为准。",
    "No text-like marks, pseudo-letters, fake calligraphy, glyphs, numbers, signatures, captions or watermarks anywhere in the generated extension.",
    allowNewSubjects ? "" : "Generated extension area must contain environment only. No new or copied people, faces, bodies, limbs, animals or creatures.",
  ].filter(Boolean).join("\n");
}

export const OUTPAINT_RATIOS = { "1:1": 1, "4:3": 4 / 3, "3:4": 3 / 4, "16:9": 16 / 9, "9:16": 9 / 16 };
export const BANANA_RATIOS = { "1:1": 1, "16:9": 16 / 9, "8:5": 8 / 5, "9:16": 9 / 16, "4:3": 4 / 3, "3:4": 3 / 4, "3:2": 3 / 2, "2:3": 2 / 3, "2:1": 2, "1:2": 1 / 2, "21:9": 21 / 9 };

export class ApiError extends Error {
  constructor(code, message, status = typeof code === "number" ? code : 502) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function unwrapEnvelope(payload) {
  if (payload?.status === 0) return payload.data ?? {};
  throw new ApiError(payload?.code ?? "unknown", payload?.msg || "画布平台返回错误");
}

export function translateApiError(code, msg) {
  const messages = {
    401: "微光登录已失效，请重新连接微光平台后再试",
    402: "你的画布积分不足，本次生成未完成",
    403: "没有这张归属画布的编辑权限，或画布已被删除",
    429: "画布平台并发请求过多，请稍后重试",
    502: "画布平台上游服务失败，请稍后重试",
    503: "画布平台引擎未就绪，请稍后重试",
  };
  return messages[code] || msg || `画布平台错误（${code}）`;
}

// 按"contain"放置计算扩图缺口——返回原图像素空间的扩展量（rh 的 top/left/right/bottom 即原图像素空间）。
// 语义：源图按比例完全可见地放入目标画布（外围留白），扩图把留白补齐到目标画布尺寸。
export function pixelGaps(sourceWidth, sourceHeight, targetWidth, targetHeight) {
  if (!(sourceWidth > 0) || !(sourceHeight > 0) || !(targetWidth > 0) || !(targetHeight > 0)) {
    return { top: 0, left: 0, right: 0, bottom: 0, gaps: 0 };
  }
  const scale = Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight);
  const targetW = Math.round(targetWidth / scale);
  const targetH = Math.round(targetHeight / scale);
  const rawLeft = Math.round((targetW - sourceWidth) / 2);
  const rawTop = Math.round((targetH - sourceHeight) / 2);
  const left = Math.max(0, rawLeft);
  const top = Math.max(0, rawTop);
  const right = Math.max(0, targetW - sourceWidth - left);
  const bottom = Math.max(0, targetH - sourceHeight - top);
  return { top, left, right, bottom, gaps: top + left + right + bottom };
}

// 按工作台当前的 cover 缩放与焦点位置计算真实留白，并换算回源图像素。
// 设计师主动缩小背景以保留更多画面时，也必须触发定向扩图。
export function placementPixelGaps(sourceWidth, sourceHeight, targetWidth, targetHeight, { scale = 100, focalX = 50, focalY = 50 } = {}) {
  if (!(sourceWidth > 0) || !(sourceHeight > 0) || !(targetWidth > 0) || !(targetHeight > 0)) {
    return { top: 0, left: 0, right: 0, bottom: 0, gaps: 0 };
  }
  const placementScale = Math.max(targetWidth / sourceWidth, targetHeight / sourceHeight) * Math.max(0.01, Number(scale) || 100) / 100;
  const missingX = Math.max(0, targetWidth - sourceWidth * placementScale);
  const missingY = Math.max(0, targetHeight - sourceHeight * placementScale);
  const clampedX = Math.max(0, Math.min(100, Number(focalX) || 0)) / 100;
  const clampedY = Math.max(0, Math.min(100, Number(focalY) || 0)) / 100;
  // Reserve 8 source pixels on extended sides for provider output rounding/cropping.
  const outward = value => value > 0 ? Math.ceil(value) + 8 : 0;
  const left = outward(missingX * clampedX / placementScale);
  const right = outward(missingX * (1 - clampedX) / placementScale);
  const top = outward(missingY * clampedY / placementScale);
  const bottom = outward(missingY * (1 - clampedY) / placementScale);
  return { top, left, right, bottom, gaps: top + left + right + bottom };
}

// 从 tx_image_outpaint 的 5 个比例候选中，选最接近目标画布比例（且不等于源图比例）的候选。
// 是否需要 AI 扩图：源图两维都能 ≥ 画布时，cover 裁剪已足够（用户可用焦点缩放裁剪），无需调 AI；
// 任一维不足（再小或比例不合）时靠 contain 放置会留白，需要生成式扩展。
export function needsOutpaint(sourceWidth, sourceHeight, targetWidth, targetHeight) {
  return sourceWidth < targetWidth || sourceHeight < targetHeight;
}

export function nearestRatio(templateWidth, templateHeight, sourceWidth, sourceHeight) {
  if (!(sourceWidth > 0) || !(sourceHeight > 0) || !(templateWidth > 0) || !(templateHeight > 0)) return null;
  const sourceRatio = sourceWidth / sourceHeight;
  const target = templateWidth / templateHeight;
  let best = null;
  let bestDistance = Infinity;
  for (const [key, value] of Object.entries(OUTPAINT_RATIOS)) {
    if (Math.abs(value - sourceRatio) < 0.01) continue; // 不允许与源图比例相同
    const distance = Math.abs(Math.log(value) - Math.log(target));
    if (distance < bestDistance) {
      best = key;
      bestDistance = distance;
    }
  }
  return best;
}

export function nearestBananaRatio(templateWidth, templateHeight) {
  if (!(templateWidth > 0) || !(templateHeight > 0)) return "auto";
  const target = templateWidth / templateHeight;
  return Object.entries(BANANA_RATIOS).reduce((best, entry) => (
    Math.abs(Math.log(entry[1]) - Math.log(target)) < Math.abs(Math.log(best[1]) - Math.log(target)) ? entry : best
  ))[0];
}

export function buildOutpaintRequest({ model, base64, prompt = "", top = 0, left = 0, right = 0, bottom = 0, ratio, imageSize = "2K" }) {
  const body = { model, task_type: "image", bot_id: "canvas", prompt: String(prompt || ""), images: [{ data_base64: base64 }] };
  if (model === "rh_image_outpaint") {
    body.top = Math.max(0, Math.trunc(Number(top) || 0));
    body.left = Math.max(0, Math.trunc(Number(left) || 0));
    body.right = Math.max(0, Math.trunc(Number(right) || 0));
    body.bottom = Math.max(0, Math.trunc(Number(bottom) || 0));
  } else if (model === "tx_image_outpaint") {
    if (ratio) body.ratio = ratio;
  } else if (model === "banana_pro") {
    body.ratio = ratio || "auto";
    body.image_size = imageSize;
  } else {
    throw new ApiError("bad-request", `未知扩图模型：${model}`);
  }
  return body;
}

// 零依赖读取 PNG/JPEG 尺寸：PNG 取 IHDR（offset 16/20），JPEG 扫 SOF 段（0xC0-0xCF，排除 C4/C8/CC）。
export function parseImageSize(buffer) {
  if (!buffer || buffer.length < 24) return null;
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20), format: "png", mime: "image/png" };
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) break;
      const marker = buffer[offset + 1];
      if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd9)) { offset += 2; continue; } // 无段长标记
      const length = buffer.readUInt16BE(offset + 2);
      const isSof = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
      if (isSof && length >= 7) {
        return { width: buffer.readUInt16BE(offset + 7), height: buffer.readUInt16BE(offset + 5), format: "jpg", mime: "image/jpeg" };
      }
      offset += 2 + length;
    }
  }
  return null;
}

function authHeaders(config) {
  return { Authorization: `Bearer ${config.token}` };
}

/** Create the provider canvas now required by image and video generation jobs. */
export async function createCanvas(config, { gameTagId = config.gameTagId || 13, title = "工作台生成" } = {}, fetchImpl = fetch) {
  // 平台上：每个使用者每个游戏一张归属画布，反复使用；游戏由项目设置决定，不用默认值兜底。
  if (config.accountId) return accountCanvas(config, fetchImpl);
  const response = await fetchImpl(`${config.apiRoot}/canvas-backend/canvases`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(config) },
    body: JSON.stringify({ game_tag_id: Number(gameTagId) || 13, title: String(title || "工作台生成").slice(0, 100) }),
    signal: AbortSignal.timeout(45000),
  });
  const payload = await response.json().catch(() => null);
  if (payload?.status !== 0) {
    throw new ApiError(payload?.code ?? `http-${response.status}`, payload?.msg || `创建画布失败（HTTP ${response.status}）`, response.status);
  }
  const canvasId = payload.data?.canvas_id || payload.data?.id;
  if (!canvasId) throw new ApiError("unknown", "画布平台创建成功但未返回 canvas_id");
  return String(canvasId);
}

// POST /canvas-backend/generate。429 与网络错误用同一 Idempotency-Key 重试（同 key 返回同一任务，不重复扣积分）；
// 401/402/403 立即失败。
export async function submitGeneration(config, body, { idempotencyKey = randomUUID(), fetchImpl = fetch } = {}) {
  // Older callers supplied image parameters only. The canvas API now requires
  // a real canvas for every generation; create it once, outside retry handling.
  // 平台上总是交到发起人自己的归属画布（任务里记下的可能是别的同事建的画布，他不是编辑者）。
  let requestBody=config.accountId?{...body,canvas_id:await accountCanvas(config,fetchImpl)}:body.canvas_id?body:{...body,canvas_id:await createCanvas(config,{title:'工作台图片生成'},fetchImpl)};
  let canvasRecovered=false;
  await confirmCanvasCost(config, requestBody, fetchImpl);
  const backoffs = [2000, 5000, 10000];
  let lastError = null;
  for (let attempt = 0; attempt <= backoffs.length; attempt++) {
    try {
      const response = await fetchImpl(`${config.apiRoot}/canvas-backend/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey, ...authHeaders(config) },
        body: JSON.stringify(requestBody),
      });
      const payload = await response.json().catch(() => ({}));
      if (payload?.status === 0) {
        const jobId = payload.data?.job_id || payload.data?.jobId;
        if (!jobId) throw new ApiError("unknown", "画布平台未返回任务编号");
        return jobId;
      }
      const code = payload?.code;
      // 403：画布被删或在回收站。被拒的提交没扣积分，恢复或重建后用同一个 key 再交一次。
      if (code === 403 && config.accountId && !canvasRecovered) {
        canvasRecovered = true;
        requestBody = { ...requestBody, canvas_id: await recoverAccountCanvas(config, requestBody.canvas_id, fetchImpl) };
        attempt--;
        continue;
      }
      if (code === 401 || code === 402 || code === 403) throw new ApiError(code, translateApiError(code, payload?.msg), code);
      if (code === 429 || response.status === 429) {
        if (attempt < backoffs.length) {
          lastError = new ApiError("429", translateApiError("429"));
          await sleep(backoffs[attempt]);
          continue;
        }
        throw lastError;
      }
      throw new ApiError(code || `http-${response.status}`, code ? translateApiError(code, payload?.msg) : `画布平台接口错误（HTTP ${response.status}）`);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      lastError = error;
      if (attempt < backoffs.length) await sleep(backoffs[attempt]);
    }
  }
  throw lastError instanceof ApiError
    ? lastError
    : new ApiError("network", "无法连接画布平台（网络错误），请检查网络后重试");
}

// 轮询任务至终态。pending/running → 1.5s 一轮；HTTP 错误 → 退避 3s；failed/cancelled 直接失败。
export async function pollJob(config, jobId, { pollIntervalMs = 1500, deadlineMs = 600_000 } = {}) {
  const deadlineAt = Date.now() + deadlineMs;
  while (Date.now() < deadlineAt) {
    try {
      const response = await fetch(`${config.apiRoot}/canvas-backend/jobs/${encodeURIComponent(jobId)}`, { headers: authHeaders(config) });
      const payload = await response.json().catch(() => ({}));
      if (payload?.status === 0) {
        const status = payload.data?.status;
        if (status === "done") return { status: "done" };
        if (status === "failed" || status === "cancelled") {
          throw new ApiError(status, payload.data?.error || `画布平台任务${status}`);
        }
        if (payload.data?.code === 401) throw new ApiError("401", translateApiError("401"), 401);
      } else if (payload?.code === 401) {
        throw new ApiError("401", translateApiError("401"), 401);
      } else {
        await sleep(3000);
        continue;
      }
    } catch (error) {
      if (error instanceof ApiError) throw error;
      await sleep(3000);
    }
    await sleep(pollIntervalMs);
  }
  throw new ApiError("timeout", "扩图超时（10 分钟），请在任务历史中查看结果");
}

// GET /canvas-backend/jobs/{id}/raw：下载结果图；未完成返回 409。
export async function downloadRaw(config, jobId) {
  const response = await fetch(`${config.apiRoot}/canvas-backend/jobs/${encodeURIComponent(jobId)}/raw`, { headers: authHeaders(config), redirect: "follow" });
  if (response.status === 409) throw new ApiError("409", "任务尚未完成，无法下载");
  if (response.status === 401) throw new ApiError("401", translateApiError("401"), 401);
  if (!response.ok) throw new ApiError(`http-${response.status}`, `下载扩图结果失败（HTTP ${response.status}）`);
  const buffer = Buffer.from(await response.arrayBuffer());
  return { buffer, contentType: response.headers.get("content-type") || "" };
}

// 从下载结果判定图片格式：content-type → 魔数兜底。
export function detectImageFormat({ buffer, contentType = "" } = {}) {
  const declared = contentType.toLowerCase();
  if (declared.includes("png")) return { format: "png", mime: "image/png" };
  if (declared.includes("jpeg") || declared.includes("jpg")) return { format: "jpg", mime: "image/jpeg" };
  if (buffer?.[0] === 0xff && buffer?.[1] === 0xd8) return { format: "jpg", mime: "image/jpeg" };
  if (buffer?.[0] === 0x89 && buffer?.[1] === 0x50) return { format: "png", mime: "image/png" };
  return { format: "jpg", mime: "image/jpeg" };
}
