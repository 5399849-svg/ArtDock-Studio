import path from "node:path";

export const TASK_STATES = [
  "草稿",
  "主图制作",
  "批量生成",
  "成套审核",
  "已完成",
  "生成失败",
];

export const TRANSITIONS = {
  草稿: ["主图制作", "批量生成"],
  主图制作: ["批量生成", "生成失败"],
  批量生成: ["成套审核", "生成失败"],
  成套审核: ["已完成", "批量生成"],
  已完成: [],
  生成失败: ["主图制作", "批量生成"],
};

export function canTransition(from, to) {
  return Boolean(TRANSITIONS[from]?.includes(to));
}

export function sanitizeFileName(value) {
  const text = String(value || "未命名")
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "-")
    .replace(/\s+/g, "_")
    .replace(/-+/g, "-");
  let sliced = text.slice(0, 120);
  // 避免在 CJK 代理对中间截断，产生无效 UTF-8
  if (sliced.length < text.length && /[\uD800-\uDBFF]$/.test(sliced)) sliced = sliced.slice(0, -1);
  return sliced;
}

export function sanitizeZipName(value) {
  // 按 / 分段清洗，保留 ZIP 内的目录结构；拒绝空段与 .
  return String(value || "")
    .split("/")
    .map((segment) => sanitizeFileName(segment))
    .filter((segment) => segment && segment !== "." && segment !== ".." && !segment.startsWith("."))
    .join("/");
}

export function artifactName(project, template, version = 1) {
  const extension = template.format.toLowerCase() === "jpeg" ? "jpg" : template.format.toLowerCase();
  return `${sanitizeFileName(project)}_${sanitizeFileName(template.name)}_${template.width}x${template.height}_v${version}.${extension}`;
}

export function resourceOutputName(template) {
  const extension = template.format.toLowerCase() === "jpeg" ? "jpg" : template.format.toLowerCase();
  return `${sanitizeFileName(template.name)}_${template.width}x${template.height}.${extension}`;
}

export function validateTask(input, templateIds) {
  const errors = [];
  if (!String(input.project || "").trim()) errors.push("项目名称不能为空");
  if (!String(input.requester || "").trim()) errors.push("提交人不能为空");
  if (!["adapt", "master", "copy-replace"].includes(input.mode)) errors.push("请选择有效的生产模式");
  const masterCanvasIds = new Set(["landscape-1920x1080", "portrait-1080x1920", ...(input.customCanvas?["custom"]:[])]);
  if (input.masterCanvasId && !masterCanvasIds.has(input.masterCanvasId)) errors.push("请选择有效的主图规格");
  if (!Array.isArray(input.targetTemplateIds) || input.targetTemplateIds.length === 0) {
    errors.push("至少选择一个目标资源位");
  } else if (input.targetTemplateIds.some((id) => !templateIds.has(id))) {
    errors.push("目标资源位包含无效模板");
  }
  if (input.dueDate && Number.isNaN(Date.parse(input.dueDate))) errors.push("截止日期格式无效");
  return errors;
}

export function qcArtifact(artifact, template) {
  const checks = [
    { key: "width", label: "宽度", passed: artifact.width === template.width, actual: artifact.width, expected: template.width },
    { key: "height", label: "高度", passed: artifact.height === template.height, actual: artifact.height, expected: template.height },
    { key: "format", label: "格式", passed: artifact.format.toUpperCase() === template.format.toUpperCase(), actual: artifact.format, expected: template.format },
    { key: "size", label: "文件大小", passed: artifact.bytes <= template.maxBytes, actual: artifact.bytes, expected: template.maxBytes },
  ];
  if (template.requiresPsd) checks.push({ key: "template", label: "指定PSD模板", passed: artifact.templateApplied === true, actual: artifact.templateApplied === true, expected: true });
  return { passed: checks.every((item) => item.passed), checks };
}

export function validateDeliveryReadiness(task, resourceRules) {
  const map = resourceRules instanceof Map
    ? resourceRules
    : new Map((resourceRules || []).map((rule) => [rule.templateId, rule]));
  return (task.targetTemplateIds || []).flatMap((templateId) => {
    const rule = map.get(templateId);
    if (!rule) return [`${templateId} 缺少资源位规则记录`];
    if (rule.deliveryAllowed !== true || rule.status !== "verified") {
      return [`${templateId} 的视觉规则尚未完成核实，只能用于验证，不能交付`];
    }
    return [];
  });
}

export function decodeDataUrl(dataUrl) {
  const match = /^data:([^;,]+);base64,([\s\S]+)$/.exec(String(dataUrl || ""));
  if (!match) throw new Error("文件数据格式无效");
  return { mime: match[1], buffer: Buffer.from(match[2], "base64") };
}

export function safeChild(root, ...segments) {
  const target = path.resolve(root, ...segments);
  const resolvedRoot = path.resolve(root);
  if (target !== resolvedRoot && !target.startsWith(`${resolvedRoot}${path.sep}`)) throw new Error("非法路径");
  return target;
}

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export function createStoreZip(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(sanitizeZipName(file.name), "utf8");
    const data = Buffer.isBuffer(file.data) ? file.data : Buffer.from(file.data);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    localParts.push(local, name, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.length + name.length + data.length;
  }
  const centralBody = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBody.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, centralBody, end]);
}
