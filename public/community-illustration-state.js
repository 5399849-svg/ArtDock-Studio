import {communityMaterialReferences} from './community-references.js';

export const layeredIllustrationWorkflow='layered-illustration-v1';
export function illustrationCharacterSources(task){
  const refs=communityMaterialReferences(task,'illustration');
  const numbered=new Map(refs.map((asset,i)=>[asset.name,`图${i+1}`]));
  return (task.assets||[]).filter(a=>a.mime?.startsWith('image/')&&!a.libraryDeletedAt&&
    (numbered.has(a.name)||['character','core-character','secondary-character','community-object-character'].includes(a.role)))
    .map(a=>({...a,label:numbered.get(a.name)||a.displayName||a.name}));
}
export function illustrationOptions(task){
  const value=task.parameters?.communityIllustrationOptions||{};
  // Old hidden dropdown values must never override a new designer prompt.
  // A fresh, visible menu choice is the only way to opt into exact PNG reuse.
  const original=value.version===2&&value.characterMode==='original';
  return {version:2,characterMode:original?'original':'prompt',characterSourceName:original?value.characterSourceName||'':'',action:'',side:'auto'};
}
export function illustrationProgress(run){
  if(run?.workflow!==layeredIllustrationWorkflow)return '';
  if(run.status==='done')return run.applied?'✓ 背景与角色已组合，可分别调整':'✓ 配套素材已保存，点击背景方案使用';
  const done=(run.steps||[]).filter(s=>s.status==='done').length;
  if(['failed','interrupted'].includes(run.status))return `${done}/2 · 配套素材尚未完成`;
  const step=(run.steps||[]).find(s=>s.status==='running'||s.status==='interrupted');
  return `${done}/2 · ${step?.kind==='character'?'正在处理角色':step?.kind==='background'?'正在生成背景':run.stage==='composing'?'正在组合预览':'准备配套素材'}`;
}
