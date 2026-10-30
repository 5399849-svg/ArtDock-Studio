import { nearestBananaRatio } from './ai-huabu.mjs';
import { communityReferences, isCommunityReference } from '../public/community-references.js';
import { isRenderableImageAsset } from '../public/editor-image-source.js';
import { communityTypographyDesignGuide, communityTypographyLayoutGuide } from './community-typography-design.mjs';

export function communityReferenceAssets(task, phase, kind) {
  const assets = (task.assets || []).filter(asset => asset.role !== 'source-character' && isRenderableImageAsset(asset));
  const masterName = task.parameters?.assetByTemplate?.[task.masterTemplateId]?.background;
  const master = assets.find(asset => asset.name === masterName);
  if (phase === 'targets') return master ? [master] : [];
  const assigned = task.parameters?.assetByTemplate?.[task.masterTemplateId] || {};
  const characters = ['character','character2'].flatMap(kind => {
    if (task.parameters?.layoutByTemplate?.[task.masterTemplateId]?.[kind]?.visible === false) return [];
    const selected = assigned[kind] || task.parameters?.assetByRole?.[kind];
    if (selected) return assets.filter(asset => asset.name === selected);
    const available = assets.filter(asset => ['character','core-character','secondary-character'].includes(asset.role));
    return available.slice(kind === 'character' ? 0 : 1, kind === 'character' ? 1 : 2);
  });
  const references = communityReferences(task);
  // User references always lead in UI order; internal assets must not shift 图1/图2/图3.
  const ordered = [...references,...characters,...(phase === 'typography' ? [master] : [])];
  if (phase === 'typography' && kind === 'subtitle' && assigned.title !== null && task.parameters?.layoutByTemplate?.[task.masterTemplateId]?.title?.visible !== false) {
    const titleName = assigned.title || task.parameters?.assetByRole?.title;
    const title = assets.find(asset => asset.name === titleName);
    // Already-numbered references keep their original role and UI number.
    if (title && !ordered.some(asset => asset?.name === title.name)) ordered.push({...title,role:'title'});
  }
  return [...new Map(ordered.filter(Boolean).map(asset => [asset.name,asset])).values()];
}

export function communityImageGuide(images, roles = []) {
  let referenceIndex = 0;
  return images.map((_, index) => {
    const role = roles[index] || 'reference-image';
    const usage = isCommunityReference({role})
      ? `参考图${++referenceIndex}（界面图${referenceIndex}），仅按设计师说明指定的用途借鉴`
      : ['character','core-character','secondary-character'].includes(role)
        ? '工作台角色素材（不属于参考图编号），分析气质、姿态与色调，不可把角色画进背景'
        : role === 'title'
          ? '当前主标图层（内部参考，不属于参考图编号），仅参考配色、字形气质和效果，使副标协调且更轻，不复制主标文字'
          : '当前母版背景（不属于参考图编号），用于保持整体协调';
    return `输入第 ${index+1} 张：${usage}`;
  }).join('；');
}

export const communityImageModels = Object.freeze({
  banana: 'banana_pro',
  image: 'gpt-image-2',
});

export function communityImageRequest({ model, prompt, template, images = [], imageRoles = [], phase = 'master', variant = 1, toneGuide = '' }) {
  if (!Object.values(communityImageModels).includes(model)) throw new Error('不支持的画布图片模型');
  if (!template?.width || !template?.height) throw new Error('缺少目标资源位尺寸');
  const direction = String(prompt || '').trim().slice(0, 1200);
  if (!direction && phase !== 'targets') throw new Error('请先填写画面创作要求');
  const portrait = template.height > template.width * 1.15;
  const shape = portrait ? '竖版' : template.width > template.height * 1.7 ? '横向长图' : '常规横版或方图';
  const referencePriority = '优先级依次为：设计师的明确要求、角色姿态与道具的物理空间兼容、被指定用途的参考图。角色素材是气质、身份、造型语言与主配色的依据：先观察角色的服装材质、姿态、冷暖色和气质，再构思适合该角色的原创环境、空间与光源，让人物与环境建立自然的叙事和光色联系。参考图用途由设计师在文字中逐图指定，例如图1的排版或风格、图2的色调、图3的字体设计；不得根据旧上传分类擅自决定用途。同一张图可以参考多个方面，只提取被指定的方面。未指定用途时仅借鉴画法与完成度，围绕角色重新配色；设计师指定色调时优先遵循指定图片的配色并与角色协调。只有指定构图、排版或场景时才借鉴相应空间安排，并为角色的姿态与道具调整尺度和视角；仅参考风格或色调时，不要照抄其中的背景、建筑、地形、道具、物体排列或场景透视，不要简单换色复刻。没有角色素材时依照文字设计场景，不臆造具体角色。';
  const spatialCompatibility = '先判断角色是站立、坐姿、趴卧还是悬浮，并观察已有道具的接触边缘、视角和尺度。背景必须与角色素材保持同一机位、视平线、俯仰角、近远尺度、光源方向和色温，为其身体与道具留出正确的承托面和接触区域。角色趴在书本上或面对近景物件时，优先安排近景桌面、台面或相应承托面，并用更小、更弱的中远景形成空间；不要把近景书本和趴卧角色悬贴在远处地板、广场或通道上。观察书本或其它已有道具的透视，延续其平面方向与接触关系，不额外重画、复制该道具。承托面在预定角色与道具下方自然延续，可有轻柔的环境遮蔽和接触阴影，不绘制人物轮廓或浓黑贴片。标题区域保持简洁、低干扰，空间真实感通过承托面、景深和光照建立，不靠堆满场景物件。';
  const imageGuide = communityImageGuide(images, imageRoles);
  const composition = phase === 'targets'
    ? `输入画面中央是已确认母版的背景，浅灰色区域是待延展空间。仅沿中央画面的边缘向外补出适合 ${template.width}×${template.height} 的${shape}背景。保留中央已有场景、物体、构图、颜色与透视，不重画、不移动、不裁掉母版内容；新区域必须与原画面自然连续。不要用另一幅相似场景代替母版，不要翻转、镜像、拉伸或重复边缘填补。`
    : `创作适合 ${template.width}×${template.height} 的${shape}游戏活动母版背景。${referencePriority}${spatialCompatibility}不可擅自改成写实照片、仿古油画、旧纸质感或灰褐滤镜；亮色要清透鲜明，暗部也要有干净的颜色，不得加黑色透明层、暗角或统一压暗。${toneGuide}参考图上的角色和文字不是背景内容，不得复制到结果。环境须为稍后独立叠加的角色与标题预留合适位置。方案序号 ${variant}：${['以角色气质为起点，设计全新的场景主题与空间关系','探索不同于第一方案的环境意象与远近层次','探索不同于前两个方案的光源组织、环境材质与空间布局'][(variant-1)%3]}；各方案都须满足同一角色的承托、透视与机位，不能为了差异化改变这些条件；不要只换颜色或复制同一参考场景。`;
  const cleanLayer = '这是可编辑活动画面的纯环境背景图层。人物、标题、副标题、游戏 Logo 与前景会由工作台从各自的透明素材图层独立叠加。即使参考图或设计师方向提到人物在左、在右、对称站位，也只表示留白和环境光的规划，绝不可把人物画进背景。输出必须完全没有人、脸、身体、衣服、角色剪影、伪字、Logo、版权、按钮、水印或明显拼接缝。以与角色一致的暖冷色、光照方向和' + (phase === 'targets' ? '地面接触区域' : '承托面接触区域') + '让后续合成自然，不要额外压暗画面。';
  const body = {
    model, task_type: 'image', bot_id: 'canvas',
    prompt: `${direction ? `【设计师方向】${direction}\n` : ''}${phase !== 'targets' && imageGuide ? `【图片用途】${imageGuide}\n` : ''}【构图】${composition}\n【分层要求】${cleanLayer}`,
    ratio: nearestBananaRatio(template.width, template.height),
    image_size: '2K',
  };
  if (images.length) body.images = images.map(buffer => ({ data_base64: buffer.toString('base64') }));
  if (model === communityImageModels.image) body.quality = 'high';
  return body;
}

export function communityTypographyRequest({ kind, text, template, images = [], imageRoles = [], direction = '', copyReference = '', companionText = '', layout }) {
  if (!['title','subtitle'].includes(kind)) throw new Error('不支持的文案图层');
  const exact = String(text || '').trim().slice(0,120);
  if (!exact) throw new Error('请先确认最终文案');
  const title = kind === 'title';
  const role = title ? '主标题' : '副标题';
  const body = {
    model: communityImageModels.image,
    task_type: 'image',
    bot_id: 'canvas',
    prompt: `生成一张可直接叠加在游戏活动海报上的透明背景${role} PNG 图层。按创作说明中图1、图2、图3等编号指定的用途参考图片，不以旧上传分类决定用途。指定字体设计的图片用于字形和字组组织，指定色调的图片用于配色，指定风格的图片用于画法；没有指定字形来源时根据题材、角色和当前背景原创字形。使文字与当前人物和背景画风统一；不要照抄参考图上的旧文字。唯一允许出现的文案是「${exact}」，必须逐字准确、顺序不变，不增删字、不翻译，不生成 TapTap 等参考图原有字样。
【要求优先级】准确文案、设计师明确要求及指定参考用途优先于通用设计原则。要求保留字形、排版或换行时，不擅自更换。默认克制地设计字组，不凭空堆装饰；参考整套文案设计时，结合题材和可读性借鉴字组、功能底条及少量语义装饰，不能只机械复制颜色或物件。仅参考字体、风格或色调不等于要求复制周边装饰，不要把人物道具或场景主题变成标题周围的挂件。明确要求装饰时按所要求的种类与数量少量添加；明确要求“无装饰”“纯文字”“去掉装饰”时，严格只保留字形和文字自身效果，优先于参考图里的装饰，不添加底条、边框或挂件。要求“简洁”时降低细节、效果和装饰负担，根据指定参考与需求决定是否保留必要的功能底条；明确“不要底条/底板”时不生成承托图形。
${communityTypographyDesignGuide(kind)}
【独立图层】只绘制这一组${role}及获准的贴字效果、功能承托或语义装饰，不要人物、风景、Logo、额外小字或整幅海报。功能底条仅限承托副标；不生成填满整张画布的实色底板。文字轮廓清晰，紧贴内容裁切，字组及获准承托区域之外保持真实透明，适合在 ${template.width}×${template.height} 画面中作为独立图层移动和缩放。`,
    images: images.map(buffer => ({ data_base64: buffer.toString('base64') })),
    ratio: title ? '2:1' : '21:9',
    image_size: '2K',
    quality: 'high',
    background: 'transparent',
    output_format: 'png',
  };
  const companion = String(companionText || '').trim().slice(0,120);
  if (companion) body.prompt += `\n【同组${title ? '副标' : '主标'}信息】「${companion}」仅用于理解题材、配色与层级，禁止将这段文字绘入当前${role}图层。`;
  const layoutGuide = communityTypographyLayoutGuide(template,kind,layout);
  if (layoutGuide) body.prompt += `\n${layoutGuide}`;
  body.prompt += `\n【图片用途】${communityImageGuide(images, imageRoles)}\n【创作说明】${String(direction).slice(0,1200)}\n【文案风格补充】${String(copyReference).slice(0,1200)}\n上述说明仅指导设计；最终文字仍严格以「${exact}」为准。`;
  return body;
}
