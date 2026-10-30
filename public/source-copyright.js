import {copyrightColorAt} from './community-copyright.js';

export const SOURCE_COPYRIGHT_ID='source-ip-copyright';
const family='Arial,"Microsoft YaHei",sans-serif';

export function sourceCopyrightRequired(task,template,project){
 return Boolean(task?.sourceAdaptation&&template?.id!==task.masterTemplateId&&template?.ipCopyright===true&&project?.isIpProject);
}
export function sourceCopyrightLayout(template){
 const w=template.width,h=template.height,[x,y,width,height]=template.communityLayout?.copyright||(w<h?[.66,.94,.28,.035]:[.76,.91,.21,.06]);
 return {x:x*w,y:y*h,width:width*w,height:height*h,visible:true,copyrightColorMode:'auto'};
}
export function validateSourceCopyright(value){
 if(!value||typeof value!=='object')throw Error('版权设置无效');
 for(const key of ['x','y','fontSize'])if(!Number.isFinite(value[key]))throw Error('版权位置或字号无效');
 if(value.x<0||value.y<0||value.x>60000||value.y>60000||value.fontSize<8||value.fontSize>200)throw Error('版权字号须为 8–200 px，位置须在画布内');
 if(!['auto','black','white'].includes(value.colorMode))throw Error('版权颜色请选择自动、黑色或白色');
 return {x:Math.round(value.x),y:Math.round(value.y),fontSize:Math.round(value.fontSize),colorMode:value.colorMode};
}
export function sourceCopyrightState(task,template,project){
 if(!sourceCopyrightRequired(task,template,project))return null;
 const composition=task.parameters?.sourceCompositionByTemplate?.[template.id],layers=composition?.layers||[],settings=composition?.copyright?validateSourceCopyright(composition.copyright):null;
 // Preserve a designer-supplied mark until the designer edits its native replacement.
 const embedded=!settings&&layers.find(l=>['ip-copyright','copyright'].includes(l.role)&&l.visible!==false&&l.width>0&&l.height>0&&l.x>=0&&l.y>=0&&l.x+l.width<=template.width&&l.y+l.height<=template.height);
 return {version:2,text:String(project.copyrightNotice||'').trim()||'©YUEWEN',embedded:embedded?.id||null,rect:sourceCopyrightLayout(template),...(settings?{settings}:{})};
}
export function sourceCopyrightKey(task,template,project){const state=sourceCopyrightState(task,template,project);return state?JSON.stringify(state):'';}
export function sourceCopyrightArtifactsCurrent(task,templates,project){
 return templates.every(t=>{const key=sourceCopyrightKey(task,t,project);return !key||task.artifacts?.find(a=>a.templateId===t.id)?.sourceCopyrightKey===key;});
}
export function sourceCopyrightElement(ctx,task,template,project){
 const state=sourceCopyrightState(task,template,project);if(!state)return null;
 if(state.embedded){const layer=task.parameters.sourceCompositionByTemplate[template.id].layers.find(l=>l.id===state.embedded);return {...layer,id:SOURCE_COPYRIGHT_ID,label:'IP 版权',text:state.text,fontSize:Math.max(8,Math.min(200,Math.round(layer.height*.7))),colorMode:'auto',embedded:state.embedded};}
 let fontSize=state.settings?.fontSize||Math.max(14,Math.min(18,Math.round(Math.min(template.width*.018,template.height*.055)))),width;
 ctx.save();do{ctx.font=`400 ${fontSize}px ${family}`;width=Math.ceil(ctx.measureText(state.text).width)+2;if(width<=template.width&&fontSize*1.5<=template.height||fontSize<=8)break;fontSize--;}while(true);ctx.restore();
 const height=Math.ceil(fontSize*1.5),box=state.rect;
 const x=Math.round(Math.max(0,Math.min(template.width-width,state.settings?.x??box.x+box.width-width))),y=Math.round(Math.max(0,Math.min(template.height-height,state.settings?.y??box.y+(box.height-height)/2)));
 return {id:SOURCE_COPYRIGHT_ID,role:'ip-copyright',label:'IP 版权',text:state.text,x,y,width,height,fontSize,colorMode:state.settings?.colorMode||'auto',visible:true,embedded:state.embedded};
}
export function drawSourceCopyright(ctx,task,template,project){
 const state=sourceCopyrightState(task,template,project);if(!state||state.embedded)return null;
 const element=sourceCopyrightElement(ctx,task,template,project),{x,y,width,height,fontSize,colorMode,text}=element,matrix=ctx.getTransform();
 const bounds={x:x*matrix.a+matrix.e,y:y*matrix.d+matrix.f,width:width*matrix.a,height:height*matrix.d};
 const fill=colorMode==='black'?'#000000':colorMode==='white'?'#ffffff':copyrightColorAt(ctx,bounds);
 ctx.save();ctx.font=`400 ${fontSize}px ${family}`;ctx.textAlign='left';ctx.textBaseline='middle';ctx.fillStyle=fill;
 ctx.shadowColor='transparent';ctx.shadowBlur=0;ctx.shadowOffsetX=ctx.shadowOffsetY=0;
 // Native text is rerasterized at the current preview/export resolution, never enlarged from a small bitmap.
 ctx.fillText(text,x,Math.round(y+height/2));ctx.restore();
 return {fill,element};
}
