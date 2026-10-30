import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { nearestBananaRatio } from './ai-huabu.mjs';
import { communityImageModels } from './community-ai-generation.mjs';
import { isCommunityReference } from '../public/community-references.js';
import { communityTypographyDesignGuide } from './community-typography-design.mjs';
import {finishLicensedTitle} from './licensed-title-finish.mjs';
import {resolveBannerTitleReference} from './banner-title-reference.mjs';

const MAX_PIXELS = 32_000_000;
const LAYER_KINDS = new Set(['background', 'title', 'subtitle-backing']);
const STAGE_ORDER = ['direction', 'background', 'title-material', 'subtitle-backing'];
const sha256 = value => createHash('sha256').update(value).digest('hex');
const text = (value, limit = 1600) => String(value || '').trim().slice(0, limit);
const fail = message => { throw new Error(message); };
const isBuffer = value => Buffer.isBuffer(value) && value.length > 0;

function referenceEntries(inputs) {
  if (inputs.references !== undefined && !Array.isArray(inputs.references)) fail('参考图片列表无效');
  return (inputs.references || []).map((buffer, index) => {
    if (!isBuffer(buffer)) fail(`参考输入第${index + 1}张图片无效`);
    return { buffer, role: inputs.referenceRoles?.[index] || 'reference-image' };
  });
}

export function referenceCharacterScene(prompt,inputs={}){
  if((inputs.characters || []).some(isBuffer))return null;
  const match=prompt.match(/(?:使用|采用|根据|参照|参考|用)\s*(?:参考)?图\s*([1-9一二三四五六七八九])\s*(?:中|里|上|的|中提供的|提供的)*\s*(?:角色|人物)/);
  if(!match)return null;
  const number=Number(match[1])||'一二三四五六七八九'.indexOf(match[1])+1;
  const references=referenceEntries(inputs).filter(isCommunityReference);
  if(number>references.length)fail(`角色设定引用了图${number}，但当前只有${references.length}张参考图`);
  return {mode:'reference-character-scene',referenceIndex:number};
}

function sceneImages(context, inputs, { glyph, includeCharacters = false, firstLabel = '当前完整母版' } = {}) {
  const references = referenceEntries(inputs);
  const userReferences = references.filter(entry => isCommunityReference(entry));
  const reserved = 1 + Number(Boolean(glyph));
  if (userReferences.length + reserved > 14) fail(`参考图过多，本次最多支持${14 - reserved}张参考图`);
  const entries = [{ buffer: context, label: firstLabel }];
  let number = 0;
  for (const entry of references) {
    if (isCommunityReference(entry)) {
      entries.push({ ...entry, label: `参考图${++number}（界面图${number}），只按设计师逐图指定的用途借鉴` });
    }
  }
  const seen = new Set(entries.map(entry => sha256(entry.buffer)));
  const internal = references.filter(entry => !isCommunityReference(entry));
  if (includeCharacters) internal.push(...(inputs.characters || []).filter(isBuffer).map(buffer => ({ buffer, role: 'character' })));
  const labels = {
    character: '原始角色素材', 'core-character': '原始核心角色素材', 'secondary-character': '原始次要角色素材',
    title: '当前主标图层', subtitle: '当前副标图层', logo: '原始游戏 Logo',
    background: '当前母版背景', 'mother-candidate': '当前母版背景',
  };
  for (const entry of internal) {
    const identity = sha256(entry.buffer);
    if (seen.has(identity) || entries.length >= 14 - Number(Boolean(glyph))) continue;
    entries.push({ ...entry, label: `${labels[entry.role] || '工作台内部素材'}（不属于参考图编号）` });
    seen.add(identity);
  }
  if (glyph) entries.push({ buffer: glyph.mask, label: '公司版权字体实际字形蒙版（不属于参考图编号），只参考气质，字形由程序保护' });
  return {
    buffers: entries.map(entry => entry.buffer),
    guide: entries.map((entry, index) => `输入第${index + 1}张：${entry.label}`).join('；'),
  };
}

async function runIndependentLayers(operations) {
  const results = new Array(operations.length);
  let next = 0, failure;
  async function worker() {
    while (!failure && next < operations.length) {
      const index = next++;
      try { results[index] = await operations[index](); }
      catch (error) { failure ||= error; }
    }
  }
  // Wait for both active requests to settle before rejecting. No provider job is
  // orphaned and no new layer is submitted after a known failure.
  await Promise.all(Array.from({ length: Math.min(2, operations.length) }, worker));
  if (failure) throw failure;
  return results;
}

async function imageInfo(buffer, label) {
  if (!isBuffer(buffer)) fail(`${label}缺少图片`);
  const info = await sharp(buffer, { limitInputPixels: MAX_PIXELS }).metadata();
  if (!info.width || !info.height || info.width * info.height > MAX_PIXELS) fail(`${label}尺寸无效`);
  return info;
}

function layoutGuide(layouts = {}) {
  return Object.entries(layouts).filter(([, box]) => box && ['x', 'y', 'width', 'height'].every(key => Number.isFinite(box[key])))
    .map(([kind, box]) => `${kind}: ${[box.x, box.y, box.width, box.height].map(value => Math.round(value * 100) / 100).join(',')}`)
    .join('；');
}

async function media(buffers) {
  return Promise.all(buffers.filter(isBuffer).map(async buffer => {
    const info = await imageInfo(buffer, '输入');
    // The provider requires reference dimensions of at least 300 pixels.
    const factor = Math.max(1, 300 / info.width, 300 / info.height);
    const ready = factor > 1
      ? await sharp(buffer).resize(Math.ceil(info.width * factor), Math.ceil(info.height * factor)).png().toBuffer()
      : buffer;
    return { data_base64: ready.toString('base64') };
  }));
}

async function request(model, prompt, template, images, options = {}) {
  const body = {
    model, task_type: 'image', bot_id: 'canvas', prompt,
    ratio: options.ratio || nearestBananaRatio(template.width, template.height), image_size: '2K',
    images: await media(images),
  };
  if (model === communityImageModels.image) Object.assign(body, { quality: 'high', output_format: 'png' });
  if (options.transparent) Object.assign(body, { background: 'transparent', output_format: 'png' });
  return body;
}

// Separable max filter: exact glyph alpha, without blurring or inventing strokes.
function dilateLine(input, width, height, radius, horizontal) {
  const output = new Uint8Array(input.length);
  const length = horizontal ? width : height;
  const lines = horizontal ? height : width;
  const indexes = new Int32Array(length);
  const offset = (line, position) => horizontal ? line * width + position : position * width + line;
  for (let line = 0; line < lines; line++) {
    let head = 0, tail = 0, next = 0;
    for (let position = 0; position < length; position++) {
      const end = Math.min(length - 1, position + radius);
      while (next <= end) {
        const value = input[offset(line, next)];
        while (tail > head && input[offset(line, indexes[tail - 1])] <= value) tail--;
        indexes[tail++] = next++;
      }
      while (tail > head && indexes[head] < position - radius) head++;
      output[offset(line, position)] = input[offset(line, indexes[head])];
    }
  }
  return output;
}

const dilate = (alpha, width, height, radius) => dilateLine(dilateLine(alpha, width, height, radius, true), width, height, radius, false);

async function coloredAlpha(alpha, width, height, rgb) {
  const rgba = Buffer.alloc(width * height * 4);
  for (let pixel = 0; pixel < alpha.length; pixel++) {
    const offset = pixel * 4;
    rgba[offset] = rgb[0]; rgba[offset + 1] = rgb[1]; rgba[offset + 2] = rgb[2]; rgba[offset + 3] = alpha[pixel];
  }
  return sharp(rgba, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

async function prepareTitleMask(inputs) {
  const mask = inputs.titleMask;
  const info = await imageInfo(mask, '主标版权字形');
  if (!info.hasAlpha) fail('主标版权字形必须有真实透明通道');
  const alpha = await sharp(mask).ensureAlpha().extractChannel(3).raw().toBuffer();
  let clear = 0, visible = 0;
  for (const value of alpha) { if (value < 16) clear++; if (value > 16) visible++; }
  if (clear < alpha.length * .02 || visible < 4) fail('主标版权字形必须包含清晰字形和透明留白');
  const font = inputs.titleFont;
  if (!font?.id || !/^[a-f0-9]{64}$/i.test(font.sha256 || '') || !text(font.name, 200)) fail('缺少可追溯的主标版权字体记录');
  return {
    mask, alpha, width: info.width, height: info.height,
    provenance: {
      fontId: font.id, sha256: font.sha256.toLowerCase(), fontName: text(font.name, 200),
      maskSha256: sha256(mask), method: 'licensed-glyph-mask-material-v1',
    },
  };
}

async function materialTitle(material, glyph) {
  const { width, height, alpha, mask } = glyph;
  await imageInfo(material, '主标材质');
  // Material never contributes its own silhouette. Fill is clipped with dest-in
  // to the actual licensed glyph; both restrained outlines use the same alpha.
  // Finish removeAlpha in a separate pipeline: sharp otherwise schedules alpha
  // removal after compositing, which would flatten the protected glyph mask.
  const opaqueMaterial = await sharp(material).resize(width, height, { fit: 'cover' }).removeAlpha().png().toBuffer();
  const fill = await sharp(opaqueMaterial).ensureAlpha()
    .composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
  const innerRadius = Math.max(1, Math.min(6, Math.round(height * .009)));
  const outerRadius = innerRadius + Math.max(1, Math.min(4, Math.round(height * .006)));
  const outer = await coloredAlpha(dilate(alpha, width, height, outerRadius), width, height, [245, 241, 218]);
  const inner = await coloredAlpha(dilate(alpha, width, height, innerRadius), width, height, [76, 91, 104]);
  const buffer = await sharp(outer).composite([{ input: inner }, { input: fill }]).png().toBuffer();
  return { buffer, outlineRadius: outerRadius };
}

async function cleanBacking(buffer) {
  const info = await imageInfo(buffer, '副标承托');
  if (!info.hasAlpha) fail('副标承托缺少真实透明通道，已保留原图层');
  const { data, info: raw } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let clear = 0, occupied = 0;
  let minX = raw.width, minY = raw.height, maxX = -1, maxY = -1;
  for (let y = 0; y < raw.height; y++) for (let x = 0; x < raw.width; x++) {
    const a = data[(y * raw.width + x) * 4 + 3];
    if (a < 16) clear++;
    if (a >= 16) { occupied++; minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  }
  const pixels = raw.width * raw.height;
  if (clear < pixels * .02 || occupied < 4) fail('副标承托必须是真实透明底独立图层，不能使用整图或棋盘格背景');
  const width = maxX - minX + 1, height = maxY - minY + 1;
  // A caption carrier is a strip, not a flattened poster with transparent edges.
  if (width / height < 1.8 || occupied > pixels * .94) fail('副标承托结果像完整画面，未覆盖原图层');
  return sharp(buffer).extract({ left: minX, top: minY, width, height }).png().toBuffer();
}

async function backingTextColor(buffer) {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const x0 = Math.floor(info.width * .2), x1 = Math.ceil(info.width * .8);
  const y0 = Math.floor(info.height * .25), y1 = Math.ceil(info.height * .75);
  let luminance = 0, weight = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const offset = (y * info.width + x) * 4, alpha = data[offset + 3] / 255;
    if (alpha < .25) continue;
    luminance += (.2126 * data[offset] + .7152 * data[offset + 1] + .0722 * data[offset + 2]) * alpha;
    weight += alpha;
  }
  return weight && luminance / weight >= 150 ? '#453627' : '#fff5dc';
}

/**
 * All outputs stay in memory until every requested layer succeeds. The caller
 * owns persistence, scene versions, geometry edits and provider credentials.
 */
export async function runBannerDesign({ mode = 'design', prompt, template, model, inputs = {}, affectedKinds = [], generate, onProgress } = {}) {
  if (!['design', 'edit'].includes(mode)) fail('不支持的整图创作模式');
  if (!Number.isInteger(template?.width) || !Number.isInteger(template?.height) || template.width < 1 || template.height < 1 || template.width * template.height * 4 > MAX_PIXELS) fail('母版尺寸无效');
  if (!Object.values(communityImageModels).includes(model)) fail('不支持的画布图片模型');
  if (typeof generate !== 'function') fail('缺少生图执行器');
  const direction = text(prompt);
  if (!direction) fail('请先填写创作或修改要求');
  if (!Array.isArray(affectedKinds) || affectedKinds.some(kind => !LAYER_KINDS.has(kind))) fail('修改图层类型无效');
  const kinds = mode === 'design'
    ? ['background', ...(text(inputs.copy) ? ['title'] : []), ...(text(inputs.subtitle) && inputs.includeBacking !== false ? ['subtitle-backing'] : [])]
    : [...new Set(affectedKinds)];
  if ((mode === 'design' || kinds.includes('title')) && !text(inputs.copy)) fail('请先确认主标文字，再生成版权字形设计');
  if (kinds.includes('subtitle-backing') && !text(inputs.subtitle)) fail('没有副标文字，不需要生成副标承托');
  const glyph = kinds.includes('title') ? await prepareTitleMask(inputs) : null;
  const source = mode === 'design' ? inputs.guide : inputs.current;
  if (!kinds.length) return { layers: [], designPreview: null, stages: [] };
  await imageInfo(source, mode === 'design' ? '母版构图引导' : '当前母版');
  // Validate numbered references and provider attachment limits before any job.
  const directionInputs = sceneImages(source, inputs, { glyph, includeCharacters: true, firstLabel: '精确构图引导' });
  const sceneCharacters=mode==='design'?referenceCharacterScene(direction,inputs):inputs.sceneCharacters?.mode==='reference-character-scene'?inputs.sceneCharacters:null;
  const stages = new Set();
  const operations = [];
  let progressQueue = Promise.resolve();
  let designPreview = null;
  const run = async (stage, body) => {
    // The host commonly persists progress with read-modify-write JSON. Serialize
    // these callbacks even while the independent paid jobs run in parallel.
    progressQueue = progressQueue.then(() => onProgress?.(stage));
    await progressQueue;
    const result = await generate(body, { stage });
    await imageInfo(result, `${stage}生成结果`);
    stages.add(stage);
    return result;
  };
  const geometry = layoutGuide(inputs.layouts);
  const scene = `画布 ${template.width}×${template.height}。${geometry ? `已确定图层位置（左、上、宽、高）：${geometry}。` : ''}`;
  const brief = `【设计师要求】${direction}\n【母版尺寸与位置】${scene}`;
  const backingDirection = inputs.includeBacking === false
    ? '明确不使用副标底板或承托，副标直接排在画面上，禁止生成底条、纸签、边框或其它底板。'
    : '为副标设计独立而简洁、符合当前场景的纸签、题签或条幅承托。';
  const typographyGuide = `${communityTypographyDesignGuide('title')}\n【上述规则在本任务的执行范围】主标使用已提供的公司版权字形蒙版，字形、换行和排版不可重画，只设计匹配的配色材质；整幅方向图仍包含规整黑体或宋体副标。明确无底板、无装饰的要求优先于通用建议。`;
  const common = '文案要简洁，有清楚的主副层级，不添加标题周围的花纹、挂件、星光、道具或多余装饰。角色与环境机位、透视、光源、色温一致，趴卧角色与书本要有合适的近景桌面和自然接触，不能悬贴在远处地板上。参考图片仅借鉴设计师指定的方面，不复制旧背景和旧文案。'+(sceneCharacters?`仅参考图${sceneCharacters.referenceIndex}用于角色身份和服装设定，其他参考图中的人物不采用。`:'不复制参考图中的旧人物。');
  if (mode === 'design') {
    const characterGuide=sceneCharacters?`第1张只是工作台占位布局：其中默认背景不作为画风或色彩依据，人物空白不表示需要无人场景。保留 Logo 和字组位置。设计师已指定参考图${sceneCharacters.referenceIndex}为角色设定，必须据此创作角色，保留发型、头饰、五官特征、服装纹样和配色，按设计师描述绘制新的动作、表情与道具。若设定图为正侧背三视图，它们是同一位角色，最终只画一次，不把整张设定表或三个视角贴入 banner。角色放在标题之外的右侧主要区域，须清楚可见并与场景自然结合；不要照抄风格参考图中的其他角色。`:'第1张是精确构图引导，保持其中人物、Logo 和字组的位置、比例及原始身份；不另造人物，不改角色姿势、五官、服装和 Logo。';
    const body = await request(model, `${brief}\n【图片用途】${directionInputs.guide}\n生成完整游戏活动 banner 的内部美术方向图。${characterGuide}${glyph ? '主标严格保持版权字形蒙版的字形和换行，只设计配色材质。' : ''}\n主标仅为「${text(inputs.copy, 160)}」，副标仅为「${text(inputs.subtitle, 160)}」。副标使用规整黑体或宋体。${backingDirection}人物、背景、标题、承托要作为一个整体设计，背景围绕人物构思，避免各层像贴在不同空间。${common}\n【沿用工作台文案设计规则】${typographyGuide}\n本图只供后续抽取场景插画、字面材质和空白承托，不是用户批准的最终合成稿。`, template, directionInputs.buffers);
    const generated = await run('direction', body);
    designPreview = await sharp(generated).resize(template.width * 2, template.height * 2, { fit: 'cover' }).png().toBuffer();
  }
  const context = designPreview || source;
  if (kinds.includes('background')) operations.push(async () => {
    const action = sceneCharacters
      ? `${mode==='design'?'从第1张完整设计方向中提取场景插画':'仅按设计师要求调整第1张场景插画的背景'}，保留同一位按角色设定创作的人物、动作、表情及其手持道具，与场景保持原位置、原大小、同一光色和空间。只擦除所有文字、Logo、副标承托和界面贴片，补全它们遮挡的环境。角色没有单独的原始透明素材，必须保留在这张场景插画中，不能擦除。`
      : mode === 'design'
      ? '从第1张完整设计方向中提取并修复纯环境背景。保留同一场景、机位、空间、材质、光照和画法，完整擦除人物及自带道具、所有文字、Logo、副标承托和前景贴片，补全它们遮挡的环境。'
      : '仅按设计师要求修改第1张当前母版中的背景场景，保留未要求改变的场景、空间、机位、构图、光线与配色。输出仍是纯环境背景层；擦除所有人物、文字、Logo、副标承托和前景贴片并补全环境，不重画它们。';
    const images = mode === 'edit' ? sceneImages(context, inputs) : { buffers: [context], guide: '输入第1张：完整设计方向' };
    const layerRule=sceneCharacters?'本层是带所创作角色的场景插画，角色必须保留。主副标、Logo 和承托由独立图层叠加，本层不得残留任何文字、Logo、水印或界面。':'人物、原始书本道具、主副标、Logo 和承托将由原始独立素材重新叠加，绝对不要留在背景里。不要人脸、肢体、角色轮廓、乱码、伪文字、水印或界面。';
    const body = await request(model, `${brief}\n【图片用途】${images.guide}\n${action}${common}\n${layerRule}`, template, images.buffers);
    const generated = await run('background', body);
    return { kind: 'background', buffer: await sharp(generated).resize(template.width * 2, template.height * 2, { fit: 'cover' }).png().toBuffer() };
  });
  if (kinds.includes('title')) operations.push(async () => {
    const images = sceneImages(context, inputs, { glyph });
    const playful=inputs.titleDesignTheme==='playful';
    const reference=playful?await resolveBannerTitleReference(direction,inputs):null;
    const explicitReference=/(?:参考|参照).{0,12}图\s*[0-9一二三四五六七八九十]+.{0,16}(?:颜色|色调|配色|字效|风格)/.test(direction);
    const styleDirection=playful?(reference?`明确使用参考图${reference.referenceIndex}的配色与贴纸字效；上行${reference.palette.lines[0].middle}，下行${reference.palette.lines[1].middle}，奶油色宽描边、细暖色外沿，减轻斜面和挤出。不得沿用当前母版原来的橙绿配色。`:explicitReference?'主标字面颜色和字效严格服从设计师指定的参考图，保留可爱Q版气质和清楚层次，不得用项目默认配色覆盖指定参考。':'本项目是可爱Q版，主标须饱满明亮，有糖果般的面光和清楚的色阶。默认上行橙金、下行黄绿；设计师明确指定其它颜色或色调参考时优先遵循。主标必须明显区别于背景，不能用米黄、浅棕单色使字面消失。贴字高光、内斜面和短厚度由真实字形程序保护，禁止靠周围挂件代替字效。'):'文字与背景之间必须有清楚的颜色或明度区分，不能机械照抄背景的米黄底色。';
    const body = await request(communityImageModels.image, `${brief}\n【图片用途】${images.guide}\n【沿用工作台文案设计规则】${typographyGuide}\n【字面方向】${styleDirection}\n【当前唯一输出】只生成一张填满画布的主标题字面材质与颜色色板，不生成任何文字、汉字、笔画、字形、Logo、图案、物件、装饰或透明孔洞。第1张是当前整体画面，用于协调主标的颜色、亮度、质感。版权字体实际字形蒙版仅用于理解字面厚度与气质，最终字形由程序逐像素保护，禁止重画。提取适合当前画面并符合修改要求的简洁渐变和克制材质，覆盖整张色板，保证缩小后清楚易读，避免高饱和深描边和厚重挤出。`, template, images.buffers, { ratio: '2:1' });
    const generated = await run('title-material', body);
    const title = playful?await finishLicensedTitle({mask:glyph.mask,material:generated,theme:'playful',palette:{useMaterialPalette:true,...reference?.palette}}):await materialTitle(generated, glyph);
    return { kind: 'title', buffer: title.buffer, fontProvenance: { ...glyph.provenance, outlineRadius: title.outlineRadius,...(playful?{effectStyle:title.effectStyle,quality:title.quality}:{}),...(reference?{colourReference:{index:reference.referenceIndex,method:reference.method,confidence:reference.confidence}}:{}) } };
  });
  if (kinds.includes('subtitle-backing')) operations.push(async () => {
    const images = sceneImages(context, inputs);
    const existingColor = text(inputs.layouts?.subtitle?.textColor, 50);
    const contrast = mode === 'edit'
      ? `副标的原始字形、字体、颜色${existingColor ? `（${existingColor}）` : ''}和排版保持不变，只调整承托并保证与现有文字足够明暗对比。`
      : '承托中央保持均匀且适合放置常规副标文字，避免强纹理干扰阅读。';
    const body = await request(communityImageModels.image, `${brief}\n【图片用途】${images.guide}\n只输出一个可独立叠加的空白副标承托 PNG 图层，真实透明背景。第1张是当前完整画面，仅用于匹配画风、场景材质和配色${mode === 'design' ? '，提取其中副标的承托并清除文字' : '，按本次要求重新设计对应承托'}。副标「${text(inputs.subtitle, 160)}」只用于估计长度，绝对不能将任何文字画入图层，文字将由程序使用公司字体精确叠加。${contrast}根据场景设计纸质题签、细线牌签或简洁条幅等适合的形状，端部和细线有少量设计感；主体中央干净、留足内边距。不要默认圆角矩形，不要厚重装饰、角色、书本、道具、背景场景、Logo、边框海报、其它物件或额外小字。只保留横向细长的独立空白承托，四周和四角真实透明，禁止棋盘格或纯色假透明。`, template, images.buffers, { ratio: '21:9', transparent: true });
    const generated = await run('subtitle-backing', body);
    const buffer = await cleanBacking(generated);
    return { kind: 'subtitle-backing', buffer, suggestedTextColor: await backingTextColor(buffer) };
  });
  const layers = await runIndependentLayers(operations);
  return { layers, designPreview, stages: STAGE_ORDER.filter(stage => stages.has(stage)),...(sceneCharacters?{sceneCharacters}:{}) };
}
