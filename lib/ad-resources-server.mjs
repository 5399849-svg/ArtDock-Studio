import {createProjectLogoLibrary} from './project-logos.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import sharp from 'sharp';
import {createStoreZip,safeChild} from './core.mjs';
import {generateAdNanoLayout,needsNanoLayout} from './ad-nano-layout.mjs';
import {reframeAdSafeLayout,safeLayoutMethod} from './ad-safe-layout.mjs';
import {reflowPortraitMenu,portraitMenuMethod} from './ad-portrait-menu.mjs';
import {renderDreamFlowerFrame} from './ad-dream-motion.mjs';
import {receiveAdAssetUpload,stageLegacyAdAsset,prepareAdAssetUpload} from './ad-asset-upload.mjs';
import {AD_MOTION_METHOD,AD_MOTION_MODEL,generateAdKlingMotion,generateAdKlingVideo} from './ad-kling-motion.mjs';
import {AD_DEFAULT_MOTION_STYLE,AD_MOTION_RENDER_REVISION,convertAdVideoToGif} from './ad-video-motion.mjs';
import {selectAdMotionPlan} from './ad-motion-plan.mjs';
import {reframeAdMotionLayers} from './ad-motion-layers.mjs';
import {migrateAdBatchesToCatalog} from './ad-catalog-migration.mjs';
import {createAdAiEditJobs,isAdAiEditActive,isAdAiEditLocked} from './ad-ai-edit-jobs.mjs';
import {createAdAiGroupJobs} from './ad-ai-edit-group-jobs.mjs';
import {createAdAiReferences,receiveAdAiReference} from './ad-ai-references.mjs';
import {writeJson} from './json-store.mjs';
import {createAdVersionLifecycle,nextAdVersion,markAdVersionSaved,updateAdWorkingDraft,adDraftKey} from './ad-version-lifecycle.mjs';
import {createAdDraftSync} from './ad-draft-sync.mjs';
import {adLogoGeometry} from '../public/ad-logo-geometry.js';
import {adCatalogWithOutputPolicy,adSpecWithOutputPolicy} from '../public/ad-output-policy.js';
import {readAdOutputPolicy} from './ad-output-policy.mjs';
import {adMaximumBytes,encodeDetailAdJpeg} from './ad-jpeg-quality.mjs';
import {renderAdSafeTypography} from './ad-safe-typography.mjs';
import {localPython} from '../platform/local-compute.mjs';
import {setProjectHint} from '../platform/request-context.mjs';

const run=promisify(execFile);
const respond=(res,status,value)=>{const body=Buffer.from(JSON.stringify(value));res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Content-Length':body.length});res.end(body)};
const invalid=(message,status=422)=>Object.assign(new Error(message),{status});
async function bodyJson(req,limit=30*1024*1024){const parts=[];let total=0;for await(const part of req){total+=part.length;if(total>limit)throw invalid('上传内容超过限制',413);parts.push(part)}try{return JSON.parse(Buffer.concat(parts).toString('utf8')||'{}')}catch{throw invalid('请求内容不是有效 JSON',400)}}
function imageData(value){const match=/^data:(image\/(?:jpeg|png|webp|gif)|application\/x-photoshop);base64,([A-Za-z0-9+/=]+)$/i.exec(String(value||''));if(!match)throw invalid('仅支持 JPG、PNG、WebP、GIF 或 PSD 文件');return {mime:match[1].toLowerCase(),buffer:Buffer.from(match[2],'base64')}}
const logoFreeName=/(?:无\s*logo|不含\s*logo|no[-_ ]?logo|纯图|clean)/i;
const logoName=/(?:^|[-_ ])lg(?:[-_. ]|$)|logo|带标语|带\s*logo|含\s*logo/i;
const embeddedLogo=asset=>Boolean(asset?.hasEmbeddedLogo===true||asset?.hasEmbeddedLogo!==false&&!logoFreeName.test(asset?.name||'')&&logoName.test(asset?.name||''));
const outputFileName=(batch,spec)=>{
  const material=String(batch.project||'素材').trim().replace(/\.(?:psd|jpe?g|png|webp)$/i,'').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').replace(/\.+$/,'').slice(0,80)||'素材';
  const suffix=spec.format==='GIF'?'_动':spec.logo==='required'?'_lg':'';
  return `${material}${suffix}_${spec.width}x${spec.height}.${spec.format==='GIF'?'gif':'jpg'}`;
};
function preferredVisual(spec,visuals,hasLogo){return visuals.reduce((best,asset)=>{const ratioError=Math.abs(Math.log((asset.width/asset.height)/(spec.width/spec.height)))*10;const logoPenalty=asset.hasEmbeddedLogo||embeddedLogo(asset)?spec.logo==='forbidden'?100:hasLogo?20:0:0;const cleanBonus=asset.logoFree?-60:0;const score=ratioError+logoPenalty+cleanBonus;return !best||score<best.score?{asset,score}:best},null)?.asset}
export function defaultAdLogoPlacement(logo,spec={}){
  if(spec.logo!=='required')return {};
  if(spec.logo==='required'&&spec.height/spec.width>1.2)return {logoX:.275,logoY:.025,logoScale:.45};
  const [x0,y0,x1]=logo?.originalBounds||[];
  const square=Math.abs(Math.log(spec.width/spec.height))<.15,minimum=square?.34:.18;
  if(!logo?.sourceWidth||!logo?.sourceHeight||![x0,y0,x1].every(Number.isFinite))return {logoX:Math.min(.78,1-minimum),logoY:.06,logoScale:minimum};
  const oldScale=(x1-x0)/logo.sourceWidth,logoScale=square?Math.max(minimum,Math.min(.6,oldScale)):Math.max(.02,Math.min(.6,oldScale));
  // Landscape follows the source PSD size. Square placements keep the larger
  // default, while both retain the source's left/right alignment.
  const x=x0/logo.sourceWidth,right=1-x1/logo.sourceWidth;
  return {logoX:Math.max(0,Math.min(1-logoScale,x>.5?1-right-logoScale:x)),logoY:Math.max(0,Math.min(.8,y0/logo.sourceHeight)),logoScale};
}
const itemState=(batch,specId)=>{batch.items||={};batch.items[specId]||={draft:{sourceAssetId:'',logoAssetId:'',zoom:1,offsetX:0,offsetY:0,logoX:0.78,logoY:0.06,logoScale:0.18},versions:[]};return batch.items[specId]};

export async function validateAdCandidate(spec,buffer){
  const meta=await sharp(buffer,{animated:true}).metadata().catch(()=>null);
  if(!meta?.width||!meta?.height)throw invalid('无法识别图片尺寸');
  const expected=spec.format==='GIF'?'gif':'jpeg';
  if(meta.format!==expected)throw invalid(`此资源位要求 ${spec.format}，当前上传的是 ${String(meta.format||'未知').toUpperCase()}`);
  const actualHeight=spec.format==='GIF'?meta.pageHeight||meta.height:meta.height;
  if(meta.width!==spec.width||actualHeight!==spec.height)throw invalid(`尺寸应为 ${spec.width}×${spec.height}，当前是 ${meta.width}×${actualHeight}`);
  if(spec.format==='GIF'&&(meta.pages||1)<2)throw invalid('GIF 动图至少需要 2 帧，静态图不能充当动图交付');
  if(spec.minBytes&&buffer.length<spec.minBytes)throw invalid(`文件不能小于 ${Math.ceil(spec.minBytes/1024)}KB，当前 ${(buffer.length/1024).toFixed(1)}KB`);
  if(buffer.length>adMaximumBytes(spec))throw invalid(spec.maxBytesInclusive?`文件需不大于 ${Math.ceil(spec.maxBytes/1024)}KB，当前 ${(buffer.length/1024).toFixed(1)}KB`:`文件需小于 ${spec.limitRaw}，当前 ${Math.ceil(buffer.length/1024)}KB`);
  const durationMs=spec.format==='GIF'&&Array.isArray(meta.delay)&&meta.delay.every(delay=>Number.isFinite(delay)&&delay>=0)
    ?meta.delay.reduce((total,delay)=>total+delay,0):0;
  return {width:meta.width,height:actualHeight,format:spec.format,frames:meta.pages||1,bytes:buffer.length,...(durationMs>0?{durationMs}:{})};
}

export async function chooseAdMotion(sourceBuffer,hint=''){
  const {data,info}=await sharp(sourceBuffer).resize(64,40).removeAlpha().raw().toBuffer({resolveWithObject:true});
  const water=[];let warm=0,dark=0,bright=0,purple=0;
  for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){
    const i=(y*info.width+x)*info.channels,r=data[i],g=data[i+1],b=data[i+2],l=(r+g+b)/3;
    if(l<100)dark++;if(l>185)bright++;
    if(r>145&&r>g*1.18&&g>b*1.12)warm++;
    if(r>115&&b>130&&b>g*1.12&&r>g*1.06)purple++;
    if(x>info.width*.08&&x<info.width*.92&&y>info.height*.42&&y<info.height*.85&&g>95&&b>95&&b>r*1.07&&g>r*1.04)water.push({x:(x+.5)/info.width,y:(y+.5)/info.height});
  }
  const area=info.width*info.height,tea=/茶|tea|teapot|品茗/i.test(hint),rewards=/派饭|道具|物品|合成|奖励|棋盘|配方|reward/i.test(hint),food=/葱花饼|菜单|美食|食物|餐饮|点心|菜谱/i.test(hint),dream=/送花/.test(hint)&&purple>area*.18,profile=dream?'dream-flowers':rewards?'game-rewards':food?'food':tea&&water.length>25?'tea-water':water.length>area*.035?'water':dark>area*.55?'night':warm>area*.1?'warm':'breeze';
  const anchors=[];
  for(const point of water.sort((a,b)=>b.x-a.x))if(anchors.every(previous=>Math.hypot(previous.x-point.x,previous.y-point.y)>.15)){anchors.push(point);if(anchors.length===5)break}
  return {profile,anchors};
}

export async function renderAdGif(sourceBuffer,spec,draft={}){
  if(spec.format!=='GIF')throw invalid('此资源位不需要 GIF 动图');
  const meta=await sharp(sourceBuffer).metadata();
  if(!meta.width||!meta.height)throw invalid('主视觉素材无效');
  const zoom=Math.max(1,Math.min(2.5,Number(draft.zoom)||1));
  const scale=Math.max(spec.width/meta.width,spec.height/meta.height)*zoom;
  const width=meta.width*scale,height=meta.height*scale;
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
  const left=clamp((spec.width-width)/2+(Number(draft.offsetX)||0)*spec.width,spec.width-width,0);
  const top=clamp((spec.height-height)/2+(Number(draft.offsetY)||0)*spec.height,spec.height-height,0);
  const cropWidth=Math.min(meta.width,Math.max(1,Math.round(spec.width/scale)));
  const cropHeight=Math.min(meta.height,Math.max(1,Math.round(spec.height/scale)));
  const cropLeft=clamp(Math.round(-left/scale),0,meta.width-cropWidth);
  const cropTop=clamp(Math.round(-top/scale),0,meta.height-cropHeight);
  const base=await sharp(sourceBuffer).extract({left:cropLeft,top:cropTop,width:cropWidth,height:cropHeight}).resize(spec.width,spec.height).png().toBuffer();
  const motion=await chooseAdMotion(base,draft.themeHint||'');
  if(motion.profile==='dream-flowers'){
    const count=8;
    const frames=[];
    for(let frame=0;frame<count;frame++)frames.push(await renderDreamFlowerFrame(base,spec.width,spec.height,frame,count));
    return sharp(frames,{join:{animated:true}}).gif({colours:128,effort:9,dither:.35,interFrameMaxError:0,delay:frames.map(()=>300),loop:0}).toBuffer();
  }
  const frames=[];
  for(let frame=0;frame<24;frame++){
    const phase=frame*Math.PI/12,breath=(1+Math.sin(phase))/2;
    let effect='';
    if(motion.profile==='food'){
      // Steam belongs to the tea service; the menu text and dishes remain fixed.
      const steamAnchors=/葱花饼/.test(draft.themeHint||'')?[[.335,.225],[.445,.225],[.583,.225]]:[[.275,.30],[.54,.30],[.64,.30]];
      effect+=steamAnchors.flatMap(([px,py],index)=>[-7,7].map((separation,strand)=>{
        const x=Math.round(px*spec.width+separation),y=Math.round(py*spec.height),rise=(frame*1.5+index*7+strand*12)%27;
        const opacity=(.28+.48*Math.sin(Math.PI*rise/27)).toFixed(2);
        const sway=Math.sin(phase+index*1.9+strand)*4;
        const path=`M${x} ${y-2-rise} C${x-9+sway} ${y-13-rise},${x+9+sway} ${y-23-rise},${x+sway} ${y-38-rise}`;
        return `<path d="${path}" fill="none" stroke="#856046" stroke-width="8" stroke-linecap="round" opacity="${(.18+.16*Math.sin(Math.PI*rise/27)).toFixed(2)}"/><path d="${path}" fill="none" stroke="#fff9e8" stroke-width="5" stroke-linecap="round" opacity="${opacity}"/>`;
      })).join('');
      effect+=[[.73,.30],[.86,.30],[.35,.72],[.72,.73]].map(([px,py],index)=>{
        const pulse=Math.max(0,Math.sin(phase-index*1.4)),x=Math.round(px*spec.width),y=Math.round(py*spec.height);
        return `<path d="M${x} ${y-7-3*pulse} L${x+2.5+2*pulse} ${y} L${x} ${y+7+3*pulse} L${x-2.5-2*pulse} ${y} Z" fill="#fff5c7" opacity="${(.1+.66*pulse).toFixed(2)}"/>`;
      }).join('');
    }else if(motion.profile==='game-rewards'){
      // The reward tiles and check marks animate; the characters and main art stay fixed.
      const rewards=[[.1,.84],[.38,.84],[.7,.84],[.91,.84]];
      effect+=rewards.map(([px,py],index)=>{
        const pulse=Math.max(0,Math.sin(phase-index*1.15)),x=Math.round(px*spec.width+Math.sin(phase+index)*4),y=Math.round(py*spec.height-4*pulse);
        const glow=(.04+.4*pulse).toFixed(2),shine=(.12+.85*pulse).toFixed(2),radius=19+14*pulse;
        return `<ellipse cx="${x}" cy="${y}" rx="${radius}" ry="${17+10*pulse}" fill="#fff5ae" opacity="${glow}"/><path d="M${x} ${y-19-5*pulse} L${x+5} ${y-5} L${x+19+5*pulse} ${y} L${x+5} ${y+5} L${x} ${y+19+5*pulse} L${x-5} ${y+5} L${x-19-5*pulse} ${y} L${x-5} ${y-5} Z" fill="#fffef4" opacity="${shine}"/>`;
      }).join('');
      effect+=[[.03,.25],[.385,.25],[.715,.25]].map(([px,py],index)=>{
        const pulse=Math.max(0,Math.sin(phase-index*2.1)),x=Math.round(px*spec.width),y=Math.round(py*spec.height);
        return `<circle cx="${x}" cy="${y}" r="${9+6*pulse}" fill="none" stroke="#fff9cc" stroke-width="${2+3*pulse}" opacity="${(.08+.82*pulse).toFixed(2)}"/>`;
      }).join('');
    }else if(motion.profile==='tea-water'||motion.profile==='water'){
      const anchors=motion.anchors.length?motion.anchors:[{x:.74,y:.65},{x:.87,y:.7}];
      effect+=anchors.slice(0,4).map((point,index)=>{const x=Math.round(point.x*spec.width),y=Math.round(point.y*spec.height),pulse=(frame+index*2)%8,rx=12+pulse*3,ry=3+pulse*.65,opacity=(.46-pulse*.04).toFixed(2);return `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="none" stroke="#e8fff9" stroke-width="2" opacity="${opacity}"/>`}).join('');
      effect+=`<ellipse cx="${Math.round(spec.width*.81)}" cy="${Math.round(spec.height*.59)}" rx="${28+breath*11}" ry="${6+breath*2}" fill="#fff8d8" opacity="${(.04+breath*.055).toFixed(3)}"/>`;
      if(motion.profile==='tea-water')effect+[[.48,.54],[.60,.56]].map(([px,py],index)=>{const x=Math.round(spec.width*px),y=Math.round(spec.height*py),drift=Math.sin(phase+index)*4;return `<path d="M${x} ${y} C${x+drift-5} ${y-12},${x+drift+7} ${y-24},${x+drift} ${y-35}" fill="none" stroke="#fffef4" stroke-width="2.4" stroke-linecap="round" opacity="${(.13+breath*.17).toFixed(2)}"/>`}).join('');
    }else if(motion.profile==='night'){
      effect+=[[.13,.25],[.83,.27],[.72,.72],[.18,.76],[.91,.53],[.3,.1],[.57,.17],[.41,.83]].map(([x,y],index)=>{const glow=Math.max(0,Math.sin(phase+index*1.5)),cx=Math.round(x*spec.width),cy=Math.round(y*spec.height),r=3+glow*6;return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#fff4a7" opacity="${(.14+glow*.72).toFixed(2)}"/><path d="M${cx-r-4} ${cy}h${2*r+8} M${cx} ${cy-r-4}v${2*r+8}" stroke="#fff9db" stroke-width="2" opacity="${(.12+glow*.57).toFixed(2)}"/>`}).join('');
    }else if(motion.profile==='warm'){
      effect+=`<ellipse cx="${Math.round(spec.width*.83)}" cy="${Math.round(spec.height*.2)}" rx="${58+breath*15}" ry="${30+breath*9}" fill="#ffe6a0" opacity="${(.08+breath*.14).toFixed(3)}"/>`;
      effect+=[[.83,.18],[.91,.29],[.74,.13],[.12,.82]].map(([px,py],index)=>{const pulse=Math.max(0,Math.sin(phase-index*1.4)),x=Math.round(px*spec.width),y=Math.round(py*spec.height),r=5+9*pulse;return `<path d="M${x} ${y-r} L${x+3+3*pulse} ${y} L${x} ${y+r} L${x-3-3*pulse} ${y} Z" fill="#fff7d2" opacity="${(.15+.72*pulse).toFixed(2)}"/>`}).join('');
    }else{
      effect+=[[.11,.16],[.17,.2],[.84,.14],[.89,.19],[.13,.79],[.85,.82]].map(([px,py],index)=>{const dx=Math.sin(phase+index)*9,dy=Math.cos(phase+index)*5,x=Math.round(px*spec.width+dx),y=Math.round(py*spec.height+dy),angle=Math.round(Math.sin(phase+index)*14);return `<path d="M${x} ${y} q8 -10 19 -2 q-8 10 -19 2" fill="#d9eac8" stroke="#4e765c" stroke-width="1.5" opacity=".78" transform="rotate(${angle} ${x} ${y})"/>`}).join('');
    }
    const overlay=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${spec.width}" height="${spec.height}">${effect}</svg>`);
    frames.push(await sharp(base).composite([{input:overlay}]).png().toBuffer());
  }
  return sharp(frames,{join:{animated:true}}).gif({colours:256,effort:8,dither:.8,interFrameMaxError:0,delay:frames.map(()=>100),loop:0}).toBuffer();
}

async function renderAdGifFromReference(reference,spec,draft={},referenceDraft={}){
  const zoom=Math.max(1,Math.min(2.5,(Number(draft.zoom)||1)/(Number(referenceDraft.zoom)||1)));
  const meta=await sharp(reference,{animated:true}).metadata();
  if(meta.width!==spec.width||meta.pageHeight!==spec.height)throw invalid('动效参考尺寸与当前资源位不符');
  const offsetX=(Number(draft.offsetX)||0)-(Number(referenceDraft.offsetX)||0),offsetY=(Number(draft.offsetY)||0)-(Number(referenceDraft.offsetY)||0);
  if(zoom===1&&offsetX===0&&offsetY===0)return reference;
  const cropWidth=Math.max(1,Math.round(spec.width/zoom)),cropHeight=Math.max(1,Math.round(spec.height/zoom));
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
  const left=clamp(Math.round((spec.width-cropWidth)/2-offsetX*spec.width/zoom),0,spec.width-cropWidth);
  const top=clamp(Math.round((spec.height-cropHeight)/2-offsetY*spec.height/zoom),0,spec.height-cropHeight);
  const frames=[];
  for(let page=0;page<meta.pages;page++)frames.push(await sharp(reference,{page}).extract({left,top,width:cropWidth,height:cropHeight}).resize(spec.width,spec.height).png().toBuffer());
  for(const error of [6,10,16]){
    const output=await sharp(frames,{join:{animated:true}}).gif({colours:128,effort:10,dither:.2,interFrameMaxError:error,delay:meta.delay||frames.map(()=>420),loop:0}).toBuffer();
    if(!spec.maxBytes||output.length<spec.maxBytes)return output;
  }
  throw invalid(`调整后的动图超过 ${spec.limitRaw}，请降低画面缩放`);
}

async function smartDraft(sourceBuffer,spec){
  const meta=await sharp(sourceBuffer).metadata();
  const scale=Math.max(spec.width/meta.width,spec.height/meta.height);
  const width=meta.width*scale,height=meta.height*scale;
  const {info}=await sharp(sourceBuffer).resize(spec.width,spec.height,{fit:'cover',position:sharp.strategy.attention}).toBuffer({resolveWithObject:true});
  const offsetX=((info.cropOffsetLeft??(spec.width-width)/2)-(spec.width-width)/2)/spec.width;
  const offsetY=((info.cropOffsetTop??(spec.height-height)/2)-(spec.height-height)/2)/spec.height;
  return {zoom:1,offsetX:Math.max(-1,Math.min(1,offsetX)),offsetY:Math.max(-1,Math.min(1,offsetY))};
}

export async function renderAdJpg(sourceBuffer,spec,draft={},logoBuffer=null){
  if(spec.format!=='JPG')throw invalid('此资源位不需要 JPG');
  const meta=await sharp(sourceBuffer).metadata();
  if(!meta.width||!meta.height)throw invalid('主视觉素材无效');
  const zoom=Math.max(1,Math.min(2.5,Number(draft.zoom)||1));
  const scale=Math.max(spec.width/meta.width,spec.height/meta.height)*zoom;
  const width=Math.max(spec.width,Math.ceil(meta.width*scale)),height=Math.max(spec.height,Math.ceil(meta.height*scale));
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
  const left=clamp(Math.round((spec.width-width)/2+(Number(draft.offsetX)||0)*spec.width),spec.width-width,0);
  const top=clamp(Math.round((spec.height-height)/2+(Number(draft.offsetY)||0)*spec.height),spec.height-height,0);
  let image=sharp(sourceBuffer).resize(width,height).extract({left:-left,top:-top,width:spec.width,height:spec.height}).flatten({background:'#ffffff'});
  if(logoBuffer){
    const logoMeta=await sharp(logoBuffer).metadata();
    const {width:logoWidth,height:logoHeight,left:logoLeft,top:logoTop}=adLogoGeometry(spec,logoMeta,draft);
    const resizedLogo=await sharp(logoBuffer).resize(logoWidth,logoHeight).png().toBuffer();
    image=image.composite([{input:resizedLogo,left:logoLeft,top:logoTop}]);
  }
  const pixels=await image.png().toBuffer();
  if(spec.jpegProfile==='detail-first-v1')return encodeDetailAdJpeg(pixels,spec);
  for(let quality=94;quality>=44;quality-=5){
    const candidate=await sharp(pixels).jpeg({quality,mozjpeg:true}).toBuffer();
    if(!spec.maxBytes||candidate.length<spec.maxBytes)return candidate;
  }
  throw invalid(`当前画面无法满足 ${spec.limitRaw} 的体积限制，请检查画面后调整`);
}

export async function createAdResourcesHandler({root,runtimeDir,storageDir,catalogProvider,nanoGenerate=generateAdNanoLayout,psdExtractor,videoGenerate=generateAdKlingVideo,videoToGif=convertAdVideoToGif,aiEditGenerate,outputPolicyProvider=()=>readAdOutputPolicy(root),taskName=(key,fallback)=>fallback,projectLogos=createProjectLogoLibrary({runtimeDir,storageDir}),recycleBin}){
  recycleBin ||= await (await import("./recycle-bin.mjs")).getRecycleBin({runtimeDir,storageDir});
  const exportName=(batch,spec)=>outputFileName({...batch,project:taskName(`ad-resources:${batch.id}`,batch.project)},spec);
  const publicBatch=(batch,sheet)=>{const project=taskName(`ad-resources:${batch.id}`,batch.project);if(project===batch.project)return batch;return {...batch,project,items:Object.fromEntries(Object.entries(batch.items||{}).map(([id,item])=>{const spec=sheet.specs.find(spec=>spec.id===id)||batch.retiredSpecs?.find(spec=>spec.id===id);return [id,{...item,versions:(item.versions||[]).map(version=>spec?{...version,name:exportName(batch,spec)}:version)}]}))};};
  const workbook=path.join(root,'02 规范与模板','投放','资源位规范','投放资源位尺寸表.xlsx');
  const config=path.join(root,'config','ad-resources-v1.json');
  const jobsFile=path.join(runtimeDir,'ad-resources-jobs.json');
  let batches=[];try{batches=JSON.parse(await fs.readFile(jobsFile,'utf8'))}catch(error){if(error.code!=='ENOENT')throw error}
  let pendingSave=Promise.resolve();
  const save=()=>{pendingSave=writeJson(jobsFile,batches);return pendingSave;};
  const creationRequests=new Map(),uploadRequests=new Map(),automaticJobs=new Map();
  const createBatch=async input=>{
    const project=String(input.project||'').trim(),projectId=input.projectId??'',projectLogoId=input.projectLogoId===undefined?'default':input.projectLogoId,requestId=input.requestId;
    if(!project||project.length>100)throw invalid('请填写 100 字以内的素材名称 / 任务名称');
    if(typeof projectId!=='string')throw invalid('所属项目无效，请重新选择');
    if(projectLogoId!==null&&typeof projectLogoId!=='string')throw invalid('项目 Logo 选择无效');
    if(requestId!==undefined&&(typeof requestId!=='string'||!/^[a-zA-Z0-9-]{8,80}$/.test(requestId)))throw invalid('任务创建编号无效');
    if(input.sourceIdentity!==undefined&&(typeof input.sourceIdentity!=='string'||input.sourceIdentity.length>1000))throw invalid('主视觉文件标识无效');
    const signature=createHash('sha256').update(JSON.stringify({project,projectId,projectLogoId,sourceIdentity:input.sourceIdentity||''})).digest('hex');
    if(requestId){
      const existing=batches.find(b=>b.creation?.requestId===requestId);if(existing){if(existing.creation.signature!==signature)throw invalid('任务创建内容已变化，请重新提交',409);return {batch:existing,reused:true};}
      const pending=creationRequests.get(requestId);if(pending){if(pending.signature!==signature)throw invalid('任务创建内容已变化',409);return pending.operation;}
    }
    const operation=(async()=>{
      if(projectId&&!(await selectableProjects()).some(entry=>entry.id===projectId))throw invalid('所选项目不存在或已归档，请重新选择');
      const sheet=await getCatalog(),batch={id:randomUUID(),project,...(projectId?{projectId}:{}),sourceSha256:sheet.sourceSha256,createdAt:new Date().toISOString(),assets:[],items:{},...(requestId?{creation:{requestId,signature}}:{})};
      const policy=await outputPolicyProvider();if(policy)batch.outputPolicy=structuredClone(policy);
      const logo=await projectLogos.copyToTask({projectId,logoId:projectLogoId,folder:`ad-resources-${batch.id}`,bucket:'asset'});
      if(logo){batch.assets.push(logo);batch.activeLogoAssetId=logo.id;batch.projectLogo=logo;}
      batches.unshift(batch);try{await save();}catch(error){batches.splice(batches.indexOf(batch),1);if(logo?.file)await fs.rm(safeChild(storageDir,`ad-resources-${batch.id}`,'asset',logo.file),{force:true});throw error;}
      return {batch};
    })();
    if(requestId)creationRequests.set(requestId,{signature,operation});
    try{return await operation;}finally{if(requestId)creationRequests.delete(requestId);}
  };
  const selectableProjects=()=>projectLogos.projects();
  const assetBuffer=async(batch,asset)=>fs.readFile(safeChild(storageDir,`ad-resources-${batch.id}`,'asset',asset.url.split('/').at(-1)));
  const prepareDraftForSpec=async(batch,spec,input)=>{
    const draft={...input};let source=batch.assets.find(asset=>asset.id===draft.sourceAssetId&&asset.role==='visual');
    if(spec.logo==='forbidden')draft.logoAssetId='';
    if(!source)throw invalid('请先添加源图');
    if(spec.safeInsetX&&source.safeSourceAssetId&&source.safeMethod!==safeLayoutMethod){
      const seen=new Set();
      while(source.safeSourceAssetId){
        if(seen.has(source.id))throw invalid('保护区源图关联存在循环');seen.add(source.id);
        source=batch.assets.find(asset=>asset.id===source.safeSourceAssetId&&asset.role==='visual');
        if(!source)throw invalid('原始主视觉不存在，请重新选择源图');
      }
      draft.sourceAssetId=source.id;
    }
    if(embeddedLogo(source)){
      const clean=batch.assets.find(asset=>asset.derivedFrom===source.id&&asset.logoFree);
      if(clean){source=clean;draft.sourceAssetId=clean.id}
      else if(spec.logo==='required')draft.logoAssetId='';
    }
    if(spec.logo==='forbidden'&&!source.logoFree&&(source.sourceFormat==='PSD'||embeddedLogo(source)))
      throw invalid('此尺寸要求无 Logo，但当前源图未分离出纯图；请上传无 Logo 源图或带独立 Logo 图层的 PSD');
    if(spec.logo==='required'&&!embeddedLogo(source)&&!draft.logoAssetId){
      const logo=batch.assets.find(asset=>asset.id===batch.activeLogoAssetId&&asset.role==='logo')||batch.assets.find(asset=>asset.role==='logo'&&(asset.derivedFrom===source.derivedFrom||!asset.derivedFrom));
      if(logo)draft.logoAssetId=logo.id;
    }
    if(spec.logo==='required'&&!embeddedLogo(source)&&batch.activeLogoAssetId)draft.logoAssetId=batch.activeLogoAssetId;
    // This flattened menu has no individual PSD item layers. Reuse its exact
    // name-and-illustration pairs in a portrait grid instead of extending an
    // empty room around a shrunken landscape board.
    if(batch.project?.includes('葱花饼')&&source.logoFree&&source.width===1280&&source.height===720&&spec.height/spec.width>1.2){
      const targetRatio=(spec.width/spec.height).toFixed(5);
      let layout=batch.assets.find(asset=>asset.role==='visual'&&asset.portraitSourceAssetId===source.id&&asset.portraitRatio===targetRatio&&asset.portraitMethod===portraitMenuMethod);
      if(!layout){
        const folder=`ad-resources-${batch.id}`,file=`visual-portrait-${randomUUID()}.png`;
        await fs.writeFile(safeChild(storageDir,folder,'asset',file),await reflowPortraitMenu(await assetBuffer(batch,source)));
        layout={id:randomUUID(),role:'visual',name:`${source.name.replace(/\.[^.]+$/,'')}_竖版重排_1080x1920.png`,width:1080,height:1920,url:`/storage/${folder}/asset/${file}`,sourceFormat:'Layout',logoFree:true,portraitSourceAssetId:source.id,portraitRatio:targetRatio,portraitMethod:portraitMenuMethod};
        batch.assets.push(layout);await save();
      }
      source=layout;draft.sourceAssetId=layout.id;draft.zoom=1;draft.offsetX=0;draft.offsetY=0;
      if(spec.logo==='required')Object.assign(draft,defaultAdLogoPlacement(null,spec));
    }
    if(spec.safeInsetX&&!source.safeSourceAssetId&&!(source.aiSpecId===spec.id&&source.width===spec.width&&source.height===spec.height)&&source.width/source.height>(spec.width-2*spec.safeInsetX)/spec.height*1.04){
      // A reviewed correction supersedes earlier layouts for the same source.
      let layout=batch.assets.findLast(asset=>asset.role==='visual'&&asset.safeSourceAssetId===source.id&&asset.safeInsetX===spec.safeInsetX&&asset.safeWidth===spec.width&&asset.safeHeight===spec.height&&asset.safeMethod===safeLayoutMethod);
      if(!layout){
        const folder=`ad-resources-${batch.id}`,file=`visual-safe-${randomUUID()}.png`;
        let buffer=await reframeAdSafeLayout(await assetBuffer(batch,source),spec,{generate:input=>nanoGenerate({...input,root,sourceName:batch.project||source.name,idempotencySeed:`${batch.id}:${source.id}:${safeLayoutMethod}`})});
        const sourceHasLogo=embeddedLogo(source);
        layout={id:randomUUID(),role:'visual',name:`${source.name.replace(/\.[^.]+$/,'')}_保护区重排_${spec.width}x${spec.height}.png`,width:spec.width,height:spec.height,url:`/storage/${folder}/asset/${file}`,sourceFormat:'Layout',logoFree:Boolean(source.logoFree&&!sourceHasLogo),hasEmbeddedLogo:sourceHasLogo,safeSourceAssetId:source.id,safeInsetX:spec.safeInsetX,safeWidth:spec.width,safeHeight:spec.height,safeMethod:safeLayoutMethod};
        const typography=await renderAdSafeTypography({batch,source:layout,spec,draft:{zoom:1},storageDir,assetBuffer,sourceBuffer:buffer});
        if(typography){buffer=typography.buffer;layout.safeTypography=typography.assessment;}
        await fs.writeFile(safeChild(storageDir,folder,'asset',file),buffer);
        batch.assets.push(layout);await save();
      }
      source=layout;draft.sourceAssetId=layout.id;draft.zoom=1;draft.offsetX=0;draft.offsetY=0;
    }
    if(needsNanoLayout(source.width,source.height,spec.width,spec.height)){
      const targetRatio=(spec.width/spec.height).toFixed(5);
      // A reviewed correction supersedes an older generated layout, while the
      // original asset and its historical candidates stay available.
      let layout=batch.assets.findLast(asset=>asset.role==='visual'&&asset.nanoSourceAssetId===source.id&&asset.nanoRatio===targetRatio&&asset.nanoMethod==='recompose-v2');
      if(!layout){
        const buffer=await nanoGenerate({root,sourceBuffer:await assetBuffer(batch,source),targetWidth:spec.width,targetHeight:spec.height,idempotencySeed:`${batch.id}:${source.id}:${targetRatio}`,sourceName:batch.project||source.name,sourceHasLogo:embeddedLogo(source)});
        const meta=await sharp(buffer).metadata();
        if(!meta.width||!meta.height||Math.abs(Math.log((meta.width/meta.height)/(spec.width/spec.height)))>.15)throw invalid('画布 Nano 未返回正确比例的布局稿');
        const folder=`ad-resources-${batch.id}`,file=`visual-nano-${randomUUID()}.png`;
        await fs.writeFile(safeChild(storageDir,folder,'asset',file),await sharp(buffer).png().toBuffer());
        const sourceHasLogo=embeddedLogo(source);
        layout={id:randomUUID(),role:'visual',name:`${source.name.replace(/\.[^.]+$/,'')}_Nano_${spec.width}x${spec.height}.png`,width:meta.width,height:meta.height,url:`/storage/${folder}/asset/${file}`,sourceFormat:'Nano',logoFree:Boolean(source.logoFree&&!sourceHasLogo),hasEmbeddedLogo:sourceHasLogo,nanoSourceAssetId:source.id,nanoRatio:targetRatio,nanoMethod:'recompose-v2',nanoTextPolicy:'source-copy-only-v1',nanoCompositionPolicy:'preserve-visible-instances-v1'};
        batch.assets.push(layout);await save();
      }
      source=layout;draft.sourceAssetId=layout.id;
    }
    return draft;
  };
  const prepareVersionForItem=async(batch,spec,buffer,input={})=>{
    spec=adSpecWithOutputPolicy(spec,batch.outputPolicy);
    const item=itemState(batch,spec.id),check=await validateAdCandidate(spec,buffer),number=nextAdVersion(item),ext=spec.format==='GIF'?'gif':'jpg';
    const file=`${spec.id}-${randomUUID()}.${ext}`,folder=`ad-resources-${batch.id}`,target=safeChild(storageDir,folder,'candidate',file);
    await fs.mkdir(path.dirname(target),{recursive:true});
    const referenceOnly=input.referenceOnly===true&&spec.format==='JPG',thumbnailStorageName=referenceOnly?file.replace(/\.jpg$/,'.thumb.jpg'):null;
    if(referenceOnly)await sharp(buffer).resize({width:360,height:240,fit:'inside',withoutEnlargement:true}).jpeg({quality:75}).toFile(safeChild(storageDir,folder,'candidate',thumbnailStorageName));
    else await fs.writeFile(target,buffer);
    const version={number,name:exportName(batch,spec),storageName:file,url:`/storage/${folder}/candidate/${encodeURIComponent(file)}`,...check,createdAt:new Date().toISOString(),
      review:{logoChecked:Boolean(input.logoChecked),safeAreaChecked:Boolean(input.safeAreaChecked),contentChecked:Boolean(input.contentChecked),note:String(input.note||'').slice(0,500)},...(spec.format==='GIF'&&input.motion?{motion:input.motion}:{})};
    if(input.aiEdit)version.aiEdit=input.aiEdit;
    if(Number.isInteger(input.restoredFromVersion))version.restoredFromVersion=input.restoredFromVersion;
    if(referenceOnly){delete version.storageName;Object.assign(version,{kind:'composition',draftSnapshot:structuredClone(input.compositionDraft||item.draft),thumbnailStorageName,thumbnailUrl:`/storage/${folder}/candidate/${thumbnailStorageName}`,url:`/api/ad-resources/batches/${batch.id}/items/${spec.id}/versions/${number}/image`});}
    return version;
  };
  const saveVersionForItem=async(batch,spec,buffer,input={})=>{
    const version=await prepareVersionForItem(batch,spec,buffer,input);
    try{input.beforeCommit?.(version)}catch(error){await discardPreparedVersion(batch,version);throw error}
    const item=itemState(batch,spec.id);item.versions.push(version);markAdVersionSaved(item,version);await save();return version;
  };
  const discardPreparedVersion=async(batch,version)=>{
    for(const file of [version.thumbnailStorageName,version.storageName].filter(Boolean))await fs.rm(safeChild(storageDir,`ad-resources-${batch.id}`,'candidate',file),{force:true});
  };
  const saveVersionGroup=async(batch,entries,{beforeCommit}={})=>{
    const versions=[];
    // Finish every render and size/byte check before publishing any member.
    try{for(const entry of entries)versions.push(await prepareVersionForItem(batch,entry.spec,entry.buffer,entry.input));beforeCommit?.(versions)}
    catch(error){await Promise.all(versions.map(version=>discardPreparedVersion(batch,version)));throw error}
    entries.forEach((entry,index)=>{const item=itemState(batch,entry.spec.id);item.versions.push(versions[index]);markAdVersionSaved(item,versions[index]);});
    await save();return versions;
  };
  const renderForSpec=async(batch,spec,draft)=>{
    spec=adSpecWithOutputPolicy(spec,batch.outputPolicy);
    const source=batch.assets.find(asset=>asset.id===draft.sourceAssetId&&asset.role==='visual');
    if(!source)throw invalid('请先添加源图');
    if(spec.logo==='forbidden'&&!source.logoFree&&(source.sourceFormat==='PSD'||embeddedLogo(source)))throw invalid('此尺寸要求无 Logo，请选择从 PSD 提取的纯图或上传无 Logo 源图');
    const sourceData=await assetBuffer(batch,source);
    if(spec.format==='GIF'){
      const reference=itemState(batch,spec.id).motionReference;
      if(reference?.sourceAssetId===draft.sourceAssetId){
        const buffer=await fs.readFile(safeChild(storageDir,`ad-resources-${batch.id}`,'candidate',reference.storageName));
        return renderAdGifFromReference(buffer,spec,draft,reference.draft);
      }
      throw invalid('此动图需要由微光画布可灵 V3 生成，请等待动效任务完成');
    }
    const logo=spec.logo==='required'&&!embeddedLogo(source)?batch.assets.find(asset=>asset.id===draft.logoAssetId&&asset.role==='logo'):null;
    return renderAdJpg(sourceData,spec,draft,logo?await assetBuffer(batch,logo):null);
  };
  const preparingDownloads=new Map();
  const versionLifecycle=createAdVersionLifecycle({storageDir,batches,save,renderForSpec,saveVersion:saveVersionForItem,assertFree:item=>aiEdits.assertFree(item)});
  const draftSync=createAdDraftSync({save,assertFree:item=>aiEdits.assertFree(item),embeddedLogo,state:versionLifecycle.state});
  const prepareDownload=async(batch,sheet)=>{
    if(preparingDownloads.has(batch.id))return preparingDownloads.get(batch.id);
    const operation=(async()=>{
      if(batch.sourceSha256!==sheet.sourceSha256)throw invalid('尺寸表已有更新，请先核对当前任务规范',409);
      const created=[],blocked=[];
      for(const spec of sheet.specs){
        const item=itemState(batch,spec.id);let latest=item.versions.at(-1);
        const block=reason=>blocked.push({specId:spec.id,label:`${spec.number}.${spec.name} ${spec.width}×${spec.height}`,reason});
        if(isAdAiEditLocked(item.aiEditJob)){block('AI 修改尚未完成，请先确认修改结果');continue;}
        if(item.aiEditJob?.status==='awaiting_review'){block('AI 候选尚未采用，请先采用或放弃');continue;}
        if(spec.format==='JPG'&&item.draftDirty){try{await versionLifecycle.snapshot(batch,spec,item);latest=item.versions.at(-1);created.push(spec.id);}catch(error){block(error.message);continue;}}
        if(latest?.invalidatedReason){block(latest.invalidatedReason);continue;}
        if(latest)continue;
        if(spec.format!=='JPG'){block('请先完成可灵动效制作');continue;}
        try{
          // Migration seeds a usable composition but deliberately keeps versions
          // separate. Materialize that exact draft; never rerun AI at download.
          const draft=structuredClone(item.draft || {});
          let source=batch.assets.find(a=>a.id===draft.sourceAssetId&&a.role==='visual');
          if(!source){
            const visuals=batch.assets.filter(a=>a.role==='visual');
            source=preferredVisual(spec,visuals,Boolean(batch.assets.some(a=>a.role==='logo')));
            if(source)draft.sourceAssetId=source.id;
          }
          if(!source){block('请先添加源图');continue;}
          if(needsNanoLayout(source.width,source.height,spec.width,spec.height)){block('当前源图还需适配此比例，请先完成画面制作');continue;}
          if(spec.safeInsetX && !(source.width===spec.width&&source.height===spec.height) && !(source.safeWidth===spec.width&&source.safeHeight===spec.height)){block('请先完成此尺寸的保护区适配');continue;}
          if(spec.logo==='forbidden')draft.logoAssetId='';
          if(spec.logo==='required'&&!embeddedLogo(source)){
            const logo=batch.assets.find(a=>a.id===(batch.activeLogoAssetId||draft.logoAssetId)&&a.role==='logo')||batch.assets.find(a=>a.role==='logo');
            if(!logo){block('请先添加独立 Logo');continue;}
            draft.logoAssetId=logo.id;
          }
          const originalDraft=JSON.stringify(item.draft),buffer=await renderForSpec(batch,spec,draft);
          if(item.versions.length)continue;
          if(JSON.stringify(item.draft)!==originalDraft || isAdAiEditLocked(item.aiEditJob)){block('制作参数已变化，请重新点击成套下载');continue;}
          item.draft=draft;await saveVersionForItem(batch,spec,buffer);
          item.autoError='';created.push(spec.id);
        }catch(error){block(error.message);}
      }
      if(created.length)await save();
      return {created,blocked,ready:blocked.length===0};
    })();
    preparingDownloads.set(batch.id,operation);
    try{return await operation;}finally{if(preparingDownloads.get(batch.id)===operation)preparingDownloads.delete(batch.id);}
  };
  const applyWorkingDraft=async(batch,spec,draft)=>draftSync.apply(batch,spec,(await getCatalog(batch)).specs,draft);
  const aiEdits=createAdAiEditJobs({root,storageDir,batches,save,getCatalog,assetBuffer,renderJpg:renderAdJpg,renderForSpec,saveVersion:saveVersionForItem,embeddedLogo,applyWorkingDraft,generate:aiEditGenerate});
  const aiGroupEdits=createAdAiGroupJobs({root,storageDir,batches,save,getCatalog,assetBuffer,renderJpg:renderAdJpg,renderForSpec,saveVersions:saveVersionGroup,embeddedLogo,applyWorkingDraft,generate:aiEditGenerate});
  const aiReferences=createAdAiReferences({storageDir,batches,save,assertFree:item=>aiEdits.assertFree(item)});
  const runningMotionJobs=new Map();
  const runningMotionStates=new Set(['queued','preparing','submitting','submitted','processing','downloading','encoding']);
  const motionDraftKey=draft=>({sourceAssetId:draft.sourceAssetId||'',zoom:Number(draft.zoom)||1,offsetX:Number(draft.offsetX)||0,offsetY:Number(draft.offsetY)||0});
  const motionRequestKey=(batch,spec,draft)=>createHash('sha256').update(JSON.stringify({method:AD_MOTION_METHOD,batchId:batch.id,specId:spec.id,width:spec.width,height:spec.height,...motionDraftKey(draft)})).digest('hex');
  const publicMotionJob=job=>job?Object.fromEntries(Object.entries(job).filter(([key])=>!['draft','reviewInput'].includes(key))):null;
  const startMotionJob=(batch,spec,job)=>{
    if(runningMotionJobs.has(job.id))return runningMotionJobs.get(job.id);
    const operation=(async()=>{
      const item=itemState(batch,spec.id);
      const isCurrent=()=>batches.includes(batch)&&item.motionJob?.id===job.id;
      const update=async value=>{if(!isCurrent())throw invalid('动效任务已被替换或删除',409);Object.assign(job,value,{updatedAt:new Date().toISOString()});await save()};
      try{
        item.autoError='';
        await update({status:'preparing',error:'',errorCode:''});
        const source=batch.assets.find(asset=>asset.id===job.draft.sourceAssetId&&asset.role==='visual');
        if(!source)throw invalid('动效源图已移除，请重新选择源图');
        // Render the exact selected crop first; Kling animates the delivered canvas,
        // rather than an unrelated un-cropped original with later overlay effects.
        const sourceData=await assetBuffer(batch,source);
        const workDir=safeChild(storageDir,`ad-resources-${batch.id}`,'motion',job.id);
        await fs.mkdir(workDir,{recursive:true});
        let sourceBuffer,overlayBuffer;
        if(job.videoReady&&job.fullFrameLayers){
          // A paid native-layer video must be re-encoded from the exact saved
          // source and overlay. Never overwrite it with the flattened preview.
          sourceBuffer=await fs.readFile(path.join(workDir,'source.png'));
          overlayBuffer=await fs.readFile(path.join(workDir,'typography-overlay.png'));
        }else{
          const native=source.safeSourceAssetId?batch.assets.find(asset=>asset.id===source.safeSourceAssetId):source;
          if(native?.motionSceneUrl&&native?.motionOverlayUrl){
            const layerBuffer=url=>assetBuffer(batch,{url});
            ({sourceBuffer,overlayBuffer}=await reframeAdMotionLayers({sceneBuffer:await layerBuffer(native.motionSceneUrl),overlayBuffer:await layerBuffer(native.motionOverlayUrl),spec,draft:job.draft,safeLayout:Boolean(source.safeSourceAssetId)}));
          }else{
            const still=await renderAdJpg(sourceData,{...spec,format:'JPG',minBytes:0,maxBytes:null},job.draft);
            sourceBuffer=await sharp(still).png().toBuffer();
          }
        }
        if(overlayBuffer)await fs.writeFile(path.join(workDir,'typography-overlay.png'),overlayBuffer);
        await update({fullFrameLayers:Boolean(overlayBuffer)});
        await fs.writeFile(path.join(workDir,'source.png'),sourceBuffer);
        const scenePlan=job.scenePlan?.mode===AD_DEFAULT_MOTION_STYLE?job.scenePlan:selectAdMotionPlan(`${batch.project||''} ${source.name||''}`);
        await update({scenePlan});
        const video=await generateAdKlingMotion({root,sourceBuffer,workDir,idempotencySeed:job.generationSeed||`${batch.id}:${spec.id}:${job.id}`,sourceName:`${batch.project||''} ${source.name||''}`.trim(),motionBrief:job.motionBrief,videoGenerate,onStatus:async receipt=>{
          await update({status:receipt.status==='completed'?'encoding':receipt.status,...(receipt.jobId?{providerJobId:receipt.jobId}:{}),...(Number.isFinite(receipt.progress)?{progress:receipt.progress}:{}),error:receipt.error||''});
        }});
        await update({status:'encoding',videoReady:true});
        await update({motionStyle:AD_DEFAULT_MOTION_STYLE,renderRevision:AD_MOTION_RENDER_REVISION});
        const encoded=await videoToGif({root,videoBuffer:video.buffer,sourceBuffer,overlayBuffer,spec,draft:job.draft,workDir,motionOptions:{scenePlan,playbackRate:scenePlan.playbackRate||1,...job.motionOptions,mode:AD_DEFAULT_MOTION_STYLE}});
        const buffer=Buffer.isBuffer(encoded)?encoded:encoded?.buffer;
        if(!Buffer.isBuffer(buffer))throw invalid('可灵视频未能转换为有效 GIF');
        const gifTiming=await sharp(buffer,{animated:true}).metadata();
        if(gifTiming.pages!==10||gifTiming.delay?.length!==10||gifTiming.delay.some(delay=>delay!==100)||gifTiming.loop!==0)throw Object.assign(invalid('动效必须为10帧、每帧100毫秒、1秒无限循环；视频已保留供重试转换'),{code:'AD_MOTION_QC'});
        if(!isCurrent())return;
        const motion={...(encoded?.motion||{}),scenePlan,renderMethod:encoded?.motion?.method||null,renderRevision:AD_MOTION_RENDER_REVISION,model:AD_MOTION_MODEL,method:AD_MOTION_METHOD,jobId:job.id,providerJobId:video.receipt.jobId||null,sourceAssetId:source.id,sourceHash:video.receipt.sourceHash};
        // Recover a saved version after a crash between candidate commit and final status.
        let version=item.versions.find(entry=>entry.motion?.jobId===job.id&&entry.motion.renderRevision===AD_MOTION_RENDER_REVISION);
        if(!version)version=await saveVersionForItem(batch,spec,buffer,{...job.reviewInput,motion});
        item.motionReference={storageName:version.storageName,sourceAssetId:source.id,draft:motionDraftKey(job.draft),model:AD_MOTION_MODEL,method:AD_MOTION_METHOD,jobId:job.id};
        item.autoError='';item.autoWarning='';
        await update({status:'completed',versionNumber:version.number,completedAt:new Date().toISOString(),progress:100,error:''});
      }catch(error){
        if(batches.includes(batch)&&item.motionJob?.id===job.id){
          const message=String(error.message||error).slice(0,500);
          Object.assign(job,{status:error.motionStatus||'failed',error:message,errorCode:error.code||'',updatedAt:new Date().toISOString()});
          item.autoError=message;await save();
        }
      }
    })();
    runningMotionJobs.set(job.id,operation);
    operation.finally(()=>{if(runningMotionJobs.get(job.id)===operation)runningMotionJobs.delete(job.id)}).catch(()=>{});
    return operation;
  };
  const requestMotionForSpec=async(batch,spec,draft,input={})=>{
    const item=itemState(batch,spec.id),requestKey=motionRequestKey(batch,spec,draft),previous=item.motionJob;
    if(previous&&runningMotionStates.has(previous.status)){
      if(previous.requestKey!==requestKey)throw invalid('可灵动效正在生成，请等待完成后再更换画面',409);
      startMotionJob(batch,spec,previous);return {pending:true,motionJob:publicMotionJob(previous)};
    }
    if(previous?.requestKey===requestKey&&previous.status==='result_uncertain'){
      if(previous.providerJobId){
        const settling=runningMotionJobs.get(previous.id);if(settling)await settling;
        startMotionJob(batch,spec,previous);return {pending:true,motionJob:publicMotionJob(previous)};
      }
      return {pending:false,motionJob:publicMotionJob(previous)};
    }
    if(previous?.requestKey===requestKey&&previous.status==='completed'&&previous.videoReady&&input.reencode===true&&input.regenerate!==true){
      const settling=runningMotionJobs.get(previous.id);if(settling)await settling;
      startMotionJob(batch,spec,previous);return {pending:true,motionJob:publicMotionJob(previous)};
    }
    if(previous?.requestKey===requestKey&&['failed','cancelled'].includes(previous.status)){
      if(previous.videoReady&&input.retry===true&&input.regenerate!==true){
        const settling=runningMotionJobs.get(previous.id);if(settling)await settling;
        startMotionJob(batch,spec,previous);return {pending:true,motionJob:publicMotionJob(previous)};
      }
      if(input.retry!==true&&!(previous.videoReady&&input.regenerate===true))return {pending:false,motionJob:publicMotionJob(previous)};
    }
    item.draft=draft;
    const reference=item.motionReference;
    if(reference?.sourceAssetId===draft.sourceAssetId&&input.regenerate!==true&&input.retry!==true){
      const sameDraft=JSON.stringify(motionDraftKey(reference.draft||{sourceAssetId:reference.sourceAssetId}))===JSON.stringify(motionDraftKey(draft));
      const prior=item.versions.find(entry=>entry.storageName===reference.storageName);
      const version=sameDraft&&prior?prior:await saveVersionForItem(batch,spec,await renderForSpec(batch,spec,draft),{...input,motion:prior?.motion});
      return {version,motionJob:publicMotionJob(previous)};
    }
    if(previous?.requestKey===requestKey&&previous.status==='completed'&&input.regenerate!==true){
      const version=item.versions.find(entry=>entry.number===previous.versionNumber);
      if(version)return {version,motionJob:publicMotionJob(previous)};
    }
    const reviewed=item.motionPlan?.scenePlan?.mode===AD_DEFAULT_MOTION_STYLE&&item.motionPlan?.sourceAssetId===draft.sourceAssetId&&JSON.stringify(item.motionPlan.draft)===JSON.stringify(motionDraftKey(draft))?item.motionPlan:null;
    const job={id:randomUUID(),requestKey,attempt:(previous?.attempt||0)+1,status:'queued',model:AD_MOTION_MODEL,method:AD_MOTION_METHOD,motionStyle:AD_DEFAULT_MOTION_STYLE,...(reviewed?{scenePlan:reviewed.scenePlan,motionBrief:reviewed.motionBrief,motionOptions:reviewed.motionOptions}:{}),sourceAssetId:draft.sourceAssetId,draft:motionDraftKey(draft),reviewInput:{logoChecked:Boolean(input.logoChecked),safeAreaChecked:Boolean(input.safeAreaChecked),contentChecked:Boolean(input.contentChecked),note:String(input.note||'').slice(0,500)},createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),error:''};
    item.motionJob=job;item.draft=draft;item.autoError='';await save();
    startMotionJob(batch,spec,job);return {pending:true,motionJob:publicMotionJob(job)};
  };
  const applyLogoToBatch=async(batch,logoAssetId)=>{
    if(!batch.assets.some(asset=>asset.id===logoAssetId&&asset.role==='logo'))throw invalid('Logo 不属于当前任务');
    const sheet=await getCatalog(batch);
    if(batch.sourceSha256!==sheet.sourceSha256)throw invalid('尺寸表已更新，请先核对新要求');
    for(const spec of sheet.specs.filter(entry=>entry.logo==='required'))aiEdits.assertFree(batch.items?.[spec.id]);
    const previousLogoAssetId=batch.activeLogoAssetId,staged=[],skipped=[];
    batch.activeLogoAssetId=logoAssetId;
    try{
      for(const spec of sheet.specs.filter(entry=>entry.logo==='required')){
        const item=itemState(batch,spec.id);
        if(!item.draft.sourceAssetId)continue;
        const draft=await prepareDraftForSpec(batch,spec,{...item.draft,logoAssetId});
        const source=batch.assets.find(asset=>asset.id===draft.sourceAssetId);
        if(embeddedLogo(source)){skipped.push(spec.id);continue}
        const buffer=await renderForSpec(batch,spec,draft);
        await validateAdCandidate(spec,buffer);
        staged.push({spec,item,draft,buffer});
      }
    }catch(error){batch.activeLogoAssetId=previousLogoAssetId;throw error}
    for(const {spec,item,draft,buffer} of staged){
      if(spec.format==='JPG')updateAdWorkingDraft(item,draft);
      else{item.draft=draft;await saveVersionForItem(batch,spec,buffer);}
      item.autoError='';item.autoWarning='';
    }
    for(const specId of skipped){const item=itemState(batch,specId);item.autoWarning='当前源图已合入 Logo，工作台未叠加上传的 Logo；请换成无 Logo 主视觉后再替换。'}
    await save();
    return {updated:staged.map(entry=>entry.spec.id),skipped,logoAssetId};
  };
  // Large layered documents are extracted one at a time; uploads themselves stay
  // streamed to disk while waiting and never occupy a 500 MB Node buffer.
  let psdQueue=Promise.resolve();
  const extractPsd=async paths=>{
    const extraction=psdQueue.then(async()=>{
      if(psdExtractor)return psdExtractor(paths);
      const python=process.env.CHANNEL_PYTHON||path.join(root,'local-ai','.venv','Scripts','python.exe');
      try{
        const {stdout}=await localPython([path.join(root,'scripts','flatten-ad-psd.py'),paths.original,paths.target,paths.cleanTarget,paths.logoTarget,paths.motionSceneTarget,paths.motionOverlayTarget],{windowsHide:true,timeout:300000,maxBuffer:1024*1024,env:{...process.env,PYTHONIOENCODING:'utf-8'}});
        return JSON.parse(stdout);
      }catch(error){throw invalid(`PSD 预览导出失败：${String(error.stderr||error.message).slice(0,300)}`)}
    });
    psdQueue=extraction.catch(()=>{});
    return extraction;
  };
  const importAssetUpload=async(batch,upload,role,isAborted=()=>false,receipt)=>{
    let prepared=null,committed=false;
    try{
      prepared=await prepareAdAssetUpload(upload,{batchId:batch.id,role,storageDir,extractPsd});
      if(isAborted())throw invalid('素材上传已中断，请重试',400);
      if(!batches.includes(batch))throw invalid('投放任务已删除，请重新创建',409);
      await prepared.publish();
      if(!batches.includes(batch))throw invalid('投放任务已删除，请重新创建',409);
      const {asset,derivedAssets,warnings=[]}=prepared;
      batch.assets.push(asset,...derivedAssets);
      if(receipt)(batch.uploadReceipts||=[]).push({...receipt,assetId:asset.id,derivedAssetIds:derivedAssets.map(a=>a.id),warnings});
      const previousLogo=batch.activeLogoAssetId;
      if(!batch.activeLogoAssetId){const firstLogo=derivedAssets.find(entry=>entry.role==='logo');if(firstLogo)batch.activeLogoAssetId=firstLogo.id}
      try{await save()}catch(error){
        const stagedIds=new Set([asset.id,...derivedAssets.map(entry=>entry.id)]);
        batch.assets=batch.assets.filter(entry=>!stagedIds.has(entry.id));batch.activeLogoAssetId=previousLogo;
        if(receipt)batch.uploadReceipts=batch.uploadReceipts.filter(r=>r.requestId!==receipt.requestId);
        throw error;
      }
      committed=true;
      const logoUpdate=role==='logo'?await applyLogoToBatch(batch,asset.id):null;
      return {asset,derivedAssets,warnings,logoUpdate};
    }catch(error){if(prepared&&!committed)await prepared.rollback();throw error}
    finally{await upload.cleanup()}
  };
  const importUploadOnce=async(batch,upload,role,requestId,isAborted)=>{
    if(!requestId)return importAssetUpload(batch,upload,role,isAborted);
    if(!/^[a-zA-Z0-9-]{8,80}$/.test(requestId)){await upload.cleanup();throw invalid('素材导入编号无效');}
    const signature=createHash('sha256').update(JSON.stringify([upload.name,upload.bytes,upload.sha256,role])).digest('hex'),key=`${batch.id}:${requestId}`;
    const pending=uploadRequests.get(key);if(pending){await upload.cleanup();if(pending.signature!==signature)throw invalid('同次导入的文件内容已变化',409);return pending.operation;}
    const previous=batch.uploadReceipts?.find(r=>r.requestId===requestId);
    if(previous){
      await upload.cleanup();if(previous.signature!==signature)throw invalid('同次导入的文件内容已变化',409);
      const asset=batch.assets.find(a=>a.id===previous.assetId);if(!asset)throw invalid('上次导入的素材已移除，请重新选择',409);
      const logoUpdate=role==='logo'?await applyLogoToBatch(batch,asset.id):null;
      return {asset,derivedAssets:(previous.derivedAssetIds||[]).map(id=>batch.assets.find(a=>a.id===id)).filter(Boolean),warnings:previous.warnings||[],logoUpdate,deduplicated:true};
    }
    const operation=importAssetUpload(batch,upload,role,isAborted,{requestId,signature});uploadRequests.set(key,{signature,operation});
    try{return await operation;}finally{uploadRequests.delete(key);}
  };
  let catalog=null,checkedMtime=0,catalogRefresh=null;
  async function getCatalog(batch){
    if(catalogProvider){
      const provided=await catalogProvider();
      if(migrateAdBatchesToCatalog(batches.filter(batch=>!recycleBin.isTaskHidden(`ad-resources:${batch.id}`)),provided).length)await save();
      return adCatalogWithOutputPolicy(provided,batch?.outputPolicy);
    }
    const stat=await fs.stat(workbook);
    if(!catalog||stat.mtimeMs!==checkedMtime){
      if(!catalogRefresh)catalogRefresh=(async()=>{
        // 尺寸表没变时直接用随代码提交的 config/ad-resources-v1.json 和参考图（服务器上没有 Python）；
        // 尺寸表换了，要在开发电脑上运行 scripts/sync-ad-resources.py 重新生成后再打包上传。
        const current=JSON.parse(await fs.readFile(config,'utf8'));
        const workbookSha=createHash('sha256').update(await fs.readFile(workbook)).digest('hex');
        if(current.workbookSha256!==workbookSha){
          const python=process.env.CHANNEL_PYTHON||path.join(root,'local-ai','.venv','Scripts','python.exe');
          try{await run(python,[path.join(root,'scripts','sync-ad-resources.py'),workbook,path.join(runtimeDir,'ad-resources','references')],{env:{...process.env,PYTHONIOENCODING:'utf-8'},windowsHide:true,maxBuffer:1024*1024})}
          catch(error){console.warn(`投放尺寸表已更新但这里不能重新解析，继续使用上次生成的清单：${String(error.stderr||error.message).slice(0,200)}`)}
        }
        catalog=JSON.parse(await fs.readFile(config,'utf8'));checkedMtime=stat.mtimeMs;
        if(migrateAdBatchesToCatalog(batches.filter(batch=>!recycleBin.isTaskHidden(`ad-resources:${batch.id}`)),catalog).length)await save();
      })();
      try{await catalogRefresh}finally{catalogRefresh=null}
    }
    return adCatalogWithOutputPolicy(catalog,batch?.outputPolicy);
  }
  const initialCatalog=await getCatalog();
  let renamedExistingVersion=false;
  for(const batch of batches.filter(batch=>!recycleBin.isTaskHidden(`ad-resources:${batch.id}`)))for(const spec of initialCatalog.specs)for(const version of batch.items?.[spec.id]?.versions||[]){
    const name=outputFileName(batch,spec);
    if(version.invalidatedReason||version.name===name)continue;
    // Older candidates can use their display name as the physical filename.
    if(version.kind!=='composition')version.storageName||=version.name;
    version.name=name;
    renamedExistingVersion=true;
  }
  if(renamedExistingVersion)await save();
  await aiEdits.restore(initialCatalog);
  await aiGroupEdits.restore(initialCatalog);
  // Resume only previously requested work. The durable provider receipt decides
  // whether to poll an existing job or stop an uncertain submission; it never
  // replaces a stopped request with a new charged provider task.
  for(const batch of batches.filter(batch=>!recycleBin.isTaskHidden(`ad-resources:${batch.id}`)))for(const spec of initialCatalog.specs){
    const job=batch.items?.[spec.id]?.motionJob;
    if(spec.format==='GIF'&&job&&runningMotionStates.has(job.status))startMotionJob(batch,spec,job);
  }
  recycleBin.register('ad-resources',{
    list:()=>batches.map(batch=>({key:`ad-resources:${batch.id}`,label:taskName(`ad-resources:${batch.id}`,batch.project),projectId:batch.projectId,folder:`ad-resources-${batch.id}`,data:batch,purgeBusy:automaticJobs.has(batch.id)||[...uploadRequests.keys()].some(key=>key.startsWith(batch.id+':'))||Object.values(batch.items||{}).some(item=>isAdAiEditActive(item.aiEditJob)||runningMotionStates.has(item.motionJob?.status)),busy:automaticJobs.has(batch.id)||[...uploadRequests.keys()].some(key=>key.startsWith(batch.id+':'))||Object.values(batch.items||{}).some(item=>isAdAiEditLocked(item.aiEditJob)||runningMotionStates.has(item.motionJob?.status))})),
    drop:async key=>{const index=batches.findIndex(batch=>`ad-resources:${batch.id}`===key);if(index>=0)batches.splice(index,1);await save();},
  });
  const publicData=async()=>{const sheet=await getCatalog(),policy=await outputPolicyProvider(),projects=await selectableProjects();await pendingSave;const decorate=sheet=>({...sheet,specs:sheet.specs.map(spec=>({...spec,referenceUrl:spec.reference?`/ad-reference/${encodeURIComponent(spec.reference)}`:''}))});return {catalog:decorate(adCatalogWithOutputPolicy(sheet,policy)),baseCatalog:decorate(sheet),batches:batches.filter(batch=>!recycleBin.isTaskHidden(`ad-resources:${batch.id}`)).map(batch=>publicBatch(batch,sheet)),projects,creationRunningBatchIds:[...automaticJobs.keys()]}};
  return async function handle(req,res,url){
    const parts=url.pathname.split('/').filter(Boolean);
    if(parts[0]!=='api'||parts[1]!=='ad-resources')return false;
    if(req.method==='GET'&&parts.length===2)return respond(res,200,await publicData());
    if(req.method==='POST'&&parts[2]==='batches'&&parts.length===3){
      return respond(res,201,await createBatch(await bodyJson(req,4096)));
    }
    if(parts[2]!=='batches'||!parts[3])return respond(res,404,{error:'投放接口不存在'});
    const batch=batches.find(entry=>entry.id===parts[3]);if(!batch)return respond(res,404,{error:'投放任务不存在'});
    setProjectHint(batch.projectId||'');
    if(recycleBin.isTaskHidden(`ad-resources:${batch.id}`)&&!(parts.length===4&&req.method==='DELETE'))return respond(res,410,{error:'任务已移至回收站，请恢复后再使用'});
    if(req.method!=='GET'&&automaticJobs.has(batch.id)&&parts[4]!=='auto-generate')throw invalid('此任务正在自动制作，可先查看画面，完成后再调整',409);
    if(req.method==='DELETE'&&parts.length===4){
      if(automaticJobs.has(batch.id)||[...uploadRequests.keys()].some(key=>key.startsWith(batch.id+':')))throw invalid('任务正在导入或自动制作，请等待完成后再删除',409);
      if(Object.values(batch.items||{}).some(item=>isAdAiEditLocked(item.aiEditJob)))throw invalid('此任务有 AI 修改尚未完成，请完成或查询结果后再删除',409);
      if(Object.values(batch.items||{}).some(item=>runningMotionStates.has(item.motionJob?.status)))throw invalid('此任务的可灵动效仍在生成，请等待完成后再删除',409);
      return respond(res,200,await recycleBin.trashTask(`ad-resources:${batch.id}`));
    }
    if(req.method==='POST'&&parts[4]==='apply-logo'&&parts.length===5){
      const input=await bodyJson(req,2048);
      return respond(res,200,await applyLogoToBatch(batch,String(input.logoAssetId||'')));
    }
    if(req.method==='POST'&&parts[4]==='prepare-download'&&parts.length===5){
      return respond(res,200,await prepareDownload(batch,await getCatalog(batch)));
    }
    if((req.method==='GET'||req.method==='POST')&&parts[4]==='download'&&parts.length===5){
      const downloadOptions=req.method==='POST'?await bodyJson(req,2048):{};
      for(const field of ['maxPackageBytes','maxPackageFiles'])if(downloadOptions[field]!==undefined&&(!Number.isSafeInteger(downloadOptions[field])||downloadOptions[field]<0))throw invalid('下载容量限制无效');
      const sheet=await getCatalog(batch);
      if(req.method==='POST'&&sheet.specs.some(spec=>batch.items[spec.id]?.draftDirty)){const prepared=await prepareDownload(batch,sheet);if(!prepared.ready)throw invalid(prepared.blocked[0]?.reason||'编辑稿尚未完成',409);}
      if(sheet.specs.some(spec=>batch.items[spec.id]?.draftDirty||batch.items[spec.id]?.aiEditJob?.status==='awaiting_review'))throw invalid('请先保留编辑稿，并确认或放弃 AI 候选后再输出',409);
      if(sheet.specs.some(spec=>isAdAiEditLocked(batch.items?.[spec.id]?.aiEditJob)))throw invalid('AI 修改尚未完成，请确认修改结果后再成套下载',409);
      if(batch.sourceSha256!==sheet.sourceSha256)throw invalid('尺寸表已有更新，请逐稿复核新要求后再成套交付');
      if(sheet.specs.some(spec=>spec.format==='GIF'&&batch.items?.[spec.id]?.motionJob&&batch.items[spec.id].motionJob.status!=='completed'))throw invalid('可灵动效尚未完成，暂不能将旧动图作为本次交付稿',409);
      const invalidCandidate=sheet.specs.find(spec=>batch.items?.[spec.id]?.versions?.at(-1)?.invalidatedReason);
      if(invalidCandidate)throw invalid(`${invalidCandidate.number}.${invalidCandidate.name} 的当前候选稿不可交付：${batch.items[invalidCandidate.id].versions.at(-1).invalidatedReason}`,409);
      const missing=sheet.specs.filter(spec=>!batch.items?.[spec.id]?.versions?.at(-1));
      if(missing.length)throw invalid(`还有 ${missing.length} 张资源位没有候选稿：${missing.map(spec=>`${spec.number}.${spec.name}`).join('、')}`);
      const selectedVersions=sheet.specs.map(spec=>batch.items[spec.id].versions.at(-1));
      const selectedDrafts=sheet.specs.map(spec=>adDraftKey(batch.items[spec.id].draft));
      const byName=new Map(),overwritten=[];
      for(const spec of sheet.specs){
        const version=batch.items[spec.id].versions.at(-1),name=exportName(batch,spec),folder=`ad-resources-${batch.id}`;
        if(byName.has(name))overwritten.push({file:name,previousSpecId:byName.get(name).spec.id,replacementSpecId:spec.id});
        const data=await versionLifecycle.readVersion(batch,spec,version);if(batch.outputPolicy)await validateAdCandidate(spec,data);
        byName.set(name,{name,data,spec,version});
      }
      const outputs=[...byName.values()];
      const finalizing=req.method==='POST';
      const manifest={project:taskName(`ad-resources:${batch.id}`,batch.project),sourceName:sheet.sourceName,sourceSha256:sheet.sourceSha256,createdAt:new Date().toISOString(),outputs:outputs.map(({name,spec,version})=>({id:spec.id,row:spec.row,format:spec.format,dimensions:`${spec.width}x${spec.height}`,file:name,confirmed:finalizing||Boolean(version.review?.logoChecked&&version.review?.contentChecked&&version.review?.safeAreaChecked)})),overwritten};
      const files=[...outputs.map(({name,data})=>({name,data})),{name:'交付清单.json',data:Buffer.from(JSON.stringify(manifest,null,2))}];
      if(downloadOptions.maxPackageBytes!==undefined&&files.reduce((size,file)=>size+file.data.length,0)>downloadOptions.maxPackageBytes)throw invalid('所选成品超过 256MB，请分批下载',413);
      if(downloadOptions.maxPackageFiles!==undefined&&files.length>downloadOptions.maxPackageFiles)throw invalid('所选成品文件过多，请分批下载',413);
      const zip=createStoreZip(files);
      if(finalizing){
        if(sheet.specs.some((spec,index)=>batch.items[spec.id].versions.at(-1)!==selectedVersions[index]||batch.items[spec.id].draftDirty||adDraftKey(batch.items[spec.id].draft)!==selectedDrafts[index]||isAdAiEditLocked(batch.items[spec.id].aiEditJob)))throw invalid('编辑稿已更新，请重新点击成套下载',409);
        for(const version of selectedVersions)version.review={...version.review,logoChecked:true,contentChecked:true,safeAreaChecked:true};
        batch.deliveredVersions=Object.fromEntries(sheet.specs.map((spec,index)=>[spec.id,selectedVersions[index].number]));
        batch.downloadedAt=new Date().toISOString();await save();
      }
      res.writeHead(200,{'Content-Type':'application/zip','Content-Length':zip.length,'Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent((taskName(`ad-resources:${batch.id}`,batch.project)||'投放素材').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_')+'_投放资源位.zip')}`});res.end(zip);return;
    }
    if(req.method==='POST'&&parts[4]==='assets'&&parts[5]==='upload'&&parts.length===6){
      const upload=await receiveAdAssetUpload(req,{runtimeDir,name:url.searchParams.get('name')||'',mime:req.headers?.['content-type']||''});
      return respond(res,201,await importUploadOnce(batch,upload,url.searchParams.get('role')==='logo'?'logo':'visual',url.searchParams.get('requestId'),()=>req.aborted===true||res.destroyed===true));
    }
    if(req.method==='POST'&&parts[4]==='assets'&&parts.length===5){
      // Legacy clients keep their JSON endpoint and 120 MB body cap. New clients
      // use the binary route so larger PSDs do not incur base64 memory overhead.
      const input=await bodyJson(req,120*1024*1024),{mime,buffer}=imageData(input.dataUrl);
      const upload=await stageLegacyAdAsset(buffer,{runtimeDir,name:input.name,mime});
      return respond(res,201,await importAssetUpload(batch,upload,input.role==='logo'?'logo':'visual'));
    }
    if(req.method==='POST'&&parts[4]==='auto-generate'&&parts.length===5){
      const input=await bodyJson(req,2048),force=input.force===true;
      const pending=automaticJobs.get(batch.id);if(pending){if(pending.force!==force)throw invalid('此任务正在自动制作，请等待完成',409);const result=await pending.operation;return respond(res,result.pending.length?202:200,result);}
      const operation=(async()=>{
      const sheet=await getCatalog(batch),visuals=batch.assets.filter(asset=>asset.role==='visual'&&!asset.nanoSourceAssetId&&!asset.safeSourceAssetId&&!asset.portraitSourceAssetId&&!asset.aiSourceAssetId),logo=batch.assets.find(asset=>asset.id===batch.activeLogoAssetId&&asset.role==='logo')||batch.assets.find(asset=>asset.role==='logo');
      if(batch.sourceSha256!==sheet.sourceSha256)throw invalid('尺寸表已更新，请新建任务后自动制作');
      if(!visuals.length)throw invalid('请先导入至少一张 JPG、PNG、WebP 或 PSD 主视觉');
      const errors=[],pending=[];let generated=0;
      for(const spec of sheet.specs){
        const item=itemState(batch,spec.id);
        if(isAdAiEditLocked(item.aiEditJob)){errors.push(`${spec.number}.${spec.name}：AI 修改正在处理，未重复制作`);continue}
        if(item.versions.length&&!force&&!item.versions.at(-1)?.invalidatedReason)continue;
        const source=preferredVisual(spec,visuals,Boolean(logo));
        const sourceLogo=batch.assets.find(asset=>asset.role==='logo'&&asset.derivedFrom===(source?.derivedFrom||source?.id)&&asset.originalBounds);
        const placementLogo=Math.log(spec.width/spec.height)>.15&&!logo?.originalBounds?sourceLogo||logo:logo;
        const warnings=[];
        if(spec.logo==='forbidden'&&(embeddedLogo(source)||(!source.logoFree&&source.sourceFormat==='PSD')))warnings.push('所选源图检测到 Logo，但该尺寸要求无 Logo；请先换成确认无 Logo 的背景图。');
        else if(spec.logo==='forbidden'&&visuals.length===1)warnings.push('单张源图若已合入 Logo，自动适配无法将其去除；请检查无 Logo 成品，必要时补充纯图。');
        if(spec.logo==='required'&&!logo&&!embeddedLogo(source))warnings.push('未提供独立 Logo，请确认源图已包含正确 Logo。');
        try{
          const prepared=await prepareDraftForSpec(batch,spec,{...item.draft,...(spec.logo==='required'&&!item.versions.length?defaultAdLogoPlacement(placementLogo,spec):{}),sourceAssetId:source.id,logoAssetId:spec.logo==='required'?logo?.id||'':''});
          const preparedSource=batch.assets.find(asset=>asset.id===prepared.sourceAssetId);
          const candidateDraft={...prepared,...await smartDraft(await assetBuffer(batch,preparedSource),spec)};
          if(spec.format==='GIF'){
            const result=await requestMotionForSpec(batch,spec,candidateDraft,input);
            if(result.pending)pending.push({specId:spec.id,motionJob:result.motionJob});
            else if(result.version)generated++;
            else throw invalid(result.motionJob?.error||'可灵动效未完成，请查看任务状态');
          }else{item.draft=candidateDraft;await saveVersionForItem(batch,spec,await renderForSpec(batch,spec,item.draft));generated++}
          item.autoError='';item.autoWarning=warnings.join(' ');
        }catch(error){item.autoError=error.message;errors.push(`${spec.number}.${spec.name}：${error.message}`)}
        await save();
      }
      batch.autoGeneratedAt=new Date().toISOString();await save();
      return {generated,total:sheet.specs.length,pending,errors};
      })();automaticJobs.set(batch.id,{force,operation});
      try{const result=await operation;return respond(res,result.pending.length?202:200,result);}finally{automaticJobs.delete(batch.id);}
    }
    if(parts[4]!=='items'||!parts[5])return respond(res,404,{error:'投放接口不存在'});
    const sheet=await getCatalog(batch),spec=sheet.specs.find(entry=>entry.id===parts[5]);if(!spec)return respond(res,404,{error:'资源位不存在'});
    const item=itemState(batch,spec.id);
    if(req.method==='GET'&&parts[6]==='preview'&&parts.length===7){let buffer=await renderForSpec(batch,spec,structuredClone(item.draft));const thumbnail=url.searchParams.get('thumbnail')==='1';if(thumbnail)buffer=await sharp(buffer,{animated:false}).resize({width:360,height:240,fit:'inside',withoutEnlargement:true}).jpeg({quality:75}).toBuffer();res.writeHead(200,{'Content-Type':!thumbnail&&spec.format==='GIF'?'image/gif':'image/jpeg','Content-Length':buffer.length,'Cache-Control':'no-store'});res.end(buffer);return;}
    if(req.method==='GET'&&parts[6]==='versions'&&parts[7]&&['image','thumbnail'].includes(parts[8])&&parts.length===9){
      const number=Number(parts[7]),version=item.versions.find(v=>v.number===number)||(batch.deliveryArchive||[]).find(v=>v.specId===spec.id&&v.number===number);
      if(!version)return respond(res,404,{error:'版本不存在'});
      let buffer;if(parts[8]==='thumbnail')buffer=version.thumbnailStorageName?await fs.readFile(safeChild(storageDir,`ad-resources-${batch.id}`,'candidate',version.thumbnailStorageName)):await sharp(await versionLifecycle.readVersion(batch,spec,version),{animated:false}).resize({width:360,height:240,fit:'inside',withoutEnlargement:true}).jpeg({quality:75}).toBuffer();else buffer=await versionLifecycle.readVersion(batch,spec,version);
      res.writeHead(200,{'Content-Type':parts[8]==='thumbnail'?'image/jpeg':spec.format==='GIF'?'image/gif':'image/jpeg','Content-Length':buffer.length,'Cache-Control':'private, max-age=31536000, immutable'});res.end(buffer);return;
    }
    if(req.method==='DELETE'&&parts[6]==='versions'&&parts[7]&&parts.length===8)return respond(res,200,await versionLifecycle.remove(batch,spec,item,Number(parts[7]),await bodyJson(req,2048)));
    if(req.method==='POST'&&parts[6]==='snapshots'&&parts.length===7)return respond(res,201,await versionLifecycle.snapshot(batch,spec,item,await bodyJson(req,8192)));
    if(req.method==='POST'&&parts[6]==='draft'&&['undo','redo'].includes(parts[7])&&parts.length===8){const input=await bodyJson(req,8192);return respond(res,200,await draftSync.undo(batch,spec,input,parts[7])||await versionLifecycle.undo(item,input,parts[7]));}
    const saveVersion=async(buffer,input)=>respond(res,201,{version:await saveVersionForItem(batch,spec,buffer,input)});
    if(parts[6]==='ai-edit'){
      if(parts[7]==='references'){
        if(spec.format!=='JPG')throw invalid('修改参考图当前支持静态图片');
        if(req.method==='GET'&&parts.length===8)return respond(res,200,aiReferences.list(batch,item));
        if(req.method==='POST'&&parts.length===8){aiEdits.assertFree(item);const buffer=await receiveAdAiReference(req);return respond(res,201,await aiReferences.upload(batch,item,buffer,url.searchParams.get('name')));}
        if(req.method==='DELETE'&&parts[8]&&parts.length===9)return respond(res,200,await aiReferences.remove(batch,item,parts[8]));
        return respond(res,404,{error:'修改参考图接口不存在'});
      }
      const group=Boolean(item.aiEditJob?.groupId);
      if(req.method==='GET'&&parts.length===7){await pendingSave;return respond(res,200,group?aiGroupEdits.result(batch,item):aiEdits.result(item));}
      if(req.method==='POST'&&parts.length===7){const input=await bodyJson(req,32768);const result=input.scope==='same-ratio'?await aiGroupEdits.submit(batch,spec,item,input):await aiEdits.submit(batch,spec,item,input);return respond(res,result.pending?202:200,result)}
      if(req.method==='POST'&&parts[7]==='resume'&&parts.length===8){const result=group?await aiGroupEdits.resume(batch,spec,item):await aiEdits.resume(batch,spec,item);return respond(res,result.pending?202:200,result)}
      if(req.method==='POST'&&parts[7]==='synchronize'&&parts.length===8){const input=await bodyJson(req,2048);return respond(res,200,await aiGroupEdits.synchronize(batch,spec,item,input));}
      if(req.method==='POST'&&parts[7]==='undo'&&parts.length===8){const input=await bodyJson(req,2048);if(group)return respond(res,201,await aiGroupEdits.undo(batch,spec,item,input));const version=await aiEdits.undo(batch,spec,item,input);return respond(res,201,{...aiEdits.result(item),version})}
      if(req.method==='POST'&&['accept','discard'].includes(parts[7])&&parts.length===8){const input=await bodyJson(req,2048);return respond(res,200,await (group?aiGroupEdits:aiEdits)[parts[7]](batch,spec,item,input));}
    }
    if(['POST','PUT'].includes(req.method)&&['draft','render','generate-gif','versions'].includes(parts[6])&&parts[8]!=='review')aiEdits.assertFree(item);
    if(req.method==='GET'&&parts[6]==='motion-job'&&parts.length===7){
      const job=item.motionJob;
      // Normal polling is strictly read-only. An uncertain provider result must
      // remain visible until the user explicitly asks to recheck the known job.
      // Even an explicit recheck can only poll that ID, never submit a new job.
      const refresh=url.searchParams.get('refresh')==='1';
      if(refresh&&job?.status==='result_uncertain'&&job.providerJobId){
        const settling=runningMotionJobs.get(job.id);if(settling)await settling;
        startMotionJob(batch,spec,job);
      }
      const version=job?.versionNumber?item.versions.find(entry=>entry.number===job.versionNumber):null;
      return respond(res,200,{motionJob:publicMotionJob(job),pending:Boolean(job&&runningMotionStates.has(job.status)),...(version?{version}:{})});
    }
    if(req.method==='PUT'&&parts[6]==='versions'&&parts[7]&&parts[8]==='review'&&parts.length===9){
      const version=item.versions.find(entry=>entry.number===Number(parts[7]));if(!version)return respond(res,404,{error:'候选版本不存在'});
      const input=await bodyJson(req,2048);version.review={logoChecked:Boolean(input.logoChecked),contentChecked:Boolean(input.contentChecked),safeAreaChecked:Boolean(input.safeAreaChecked),note:String(input.note||'').slice(0,500)};await save();return respond(res,200,{version});
    }
    if(req.method==='PUT'&&parts[6]==='draft'&&parts.length===7){
      const input=await bodyJson(req,8192),sourceAssetId=String(input.sourceAssetId||''),logoAssetId=String(input.logoAssetId||'');
      if(sourceAssetId&&!batch.assets.some(asset=>asset.id===sourceAssetId&&asset.role==='visual'))throw invalid('源图不属于当前任务');
      if(logoAssetId&&!batch.assets.some(asset=>asset.id===logoAssetId&&asset.role==='logo'))throw invalid('Logo 不属于当前任务');
      const number=(value,min,max,fallback)=>{const n=Number(value);return Number.isFinite(n)?Math.max(min,Math.min(max,n)):fallback};
      const nextDraft={sourceAssetId,logoAssetId,zoom:number(input.zoom,0.2,5,1),offsetX:number(input.offsetX,-1,1,0),offsetY:number(input.offsetY,-1,1,0),logoX:number(input.logoX,0,1,0.78),logoY:number(input.logoY,0,1,0.06),logoScale:number(input.logoScale,0.02,0.6,0.18)};
      if(spec.logo==='forbidden')nextDraft.logoAssetId='';
      if(spec.format==='GIF'&&runningMotionStates.has(item.motionJob?.status)&&item.motionJob.requestKey!==motionRequestKey(batch,spec,nextDraft))throw invalid('可灵动效正在生成，请等待完成后再调整画面',409);
      if(input.syncSimilar===true&&spec.format==='JPG')return respond(res,200,await draftSync.apply(batch,spec,sheet.specs,nextDraft));
      updateAdWorkingDraft(item,nextDraft);
      await save();return respond(res,200,versionLifecycle.state(item));
    }
    if(req.method==='POST'&&parts[6]==='render'&&parts.length===7){
      const input=await bodyJson(req,8192);
      if(Number.isInteger(input.expectedVersion)&&input.expectedVersion!==(item.versions.at(-1)?.number||0))throw invalid('候选稿已更新，请重新读取后再保存',409);
      // Refresh an existing composition without re-running a charged layout model.
      const draft=input.preserveLayout===true&&spec.format==='JPG'?{...item.draft,...input.draft}:await prepareDraftForSpec(batch,spec,{...item.draft,...input.draft});
      if(spec.logo==='forbidden')draft.logoAssetId='';
      if(spec.format==='GIF'){
        const result=await requestMotionForSpec(batch,spec,draft,input);
        return respond(res,result.pending?202:result.version?201:409,{...result,...(!result.pending&&!result.version?{error:result.motionJob?.error||'可灵动效未完成，请查看任务状态'}:{})});
      }
      item.draft=draft;
      const version=await saveVersionForItem(batch,spec,await renderForSpec(batch,spec,draft));
      item.autoError='';item.autoWarning='';await save();return respond(res,201,{version});
    }
    if(req.method==='POST'&&parts[6]==='generate-gif'&&parts.length===7){
      if(spec.format!=='GIF')throw invalid('只有 GIF 资源位可以生成动图');
      const input=await bodyJson(req,8192),draft=await prepareDraftForSpec(batch,spec,{...item.draft,...input.draft});
      const result=await requestMotionForSpec(batch,spec,draft,input);
      return respond(res,result.pending?202:result.version?201:409,{...result,...(!result.pending&&!result.version?{error:result.motionJob?.error||'可灵动效未完成，请查看任务状态'}:{})});
    }
    if(req.method==='POST'&&parts[6]==='versions'&&parts.length===7){
      const input=await bodyJson(req),{buffer}=imageData(input.dataUrl);
      if(input.motionReference&&spec.format==='GIF'){
        if(runningMotionStates.has(item.motionJob?.status))throw invalid('动效任务正在运行，请等待完成后再导入候选',409);
        if(input.motion?.model===AD_MOTION_MODEL){
          const timing=await sharp(buffer,{animated:true}).metadata();
          if(timing.pages!==10||timing.delay?.length!==10||timing.delay.some(delay=>delay!==100)||timing.loop!==0)throw invalid('可灵候选必须为10帧、1秒无限循环');
        }
        const version=await saveVersionForItem(batch,spec,buffer,input);
        item.motionReference={storageName:version.storageName,sourceAssetId:item.draft.sourceAssetId,draft:motionDraftKey(item.draft)};
        if(input.motion?.model===AD_MOTION_MODEL&&input.motion.providerJobId){
          // An inspected external conversion is the new current result. Never
          // expose or retry the previous video's job as if it produced this GIF.
          item.motionJob={id:String(input.motion.jobId||randomUUID()),requestKey:motionRequestKey(batch,spec,item.draft),attempt:(item.motionJob?.attempt||0)+1,status:'completed',model:AD_MOTION_MODEL,method:AD_MOTION_METHOD,motionStyle:input.motion.motionStyle||AD_DEFAULT_MOTION_STYLE,scenePlan:input.motion.scenePlan,sourceAssetId:item.draft.sourceAssetId,draft:motionDraftKey(item.draft),providerJobId:String(input.motion.providerJobId),videoReady:false,imported:true,versionNumber:version.number,progress:100,error:'',errorCode:'',createdAt:new Date().toISOString(),completedAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
          if(/^[a-f0-9-]{16,64}$/i.test(item.motionJob.id)&&typeof input.motion.generationSeed==='string'){
            const receipt=await fs.readFile(safeChild(storageDir,`ad-resources-${batch.id}`,'motion',item.motionJob.id,'video-receipt.json'),'utf8').then(JSON.parse).catch(()=>null);
            const seed=input.motion.generationSeed.slice(0,200);
            if(receipt?.status==='completed'&&receipt.jobId===item.motionJob.providerJobId&&receipt.sourceHash===input.motion.sourceHash&&receipt.requestHash===createHash('sha256').update(`${receipt.method}:${seed}:${receipt.sourceHash}:${receipt.prompt}:${receipt.negative}`).digest('hex')){
              item.motionJob.videoReady=true;item.motionJob.generationSeed=seed;
              item.motionJob.fullFrameLayers=Boolean(input.motion.nativeTypographyOverlay);
              item.motionJob.motionBrief=input.motionBrief;item.motionJob.motionOptions=input.motionOptions||{};
            }
          }
          item.motionReference={...item.motionReference,model:AD_MOTION_MODEL,method:AD_MOTION_METHOD,jobId:item.motionJob.id};
          if(input.motionBrief&&typeof input.motionBrief.prompt==='string'&&typeof input.motionBrief.negative==='string')item.motionPlan={sourceAssetId:item.draft.sourceAssetId,draft:motionDraftKey(item.draft),scenePlan:input.motion.scenePlan,motionBrief:input.motionBrief,motionOptions:input.motionOptions||{}};
          item.autoError='';item.autoWarning='';
        }
        await save();return respond(res,201,{version});
      }
      return saveVersion(buffer,input);
    }
    return respond(res,404,{error:'投放接口不存在'});
  };
}
