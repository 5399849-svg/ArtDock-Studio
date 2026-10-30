import sharp from 'sharp';

// Directional seam repairs are inpainting operations, not a redraw of the
// characters/UI. Keep the full scene as context and only adopt the repaired edge.
export function planAdAiRetouch(instruction,spec){
  if(!/修复|修补|消除|去掉|处理|修好/.test(instruction)||!/接缝|拼接|断层|条带/.test(instruction))return null;
  if(/(?:人物|角色|主体|主标题|文字|文案|道具|面板|清单)[^；;，,。\n]{0,8}(?:放大|缩小|移动|移到|重排|两行|改成)/.test(instruction))return null;
  const matches=[['top',/上面|上方|顶部|上边|上沿/],['bottom',/下面|下方|底部|下边|下沿/],['left',/左面|左方|左侧|左边|左沿/],['right',/右面|右方|右侧|右边|右沿/]].filter(([,pattern])=>pattern.test(instruction));
  if(matches.length!==1)return null;
  const side=matches[0][0],dimension=['top','bottom'].includes(side)?spec.height:spec.width;
  const explicit=instruction.match(/(?:上面|上方|顶部|上边|上沿|下面|下方|底部|下边|下沿|左侧|左边|右侧|右边)[^；;，,。\n\d]{0,6}(\d+(?:\.\d+)?)\s*(%|％|px|像素)/i);
  const depth=explicit?Number(explicit[1])*(/[%％]/.test(explicit[2])?dimension/100:1):dimension*.06;
  return {method:'full-scene-edge-inpaint-v1',side,width:spec.width,height:spec.height,depth:Math.max(8,Math.min(Math.round(dimension*.3),Math.round(depth))),feather:Math.max(4,Math.round(dimension*.02))};
}

const distance=(x,y,plan)=>plan.side==='top'?y:plan.side==='bottom'?plan.height-1-y:plan.side==='left'?x:plan.width-1-x;

export async function maskAdAiRetouchInput(source,plan){
  const {data,info}=await sharp(source).toColourspace('srgb').removeAlpha().raw().toBuffer({resolveWithObject:true});
  for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++)if(distance(x,y,plan)<plan.depth){const i=(y*info.width+x)*info.channels;data[i]=255;data[i+1]=0;data[i+2]=255;}
  return sharp(data,{raw:info}).png().toBuffer();
}

export function adAiRetouchPrompt(plan){
  return `【局部背景补绘】输入仍是完整场景；设计稿内框的${{top:'顶部',bottom:'底部',left:'左侧',right:'右侧'}[plan.side]}沿边 ${plan.depth}px 已遮为纯紫红色（RGB 255,0,255），这是原拼接错误需要重绘的唯一区域。根据紧邻的自然背景，把这块紫红色缺口补成连续的花枝、天空、建筑或其它已有景物，修复不连续的尺度与纹理。紫红色不是原画配色，必须全部去掉；不要照抄错误横条，不要留下色边或直线接缝。其余完整画面用于上下文与色彩参考，不移动、不重画人物、面部、文字、清单或道具。返回完整画面，工作台只采用这处修复。`;
}

export async function finishAdAiRetouch(source,generated,plan){
  const [a,b]=await Promise.all([source,generated].map(buffer=>sharp(buffer).toColourspace('srgb').removeAlpha().raw().toBuffer({resolveWithObject:true})));
  if(a.info.width!==plan.width||a.info.height!==plan.height||b.info.width!==plan.width||b.info.height!==plan.height)throw Error('局部修复画布尺寸不一致');
  let masked=0,area=0,difference=0;
  for(let y=0;y<plan.height;y++)for(let x=0;x<plan.width;x++){
    const d=distance(x,y,plan);if(d>=plan.depth+plan.feather)continue;
    const t=Math.max(0,Math.min(1,(d-plan.depth)/plan.feather)),alpha=1-t*t*(3-2*t),i=(y*plan.width+x)*a.info.channels;
    if(d<plan.depth){area++;if(b.data[i]>235&&b.data[i+1]<35&&b.data[i+2]>235)masked++;for(let c=0;c<3;c++)difference+=Math.abs(a.data[i+c]-b.data[i+c]);}
    for(let c=0;c<3;c++)a.data[i+c]=Math.round(a.data[i+c]*(1-alpha)+b.data[i+c]*alpha);
  }
  if(masked/area>.01||difference/(area*3)<1)throw Object.assign(Error('AI 未完成指定背景区域的补绘，原稿已保留'),{editStatus:'needs_revision'});
  return sharp(a.data,{raw:a.info}).png().toBuffer();
}
