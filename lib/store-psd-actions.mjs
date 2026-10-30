import fs from 'node:fs/promises';
import {resolvePsdInputs} from './store-psd-inputs.mjs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import sharp from 'sharp';
import {safeChild} from './core.mjs';
import {renderLayeredStorePage, defaultLayerAdjustments} from './store-preorder.mjs';
import {generateElementCandidate} from './store-psd-ai.mjs';
import {localPython} from '../platform/local-compute.mjs';
const exec = promisify(execFile);
const fail = (message, status=422) => {const e=new Error(message); e.status=status; throw e;};

export function createPsdActions(ctx) {
  const {root,storageDir,jobStorage,config,persist,publicJob,renderLayerOutput,runGeneration}=ctx;
  const assetUrl=(job,bucket,file)=>`/storage/${jobStorage(job.id)}/${bucket}/${encodeURIComponent(file)}`;
  const touch=job=>{job.version++;job.reviewed=false;job.updatedAt=new Date().toISOString();};
  function selection(job,input) {
    const output=job.outputs.find(o=>o.channel===input.channel&&o.width===Number(input.width)&&o.height===Number(input.height)&&o.page===Number(input.page));
    if(!output) fail('页面不存在');
    const variant=output.height>output.width?'portrait':'landscape';
    const set=job.layerSets?.[`${variant}-${output.page}`];
    if(!set?.method?.startsWith('psd-direct')) fail('请先导入 PSD 真实图层');
    const spec=config.specs.find(s=>s.channel===output.channel&&s.width===output.width&&s.height===output.height);
    return {output,variant,set,spec};
  }
  async function importFiles(job,input) {
    const staging=`psd-${randomUUID()}`;
    job.status='running';job.error='';job.phase='读取 PSD 图层';await persist();
    try {
      const prepared=[];
      for(const variant of ['landscape','portrait']) {
        const source=await fs.realpath(String(input[variant]||''));
        const allowed=await fs.realpath(root);
        const relative=path.relative(allowed,source);
        if(relative.startsWith('..')||path.isAbsolute(relative)||!source.toLowerCase().endsWith('.psd')) fail('请选择项目目录内的 PSD 文件');
        const target=safeChild(storageDir,jobStorage(job.id),staging);
        await localPython([path.join(root,'scripts','store-psd-layer-export.py'),'--psd',source,'--output',target,'--variant',variant],{cwd:root,windowsHide:true,timeout:15*60*1000,maxBuffer:4*1024*1024,env:{...process.env,PYTHONPATH:path.join(root,'local-ai','psd-deps')}});
        for(let page=1;page<=6;page++) {
          const key=`${variant}-${page}`, dir=path.join(target,key);
          const manifest=JSON.parse(await fs.readFile(path.join(dir,'manifest.json'),'utf8'));
          const files=new Map();for(const l of manifest.layers) files.set(l.id,await fs.readFile(path.join(dir,l.file)));
          const rendered=await renderLayeredStorePage(files,manifest,{width:manifest.width,height:manifest.height,maxKB:20000});
          prepared.push({key,dir,manifest,page,variant,rendered});
        }
      }
      // Both PSDs must parse before the task's published assets change.
      await fs.writeFile(safeChild(storageDir,jobStorage(job.id),`before-${staging}.json`),JSON.stringify(job,null,2));
      for(const item of prepared) {
        const {key,dir,manifest,page,variant,rendered}=item;
        const dest=safeChild(storageDir,jobStorage(job.id),'layers',key);
        await fs.mkdir(dest,{recursive:true});
        // Immutable file names keep rollback and stale browsers safe.
        for(const layer of manifest.layers) {
          const newName=`${staging}-${layer.file}`;
          await fs.copyFile(path.join(dir,layer.file),path.join(dest,newName));layer.file=newName;
        }
        await fs.writeFile(path.join(dest,'manifest.json'),JSON.stringify(manifest,null,2));
        job.layerSets[key]={status:'ready',page,variant,method:manifest.method,manifest};
        const file=`${staging}-${key}.jpg`;
        await fs.mkdir(safeChild(storageDir,jobStorage(job.id),'source'),{recursive:true});
        await fs.writeFile(safeChild(storageDir,jobStorage(job.id),'source',file),rendered.buffer);
        job.sources=job.sources.filter(s=>s.page!==page||s.variant!==variant);
        job.sources.push({page,variant,name:`PSD ${variant} ${page}`,file,width:manifest.width,height:manifest.height,bytes:rendered.bytes});
      }
      job.psdSource={landscape:input.landscape,portrait:input.portrait,importedAt:new Date().toISOString()};
      job.candidates=[];
      // Refresh PSD pixels without discarding the designer's saved composition.
      // AI replacements are kept as separate files; only refreshed source pixels change.
      touch(job);await persist();
      await runGeneration(job.id);
      job.phase='';await persist();
    } catch(e) {job.status='failed';job.phase='';job.error=e.message;await persist();}
  }
  return async (job,action,input) => {
    if(action==='import') {
      if(job.status==='running'||job.candidates?.some(c=>c.status==='running')) fail('任务或 AI 候选正在处理，请稍后',409);
      const resolved=await resolvePsdInputs(root,input);
      void importFiles(job,resolved);
      return {status:202,value:publicJob(job)};
    }
    if(job.status!=='complete') fail('请等待任务完成',409);
    const {output,variant,set,spec}=selection(job,input);
    if(action==='project-logo'){
      if(!job.projectLogo)fail('此任务未选择项目 Logo');
      if(job.candidates?.some(candidate=>candidate.status==='running'))fail('请等待当前候选处理完成',409);
      const layer=set.manifest.layers.find(layer=>layer.id==='logo');if(!layer)fail('当前 PSD 没有独立 Logo 图层');
      const logo=job.projectLogo,buffer=await fs.readFile(safeChild(storageDir,jobStorage(job.id),'project-logo',logo.file));
      const meta=await sharp(buffer).metadata(),rect=layer.rect||{x:0,y:0,width:set.manifest.width*.25,height:set.manifest.height*.15};
      const width=Math.max(1,Math.min(rect.width,(set.manifest.height-rect.y)*meta.width/meta.height));
      const file=`project-logo-${randomUUID()}${path.extname(logo.file)}`;
      await fs.mkdir(safeChild(storageDir,jobStorage(job.id),'candidates'),{recursive:true});await fs.writeFile(safeChild(storageDir,jobStorage(job.id),'candidates',file),buffer);
      output.layerOverrides||={};output.layerOverrides.logo={file,url:assetUrl(job,'candidates',file),layer:{...layer,name:logo.name,visible:true,rect:{...rect,width,height:width*meta.height/meta.width}}};
      await renderLayerOutput(job,output,spec,set,output.layerAdjustment||defaultLayerAdjustments());
      touch(job);await persist();return {value:publicJob(job)};
    }
    if(action==='reuse') {
      if(output.page!==2) fail('请在第2页复用参数');
      const adjustment=input.adjustment||output.layerAdjustment||defaultLayerAdjustments();
      for(const page of [2,3,4,5,6]) {
        const target=job.outputs.find(o=>o.channel===output.channel&&o.width===output.width&&o.height===output.height&&o.page===page);
        if(!target) fail('六页输出不完整');
        await renderLayerOutput(job,target,spec,job.layerSets[`${variant}-${page}`],structuredClone(adjustment));
      }
      touch(job);await persist();return {value:publicJob(job)};
    }
    if(action==='candidate') {
      if(!['background','character'].includes(input.layerId)) fail('AI 仅修改背景或人物，文案与截图受保护');
      const layer=set.manifest.layers.find(l=>l.id===input.layerId);
      if(!layer) fail('此页没有独立的该元素');
      const prompt=String(input.prompt||'').trim();if(!prompt||prompt.length>2000) fail('请填写 1–2000 字修改要求');
      if(job.candidates?.some(c=>c.status==='running')) fail('已有 AI 候选正在生成',409);
      const reuse=input.reuseCandidateId?job.candidates?.find(c=>c.id===input.reuseCandidateId):null;
      const repairCover=Boolean(reuse?.layer?.protectedExpansion&&layer.compositeArtwork&&reuse.createdAt>=job.psdSource?.importedAt&&(!reuse.sourceFile||reuse.sourceFile===layer.file));
      if(input.reuseCandidateId&&(!reuse?.providerJobId||(!repairCover&&reuse.baseRevision!==job.version)||reuse.page!==output.page||reuse.channel!==output.channel||reuse.width!==output.width||reuse.height!==output.height||reuse.layerId!==layer.id)) fail('已有结果的素材或构图已变化，不能复用生成任务');
      const candidate={id:randomUUID(),status:'running',page:output.page,variant,channel:output.channel,width:output.width,height:output.height,layerId:layer.id,prompt,createdAt:new Date().toISOString(),baseRevision:job.version,sourceFile:layer.file};
      job.candidates||=[];job.candidates.push(candidate);await persist();
      void (async()=>{
        try {
          const active=repairCover?null:output.layerOverrides?.[layer.id];
          candidate.sourceFile=active?.file||layer.file;
          const buffer=await fs.readFile(active?safeChild(storageDir,jobStorage(job.id),'candidates',active.file):safeChild(storageDir,jobStorage(job.id),'layers',`${variant}-${output.page}`,layer.file));
          const generated=await generateElementCandidate({buffer,layer:{...layer,...active?.layer},manifest:set.manifest,spec,prompt,root,existingJobId:reuse?.providerJobId,canvasRect:repairCover?reuse.layer.rect:null,adjustment:output.layerAdjustment?.[layer.id],onSubmitted:async id=>{candidate.providerJobId=id;await persist();}});
          const file=`${candidate.id}.png`,dir=safeChild(storageDir,jobStorage(job.id),'candidates');await fs.mkdir(dir,{recursive:true});
          await fs.writeFile(path.join(dir,file),generated.buffer);
          Object.assign(candidate,{status:'ready',file,url:assetUrl(job,'candidates',file),layer:{...layer,...generated.layer},providerJobId:generated.jobId});
          const files=new Map();const m=structuredClone(set.manifest);
          for(const l of m.layers) {
            const override=output.layerOverrides?.[l.id];
            files.set(l.id,await fs.readFile(override?safeChild(storageDir,jobStorage(job.id),'candidates',override.file):safeChild(storageDir,jobStorage(job.id),'layers',`${variant}-${output.page}`,l.file)));
            if(override) Object.assign(l,override.layer);
            if(l.id===layer.id){Object.assign(l,candidate.layer);files.set(l.id,generated.buffer);}
          }
          const preview=await renderLayeredStorePage(files,m,spec,output.layerAdjustment||defaultLayerAdjustments());
          const previewFile=`${candidate.id}-preview.jpg`;await fs.writeFile(path.join(dir,previewFile),preview.buffer);candidate.previewUrl=assetUrl(job,'candidates',previewFile);
          if(candidate.layer.seamVersion===2) for(const old of job.candidates) {
            if(old.id!==candidate.id&&old.page===candidate.page&&old.channel===candidate.channel&&old.width===candidate.width&&old.height===candidate.height&&old.layerId===candidate.layerId&&old.status==='ready'&&old.layer?.seamVersion!==2)old.status='superseded';
          }
        }catch(e){candidate.status='failed';candidate.error=e.message;}
        await persist();
      })();
      return {status:202,value:publicJob(job)};
    }
    if(action==='apply'||action==='restore') {
      const candidate=job.candidates?.find(c=>c.id===input.candidateId);
      if(action==='apply'&&(!candidate||candidate.status!=='ready'||candidate.page!==output.page||candidate.width!==output.width||candidate.height!==output.height||candidate.channel!==output.channel)) fail('候选不属于当前页面或尚未完成');
      const id=action==='apply'?candidate.layerId:input.layerId;
      if(!['background','character'].includes(id)) fail('元素无效');
      const targets=job.outputs.filter(o=>o.channel===output.channel&&o.width===output.width&&o.height===output.height&&(o.page===output.page||(id==='background'&&output.page>=2&&o.page>=2)));
      for(const o of targets) {
        o.layerOverrides||={};
        if(action==='apply') o.layerOverrides[id]={file:candidate.file,layer:candidate.layer,url:candidate.url};else delete o.layerOverrides[id];
        await renderLayerOutput(job,o,spec,job.layerSets[`${variant}-${o.page}`],o.layerAdjustment||defaultLayerAdjustments());
      }
      touch(job);await persist();return {value:publicJob(job)};
    }
    fail('未知 PSD 操作',404);
  };
}
