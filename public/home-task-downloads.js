export const dashboardTaskKey=task=>task.key||`${task.module||'core'}:${task.id}`;

const saveBlob=(blob,name)=>{
  const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
};

export async function downloadHomeTasks(tasks,{fetchImpl=fetch,save=saveBlob,onProgress=()=>{}}={}){
  const selected=[...new Map(tasks.map(task=>[dashboardTaskKey(task),task])).values()];
  if(!selected.length)throw Error('请先选择任务');
  if(selected.length>200)throw Error('一次最多下载 200 个任务，请分批选择');
  onProgress(`正在打包 ${selected.length} 个任务…`);
  const response=await fetchImpl('/api/workbench/task-downloads',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tasks:selected.map(task=>({key:dashboardTaskKey(task),label:task.project||task.label||'未命名任务'}))})});
  if(!response.ok){const result=await response.json().catch(()=>({}));throw Error(result.failures?.map(task=>`${task.label}：${task.reason}`).join('；')||result.error||'批量下载未完成，请重试');}
  const downloaded=Number(response.headers.get('X-Workbench-Downloaded'))||selected.length,skipped=Number(response.headers.get('X-Workbench-Skipped'))||0;
  const blob=await response.blob();save(blob,`任务成品_${downloaded}项.zip`);
  return {downloaded,skipped};
}
