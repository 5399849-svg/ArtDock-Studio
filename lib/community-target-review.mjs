import {communityTargetHasComposition,communityTargetReviewSnapshot} from '../public/community-artwork-state.js';
const fail=(message,status=409)=>{throw Object.assign(Error(message),{status});};
export function approveCommunityTargetDrafts(task,input,templates,{now=new Date().toISOString()}={}){
 if(input?.confirmed!==true)fail('请先检查现有尺寸稿，再确认输出');
 if(input.expectedUpdatedAt!==task.updatedAt)fail('尺寸稿已更新，请刷新检查后再确认');
 if(!task.communityMasterApproval?.fingerprint)fail('请先确认母版');
 if(task.communityGeneration?.status==='running'||task.outpaint?.status==='running')fail('请等待当前生成完成后再确认');
 if(task.status==='已完成'&&task.deliveredPackage)fail('此版已交付，请先开始新版本');
 const ids=task.targetTemplateIds||[];
 if(!ids.length||templates.length!==ids.length||templates.some(t=>!ids.includes(t.id)||!t.communityPlacement))fail('目标尺寸已变化，请刷新后确认');
 const missing=templates.filter(t=>!communityTargetHasComposition(task,t));
 if(missing.length)fail(`还有 ${missing.map(t=>`${t.width}×${t.height}`).join('、')} 没有尺寸稿，母版参考不能作为成品输出`);
 for(const template of templates)(task.communityTargetReviews||={})[template.id]={at:now,by:'设计师',snapshot:structuredClone(communityTargetReviewSnapshot(task,template))};
 task.updatedAt=now;(task.history||=[]).push({at:now,action:`确认当前 ${ids.length} 张尺寸稿，按已检查画面成套输出，保留手动构图`,by:'设计师',status:task.status});return task;
}
