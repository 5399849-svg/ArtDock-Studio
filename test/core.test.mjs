import test from "node:test";
import assert from "node:assert/strict";
import { artifactName, resourceOutputName, canTransition, createStoreZip, qcArtifact, sanitizeFileName, sanitizeZipName, validateDeliveryReadiness, validateTask } from "../lib/core.mjs";

test("工作流只允许规定的状态迁移", () => {
  assert.equal(canTransition("草稿", "批量生成"), true);
  assert.equal(canTransition("草稿", "主图制作"), true);
  assert.equal(canTransition("草稿", "已完成"), false);
  assert.equal(canTransition("生成失败", "批量生成"), true);
});

test("任务校验检查必填项与模板", () => {
  const templates = new Set(["hero"]);
  assert.deepEqual(validateTask({ project: "", requester: "", mode: "bad", masterTemplateId: "x", targetTemplateIds: [] }, templates), [
    "项目名称不能为空",
    "提交人不能为空",
    "请选择有效的生产模式",
    "至少选择一个目标资源位",
  ]);
});

test("创建任务允许稍后在制作界面填写文案，仍校验主图规格", () => {
  const templates = new Set(["hero"]);
  assert.deepEqual(validateTask({ project: "项目", requester: "设计师", mode: "adapt", targetTemplateIds: ["hero"] }, templates), []);
  assert.deepEqual(validateTask({ project: "项目", requester: "设计师", mode: "adapt", masterCanvasId: "landscape-1920x1080", targetTemplateIds: ["hero"] }, templates), []);
  assert.deepEqual(validateTask({ project: "项目", requester: "设计师", mode: "master", masterCanvasId: "portrait-1080x1920", targetTemplateIds: ["hero"], copy: "" }, templates), []);
  assert.deepEqual(validateTask({ project: "项目", requester: "设计师", mode: "copy-replace", targetTemplateIds: ["hero"] }, templates), []);
  assert.deepEqual(validateTask({ project: "项目", requester: "设计师", mode: "master", masterCanvasId: "invalid", targetTemplateIds: ["hero"] }, templates), ["请选择有效的主图规格"]);
  assert.deepEqual(validateTask({ project: "项目", requester: "设计师", mode: "copy-replace", masterCanvasId: "portrait-1080x1920", targetTemplateIds: ["hero"], copy: "新文案" }, templates), []);
});

test("文件命名符合交付规则", () => {
  const name = artifactName("项目 A", { name: "首页/头图", width: 900, height: 383, format: "PNG" }, 2);
  assert.equal(name, "项目_A_首页-头图_900x383_v2.png");
  assert.equal(sanitizeFileName("a:b*c"), "a-b-c");
});

test("平台资源位只使用资源位名称与尺寸", () => {
  assert.equal(resourceOutputName({name:"平台首页-头图",width:1920,height:550,format:"JPG"}),"平台首页-头图_1920x550.jpg");
  assert.equal(resourceOutputName({name:"移动端/官网头图",width:750,height:1059,format:"PNG"}),"移动端-官网头图_750x1059.png");
});

test("质检识别尺寸、格式和大小", () => {
  const template = { width: 600, height: 300, format: "JPG", maxBytes: 1000 };
  assert.equal(qcArtifact({ width: 600, height: 300, format: "JPG", bytes: 900 }, template).passed, true);
  assert.equal(qcArtifact({ width: 601, height: 300, format: "PNG", bytes: 1200 }, template).passed, false);
});

test("能够生成标准ZIP容器", () => {
  const zip = createStoreZip([{ name: "清单.json", data: Buffer.from("{}") }]);
  assert.equal(zip.readUInt32LE(0), 0x04034b50);
  assert.equal(zip.readUInt32LE(zip.length - 22), 0x06054b50);
});

test("ZIP保留交付目录结构且名称被清洗", () => {
  const zip = createStoreZip([
    { name: "01_Banner成品/项目_首页_v2.jpg", data: Buffer.from("a") },
    { name: "02_页面效果预览/预览.jpg", data: Buffer.from("b") },
  ]);
  const names = [];
  let offset = 0;
  while (zip.readUInt32LE(offset) === 0x04034b50) {
    const length = zip.readUInt16LE(offset + 26);
    names.push(zip.subarray(offset + 30, offset + 30 + length).toString("utf8"));
    offset += 30 + length + zip.readUInt32LE(offset + 18);
  }
  assert.deepEqual(names, ["01_Banner成品/项目_首页_v2.jpg", "02_页面效果预览/预览.jpg"]);
  assert.equal(sanitizeZipName("a/b:c"), "a/b-c");
  assert.equal(sanitizeZipName("../x"), "x");
});

test("视觉规则未核实时禁止交付", () => {
  const task = { targetTemplateIds: ["hero", "cover"] };
  const rules = [
    { templateId: "hero", status: "verified", deliveryAllowed: true },
    { templateId: "cover", status: "partial", deliveryAllowed: false },
  ];
  assert.deepEqual(validateDeliveryReadiness(task, rules), ["cover 的视觉规则尚未完成核实，只能用于验证，不能交付"]);
  assert.deepEqual(validateDeliveryReadiness({ targetTemplateIds: ["hero"] }, rules), []);
});

test("ZIP 校验值和标准一致（Node 自带的快速算法与逐字节算法结果相同）", async () => {
  const { crc32 } = await import("../lib/core.mjs");
  assert.equal(crc32(Buffer.from("123456789")), 0xcbf43926);
  const data = Buffer.alloc(3 * 1024 * 1024 + 5); for (let i = 0; i < data.length; i += 1) data[i] = (i * 31 + (i >>> 7)) & 255;
  let crc = 0xffffffff; for (const byte of data) { crc ^= byte; for (let k = 0; k < 8; k += 1) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1; }
  assert.equal(crc32(data), (crc ^ 0xffffffff) >>> 0);
});
