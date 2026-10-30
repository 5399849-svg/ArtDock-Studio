import {validateModules,BLOCK_TYPES} from './modules.js';
import {skinFor} from './skins.js';
import {validateLayers} from './layers.js';
export const THEMES = [
  {id:'a',name:'经典蓝金',label:'严格参考',description:'原稿边框 · 金色字效 · 对话气泡',accent:'#d5a53f',primary:'#2877c7',paper:'#fffdf2',ink:'#335b87'},
  {id:'b',name:'月辉档案',label:'结构参考',description:'深蓝银白 · 人物专访 · 留白阅读',accent:'#b8d5f1',primary:'#192a46',paper:'#f3f7fc',ink:'#233852'},
  {id:'c',name:'荣耀手记',label:'结构参考',description:'暖金墨绿 · 章节卡片 · 杂志布局',accent:'#ba8940',primary:'#263e38',paper:'#f7f1e5',ink:'#35453d'},
];
export const clone = value => JSON.parse(JSON.stringify(value));
export function newVariants(){return THEMES.map(t=>({id:t.id,theme:t.id,accent:t.accent,primary:t.primary,fontId:'noto',fontSize:25,lineHeight:1.75,gap:t.id==='b'?30:24,titleSize:t.id==='b'?52:58,headerHeight:t.id==='b'?600:650,headerX:t.id==='c'?70:50,headerY:42,headerScale:100,titleX:0,titleY:0,titleReferenceAssetId:'',titleArtAssetId:'',titleArtWidth:100,titleArtX:0,titleArtY:0,titleEffect:t.id==='a'?'gold':t.id==='b'?'light':'outline',backgroundAssetId:'',headerAssetId:'',overlayAssetId:'',overlayX:50,overlayY:50,overlayWidth:40,locked:false,autoFlow:true,chapterGap:40,titleGap:24,layers:{},customLayers:[],hiddenBlocks:[],overrides:{}}));}
export function textList(doc){return [doc.title,doc.subtitle,doc.intro,...doc.blocks.flatMap(b=>[b.text,b.answer,b.caption,...(b.items||[]).flatMap(i=>[i.title,i.detail,i.quantity])]),doc.outro].filter(Boolean);}
export function documentStats(doc){return {characters:textList(doc).join('').length,sections:doc.blocks.filter(b=>b.kind==='section').length,dialogues:doc.blocks.filter(b=>b.kind==='dialogue').length,people:doc.people.length};}
export function validateProject(project){
  if(!project||typeof project!=='object'||!project.document||!Array.isArray(project.document.blocks))throw new Error('工程内容不完整');
  const d=project.document;if(d.blocks.length>500)throw new Error('最多支持 500 个内容模块');
  if(!Array.isArray(d.people)||d.people.length>50)throw new Error('人物数据无效');
  const ids=new Set();for(const b of d.blocks){if(!b.id||ids.has(b.id))throw new Error('模块编号重复');ids.add(b.id);if(!Object.hasOwn(BLOCK_TYPES,b.kind)||typeof b.text!=='string'||b.text.length>20000)throw new Error('模块内容无效');}
  if(textList(d).join('').length>150000)throw new Error('文案超过 15 万字');
  if(!Array.isArray(project.variants)||project.variants.length!==3||new Set(project.variants.map(v=>v.id)).size!==3)throw new Error('需要 A、B、C 三套方案');
  for(const v of project.variants){if(!THEMES.some(t=>t.id===v.id)||!/^#[0-9a-f]{6}$/i.test(v.accent)||!/^#[0-9a-f]{6}$/i.test(v.primary))throw new Error('方案配色无效');for(const [key,min,max] of [['fontSize',16,42],['lineHeight',1.2,2.4],['gap',8,80],['titleSize',28,88],['headerHeight',400,1000],['headerScale',60,200],['headerX',0,100],['headerY',0,100],['titleX',-250,250],['titleY',-250,250],['overlayX',0,100],['overlayY',0,100],['overlayWidth',10,100]]){if(!Number.isFinite(v[key])||v[key]<min||v[key]>max)throw new Error('排版参数超出范围：'+key);}}
  for(const v of project.variants){for(const [key,min,max] of [['titleArtWidth',30,130],['titleArtX',-250,250],['titleArtY',-250,250]])if(v[key]!==undefined&&(!Number.isFinite(v[key])||v[key]<min||v[key]>max))throw new Error('艺术字参数超出范围：'+key);}
  for(const v of project.variants){validateLayers(v);if(v.designProfile!==undefined&&!['','interview-editorial'].includes(v.designProfile))throw new Error('采访版式无效');if(v.skinId!==undefined&&!skinFor(v.skinId))throw new Error('皮肤无效');if(v.headingFontId!==undefined&&(typeof v.headingFontId!=='string'||v.headingFontId.length>100))throw new Error('标题字体无效');if(v.autoFlow!==undefined&&typeof v.autoFlow!=='boolean')throw new Error('自动留白开关无效');for(const [key,min,max] of [['chapterGap',16,160],['titleGap',0,120]])if(v[key]!==undefined&&(!Number.isFinite(v[key])||v[key]<min||v[key]>max))throw new Error('段落间距参数超出范围：'+key);}
  validateModules(project);return project;
}
export function contentCheck(project){const original=project.document.sourceCells||[];const current=textList(project.document);const texts=new Set(current.flatMap(text=>[text,...text.split(/\r?\n/)]));return original.filter(s=>!texts.has(s.text)).map(s=>({cell:s.cell,text:s.text}));}

export function titleArtwork(project,variant){const id=variant.titleArtAssetId;if(!id)return {asset:null,stale:false};const asset=project.assets.find(a=>a.id===id);const stale=!asset||asset.role!=='typography'||asset.targetText!==project.document.title;return {asset:stale?null:asset,stale};}
