import test from 'node:test';
import assert from 'node:assert/strict';
import {changeCommunityWorkspaceStage,disableDeliveredEditing} from '../public/community-workspace-navigation.js';
import {renderMasterWorkspace} from '../public/community-master-page.js';
const fixture=()=>({
 task:{id:'task',status:'已完成',deliveredPackage:{name:'approved.zip',sha256:'keep'},masterTemplateId:'master',targetTemplateIds:['wide','square'],communityMasterApproval:{at:'approved'},parameters:{communityMaterialWorkflow:{version:1},layoutByTemplate:{wide:{title:{x:25}}}}},
 communityWorkspaceStage:'master',previewTemplateId:'master',showGuides:true
});
test('delivered step navigation opens existing sizes without saving, syncing or modifying the approved task',async()=>{
 const state=fixture(),task=structuredClone(state.task);let renders=0;const actions={flush:()=>assert.fail('viewing must not save a delivered task'),synchronize:()=>assert.fail('viewing must not POST synchronization'),render:()=>renders++,notify:()=>assert.fail('existing sizes are viewable')};
 assert.equal(await changeCommunityWorkspaceStage(state,'sizes',actions),true);assert.equal(state.communityWorkspaceStage,'sizes');assert.equal(state.previewTemplateId,'wide');assert.equal(state.previewMode,'target');assert.equal(renders,1);assert.deepEqual(state.task,task);
 state.previewTemplateId='square';await changeCommunityWorkspaceStage(state,'master',actions);assert.equal(state.previewTemplateId,'master');await changeCommunityWorkspaceStage(state,'sizes',actions);assert.equal(state.previewTemplateId,'square','returning to sizes keeps the last inspected size');assert.deepEqual(state.task,task);
});
test('a delivered task still opens its size previews when a prior save failed or old approval metadata is absent',async()=>{
 const state=fixture();delete state.task.communityMasterApproval;state.paramsSavePromise=Promise.resolve(false);
 assert.equal(await changeCommunityWorkspaceStage(state,'sizes',{flush:()=>state.paramsSavePromise,synchronize:()=>assert.fail('no mutation'),render:()=>{},notify:()=>assert.fail('viewing existing delivered sizes does not require reapproval')}),true);
 const html=renderMasterWorkspace(state.task,{canvas:'',inputs:'',ai:'',canExtend:false});const button=html.match(/<button[^>]*id="community-go-sizes"[^>]*>/)[0];assert.doesNotMatch(button,/disabled/);
});
test('editable navigation retains save and approval guards and synchronizes only after a successful save',async()=>{
 const state=fixture();state.task.status='批量生成';delete state.task.deliveredPackage;let syncs=0,renders=0;const notifications=[];
 const actions={flush:async()=>false,synchronize:async task=>{syncs++;return {...task,updatedAt:'synced'};},render:()=>renders++,notify:s=>notifications.push(s)};
 assert.equal(await changeCommunityWorkspaceStage(state,'sizes',actions),false);assert.equal(syncs,0);assert.equal(state.communityWorkspaceStage,'master');
 actions.flush=async()=>true;delete state.task.communityMasterApproval;assert.equal(await changeCommunityWorkspaceStage(state,'sizes',actions),false);assert.match(notifications.pop(),/确认母版/);assert.equal(syncs,0);
 state.task.communityMasterApproval={at:'approved'};assert.equal(await changeCommunityWorkspaceStage(state,'sizes',actions),true);assert.equal(syncs,1);assert.equal(state.task.updatedAt,'synced');assert.equal(renders,1);
});
test('sync errors and a task switch during save never send the user to a different task stage',async()=>{
 const state=fixture();state.task.status='批量生成';delete state.task.deliveredPackage;const messages=[];
 assert.equal(await changeCommunityWorkspaceStage(state,'sizes',{flush:async()=>true,synchronize:async()=>{throw Error('同步失败');},render:()=>assert.fail('stay in place'),notify:s=>messages.push(s)}),false);assert.equal(state.communityWorkspaceStage,'master');assert.deepEqual(messages,['同步失败']);
 assert.equal(await changeCommunityWorkspaceStage(state,'sizes',{flush:async()=>{state.task={...state.task,id:'different-task'};return true;},synchronize:()=>assert.fail('task changed'),render:()=>assert.fail('do not navigate the new task'),notify:()=>{}}),false);
});
test('delivered editing locks keep target selection and list navigation available, while disabling edits and canvas dragging',()=>{
 const target={disabled:false,matches:()=>true},scroll={disabled:false,matches:()=>true},upload={disabled:false,matches:()=>false},prompt={disabled:false,matches:()=>false},canvas={tabIndex:0,style:{}};
 const root={querySelectorAll:()=>[target,scroll,upload,prompt],querySelector:()=>canvas};disableDeliveredEditing(root,{modern:true});assert.equal(target.disabled,false);assert.equal(scroll.disabled,false);assert.equal(upload.disabled,true);assert.equal(prompt.disabled,true);assert.equal(canvas.style.pointerEvents,'none');assert.equal(canvas.tabIndex,-1);
});
