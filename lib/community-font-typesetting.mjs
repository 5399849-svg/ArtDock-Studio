import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {safeChild} from './core.mjs';
import {mutateJson} from './json-store.mjs';
import {renderCommunityFontText} from './community-material-font.mjs';
import {measureBannerBackingContent,centerSubtitleInBacking} from './banner-backing-content.mjs';
import {commitCommunityFontTypesetting} from './community-materials.mjs';

const fail=(message,status=422)=>{throw Object.assign(Error(message),{status});};
const hash=value=>createHash('sha256').update(value).digest('hex');
const validRect=rect=>rect&&['x','y','width','height'].every(k=>Number.isFinite(rect[k]))&&rect.width>0&&rect.height>0;

export async function fitCommunityFontText(buffer,box,{rotation=0,padding=.04}={}){
 if(!validRect(box))fail('文字位置无效，请刷新后重试');
 const meta=await sharp(buffer).metadata(),factor=Math.min(box.width*(1-padding*2)/meta.width,box.height*(1-padding*2)/meta.height);
 // Bake the measured angle into the independent PNG. All existing preview,
 // export and target compositors then use exactly the same transparent asset.
 const rotated=Math.abs(rotation)>.01?await sharp(buffer).rotate(rotation,{background:'#00000000'}).png().toBuffer():buffer;
 const dimensions=await sharp(rotated).metadata(),width=dimensions.width*factor,height=dimensions.height*factor;
 return {buffer:rotated,width:dimensions.width,height:dimensions.height,layout:{x:box.x+box.width/2-width/2,y:box.y+box.height/2-height/2,width,height,scaleBaseWidth:width,scaleBaseHeight:height,rotation:0,visible:true,align:'center',verticalAlign:'middle',effects:{stroke:{enabled:false},shadow:{enabled:false}}}};
}

export function createCommunityFontTypesetting({tasksFile,storageDir,templateMap,jobs,invalidate,renderFont=renderCommunityFontText}){
 return {save:async(id,input)=>{
  if(!input||!['title','subtitle'].includes(input.kind))fail('请选择主标或副标');
  if(!/^[a-zA-Z0-9-]{8,80}$/.test(input.requestId||''))fail('缺少排字操作编号');
  if(!/^#[a-f0-9]{6}$/i.test(input.color||''))fail('请选择有效的文字颜色');
  const signature=hash(JSON.stringify({kind:input.kind,fontId:input.fontId,color:input.color.toLowerCase(),fitBacking:input.fitBacking!==false}));
  return mutateJson(tasksFile,async tasks=>{
   const task=tasks.find(t=>t.id===id);if(!task)fail('任务不存在',404);
   const duplicate=task.assets.find(a=>a.typesettingRequestId===input.requestId);
   if(duplicate){if(duplicate.typesettingInputSha256!==signature)fail('排字编号已用于其他内容，请重新提交',409);return task;}
   const template=templateMap.get(task.masterTemplateId),p=task.parameters||{};
   if(!template?.communityMaster)fail('请在母版制作界面直接排字');
   if(task.status==='已完成'&&task.deliveredPackage)fail('请先开始新版本再修改文案',409);
   if(jobs.has(id)||task.communityGeneration?.status==='running'||task.outpaint?.status==='running')fail('请等待当前生成完成后再排字',409);
   if(input.expectedUpdatedAt!==task.updatedAt)fail('画面已更新，请刷新后再排字',409);
   if(!input.fontId||input.fontId!==p.communityMaterialFontIds?.[input.kind])fail('所选版权字已变化，请重新选择',409);
   if(p.communityArtworkByTemplate?.[template.id])fail('当前是历史整稿，请先选用无字插画再组合文案');
   const existing=p.layoutByTemplate?.[template.id]?.[input.kind]||{},backing=p.layoutByTemplate?.[template.id]?.['subtitle-backing'];
   const fitBacking=input.kind==='subtitle'&&input.fitBacking!==false&&validRect(backing)&&backing.visible!==false&&backing.backing?.enabled===true;
   let content,box=existing,rotation=0;
   if(fitBacking){
    if(backing.backing.assetName){
     const asset=task.assets.find(a=>a.name===backing.backing.assetName&&a.role==='subtitle-backing');
     if(!asset)fail('副标底板素材不存在，请重新选择');
     content=await measureBannerBackingContent(await fs.readFile(safeChild(storageDir,id,asset.bucket||'assets',asset.name)));
    }else content={x:.06,y:.12,width:.88,height:.76,rotation:0,method:'native-backing-inset'};
    box=centerSubtitleInBacking({},backing,content);rotation=Number.isFinite(box.rotation)?box.rotation:0;
   }else if(!validRect(box)){
    const fraction=template.communityLayout?.[input.kind]||(input.kind==='title'?[.07,.22,.5,.3]:[.08,.65,.5,.07]);
    box={x:fraction[0]*template.width,y:fraction[1]*template.height,width:fraction[2]*template.width,height:fraction[3]*template.height};
   }
   const color=input.color.toLowerCase(),rendered=await renderFont(task,input.kind,{color});
   const fitted=await fitCommunityFontText(rendered.buffer,box,{rotation}),now=new Date().toISOString(),name=`版权字-${input.kind}-${input.requestId}.png`;
   const layout={...existing,...fitted.layout,textColor:color,backingAligned:!!fitBacking};
   // A previous native-copy content rectangle must not constrain this PNG.
   delete layout.contentRect;delete layout.fitMode;delete layout.backingAlignment;
   if(fitBacking)layout.backingAlignment={assetName:backing.backing.assetName||null,contentRect:content};
   const asset={name,mime:'image/png',role:input.kind,materialKind:input.kind,width:fitted.width,height:fitted.height,bytes:fitted.buffer.length,url:`/storage/${id}/assets/${encodeURIComponent(name)}`,createdAt:now,generatorModel:'local-font',exactText:String(input.kind==='title'?task.copy:p.subtitleText||'').trim(),fontProvenance:{fontId:rendered.font.id,fontName:rendered.font.name,sha256:rendered.font.sha256,method:'licensed-font-typeset-v1'},typesettingRequestId:input.requestId,typesettingInputSha256:signature,typesetting:{color,stroke:false,shadow:false,rotation,fitBacking:!!fitBacking,...(fitBacking?{backingName:backing.backing.assetName||null,contentRect:content}:{})}};
   const directory=safeChild(storageDir,id,'assets');await fs.mkdir(directory,{recursive:true});await fs.writeFile(safeChild(directory,name),fitted.buffer);
   commitCommunityFontTypesetting(task,asset,input.kind,layout,now);invalidate(task,'版权字直接排字，待确认母版');return task;
  });
 }};
}
