// Font names are an index into visually reviewed real glyphs, not a weight
// guess: several chunky cartoon fonts correctly declare OS/2 weight 400.
const PLAYFUL_FONTS=['字魂甜豆体','字魂吃糖体','字魂熊猫体','字魂松饼体','字魂布丁体','字魂趣圆黑','字小魂萌萌哒体'];
const cleanName=font=>String(font?.name || '').replace(/\(.*?\)|（.*?）|\.(ttf|otf|woff2?)$/g,'').trim();
const pickName=(fonts,names)=>names.map(name=>fonts.find(font=>cleanName(font)===name)).find(Boolean);

export function bannerTypographyTheme(task={},project={},direction=''){
  const explicit=String(direction);
  if(/古风|国风|仙侠|书法|水墨|毛笔/.test(explicit))return 'calligraphic';
  if(/Q版|Q一点|Q感|可爱|软萌|卡通|童趣|圆润|萌趣|甜美/i.test(explicit))return 'playful';
  const context=[task.project,task.copy,project.name,project.description].join(' ');
  return /时光大爆炸|微距猜谜|天工谜影|百晓生|萌宠|儿童|童趣/.test(context)?'playful':'display';
}

export function chooseBannerFont({fonts=[],task={},project={},kind='title',direction='',preserveSelected=false}={}){
  const p=task.parameters || {},selected=fonts.find(f=>f.id===p[`${kind}FontId`]);
  const theme=kind==='subtitle'?'native':bannerTypographyTheme(task,project,direction);
  const previousAuto=task.communityGeneration?.titleFont?.id===selected?.id && task.communityGeneration?.mode==='design';
  const manual=p[`${kind}FontSource`]==='manual' || (p[`${kind}FontSource`]===undefined && selected && !previousAuto);
  if(selected && (preserveSelected || manual || kind==='subtitle'))return {font:selected,source:manual?'manual':'automatic',theme};
  if(kind==='title'){
    const recommended=(project.recommendedFontIds || []).map(id=>fonts.find(f=>f.id===id)).find(Boolean);
    if(recommended)return {font:recommended,source:'project',theme};
  }
  let font;
  if(kind==='title' && theme==='playful')font=pickName(fonts,PLAYFUL_FONTS);
  if(kind==='title' && theme==='calligraphic')font=pickName(fonts,['字魂仙剑奇侠体','字魂剑气流云体','字魂江湖体']);
  if(!font && kind==='title')font=fonts.find(f=>/字魂大黑/.test(f.name)&&/Heavy|黑体/i.test(f.name+' '+f.style));
  if(!font)font=fonts.find(f=>/字魂大黑/.test(f.name)&&/Regular|常规/i.test(f.name+' '+f.style)) || fonts.find(f=>/字魂大黑/.test(f.name));
  return {font:font || selected,source:'automatic',theme};
}
