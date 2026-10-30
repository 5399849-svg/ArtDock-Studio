// Shared design principles from the designer's typography references.
// These guide the image requests; they do not override hand-adjusted layouts.
const rules = Object.freeze([
  '【主题与字形】先判断活动题材、受众气质和指定文字参考的造型语言。童趣活动可用厚实、圆润或活泼倾斜的笔画；古风、节庆或成长主题可用书法笔势、飞白与锋芒。字形本身承担设计，不只给普通字体加描边。字形、字重、笔画转折和倾斜须成套协调，不把所有题材固定成同一种粗圆字。',
  '【字组组织】把主标看成完整字组，统筹行长、字距、大小、倾斜、阅读节奏和整体重心；可适当改变非关键连接字的大小，让核心词突出，不要求每个字等大。文字须准确、可辨认，不能为了造型挤坏笔画或省字。行数根据文案长度、设计师排版和可用区域选择，不固定两行；设计师要求保留字形、排版或换行时严格保留。',
  '【主副层级】主标承担主题与视觉焦点，副标承担时间、玩法或利益补充。主副重复部分配色和字形气质，保持同一视觉家族；副标采用更规整、更轻的笔画与效果，明显低于主标的视觉重量，保留分组和阅读间距。副标与主标分层生成，不能互相复制文案或一起画入同一图层。',
  '【功能承托】副标可根据指定参考、明确需求和可读性选择简洁细条、圆角胶囊或窄边框，将辅助信息收拢成稳定的阅读区域。功能性底条可以有填色，但仅承托这一组副标，不扩展成海报底板；颜色、圆角和边线与主标呼应。需要时才使用，不要求每条副标都有底条，也不把辅助条固定在主标下面。',
  '【轮廓效果与配色】效果贴合实际字形、题材和指定参考。厚实童趣字可用清楚的描边与适度厚度；书法可用笔势和留白，保留没有厚描边的效果；节庆金字可用克制的高光与光晕。不得统一套多重粗描边、深挤出、强渐变或高饱和度。围绕主题组织少量协调主色，主副共享部分颜色，背景明暗变化时优先保证文字边界清楚。',
  '【语义装饰】装饰须服务题材和具体信息，并结合指定参考的用途判断。借鉴整套文案设计或明确要求装饰时，可选择少量相关图形，贴合字组边缘、笔画转折或辅助条两端；字内水波等属于字形组织，避免另外堆叠挂件。不凭空添加叶子、星星、放大镜、书本、飘带等物件，不让装饰挤占核心文字、替代标点或遮住笔画。',
]);

export function communityTypographyDesignGuide(kind) {
  const focus = kind === 'subtitle'
    ? '【本层重点】这是副标：采用规整的辅助信息字形，明显减轻笔画和描边，配色与当前主标协调；若提供当前主标图层，仅参考其风格家族与配色，不照搬主标的大字、粗描边和视觉重量。'
    : '【本层重点】这是主标：先设计完整字组的轮廓、关键字和重心，再选择贴字效果；本层不加入副标、时间条或其它文案。';
  return [...rules, focus].join('\n');
}

export function communityTypographyLayoutGuide(template, kind, layout) {
  const preset = template.communityLayout?.[kind];
  const width = layout?.width ?? (Array.isArray(preset) ? preset[2] * template.width : undefined);
  const height = layout?.height ?? (Array.isArray(preset) ? preset[3] * template.height : undefined);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return '';
  return `【可用区域】当前${kind === 'title' ? '主标' : '副标'}可用框约 ${Math.round(width)}×${Math.round(height)} px（整幅画面 ${template.width}×${template.height}）。这只指导字组比例、行长和效果强弱，不是要求把框或整幅海报画出来；保持紧贴内容裁切，已有手工位置与缩放由工作台保留。`;
}
