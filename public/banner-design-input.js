// Inputs for the banner designer: a complete composition and the exact glyphs
// of the loaded company font. This module does not generate or alter artwork.
const KINDS = ['character', 'character2', 'title', 'subtitle', 'logo', 'foreground', 'ip-copyright', 'subtitle-backing'];
const finite = (value, fallback) => value !== null && value !== '' && Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const clone = (value) => value === undefined ? undefined : structuredClone(value);

function sizeOf(template) {
  const width = finite(template?.width, 0), height = finite(template?.height, 0);
  if (width <= 0 || height <= 0) throw new TypeError('Banner dimensions must be positive.');
  return { width, height };
}

function safeFrame(template, width, height) {
  const inset = (value, dimension, fallback) => {
    const n = finite(value, fallback);
    return clamp(n <= 1 ? n * dimension : n, 0, dimension * .2);
  };
  const safe = template.safeArea || {};
  const left = inset(safe.left, width, .035), right = inset(safe.right, width, .035);
  const top = inset(safe.top, height, .04), bottom = inset(safe.bottom, height, .04);
  return { x: left, y: top, width: width - left - right, height: height - top - bottom };
}

function bounded(rect, frame) {
  const width = clamp(finite(rect.width, 1), Math.min(1, frame.width), frame.width);
  const height = clamp(finite(rect.height, 1), Math.min(1, frame.height), frame.height);
  return {
    ...rect, width, height,
    x: clamp(finite(rect.x, frame.x), frame.x, frame.x + frame.width - width),
    y: clamp(finite(rect.y, frame.y), frame.y, frame.y + frame.height - height),
  };
}

function aspectOf(value) {
  const ratio = typeof value === 'object' && value
    ? finite(value.width, 0) / finite(value.height, 0) : finite(value, 0);
  return Number.isFinite(ratio) && ratio > 0 ? ratio : null;
}

function contain(rect, aspect, align = 'center') {
  if (!aspect) return rect;
  const width = Math.min(rect.width, rect.height * aspect), height = width / aspect;
  return {
    ...rect, width, height,
    x: rect.x + (rect.width - width) * (align === 'right' ? 1 : .5),
    y: rect.y + rect.height - height,
  };
}

function horizontalDirection(direction) {
  const value = String(direction || '');
  const verbs = '(?:位置)?\\s*(?:应当|应该|需要|希望|要)?\\s*(?:放置在|放置于|放置|安排在|安排到|安排|摆放在|摆放到|摆放|放在|放到|摆在|移到|移至|位于|置于|保持在|保持|在|放|摆|靠近|靠|居于|居)?\\s*(?:画面|画布|版面)?的?\\s*';
  const detect = subject => [...value.matchAll(new RegExp(`${subject}${verbs}(左|右)(?:边|侧|方|半边|半部)?`, 'gu'))].map(match => match[1]);
  const character = new Set(detect('(?:核心人物|主要人物|主要角色|主角色|人物(?![2２二])|角色(?![2２二]))'));
  const title = new Set(detect('(?:主标题|主文案|主标|(?<!副)标题)'));
  if (character.size > 1 || title.size > 1) throw new Error('人物或主标的左右位置要求相互冲突，请明确各自放在哪一侧。');
  const characterSide = [...character][0], titleSide = [...title][0];
  if (characterSide && characterSide === titleSide) throw new Error('人物和主标同时要求放在同一侧，请明确左右分区后再生成母版。');
  return characterSide === '左' || titleSide === '右' ? 'mirror' : 'default';
}

/**
 * Fresh wide banners have copy on the left and the original character on the
 * right. Square/portrait banners stack copy above the character. Saved layouts
 * remain untouched for local edits (reset:false); only missing kinds are filled.
 */
export function createBannerDesignLayout(template, { layouts = {}, aspectByKind = {}, copy = '', subtitle = '', direction = '', reset = true } = {}) {
  const { width: w, height: h } = sizeOf(template);
  const frame = safeFrame(template, w, h);
  const horizontal = reset ? horizontalDirection(direction) : 'default';
  const wide = w / h >= 1.6;
  const normalized = wide ? {
    character: [.59, .04, .375, .92], character2: [.7, .2, .255, .76],
    title: [.045, .19, .525, .43], subtitle: [.065, .69, .48, .095],
    logo: [.04, .04, .17, .125], foreground: [.04, .83, .92, .13],
    'ip-copyright': [.74, .92, .21, .035],
  } : {
    character: [.09, .48, .82, .465], character2: [.55, .56, .38, .385],
    title: [.065, .18, .87, .22], subtitle: [.10, .425, .80, .055],
    logo: [.055, .04, .27, .105], foreground: [.04, .84, .92, .12],
    'ip-copyright': [.63, .945, .32, .025],
  };
  const result = {};
  for (const kind of KINDS.filter(kind => kind !== 'subtitle-backing')) {
    const key = kind === 'ip-copyright' ? 'copyright' : kind;
    const suppliedDefault = template.communityLayout?.[key];
    const source = Array.isArray(suppliedDefault) && suppliedDefault.length >= 4 ? suppliedDefault : normalized[kind];
    const [x, y, width, height] = source;
    const previous = layouts[kind];
    const visible = kind === 'character2' || kind === 'foreground'
      // getElementLayout supplies visible:true for absent optional image layers.
      // Do not let that placeholder reserve half of the main subject's region.
      ? Boolean(aspectOf(aspectByKind[kind])) && previous?.visible !== false
      : previous?.visible ?? (kind === 'title' ? Boolean(String(copy).trim())
      : kind === 'subtitle' ? Boolean(String(subtitle).trim())
      : kind === 'logo' ? template.brandLogo !== false
      : kind === 'ip-copyright' ? template.ipCopyright === true : true);
    result[kind] = { ...clone(previous || {}), x: x * w, y: y * h, width: width * w, height: height * h, visible };
  }

  // Existing square templates used a left/right composition; the fresh designer
  // now reserves a complete top copy block and a complete lower subject block.
  if (!wide) {
    for (const kind of ['character', 'character2', 'title', 'subtitle']) {
      const [x, y, width, height] = normalized[kind];
      Object.assign(result[kind], { x: x * w, y: y * h, width: width * w, height: height * h });
    }
  }

  for (const kind of KINDS.filter(kind => kind !== 'subtitle-backing')) result[kind] = bounded(result[kind], frame);
  const gap = Math.min(w * .024, h * .045);
  const title = result.title, caption = result.subtitle;
  const bottom = frame.y + frame.height;
  if (wide) {
    const characterLeft = Math.max(frame.x + frame.width * .58, result.character.x);
    result.character = bounded({ ...result.character, x: characterLeft, width: frame.x + frame.width - characterLeft }, frame);
    const copyRight = characterLeft - gap;
    for (const box of [title, caption]) box.width = Math.max(1, Math.min(box.width, copyRight - box.x));
    caption.height = Math.min(caption.height, h * .105);
    caption.y = Math.max(title.y + Math.min(title.height, h * .44) + gap, Math.min(caption.y, h * .73));
    caption.y = Math.min(caption.y, bottom - caption.height - h * .06);
    title.height = Math.max(1, Math.min(title.height, caption.y - gap - title.y));
  } else {
    // Leave a small gap below the backing and above the character's horns.
    const characterTop = Math.max(result.character.y, caption.y + caption.height + h * .035);
    result.character = bounded({ ...result.character, y: characterTop, height: bottom - characterTop }, frame);
  }
  for (const kind of ['character', 'character2', 'logo', 'foreground']) {
    result[kind] = contain(result[kind], aspectOf(aspectByKind[kind]), wide && kind === 'character' ? 'right' : 'center');
  }
  // A second supplied character shares the subject area instead of covering the
  // title. Without a second asset its frame exists but remains hidden.
  if (result.character2.visible) {
    const region = wide
      ? { x: result.character.x, y: frame.y, width: frame.x + frame.width - result.character.x, height: frame.height }
      : { x: frame.x, y: result.character.y, width: frame.width, height: bottom - result.character.y };
    const slotWidth = region.width * .49;
    result.character = contain({ ...result.character, ...region, width: slotWidth }, aspectOf(aspectByKind.character));
    result.character2 = contain({ ...result.character2, ...region, x: region.x + region.width - slotWidth, width: slotWidth }, aspectOf(aspectByKind.character2));
  }
  const padX = Math.min(w * .018, caption.width * .045), padY = caption.height * .25;
  result['subtitle-backing'] = bounded({
    ...clone(layouts['subtitle-backing'] || {}),
    x: caption.x - padX, y: caption.y - padY,
    width: caption.width + padX * 2, height: caption.height + padY * 2,
    visible: caption.visible,
  }, frame);
  if (horizontal === 'mirror') {
    for (const kind of ['character', 'character2', 'title', 'subtitle', 'subtitle-backing']) {
      const box = result[kind];
      box.x = frame.x + frame.width - (box.x - frame.x) - box.width;
    }
  }
  if (!reset) {
    for (const kind of KINDS) if (layouts[kind]) result[kind] = clone(layouts[kind]);
  }
  return result;
}

function graphemes(text) {
  return typeof Intl?.Segmenter === 'function'
    ? Array.from(new Intl.Segmenter('zh', { granularity: 'grapheme' }).segment(text), item => item.segment)
    : Array.from(text);
}
const isChinese = (character) => /[\p{Script=Han}]/u.test(character);
const glyphWeight = (character) => isChinese(character) ? 1 : /[A-Z0-9]/u.test(character) ? .7 : /\s/u.test(character) ? .3 : .55;

/** Exact copy, with explicit line breaks respected and long Chinese titles balanced. */
export function splitBannerTitle(text, box = {}) {
  const value = String(text ?? '').trim().replace(/\r\n?/g, '\n');
  if (!value) return [];
  if (value.includes('\n')) return value.split('\n');
  const chars = graphemes(value), chineseCount = chars.filter(isChinese).length;
  const ratio = finite(box.width, 1) / Math.max(.01, finite(box.height, 1));
  if (chineseCount < 8 || (ratio >= 5.5 && chineseCount <= 12)) return [value];
  // Exhaustive two-line search preserves punctuation and allows a semantic cue
  // such as “谁是” to begin the second line rather than splitting that phrase.
  const weights = [0];
  for (const char of chars) weights.push(weights.at(-1) + glyphWeight(char));
  const total = weights.at(-1);
  let best = 1, bestScore = Infinity;
  const wordBoundaries = new Set();
  if (typeof Intl?.Segmenter === 'function') {
    const offsets = new Map(); let offset = 0;
    chars.forEach((char, index) => { offsets.set(offset, index); offset += char.length; });
    for (const item of new Intl.Segmenter('zh', { granularity: 'word' }).segment(value)) {
      if (offsets.has(item.index)) wordBoundaries.add(offsets.get(item.index));
    }
  }
  for (let index = 1; index < chars.length; index += 1) {
    const left = weights[index], right = total - left;
    if (Math.min(left, right) < Math.min(2, total / 3)) continue;
    let score = Math.abs(left - right) / total;
    if (/^[，。！？、：；,.!?;:）】》」』]/u.test(chars[index])) score += 2;
    if (/[（【《「『]$/u.test(chars[index - 1])) score += 2;
    if (wordBoundaries.has(index)) score -= .10;
    if (/^(谁是|如何|全新|限时|即将|正式|邀你|一起)/u.test(chars.slice(index).join(''))) score -= .24;
    if (/[，、：；,:;]$/u.test(chars[index - 1])) score -= .18;
    if (score < bestScore) { bestScore = score; best = index; }
  }
  return [chars.slice(0, best).join(''), chars.slice(best).join('')];
}

function measureLines(ctx, lines, fontSize, fontFamily, lineScales) {
  ctx.font = `400 ${fontSize}px ${fontFamily}`;
  const metrics = lines.map((line,index) => {
    const actualSize=fontSize*(lineScales?.[index] || 1);
    ctx.font=`400 ${actualSize}px ${fontFamily}`;
    const m = ctx.measureText(line);
    const left = finite(m.actualBoundingBoxLeft, 0);
    const right = finite(m.actualBoundingBoxRight, finite(m.width, 0));
    return {
      left, right, width: Math.max(0, left + right),
      ascent: Math.max(0, finite(m.actualBoundingBoxAscent, actualSize * .85)),
      descent: Math.max(0, finite(m.actualBoundingBoxDescent, actualSize * .15)),
      fontSize:actualSize,
    };
  });
  const lineHeight = Math.max(fontSize * 1.12, ...metrics.map(item => (item.ascent + item.descent) * 1.08));
  if(lineScales){
    let cursor=0;const baselines=[];
    for(const m of metrics){baselines.push(cursor+m.ascent);cursor+=m.ascent+m.descent+fontSize*.09;}
    return {metrics,lineHeight,top:0,height:cursor-fontSize*.09,width:Math.max(...metrics.map(m=>m.width)),baselines};
  }
  const top = Math.min(...metrics.map((m, i) => i * lineHeight - m.ascent));
  const bottom = Math.max(...metrics.map((m, i) => i * lineHeight + m.descent));
  return { metrics, lineHeight, top, height: bottom - top, width: Math.max(...metrics.map(item => item.width)) };
}

/**
 * Render only white glyph alpha from the already loaded real font. The returned
 * canvas is a local transparent PNG layer of rect.width × rect.height at scale;
 * x/y stay in rect for placement. AI effects must not replace this glyph mask.
 */
export function renderBannerTitleMask({ text, fontFamily, rect = {}, scale = 2, emphasizeFirstLine=false, document = globalThis.document } = {}) {
  if (!document?.createElement) throw new TypeError('A canvas document is required.');
  const family = String(fontFamily || '').trim();
  if (!family) throw new TypeError('Load and specify a company font before rendering title glyphs.');
  if (document.fonts?.check && !document.fonts.check(`400 16px ${family}`)) throw new Error('The selected title font has not finished loading.');
  const width = Math.max(1, finite(rect.width, 1)), height = Math.max(1, finite(rect.height, 1));
  const density = clamp(finite(scale, 2), .25, 4);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(width * density));
  canvas.height = Math.max(1, Math.ceil(height * density));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas text rendering is unavailable.');
  ctx.scale(canvas.width / width, canvas.height / height);
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
  const lines = splitBannerTitle(text, { width, height });
  const placement = { ...clone(rect), width, height };
  if (!lines.length) return { canvas, lines, fontSize: 0, rect: placement, scale: density, fontFamily: family };
  const lineScales=emphasizeFirstLine && lines.length===2?[clamp(lines[1].length/Math.max(1,lines[0].length)*.92,1,1.38),1]:undefined;
  const padding = Math.max(.5, Math.min(width, height) * (emphasizeFirstLine ? .055 : .035));
  const innerWidth = Math.max(.01, width - padding * 2), innerHeight = Math.max(.01, height - padding * 2);
  let low = .01, high = Math.min(4096, height * 4);
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const middle = (low + high) / 2, measured = measureLines(ctx, lines, middle, family,lineScales);
    if (measured.width <= innerWidth && measured.height <= innerHeight) low = middle;
    else high = middle;
  }
  const fontSize = Math.max(.001, Math.floor(low * 1000) / 1000);
  const measured = measureLines(ctx, lines, fontSize, family,lineScales);
  const baseline = (height - measured.height) / 2 - measured.top;
  lines.forEach((line, index) => {
    const m = measured.metrics[index];
    ctx.font=`400 ${m.fontSize}px ${family}`;
    ctx.fillText(line, (width - m.width) / 2 + m.left, baseline + (measured.baselines?.[index] ?? index * measured.lineHeight));
  });
  return { canvas, lines, fontSize,lineFontSizes:measured.metrics.map(m=>m.fontSize),rect: placement, scale: density, fontFamily: family, lineHeight: measured.lineHeight };
}
