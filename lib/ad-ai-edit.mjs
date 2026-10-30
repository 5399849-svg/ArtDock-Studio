import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {buildOutpaintRequest,createCanvas,translateApiError} from './ai-huabu.mjs';
import {confirmCanvasCost,loadCanvasConfig} from '../platform/canvas.mjs';
import {nativeAdAiFrame,padAdAiInput} from './ad-ai-frame.mjs';
import {adAiRetouchPrompt} from './ad-ai-retouch.mjs';
import {adAiPreservationOnly,AD_AI_PRESERVATION_MESSAGE} from '../public/ad-ai-preservation.js';
import {AD_AI_LAYOUT_REFERENCE_METHOD,buildAdAiLayoutReference} from './ad-ai-reference-guard.mjs';
import {AD_AI_DEFAULT_MODEL,AD_AI_MODELS,adAiModel} from '../public/ad-ai-models.js';
import {AD_AI_PROPORTION_METHOD,adAiProportionRepair,buildAdAiProportionPrompt} from './ad-ai-proportion.mjs';

export const AD_AI_EDIT_MODEL=AD_AI_DEFAULT_MODEL;
export const AD_AI_EDIT_METHOD='ad-prompt-edit-v1';
const fail=(message,status=422)=>Object.assign(new Error(message),{status});
const uncertain=message=>Object.assign(new Error(message),{editStatus:'result_uncertain'});
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const hash=value=>createHash('sha256').update(value).digest('hex');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));

export async function nativeNanoChannel(config,fetchImpl,modelId=AD_AI_EDIT_MODEL){
  const label=AD_AI_MODELS.find(model=>model.id===modelId)?.label||modelId;
  let response,catalog;
  try{
    response=await fetchImpl(`${config.apiRoot}/RH_ComfyUI/models/image`,{headers:{Authorization:`Bearer ${config.token}`},signal:AbortSignal.timeout(20000)});
    catalog=await response.json();
  }catch{throw fail('暂时无法确认 Nano 模型通道，本次未提交生成，请稍后再试')}
  const model=catalog?.models?.find(m=>m.name===modelId);
  if(!response.ok||!model?.available)throw fail(`${label} 当前不可用，本次未提交生成`);
  const configured=String(config.adAiEditChannels?.[modelId]||(modelId===AD_AI_EDIT_MODEL?config.adAiEditChannel:'')||'').trim();
  if(modelId==='gpt-image-2'){
    if(!model.channels?.length)return '';
    const channel=configured?model.channels.find(c=>c.name===configured&&c.available):model.channels.find(c=>c.available);
    if(!channel)throw fail(`${label} 改图通道暂不可用，本次未提交生成`);
    return channel.name;
  }
  const channel=configured?model.channels?.find(c=>c.name===configured&&c.available):model.channels?.find(c=>c.name==='gemini'&&c.available)||model.channels?.find(c=>c.available&&/^gemini-3-pro-image/.test(c.vendor_model||''));
  if(!channel)throw fail('Nano 原生改图通道暂不可用，本次未提交生成；请联系管理员检查画布通道');
  return channel.name;
}

// Independent brand artwork stays local. Only its size/position is changed by
// explicit logo commands; scene editing never redraws or duplicates that artwork.
export function planAdAiEdit(prompt,{spec,draft,independentLogo=false,embeddedLogo=false}){
  if(typeof prompt!=='string'||!prompt.trim()||prompt.trim().length>2000)throw fail('请填写 1–2000 字的修改要求');
  prompt=prompt.trim();
  if(adAiPreservationOnly(prompt))throw fail(AD_AI_PRESERVATION_MESSAGE);
  const nextDraft={...draft},image=[],logoCommands=[];
  for(const clause of prompt.split(/[，,；;。\n]+/).map(s=>s.trim()).filter(Boolean)){
    if(!/logo/i.test(clause)){image.push(clause);continue}
    if(/不变|不动|保持原|保留原/.test(clause))continue;
    if(spec.logo==='forbidden')throw fail('当前尺寸要求无 Logo，请只描述画面修改');
    if(!independentLogo){
      if(embeddedLogo){image.push(clause);continue}
      throw fail('请先上传独立 Logo，再调整 Logo 的大小和位置');
    }
    if(/删除|去掉|移除|去除|不要|换|改色|颜色|红色|蓝色/.test(clause))throw fail('此尺寸必须带原 Logo。Logo 支持调整大小、位置；替换请使用“上传 Logo”');
    let handled=false;
    const percent=clause.match(/(\d+(?:\.\d+)?)\s*[%％]/),amount=percent?Number(percent[1])/100:.2;
    const absolute=/占.*(?:画|宽)|(?:大|缩小|放大|调整)到/.test(clause);
    if(absolute&&percent){nextDraft.logoScale=clamp(amount,.04,.6);handled=true}
    else if(/放大|加大|增大|大一[点些]|更大/.test(clause)){nextDraft.logoScale=clamp((nextDraft.logoScale||.18)*(1+amount),.04,.6);handled=true}
    else if(/缩小|减小|小一[点些]|更小/.test(clause)){nextDraft.logoScale=clamp((nextDraft.logoScale||.18)*(1-amount),.04,.6);handled=true}
    const inset=.04,scale=nextDraft.logoScale||.18;
    if(/左上/.test(clause)){Object.assign(nextDraft,{logoX:inset,logoY:inset});handled=true}
    else if(/右上/.test(clause)){Object.assign(nextDraft,{logoX:Math.max(inset,1-scale-inset),logoY:inset});handled=true}
    else if(/顶部居中|上方居中/.test(clause)){Object.assign(nextDraft,{logoX:(1-scale)/2,logoY:inset});handled=true}
    else if(/居中/.test(clause)){nextDraft.logoX=(1-scale)/2;handled=true}
    else for(const [pattern,key,direction] of [[/左移|向左|往左/,'logoX',-1],[/右移|向右|往右/,'logoX',1],[/上移|向上|往上/,'logoY',-1],[/下移|向下|往下/,'logoY',1]]){
      if(pattern.test(clause)){nextDraft[key]=clamp((nextDraft[key]||0)+direction*(percent?amount:.03),0,1);handled=true}
    }
    if(!handled)throw fail('Logo 要求尚不明确，请写成“Logo 放大20%”或“Logo 移到右上角”');
    logoCommands.push(clause);
  }
  return {prompt,imageInstruction:image.join('；'),logoCommands,nextDraft};
}

export function adAiEditMode(instruction=''){
  return adAiProportionRepair(instruction)||/重新(?:排版|布局|构图)|(?:整张|整体|画面).*(?:重排|排版|布局)|(?:留白|留空).*(?:太多|过多|太大)|四周.*(?:留空|留白)|(?:太|过于)集中/.test(instruction)?'recompose':'local';
}

export function buildAdAiEditPrompt({instruction,spec,embeddedLogo=false,logoBounds,frame,retouch,originalReference=false,referenceCount=0,referenceInputMethod}){
  const mode=adAiEditMode(instruction);
  return [
    frame?`你正在修改一张 ${spec.width}×${spec.height} 投放设计稿。为适配模型，本次输入和输出临时画幅均为 ${frame.width}×${frame.height}（${frame.ratio}）。设计稿位于 x=${frame.left}, y=${frame.top}, 宽=${spec.width}, 高=${spec.height} 的内框，外侧浅灰边仅为临时留边。保持内框位置和大小，按要求编辑内框内容，浅灰边不加入设计；返回整张临时画幅，工作台会精确去掉留边。`:`你正在修改一张投放设计稿。输出完整画面，严格保持 ${spec.width}×${spec.height} 的宽高比例。`,
    referenceCount?'【内容来源锁定】图1是唯一待修改的任务稿；除用户明确要求变更的内容外，输出人物的脸、冠饰、服装、花卉、徽记、名字和文案只能来自图1及同一任务的原始素材。额外参考图只说明版式与衔接，不提供任何可替换的内容。先保留原稿的内容清单，再做指定调整；不能以参考图为底图或返回参考图成稿。':'',
    '【本次修改要求】',instruction,
    originalReference?'【输入图片说明】图1是需要修改的当前尺寸稿，图2是同一素材的原始参考图。只编辑图1，保持图1的尺寸和人物；构图仅按本次修改要求调整。用户要求找回原图中的文字或信息时，逐字读取图2并补回图1，保留原图的字形、字序和字效；可以为所需文字做局部排布，不要把图2整张替换、拼接或叠加到图1。输出前确认要求补回的文字真实可见且没有漏字。':'',
    referenceCount?`【用户添加的修改参考图】图1始终是待修改稿；${Array.from({length:referenceCount},(_,i)=>`参考图${i+1}对应输入图${i+(originalReference?3:2)}`).join('，')}。用户文字中的“参考图1、参考图2”使用此编号。参考图仅用于借鉴用户明确指定的构图、上下衔接、布局或细节处理；只编辑图1，不要把参考图整张替换、拼贴或叠加到图1，不新增参考图里的人物、文字或 Logo。即使参考图是另一角色或另一配色，仍保留当前稿的人物身份、服装、文案、Logo 和原始素材色调；未明确要求改色时，参考图不是色彩基准。用户只说“参考图”时，按其修改说明借鉴处理方式，不照搬内容。`:'',
    referenceCount&&referenceInputMethod===AD_AI_LAYOUT_REFERENCE_METHOD?'额外参考图已转换为去除文字、面部、服装细节与配色的灰度布局示意。仅观察大块区域的分布、留白和过渡关系；模糊灰块与英文标注不是画面素材，不能进入成稿。输出须保持图1的原画精细度和色调。':'',
    retouch?adAiRetouchPrompt(retouch):'',
    mode==='recompose'?[
      '【执行模式：整体重新排版】重新建立整个版面，输入图只作为内容和风格参考。原位置、原大小、原来的空白面积不锁定。移动人物和信息模块、等比缩放、重新分配版面；不要只在旧图上添加一块新内容。',
      '用户指出内容集中、四周留空太多时，主要内容整体覆盖约70%至85%的可用宽度和高度，尤其缩减上下大块空景。以独立 Logo 区域和舒适边距为界重新布置所有内容，不能仍缩在中央一条横带。',
      '先逐一清点画面实际已有的人物表现和信息模块，再重新排布同一套内容。每个原有构图单元各保留一次；移动一个单元后，清除它在旧位置的副本并补回自然背景。人物、清单和展示面板保持原来的对应关系，数量、身份、五官、服装、道具和信息内容不变。',
      '最后核对：确实重新排版，没有沿用旧图后再复制内容；没有重复或遗漏人物和模块；人物脸部、手部与信息不遮挡；Logo 预留区域没有关键内容。'
    ].join('\n'):'【执行模式：局部调整】仅修改明确要求的部分。未要求改变的区域保持原样；人物数量、身份、五官、肢体、服装、道具和信息对应关系不变。',
    '除非用户明确要求删除或合并，按实际出现次数保留人物形象，不按角色身份去重。同一角色在原画中分别以全身、半身或特写出现时，均为独立构图单元，不能合并成一个身体或只保留特写。原画若有冷暖、昼夜或远近景对照，保留每组环境与对应人物、动作和关键道具的关系，不合并场景或抹去一侧色彩。',
    originalReference?'未明确要求改色时，图2的设计师原始图片是唯一色彩基准；图1只确定当前尺寸和构图。肤色、服装、花朵和背景的色相、饱和度、明暗、色温须与图2保持一致，不能沿用已有偏红或偏紫的中间稿，不自行增艳、提亮或重新打光。':'未明确要求改色时，以图1的当前画面为唯一色彩基准，保持原有色相、饱和度、明暗、色温和光线，不自行增艳、提亮或重新打光。',
    '保留原有文案的每一个字、字序和字效；只有明确要求时才改变文字内容或排版。人物脸部、手部和主文案清楚完整，避免相互遮挡。',
    '修复背景时保持完整场景、透视和纹理连续，不贴矩形补丁，不复制边缘像素，不拉伸、镜像或制造横向条带。',
    embeddedLogo?'保留原图已有的单个品牌 Logo，不复制，不增加第二个 Logo。':'输入是独立 Logo 叠加前的画面。不要生成、添加或重绘任何品牌 Logo，工作台会保留独立 Logo 并在本地叠加。',
    logoBounds?`独立 Logo 的叠加区域为 ${JSON.stringify(logoBounds)}（相对于画布，0至1坐标）。此区域保留自然背景，人物脸部、手部、文字与关键信息不要进入。不要为 Logo 画白框或新增占位标志。`:'',
    spec.safeInsetX?`两侧各 ${spec.safeInsetX}px 是保护区，重要人物脸部、文字、信息应位于中间 ${spec.width-2*spec.safeInsetX}px 内；边缘保留自然背景。`:'保持舒适的画面边距，不裁断重要内容。',
    '只输出一张修改后的完整图，不要对比拼图、外框、说明或水印。用户明确要求添加、补回或修改的文字必须执行；除此之外不要增加无关文字。'
  ].join('\n');
}

// This catches near-copies for explicit full-layout requests. It is not a visual
// quality score: accepted drafts still need review. Normalize tone so merely
// brightening the same layout cannot count as a recomposition.
export async function assessAdAiRecomposition(sourceBuffer,resultBuffer,{proportionRepair=false}={}){
  const arrays=await Promise.all([sourceBuffer,resultBuffer].map(buffer=>sharp(buffer).resize(48,48).removeAlpha().greyscale().blur(1.5).raw().toBuffer()));
  const [a,b]=arrays,n=a.length,mean=values=>values.reduce((sum,v)=>sum+v,0)/n,mx=mean(a),my=mean(b);
  let vx=0,vy=0,cov=0;for(let i=0;i<n;i++){vx+=(a[i]-mx)**2;vy+=(b[i]-my)**2;cov+=(a[i]-mx)*(b[i]-my)}
  const sx=Math.sqrt(vx/n),sy=Math.sqrt(vy/n),correlation=sx>1&&sy>1?cov/n/sx/sy:sx<=1&&sy<=1?1:0;
  let difference=0;for(let i=0;i<n;i++)difference+=Math.abs((a[i]-mx)/Math.max(1,sx)-(b[i]-my)/Math.max(1,sy));difference/=n;
  // Repainting faces or swapping details inside the same layout is not an
  // overall recomposition. This intentionally requires a larger change than
  // local editing, which never runs through this check.
  // Distortion feedback calls for a meaningful geometry change. Minor detail
  // repainting (or adding a logo) cannot satisfy it. This remains a conservative
  // change check, not proof that every individual subject has correct anatomy.
  const lostStructure=sx>3&&sy<sx*.15,nearCopy=proportionRepair?correlation>.85&&difference<.4:correlation>.96&&difference<.25;
  return {changed:!nearCopy&&!lostStructure,correlation,normalizedDifference:difference,...(lostStructure?{reason:'lost-structure'}:nearCopy?{reason:'near-copy'}:{})};
}

export async function validateAdAiRecompositionResult({job,workDir,generated,update}){
  if(adAiEditMode(job.plan?.imageInstruction)!=='recompose')return;
  const proportionRepair=adAiProportionRepair(job.plan.imageInstruction);
  let assessment;
  try{assessment=await assessAdAiRecomposition(await fs.readFile(path.join(workDir,'input.png')),generated||await fs.readFile(path.join(workDir,'result.png')),{proportionRepair});}
  catch(error){throw Object.assign(Error('构图核验未完成，原稿已保留：'+error.message),{editStatus:'needs_revision'});}
  await update({assessment});
  if(!assessment.changed)throw Object.assign(Error(assessment.reason==='lost-structure'?'AI 结果丢失了原画结构，原稿已保留；请调整要求后重新生成':proportionRepair?'AI 未明显纠正画面比例，当前稿未改变。请从原图重新生成': 'AI 未明显改变主体排版，未替换当前稿。请补充具体布局要求后再生成'),{editStatus:'needs_revision'});
}

// The job ID and submission key are persisted by the caller. Polling and
// downloading an existing ID never start a second charged generation.
export async function generateAdAiEdit({root,sourceBuffer,originalReferenceBuffer,referenceBuffers=[],spec,instruction,embeddedLogo=false,logoBounds,job,onUpdate,fetchImpl=fetch,pollIntervalMs=4000,deadlineMs=20*60*1000}){
  const model=adAiModel(job.model||AD_AI_EDIT_MODEL);
  const config=await loadCanvasConfig(job.projectId,{root});
  const headers={Authorization:`Bearer ${config.token}`};
  const frame=job.generationFrame||(!job.submittedAt&&!job.providerJobId?nativeAdAiFrame(spec):null);
  const proportionRepair=job.inputMethod===AD_AI_PROPORTION_METHOD;
  const prompt=job.resolvedPrompt||(proportionRepair?buildAdAiProportionPrompt({instruction,spec,embeddedLogo,logoBounds,frame,referenceCount:referenceBuffers.length}):buildAdAiEditPrompt({instruction,spec,embeddedLogo,logoBounds,frame,retouch:job.plan?.retouch,originalReference:Boolean(originalReferenceBuffer),referenceCount:referenceBuffers.length,referenceInputMethod:job.referenceInputMethod}));
  let providerJobId=job.providerJobId;
  if(!providerJobId){
    if(job.submittedAt&&Date.now()-Date.parse(job.submittedAt)>23*60*60*1000)throw uncertain('这次提交已超过查询时限，请联系管理员核对画布记录，避免重复计费');
    if(job.submittedAt&&!job.providerRequestKey)throw uncertain('这次旧版提交缺少完整回执，请联系管理员核对画布记录，不能自动重复提交');
    // New edits use the provider's native Nano route. A resumed legacy request
    // keeps its original route and idempotency key, even after a code update.
    const channel=job.providerChannel??(job.submittedAt?'':await nativeNanoChannel(config,fetchImpl,model));
    let canvasId=job.canvasId;
    if(!canvasId){canvasId=await createCanvas(config,{title:`${job.project||'投放素材'} AI修改`},fetchImpl);await onUpdate({canvasId})}
    const divisor=(a,b)=>b?divisor(b,a%b):a,d=divisor(spec.width,spec.height);
    // Never send the distorted draft as the primary image for a proportion
    // repair. Keep the clean original uncropped, with its native aspect ratio.
    const modelInput=proportionRepair?await sharp(originalReferenceBuffer||sourceBuffer).rotate().resize({width:2048,height:2048,fit:'inside',withoutEnlargement:true}).png().toBuffer():await padAdAiInput(sourceBuffer,frame);
    const ratio=frame?.ratio||`${spec.width/d}:${spec.height/d}`;
    const body=model==='gpt-image-2'?{model,task_type:'image',bot_id:'canvas',prompt,ratio,image_size:'2K',quality:'high',output_format:'png',images:[{data_base64:modelInput.toString('base64')}]}:buildOutpaintRequest({model,base64:modelInput.toString('base64'),prompt,ratio,imageSize:'2K'});
    if(originalReferenceBuffer&&!proportionRepair)body.images.push({data_base64:originalReferenceBuffer.toString('base64')});
    for(const [index,buffer] of referenceBuffers.entries()){
      const reference=job.referenceInputMethod===AD_AI_LAYOUT_REFERENCE_METHOD?await buildAdAiLayoutReference(buffer,index):buffer;
      body.images.push({data_base64:reference.toString('base64')});
    }
    body.canvas_id=canvasId;
    if(channel)body.channel=channel;
    const key=job.providerRequestKey||hash(`${AD_AI_EDIT_METHOD}:${model}:${job.id}:${hash(sourceBuffer)}:${originalReferenceBuffer?hash(originalReferenceBuffer):''}:${channel}:${prompt}${referenceBuffers.length?':references:'+referenceBuffers.map(hash).join(':'):''}`);
    if(!job.submittedAt)await confirmCanvasCost(config,body,fetchImpl);
    await onUpdate({status:'submitting',submittedAt:job.submittedAt||new Date().toISOString(),resolvedPrompt:prompt,providerChannel:channel,providerRequestKey:key,...(frame?{generationFrame:frame}:{})});
    let response,payload;
    try{
      response=await fetchImpl(`${config.apiRoot}/canvas-backend/generate`,{method:'POST',headers:{...headers,'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify(body),signal:AbortSignal.timeout(150000)});
      payload=await response.json();
    }catch{throw uncertain('画布提交结果暂未确认，任务已保留；点击“继续查询”核对同一次提交')}
    providerJobId=payload?.data?.job_id||payload?.data?.jobId;
    if(payload?.status!==0||!providerJobId){
      const code=Number(payload?.code||response.status);
      if([400,401,402,403,422].includes(code))throw fail(translateApiError(code,payload?.msg));
      throw uncertain('画布提交结果暂未确认，请继续查询本次任务，不要重复生成');
    }
    await onUpdate({providerJobId:String(providerJobId),status:'processing'});
  }else await onUpdate({status:'processing'});
  const end=Date.now()+deadlineMs;
  while(Date.now()<end){
    let response,payload;
    try{
      response=await fetchImpl(`${config.apiRoot}/canvas-backend/jobs/${encodeURIComponent(providerJobId)}`,{headers,signal:AbortSignal.timeout(20000)});
      payload=await response.json();
    }catch{await wait(pollIntervalMs);continue}
    if(payload?.status===0){
      if(payload.data?.channel&&job.actualProviderChannel!==payload.data.channel)await onUpdate({actualProviderChannel:payload.data.channel});
      if(['failed','cancelled'].includes(payload.data?.status))throw fail(payload.data.error||'画布修改失败，请调整要求后重试');
      if(payload.data?.status==='done'){
        await onUpdate({status:'downloading'});
        let raw;
        try{raw=await fetchImpl(`${config.apiRoot}/canvas-backend/jobs/${encodeURIComponent(providerJobId)}/raw`,{headers,signal:AbortSignal.timeout(90000)})}catch{throw uncertain('图已生成，下载暂未完成；继续查询会取回同一张图')}
        if(!raw.ok)throw uncertain('图已生成，暂时无法下载；请继续查询取回结果');
        return Buffer.from(await raw.arrayBuffer());
      }
    }else if([401,403].includes(Number(payload?.code||response.status)))throw uncertain('画布查询权限暂不可用，请联系管理员；本次任务已保留');
    await wait(pollIntervalMs);
  }
  throw uncertain('画布仍在处理，任务已保留；可以稍后继续查询，不会重复生成');
}
