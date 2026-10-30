function normalized(value) {
  return String(value || "").normalize("NFKC").toLowerCase().replace(/[\s_\-/&＋+、，,。；;（）()《》]/g, "");
}

const explicitAliases = [
  { businessLineId: "performance-marketing", segmentId: "mumu", label: "MuMu模拟器", keywords: ["mumu模拟器", "mumu", "网易mumu", "木木模拟器"] },
  { businessLineId: "performance-marketing", segmentId: "leidian", label: "雷电模拟器", keywords: ["雷电模拟器", "雷电", "ldplayer"] },
  { businessLineId: "performance-marketing", segmentId: "information-feed", label: "信息流", keywords: ["信息流"] },
];

export function resolveProductionScope(instruction, businessLines = []) {
  const text = normalized(instruction);
  for (const alias of explicitAliases) {
    if (!alias.keywords.some((keyword) => text.includes(normalized(keyword)))) continue;
    const line = businessLines.find((item) => item.id === alias.businessLineId && item.enabled !== false);
    const segment = line?.segments?.find((item) => item.id === alias.segmentId && item.enabled !== false);
    if (segment) return { businessLineId: line.id, segmentIds: [segment.id], label: segment.name || alias.label, explicit: true };
  }
  for (const line of businessLines.filter((item) => item.enabled !== false)) {
    const segment = [...(line.segments || [])].filter((item) => item.enabled !== false).sort((a, b) => normalized(b.name).length - normalized(a.name).length).find((item) => text.includes(normalized(item.name)));
    if (segment) return { businessLineId: line.id, segmentIds: [segment.id], label: segment.name, explicit: true };
  }
  for (const line of businessLines.filter((item) => item.enabled !== false)) {
    if (text.includes(normalized(line.name))) return { businessLineId: line.id, segmentIds: (line.segments || []).filter((item) => item.enabled !== false).map((item) => item.id), label: line.name, explicit: true };
  }
  const fallback = businessLines.find((item) => item.id === "platform-community" && item.enabled !== false) || businessLines.find((item) => item.enabled !== false);
  return { businessLineId: fallback?.id || "platform-community", segmentIds: (fallback?.segments || []).filter((item) => item.enabled !== false).map((item) => item.id), label: fallback?.name || "平台社区", explicit: false };
}

export function selectProductionTemplates(templates = [], resourceRules = [], scope) {
  const segmentIds = new Set(scope.segmentIds || []);
  const candidates = templates.filter((template) => template.businessLineId === scope.businessLineId && (!segmentIds.size || segmentIds.has(template.segmentId)));
  const ruleMap = new Map(resourceRules.map((rule) => [rule.templateId, rule]));
  const isReady = (template) => template.automationReady !== false && ruleMap.get(template.id)?.deliveryAllowed !== false;
  const ready = candidates.filter(isReady);
  if (scope.explicit && candidates.length) return { templates: candidates, validationOnly: candidates.some((template) => !isReady(template)) };
  return { templates: ready, validationOnly: false };
}
