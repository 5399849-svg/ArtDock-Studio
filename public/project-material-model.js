export const projectMaterialCategories=[['all','全部素材','grid'],['logo','Logo','picture'],['font','字体','font'],['character','角色','person'],['button','按钮','button'],['background','背景与装饰','picture'],['text','文字素材','font'],['other','其他素材','box']];
export function projectMaterialCategory(asset={}){
 if(projectMaterialCategories.some(([key])=>key!=='all'&&key===asset.category))return asset.category;
 const role=asset.role||'',name=asset.originalName||asset.name||'';
 if(asset.fontId||/\.(ttf|otf|woff2?|ttc)$/i.test(name)||String(asset.mime).startsWith('font/'))return 'font';
 if(role==='logo'||/logo|带标语|不带标语/i.test(name))return 'logo';
 if(/character/.test(role)||/角色|人物|立绘/.test(name))return 'character';
 if(role==='button'||/按钮|立即前往|立即预约/.test(name))return 'button';
 if(['title','subtitle','ip-copyright'].includes(role))return 'text';
 if(/background|foreground|mother-candidate|illustration/.test(role)||/背景|场景|装饰/.test(name))return 'background';
 return 'other';
}
export const projectMaterialLabel=asset=>asset.displayName||asset.originalName||asset.name||'未命名素材';
export const projectMaterialRole=asset=>({logo:'logo',character:'community-object-character',button:'button',background:'background',text:asset.role==='subtitle'?'subtitle':'title',other:'supplement',font:'font'})[projectMaterialCategory(asset)];
