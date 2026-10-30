import path from 'node:path';
import {inflateRawSync} from 'node:zlib';
import {createStoreZip,sanitizeFileName,artifactName} from './core.mjs';
import {usesTaskSizeName,taskSizeImageName} from '../public/task-output-name.js';

export function taskArtifactExportName(task,artifact,template){
  if(template&&usesTaskSizeName(task,template)){
    const name=taskSizeImageName(task,template,artifact.format||template.format);
    const index=task.artifacts?.filter(a=>a.width===template.width&&a.height===template.height).findIndex(a=>a===artifact)??-1;
    return index>0?name.replace(/(\.[^.]+)$/,'_'+(index+1)+'$1'):name;
  }
  const version=/_v(\d+)\.[^.]+$/.exec(artifact.name||'');
  return template&&version?artifactName(task.project,template,Number(version[1])):artifact.name;
}

// Repackage only at download time: the approved archive and image bytes stay immutable.
export function renamedTaskArchive(buffer,archiveName,project){
  const match=/^(.*)(_成套素材_v\d+\.zip)$/.exec(archiveName);
  if(!match)return {buffer,name:archiveName};
  const before=match[1],after=sanitizeFileName(project),name=after+match[2];
  if(before===after)return {buffer,name:archiveName};
  const rename=value=>String(value).split('/').map(part=>part===before?after:part.startsWith(before+'_')?after+part.slice(before.length):part).join('/');
  const files=[];let offset=0;
  while(offset+30<=buffer.length&&buffer.readUInt32LE(offset)===0x04034b50){
    const method=buffer.readUInt16LE(offset+8),size=buffer.readUInt32LE(offset+18),length=buffer.readUInt16LE(offset+26),extra=buffer.readUInt16LE(offset+28),start=offset+30+length+extra;
    const original=buffer.subarray(offset+30,offset+30+length).toString('utf8');
    if(start+size>buffer.length||!([0,8].includes(method)))throw Error('交付包格式无效');
    let data=buffer.subarray(start,start+size);if(method===8)data=inflateRawSync(data);
    if(path.extname(original)==='.json'){
      try{const report=JSON.parse(data);if(report.taskId){report.project=project;for(const field of ['artifacts','pagePreviews'])if(Array.isArray(report[field]))report[field]=report[field].map(item=>({...item,name:rename(item.name)}));data=Buffer.from(JSON.stringify(report,null,2));}}catch{}
    }
    files.push({name:rename(original),data});offset=start+size;
  }
  if(!files.length)throw Error('交付包没有可下载文件');
  return {buffer:createStoreZip(files),name};
}
