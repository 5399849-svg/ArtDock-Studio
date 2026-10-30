import {createHash} from 'node:crypto';
import {planBannerEdit,applyBannerLayoutOperations,BANNER_LAYER_KINDS,shouldGenerateBannerBacking} from '../public/banner-edit-plan.js';
import {communityObjectLayerAssetNames} from '../public/community-object-layers.js';

const fail=(message,status=422)=>{throw Object.assign(new Error(message),{status});};
const clone=value=>structuredClone(value);
export function bannerSourceToken(task){
  const p=task.parameters || {};
  return createHash('sha256').update(JSON.stringify({master:task.masterTemplateId,copy:task.copy,subtitle:p.subtitleText,copyReference:p.communityCopyReference,
    assets:task.assets,layout:p.layoutByTemplate?.[task.masterTemplateId],bindings:p.assetByTemplate?.[task.masterTemplateId],background:p.backgroundByTemplate?.[task.masterTemplateId],
    ...(p.communityObjectLayersByTemplate?.[task.masterTemplateId]?.length?{objects:p.communityObjectLayersByTemplate[task.masterTemplateId]}:{}),fonts:[p.titleFontId,p.subtitleFontId,p.titleFontAsset,p.subtitleFontAsset,p.communityMaterialFontIds]})).digest('hex');
}

export function bannerMasterSnapshot(task){
  const p=task.parameters || {},id=task.masterTemplateId;
  return {masterTemplateId:id,copy:task.copy || '',subtitleText:p.subtitleText || '',layout:clone(p.layoutByTemplate?.[id] || {}),
    assets:clone(p.assetByTemplate?.[id] || {}),background:clone(p.backgroundByTemplate?.[id] || {}),
    ...(p.communityArtworkByTemplate?.[id]?{artwork:clone(p.communityArtworkByTemplate[id])}:{}),
    ...(p.communityObjectLayersByTemplate?.[id]?.length?{objectLayers:clone(p.communityObjectLayersByTemplate[id])}:{}),
    fonts:Object.fromEntries(['titleFontId','subtitleFontId','titleFontAsset','subtitleFontAsset','titleFontSource','subtitleFontSource','titleDesignTheme','communityMaterialFontIds'].filter(k=>p[k]).map(k=>[k,clone(p[k])]))};
}

export function validateBannerDesignInput(task,input,template,library={}){
  if(!['design','edit'].includes(input.mode))fail('请选择生成完整母版或修改当前母版');
  if(input.expectedUpdatedAt!==task.updatedAt)fail('母版已更新，请刷新后再提交修改',409);
  const prompt=String(input.prompt || '').trim().slice(0,1600);
  if(!prompt)fail('请填写创作或修改要求');
  const plan=planBannerEdit(prompt,{mode:input.mode});
  if(input.mode==='edit' && plan.unresolved.length)fail(`这段要求还不能明确执行：${plan.unresolved.join('；')}。请写明图层和修改，例如“人物缩小10%，副标底板改成纸质题签，其余保留”。`);
  if(input.mode==='edit' && !plan.operations.length)fail('请描述需要修改的图层和具体要求');
  const unsupported=plan.operations.filter(op=>op.type==='design' && !['background','title','subtitle-backing'].includes(op.kind));
  if(unsupported.length)fail(`未提交修改：暂时无法执行“${unsupported.map(op=>op.prompt).join('；')}”。副标文字内容和字体可在左侧文字区修改；位置、大小和沿底板倾斜可直接在这里描述。`);
  const layouts={};
  for(const [kind,value] of Object.entries(input.layouts || {})){
    if(!BANNER_LAYER_KINDS.includes(kind) && !['foreground','ip-copyright','character2'].includes(kind))continue;
    if(!value || !['x','y','width','height'].every(k=>Number.isFinite(value[k])) || value.width<=0 || value.height<=0 || value.width>template.width*3 || value.height>template.height*3 || Math.abs(value.x)>template.width*3 || Math.abs(value.y)>template.height*3)fail('母版图层尺寸无效');
    layouts[kind]=clone(value);
    if(value.backing?.assetName && !(task.assets || []).some(a=>a.name===value.backing.assetName && a.role==='subtitle-backing'))fail('副标底板素材不存在');
  }
  for(const kind of ['title','subtitle','character','logo'])if(!layouts[kind])fail('缺少母版布局，请刷新后重试');
  let nextLayouts=layouts;
  if(input.mode==='edit'){
    const moved=applyBannerLayoutOperations(layouts,template,plan.operations);
    const failed=moved.skipped.filter(op=>!['design','compose','follow-backing'].includes(op.type || op.operation?.type));
    if(failed.length)fail('部分图层没有可修改的位置，请先确认素材已添加');
    nextLayouts=moved.layouts;
  }
  const includeBacking=shouldGenerateBannerBacking(prompt,task.parameters?.subtitleText);
  const aiKinds=input.mode==='design'?['background','title',...(includeBacking?['subtitle-backing']:[])]:[...new Set(plan.operations.filter(op=>op.type==='design').map(op=>op.kind))];
  if(plan.operations.some(op=>op.type==='follow-backing')){
    if(!String(task.parameters?.subtitleText || '').trim())fail('请先填写副标文字，再让副标跟随底板倾斜');
    if((input.masterAssets || task.parameters?.assetByTemplate?.[task.masterTemplateId])?.subtitle)fail('当前副标是整张图片，无法单独倾斜文字；请先改用文字区的副标');
    if(!aiKinds.includes('subtitle-backing') && (!nextLayouts['subtitle-backing']?.backing?.enabled || nextLayouts['subtitle-backing'].visible===false))fail('请先添加并显示副标底板，再让副标跟随底板倾斜');
  }
  const needsTitle=aiKinds.includes('title');
  const chosen=library?.fonts || [];
  const titleFont=chosen.find(font=>font.id===input.titleFontId);
  const subtitleFont=chosen.find(font=>font.id===input.subtitleFontId);
  if(needsTitle && !titleFont)fail('请先在公司版权字体库选择主标字体');
  if(input.mode==='design' && String(task.parameters?.subtitleText || '').trim() && !subtitleFont)fail('副标缺少可用的公司字体');
  if(aiKinds.includes('subtitle-backing') && !String(task.parameters?.subtitleText || '').trim())fail('请先填写副标文字再生成底板');
  if(aiKinds.includes('subtitle-backing') && !layouts['subtitle-backing'])fail('副标底板缺少独立图层布局，请刷新后重试');
  if(input.mode==='design' && !includeBacking && nextLayouts['subtitle-backing']){
    nextLayouts['subtitle-backing'].visible=false;
    if(nextLayouts['subtitle-backing'].backing)nextLayouts['subtitle-backing'].backing.enabled=false;
  }
  const titleFontSource=['manual','project','automatic'].includes(input.titleFontSource)?input.titleFontSource:'automatic';
  const titleDesignTheme=['playful','calligraphic','display'].includes(input.titleDesignTheme)?input.titleDesignTheme:'display';
  return {mode:input.mode,prompt,plan,layouts:nextLayouts,includeBacking,aiKinds,titleFont,subtitleFont,titleFontSource,titleDesignTheme,sourceToken:bannerSourceToken(task)};
}

export function commitBannerDesign(task,{run,assets,bindings,now=new Date().toISOString()}){
  if(bannerSourceToken(task)!==run.sourceToken)fail('生成期间母版素材或版式发生变化，结果未覆盖当前画面，请重新提交。',409);
  const before=bannerMasterSnapshot(task);
  const p=task.parameters ||= {},id=task.masterTemplateId;
  p.layoutByTemplate ||= {};p.assetByTemplate ||= {};p.backgroundByTemplate ||= {};
  p.layoutByTemplate[id]=clone(run.layouts);
  if(p.communityArtworkByTemplate)delete p.communityArtworkByTemplate[id];
  p.assetByTemplate[id]={...(p.assetByTemplate[id] || {}),...run.masterAssets,...bindings};
  if(bindings.background)p.backgroundByTemplate[id]={focalX:50,focalY:50,scale:100,smartExpand:false,url:''};
  if(run.mode==='design'){
    p.assetByTemplate[id].subtitle=null;
    p.titleFontId=run.titleFont.id;delete p.titleFontAsset;
    p.titleFontSource=run.titleFontSource || 'automatic';p.titleDesignTheme=run.titleDesignTheme || 'display';
    if(run.subtitleFont){p.subtitleFontId=run.subtitleFont.id;delete p.subtitleFontAsset;}
  }else if(bindings.title && run.titleFont){p.titleFontId=run.titleFont.id;delete p.titleFontAsset;}
  task.assets.push(...assets);
  const design=task.communityDesign ||= {schemaVersion:1,versions:[]};
  design.versions ||= [];
  if(!design.versions.length)design.versions.push({id:`before-${run.runId}`,at:now,label:'修改前',snapshot:before});
  design.versions.push({id:run.runId,at:now,label:run.prompt.slice(0,100),mode:run.mode,snapshot:bannerMasterSnapshot(task)});
  design.versions=design.versions.slice(-12);design.currentVersionId=run.runId;
  if(run.mode==='design')design.brief=run.prompt;
  design.lastInstruction=run.prompt;design.updatedAt=now;
  p.communityDesignDraft='';
  task.communityMasterApproval=null;
  task.updatedAt=now;
  return task;
}

export function restoreBannerVersion(task,versionId,now=new Date().toISOString()){
  const version=task.communityDesign?.versions?.find(v=>v.id===versionId);
  if(!version || version.snapshot.masterTemplateId!==task.masterTemplateId)fail('该母版版本不存在');
  const s=version.snapshot,p=task.parameters ||= {},id=task.masterTemplateId;
  for(const name of Object.values(s.assets))if(name && !(task.assets || []).some(a=>a.name===name))fail('该版本的原素材已移除，无法恢复');
  const backingName=s.layout?.['subtitle-backing']?.backing?.assetName;
  if(backingName && !task.assets.some(a=>a.name===backingName))fail('该版本的副标底板素材已移除，无法恢复');
  for(const layer of s.objectLayers||[])for(const name of communityObjectLayerAssetNames(layer))if(!task.assets.some(a=>a.name===name))fail('该版本的独立素材已移除，无法恢复');
  p.layoutByTemplate ||= {};p.assetByTemplate ||= {};p.backgroundByTemplate ||= {};
  p.layoutByTemplate[id]=clone(s.layout);p.assetByTemplate[id]=clone(s.assets);p.backgroundByTemplate[id]=clone(s.background);
  if(s.objectLayers||p.communityObjectLayersByTemplate?.[id]) (p.communityObjectLayersByTemplate||={})[id]=clone(s.objectLayers||[]);
  p.communityArtworkByTemplate ||= {};
  if(s.artwork)p.communityArtworkByTemplate[id]=clone(s.artwork);else delete p.communityArtworkByTemplate[id];
  for(const key of ['titleFontId','subtitleFontId','titleFontAsset','subtitleFontAsset','titleFontSource','subtitleFontSource','titleDesignTheme','communityMaterialFontIds']){delete p[key];if(s.fonts[key])p[key]=clone(s.fonts[key]);}
  p.subtitleText=s.subtitleText;task.copy=s.copy;task.communityMasterApproval=null;
  task.communityDesign.currentVersionId=versionId;task.updatedAt=now;
  return task;
}
