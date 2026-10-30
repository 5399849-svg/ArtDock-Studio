import {customCanvasSpec,customCanvasTemplate} from './custom-canvas-model.js';

export function customTargetTemplate(value){
 const spec=customCanvasSpec(value),base=customCanvasTemplate(spec);
 return {...base,id:`custom-target-${spec.width}x${spec.height}-${spec.format.toLowerCase()}`,name:`自定义 ${spec.width}×${spec.height}`,customCanvas:false,customTarget:true,communityMaster:false,segmentId:'custom-target',categoryId:'custom-target',family:'自定义尺寸'};
}
// Definitions travel with the task and its copies; they never enter the system catalog.
export function registerCustomTargets(task,templateMap){
 const templates=(task?.customTargetSizes||[]).map(customTargetTemplate);
 for(const template of templates)templateMap.set(template.id,template);
 return templates;
}
