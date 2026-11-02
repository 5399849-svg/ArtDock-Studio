import test from 'node:test';
import assert from 'node:assert/strict';
import {createStoreZip} from '../lib/core.mjs';
import {renamedTaskArchive,taskArtifactExportName} from '../lib/task-export-names.mjs';
import {taskSizeImageName} from '../public/task-output-name.js';

const entries=buffer=>{const result=[];let offset=0;while(buffer.readUInt32LE(offset)===0x04034b50){const length=buffer.readUInt16LE(offset+26),size=buffer.readUInt32LE(offset+18),start=offset+30+length;result.push({name:buffer.subarray(offset+30,start).toString(),data:buffer.subarray(start,start+size)});offset=start+size;}return result;};
test('renamed archived downloads preserve image bytes and stored archive while updating folder, filenames and report',()=>{
  const image=Buffer.from('approved immutable image bytes'),zip=createStoreZip([{name:'旧任务/01_Banner成品/旧任务_Banner_400x400_v2.jpg',data:image},{name:'旧任务/生产报告.json',data:Buffer.from(JSON.stringify({taskId:'id',project:'旧任务',artifacts:[{name:'旧任务_Banner_400x400_v2.jpg'}]}))}]),before=Buffer.from(zip);
  const same=renamedTaskArchive(zip,'旧任务_成套素材_v2.zip','旧任务');assert.equal(same.buffer,zip);
  const renamed=renamedTaskArchive(zip,'旧任务_成套素材_v2.zip','新任务'),files=entries(renamed.buffer);
  assert.equal(renamed.name,'新任务_成套素材_v2.zip');assert.equal(files[0].name,'新任务/01_Banner成品/新任务_Banner_400x400_v2.jpg');assert.deepEqual(files[0].data,image);
  const report=JSON.parse(files[1].data);assert.equal(report.project,'新任务');assert.equal(report.artifacts[0].name,'新任务_Banner_400x400_v2.jpg');assert.deepEqual(zip,before);
});
test('current core files export with the latest task name and keep their original version and resource-only conventions',()=>{
  const template={name:'Banner',width:400,height:400,format:'JPG'};
  assert.equal(taskArtifactExportName({project:'新名字'},{name:'旧名字_Banner_400x400_v3.jpg'},template),'新名字_Banner_400x400_v3.jpg');
  assert.equal(taskArtifactExportName({project:'新名字'},{name:'Banner_400x400.jpg'},template),'Banner_400x400.jpg');
});
test('community single and ZIP exports use task name plus dimensions without renaming stored assets',()=>{
 const template={name:'公众号·推文封面',width:900,height:383,format:'PNG',communityPlacement:true},artifact={name:'旧任务_公众号_900x383_v2.png',width:900,height:383,format:'PNG'},task={project:'每日签到banner',artifacts:[artifact]};
 assert.equal(taskSizeImageName(task,template),'每日签到banner_900x383.png');
 assert.equal(taskArtifactExportName(task,artifact,template),'每日签到banner_900x383.png');assert.equal(artifact.name,'旧任务_公众号_900x383_v2.png');
 const second={...artifact,name:'另一资源位.png'};task.artifacts.push(second);assert.equal(taskArtifactExportName(task,second,template),'每日签到banner_900x383_2.png');
 assert.equal(taskSizeImageName({project:'活动/测试'}, {...template,format:'JPEG'}),'活动-测试_900x383.jpg');
});
