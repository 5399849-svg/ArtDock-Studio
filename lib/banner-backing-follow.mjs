import {measureBannerBackingContent,centerSubtitleInBacking} from './banner-backing-content.mjs';

// Resolve this relationship from the actual selected artwork before any paid
// stage. It only changes native copy; the designer's backing stays untouched.
export async function resolveBannerBackingFollow(run,{readBacking}={}){
  if(!run.plan.operations.some(op=>op.type==='follow-backing'))return run;
  const backing=run.layouts['subtitle-backing'];
  if(!backing || backing.visible===false || backing.backing?.enabled!==true)throw new Error('请先添加并显示副标底板，再让副标跟随底板倾斜');
  const name=backing.backing.assetName;
  const content=name?await measureBannerBackingContent(await readBacking(name))
    :{x:.06,y:.12,width:.88,height:.76,rotation:0,method:'native-backing-inset'};
  if(name && !Number.isFinite(content.rotation))throw new Error('暂时无法识别这张底板的正文角度，原母版已保留；请使用边缘更清楚的底板');
  const subtitle=centerSubtitleInBacking(run.layouts.subtitle,backing,content);
  // Store analysis with the text, leaving even backing metadata unchanged.
  subtitle.backingAlignment={assetName:name || null,contentRect:content};
  run.layouts.subtitle=subtitle;
  return run;
}
