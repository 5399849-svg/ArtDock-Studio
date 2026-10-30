import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {buildOutpaintRequest,createCanvas,downloadRaw,pollJob,submitGeneration} from './ai-huabu.mjs';
import {loadCanvasConfig} from '../platform/canvas.mjs';
import {nativeAdAiFrame,padAdAiInput,normalizeAdAiOutput} from './ad-ai-frame.mjs';
import {assertNanoBlankFilled} from './nano-outpaint-input.mjs';
import {writeJson} from './json-store.mjs';

export function needsNanoLayout(sourceWidth,sourceHeight,targetWidth,targetHeight){
  return Math.abs(Math.log((sourceWidth/sourceHeight)/(targetWidth/targetHeight)))>.45;
}

function commonDivisor(a,b){return b?commonDivisor(b,a%b):a}

export function buildAdNanoLayoutPrompt({sourceName='',targetWidth,targetHeight,layoutMode='',sourceRect,sourceHasLogo=false}){
  if(layoutMode==='background-extension')return `输入是一张按原始比例居中放置的投放插画，画布外围的浅灰色区域是唯一需要补齐的地方。原画位置为 ${JSON.stringify(sourceRect)}（相对于整个画布）。只在灰色空缺区域自然延续原图边界已有的景物、地面、建筑或材质，使整体成为完整的 ${targetWidth}×${targetHeight} 画面。中央原画、人物比例、五官、手部、文案、菜单和 UI 必须保持原位置、原尺寸和原始颜色，禁止重新构图、缩放、裁切、拉高或压扁原画。扩展区保持清晰自然的透视与纹理，禁止复制最后一排像素造成竖条，禁止镜像、模糊、纯色边条、边框、接缝、水印、Logo、新文字、新人物或重复物体。新增区域与原画的色相、饱和度、明暗和光线一致，不得给整幅图调色。只补背景，完整保留原图。`;
  const divisor=commonDivisor(targetWidth,targetHeight),ratio=`${targetWidth/divisor}:${targetHeight/divisor}`;
  const portrait=targetHeight>targetWidth*1.2;
  const groupedPanels=portrait&&/派饭|派发|领奖|奖励|任务面板/i.test(sourceName);
  const composition=groupedPanels?'横版原画包含三组一一对应的信息：每组由一个人物、一条道具清单和一块奖励展示板组成。竖版改为上中下三段，每段从左到右依次排人物、该人物的道具清单、对应的奖励展示板；每个原有单元各保留一次。保持道具种类、数量、顺序及打勾状态。禁止把完整横版重复三遍，也禁止把三块展示板并排放在一段里。':portrait?'先判断原画是单幅场景、双场景KV还是信息排版。如果是菜单、图鉴、清单或多元素排版，请把原有内容模块按对应关系重排成竖向结构，使主要内容占据画面大部分；原有的每个人物表现、面板或信息组均须保留，不额外复制。不要把整张横版缩小后摆进新生成的房间，也不要用大面积空地填补比例。如果是单幅场景，请围绕原主体重构景物，让主体保持足够大且完整。如果是双场景KV，请用上下错位或前后景关系重排两组内容，以原有景物自然衔接，不做矩形分镜。':'主体与重要信息居中且完整，四周自然延伸原画的景物，留出舒适的画面边距。';
  const contentBoundary='【构图内容锁定】先按画面中的实际出现次数清点人物形象，不按角色身份去重。同一角色在原画中以全身、半身或特写分别出现时，每次表现都是必须保留的独立构图单元，不能因为身份相同而删除、合并或只留下特写。保留各单元的原有动作和关键道具。原画若有冷暖、昼夜或远近景对照，保留每组场景与对应人物的配对及色彩分区，不把一侧人物搬入另一侧环境来替代双场景。若原画只有一个人物形象，也不得增加第二个。';
  const scene=/茶|tea|品茗/i.test(sourceName)?'原画是人物品茶的场景。保留人物身份、发型、服饰、姿态、茶具和茶席，按原画内容自然延续山水、草地、荷花等景物。':'';
  const typography=portrait?'仅当原画已有独立的宣传主标题时，优先按原句语义拆为两行，保持字序、文字内容与原有字效；不要把长标题压成底部一条细长的横条。为两行主标留出空间，避免遮挡角色脸部和主要动作。卡牌姓名、评级、清单标签不属于宣传主标题，不得提取到卡牌外重复做成标题。顶部预留独立品牌区域，可容纳约画宽45%的Logo，人物脸部不要进入该区域；预留区域保持自然背景，不画占位文字、印章或标志。':'';
  const textBoundary=`【文字边界】只保留输入图实际已有的文字，逐字保留字形、字序、内容及其与卡牌、人物或信息模块的对应关系，不能仅保留原意后改写。禁止根据任务名、人物名、题材或画风猜写新标题、游戏名、题字、印章和装饰性伪字。原图没有宣传标题时，输出也不得增加宣传标题。${sourceHasLogo?'输入含有无法分离的品牌 Logo，只保留原来这一个，逐字保持，不另造品牌、不增加第二个。':'输入是已分离品牌 Logo 的纯图，输出必须继续无品牌 Logo；不要生成、添加或重绘任何品牌 Logo、仿 Logo 标题或品牌印章。独立 Logo 由工作台后续在本地叠加，模型只保留自然背景。'}保留原有角色姓名和字母评级，不删除正常信息。`;
  const colorLock='【主体比例锁定】人物、道具和建筑内容单元只能等比缩放和移动；禁止把横版非等比拉成竖版，禁止拉长人物、压窄房屋、加高楼层或门窗来填满画布。相连的房屋、楼层与人物保留原始宽高和透视关系，作为整体等比适配；多出的空间延伸自然背景，不能靠拉高屋顶、基座或主体填充。以输入的设计师原画为唯一色彩基准，保持人物肤色、服装、场景的原有色相、饱和度、明暗对比、色温与光线。只调整画幅和构图，不要自行调色、增艳、提亮、压暗或重新打光；扩展区域也须匹配原画色调，避免横版与竖版、方版出现不同配色。';
  return `请根据输入的设计师原画，重新构图为完整的${portrait?'竖版':'方版'}投放插画，画面比例 ${ratio}。${textBoundary}${contentBoundary}${scene}${composition}${typography}保留原画中人物与重要元素的数量、外观和相互关系，不要裁断或复制。延续原画的绘画风格与意境。${colorLock}不要出现横向图片条带、明显拼接线、水印或乱码。`;
}

export async function prepareAdNanoLayoutRequest({sourceBuffer,targetWidth,targetHeight,sourceName='',layoutMode='',sourceRect,blankRepair=false,sourceHasLogo=false}){
  const spec={width:targetWidth,height:targetHeight};
  const frame=layoutMode==='background-extension'?nativeAdAiFrame(spec):null;
  let buffer=await padAdAiInput(sourceBuffer,frame);
  const rect=frame&&sourceRect?{
    x:(frame.left+sourceRect.x*targetWidth)/frame.width,
    y:(frame.top+sourceRect.y*targetHeight)/frame.height,
    width:sourceRect.width*targetWidth/frame.width,
    height:sourceRect.height*targetHeight/frame.height
  }:sourceRect;
  const width=frame?.width||targetWidth,height=frame?.height||targetHeight;
  const divisor=commonDivisor(width,height),ratio=frame?.ratio||`${width/divisor}:${height/divisor}`;
  let prompt=buildAdNanoLayoutPrompt({sourceName,targetWidth:width,targetHeight:height,layoutMode,sourceRect:rect,sourceHasLogo});
  if(blankRepair&&layoutMode==='background-extension'){
    if(!rect)throw Error('背景补绘缺少受保护的原画范围');
    const left=Math.round(rect.x*width),top=Math.round(rect.y*height),sw=Math.round(rect.width*width),sh=Math.round(rect.height*height);
    const original=await sharp(buffer).extract({left,top,width:sw,height:sh}).png().toBuffer();
    buffer=await sharp({create:{width,height,channels:3,background:'#ff00ff'}}).composite([{input:original,left,top}]).png().toBuffer();
    prompt='【必须完成的背景补绘】输入中的纯紫红色（RGB 255,0,255）全部是遮罩，不属于画面配色。必须把每一处紫红色填成紧邻原画的洞穴、天空、树林、地面或其它已有环境，四边都不能留下纯色边条。只绘制这些遮罩区域，不改变中央原画，不新增人物或文字。返回完整无框的画面。\n'+prompt.replaceAll('浅灰色','紫红色').replaceAll('灰色','紫红色');
  }
  return {buffer,prompt,ratio,frame,spec};
}

// Persist the provider canvas before submitting, and its job before polling.
// A network interruption or local validation failure must never discard a paid
// result or replay the same intent against a different provider canvas (409).
export function createAdNanoLayoutGenerator(provider={createCanvas,submitGeneration,pollJob,downloadRaw}){
 const running=new Map();
 return async function generate({root,sourceBuffer,targetWidth,targetHeight,idempotencySeed='',sourceName='',layoutMode='',sourceRect,blankRepair=false,sourceHasLogo=false}){
  const config=await loadCanvasConfig(undefined,{root});
  const source=await sharp(sourceBuffer).metadata();
  if(!source.width||!source.height)throw Error('Nano 源图无效');
  const input=await prepareAdNanoLayoutRequest({sourceBuffer,targetWidth,targetHeight,sourceName,layoutMode,sourceRect,blankRepair,sourceHasLogo});
  const {prompt,ratio,frame,spec}=input;
  const idempotencyKey=createHash('sha256').update(`ad-layout-v3-native-frame:${idempotencySeed}:${createHash('sha256').update(input.buffer).digest('hex')}:${prompt}`).digest('hex').slice(0,32);
  // 回执按使用者的微光账号分开（凭据会续签变化，账号编号不变）。
  const account=createHash('sha256').update(`${config.apiRoot}:${config.accountId||config.token}`).digest('hex').slice(0,16);
  const folder=path.join(root,'data/runtime/ad-layout-jobs',account,idempotencyKey);
  if(running.has(folder))return running.get(folder);
  const operation=(async()=>{
    await fs.mkdir(folder,{recursive:true});
    const receiptFile=path.join(folder,'receipt.json'),rawFile=path.join(folder,'raw.png'),resultFile=path.join(folder,'result.png');
    let receipt=await fs.readFile(receiptFile,'utf8').then(JSON.parse).catch(error=>{if(error.code!=='ENOENT')throw error;return {idempotencyKey,sourceName,layoutMode,targetWidth,targetHeight,ratio,frame,sourceHasLogo,resolvedPrompt:prompt,createdAt:new Date().toISOString()};});
    const save=async()=>{receipt.updatedAt=new Date().toISOString();await writeJson(receiptFile,receipt);};
    try{
      let buffer=await fs.readFile(resultFile).catch(error=>{if(error.code!=='ENOENT')throw error;return null;});
      if(buffer)return buffer;
      let raw=await fs.readFile(rawFile).catch(error=>{if(error.code!=='ENOENT')throw error;return null;});
      if(!raw){
        if(!receipt.canvasId){receipt.canvasId=await provider.createCanvas(config,{title:`${sourceName||'投放素材'} ${ratio}`});await save();}
        if(!receipt.jobId){
          const body={...buildOutpaintRequest({model:'banana_pro',base64:input.buffer.toString('base64'),prompt,ratio,imageSize:'2K'}),canvas_id:receipt.canvasId};
          receipt.jobId=await provider.submitGeneration(config,body,{idempotencyKey});receipt.status='submitted';await save();
        }
        await provider.pollJob(config,receipt.jobId);
        raw=(await provider.downloadRaw(config,receipt.jobId)).buffer;
        // Decode before saving, but retain the original dimensions and pixels.
        raw=await sharp(raw).png().toBuffer();
        await fs.writeFile(rawFile,raw);receipt.status='downloaded';await save();
      }
      const meta=await sharp(raw).metadata();receipt.rawWidth=meta.width;receipt.rawHeight=meta.height;
      if(layoutMode==='background-extension'){
        const normalized=await normalizeAdAiOutput(raw,spec,frame);
        buffer=normalized.buffer;receipt.adaptation=normalized.adaptation;
        try{await assertNanoBlankFilled(buffer,sourceRect);}
        catch(error){
          if(error.code!=='NANO_UNFILLED'||blankRepair)throw error;
          // Some models reproduce subtle grey padding instead of outpainting.
          // Retry once with an explicit, unmistakable inpainting mask. Both
          // paid jobs are durable, so refresh/restart never repeats either one.
          receipt.status='repairing';receipt.repairMethod='explicit-outpaint-mask-v1';await save();
          buffer=await generate({root,sourceBuffer,targetWidth,targetHeight,idempotencySeed,sourceName,layoutMode,sourceRect,blankRepair:true,sourceHasLogo});
        }
      }else{
        if(!meta.width||!meta.height||Math.abs(Math.log((meta.width/meta.height)/(targetWidth/targetHeight)))>.15)throw Error('Nano 返回的画面比例不符合目标尺寸');
        buffer=raw;
      }
      await fs.writeFile(resultFile,buffer);receipt.status='completed';receipt.error='';await save();
      return buffer;
    }catch(error){receipt.status='interrupted';receipt.error=error.message;await save();throw error;}
  })();
  running.set(folder,operation);
  try{return await operation;}finally{if(running.get(folder)===operation)running.delete(folder);}
 };
}

export const generateAdNanoLayout=createAdNanoLayoutGenerator();
