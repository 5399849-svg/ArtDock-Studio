import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import sharp from 'sharp';
import {safeChild} from './core.mjs';
import {preserveObjectCutout} from './community-object-jobs.mjs';
import {normalizeSourceSelection,sourceSelectionContext} from '../public/source-selection-model.js';
import {sourceMergedLayer} from '../public/source-adaptation-model.js';
import {sourceRemovalMask,repairSourceScene} from './source-scene-repair.mjs';
import {localPython} from '../platform/local-compute.mjs';
const exec=promisify(execFile);
export async function segmentSourcePixels(input){return (await segmentSourcePeople({...input,selections:[input.selection]}))[0];}
export async function segmentSourcePeople({root,sourceBuffer,selections,workDir}){
 const {width,height}=await sharp(sourceBuffer).metadata();
 const objects=selections.map(selection=>({name:'原稿人物',box:selection.box.map((n,i)=>Math.round(n*(i%2?height:width))),points:selection.points.map(p=>[Math.round(p.x*width),Math.round(p.y*height)]),labels:selection.points.map(p=>p.label)}));
 const input=path.join(workDir,'source.png'),prompts=path.join(workDir,'prompts.json'),guided=path.join(workDir,'guided-prompts.json'),mask=path.join(workDir,'mask.png'),refined=path.join(workDir,'refined.png');
 await fs.writeFile(input,sourceBuffer);await fs.writeFile(prompts,JSON.stringify({objects}));
 const env={...process.env,PYTHONIOENCODING:'utf-8',OMP_NUM_THREADS:'1',OPENBLAS_NUM_THREADS:'1'};
 await localPython([path.join(root,'scripts/source-character-guidance.py'),'--input',input,'--prompts',prompts,'--output',guided],{cwd:root,windowsHide:true,env,timeout:180000,maxBuffer:1048576});
 const parts=path.join(workDir,'parts');
 await localPython([path.join(root,'scripts/sam2-character-cutout.py'),'--input',input,'--prompts',guided,'--output',mask,'--separate-output',parts,'--max-side','1024','--device',process.env.SOURCE_CUTOUT_DEVICE||'auto'],{cwd:root,windowsHide:true,env,timeout:600000,maxBuffer:1048576});
 const hints=JSON.parse(await fs.readFile(guided,'utf8')).objects,result=[];
 for(let index=0;index<selections.length;index++){
  const individual=path.join(workDir,`individual-${index}.json`);await fs.writeFile(individual,JSON.stringify({objects:[hints[index]]}));
  await localPython([path.join(root,'scripts/refine-community-cutout.py'),'--input',input,'--mask',path.join(parts,`${index}.png`),'--prompts',individual,'--output',refined,'--keep-accessories'],{cwd:root,windowsHide:true,env,timeout:180000,maxBuffer:1048576});
  result.push(await fs.readFile(refined));
 }
 return result;
}
export function chooseSourceBackground(width,height,bounds,region){
 let r;
 if(region){
  if(!Array.isArray(region)||region.length!==4||region.some(v=>!Number.isFinite(v)||v<0||v>1)||region[2]<=region[0]||region[3]<=region[1])throw Error('请框选有效的无人背景区域');
  const left=Math.round(region[0]*width),top=Math.round(region[1]*height);r={left,top,width:Math.round(region[2]*width)-left,height:Math.round(region[3]*height)-top};
 }else{
  const candidates=[{left:0,top:0,width,height:Math.max(0,bounds.top-4),priority:1.5},{left:0,top:bounds.top+bounds.height+4,width,height:Math.max(0,height-bounds.top-bounds.height-4),priority:1},{left:0,top:0,width:Math.max(0,bounds.left-4),height,priority:.6},{left:bounds.left+bounds.width+4,top:0,width:Math.max(0,width-bounds.left-bounds.width-4),height,priority:.6}];
  r=candidates.filter(c=>c.width>=32&&c.height>=32).sort((a,b)=>b.width*b.height*b.priority-a.width*a.height*a.priority)[0];
 }
 if(!r||r.width<32||r.height<32||r.width*r.height<width*height*.04)throw Error('原图没有足够的无人背景，请重新框选背景取景区域或使用分层源稿');
 return {left:r.left,top:r.top,width:r.width,height:r.height};
}
// Creates new assets only. Publishing their references happens later under the JSON writer lock.
export function validateSourceSelections(input){
 const values=input.selections||[input.selection];
 if(!Array.isArray(values)||!values.length||values.length>6)throw Error('请分别框选 1 至 6 个角色');
 const selections=values.map(normalizeSourceSelection);
 for(let i=0;i<selections.length;i++)for(let j=0;j<i;j++){
  const a=selections[i].box,b=selections[j].box,intersection=Math.max(0,Math.min(a[2],b[2])-Math.max(a[0],b[0]))*Math.max(0,Math.min(a[3],b[3])-Math.max(a[1],b[1]));
  if(intersection/((a[2]-a[0])*(a[3]-a[1])+(b[2]-b[0])*(b[3]-b[1])-intersection)>.85)throw Error('两个角色的选框重复，请分别框选不同角色');
 }
 return selections;
}
export async function prepareSourceReflow({root,storageDir,task,input,segment=segmentSourcePixels,repairBackground=repairSourceScene}){
 const s=task.sourceAdaptation,layer=sourceMergedLayer(task);if(!layer)throw Error('当前源稿没有需要分离的合并画面');
 const selections=validateSourceSelections(input),sourcePath=safeChild(storageDir,task.id,'assets',layer.assetName);
 const sourceBuffer=await fs.readFile(sourcePath),meta=await sharp(sourceBuffer).metadata();
 const workDir=await fs.mkdtemp(safeChild(storageDir,task.id,'source-reflow-'));
 try{
  const cutouts=[],effectiveSelections=selections.map(sourceSelectionContext);
  const batch=segment===segmentSourcePixels?await segmentSourcePeople({root,sourceBuffer,selections:effectiveSelections,workDir}):null;
  for(const [index,selection] of effectiveSelections.entries()){
   const mask=batch?.[index]||await segment({root,sourceBuffer,selection,workDir,index});
   cutouts.push(await preserveObjectCutout(sourceBuffer,mask,selection,{withBounds:true}));
  }
  const sameSelection=JSON.stringify(s.reflow?.selections||[s.reflow?.selection])===JSON.stringify(selections);
  const method=s.reflow?.backgroundMethod;
  const retainedBackground=s.reflow?.backgroundMode==='full-scene'&&s.reflow.sourceHash===s.sourceHash&&(!method||method==='uploaded-scene'||method==='selected-region-scene-repair-v2'&&sameSelection)?s.reflow.layers.find(l=>l.role==='background'):null;
  let background;
  if(!retainedBackground){
   // Erase the complete selection context, not just the accepted character
   // alpha. Otherwise every missed pearl, sleeve or rope is baked into the scene.
   const maskBuffer=await sourceRemovalMask(sourceBuffer,cutouts,effectiveSelections);
   background=await repairBackground({root,storageDir,task,sourceBuffer,maskBuffer,cutouts});
   const m=await sharp(background).metadata();if(m.width!==meta.width||m.height!==meta.height)throw Error('补全背景尺寸与原稿不一致');
  }
  const token=randomUUID(),assets=[],layers=retainedBackground?[structuredClone(retainedBackground)]:[];
  for(const item of [...(background?[{role:'background',buffer:background,label:'完整场景背景',key:'background'}]:[]),...cutouts.map((c,i)=>({role:'character',buffer:c.buffer,label:`原图人物 ${i+1}`,key:i?'character-'+(i+1):'character',bounds:c.bounds}))]){
   const {role,buffer,label,key,bounds}=item,name=`源稿重排-${token}-${key}.png`,m=await sharp(buffer).metadata();await fs.writeFile(safeChild(storageDir,task.id,'assets',name),buffer,{flag:'wx'});
   assets.push({name,role:'source-reflow-'+role,mime:'image/png',width:m.width,height:m.height,bytes:buffer.length,url:`/storage/${task.id}/assets/${encodeURIComponent(name)}`,sourceAssetName:layer.assetName,sourceHash:s.sourceHash,method:role==='background'?'selected-region-scene-repair-v2':'source-complete-mask-v2',createdAt:new Date().toISOString()});
   layers.push({id:'source-reflow-'+key,assetName:name,role,label,x:0,y:0,width:m.width,height:m.height,visible:true,...(bounds?{sourceBounds:bounds}:{})});
  }
  return {assets,reflow:{version:4,sourceHash:s.sourceHash,sourceLayerId:layer.id,selections,effectiveSelections,selection:selections[0],backgroundRegion:null,backgroundMode:'full-scene',backgroundMethod:retainedBackground?s.reflow.backgroundMethod||'uploaded-scene':'selected-region-scene-repair-v2',characterBounds:cutouts[0].bounds,layers}};
 }finally{
  const parent=path.resolve(storageDir,task.id)+path.sep,resolved=path.resolve(workDir);
  if(resolved.startsWith(parent)&&path.basename(resolved).startsWith('source-reflow-'))await fs.rm(resolved,{recursive:true,force:true});
 }
}
