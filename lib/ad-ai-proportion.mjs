// A request to undo distortion must rebuild from the artwork, rather than lock
// the geometry of the already distorted size adaptation as a local edit.
export const AD_AI_PROPORTION_METHOD='original-proportion-v1';
export function adAiProportionRepair(instruction=''){
  return String(instruction).split(/[，,；;。\n]+/).some(clause=>{
    if(/(?:恢复|还原|修正|纠正).{0,16}比例|比例.{0,3}(?:失真|不对|不正常|有问题)/.test(clause))return true;
    if(!/拉伸|压扁|压瘪|拉长|挤窄|挤扁|变窄|变形/.test(clause))return false;
    // "Move the person; do not stretch" is a local edit plus a preservation
    // constraint, unlike "the person was stretched; fix it".
    return !/不要|避免|禁止|不能|别/.test(clause)||/被|已经|了|修复|恢复|纠正|修正/.test(clause);
  });
}

export function buildAdAiProportionPrompt({instruction,spec,frame,embeddedLogo=false,logoBounds,referenceCount=0}){
  return [
    `【任务：恢复原图比例后重新适配画幅】图1是本任务未经尺寸重构的设计师原画，也是唯一的内容、形状和色彩基准。输出 ${spec.width}×${spec.height} 的完整设计稿。`,
    frame?`输出临时画幅 ${frame.width}×${frame.height}（${frame.ratio}），设计稿内框 x=${frame.left}, y=${frame.top}, 宽=${spec.width}, 高=${spec.height}；仅在内框排版，外侧浅灰留边由工作台精确去除。图1仍保持自己的原始比例，不要先把图1拉成临时画幅。`:'',
    '用户所说的竖版、当前稿、图1被拉伸，是对旧尺寸稿的反馈，不是要求沿用旧稿的变形。现在输入图1已经换成原始素材，必须从这张原画重新建立构图。不要照着旧竖稿描摹，不要把整张横版非等比缩放为竖版。',
    '【本次修改要求】',instruction,
    '先观察原图人物头身比例、脸部宽高、肢体、道具、建筑与房间的宽高关系。每个内容单元只允许横纵相同比例的缩放和移动，禁止单独拉高、压窄、压扁，禁止通过加高楼层、门窗、屋顶或拉长人物来填满竖版。相连的房屋、楼层、管道与人物保持原来的透视和连接关系，作为同一场景等比处理。',
    '画幅不同造成的空间用自然延续天空、远景、地面等背景解决，也可重新分配独立内容单元的位置；不要为了铺满画布而改变主体形状，不用夸张的屋顶或基座代替正常场景。主要人物与动作清楚完整，不裁掉关键内容。',
    '逐一保留图1实际已有的人物表现、动作、服装、道具与文案，每个原有单元按原有次数保留；同一角色的不同表现不能合并。保留字形、字序、字效、场景光线、色相、明暗和原有绘画风格，不增删人物、不改画风、不自行调色。',
    referenceCount?`输入图2起是用户添加的参考图（共${referenceCount}张），仅为灰度布局示意。用户说明中的“图1、图2”可能指上传前的新旧稿编号，不是本次模型输入编号。不要把这些示意当作待修改底图或人物比例基准，不复制其中的人物、文字或 Logo；所有精细内容与正常比例以原始图1为准。`:'',
    embeddedLogo?'图1含有无法分离的品牌 Logo，只保留原来的一个，不能复制。':'图1是已分离品牌 Logo 的纯图。输出必须无品牌 Logo，原图周边也不要猜画游戏名或标志；独立 Logo 由工作台在本地叠加一次。',
    logoBounds?`独立 Logo 本地叠加区域为 ${JSON.stringify(logoBounds)}（0至1坐标），此处保留自然背景，不放脸部、文字或关键动作，不画占位框。`:'',
    spec.safeInsetX?`两侧各 ${spec.safeInsetX}px 为保护区，关键信息必须在中间区域。`:'',
    '交付前核对原图与输出：人物和建筑仍为正常宽高关系，整体布局确实纠正了被拉长的旧版；没有第二个 Logo、重复人物、拼接线、边框、说明或水印。只输出一张完整设计稿。'
  ].filter(Boolean).join('\n');
}
