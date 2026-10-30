import fs from 'node:fs/promises';
import sharp from 'sharp';
import {safeChild} from './core.mjs';
import {bannerSourceToken} from './community-banner-session.mjs';
import {normalizeCommunityMaterial,selectCommunityMaterial} from './community-materials.mjs';
import {ensureCommunityObjects} from './community-object-assets.mjs';
import {chooseCharacterMatte,layeredCharacterRequest,layeredBackgroundRequest,normalizeLayeredCharacter,illustrationPlacementGuide,illustrationHash} from './community-layered-illustration.mjs';

const now=()=>new Date().toISOString();
// One designer action owns two durable stages. Completed stages and unknown
// submission receipts are always reused; local validation never pays for a retry.
export async function runLayeredIllustration({id,runId,load,update,storageDir,templateMap,loadConfig,createCanvas,submitGeneration,pollJob,downloadRaw,invalidate}){
  let task=await load(id),run=task.communityGeneration;
  const template=templateMap.get(run.templateId),dir=safeChild(storageDir,id,'material-generation',runId);
  await fs.mkdir(dir,{recursive:true});
  const readAsset=async name=>{
    const a=task.assets.find(a=>a.name===name&&!a.libraryDeletedAt);if(!a)throw Error('本批次使用的参考素材已移除');
    const buffer=await fs.readFile(safeChild(storageDir,id,a.bucket||'assets',a.name)),hash=illustrationHash(buffer);
    if(run.assetHashes?.[name]&&run.assetHashes[name]!==hash)throw Error('本批次参考素材文件已变化，停止处理，原始回执保留');
    if(!run.assetHashes?.[name]){await update(id,runId,t=>{(t.communityGeneration.assetHashes||={})[name]=hash;});(run.assetHashes||={})[name]=hash;}
    return buffer;
  };
  const stageUpdate=async(kind,values)=>update(id,runId,t=>Object.assign(t.communityGeneration.steps.find(s=>s.kind===kind),values));
  const generate=async(kind,request)=>{
    task=await load(id);run=task.communityGeneration;let step=run.steps.find(s=>s.kind===kind);
    const rawPath=safeChild(dir,`${kind}-raw.png`);
    if(step.rawFile){const raw=await fs.readFile(rawPath);if(illustrationHash(raw)!==step.rawSha256)throw Error('已保存的生成结果发生变化，停止处理');return raw;}
    const config=await loadConfig(task);if(config.enabled===false)throw Error('画布服务尚未启用');
    const requestPath=safeChild(dir,`${kind}-request.json`);
    if(!step.providerJobId){
      if(step.submittedAt&&Date.now()-Date.parse(step.submittedAt)>23*3600000)throw Object.assign(Error('本次提交已超过安全查询时限，请核对原任务回执'),{materialStatus:'interrupted'});
      let body;if(step.submittedAt)body=JSON.parse(await fs.readFile(requestPath,'utf8'));
      else{body=await request();await fs.writeFile(requestPath,JSON.stringify(body));}
      let canvasId=run.canvasId;
      if(!canvasId){canvasId=await createCanvas(config,{title:`${task.project} 配套插画`});await update(id,runId,t=>{t.communityGeneration.canvasId=canvasId;});}
      body.canvas_id=canvasId;
      const key=step.providerRequestKey||illustrationHash(`community-layered:${id}:${runId}:${kind}`);
      await stageUpdate(kind,{status:'running',stage:'submitting',submittedAt:step.submittedAt||now(),providerRequestKey:key});
      let jobId;try{jobId=await submitGeneration(config,body,{idempotencyKey:key});}
      catch(error){if(![400,401,402,403,422].includes(Number(error.code||error.status)))error.materialStatus='interrupted';throw error;}
      await stageUpdate(kind,{providerJobId:jobId,stage:'processing'});step={...step,providerJobId:jobId};
    }
    await pollJob(config,step.providerJobId);
    const raw=(await downloadRaw(config,step.providerJobId)).buffer;
    await fs.writeFile(rawPath,raw);await stageUpdate(kind,{rawFile:`${kind}-raw.png`,rawSha256:illustrationHash(raw),stage:'normalizing'});return raw;
  };
  try{
    const original=run.illustration.characterMode==='original';
    let character;
    const previous=run.steps.find(s=>s.kind==='character');
    if(previous.status==='done'&&previous.outputSha256){
      const buffer=await fs.readFile(safeChild(dir,'character.png')),source=await fs.readFile(safeChild(dir,'character-source.png'));
      if(illustrationHash(buffer)!==previous.outputSha256||illustrationHash(source)!==previous.sourceSha256)throw Error('已完成的角色文件发生变化，停止处理');
      character={buffer,source,bounds:previous.bounds};
    }else if(original){await stageUpdate('character',{status:'running'});character=await normalizeLayeredCharacter(await readAsset(run.illustration.characterSourceName),{original:true});}
    else{
      await stageUpdate('character',{status:'running'});
      const refs=await Promise.all(run.referenceNames.map(readAsset));
      if(run.illustration.characterSourceName&&run.illustration.sourceIndex<0)refs.push(await readAsset(run.illustration.characterSourceName));
      if(!run.characterMatte){const matte=await chooseCharacterMatte(refs);await update(id,runId,t=>{t.communityGeneration.characterMatte=matte;});run.characterMatte=matte;}
      const raw=await generate('character',()=>layeredCharacterRequest(run,refs));
      character=await normalizeLayeredCharacter(raw,{matte:run.characterMatte});
    }
    await fs.writeFile(safeChild(dir,'character.png'),character.buffer);
    await fs.writeFile(safeChild(dir,'character-source.png'),character.source);
    await stageUpdate('character',{status:'done',stage:'ready',bounds:character.bounds,outputSha256:illustrationHash(character.buffer),sourceSha256:illustrationHash(character.source),completedAt:now(),...(original?{reusedSource:true}:{})});
    await update(id,runId,t=>{t.communityGeneration.done=1;t.communityGeneration.stage='background';});
    await stageUpdate('background',{status:'running'});
    const guide=await illustrationPlacementGuide(character.buffer,run);
    const backgroundRaw=await generate('background',async()=>layeredBackgroundRequest(run,[...await Promise.all(run.referenceNames.map(readAsset)),character.buffer,guide]));
    const background=await normalizeCommunityMaterial(backgroundRaw,'illustration',undefined,run.canvas);
    await fs.writeFile(safeChild(dir,'background.png'),background);
    await stageUpdate('background',{status:'done',stage:'ready',completedAt:now()});
    await update(id,runId,t=>{t.communityGeneration.done=2;t.communityGeneration.stage='composing';});
    const preview=await illustrationPlacementGuide(character.buffer,run,{background});
    const names={background:`背景-${runId}.png`,character:`角色-${runId}.png`,source:`角色源图-${runId}.png`,preview:`组合预览-${runId}.png`};
    const assetDir=safeChild(storageDir,id,'assets');await fs.mkdir(assetDir,{recursive:true});
    const time=now(),assets=[];
    for(const [kind,buffer]of [['background',background],['character',character.buffer],['source',character.source],['preview',preview]]){
      const name=names[kind],meta=await sharp(buffer).metadata();await fs.writeFile(safeChild(assetDir,name),buffer);
      assets.push({name,mime:'image/png',width:meta.width,height:meta.height,bytes:buffer.length,url:`/storage/${id}/assets/${encodeURIComponent(name)}`,materialRunId:runId,createdAt:time,
        role:kind==='background'?'mother-candidate':kind==='character'?'community-object-character':kind==='source'?'source-character':'layered-preview',
        ...(kind==='background'?{materialKind:'illustration',sceneCharacters:{mode:'independent-character'},layeredIllustration:{version:1,runId,characterId:runId,characterName:names.character,placement:run.composition.character,previewName:names.preview}}:{}),
        ...(kind==='character'?{transparent:true,displayName:'角色',characterMode:run.illustration.characterMode,sourceAssetName:run.illustration.characterSourceName||null,cutoutBounds:character.bounds,cutoutSource:{name:names.source,bucket:'assets',mode:'asset'},sourceSha256:illustrationHash(character.source)}:{}),
        generatorModel:original&&kind==='character'?'original-source':run.model});
    }
    await update(id,runId,current=>{
      const job=current.communityGeneration;
      if(job.savedAt)return;
      const unchanged=bannerSourceToken(current)===job.sourceToken;
      current.assets.push(...assets.filter(a=>!current.assets.some(existing=>existing.name===a.name)));
      const state=ensureCommunityObjects(current);state.characters.push({id:runId,name:'角色',assetName:names.character,sourceName:names.background,materialRunId:runId,createdAt:time});state.revision++;
      let applied=false;
      if(unchanged){
        selectCommunityMaterial(current,{name:names.background,expectedUpdatedAt:current.updatedAt},template,{now:time});
        // selectCommunityMaterial records a complete paired snapshot, including the object layer.
        invalidate(current,'生成配套背景与角色，待确认母版');applied=true;
      }
      Object.assign(job,{status:'done',stage:'ready',done:2,assetName:names.background,characterAssetName:names.character,previewAssetName:names.preview,applied,savedAt:time,completedAt:time});
      current.updatedAt=time;
      (current.history||=[]).push({at:time,action:`同批生成背景与独立角色${applied?'并组合':'，已保存配套素材'}：${job.prompt}`,by:'设计师',status:current.status});
    });
  }catch(error){
    await update(id,runId,t=>{const step=t.communityGeneration.steps.find(s=>s.status==='running');if(step)Object.assign(step,{status:error.materialStatus==='interrupted'?'interrupted':'failed',error:error.message});}).catch(()=>{});
    throw error;
  }
}
