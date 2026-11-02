import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const rules = JSON.parse(fs.readFileSync(new URL("../config/psd-layout-rules-v1.json", import.meta.url), "utf8"));

test("新版平台资源位均有按PSD拆分的坐标规则", () => {
  const expected = {
    "37-home-hero": 4,
    "37-mobile-center-home": 5,
    "37-mobile-center-phone": 4,
    "wanxin-splash": 4,
    "37-home-news-image": 1,
    "37-home-inbox-image": 1,
  };
  for (const [templateId, count] of Object.entries(expected)) {
    const template = rules.templates.find((item) => item.templateId === templateId);
    assert.ok(template, `${templateId} 缺少坐标规则`);
    assert.equal(template.variants.length, count);
  }
});

test("解析后的版式坐标均被裁切在PSD画布内", () => {
  for (const template of rules.templates) {
    const regions = [...template.globalRegions, ...template.variants.flatMap((variant) => variant.regions)];
    for (const region of regions) {
      assert.ok(region.bounds.x >= 0 && region.bounds.y >= 0, `${template.templateId}/${region.name} 出现负坐标`);
      assert.ok(region.bounds.x + region.bounds.width <= template.canvas.width, `${template.templateId}/${region.name} 超出画布宽度`);
      assert.ok(region.bounds.y + region.bounds.height <= template.canvas.height, `${template.templateId}/${region.name} 超出画布高度`);
    }
  }
});

test("确认后的新版V1.0坐标规则允许进入交付审核", () => {
  assert.ok(rules.templates.every((template) => template.deliveryAllowed === true));
  const hero = rules.templates.find((template) => template.templateId === "37-home-hero");
  assert.doesNotMatch(hero.issues.join("；"), /固定白色渐变.*不一致/);
});

test("新增盒子手游模块尺寸已录入并允许自动交付", () => {
  const expected = {
    "37-gamebox-mobile-small-kv": { width: 343, height: 163 },
    "37-gamebox-mobile-large-kv": { width: 706, height: 334 },
  };
  for (const [templateId, canvas] of Object.entries(expected)) {
    const template = rules.templates.find((item) => item.templateId === templateId);
    assert.ok(template, `${templateId} 未录入`);
    assert.deepEqual(template.canvas, canvas);
    assert.equal(template.variants.length, templateId === "37-gamebox-mobile-large-kv" ? 3 : 2);
    assert.equal(template.deliveryAllowed, true);
    assert.deepEqual(template.issues, []);
  }
});

test("弹窗与玩心开屏的每个PSD版式都包含按钮区域", () => {
  const expected = {
    "37-home-popup": { x: 254, width: 292, height: 61 },
    "wanxin-splash": { x: 124, y: 982, width: 386, height: 82 },
  };
  for (const [templateId, bounds] of Object.entries(expected)) {
    const template = rules.templates.find((item) => item.templateId === templateId);
    assert.ok(template, `${templateId} 缺少PSD规则`);
    assert.ok(template.variants.length > 0, `${templateId} 缺少版式`);
    for (const variant of template.variants) {
      const button = variant.regions.find((region) => region.type === "button");
      assert.ok(button, `${templateId}/${variant.name} 缺少按钮区域`);
      for (const [key, value] of Object.entries(bounds)) assert.equal(button.bounds[key], value);
    }
  }
});

test("多版式PSD由完整KV自动选择且不读取Photoshop显隐状态", () => {
  for (const template of rules.templates.filter((item) => item.variants.length > 1)) {
    assert.equal(template.selectionMode, "auto-from-complete-kv");
    assert.ok(template.variants.every((variant) => variant.defaultVisible === false));
  }
});

test("玩心部落游戏页只启用整画布KV和条件性IP区域", () => {
  const template = rules.templates.find((item) => item.templateId === "wanxin-game-page");
  assert.ok(template, "wanxin-game-page 缺少PSD规则");
  assert.equal(template.canvas.width, 1280);
  assert.equal(template.canvas.height, 720);
  assert.equal(template.variants.length, 1);
  const regions = template.variants[0].regions;
  assert.deepEqual(regions.map((region) => region.type).sort(), ["ip", "kv-input"]);
  assert.deepEqual(regions.find((region) => region.type === "kv-input").bounds, {
    x: 0,
    y: 0,
    width: 1280,
    height: 720,
  });
  assert.deepEqual(regions.find((region) => region.type === "ip").bounds, {
    x: 1176,
    y: 681,
    width: 91,
    height: 27,
  });
});

test("平台分类只保留平台资源位并移除社媒模板", () => {
  const templates = JSON.parse(fs.readFileSync(new URL("../config/templates.json", import.meta.url), "utf8"));
  const categories = JSON.parse(fs.readFileSync(new URL("../data/runtime/categories.json", import.meta.url), "utf8"));
  const businessLines = JSON.parse(fs.readFileSync(new URL("../data/runtime/business-lines.json", import.meta.url), "utf8"));
  const platform = templates.filter((item) => item.businessLineId === "platform-community");
  assert.equal(platform.length, 21);
  assert.ok(platform.every((item) => item.segmentId === "platform" && item.categoryId === "platform"));
  assert.deepEqual(categories.map((item) => item.id), ["platform"]);
  // 后来加了“社区外媒”的两个细分（论坛社区、公众号与外媒）；平台资源位仍只有 platform 这一个细分。
  const segments = businessLines.find((item) => item.id === "platform-community").segments.map((item) => item.id);
  assert.deepEqual(segments.filter((id) => !["community", "official-media"].includes(id)), ["platform"]);
  for (const id of ["wechat-cover", "xiaohongshu-cover", "alipay-cover"]) assert.equal(templates.some((item) => item.id === id), false);
});

test("21个新版平台PSD均已归档原文件并更新名称", () => {
  const templates = JSON.parse(fs.readFileSync(new URL("../config/templates.json", import.meta.url), "utf8"));
  const specs = JSON.parse(fs.readFileSync(new URL("../data/runtime/specifications.json", import.meta.url), "utf8"));
  const platform = templates.filter((item) => item.businessLineId === "platform-community");
  for (const template of platform) {
    assert.match(template.psdFile, /^\d+.+\.psd$/);
    assert.equal(template.name, template.psdFile.replace(/^\d+/, "").replace(/\.psd$/i, ""));
    const spec = specs.find((item) => item.templateId === template.id);
    assert.ok(spec?.assets.some((asset) => asset.name === template.psdFile && asset.mime === "image/vnd.adobe.photoshop"));
  }
});

test("37网游平台首页头图保留全部三个页面遮挡区", () => {
  const template = rules.templates.find((item) => item.templateId === "37-home-hero");
  assert.ok(template);
  for (const variant of template.variants) {
    const zones = variant.regions.filter((region) => region.type === "page-occlusion");
    assert.deepEqual(zones.map((zone) => zone.name).sort(), ["01_登录信息框", "02_页面内容区", "03_轮播圆点区"]);
    assert.deepEqual(zones.find((zone) => zone.name === "01_登录信息框").bounds, { x: 329, y: 0, width: 283, height: 296 });
    assert.deepEqual(zones.find((zone) => zone.name === "02_页面内容区").bounds, { x: 329, y: 352, width: 1243, height: 198 });
    assert.deepEqual(zones.find((zone) => zone.name === "03_轮播圆点区").bounds, { x: 871, y: 307, width: 160, height: 31 });
  }
});
