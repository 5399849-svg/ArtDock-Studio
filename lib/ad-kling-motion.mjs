import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {createCanvas,downloadRaw} from './ai-huabu.mjs';
import {confirmCanvasCost,loadCanvasConfig} from '../platform/canvas.mjs';
import {selectAdMotionPlan} from './ad-motion-plan.mjs';

export const AD_MOTION_MODEL='kling_v3';
export const AD_MOTION_METHOD='canvas-kling-v3-v1';
const hash=value=>createHash('sha256').update(value).digest('hex');
const inFlight=new Map();
const terminal=new Set(['failed','cancelled','result_uncertain']);
const now=()=>new Date().toISOString();
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const motionError=(message,status='failed')=>Object.assign(new Error(message),{motionStatus:status});
async function submitOnce(config,body,idempotencyKey){
  // The shared image adapter retries POSTs on network errors. A charged video
  // submission instead makes exactly one POST; an ambiguous response is stopped.
  const response=await fetch(`${config.apiRoot}/canvas-backend/generate`,{
    method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':idempotencyKey,Authorization:`Bearer ${config.token}`},body:JSON.stringify(body),signal:AbortSignal.timeout(150000),
  });
  const payload=await response.json().catch(()=>null);
  if(payload?.status===0){
    const jobId=payload.data?.job_id||payload.data?.jobId;
    if(jobId)return jobId;
    throw motionError('微光画布没有返回可灵任务编号','result_uncertain');
  }
  const rejected=[400,401,402,403,422].includes(Number(payload?.code||response.status));
  throw Object.assign(motionError(rejected?(payload?.msg||'微光画布拒绝了可灵请求'):'可灵提交结果尚未确认，已停止自动重投，请检查画布任务记录',rejected?'failed':'result_uncertain'),{code:payload?.code||response.status});
}

export function buildAdMotionBrief(sourceName='',scenePlan=selectAdMotionPlan(sourceName)){
  const scene=String(sourceName||'').slice(0,150);
  return {
    prompt:[
      '以提供的单张原画作为首帧，制作4秒清楚可辨、节奏舒缓的完整插画微动；最终交付固定为10帧、1秒循环，不把4秒动作加速塞进1秒。',
      `素材名称：${scene}。固定镜头，延续原画构图、角色身份、比例、色彩和绘画风格。`,
      '完整画面统一生成，人物与环境来自同一段连续视频。人物身份、五官、手指、道具形状与基本姿态保持稳定，可以有极轻微自然呼吸、发饰或衣袖随风微动，不转头、不抬手、不换动作，不增加道具。脸部始终完整清楚。不要把静止人物当作剪贴块隔离于环境。',
      `本任务动效方向：${scenePlan.label}。${scenePlan.direction}素材名仅辅助理解，必须以实际画面已有元素为准。`,
      '只选择原画已有的一至两处环境元素，不限于亮度变化，应保留帘纱、水面、花叶等真实局部形态变化；与相邻空间自然相连，不在画面里划出硬性运动边界。以640×400预览为尺度，摆动约3至5像素；微光亮度约20%至30%柔和起伏，不能只做几乎不可见的亮度微调，也不能快速扫光、强闪或大幅特效。',
      '环境运动不能挡住人物脸部、书信、文案或UI。不能新添遮挡、光斑、烟雾、飞物或大颗粒。优先选择轻摆、呼吸感或柔和反光等约一秒自然回到原位的运动；不要为了循环做长距离飘落或大幅动作。',
      '首帧如含字幕、标题、Logo和界面文字，则保持清晰固定；如果首帧没有这些内容，绝不新增，文字会由原生透明图层后期合成。道具格、计时条、图标与界面边框保持原有几何形状、排列和位置，进度值与道具数量不变。背景建筑稳定。',
      '保持原画色相、饱和度、明暗与色温；禁止自行调色、增艳、整体提亮或重新打光。固定镜头，不自动推拉缩放，不套用通用闪光模板。',
      'One coherent full-frame animated illustration. Locked camera, scene-appropriate gentle cyclical motion. Keep character identity, anatomy, props and pose stable; tiny natural fabric or breathing motion is allowed. No cut-out patches or face occlusion. Preserve existing text, UI and original color grade. Do not invent typography if absent.',
    ].join('\n'),
    negative:'镜头移动、推拉缩放、全画面平移、大幅人物动作、转头、摆手、遮挡脸部、大幅位移、快速扫光、频闪、强光爆发、特效覆盖角色、换脸、畸形肢体、道具变化、额外人物、文字变形、乱码、界面布局变化、随机星形贴纸、水印',
    scenePlan,
  };
}

async function writeReceipt(file,value){
  await fs.mkdir(path.dirname(file),{recursive:true});
  const temporary=`${file}.${randomUUID()}.tmp`;
  await fs.writeFile(temporary,JSON.stringify(value,null,2)+'\n');
  await fs.rename(temporary,file);
}

async function readReceipt(file){
  try{return JSON.parse(await fs.readFile(file,'utf8'))}
  catch(error){if(error.code==='ENOENT')return null;throw error}
}

/** Real provider adapter. Existing jobId is polled; it is never submitted again. */
export async function generateAdKlingVideo({root,sourceBuffer,receipt,onStatus,pollIntervalMs=5000,deadlineMs=60*60*1000}){
  const config=await loadCanvasConfig(receipt.projectId,{root});
  let jobId=receipt.jobId;
  if(!jobId){
    const canvasId=await createCanvas(config,{title:`${receipt.sourceName||'投放动效'} GIF`});
    const encoded=sourceBuffer.toString('base64');
    const body={model:AD_MOTION_MODEL,task_type:'video',bot_id:'canvas',canvas_id:canvasId,prompt:receipt.prompt,negative_prompt:receipt.negative,images:[{data_base64:encoded}],resolution:'720p',duration:4,generate_audio:false};
    await confirmCanvasCost(config,body);
    // Persist before the first POST. A process crash here must not create a second charged job.
    await onStatus({status:'submitting'});
    try{jobId=await submitOnce(config,body,receipt.idempotencyKey)}
    catch(error){
      const rejected=[401,402,403,400,422].includes(Number(error.code));
      throw motionError(rejected?error.message:'可灵提交结果尚未确认，已停止自动重投，请检查画布任务记录',rejected?'failed':'result_uncertain');
    }
    await onStatus({status:'submitted',jobId});
  }
  const end=Date.now()+deadlineMs;
  while(Date.now()<end){
    let payload;
    try{
      const response=await fetch(`${config.apiRoot}/canvas-backend/jobs/${encodeURIComponent(jobId)}`,{headers:{Authorization:`Bearer ${config.token}`},signal:AbortSignal.timeout(45000)});
      payload=await response.json();
      if(payload.status!==0){
        if([401,402,403].includes(Number(payload.code)))throw motionError(payload.msg||'无法读取可灵任务状态','result_uncertain');
        await wait(pollIntervalMs);continue;
      }
    }catch(error){
      if(error.motionStatus)throw error;
      await wait(pollIntervalMs);continue;
    }
    const status=payload.data?.status;
    if(terminal.has(status))throw motionError(payload.data?.error||`可灵任务${status}`,status);
    if(status==='done'){
      await onStatus({status:'downloading',jobId,progress:100});
      let raw;
      try{raw=await downloadRaw(config,jobId)}catch{throw motionError('可灵视频已生成，但下载未完成；可重新检查此任务，不会重新扣费','result_uncertain')}
      if(raw.buffer.length<1000)throw motionError('可灵视频结果无效，请检查画布任务','result_uncertain');
      return {buffer:raw.buffer,jobId,contentType:raw.contentType};
    }
    await onStatus({status:'processing',jobId,progress:Number(payload.data?.progress)||undefined});
    await wait(pollIntervalMs);
  }
  throw motionError('可灵生成仍未完成，任务编号已保存；重新检查将继续读取原任务','result_uncertain');
}

/**
 * Durable once-only generation boundary. Tests inject videoGenerate here; production
 * uses the exact same receipt/duplicate suppression with the real Kling adapter.
 */
export async function generateAdKlingMotion({root,sourceBuffer,workDir,idempotencySeed='',sourceName='',motionBrief,onStatus=async()=>{},videoGenerate=generateAdKlingVideo}){
  const sourceHash=hash(sourceBuffer);
  const receiptFile=path.join(workDir,'video-receipt.json'),videoFile=path.join(workDir,'motion.mp4');
  const active=inFlight.get(receiptFile);if(active)return active;
  const operation=(async()=>{
    let receipt=await readReceipt(receiptFile);
    // A paid job belongs to its original brief. Changing the defaults must not
    // invalidate its receipt, block a download, or force another charged call.
    const brief=receipt?{prompt:receipt.prompt,negative:receipt.negative}:motionBrief||buildAdMotionBrief(sourceName);
    if(typeof brief.prompt!=='string'||!brief.prompt.trim()||typeof brief.negative!=='string')throw motionError('可灵动效描述无效');
    const requestHash=hash(`${receipt?.method||AD_MOTION_METHOD}:${idempotencySeed}:${sourceHash}:${brief.prompt}:${brief.negative}`);
    if(receipt&&receipt.requestHash!==requestHash)throw motionError('动效输入已变更，请保留原记录并使用新的动效任务目录');
    if(!receipt){
      receipt={id:requestHash.slice(0,32),requestHash,sourceHash,sourceName:String(sourceName||'').slice(0,100),model:AD_MOTION_MODEL,method:AD_MOTION_METHOD,duration:4,resolution:'720p',generateAudio:false,firstLastSameStill:false,referenceMode:'first-frame',...brief,idempotencyKey:requestHash.slice(0,32),status:'prepared',createdAt:now(),updatedAt:now()};
      await writeReceipt(receiptFile,receipt);
    }
    const update=async value=>{Object.assign(receipt,value,{updatedAt:now()});await writeReceipt(receiptFile,receipt);await onStatus({...receipt});};
    if(receipt.status==='completed'){
      const buffer=await fs.readFile(videoFile);await onStatus({...receipt});return {buffer,receipt,workDir};
    }
    if(receipt.status==='submitting'&&!receipt.jobId){
      await update({status:'result_uncertain',error:'上次提交未返回任务编号，已停止自动重投，请检查画布任务记录'});
      throw motionError(receipt.error,'result_uncertain');
    }
    if(['failed','cancelled'].includes(receipt.status)||(receipt.status==='result_uncertain'&&!receipt.jobId))throw motionError(receipt.error||'此动效任务已停止，不会自动重复提交',receipt.status);
    try{
      const result=await videoGenerate({root,sourceBuffer,receipt:{...receipt},onStatus:update});
      const buffer=Buffer.isBuffer(result)?result:result?.buffer;
      if(!Buffer.isBuffer(buffer)||!buffer.length)throw motionError('可灵没有返回视频结果','result_uncertain');
      await fs.writeFile(videoFile,buffer);
      await update({status:'completed',jobId:result?.jobId||receipt.jobId,bytes:buffer.length,contentType:result?.contentType||'video/mp4',completedAt:now(),error:''});
      return {buffer,receipt,workDir};
    }catch(error){
      error.motionStatus||=receipt.jobId||receipt.status==='submitting'?'result_uncertain':'failed';
      await update({status:error.motionStatus,error:String(error.message||error).slice(0,500)});
      throw error;
    }
  })();
  inFlight.set(receiptFile,operation);
  try{return await operation}finally{if(inFlight.get(receiptFile)===operation)inFlight.delete(receiptFile)}
}
