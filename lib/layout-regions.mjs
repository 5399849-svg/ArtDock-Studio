export const REGION_TYPES = ['core', 'copy', 'logo', 'ip', 'button', 'kv-input', 'fixed', 'page-occlusion', 'extend-left', 'extend-right', 'extend-top', 'extend-bottom', 'body-boundary', 'character-breakout'];
export const REGION_SHAPES = ['rect', 'ellipse', 'path'];

// Only editable fields are accepted. PSD metadata stays on the existing rule.
export function updateLayoutRegions(template, current, input) {
  const fail = message => { throw Object.assign(new Error(message), { status: 422 }); };
  if (!input || typeof input !== "object") fail("区域规则内容无效");
  if (!Number.isInteger(input.revision) || input.revision !== (current?.revision || 0)) {
    throw Object.assign(new Error('区域规则已更新，请关闭编辑器并重新打开后再保存'), { status: 409 });
  }
  const regions = (values, previous = []) => {
    if (!Array.isArray(values) || values.length > 100) fail('区域列表无效（最多100个区域）');
    return values.map(region => {
      if (!REGION_TYPES.includes(region?.type) || typeof region.name !== 'string' || !region.name.trim() || region.name.length > 100) fail('区域名称或类型无效');
      const b = region.bounds;
      if (!b || !['x','y','width','height'].every(key => Number.isInteger(b[key]))) fail('区域坐标必须为整数像素');
      if (b.x < 0 || b.y < 0 || b.width < 1 || b.height < 1 || b.x + b.width > template.width || b.y + b.height > template.height) fail('区域不能超出画布边界');
      const old = previous.find(item => item.type === region.type && item.name === region.name);
      const shape = REGION_SHAPES.includes(region.shape) ? region.shape : (old?.shape || 'rect');
      return { type:region.type, name:region.name.trim(), shape, bounds:{x:b.x,y:b.y,width:b.width,height:b.height}, visible:region.visible !== false, ...(old?.effect ? {effect:old.effect} : {}), ...(old?.pathSource ? {pathSource:old.pathSource} : {}) };
    });
  };
  if (!Array.isArray(input.variants) || !input.variants.length || input.variants.length > 20) fail('至少需要一个版式');
  const expected = current?.variants?.map(v => v.id) || ['layout-01'];
  if (input.variants.length !== expected.length || new Set(input.variants.map(v=>v.id)).size !== expected.length || input.variants.some(v=>!expected.includes(v.id))) fail('版式列表与当前规范不一致');
  return {
    ...current, templateId:template.id, canvas:{width:template.width,height:template.height},
    selectionMode:current?.selectionMode || 'single-layout',
    globalRegions:regions(input.globalRegions, current?.globalRegions || []),
    variants:input.variants.map(v => { const oldVariant = current?.variants?.find(old=>old.id===v.id); return ({ ...(oldVariant || {id:v.id,name:'默认版式',defaultVisible:true}), regions:regions(v.regions, oldVariant?.regions || []) }); }),
    revision:(current?.revision || 0) + 1, updatedAt:new Date().toISOString(),
    deliveryAllowed:false, issues:['画面区域已修改，等待人工重新核实'],
  };
}
