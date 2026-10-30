import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import sharp from 'sharp';
import {safeChild} from './core.mjs';
import {mutateJson} from './json-store.mjs';

const fail=(message,status=422)=>Object.assign(Error(message),{status});
const read=async(file,fallback=[])=>{try{return JSON.parse(await fs.readFile(file,'utf8'));}catch(error){if(error.code==='ENOENT')return fallback;throw error;}};
const isLogo=asset=>asset?.role==='logo'||/logo|带标语|不带标语/i.test(asset?.name||'');
export const projectLogoAssets=project=>(project?.assets||[]).filter(asset=>asset.role==='logo'&&asset.id);

export function createProjectLogoLibrary({runtimeDir,storageDir}){
  const projectsFile=path.join(runtimeDir,'projects.json');
  async function projectFor(id,{active=false}={}){
    const project=(await read(projectsFile)).find(project=>project.id===id);
    if(!project)throw fail('所选项目不存在，请重新选择',404);
    if(active&&project.status==='archived')throw fail('项目已归档，请先恢复项目');
    return project;
  }
  async function localFile(url){
    if(typeof url!=='string'||!url.startsWith('/storage/'))throw fail('Logo 地址无效');
    let parts;try{parts=url.slice(9).split('/').map(decodeURIComponent);}catch{throw fail('Logo 地址无效');}
    if(parts.some(part=>!part||part==='.'||part==='..'||/[\\/\u0000]/.test(part)))throw fail('Logo 地址无效');
    const file=await fs.realpath(safeChild(storageDir,...parts));
    const base=await fs.realpath(storageDir),relative=path.relative(base,file);
    if(relative.startsWith('..')||path.isAbsolute(relative))throw fail('Logo 地址无效');
    return file;
  }
  async function candidates(project){
    const assets=[...(project.assets||[]).filter(isLogo).map(asset=>({...asset,origin:'项目素材'}))];
    const links=await read(path.join(runtimeDir,'workbench-project-links.json'),{});
    const brands=await read(path.join(runtimeDir,'brands.json'));
    assets.push(...(brands.find(brand=>brand.id===project.brandId)?.assets||[]).filter(isLogo).map(asset=>({...asset,origin:'项目品牌包'})));
    for(const [module,file] of [['core','tasks.json'],['ad-resources','ad-resources-jobs.json']]){
      for(const task of await read(path.join(runtimeDir,file))){
        const key=`${module}:${task.id}`,owner=Object.hasOwn(links,key)?links[key]:task.archiveProjectId??task.projectId;
        if(owner!==project.id)continue;
        assets.push(...(task.assets||[]).filter(asset=>asset.role==='logo').map(asset=>({...asset,origin:`任务：${task.project}`})));
      }
    }
    const seen=new Set();return assets.filter(asset=>asset.url?.startsWith('/storage/')&&!seen.has(asset.url)&&seen.add(asset.url)).map(({id,name,url,origin})=>({id,name,url,origin}));
  }
  async function inspect(buffer){
    if(!buffer.length||buffer.length>20*1024*1024)throw fail('Logo 需要小于 20MB');
    const meta=await sharp(buffer,{limitInputPixels:25_000_000}).metadata().catch(()=>null);
    if(!meta?.width||!meta?.height||!['png','jpeg','webp'].includes(meta.format))throw fail('Logo 请使用 PNG、JPG 或 WebP 图片');
    if(meta.orientation&&meta.orientation!==1){buffer=await sharp(buffer).rotate().png().toBuffer();return inspect(buffer);}
    return {buffer,width:meta.width,height:meta.height,extension:meta.format==='jpeg'?'jpg':meta.format,mime:`image/${meta.format}`};
  }
  return {
    async projects(){return (await read(projectsFile)).filter(project=>project.status!=='archived').map(project=>({id:project.id,name:project.name,status:project.status,defaultLogoId:project.defaultLogoId||'',assets:projectLogoAssets(project)}));},
    async list(id){const project=await projectFor(id);return {logos:projectLogoAssets(project),defaultLogoId:project.defaultLogoId||'',candidates:await candidates(project)};},
    async add(id,input){
      const project=await projectFor(id,{active:true});let buffer,name;
      if(input?.sourceUrl){
        const source=(await candidates(project)).find(asset=>asset.url===input.sourceUrl);
        if(!source)throw fail('请选择这个项目已有的 Logo 素材');
        buffer=await fs.readFile(await localFile(source.url));name=source.name;
      }else{
        const match=/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/i.exec(String(input?.dataUrl||''));
        if(!match)throw fail('请选择 Logo 图片');
        if(match[2].length>28*1024*1024)throw fail('Logo 需要小于 20MB');
        buffer=Buffer.from(match[2],'base64');name=input.name||'项目 Logo';
      }
      const info=await inspect(buffer),sha256=createHash('sha256').update(info.buffer).digest('hex');
      const existing=projectLogoAssets(project).find(asset=>asset.sha256===sha256);
      if(existing)return {asset:existing,...await this.list(id)};
      const assetId=randomUUID(),file=`logo-${assetId}.${info.extension}`,target=safeChild(storageDir,'projects',id,file);
      await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,info.buffer);
      const asset={id:assetId,name:String(input.name||name).trim().slice(0,100)||'项目 Logo',role:'logo',mime:info.mime,width:info.width,height:info.height,bytes:info.buffer.length,sha256,url:`/storage/projects/${encodeURIComponent(id)}/${file}`,createdAt:new Date().toISOString()};
      try{await mutateJson(projectsFile,projects=>{const current=projects.find(p=>p.id===id);if(!current||current.status==='archived')throw fail('项目已变更，请刷新后重试');current.assets??=[];current.assets.push(asset);current.defaultLogoId ||= asset.id;current.updatedAt=new Date().toISOString();});}
      catch(error){await fs.unlink(target).catch(()=>{});throw error;}
      return {asset,...await this.list(id)};
    },
    async setDefault(id,logoId){
      if(typeof logoId!=='string')throw fail('Logo 标识无效');
      await mutateJson(projectsFile,projects=>{const project=projects.find(p=>p.id===id);if(!project)throw fail('项目不存在',404);if(project.status==='archived')throw fail('项目已归档');if(logoId&&!projectLogoAssets(project).some(asset=>asset.id===logoId))throw fail('Logo 不属于当前项目');project.defaultLogoId=logoId;project.updatedAt=new Date().toISOString();});
      return this.list(id);
    },
    async copyToTask({projectId,logoId='default',folder,bucket='assets'}){
      if(!projectId){if(logoId&&logoId!=='default')throw fail('请先选择项目');return null;}
      const project=await projectFor(projectId,{active:true});
      if(logoId===''||logoId===null)return null;
      const chosen=logoId==='default'?project.defaultLogoId:logoId;if(!chosen)return null;
      const asset=projectLogoAssets(project).find(asset=>asset.id===chosen);if(!asset)throw fail('项目 Logo 已变更，请重新选择');
      const info=await inspect(await fs.readFile(await localFile(asset.url)));
      const id=randomUUID(),file=`project-logo-${id}.${info.extension}`,target=safeChild(storageDir,folder,bucket,file);
      await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,info.buffer);
      return {id,name:asset.name,role:'logo',mime:info.mime,width:info.width,height:info.height,bytes:info.buffer.length,sha256:createHash('sha256').update(info.buffer).digest('hex'),url:`/storage/${folder}/${bucket}/${file}`,file,projectId,projectLogoId:asset.id,createdAt:new Date().toISOString()};
    }
  };
}
