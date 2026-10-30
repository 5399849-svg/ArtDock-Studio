import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {illustrationCharacterSources,illustrationOptions,layeredIllustrationWorkflow} from '../public/community-illustration-state.js';
import {communityObjectLayerRect} from '../public/community-object-layers.js';

export {layeredIllustrationWorkflow};
const fail=message=>{throw Object.assign(Error(message),{status:422});};
export const illustrationHash=buffer=>createHash('sha256').update(buffer).digest('hex');
function promptCharacterSide(prompt){
 const matches=[...prompt.matchAll(/(?:角色|人物)\s*(?:整体|主要)?\s*(?:放置|安排|摆放|放|置|位于|靠|居|在)?\s*(?:在|到|于)?\s*(?:画面|画布|构图|母版)?\s*(?:的)?\s*(左|右)(?:侧|边|半|方)?/g)]
  .filter(match=>!/(?:不要|避免|不能|别).{0,3}$/.test(prompt.slice(Math.max(0,match.index-8),match.index)));
 return matches.at(-1)?.[1]==='左'?'left':'right';
}
export function prepareLayeredIllustration(task,input,referenceNames){
  const value=input.illustration||illustrationOptions(task);
  if(!['prompt','theme','directed','original'].includes(value.characterMode))fail('角色生成方式无效');
  if(!['auto','left','right'].includes(value.side||'auto'))fail('角色位置无效');
  const sources=illustrationCharacterSources(task),name=value.characterMode==='prompt'?'':String(value.characterSourceName||'');
  if(name&&!sources.some(a=>a.name===name))fail('角色依据不属于当前任务的参考图或角色素材');
  if(value.characterMode==='original'&&!name)fail('请选择要原样使用的透明角色素材');
  const action=value.characterMode==='prompt'?'':String(value.action||'').trim();
  if(action.length>500)fail('角色动作说明最多 500 字');
  if(value.characterMode==='directed'&&!action)fail('请填写角色动作');
  if((task.parameters?.communityObjectLayersByTemplate?.[task.masterTemplateId]||[]).filter(l=>l.appearance.kind!=='character').length>=32)fail('画布最多放入 32 个独立素材，请先为角色腾出一个图层');
  // Reference numbers remain stable; a bound character is appended as an internal reference.
  const sourceIndex=name?referenceNames.indexOf(name):-1;
  const prompt=String(input.prompt||'');
  const side=value.characterMode==='prompt'||value.side==='auto'||!value.side?promptCharacterSide(prompt):value.side;
  return {workflow:layeredIllustrationWorkflow,illustration:{characterMode:value.characterMode,characterSourceName:name,action,side,sourceIndex},
    composition:{character:{x:side==='left'?.26:.74,y:.52,size:.9},titleSide:side==='left'?'right':'left',light:'与角色一致的自然主光，统一透视、色温与画风'},
    steps:[{kind:'character',status:'pending'},{kind:'background',status:'pending'}]};
}
const matteColors={magenta:[255,0,255],green:[0,255,0],cyan:[0,255,255]};
export async function chooseCharacterMatte(buffers){
  const scores={magenta:0,green:0,cyan:0};
  for(const buffer of buffers){
    const {data}=await sharp(buffer,{limitInputPixels:40000000}).resize(96,96,{fit:'inside'}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    for(let p=0;p<data.length;p+=4)if(data[p+3]>64)for(const [name,color]of Object.entries(matteColors)){
      const on=color.map((n,k)=>n===255?data[p+k]:null).filter(n=>n!==null),off=color.map((n,k)=>n===0?data[p+k]:null).filter(n=>n!==null);
      if(Math.min(...on)-Math.max(...off)>45)scores[name]++;
    }
  }
  return Object.keys(scores).sort((a,b)=>scores[a]-scores[b])[0];
}
const numberedGuide=run=>run.referenceNames.map((_,i)=>`输入第${i+1}张对应界面图${i+1}。先按设计师原文区分这张图用于角色身份、动作姿势、绘制画风还是背景排版；只使用被指定的用途，不能互相替代，不复制其旧文案、Logo、水印。`).join('\n');
export function layeredCharacterRequest(run,images){
  const o=run.illustration,source=o.characterSourceName?(o.sourceIndex>=0?`界面图${o.sourceIndex+1}`:'最后一张内部角色素材'):'按设计师原文识别指定的角色参考图；没有角色参考图时，按文字角色设定';
  const matte=matteColors[run.characterMatte||'magenta'].map(n=>n.toString(16).padStart(2,'0')).join('').toUpperCase();
  return {model:run.model,task_type:'image',bot_id:'canvas',ratio:'3:4',image_size:'2K',quality:'high',output_format:'png',background:'transparent',
    images:images.map(b=>({data_base64:b.toString('base64')})),prompt:`生成一份独立游戏角色素材，用于稍后与配套背景在本地组合。只绘制一个角色及其实际手持、穿戴或紧密互动的物件。完整保留发梢、手指、脚、衣摆、旗杆与手持道具，四周留出至少6%安全边距，不裁切，不画背景场景、地面、其他人物、奖励道具陈列、标题、文字、Logo、水印或棋盘格。\n【角色依据】${source}。保留同一人的身份、五官、发型、服装设计、主配色和指定画风；设定图的多视图代表一个人，不能生成多个人或设定表。动作参考图只参考姿势、朝向、表情和手势，不得替换角色身份、五官、服饰或画风；排版图不能变成角色依据。画风参考只指导绘制风格，不能更换角色身份。\n【动作】${o.characterMode==='directed'?`严格按设计师指定动作：${o.action}。` : ''}优先执行设计师在下方原文中描述的角色动作、姿态、身体朝向和手持物件；指定动作参考图时，优先按该图的姿势设计，并结合文字细节。文字要求与动作参考有冲突时，以明确的文字要求为准。只有设计师既未描述动作、也未指定动作参考图时，才根据活动主题设计合适的动作、表情、身体朝向与自然手势。保证解剖和物件接触合理。\n【配套构图】角色最终位于母版${o.side==='left'?'左':'右'}侧，另一侧预留文案；${run.composition.light}。角色的视线与动作服务活动主题。\n【设计师要求】${run.prompt}\n【参考编号】${numberedGuide(run)}\n【独立导出】优先输出真实透明PNG。若通道不支持透明，素材之外的全部空白及内部空隙使用完全平坦、精确的纯色 #${matte}，不要渐变、纹理、阴影、底板或展示框，四边均为此底色；角色及其光效不要使用此底色，工作台会转换透明通道。只返回这一份角色素材。`};
}
export function layeredBackgroundRequest(run,images){
  const p=run.composition,side=run.illustration.side;
  return {model:run.model,task_type:'image',bot_id:'canvas',ratio:run.canvas?.providerRatio||run.canvas?.ratio||'16:9',image_size:'4K',quality:'high',output_format:'png',
    images:images.map(b=>({data_base64:b.toString('base64')})),prompt:`生成一张${run.canvas?.width||1920}×${run.canvas?.height||1080}、${run.canvas?.ratio||'16:9'}、4K高质量的完整游戏活动纯场景背景，作为独立背景层。${run.canvas?.custom?`服务输出比例为${run.canvas.providerRatio}，最终画布比例为${run.canvas.ratio}，将等比居中裁切背景的多余边缘；场景核心内容与角色承托区域须位于中心安全范围，严禁拉伸场景。`:''}\n【设计师方向】${run.prompt}\n【参考编号】${numberedGuide(run)}\n【内部配套依据】最后两张分别是本批次确定的角色素材与工作台摆位示意；不属于界面参考图编号。观察真实角色的画风、材质、光照、动作、机位和手持物件，设计与其匹配的原创场景。示意图只表达角色在${side==='left'?'左':'右'}侧的占位与尺度，绝不可复制其灰色底或角色到背景。${p.light}；角色站立/坐卧/悬浮的承托面、接触高度与视角必须合理，角色手持物不在背景重复绘制。\n【构图与分层】${p.titleSide==='left'?'左':'右'}侧保持简洁自然的环境，为文案留位，不绘制占位框。背景必须铺满完整画幅，角色区域后方也要绘制完整环境，不能留下透明洞、空白洞、剪影、影子人形或人物残留。只允许环境和自然装饰，绝不绘制人、脸、身体、衣服、动物角色、奖励道具陈列、人物手持物件、标题、副标题、伪字、Logo、版权、水印、界面。人物仅由工作台独立叠加；设计师要求中的人物动作只指导场景空间，不能画进背景。保持清晰且统一的画风和光色，不添加统一压暗滤镜。`};
}
export async function normalizeLayeredCharacter(raw,{matte='magenta',original=false}={}){
  const {data,info}=await sharp(raw,{limitInputPixels:40000000}).rotate().toColourspace('srgb').ensureAlpha().raw().toBuffer({resolveWithObject:true});
  let empty=0;for(let p=3;p<data.length;p+=4)if(data[p]<16)empty++;
  const total=info.width*info.height;
  const originalAlpha=Buffer.from(data);
  if(empty<total*.01){
    if(original)fail('原样使用需要带真实透明背景的角色 PNG，请先上传透明素材或完成抠图；原角色不会被重绘');
    const key=matteColors[matte];if(!key)fail('角色透明底色无效');
    let border=0,matching=0;
    for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++)if(x<3||y<3||x>=info.width-3||y>=info.height-3){const i=(y*info.width+x)*4;border++;if(Math.max(...key.map((n,k)=>Math.abs(n-data[i+k])))<48)matching++;}
    if(matching/border<.8)fail('角色结果没有真实透明通道或合格的纯色底，原始结果已保留，未替换当前画面');
    for(let p=0;p<data.length;p+=4){
      const on=key.map((n,k)=>n===255?data[p+k]:null).filter(n=>n!==null),off=key.map((n,k)=>n===0?data[p+k]:null).filter(n=>n!==null);
      let alpha=Math.min(1,Math.max(...off)/Math.max(1,Math.min(...on)));alpha=alpha<.08?0:alpha>.98?1:alpha;
      for(let k=0;k<3;k++)if(alpha)data[p+k]=Math.max(0,Math.min(255,Math.round((data[p+k]-(1-alpha)*key[k])/alpha)));
      data[p+3]=Math.round(alpha*255);
    }
  }
  let ink=0,left=info.width,top=info.height,right=-1,bottom=-1;
  for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){const i=(y*info.width+x)*4;if(data[i+3]>8){ink++;left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);}}
  if(ink<Math.max(8,total*.005)||ink>total*.98)fail('角色透明素材为空或仍包含整幅背景，原始结果已保留');
  if(!original&&(left===0||top===0||right===info.width-1||bottom===info.height-1))fail('角色或手持物件触及画幅边缘，可能被裁切；结果已保留，请检查');
  const bounds={left,top,width:right-left+1,height:bottom-top+1};
  // Store the untrimmed source for later alpha-only repair. Reused PNG pixels are never redrawn.
  const sourcePixels=Buffer.from(data);
  for(let p=3;p<sourcePixels.length;p+=4)sourcePixels[p]=originalAlpha[p];
  const source=await sharp(sourcePixels,{raw:info}).png().toBuffer();
  const buffer=await sharp(data,{raw:info}).extract(bounds).png().toBuffer();
  return {buffer,source,bounds,width:bounds.width,height:bounds.height};
}
export async function illustrationPlacementGuide(character,run,{background}={}){
  const {width=1920,height=1080}=run.canvas||{};
  const meta=await sharp(character).metadata(),layer={...run.composition.character,appearance:{aspect:meta.width/meta.height}};
  const r=communityObjectLayerRect(layer,{width,height});
  const item=await sharp(character).resize(Math.max(1,Math.round(r.width)),Math.max(1,Math.round(r.height)),{fit:'inside'}).png().toBuffer();
  const base=background?sharp(background).resize(width,height,{fit:'cover'}):sharp({create:{width,height,channels:4,background:'#eeeeee'}});
  return base.composite([{input:item,left:Math.round(r.x),top:Math.round(r.y)}]).png().toBuffer();
}
export function applyPairedIllustration(task,background){
  const pair=background.layeredIllustration;
  if(!pair){
    const p=task.parameters,id=task.masterTemplateId;
    if(p.communityObjectLayersByTemplate?.[id])p.communityObjectLayersByTemplate[id]=p.communityObjectLayersByTemplate[id].filter(l=>l.appearance.kind!=='character'||!task.communityObjects?.characters?.some(c=>c.id===l.appearance.groupId&&c.materialRunId));
    return;
  }
  const group=task.communityObjects?.characters?.find(c=>c.id===pair.characterId);
  const asset=task.assets.find(a=>a.name===group?.assetName&&!a.libraryDeletedAt);
  if(!group||!asset)fail('此背景的配套角色已移除，请先恢复角色素材');
  const p=task.parameters,id=task.masterTemplateId;
  const layer={id:`character:${group.id}`,appearance:{kind:'character',groupId:group.id,name:group.name||'角色',assetName:asset.name,aspect:asset.width/asset.height},...pair.placement};
  (p.communityObjectLayersByTemplate||={})[id]=[...(p.communityObjectLayersByTemplate[id]||[]).filter(l=>l.appearance.kind!=='character'),layer];
}
