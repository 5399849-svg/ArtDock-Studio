import {customCanvasSpec,customCanvasTemplate} from '../public/custom-canvas-model.js';
import {communityObjectLayerRect} from '../public/community-object-layers.js';
import {mutateJson} from './json-store.mjs';
const clone=v=>structuredClone(v),fail=(message,status=422)=>Object.assign(Error(message),{status});
export function fitCustomCanvasLayout(layout,from,to){
 const scale=Math.min(to.width/from.width,to.height/from.height),dx=(to.width-from.width*scale)/2,dy=(to.height-from.height*scale)/2,result=clone(layout||{});
 for(const value of Object.values(result)){
  if(!value||!['x','y','width','height'].every(k=>Number.isFinite(value[k])))continue;
  value.x=dx+value.x*scale;value.y=dy+value.y*scale;value.width*=scale;value.height*=scale;
  for(const k of ['scaleBaseWidth','scaleBaseHeight','fontSize','letterSpacing','strokeWidth','shadowBlur','shadowOffsetX','shadowOffsetY'])if(Number.isFinite(value[k]))value[k]*=scale;
 }
 return result;
}
export function fitCustomCanvasObjects(layers,from,to){
 const scale=Math.min(to.width/from.width,to.height/from.height),dx=(to.width-from.width*scale)/2,dy=(to.height-from.height*scale)/2;
 return (layers||[]).map(layer=>{const rect=communityObjectLayerRect(layer,from);return {...clone(layer),size:Math.max(.05,layer.size*scale*Math.min(from.width,from.height)/Math.min(to.width,to.height)),x:((rect.x+rect.width/2)*scale+dx)/to.width,y:((rect.y+rect.height/2)*scale+dy)/to.height};});
}
export function remapCustomCanvasSnapshot(snapshot,to){
 const match=/^custom-canvas-(\d+)x(\d+)-(png|jpg)$/.exec(snapshot.masterTemplateId||'');if(!match)return snapshot;
 const from={width:Number(match[1]),height:Number(match[2])},next=clone(snapshot);next.masterTemplateId=to.id;next.fonts||={};next.layout=fitCustomCanvasLayout(next.layout,from,to);if(next.objectLayers)next.objectLayers=fitCustomCanvasObjects(next.objectLayers,from,to);if(next.artwork)next.background={...next.background,fit:'contain'};return next;
}
export function createCustomCanvasResizer({tasksFile,templateMap,jobs=new Map()}){
 return (id,input)=>mutateJson(tasksFile,tasks=>{
  const task=tasks.find(t=>t.id===id);if(!task)throw fail('任务不存在',404);if(!task.customCanvas)throw fail('此任务不是自定义尺寸任务');
  if(jobs.has(id)||task.communityGeneration?.status==='running'||task.communityObjectJob?.status==='running'||task.outpaint?.status==='running')throw fail('请等待当前生成完成后再修改画布尺寸',409);
  if(task.updatedAt!==input.expectedUpdatedAt)throw fail('画布已更新，请刷新后再修改尺寸',409);
  const spec=customCanvasSpec({...input,width:input.width,height:input.height,format:task.customCanvas.format}),from=customCanvasTemplate(task.customCanvas),to=customCanvasTemplate(spec);
  if(from.id===to.id)return task;
  const p=task.parameters||={},old=task.masterTemplateId;task.parameters=p;
  if(input.layouts){for(const [kind,value]of Object.entries(input.layouts)){if(!['background','character','character2','foreground','title','subtitle','subtitle-backing','logo','ip-copyright','button'].includes(kind)||!value||!['x','y','width','height'].every(k=>Number.isFinite(value[k]))||value.width<=0||value.height<=0||value.width>from.width*3||value.height>from.height*3)throw fail('当前图层尺寸无效，请刷新后重试');}
   (p.layoutByTemplate||={})[old]={...(p.layoutByTemplate?.[old]||{}),...clone(input.layouts)};
  }
  const hasArtwork=Boolean(p.communityArtworkByTemplate?.[old]);
  for(const [key,map]of Object.entries(p))if(key.endsWith('ByTemplate')&&map&&typeof map==='object'&&Object.hasOwn(map,old)){
   map[to.id]=key==='layoutByTemplate'?fitCustomCanvasLayout(map[old],from,to):key==='communityObjectLayersByTemplate'?fitCustomCanvasObjects(map[old],from,to):clone(map[old]);delete map[old];
  }
  if(hasArtwork){(p.backgroundByTemplate||={})[to.id]={...(p.backgroundByTemplate?.[to.id]||{}),fit:'contain'};}
  if(Number.isFinite(p.fontSize))p.fontSize*=Math.min(to.width/from.width,to.height/from.height);
  const at=new Date().toISOString();(task.customCanvasResizes||=[]).push({at,from:clone(task.customCanvas),to:spec});task.customCanvas=spec;task.masterTemplateId=to.id;task.targetTemplateIds=[to.id];task.masterCanvasId='custom';templateMap.set(to.id,to);
  if(task.artifacts?.length)task.version=(task.version||1)+1;task.artifacts=[];task.pagePreviews=[];task.qc=null;task.communityMasterApproval=null;task.customCanvasExport=null;delete task.coverPreview;
  if(task.status!=='草稿')task.status='主图制作';task.updatedAt=at;(task.history||=[]).push({at,action:`修改画布 ${from.width}×${from.height} → ${to.width}×${to.height}，素材等比适配`,by:'设计师',status:task.status});return task;
 });
}
