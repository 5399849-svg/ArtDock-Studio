import fs from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {safeChild} from './core.mjs';
import {mutateJson} from './json-store.mjs';
import {createCommunityObjectJobs} from './community-object-jobs.mjs';
import {communityRewardGroups,normalizedRewardStyle} from '../public/community-object-state.js';
import {validateCommunityObjectLayers,refreshPlacedRewardAppearances} from '../public/community-object-layers.js';
import {objectFail,ensureCommunityObjects,touchCommunityObjects,assertCommunityObjectEdit,addCommunityRewards,communityCurrentSource,readCommunityCurrentSource,renderCommunityReward,communityObjectDownloadFiles,publishCommunityObjectPng} from './community-object-assets.mjs';
import {readEditableCutout,validateCutoutStrokes,applyCutoutStrokes} from './community-cutout-edit.mjs';
import {objectHash} from './community-object-assets.mjs';

export function createCommunityObjectController(options){
 const {tasksFile,storageDir,templateMap,jobs,publicTask=t=>t,readBody,segmentAvailable=async()=>true}=options;
 const worker=createCommunityObjectJobs(options),load=async id=>JSON.parse(await fs.readFile(tasksFile,'utf8')).find(t=>t.id===id);
 const json=(res,status,value)=>{const body=Buffer.from(JSON.stringify(value));res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Content-Length':body.length});res.end(body);};
 const mutate=(id,input,callback)=>mutateJson(tasksFile,async tasks=>{const task=tasks.find(t=>t.id===id);assertCommunityObjectEdit(task,input,{templateMap,jobs});await callback(task,ensureCommunityObjects(task));return task;});
 const handle=async(req,res,url)=>{
  const match=/^\/api\/tasks\/([a-f0-9-]{36})\/community-objects(?:\/(current|image|placed-image|cutout-edit|add|upload|update|remove|generate|resume|accept|discard))?$/.exec(url.pathname);if(!match)return false;
  const [,id,action]=match;
  try{
   const task=await load(id);if(!task)throw objectFail('任务不存在',404);
   if(!templateMap.get(task.masterTemplateId)?.communityMaster)throw objectFail('请在母版制作页面使用独立素材');
   if(req.method==='GET'&&!action){
    let currentSource;try{currentSource=communityCurrentSource(task);}catch{}
    json(res,200,{task:publicTask(task),currentSource:currentSource?{...currentSource,url:`/api/tasks/${id}/community-objects/current?v=${currentSource.token}`,width:3840,height:2160}:null,segmentAvailable:await segmentAvailable()});return true;
   }
   if(req.method==='GET'&&action==='current'){
    const source=communityCurrentSource(task);if(url.searchParams.get('v')&&url.searchParams.get('v')!==source.token)throw objectFail('当前生成稿已变化，请重新打开提取',409);
    const buffer=await readCommunityCurrentSource({storageDir,task,source,template:templateMap.get(task.masterTemplateId)});res.writeHead(200,{'Content-Type':'image/png','Content-Length':buffer.length,'Cache-Control':'no-store'});res.end(buffer);return true;
   }
   if(req.method==='GET'&&action==='cutout-edit'){
    const edit=await readEditableCutout({task,storageDir,templateMap,characterId:url.searchParams.get('characterId'),assetName:url.searchParams.get('assetName')}),part=url.searchParams.get('part');
    if(part){if(!['source','mask'].includes(part))throw objectFail('修边预览内容无效');const buffer=part==='source'?edit.source:edit.aligned;res.writeHead(200,{'Content-Type':'image/png','Content-Length':buffer.length,'Cache-Control':'no-store'});res.end(buffer);return true;}
    const base=`/api/tasks/${id}/community-objects/cutout-edit?${new URLSearchParams({characterId:edit.character.id,assetName:edit.asset.name})}`;
    json(res,200,{characterId:edit.character.id,assetName:edit.asset.name,width:edit.width,height:edit.height,sourceUrl:base+'&part=source',maskUrl:base+'&part=mask'});return true;
   }
   if(req.method==='GET'&&action==='image'){
    const reward=communityRewardGroups(task).find(r=>r.id===url.searchParams.get('rewardId'));if(!reward)throw objectFail('道具不存在',404);
    const part=url.searchParams.get('part')||'combo';if(!['combo','body','decoration'].includes(part))throw objectFail('下载内容无效');
    let style;try{style=url.searchParams.has('style')?JSON.parse(url.searchParams.get('style')):undefined;}catch{throw objectFail('样式设置无效');}
    const buffer=await renderCommunityReward({storageDir,task,reward,part,style,candidate:url.searchParams.get('candidate')==='1',thumbnail:url.searchParams.get('thumbnail')==='1'});
    const name=`${reward.name}_${part==='body'?'道具':part==='decoration'?'装饰':'组合'}.png`.replace(/[<>:"/\\|?*\x00-\x1f]/g,'_');
    res.writeHead(200,{'Content-Type':'image/png','Content-Length':buffer.length,'Cache-Control':'no-store',...(url.searchParams.get('download')==='1'?{'Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(name)}`}:{})});res.end(buffer);return true;
   }
   if(req.method==='GET'&&action==='placed-image'){
    let appearance;try{appearance=JSON.parse(url.searchParams.get('appearance'));}catch{throw objectFail('图层素材参数无效');}
    validateCommunityObjectLayers(task,{master:[{id:'preview',appearance,x:.5,y:.5,size:.3}]},['master']);
    let buffer;
    if(['character','material'].includes(appearance.kind))buffer=await fs.readFile(safeChild(storageDir,id,task.assets.find(a=>a.name===appearance.assetName).bucket||'assets',appearance.assetName));
    else{
     const style={...appearance.style,styleId:appearance.style.kind==='backing'?'placed':''},renderTask={...task,assets:task.assets.map(a=>({...a,libraryDeletedAt:undefined})),communityObjects:{styles:[{id:'placed',backingName:style.backingName,foregroundName:style.foregroundName}]}};
     buffer=await renderCommunityReward({storageDir,task:renderTask,reward:{sourceName:appearance.assetName,style}});
    }
    res.writeHead(200,{'Content-Type':'image/png','Content-Length':buffer.length,'Cache-Control':'private, max-age=0, must-revalidate'});res.end(buffer);return true;
   }
   if(req.method!=='POST'){json(res,405,{error:'不支持的独立素材操作'});return true;}
   const input=await readBody(req,30*1024*1024);
   if(action==='cutout-edit'){
    if(!/^[a-zA-Z0-9-]{8,80}$/.test(input.requestId||''))throw objectFail('缺少有效修边编号');validateCutoutStrokes(input.strokes);
    const signature=objectHash(JSON.stringify([input.characterId,input.assetName,input.strokes])),duplicate=task.assets.find(a=>a.cutoutEditRequestId===input.requestId);
    if(duplicate){if(duplicate.cutoutEditSignature!==signature)throw objectFail('修边编号对应的内容已变化',409);json(res,200,publicTask(task));return true;}
    const saved=await mutate(id,input,async(current,state)=>{
     const edit=await readEditableCutout({task:current,storageDir,templateMap,characterId:input.characterId,assetName:input.assetName}),result=await applyCutoutStrokes(edit.source,edit.aligned,input.strokes);
     const name=`当前稿人物-修边-${randomUUID()}.png`,asset=await publishCommunityObjectPng({storageDir,task:current,buffer:result.buffer,name,role:'community-object-character',extra:{sourceAssetName:edit.sourceRef.name,sourceSha256:edit.sourceSha256,cutoutSource:edit.sourceRef,cutoutBounds:result.bounds,cutoutEditRequestId:input.requestId,cutoutEditSignature:signature,extractionMethod:'source-pixel-mask-edit-v1'}});
     current.assets.push(asset);(edit.character.versions||=[]).push(edit.character.assetName);edit.character.assetName=name;
     let used=false;for(const layers of Object.values(current.parameters?.communityObjectLayersByTemplate||{}))for(const layer of layers)if(layer.appearance.kind==='character'&&layer.appearance.groupId===edit.character.id){layer.appearance.assetName=name;used=true;}
     if(used){current.communityMasterApproval=null;options.invalidate?.(current,'修整人物透明素材');}touchCommunityObjects(current);
    });json(res,200,publicTask(saved));return true;
   }
   if(action==='generate'){
    if(input.kind!=='style'&&!await segmentAvailable())throw objectFail('本机人物抠图组件尚未安装完整',503);
    json(res,202,publicTask(await worker.submit(id,input)));return true;
   }
   if(action==='resume'){json(res,202,publicTask(await worker.resume(id)));return true;}
   if(action==='add'){json(res,200,publicTask(await mutate(id,input,t=>addCommunityRewards(t,input.sourceNames))));return true;}
   if(action==='upload'){
    if(!/^[a-zA-Z0-9-]{8,80}$/.test(input.requestId||'')||!Array.isArray(input.files)||!input.files.length||input.files.length>20)throw objectFail('请选择有效的道具图片');
    const saved=await mutate(id,input,async(current,state)=>{
     if(state.uploadRequests?.includes(input.requestId))return;
     if(state.rewards.length+input.files.length>100)throw objectFail('一个任务最多管理 100 个奖励道具');
     const names=[];try{for(const file of input.files){
      const match=/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(file.dataUrl||'');if(!match)throw objectFail('道具图片需要 PNG、JPG 或 WebP');const buffer=Buffer.from(match[2],'base64');if(buffer.length>10*1024*1024)throw objectFail('单张道具图片不能超过 10MB');
      const decoded=await sharp(buffer,{limitInputPixels:16000000}).rotate().png().toBuffer(),name=`奖励原图-${randomUUID()}.png`,asset=await publishCommunityObjectPng({storageDir,task:current,buffer:decoded,name,role:'reward',extra:{label:String(file.name||'奖励道具').slice(0,100)}});current.assets.push(asset);names.push(name);
     }
     addCommunityRewards(current,names);for(const name of names){const reward=state.rewards.find(r=>r.sourceName===name),asset=current.assets.find(a=>a.name===name);reward.name=asset.label.replace(/\.[^.]+$/,'');}
     (state.uploadRequests||=[]).push(input.requestId);
     }catch(error){await Promise.all(names.map(name=>fs.rm(safeChild(storageDir,id,'assets',name),{force:true})));throw error;}
    });json(res,201,publicTask(saved));return true;
   }
   if(action==='update'){
    const saved=await mutate(id,input,(current,state)=>{
     const reward=state.rewards.find(r=>r.id===input.rewardId);if(!reward)throw objectFail('道具已移除');const style=normalizedRewardStyle(input.style,state.styles);
     for(const target of state.rewards)if(input.scope==='all'||target.id===reward.id)target.style={...style};touchCommunityObjects(current);
     refreshPlacedRewardAppearances(current,state.rewards.filter(r=>input.scope==='all'||r.id===reward.id).map(r=>r.id));
     if(Object.values(current.parameters?.communityObjectLayersByTemplate||{}).some(layers=>layers.some(l=>l.appearance.kind==='reward'&&(input.scope==='all'||l.appearance.groupId===reward.id)))){current.communityMasterApproval=null;options.invalidate?.(current,'调整画布道具样式');}
    });json(res,200,publicTask(saved));return true;
   }
   if(action==='remove'){
    const saved=await mutate(id,input,(current,state)=>{if(input.kind==='character')state.characters=state.characters.filter(c=>c.id!==input.id);else state.rewards=state.rewards.filter(r=>r.id!==input.id);touchCommunityObjects(current);});json(res,200,publicTask(saved));return true;
   }
   if(['accept','discard'].includes(action)){
    const saved=await mutate(id,input,(current,state)=>{
     const candidate=state.styleCandidate;if(!candidate||candidate.id!==input.candidateId)throw objectFail('样式候选已变化，请刷新后重试',409);
     if(action==='accept'){
      const targets=state.rewards.filter(r=>candidate.scope==='all'||r.id===candidate.rewardId);
      if(targets.length!==candidate.baseRewards.length||targets.some(r=>!candidate.baseRewards.some(base=>base.id===r.id&&JSON.stringify(base.style)===JSON.stringify(r.style))))throw objectFail('道具样式已调整，候选未覆盖新设置，请放弃后重新生成',409);
      const previous=state.styles.find(s=>s.id===candidate.baseStyle?.styleId),style={id:randomUUID(),name:candidate.name,...(previous?{backingName:previous.backingName,foregroundName:previous.foregroundName}:{}),...(candidate.backingName?{backingName:candidate.backingName}:{}),...(candidate.foregroundName?{foregroundName:candidate.foregroundName}:{})};
      state.styles.push(style);for(const reward of targets)reward.style={...reward.style,kind:'backing',styleId:style.id};
      refreshPlacedRewardAppearances(current,targets.map(r=>r.id));
      if(Object.values(current.parameters?.communityObjectLayersByTemplate||{}).some(layers=>layers.some(l=>targets.some(r=>r.id===l.appearance.groupId)))){current.communityMasterApproval=null;options.invalidate?.(current,'采用画布道具装饰');}
     }
     if(current.communityObjectJob?.runId===candidate.id)current.communityObjectJob.stage=action==='accept'?'adopted':'discarded';
     delete state.styleCandidate;touchCommunityObjects(current);
    });json(res,200,publicTask(saved));return true;
   }
   json(res,404,{error:'独立素材接口不存在'});return true;
  }catch(error){json(res,error.status||422,{error:error.message});return true;}
 };
 return {handle,restore:worker.restore,downloadFiles:task=>communityObjectDownloadFiles({storageDir,task})};
}
