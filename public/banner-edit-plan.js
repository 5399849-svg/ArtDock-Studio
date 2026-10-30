// A small, deliberately bounded edit vocabulary shared by the browser and server.
// This module never calls a model and never changes artwork. Unrecognised requests
// stay unresolved so a caller can clarify them or send them to a design planner.
export const BANNER_LAYER_KINDS = Object.freeze([
  'background', 'character', 'character2', 'foreground', 'title', 'subtitle',
  'subtitle-backing', 'logo', 'ip', 'button',
]);

export function shouldGenerateBannerBacking(prompt,subtitle){
  return Boolean(String(subtitle || '').trim()) && !/(?:不要|不用|无需|不需要|不添加|去掉|删除|无)(?:副标题?|副标)?(?:的)?(?:底板|底条|承托|底框)/.test(String(prompt || '').replace(/\s/g,''));
}

const aliases = {
  'subtitle-backing': ['副标题的底板', '副标的底板', '副标题底板', '副标底板', '副标底框', '副标承托', '承托区域', '题签底板', '底板', '承托'],
  character2: ['次要人物', '第二个人物', '第二个角色', '人物2', '角色2'],
  character: ['核心人物', '主要人物', '主要角色', '主角色', '人物', '角色'],
  foreground: ['前景元素', '前景'],
  background: ['背景场景', '背景', '场景'],
  subtitle: ['副标题', '副文案', '副标', '小标题'],
  title: ['主标题', '主文案', '大标题', '主标', '标题'],
  logo: ['logo', '品牌标志', '品牌标识'],
  ip: ['IP标识', 'IP标志'],
  button: ['按钮'],
};
const aliasKinds = new Map(Object.entries(aliases).flatMap(([kind, values]) => values.map(value => [value.toLowerCase(), kind])));
const aliasPattern = [...aliasKinds.keys()].sort((a, b) => b.length - a.length).map(escapeRegex).join('|');
const noisePattern = /(?:请|麻烦|帮我|帮忙|一下|再|并且|并|同时|然后|也|就|都|只|仅|把|将|给|要|的|地|和|与|及|以及|跟|还|可以|需要|稍微|稍|更|做|进行|调整|一点|一些|少许|\s|[:：])/g;
const keepRestPattern = /^(?:其余|其他|其它|剩下|剩余)(?:的)?(?:内容|部分|元素|图层|画面|东西)?(?:全部|全都|都|一律)?(?:保持|保留|维持)?(?:不变|不动|原样|现状|保留|不要改|不要动|不用改|不用动|无需调整)(?:即可|就好)?$/;
const freezePattern = /(?:保持|保留|维持).{0,12}(?:不变|不动|原样|现状)|不动|不变|不改(?:动)?|不调整|不用改|无需调整|不要(?:移动|缩放|放大|缩小|调整)/;
const attributeConstraintPattern = /(?:字形|排版|文字内容|文案内容|原有人物|人物原貌|五官|比例|透视|原图).{0,16}(?:不变|不改|保持|保留|不要)|(?:保持|保留|不要改).{0,16}(?:字形|排版|文字内容|文案内容|五官|原貌)|(?:不要|不用|不需要|别)(?:再)?(?:加|添加|增加).{0,12}(?:装饰|点缀)/;
const attributeConstraintFragments = /(?:字形|排版|文字内容|文案内容|人物原貌|五官|比例|透视|原图)(?:保持|保留)?(?:不变|不要改|不改|保持原样)|(?:保持|保留)(?:原有的?|原来的?)?(?:字形|排版|文字内容|文案内容|人物原貌|五官|比例|透视|原图)(?:不变|原样)?|(?:不要|不用|不需要|别)(?:再)?(?:加|添加|增加)(?:任何|额外的?|太多的?)?(?:装饰|点缀)/g;
const stylePattern = /颜色|色调|渐变|描边|阴影|光泽|质感|风格|设计|亮|暗|饱和|简洁|装饰|纸|纹理|题签|标签|旗帜|木|金属|立体|圆角|胶囊|写实|自然|黑体|宋体|字魂|字体|字形|红|橙|黄|绿|青|蓝|紫|粉|金|银|白|黑|棕|米色/;

function followsBackingTilt(clause) {
  const text = clause.replace(/\s/g, '');
  const subject = '(?:副标题|副文案|副标|小标题)(?:的)?(?:文字|文案|内容)?';
  const backing = '(?:副标题的底板|副标的底板|副标题底板|副标底板|副标底框|副标承托|承托区域|题签底板|底板|承托)';
  const tilt = '(?:倾斜(?:方向|角度)?|斜度|角度|坡度|斜向)';
  const prefix = '(?:(?:请|麻烦|帮我|帮忙|把|将|让)(?:这个|当前的?)?)*';
  const follow = `(?:要|需要|也|应该|应|再)*(?:跟着|跟随|随着|随|按照|按|沿着|顺着)(?:现有的?|当前的?|这个)?${backing}(?:的)?${tilt}(?:来)?(?:一起|同步)?(?:做(?:一下)?调整|调整|旋转|倾斜|排版|排列|排布|摆放|放置|对齐)?(?:一下|即可|就好)?`;
  const sameTilt = `(?:的)?${tilt}(?:要|需要)?(?:与|和|跟)${backing}(?:的)?(?:${tilt})?(?:保持)?(?:一致|相同)`;
  return new RegExp(`^${prefix}${subject}(?:${follow}|${sameTilt})$`).test(text);
}

function escapeRegex(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function unique(values) { return [...new Set(values)]; }
function clone(value) { return structuredClone(value); }
function finite(value) { return typeof value === 'number' && Number.isFinite(value); }
function normaliseInstruction(value) { return String(value ?? '').replace(/\r\n?/g, '\n').trim(); }

function subjectGroups(clause) {
  const matches = [...clause.matchAll(new RegExp(aliasPattern, 'gi'))].map(match => ({ index: match.index, end: match.index + match[0].length, kind: aliasKinds.get(match[0].toLowerCase()) }));
  if (!matches.length) return [];
  const groups = [{ start: 0, end: clause.length, kinds: [matches[0].kind], lastEnd: matches[0].end }];
  for (let index = 1; index < matches.length; index += 1) {
    const match = matches[index], group = groups.at(-1);
    // A repeated name can describe the intended style ("背景改成书房场景").
    if (group.kinds.includes(match.kind)) { group.lastEnd = match.end; continue; }
    const between = clause.slice(group.lastEnd, match.index).trim();
    if (/^(?:和|与|及|、|以及|跟|还有|及其)*$/.test(between)) {
      group.kinds.push(match.kind); group.lastEnd = match.end;
    } else {
      group.end = match.index;
      groups.push({ start: match.index, end: clause.length, kinds: [match.kind], lastEnd: match.end });
    }
  }
  return groups.map(group => ({ kinds: unique(group.kinds), text: clause.slice(group.start, group.end).trim() }));
}

function geometryOperations(text, kinds) {
  const operations = [], problems = [], spans = [];
  const withoutSubjects = text.replace(new RegExp(aliasPattern, 'gi'), match => ' '.repeat(match.length));
  const append = (operation) => kinds.forEach(kind => operations.push({ ...operation, kind }));
  const scalePatterns = [
    /(缩小|放大|变小|变大|调小|调大)(\s*(?:到|至|为|成)(?:原来(?:的)?)?)?\s*(\d+(?:\.\d+)?)?\s*(%|％|倍|像素|px)?(?:一点|一些|点|少许|一号|很多)?/gi,
    /(小|大)(一点|一些|点|少许|一号|很多)/g,
  ];
  for (let patternIndex = 0; patternIndex < scalePatterns.length; patternIndex += 1) {
    for (const match of withoutSubjects.matchAll(scalePatterns[patternIndex])) {
      if (spans.some(span => match.index < span.end && match.index + match[0].length > span.start)) continue;
      spans.push({ start: match.index, end: match.index + match[0].length });
      const shrink = /小/.test(match[1]);
      const numeric = patternIndex === 0 && match[3] !== undefined;
      const amount = numeric ? Number(match[3]) : null;
      const unit = numeric ? (match[4] || '') : '';
      let factor = /很多/.test(match[0]) ? (shrink ? .8 : 1.2) : (shrink ? .9 : 1.1);
      if (numeric) {
        if (unit === '像素' || /^px$/i.test(unit) || !unit) {
          problems.push(text); continue;
        }
        if (unit === '倍') factor = amount;
        else if (match[2]?.trim()) factor = amount / 100;
        else factor = 1 + (shrink ? -amount : amount) / 100;
      }
      if (!Number.isFinite(factor) || factor < .05 || factor > 4) { problems.push(text); continue; }
      append({ type: 'scale', factor, anchor: 'center' });
    }
  }
  const movementPattern = /(?:向|往|朝)?(左|右|上|下)(?:边|侧|方)?(?:移(?:动)?|挪(?:动)?)?\s*(\d+(?:\.\d+)?)?\s*(%|％|像素|px)?(?:一点|一些|点|少许)?/gi;
  for (const match of withoutSubjects.matchAll(movementPattern)) {
    if (!/(?:向|往|朝|移|挪|一点|一些|少许|点)/.test(match[0])) continue;
    if (spans.some(span => match.index < span.end && match.index + match[0].length > span.start)) continue;
    spans.push({ start: match.index, end: match.index + match[0].length });
    const amount = match[2] === undefined ? 2 : Number(match[2]);
    const unit = match[2] === undefined || /[%％]/.test(match[3] || '') ? 'percent' : 'px';
    if (!Number.isFinite(amount) || amount <= 0 || (unit === 'percent' && amount > 100) || amount > 10000) { problems.push(text); continue; }
    const sign = /左|上/.test(match[1]) ? -1 : 1;
    append({ type: 'move', dx: /左|右/.test(match[1]) ? amount * sign : 0, dy: /上|下/.test(match[1]) ? amount * sign : 0, unit });
  }
  let remainder = withoutSubjects;
  for (const span of spans.sort((a, b) => b.start - a.start)) remainder = remainder.slice(0, span.start) + ' '.repeat(span.end - span.start) + remainder.slice(span.end);
  return { operations, problems, remainder: remainder.replace(noisePattern, '').trim() };
}

/**
 * Parse only safe, common edit operations. Unknown scope is never expanded to all
 * layers. A caller must not execute a partial plan while unresolved is nonempty.
 */
export function planBannerEdit(instruction, { mode = 'edit', availableKinds = BANNER_LAYER_KINDS } = {}) {
  const prompt = normaliseInstruction(instruction);
  const allowedKinds = unique(availableKinds.filter(kind => BANNER_LAYER_KINDS.includes(kind)));
  const base = { schemaVersion: 1, mode: mode === 'design' ? 'design' : 'edit', instruction: prompt, operations: [], affectedKinds: [], preserveKinds: [...allowedKinds], constraints: [], unresolved: [], requiresAi: false, canApplyLocally: false };
  if (!prompt) { base.unresolved.push('请输入需要生成或修改的内容。'); return base; }
  if (mode === 'design') return { ...base, operations: [{ type: 'compose', prompt }], affectedKinds: [...allowedKinds], preserveKinds: [], requiresAi: true };
  const explicitPreserve = new Set();
  let previousKinds = [];
  for (const clause of prompt.split(/[，,；;。\n]+|但是|但|并且|同时/).map(value => value.trim()).filter(Boolean)) {
    if (keepRestPattern.test(clause.replace(/\s/g, ''))) { base.constraints.push(clause); previousKinds = []; continue; }
    // In this relational request the backing supplies an angle, rather than
    // becoming a second design target. Resolve it before splitting subjects.
    if (followsBackingTilt(clause)) {
      previousKinds = ['subtitle'];
      if (!['subtitle', 'subtitle-backing'].every(kind => allowedKinds.includes(kind))) {
        base.unresolved.push(clause);
      } else {
        base.operations.push({ type: 'follow-backing', kind: 'subtitle', target: 'subtitle-backing', followTilt: true, align: 'center' });
      }
      continue;
    }
    const groups = subjectGroups(clause);
    if (!groups.length && attributeConstraintPattern.test(clause)) { base.constraints.push(clause); continue; }
    const scopedGroups = groups.length ? groups : previousKinds.length ? [{ kinds: previousKinds, text: clause }] : [];
    if (!scopedGroups.length) { base.unresolved.push(clause); continue; }
    for (const group of scopedGroups) {
      const kinds = group.kinds.filter(kind => allowedKinds.includes(kind));
      previousKinds = kinds;
      if (!kinds.length || kinds.length !== group.kinds.length) { base.unresolved.push(group.text); continue; }
      let actionableText = group.text;
      const attributeFragments = [...group.text.matchAll(attributeConstraintFragments)];
      if (attributeFragments.length) {
        attributeFragments.forEach(match => base.constraints.push(match[0]));
        actionableText = group.text.replace(attributeConstraintFragments, '');
        if (!actionableText.replace(new RegExp(aliasPattern, 'gi'), '').replace(noisePattern, '')) continue;
      } else if (attributeConstraintPattern.test(group.text)) {
        // A constraint outside the bounded fragment syntax remains visible to the
        // planner. Do not claim an accompanying edit has been applied.
        base.constraints.push(group.text);
        base.unresolved.push(group.text);
        continue;
      }
      if (freezePattern.test(actionableText)) {
        const geometry = geometryOperations(actionableText.replace(freezePattern, ''), kinds);
        if (geometry.operations.length) base.unresolved.push(group.text);
        kinds.forEach(kind => explicitPreserve.add(kind)); base.constraints.push(group.text); continue;
      }
      const body = actionableText.replace(new RegExp(aliasPattern, 'gi'), '').replace(/(?:请|麻烦|帮我|帮忙|一下|把|将|给|的|\s|[:：])/g, '');
      if (/^(?:去掉|删除|移除|隐藏|不要|不用|取消)(?:了|吧|即可|就好)?$/.test(body)) {
        kinds.forEach(kind => base.operations.push({ type: 'visibility', kind, visible: false })); continue;
      }
      if (/^(?:显示|恢复|重新显示|打开)$/.test(body)) {
        kinds.forEach(kind => base.operations.push({ type: 'visibility', kind, visible: true })); continue;
      }
      // A quoted copy replacement is not an art-direction request. Let the UI
      // obtain exact text rather than inadvertently rasterising/rewording it.
      if (kinds.some(kind => ['title', 'subtitle'].includes(kind)) && /(?:文字|文案|内容)(?:改|换|写|替换)|(?:改成|改为|写成|替换成|换成)\s*[“"'「『]/.test(group.text)) {
        base.unresolved.push(group.text); continue;
      }
      const geometry = geometryOperations(actionableText, kinds);
      base.operations.push(...geometry.operations);
      base.unresolved.push(...geometry.problems);
      if (geometry.remainder) {
        if (/^(?:改成|改为|写成|替换成|换成)/.test(geometry.remainder) && kinds.some(kind => ['title', 'subtitle'].includes(kind)) && !stylePattern.test(geometry.remainder)) {
          base.unresolved.push(group.text);
        } else {
          const meaningful = geometry.remainder.replace(/(?:做成|改成|改为|换成|换为|重新|生成|修改|变得|变成|变|成|为|更)/g, '').trim();
          if (!meaningful) base.unresolved.push(group.text);
          else kinds.forEach(kind => base.operations.push({ type: 'design', kind, prompt: group.text }));
        }
      } else if (!geometry.operations.length && !geometry.problems.length) base.unresolved.push(group.text);
    }
  }
  base.affectedKinds = unique(base.operations.map(operation => operation.kind));
  const conflicts = base.affectedKinds.filter(kind => explicitPreserve.has(kind));
  for (const kind of conflicts) base.unresolved.push(`“${aliases[kind][0]}”同时要求修改和保留，请明确要修改的部分。`);
  base.unresolved = unique(base.unresolved);
  base.constraints = unique(base.constraints);
  base.preserveKinds = allowedKinds.filter(kind => !base.affectedKinds.includes(kind));
  base.requiresAi = base.operations.some(operation => operation.type === 'design') || base.unresolved.length > 0;
  base.canApplyLocally = base.operations.length > 0 && !base.requiresAi;
  return base;
}

function validRect(value) { return value && ['x', 'y', 'width', 'height'].every(key => finite(value[key])) && value.width > 0 && value.height > 0; }

/** Apply geometry to a cloned layout map. No default layers/assets are invented. */
export function applyBannerLayoutOperations(layouts, canvas, operations) {
  const result = { layouts: clone(layouts || {}), applied: [], skipped: [] };
  const width = canvas?.width, height = canvas?.height;
  if (!finite(width) || width <= 0 || !finite(height) || height <= 0) throw new TypeError('A finite, positive canvas width and height are required.');
  for (const operation of operations || []) {
    const kind = operation?.kind;
    const skip = reason => result.skipped.push({ operation: clone(operation), reason });
    if (!BANNER_LAYER_KINDS.includes(kind)) { skip('unknown-layer'); continue; }
    // The host must inspect the actual raster carrier before resolving its
    // intrinsic angle. Never pretend an unmeasured local alignment was applied.
    if (operation.type === 'follow-backing') { skip('requires-backing-analysis'); continue; }
    if (!['scale', 'move', 'visibility'].includes(operation.type)) { skip('requires-design'); continue; }
    const layout = result.layouts[kind];
    if (!validRect(layout)) { skip('missing-layout'); continue; }
    if (operation.type === 'visibility') {
      if (typeof operation.visible !== 'boolean') { skip('invalid-visibility'); continue; }
      layout.visible = operation.visible;
      // The inspector can remove a carrier by disabling its paint while keeping
      // its saved geometry/style. Explicitly showing that existing layer should
      // restore the paint as well; hiding does not discard its configuration.
      if (kind === 'subtitle-backing' && operation.visible && layout.backing && typeof layout.backing === 'object' && !Array.isArray(layout.backing)) layout.backing.enabled = true;
    } else if (operation.type === 'scale') {
      if (!finite(operation.factor) || operation.factor < .05 || operation.factor > 4) { skip('invalid-scale'); continue; }
      const factor = Math.min(operation.factor, width / layout.width, height / layout.height);
      const centerX = layout.x + layout.width / 2, centerY = layout.y + layout.height / 2;
      layout.width *= factor; layout.height *= factor;
      layout.x = Math.max(0, Math.min(width - layout.width, centerX - layout.width / 2));
      layout.y = Math.max(0, Math.min(height - layout.height, centerY - layout.height / 2));
    } else {
      if (!finite(operation.dx) || !finite(operation.dy) || !['px', 'percent'].includes(operation.unit)) { skip('invalid-move'); continue; }
      const deltaX = operation.dx * (operation.unit === 'percent' ? width / 100 : 1);
      const deltaY = operation.dy * (operation.unit === 'percent' ? height / 100 : 1);
      layout.x = Math.max(0, Math.min(Math.max(0, width - layout.width), layout.x + deltaX));
      layout.y = Math.max(0, Math.min(Math.max(0, height - layout.height), layout.y + deltaY));
    }
    result.applied.push(clone(operation));
  }
  return result;
}
