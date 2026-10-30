import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {nearestBananaRatio,BANANA_RATIOS} from './ai-huabu.mjs';
import {bannerSourceToken,bannerMasterSnapshot} from './community-banner-session.mjs';

const clone=value=>structuredClone(value);
const fail=(message,status=422)=>{throw Object.assign(new Error(message),{status});};
const hiddenKinds=['character','character2','foreground','title','subtitle','subtitle-backing'];

export function communityArtworkRunSourceToken(task,run){
  const base=bannerSourceToken(task);
  if(run.mode!=='adapt')return base;
  const p=task.parameters || {},id=run.templateId;
  return createHash('sha256').update(JSON.stringify([base,p.layoutByTemplate?.[id],p.assetByTemplate?.[id],p.backgroundByTemplate?.[id],p.communityObjectLayersByTemplate?.[id]])).digest('hex');
}

export function communityArtworkAdaptPrompt(template){
  const layout=template.height>template.width*1.15
    ?'这是竖版，请重新组织上中下布局：顶部留出品牌位置，完整标题在上部占有足够面积，角色在中下部，头饰、脸、双手与关键道具完整，已有前景道具与人物建立透视关系。标题可以按实际文案的语义分行，字序不变，不能把整张横图缩成一条嵌入竖版。'
    :template.width/template.height<1.7?'这是方形或紧凑画幅，请重新安排标题与人物的比例，完整人物脸部、头饰与主要动作保留；标题醒目但不挡人物，前景道具适量，避免过挤。'
    :'这是横向画幅，请依照新比例重新分配标题区与角色区，文字、脸部、头饰和关键道具均须完整，不得裁切横版边缘来充数。';
  return `按最后一张当前母版重新设计 ${template.width}×${template.height} 的完整布局。${layout}母版是唯一成稿基准，人物数量、身份、服装、表情、主要动作、原有文字的笔触与材质、场景主题、天气、白天或夜晚、配色和光照均保持一致，只重排空间。只绘制母版已有的角色和准确文案，禁止复制角色或增加文字。不要拉伸、强行裁掉半张标题或半张脸。`;
}

export function prepareCommunityArtwork(task,input,template,{logoAspect=3}={}){
  if(!['concept','concept-edit','adapt'].includes(input.mode))fail('请选择整稿设计、修改整稿或尺寸重排');
  if(input.expectedUpdatedAt!==task.updatedAt)fail('画面已更新，请刷新后提交',409);
  const prompt=String(input.mode==='adapt'?communityArtworkAdaptPrompt(template)+(input.prompt?`\n【当前尺寸调整】${String(input.prompt).slice(0,1600)}`:''):input.prompt || '').trim().slice(0,3200);
  if(!prompt)fail('请填写创作或修改要求');
  if(!String(task.copy || '').trim())fail('请先填写最终主文案');
  if(!['banana_pro','gpt-image-2'].includes(input.model))fail('生图模型无效');
  const p=task.parameters || {},id=task.masterTemplateId;
  const master=p.communityArtworkByTemplate?.[id];
  if(input.mode==='adapt'){
    if(!master || template.id===id || !task.targetTemplateIds?.includes(template.id))fail('请先选择已生成整稿的母版和一个目标尺寸');
    if(master.copy!==String(task.copy).trim() || master.subtitle!==String(p.subtitleText || '').trim())fail('文案已变化，请先生成对应的母版修改稿');
  }
  const bindings=p.assetByTemplate?.[id] || {};
  const logo=template.brandLogo===false?null:bindings.logo || (task.assets || []).find(a=>a.role==='logo')?.name || null;
  const height=Math.min(template.width*.16/Math.max(.1,logoAspect),template.height*.16),width=height*Math.max(.1,logoAspect);
  const existingLogo=p.layoutByTemplate?.[id]?.logo;
  const preserveLogo=input.mode==='concept-edit' && template.id===id && existingLogo && ['x','y','width','height'].every(k=>Number.isFinite(existingLogo[k])) && existingLogo.width>0 && existingLogo.height>0;
  const logoLayout=preserveLogo?clone(existingLogo):{x:template.width*.96-width,y:template.height*.06,width,height,visible:Boolean(logo)};
  const run={mode:input.mode,prompt,model:input.model,copy:String(task.copy).trim(),subtitle:String(p.subtitleText || '').trim(),copyReference:String(p.communityCopyReference||'').trim().slice(0,1600),
    templateId:input.mode==='adapt'?template.id:id,templateSize:{width:template.width,height:template.height},logo,logoLayout,
    ...(input.mode==='adapt'?{sourceTemplateId:id,sourceArtworkName:master.assetName,sourceArtworkRunId:master.runId}:{})};
  run.sourceToken=communityArtworkRunSourceToken(task,run);return run;
}

export function communityArtworkRequest({run,template,references=[],referenceRoles=[],characters=[],current=null}){
  const images=[...references,...characters,...(current?[current]:[])];
  const referenceGuide=references.map((_,i)=>`输入第${i+1}张就是界面图${i+1}，${referenceRoles[i]==='reference-copy'?'这是文案参考图，只参考文字的字形、笔触、材质、字组和排版，不复制其中的旧文字、人物或背景。':'只按设计师明确指定的用途借鉴。'}`).join('\n');
  const exact=`主文案：${JSON.stringify(run.copy)}。${run.subtitle?`副文案：${JSON.stringify(run.subtitle)}。`:'副文案为空，不得添加祝福短句、解释、日期、标语或任何额外小字。'}`;
  const {x,y,width,height}=run.logoLayout;
  const ratio=nearestBananaRatio(template.width,template.height),providerRatio=BANANA_RATIOS[ratio],targetRatio=template.width/template.height;
  const cropWidth=Math.min(1,targetRatio/providerRatio),cropHeight=Math.min(1,providerRatio/targetRatio),cropX=(1-cropWidth)/2,cropY=(1-cropHeight)/2;
  const logoArea=[cropX+x/template.width*cropWidth,cropY+y/template.height*cropHeight,width/template.width*cropWidth,height/template.height*cropHeight].map(n=>(n*100).toFixed(1)).join('%、');
  const safeFrame=Math.abs(Math.log(providerRatio/targetRatio))>.025?`\n【交付比例与安全区域】服务输出画布为${ratio}，最终成品是${template.width}×${template.height}，将等比缩放后居中裁掉多余边缘。完整设计必须落在输入画布的中心安全区域：左${(cropX*100).toFixed(1)}%、上${(cropY*100).toFixed(1)}%、宽${(cropWidth*100).toFixed(1)}%、高${(cropHeight*100).toFixed(1)}%。所有标题、完整脸部、关键道具和品牌留位必须再向内留至少4%的安全距离；区域外只延续自然背景，不能安排关键内容，也不要画出边框、占位线或留白。`:'';
  const body={model:run.model,task_type:'image',bot_id:'canvas',ratio:nearestBananaRatio(template.width,template.height),image_size:template.communityMaster?'4K':'2K',output_format:'png',
    prompt:`【任务】${run.mode==='adapt'?'依据母版重新构图一张新尺寸成稿':run.mode==='concept-edit'?'修改一张完整的游戏活动设计稿':'创作一张完整的游戏活动设计稿'}，目标 ${template.width}×${template.height}。最终交付是整幅成稿，人物、场景、主副文案和字效必须在同一画面统一设计，不是背景图层、字效材质样片或版式线框。
【设计师要求，优先执行】${run.prompt}
【图片编号与用途】${referenceGuide || '没有编号参考图，按设计师描述原创。'}${characters.map((_,i)=>`\n输入第${references.length+i+1}张是独立角色素材，不属于界面参考图编号。保留该角色身份、服装和形象，结合描述安排姿态与场景。`).join('')}${current?`\n最后一张（输入第${images.length}张）为当前完整画面，不属于参考图编号。基于当前画面执行修改，未要求改变的内容、角色身份与画风保留。`:''}
【唯一最终文案】${exact}文案必须逐字准确、顺序正确，不复制参考图原有文字、品牌或水印。允许结合所指定参考重新设计字形、笔触、大小、换行和字组结构。字效是整稿中的原创视觉设计，不要求套用旧母版的字体或旧文字框。
${run.copyReference?`【文案参考说明】${run.copyReference}。此说明只指导字效和排版，实际文字仍以唯一最终文案为准。`:''}
【整体设计】按照指定参考的版式、绘画风格和色调来组织画面；仅被指定的方面才借鉴，未要求复制的场景围绕本次主题原创。优先建立标题与人物的视觉层级，再安排前中远景。让标题在手机缩略图上清楚可读，文字与背景有足够的明度和色相对比，可自然结合干净色块、轮廓、笔触或光影，但不可机械套一块文字贴片。主标应有设计感，与人物、季节和画风协调。角色设定图若有正侧背三视图，只取身份、服装与造型，按要求绘制一个自然姿态的角色，不能把整张设定表或多个人物复制进来。人物、手和道具接触准确，脸无遮挡。${run.mode==='concept'?'没有现成的标题框或人物框需要沿用，不受旧母版的构图约束。':'修改范围按设计师要求执行；没有要求整体重排时，保留当前标题、人物和场景的布局关系。'}四周留出安全边距，字不贴边、不被人物遮住，不拉伸画面。
【品牌】禁止画游戏Logo、商标、水印和品牌字样，参考图上的Logo也不能复制。${run.logo?`独立原Logo将在本地叠加，预留自然低干扰的品牌空间（左、上、宽、高分别为 ${logoArea}%）；不能在此生成假Logo、矩形占位框或白块。`:'本图不添加任何品牌标识。'}
【输出】只返回完整成稿图片。不要分屏、拼图、前后对比、色板、分析文字或额外装饰说明。${safeFrame}`};
  if(template.communityMaster)body.prompt=`${run.mode==='concept-edit'?'按要求修改当前完整母版':'设计一张完整的游戏活动 Banner'}，画幅 16:9，母版画布 1920×1080，以4K高质量输出。人物、场景和文案在同一张图中统一设计。
【设计师要求】${run.prompt}
【参考图】${referenceGuide||'按设计师描述创作。'}${characters.map((_,i)=>`\n输入第${references.length+i+1}张是角色设定，只取人物身份、服装和造型，按需求设计一个自然姿态，不画出三视图。`).join('')}${current?`\n最后一张（输入第${images.length}张）是当前高清母版，按本次修改要求处理。`:''}
【准确文案】${exact}${run.copyReference?`\n【文案参考】${run.copyReference}。只参考字效与排版，实际文字以准确文案为准。`:''}
保持指定参考的画风与色调，人物和道具接触自然，文字清晰完整、人物脸部无遮挡。${run.mode==='concept-edit'?'只改变本次指定的内容，其余内容保持一致。':'按设计师要求构图，不继承旧版的标题框或布局。'}
不复制参考图的旧文字、品牌或水印。游戏 Logo 由本地独立叠加，${run.logo?`在母版的自然低干扰位置预留品牌空间（左、上、宽、高为 ${logoArea}%），不绘制占位框。`:'不添加品牌标识。'}只返回完整成稿图片。`;
  if(images.length)body.images=images.map(buffer=>({data_base64:buffer.toString('base64')}));
  if(run.mode==='adapt')body.prompt+='\n【母版一致性】最后一张为本次尺寸重排的唯一母版。保持该图的时段、天气、人物与书法风格，只重新组织当前尺寸的布局。不要重新借用旧参考图里的月亮、夜色、灯光或其他旧主题。';
  if(run.model==='gpt-image-2')body.quality='high';
  return body;
}

export async function fitCommunityArtwork(buffer,template){
  const meta=await sharp(buffer,{limitInputPixels:40000000}).metadata();
  const expected=BANANA_RATIOS[nearestBananaRatio(template.width,template.height)];
  if(!meta.width || !meta.height || Math.min(Math.abs(Math.log((meta.width/meta.height)/expected)),Math.abs(Math.log((meta.width/meta.height)/(template.width/template.height))))>.08)fail('返回整稿比例不符合目标尺寸，原画面已保留');
  // The model composes inside the communicated safe frame. Never stretch axes.
  if(template.communityMaster)return sharp(buffer).png().toBuffer();
  return sharp(buffer).resize(template.width*2,template.height*2,{fit:'cover',position:'centre'}).png().toBuffer();
}

export function bindCommunityArtwork(task,{run,asset,templateId=run.templateId}){
  const p=task.parameters ||= {},id=templateId;
  p.assetByTemplate ||= {};p.layoutByTemplate ||= {};p.backgroundByTemplate ||= {};p.communityArtworkByTemplate ||= {};
  const bindings=p.assetByTemplate[id] ||= {},layouts=p.layoutByTemplate[id] ||= {};
  bindings.background=asset.name;
  if(run.mode==='adapt'&&(p.communityObjectLayersByTemplate?.[task.masterTemplateId]||p.communityObjectLayersByTemplate?.[id])) (p.communityObjectLayersByTemplate||={})[id]=clone(p.communityObjectLayersByTemplate[task.masterTemplateId]||[]);
  for(const kind of hiddenKinds){bindings[kind]=null;layouts[kind]={...(layouts[kind] || {x:0,y:0,width:1,height:1}),visible:false};}
  bindings.logo=run.logo;layouts.logo=clone(run.logoLayout);
  p.backgroundByTemplate[id]={focalX:50,focalY:50,scale:100,smartExpand:false,url:''};
  p.communityArtworkByTemplate[id]={assetName:asset.name,copy:run.copy,subtitle:run.subtitle,mode:'whole-artwork',runId:run.runId,...(run.sourceArtworkName?{sourceArtworkName:run.sourceArtworkName,sourceArtworkRunId:run.sourceArtworkRunId}:{})};
}

export function applyCommunityArtwork(task,proposal,{expectedUpdatedAt,now=new Date().toISOString()}={}){
  if(expectedUpdatedAt && expectedUpdatedAt!==task.updatedAt)fail('画面已更新，请刷新后再应用方案',409);
  const {run,asset}=proposal;
  if(run.mode==='adapt'){
    const master=task.parameters?.communityArtworkByTemplate?.[task.masterTemplateId];
    if(task.masterTemplateId!==run.sourceTemplateId || master?.assetName!==run.sourceArtworkName || !task.targetTemplateIds.includes(run.templateId))fail('该尺寸方案对应的母版已变化，已保留方案，请按新母版重新排版',409);
  }else if(task.masterTemplateId!==run.templateId)fail('母版尺寸已变化，不能应用到当前尺寸',409);
  if(String(task.copy || '').trim()!==run.copy || String(task.parameters?.subtitleText || '').trim()!==run.subtitle)fail('最终文案已变化，请按新文案重新生成；已生成方案仍保留',409);
  const before=bannerMasterSnapshot(task),p=task.parameters ||= {};
  if(run.mode==='adapt'){
    const id=run.templateId;
    const versions=(task.communityDesign ||= {schemaVersion:1,versions:[]}).targetVersions ||= {};
    (versions[id] ||= []).push({id:run.runId,at:now,sourceArtworkName:run.sourceArtworkName,before:{layout:clone(p.layoutByTemplate?.[id] || {}),assets:clone(p.assetByTemplate?.[id] || {}),background:clone(p.backgroundByTemplate?.[id] || {}),artwork:clone(p.communityArtworkByTemplate?.[id] || null)},asset:clone(asset)});
    bindCommunityArtwork(task,{run,asset});
    if(!(task.assets || []).some(a=>a.name===asset.name))(task.assets ||= []).push(asset);
    task.updatedAt=now;return task;
  }
  bindCommunityArtwork(task,{run,asset});
  if(!(task.assets || []).some(a=>a.name===asset.name))(task.assets ||= []).push(asset);
  const design=task.communityDesign ||= {schemaVersion:1,versions:[]};design.versions ||= [];
  const previous=design.versions.find(v=>v.id===design.currentVersionId)?.snapshot;
  if(!previous || JSON.stringify(previous)!==JSON.stringify(before))design.versions.push({id:`before-${run.runId}`,at:now,label:'整稿设计前',snapshot:before});
  design.versions.push({id:run.runId,at:now,label:run.prompt.slice(0,100),mode:run.mode,snapshot:bannerMasterSnapshot(task)});
  design.versions=design.versions.slice(-12);design.currentVersionId=run.runId;design.lastInstruction=run.prompt;design.brief=run.prompt;design.updatedAt=now;
  p.communityDesignDraft='';task.communityMasterApproval=null;task.updatedAt=now;
  return task;
}

export function saveCommunityArtwork(task,proposal,{now=new Date().toISOString()}={}){
  // Always retain the paid image, even when an intervening edit prevents automatic application.
  (task.communityArtworkProposals ||= []).push(clone(proposal));
  if(!(task.assets || []).some(a=>a.name===proposal.asset.name))(task.assets ||= []).push(proposal.asset);
  // Adding a newly generated asset itself must not be counted as a user edit.
  const comparable=clone(task);comparable.assets=comparable.assets.filter(a=>a.name!==proposal.asset.name);
  if(communityArtworkRunSourceToken(comparable,proposal.run)!==proposal.run.sourceToken)return {applied:false};
  applyCommunityArtwork(task,proposal,{now});return {applied:true};
}
