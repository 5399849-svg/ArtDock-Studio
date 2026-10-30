// The provider also inspects the actual image. Names supply intent, never a
// licence to add an effect or prop that is absent from the uploaded artwork.
const profiles = [
  {id:'quiet-reading',match:/读信|书信|阅读|看书|思念|letter|reading/i,label:'静谧读信',description:'完整场景统一微动，以帘纱、花枝与窗边气息表现安静阅读；有原生文案分层时独立合成。',direction:'优先让已有帘纱轻摆、花枝随微风轻动；已有花瓣可缓缓飘动，动作与周围环境自然相连。人物阅读姿态与手中书信形状稳定，允许极轻的自然变化。不要撒金粉、宝石闪光或整图缩放。',maxMotionFraction:.12,maxPixelDelta:56},
  {id:'tea-water',match:/品茶|茶|荷花|水面|湖|江|溪|海|tea|water|lake/i,label:'水波与茶烟',description:'选择原画中的水面细波、倒影、茶烟或已有植物轻摆。',direction:'只让原图已有水面细波、倒影或茶烟轻缓变化；没有水、蒸汽或植物时不要新添。茶具和人物稳定。',maxMotionFraction:.14,maxPixelDelta:64},
  {id:'treasure-light',match:/宝箱|宝石|金币|钻石|大宝箱|treasure|gem|gold/i,label:'宝物微光',description:'宝石、金币或已有星芒错峰闪亮，保留宝箱与角色造型。',direction:'让原画已有宝石切面、金币反光或星芒错峰闪亮；不要让金币飞起、宝箱开合或特效挡脸。',maxMotionFraction:.12,maxPixelDelta:72},
  {id:'flowers-breeze',match:/花|春|桃|樱|庭院|flower|spring/i,label:'花叶轻风',description:'花叶轻摆，原有花瓣缓缓飘动，柔光保持轻缓。',direction:'选择原图已有花叶轻摆或少量已有花瓣缓缓飘动，允许已有柔光轻微变化。不要无依据添加花瓣或通用星光。',maxMotionFraction:.14,maxPixelDelta:64},
  {id:'fire-magic',match:/火|篝火|火焰|魔法|冰|法术|战斗|攻击|斧头|fire|magic|battle/i,label:'场景能量',description:'火焰、冰晶或已有魔法能量轻缓流动，人物与文字稳定。',direction:'根据实际画面选择已有火焰自然摇曳、冰晶轮廓流光或魔法能量缓缓流动。不要制造爆炸、武器挥动或镜头冲击。',maxMotionFraction:.15,maxPixelDelta:72},
  {id:'night-forest',match:/夜|月|森林|水果|forest|moon|night/i,label:'夜景氛围',description:'选择已有叶影、月光或魔法辉光做局部缓慢变化。',direction:'选择已有叶影轻摆、月光柔和变化或原图魔法辉光轻缓流动。保持夜景明暗，不能整屏闪亮。',maxMotionFraction:.14,maxPixelDelta:64},
];

export function selectAdMotionPlan(sourceName='') {
  const selected=profiles.find(profile=>profile.match.test(sourceName))||{
    id:'visual-scene',label:'按画面意境',description:'由可灵查看实际画面，选择一至两处原有环境元素做轻缓动效。',
    direction:'先理解实际画面的情绪与场景，再从已有环境元素中选一至两处最合适的局部动效。静谧场景轻缓，热烈场景可稍明显；没有对应元素时不要硬套花瓣、火焰或星芒。',maxMotionFraction:.14,maxPixelDelta:64,
  };
  const {match,...plan}=selected;
  const playbackRate=plan.id==='quiet-reading'?.5:['tea-water','flowers-breeze'].includes(plan.id)?.7:1;
  return {...plan,playbackRate,mode:'full-scene',camera:'locked',frames:10,durationMs:1000,delayMs:100,loop:0};
}
