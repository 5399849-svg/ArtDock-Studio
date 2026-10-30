export const usesTaskSizeName=(task,template)=>Boolean(task?.sourceAdaptation||template?.communityPlacement&&!template?.communityMaster);
export function taskSizeImageName(task,template,format=template.format||'PNG'){
 const name=String(task.project||task.name||'未命名任务').trim().replace(/[<>:"/\\|?*\x00-\x1f]/g,'-').replace(/\s+/g,'_').replace(/^[. ]+|[. ]+$/g,'').slice(0,100)||'未命名任务';
 const extension=String(format).toLowerCase().replace(/^image\//,'').replace(/^jpeg$/,'jpg');
 return `${name}_${template.width}x${template.height}.${extension}`;
}
