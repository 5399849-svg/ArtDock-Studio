import test from "node:test";
import assert from "node:assert/strict";
import { ApiError, DEFAULT_PROMPT, buildOutpaintRequest, composeOutpaintPrompt, createCanvas, detectImageFormat, nearestBananaRatio, nearestRatio, needsOutpaint, parseImageSize, pixelGaps, placementPixelGaps, translateApiError, unwrapEnvelope } from "../lib/ai-huabu.mjs";

test("扩图缺口按原图像素空间计算（contain 放置）", () => {
  // 源 1200×600 → 模板 1920×550：contain 比例 0.9167，缺口在左右（像素空间），上下为 0
  const gaps = pixelGaps(1200, 600, 1920, 550);
  assert.ok(gaps.left > 0 && gaps.right > 0, "左右应有缺口");
  assert.equal(gaps.top, 0);
  assert.equal(gaps.bottom, 0);
  // 原图像素空间语义：缺口合计应填到 targetWidth/scale 的水平
  const scale = Math.min(1920 / 1200, 550 / 600);
  assert.equal(gaps.left + gaps.right, Math.round(1920 / scale) - 1200);
});

test("扩图缺口取整守恒且不出现负值", () => {
  const gaps = pixelGaps(1920, 1080, 900, 383);
  const targetW = gaps.left + gaps.right + 1920;
  assert.equal(targetW, Math.round(900 / Math.min(900 / 1920, 383 / 1080)));
  assert.ok([gaps.top, gaps.left, gaps.right, gaps.bottom].every((value) => value >= 0));
  // 金字塔边界：宽高比完全一致 → 零缺口（无需扩图）
  assert.deepEqual(pixelGaps(900, 383, 900, 383), { top: 0, left: 0, right: 0, bottom: 0, gaps: 0 });
});

test("扩图缺口按当前尺寸的缩放和焦点定向计算", () => {
  const gaps = placementPixelGaps(1920, 1080, 1920, 550, { scale: 60, focalX: 75, focalY: 10 });
  assert.deepEqual(gaps, { top: 0, left: 968, right: 328, bottom: 0, gaps: 1296 });
});

test("背景未缩小时不把可裁剪区域误判为扩图留白", () => {
  assert.equal(placementPixelGaps(1920, 1080, 800, 600, { scale: 100, focalX: 50, focalY: 50 }).gaps, 0);
});

test("是否需要扩图：两维都够时裁剪即可，无需 AI", () => {
  assert.equal(needsOutpaint(3000, 2000, 1920, 550), false); // cover 裁剪已足够
  assert.equal(needsOutpaint(1920, 550, 1920, 550), false); // 尺寸正好
  assert.equal(needsOutpaint(900, 383, 900, 383), false);
  assert.equal(needsOutpaint(400, 100, 600, 300), true);    // 源两维都小 → 扩图
  assert.equal(needsOutpaint(1200, 600, 1920, 550), true);  // 宽不足 → 扩图
  assert.equal(needsOutpaint(1920, 550, 634, 1136), true);  // 高不足 → 扩图
});

test("最近比例选择：取最接近目标的候选", () => {
  assert.equal(nearestRatio(1920, 550, 1200, 800), "16:9");
  assert.equal(nearestRatio(634, 1136, 1920, 862), "9:16");
  assert.equal(nearestRatio(800, 600, 1200, 800), "4:3");
});

test("最近比例在源比例与候选相同时退回次近", () => {
  // 源 1600×900 正好 16:9，目标也是 16:9 → 16:9 被排除，退到次近候选
  const ratio = nearestRatio(1920, 1080, 1600, 900);
  assert.notEqual(ratio, null);
  assert.notEqual(ratio, "16:9");
});

test("Nano Banana 按目标画布选择最接近的受支持比例", () => {
  assert.equal(nearestBananaRatio(1920, 550), "21:9");
  assert.equal(nearestBananaRatio(634, 1136), "9:16");
  assert.equal(nearestBananaRatio(800, 600), "4:3");
});

test("扩图请求体按模型组装", () => {
  const rh = buildOutpaintRequest({ model: "rh_image_outpaint", base64: "QUJD", prompt: "", top: 10, left: 20, right: 30, bottom: 40 });
  assert.equal(rh.model, "rh_image_outpaint");
  assert.equal(rh.task_type, "image");
  assert.equal(rh.bot_id, "canvas");
  assert.equal(rh.images[0].data_base64, "QUJD");
  assert.equal(rh.top, 10);
  assert.equal(rh.left, 20);
  assert.equal(rh.right, 30);
  assert.equal(rh.bottom, 40);
  assert.equal("ratio" in rh, false);
  const tx = buildOutpaintRequest({ model: "tx_image_outpaint", base64: "QUJD", prompt: "p", ratio: "16:9" });
  assert.equal(tx.ratio, "16:9");
  assert.equal("top" in tx, false);
  assert.equal("left" in tx, false);
  assert.equal("right" in tx, false);
  assert.equal("bottom" in tx, false);
  assert.equal(tx.prompt, "p");
  const banana = buildOutpaintRequest({ model: "banana_pro", base64: "QUJD", prompt: "自然延展背景", ratio: "21:9", imageSize: "2K" });
  assert.equal(banana.model, "banana_pro");
  assert.equal(banana.ratio, "21:9");
  assert.equal(banana.image_size, "2K");
  assert.equal(banana.images[0].data_base64, "QUJD");
});

test("创建微光画布并返回后续生图/生视频需要的 canvas_id", async () => {
  let request;
  const canvasId = await createCanvas({ apiRoot: "https://canvas.example/api", token: "test-token" }, { gameTagId: 5, title: "英雄没有闪 9:16" }, async (url, init) => {
    request = { url, init };
    return { status: 200, json: async () => ({ status: 0, data: { id: "canvas-123" } }) };
  });
  assert.equal(canvasId, "canvas-123");
  assert.equal(request.url, "https://canvas.example/api/canvas-backend/canvases");
  assert.equal(request.init.method, "POST");
  assert.equal(request.init.headers.Authorization, "Bearer test-token");
  assert.deepEqual(JSON.parse(request.init.body), { game_tag_id: 5, title: "英雄没有闪 9:16" });
});

test("请求体字段不出现负扩展量与非法值", () => {
  const rh = buildOutpaintRequest({ model: "rh_image_outpaint", base64: "QUJD", top: -5, left: 1.9, right: NaN, bottom: "8" });
  assert.equal(rh.top, 0);
  assert.equal(rh.left, 1);
  assert.equal(rh.right, 0);
  assert.equal(rh.bottom, 8);
});

test("信封解析：成功取 data，失败抛业务错误", () => {
  assert.deepEqual(unwrapEnvelope({ status: 0, msg: "ok", data: { job_id: "x" } }), { job_id: "x" });
  assert.throws(() => unwrapEnvelope({ status: 1, msg: "余额不足", code: 402, data: null }), (error) => error instanceof ApiError && error.code === 402 && error.status === 402);
});

test("API 错误码映射为中文提示", () => {
  assert.equal(translateApiError(401), "微光登录已失效，请重新连接微光平台后再试");
  assert.equal(translateApiError(402), "你的画布积分不足，本次生成未完成");
  assert.equal(translateApiError(429), "画布平台并发请求过多，请稍后重试");
  assert.equal(translateApiError(503), "画布平台引擎未就绪，请稍后重试");
  assert.equal(translateApiError(777, "自定义失败"), "自定义失败");
  assert.equal(translateApiError(555), "画布平台错误（555）");
});

test("零依赖解析 PNG/JPEG 尺寸", () => {
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(8), Buffer.from([0, 0, 0, 13]), Buffer.from([0, 0, 0, 5]), Buffer.alloc(20)]);
  assert.deepEqual(parseImageSize(png), { width: 13, height: 5, format: "png", mime: "image/png" });
  // JPEG: SOI + APP0(0xE0) + SOF0(0xC0)，SOF0 内 height=0x012C(300)、width=0x0190(400)
  const app0 = [0xff, 0xe0, 0x00, 0x12, 0x4a, 0x46, 0x49, 0x46, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  const sof0 = [0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0x2c, 0x01, 0x90, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03];
  const jpg = Buffer.concat([Buffer.from([0xff, 0xd8]), Buffer.from(app0), Buffer.from(sof0)]);
  assert.deepEqual(parseImageSize(jpg), { width: 400, height: 300, format: "jpg", mime: "image/jpeg" });
});

test("下载结果格式判定：content-type 优先，魔数兜底", () => {
  assert.deepEqual(detectImageFormat({ buffer: Buffer.alloc(0), contentType: "image/png" }), { format: "png", mime: "image/png" });
  assert.deepEqual(detectImageFormat({ buffer: Buffer.from([0xff, 0xd8, 0xff]), contentType: "" }), { format: "jpg", mime: "image/jpeg" });
  assert.deepEqual(detectImageFormat({ buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]), contentType: "application/octet-stream" }), { format: "png", mime: "image/png" });
});

test("默认提示词禁止生成人物、文字、Logo和界面元素", () => {
  assert.ok(DEFAULT_PROMPT.includes("禁止生成"));
  assert.ok(DEFAULT_PROMPT.includes("人物"));
  assert.ok(DEFAULT_PROMPT.includes("文字"));
  assert.ok(DEFAULT_PROMPT.includes("Logo"));
  assert.ok(DEFAULT_PROMPT.includes("界面元素"));
  assert.ok(DEFAULT_PROMPT.includes("严禁改变原图的明暗关系、色彩关系"));
  assert.ok(DEFAULT_PROMPT.includes("不得压暗、提亮、调色或偏色"));
});

test("设计师关键词不能覆盖默认的禁止新增主体规则", () => {
  const prompt = composeOutpaintPrompt("画面明亮，并在右侧增加三个人物");
  assert.ok(prompt.includes("画面明亮，并在右侧增加三个人物"));
  assert.ok(prompt.includes("若与生产规则冲突，以生产规则为准"));
  assert.ok(prompt.includes("禁止出现任何人物"));
  assert.ok(prompt.endsWith("No new or copied people, faces, bodies, limbs, animals or creatures."));
});

test("设计师要求调色时仍以原图明暗和色彩保护规则为准", () => {
  const prompt = composeOutpaintPrompt("把原图两侧压暗并整体改成暖色");
  assert.ok(prompt.includes("把原图两侧压暗并整体改成暖色"));
  assert.ok(prompt.includes("严禁改变原图的明暗关系、色彩关系"));
  assert.ok(prompt.includes("若与生产规则冲突，以生产规则为准"));
});

test("只有显式例外才允许扩展区新增主体", () => {
  const prompt = composeOutpaintPrompt("补画一只鸟", { allowNewSubjects: true });
  assert.ok(prompt.includes("特殊任务已允许新增主体"));
  assert.equal(prompt.includes("禁止出现任何人物"), false);
});
