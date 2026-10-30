export const communityWorkspaceReadOnly=task=>task?.status==='已完成'&&!!task.deliveredPackage;

// Stage navigation is a read action for delivered work. Never save, sync or
// start a new version just to view its existing target compositions.
export async function changeCommunityWorkspaceStage(state,stage,{flush,synchronize,render,notify}={}){
 if(!['master','sizes'].includes(stage)||!state.task)return false;
 if(state.task.customCanvas&&stage==='sizes'){notify('自定义尺寸任务直接导出当前画布');return false;}
 const taskId=state.task.id,readOnly=communityWorkspaceReadOnly(state.task);
 if(!readOnly){if(!await flush()||state.task?.id!==taskId)return false;}
 const task=state.task;
 if(stage==='sizes'){
  if(!task.targetTemplateIds?.length){notify('此任务还没有目标尺寸');return false;}
  if(!readOnly&&!task.communityMasterApproval?.at){notify('请先确认母版');return false;}
  if(!readOnly&&task.parameters?.communityMaterialWorkflow?.version>=1&&!task.parameters?.communityArtworkByTemplate?.[task.masterTemplateId]){
   try{const fresh=await synchronize(task);if(state.task?.id!==taskId)return false;state.task=fresh;}
   catch(error){notify(error.message);return false;}
  }
 }
 if(task.targetTemplateIds?.includes(state.previewTemplateId))(state.communityLastTargetTemplateIds||={})[taskId]=state.previewTemplateId;
 const remembered=state.communityLastTargetTemplateIds?.[taskId];
 state.communityWorkspaceStage=stage;
 state.previewTemplateId=stage==='master'?task.masterTemplateId:task.targetTemplateIds.includes(remembered)?remembered:task.targetTemplateIds[0];
 state.previewMode='target';state.showGuides=false;state.inspectorElement='background';render();return true;
}

export function disableDeliveredEditing(root,{modern=false}={}){
 const selectors=['.editor-commandbar button:not(#editor-toggle-guides)', '.editor-assets-panel button', '.editor-assets-panel input', '.community-input-card input', '.community-input-card textarea', '.community-ai-panel button', '.community-ai-panel textarea', '.inspector-body input', '.inspector-body select', '.community-candidate-confirm button', '#editor-add-size', '.canvas-zoom button'];
 if(modern)selectors.push('.editor-assets-panel textarea','.master-sidebar-content input','.master-sidebar-content textarea','.master-sidebar-content select','.master-sidebar-content button','.master-version','.master-version-import input');
 for(const control of root.querySelectorAll(selectors.join(',')))if(!control.matches('[data-preview-template],[data-target-scroll]'))control.disabled=true;
 const canvas=root.querySelector('#preview-canvas');if(canvas){canvas.tabIndex=-1;canvas.style.pointerEvents='none';}
}
