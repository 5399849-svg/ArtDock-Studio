export const AD_AI_PRESERVATION_MESSAGE='这是保留要求，当前画面不会重新生成。请同时写明要调整的内容；若要恢复修改前的画面，可点击“撤回本次修改”。';

// A preservation constraint on its own is not an instruction to redraw. Keep
// mixed requests (e.g. move a person AND keep the palette) as ordinary edits.
export function adAiPreservationOnly(prompt=''){
  const clauses=String(prompt).split(/[，,；;。！!\n]+/).map(s=>s.trim()).filter(Boolean);
  const artwork='(?:原(?:来|始|有)?(?:的)?(?:图片|画面|图|稿)?|当前(?:的)?(?:图片|画面|图|稿)?|整(?:张|体)(?:的)?(?:图片|画面)?|图片|画面)?';
  const property='(?:色调|配色|色彩|颜色|风格|构图|画风)';
  const patterns=[
    new RegExp(`^(?:请)?(?:不要|不能|别)(?:再)?(?:改变|改动|调整|更改|修改|重画|重绘)${artwork}(?:的)?${property}$`),
    new RegExp(`^(?:请)?(?:保持|保留|维持)${artwork}(?:的)?${property}(?:不变|一致|原样)?$`),
    new RegExp(`^${artwork}(?:的)?${property}(?:保持)?(?:不变|不动|不要变)$`)
  ];
  return clauses.length>0&&clauses.every(clause=>patterns.some(pattern=>pattern.test(clause.replace(/\s+/g,''))));
}
