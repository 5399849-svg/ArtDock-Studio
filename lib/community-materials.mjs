import sharp from 'sharp';
import {randomUUID} from 'node:crypto';
import {communityMaterialReferences} from '../public/community-references.js';
import {bannerMasterSnapshot} from './community-banner-session.mjs';
import {communityMaterialKind} from '../public/community-material-state.js';
import {prepareLayeredIllustration,applyPairedIllustration} from './community-layered-illustration.mjs';
import {canvasRatio} from '../public/custom-canvas-model.js';
import {nearestBananaRatio} from './ai-huabu.mjs';

const fail=(message,status=422)=>{throw Object.assign(Error(message),{status});};
export const materialKind=communityMaterialKind;
export function prepareCommunityMaterial(task,input,template){
 if(!template?.communityMaster)fail('请在母版制作界面生成独立素材');
 if(!['illustration','title','subtitle'].includes(input.kind))fail('请选择插画、主标或副标');
 if(!['gpt-image-2','banana_pro'].includes(input.model))fail('生图模型无效');
 if(input.expectedUpdatedAt!==task.updatedAt)fail('母版已更新，请刷新后再提交',409);
 if(!/^[a-zA-Z0-9-]{8,80}$/.test(input.requestId||''))fail('缺少有效请求编号');
 const prompt=String(input.prompt||'').trim();if(!prompt||prompt.length>3200)fail('请填写 1–3200 字提示词');
 const text=input.kind==='title'?task.copy:input.kind==='subtitle'?task.parameters?.subtitleText:'';
 if(input.kind!=='illustration'&&!String(text||'').trim())fail('请先填写本次生成的准确文案');
 const references=communityMaterialReferences(task,input.kind);
 const background=task.parameters?.assetByTemplate?.[task.masterTemplateId]?.background;
 const scene=task.assets.find(a=>a.name===background&&materialKind(a)==='illustration');
  return {runId:randomUUID(),requestId:input.requestId,phase:'materials',kind:input.kind,model:input.model,prompt,text:String(text||'').trim(),templateId:template.id,canvas:{width:template.width,height:template.height,ratio:canvasRatio(template.width,template.height),...(task.customCanvas?{custom:true,providerRatio:nearestBananaRatio(template.width,template.height)}:{})},referenceNames:references.map(a=>a.name),sceneName:input.kind!=='illustration'?scene?.name:null,...(input.kind!=='illustration'?{matte:/紫|粉|洋红|magenta|purple|pink/i.test(prompt)?'green':'magenta'}:prepareLayeredIllustration(task,input,references.map(a=>a.name))),baseUpdatedAt:task.updatedAt};
}
export function communityMaterialRequest(run,images=[]){
 const illustration=run.kind==='illustration';
 const fontGuide=run.licensedFont?`\n【版权字形优先】输入第${run.referenceNames.length+1}张是工作台用公司版权字体「${run.licensedFont.name}」渲染的准确文案字形，仅作为内部字形基准，不属于界面编号参考图。必须以此图每个字的笔画结构、部件比例、字面特征和轮廓为设计基础，不另换字体，不用其他参考图的书法字替代它。其他参考图仅参考配色、材质、光影、描边和贴字效果。允许按设计师提示调整字组编排和行数；字形图的换行只用于展示全部字形，不限定最终排版。不要复制字形图的黑色或白底，按提示创作字效。`:'';
 const referenceGuide=run.referenceNames.map((name,i)=>`输入第${i+1}张对应界面图${i+1}，只参考设计师指定的方面，不复制其旧文字、Logo、水印。`).join('\n');
 const prompt=illustration?
 `生成一张 ${run.canvas?.ratio||'16:9'} 游戏活动无字插画，母版画布 ${run.canvas?.width||1920}×${run.canvas?.height||1080}，以4K高质量输出。人物与场景在同一张插画内自然设计，姿态、道具接触、透视和光照协调。按设定保留人物身份、五官、服装与配色，三视图只代表一个角色，不把设定表贴进画面。按提示规划标题留位，但不绘制标题或占位框。保持指定画风与色调。\n【设计师提示词】${run.prompt}\n【参考图编号】${referenceGuide||'无参考图，按提示创作。'}\n【独立素材要求】输出只含人物、场景、道具及自然装饰，不含任何主标、副标、书法字、伪文字、品牌Logo、字幕、水印或界面。提示词中的文字内容仅帮助理解主题，绝不绘入插画。保留原有同角色不同景别与对应场景，除非设计师明确要求合并或删除。只返回完整无字插画。`:
 `生成可独立叠加到游戏活动插画的${run.kind==='title'?'主标':'副标'}透明PNG素材。准确文案为：${JSON.stringify(run.text)}。逐字准确，顺序不变，不增加副句或小字。\n【设计师提示词】${run.prompt}\n【参考图编号】${referenceGuide||'按提示设计。'}${fontGuide}${run.sceneName?'\n最后一张是当前无字插画，仅用于协调文字材质、配色、明暗，不画入文字素材，也不改变编号。':''}\n【独立素材要求】只绘制这一组文字与设计师明确需要的贴字效果；背景真实透明，保留飞白、半透明光晕与字形细节，完整字组四周留少量透明边距。不能绘制背景、人物、整张海报、Logo、额外文字、棋盘格图案或实色底板。${run.licensedFont?'字形遵守版权字形优先规则，允许设计材质和色彩，不改用其他字体。':'主标可设计书法笔势与字组，副标更规整清楚。'}不把透明素材做成字效贴在风景上的整图。`;
 const matte=run.matte==='green'?'#00FF00':'#FF00FF';
 return {model:run.model,task_type:'image',bot_id:'canvas',ratio:illustration?(run.canvas?.providerRatio||run.canvas?.ratio||'16:9'):run.kind==='title'?'2:1':'21:9',image_size:illustration?'4K':'2K',output_format:'png',quality:'high',prompt:prompt+(!illustration?`\n【导出底色】为稳定提取透明素材，本次模型输出将用于后续抠底。请把上述“透明”区域统一画成完全平坦、精确的纯色 ${matte}，不要渐变、阴影、纹理、棋盘格或边框，整张四边均保留这种纯底色。仅文字自身允许所需材质和光效；文字及其效果不要使用 ${matte}。工作台会将底色及抗锯齿边缘转换为真实透明。`:''),...(images.length?{images:images.map(b=>({data_base64:b.toString('base64')}))}:{})};
}
export async function normalizeCommunityMaterial(buffer,kind,matte,canvas={width:1920,height:1080}){
 const meta=await sharp(buffer,{limitInputPixels:40000000}).metadata();
 if(!meta.width||!meta.height)fail('生成素材无法解码，原稿已保留');
 if(kind==='illustration'){
  const actual=meta.width/meta.height,target=canvas.width/canvas.height;
  if(Math.abs(Math.log(actual/target))>.04){
   const [w,h]=String(canvas.providerRatio||'').split(':').map(Number);
   if(!canvas.custom||!(w>0&&h>0)||Math.abs(Math.log(actual/(w/h)))>.04)fail('插画返回比例不符，原始结果已保留，请恢复处理');
   const width=Math.max(1,Math.min(meta.width,Math.round(meta.height*target))),height=Math.max(1,Math.min(meta.height,Math.round(meta.width/target)));
   return sharp(buffer).extract({left:Math.floor((meta.width-width)/2),top:Math.floor((meta.height-height)/2),width,height}).flatten({background:'#ffffff'}).png().toBuffer();
  }
  return sharp(buffer).flatten({background:'#ffffff'}).png().toBuffer();
 }
 const {data,info}=await sharp(buffer).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 let empty=0,ink=0;for(let i=3;i<data.length;i+=info.channels){if(data[i]<20)empty++;if(data[i]>30)ink++;}
 if(empty<info.width*info.height*.03&&matte){
  const color=matte==='green'?[0,255,0]:[255,0,255];let border=0,matching=0;
  for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++)if(x<3||y<3||x>=info.width-3||y>=info.height-3){const p=(y*info.width+x)*4;border++;if(Math.max(...color.map((c,k)=>Math.abs(c-data[p+k])))<45)matching++;}
  if(matching/border<.8)fail('文字底色不符合透明提取要求，原始结果已保留，未替换原素材');
  // Use chroma ratios rather than a fixed brightness subtraction: generated
  // solid plates contain compression/texture noise at varying brightness.
  // The ratio removes that entire hue while retaining partial gold/white edges.
  for(let p=0;p<data.length;p+=4){const base=matte==='green'?data[p+1]:Math.min(data[p],data[p+2]),other=matte==='green'?Math.max(data[p],data[p+2]):data[p+1];let a=Math.min(1,other/Math.max(1,base));if(a<.2)a=0;else if(a>.98)a=1;
   for(let k=0;k<3;k++)data[p+k]=a?Math.max(0,Math.min(255,Math.round((data[p+k]-(1-a)*color[k])/a))):0;data[p+3]=Math.round(a*255);
  }
  return normalizeCommunityMaterial(await sharp(data,{raw:info}).png().toBuffer(),kind);
 }
 if(empty<info.width*info.height*.03||ink<info.width*info.height*.001)fail('文案结果缺少真实透明背景或有效字形，未替换现有素材；原始结果已保留');
 return sharp(buffer).trim({background:'#00000000',threshold:5}).png().toBuffer();
}
function version(task,before,label,now){
 const design=task.communityDesign||={schemaVersion:1,versions:[]};design.versions||=[];
 if(!design.versions.some(v=>JSON.stringify(v.snapshot)===JSON.stringify(before)))design.versions.push({id:randomUUID(),label:'修改前',at:now,snapshot:before});
 const id=randomUUID();design.versions.push({id,label,at:now,mode:'materials',snapshot:bannerMasterSnapshot(task)});design.currentVersionId=id;design.updatedAt=now;
 // Keep all material and master versions; old downloadable assets are never removed.
}
export function commitCommunityTextCleanup(task,asset,kind,now=new Date().toISOString()){
 const before=bannerMasterSnapshot(task),id=task.masterTemplateId;
 task.assets.push(asset);task.parameters.assetByTemplate[id][kind]=asset.name;
 // The source canvas is not trimmed/resized. Keep the designer's exact box,
 // effects and visibility, including geometry already tuned by hand.
 task.communityMasterApproval=null;task.updatedAt=now;
 version(task,before,`清理${kind==='title'?'主标':'副标'}杂点，另存版本`,now);
 (task.history||=[]).push({at:now,action:`局部擦除文案杂点：${asset.cleanupOf}，保留原素材`,by:'设计师',status:task.status});
}
export function commitCommunityFontTypesetting(task,asset,kind,layout,now=new Date().toISOString()){
 const before=bannerMasterSnapshot(task),p=task.parameters||={},id=task.masterTemplateId;
 task.assets.push(asset);(p.assetByTemplate||={})[id]||={};p.assetByTemplate[id][kind]=asset.name;
 (p.layoutByTemplate||={})[id]||={};p.layoutByTemplate[id][kind]=layout;
 p.communityMaterialWorkflow={version:1};task.communityMasterApproval=null;task.updatedAt=now;
 version(task,before,`版权字直接排字：${kind==='title'?'主标':'副标'}`,now);
 (task.history||=[]).push({at:now,action:`直接使用版权字「${asset.fontProvenance.fontName}」${asset.typesetting.fitBacking?'，适配副标底板':''}，保留原素材`,by:'设计师',status:task.status});
}
export function selectCommunityMaterial(task,{name,expectedUpdatedAt},template,{now=new Date().toISOString()}={}){
 if(!template?.communityMaster)fail('请在母版制作页面选择独立素材');
 if(expectedUpdatedAt!==task.updatedAt)fail('母版已变化，请刷新后选择',409);
 const asset=task.assets.find(a=>a.name===name),kind=asset&&materialKind(asset);
 if(asset?.libraryDeletedAt)fail('这份素材已从素材库移除');
 if(!['illustration','title','subtitle','logo'].includes(kind))fail('请选择独立插画、文案或Logo素材');
 const p=task.parameters||={},id=template.id,whole=p.communityArtworkByTemplate?.[id];
 if(['title','subtitle'].includes(kind)&&whole)fail('当前是历史整稿，请先选择无字插画，再组合独立文案');
 if(['title','subtitle'].includes(kind)&&asset.exactText&&asset.exactText!==String(kind==='title'?task.copy:p.subtitleText||'').trim())fail('此版本文案与当前内容不同，请先调整文案内容后再使用');
 const before=bannerMasterSnapshot(task);p.assetByTemplate||={};p.layoutByTemplate||={};p.backgroundByTemplate||={};
 const bindings=p.assetByTemplate[id]||={},layouts=p.layoutByTemplate[id]||={};
 if(kind==='illustration'){
   // Validate the paired character before changing any current bindings.
   if(asset.layeredIllustration){const pair=asset.layeredIllustration,group=task.communityObjects?.characters?.find(c=>c.id===pair.characterId);if(!task.assets.some(a=>a.name===group?.assetName&&!a.libraryDeletedAt))fail('此背景的配套角色已移除，请先恢复角色素材');}
  bindings.background=name;p.backgroundByTemplate[id]={focalX:50,focalY:50,scale:100,smartExpand:false,url:''};
  if(p.communityArtworkByTemplate)delete p.communityArtworkByTemplate[id];
  for(const hidden of ['character','character2','foreground']){bindings[hidden]=null;layouts[hidden]={...(layouts[hidden]||{}),visible:false};}
  for(const text of ['title','subtitle'])if(!bindings[text]){bindings[text]=null;layouts[text]={...(layouts[text]||{}),visible:false};}
   applyPairedIllustration(task,asset);
 }else{
  bindings[kind]=name;
  const box=template.communityLayout[kind]||[.05,.15,.5,.3],w=box[2]*template.width,h=box[3]*template.height,scale=Math.min(w/asset.width,h/asset.height);
  const existing=layouts[kind],hasRect=existing?.width>1&&existing?.height>1;
  const factor=hasRect?Math.min(existing.width/asset.width,existing.height/asset.height):scale,width=asset.width*factor,height=asset.height*factor;
  layouts[kind]={...(existing||{}),x:hasRect?existing.x:box[0]*template.width,y:hasRect?existing.y:box[1]*template.height,width,height,scaleBaseWidth:width,scaleBaseHeight:height,visible:true};
 }
 p.communityMaterialWorkflow={version:1};task.communityMasterApproval=null;task.updatedAt=now;
 version(task,before,`选用${kind==='illustration'?'插画':kind==='title'?'主标':kind==='subtitle'?'副标':'Logo'}：${name}`,now);
 return task;
}

export function removeCommunityMaterial(task,{name,expectedUpdatedAt},template,{now=new Date().toISOString()}={}){
 if(!template?.communityMaster)fail('请在母版制作页面移除素材');
 const asset=task.assets.find(a=>a.name===name);
 if(!asset||!['illustration','title','subtitle','logo'].includes(materialKind(asset)))fail('素材不存在或不能从素材库移除');
 if(asset.libraryDeletedAt)return {task,masterChanged:false};
 if(task.updatedAt!==expectedUpdatedAt)fail('画面已更新，请刷新后再移除素材',409);
 const before=bannerMasterSnapshot(task),p=task.parameters,id=template.id,bindings=p.assetByTemplate?.[id]||{};
 let masterChanged=false;
 for(const [kind,selected]of Object.entries(bindings))if(selected===name){
  bindings[kind]=null;(p.layoutByTemplate||={})[id]||={};p.layoutByTemplate[id][kind]={...(p.layoutByTemplate[id][kind]||{}),visible:false};
  if(kind==='background')(p.backgroundByTemplate||={})[id]={focalX:50,focalY:50,scale:100,smartExpand:false,url:''};
  masterChanged=true;
 }
 asset.libraryDeletedAt=now;task.updatedAt=now;
 // Preserve the file for other sizes and previous compositions. Removing a
 // thumbnail must never break already generated targets or historical versions.
 if(masterChanged){task.communityMasterApproval=null;version(task,before,`移除素材：${name}`,now);}
 (task.history||=[]).push({at:now,action:`从素材库移除：${name}`,by:'设计师',status:task.status});
 return {task,masterChanged};
}
