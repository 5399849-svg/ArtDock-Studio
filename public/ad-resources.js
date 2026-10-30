import {adWorkspaceCatalog} from './ad-output-policy.js?v=20261022-new-task-size';
import {bindProjectLogoChoice} from './project-logos.js?v=20261023-project-create';
import {adBulkTaskName,adBulkFileKey,AD_BULK_MAX_TASKS,currentAdBulkSession,startAdBulkSession,clearAdBulkSession} from './ad-bulk-create.js?v=20261022-bulk-create';
import {AD_UPLOAD_LIMIT_TEXT, formatAdUploadFileSize, validateAdUploadFile} from './ad-upload-policy.js?v=20261015-psd500';
import {uploadAdAsset} from './ad-asset-upload.js?v=20261022-bulk-create';
import {mountAdAiEditor,isAdAiEditLocked} from './ad-ai-edit.js?v=20261023-reference-slot';
import {mountAdVersionHistory} from './ad-version-history.js?v=20261022-ai-share-v2';
import {isAdImageUrl} from './ad-image-url.js?v=20261022-draft-sync';
import {adWorkingThumbnailUrl,mergeAdWorkingUpdate} from './ad-working-state.js?v=20261022-draft-sync';
import {adLogoGeometry,updateAdLogoSliders} from './ad-logo-geometry.js?v=20261022-logo-travel';
import {AD_MOTION_MODEL_LABEL, adGenerationMessage, adMotionAction, adMotionStatusText, hasAdMotionVersion, isAdMotionPending, isAdMotionRunning, isAdMotionUncertain, watchAdMotionJob} from './ad-motion-status.js?v=20261015-kling-default';

const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const imageSrc=value=>isAdImageUrl(value)?esc(value):'';
const loadedImage=url=>new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(Error('图片加载失败'));image.src=url});
const defaultDraft=()=>({sourceAssetId:'',logoAssetId:'',zoom:1,offsetX:0,offsetY:0,logoX:.78,logoY:.06,logoScale:.18});
const logoText=spec=>spec.logo==='required'?'必须带 Logo · 文件名加 lg':spec.logo==='forbidden'?'无 Logo 版本':'按需求确认';
const limitText=spec=>spec.maxBytes?spec.limitRaw:'表格未设体积上限';
const gifDurationSeconds=version=>((Number.isFinite(version.durationMs)&&version.durationMs>0?version.durationMs/1000:version.frames*.1)).toFixed(1);
const endpoint=(batch,spec)=>`/api/ad-resources/batches/${encodeURIComponent(batch.id)}/items/${encodeURIComponent(spec.id)}`;
const logoFreeName=/(?:无\s*logo|不含\s*logo|no[-_ ]?logo|纯图|clean)/i;
const logoName=/(?:^|[-_ ])lg(?:[-_. ]|$)|logo|带标语|带\s*logo|含\s*logo/i;
const hasEmbeddedLogo=asset=>Boolean(asset?.hasEmbeddedLogo===true||asset?.hasEmbeddedLogo!==false&&!logoFreeName.test(asset?.name||'')&&logoName.test(asset?.name||''));
function preferredVisual(spec,visuals,logos){return visuals.reduce((best,asset)=>{const ratioError=Math.abs(Math.log((asset.width/asset.height)/(spec.width/spec.height)))*10;const logoPenalty=asset.hasEmbeddedLogo||hasEmbeddedLogo(asset)?(spec.logo==='forbidden'?100:logos.length?20:0):0;const score=ratioError+logoPenalty+(asset.logoFree?-60:0);return !best||score<best.score?{asset,score}:best},null)?.asset}
let activeBatchId='',activeSpecId='',activeTab='compose';
let stopMotionWatchers=()=>{},stopAiWatcher=()=>{},stopHistoryPreview=()=>{},adMountToken=0;
const imageCache=new Map();
async function cacheImage(url){if(!imageCache.has(url)){imageCache.set(url,loadedImage(url));while(imageCache.size>16)imageCache.delete(imageCache.keys().next().value)}return imageCache.get(url)}
// Capture at replacement time: users may keep scrolling while the request is pending.
function rememberAdViewport(content){
  const root=content.querySelector('.ad-page');if(!root)return ()=>{};
  const position={left:window.scrollX,top:window.scrollY},ancestors=[];
  for(let node=content;node&&node!==document.scrollingElement;node=node.parentElement)ancestors.push({node,left:node.scrollLeft,top:node.scrollTop});
  const panels=['.ad-list-scroll','.ad-inspector-scroll'].map(selector=>{const node=root.querySelector(selector);return {selector,left:node?.scrollLeft||0,top:node?.scrollTop||0}});
  const focused=root.contains(document.activeElement)?document.activeElement:null;
  const focusSelector=focused?.id?`#${CSS.escape(focused.id)}`:focused?.hasAttribute('data-ad-spec')?`[data-ad-spec="${CSS.escape(focused.dataset.adSpec)}"]`:focused?.hasAttribute('data-ad-tab')?`[data-ad-tab="${CSS.escape(focused.dataset.adTab)}"]`:null;
  return ()=>{
    const next=content.querySelector('.ad-page');if(!next)return;
    if(focusSelector)next.querySelector(focusSelector)?.focus({preventScroll:true});
    for(const {selector,left,top} of panels){const node=next.querySelector(selector);if(node){node.scrollLeft=left;node.scrollTop=top}}
    for(const {node,left,top} of ancestors){node.scrollLeft=left;node.scrollTop=top}
    window.scrollTo({left:position.left,top:position.top,behavior:'instant'});
  };
}
function placement(spec,img,draft){const w=spec.width,h=spec.height,zoom=Math.max(1,Number(draft.zoom)||1),scale=Math.max(w/img.naturalWidth,h/img.naturalHeight)*zoom;
  const width=img.naturalWidth*scale,height=img.naturalHeight*scale;
  const left=Math.max(w-width,Math.min(0,(w-width)/2+(Number(draft.offsetX)||0)*w));
  const top=Math.max(h-height,Math.min(0,(h-height)/2+(Number(draft.offsetY)||0)*h));
  return {left,top,width,height};
}

export async function mountAdResources(content,title,{api,toast,isActive,openCreate=false,initialBatchId='',initialSpecId='',onBrowseRules,preserveViewport=false}){
  const mountToken=++adMountToken;
  if(initialBatchId&&initialBatchId!==activeBatchId){activeBatchId=initialBatchId;activeSpecId='';activeTab='compose'}
  if(initialSpecId)activeSpecId=initialSpecId;
  title.textContent='投放资源位';
  const keepPage=preserveViewport&&Boolean(content.querySelector('.ad-page'));
  if(!keepPage)content.innerHTML='<div class="ad-loading">正在读取投放尺寸表…</div>';
  let data;try{data=await api('/api/ad-resources')}catch(error){if(isActive()&&mountToken===adMountToken){if(keepPage){toast(`读取失败：${error.message}`);return}content.innerHTML=`<div class="ad-loading">读取失败：${esc(error.message)} <button class="button secondary" id="ad-retry">重试</button></div>`;content.querySelector('#ad-retry')?.addEventListener('click',()=>mountAdResources(content,title,{api,toast,isActive,onBrowseRules}))}return}
  if(!isActive()||mountToken!==adMountToken)return;
  stopMotionWatchers();stopMotionWatchers=()=>{};stopAiWatcher();stopAiWatcher=()=>{};stopHistoryPreview();stopHistoryPreview=()=>{};
  const batches=data.batches,projects=data.projects||[];
  const batch=batches.find(entry=>entry.id===activeBatchId)||batches[0]||null;activeBatchId=batch?.id||'';
  const catalog=adWorkspaceCatalog(data,batch),specs=catalog.specs;
  const spec=specs.find(entry=>entry.id===activeSpecId)||specs[0];activeSpecId=spec.id;
  if(activeTab==='reference'&&!spec.referenceUrl)activeTab='compose';
  const assets=batch?.assets||[];
  const sourceAssets=assets.filter(asset=>asset.role==='visual'),logos=assets.filter(asset=>asset.role==='logo');
  const item=batch?.items?.[spec.id]||{draft:null,versions:[]};
  const draft={...defaultDraft(),sourceAssetId:preferredVisual(spec,sourceAssets,logos)?.id||'',logoAssetId:spec.logo==='required'?batch?.activeLogoAssetId||logos[0]?.id||'':'',...item.draft};
  const source=sourceAssets.find(asset=>asset.id===draft.sourceAssetId),sourceHasEmbeddedLogo=hasEmbeddedLogo(source),logo=sourceHasEmbeddedLogo?null:logos.find(asset=>asset.id===draft.logoAssetId);
  const latest=item.versions.at(-1);
  const batchDelivered=Boolean(batch?.downloadedAt&&specs.every(entry=>!batch.items?.[entry.id]?.draftDirty&&batch.items?.[entry.id]?.versions?.at(-1)?.number===batch.deliveredVersions?.[entry.id]));
  const refresh=({preserveViewport=true}={})=>mountAdResources(content,title,{api,toast,isActive,onBrowseRules,preserveViewport});
  const specGroup=Object.groupBy?Object.groupBy(specs,entry=>entry.platform):specs.reduce((map,entry)=>{(map[entry.platform]??=[]).push(entry);return map},{});
  const restoreViewport=keepPage?rememberAdViewport(content):()=>{};
  content.innerHTML=`<div class="ad-page">
    <header class="ad-heading"><div><h2>投放资源位</h2><p>逐张检查与调整后成套下载。</p></div><div class="ad-heading-actions">${onBrowseRules?'<button class="button ghost" id="ad-browse-rules">查看规范</button>':''}<button class="button secondary" id="ad-download-all">成套下载</button><button class="button primary" id="ad-create-new">新建投放任务</button></div></header>
    ${batch&&batch.sourceSha256!==catalog.sourceSha256?`<div class="ad-caution ad-sheet-changed">尺寸表已更新。此任务创建于旧表格版本，请逐项核对新要求；成套下载暂不可用，建议新建任务制作最新版本。</div>`:''}
    <div class="ad-workspace"><aside class="ad-list ad-panel"><div class="ad-panel-head"><h3>交付清单</h3><span>${specs.length} 项</span></div><div class="ad-list-scroll">${Object.entries(specGroup).map(([platform,items])=>`<section class="ad-group"><h4>${esc(platform)} <small>${items.length} 张</small></h4>${items.map(entry=>{const current=batch?.items?.[entry.id],count=current?.versions?.length||0,latestVersion=current?.versions?.at(-1),selectedId=current?.draft?.sourceAssetId??preferredVisual(entry,sourceAssets,logos)?.id,visual=sourceAssets.find(asset=>asset.id===selectedId),preview=current?.draftDirty&&current?.draft?.sourceAssetId?adWorkingThumbnailUrl(batch.id,entry.id,current):latestVersion?`/api/ad-resources/batches/${batch.id}/items/${entry.id}/versions/${latestVersion.number}/thumbnail`:visual?.url||(!batch?entry.referenceUrl:'');const status=latestVersion?.invalidatedReason?'规范已更新 · 需重制':count?`${count} 个保留方案 · ${current?.draftDirty?'编辑稿已更新':batchDelivered?'已成套下载':'待检查'}`:entry.format==='GIF'&&visual?'静态素材 · 待制作 GIF':visual?'已加入主视觉 · 待适配':batch?'待添加素材':'表格参考图';return `<button class="ad-spec-card ${entry.id===spec.id?'active':''}" data-ad-spec="${entry.id}">${preview?`<img src="${imageSrc(preview)}" alt="${esc(status)}">`:`<span class="ad-spec-icon">${entry.format==='GIF'?'GIF':'待添加'}</span>`}<span><b>${esc(entry.name)} · ${entry.width}×${entry.height}</b><small>${entry.format} · ${esc(logoText(entry))}</small><em>${esc(status)}</em></span></button>`}).join('')}</section>`).join('')}</div></aside>
    <main class="ad-center ad-panel"><div class="ad-center-head"><div><h3>${String(spec.number).padStart(2,'0')} ${esc(spec.name)}</h3><p>${spec.width}×${spec.height} · ${spec.format} · ${esc(limitText(spec))}</p></div><span class="ad-logo-tag ${spec.logo==='forbidden'?'plain':''}">${esc(logoText(spec))}</span></div>
      <div class="ad-tabs"><button data-ad-tab="compose" class="${activeTab==='compose'?'active':''}">制作画面</button>${spec.referenceUrl?`<button data-ad-tab="reference" class="${activeTab==='reference'?'active':''}">表格参考图</button>`:''}</div>
      ${activeTab==='reference'?`<div class="ad-reference-view">${spec.referenceUrl?`<img src="${imageSrc(spec.referenceUrl)}" alt="${esc(spec.name)}表格参考图">`:'<div class="ad-empty-preview">表格中没有这一稿的参考图。</div>'}<p>参考图仅供构图和风格对照。</p></div>`:`<div class="ad-composer"><div class="ad-stage-wrap"><div class="ad-stage" id="ad-stage" style="aspect-ratio:${spec.width}/${spec.height};width:min(100%,${Math.min(880,Math.floor(500*spec.width/spec.height))}px)">${spec.format==='GIF'&&latest?`<img class="ad-gif-preview" src="${imageSrc(latest.url)}" alt="当前 GIF 候选">`:source?`<img class="ad-stage-source" id="ad-stage-source" src="${imageSrc(source.url)}" alt="当前源图">${spec.logo==='required'&&logo&&!sourceHasEmbeddedLogo?`<img class="ad-stage-logo" src="${imageSrc(logo.url)}" alt="Logo">`:''}`:!batch&&spec.referenceUrl?`<div class="ad-start-reference"><img src="${imageSrc(spec.referenceUrl)}" alt="表格参考图"><span>表格参考图 · 非交付稿<br>新建任务后可上传主视觉开始制作</span></div>`:`<div class="ad-empty-preview">请先在投放业务中创建任务并导入源图。</div>`}${latest&&spec.format!=='GIF'?`<img class="ad-stage-final" id="ad-stage-final" src="${imageSrc(latest.url)}" alt="当前交付候选">`:''}${spec.safeInsetX?`<div class="ad-safe left" style="width:${spec.safeInsetX/spec.width*100}%"></div><div class="ad-safe right" style="width:${spec.safeInsetX/spec.width*100}%"></div>`:''}</div></div><div class="ad-stage-caption"><span>${spec.format==='GIF'&&latest?`动效播放中 · ${latest.frames} 帧 · ${gifDurationSeconds(latest)} 秒循环`:`完整画面预览 · ${spec.width}×${spec.height}`}</span><span>${spec.safeInsetX?`两侧各 ${spec.safeInsetX}px 为保护区`:'参考图与交付稿分别保存'}</span></div></div>`}
    </main>
    <aside class="ad-inspector ad-panel"><div class="ad-panel-head"><h3>制作工具</h3></div><div class="ad-inspector-scroll">${activeTab!=='reference'&&batch?`<div class="ad-controls"><div class="ad-control-row"><label class="button secondary">＋ 更换源图<input id="ad-source-upload" type="file" accept="image/png,image/jpeg,image/webp,.psd" hidden></label>${spec.logo==='required'?`<label class="button secondary">＋ 更换 Logo<input id="ad-logo-upload" type="file" accept="image/png,image/webp" hidden></label>`:''}</div>${source?`<div class="ad-sliders"><label>画面缩放 <output id="ad-zoom-value">${Math.round(draft.zoom*100)}%</output><input id="ad-zoom" type="range" min="1" max="2.5" step=".01" value="${draft.zoom}"></label><label>水平位置<input id="ad-x" type="range" min="-1" max="1" step=".01" value="${draft.offsetX}"></label><label>垂直位置<input id="ad-y" type="range" min="-1" max="1" step=".01" value="${draft.offsetY}"></label>${spec.logo==='required'&&logo&&!sourceHasEmbeddedLogo?`<label>Logo 大小<input id="ad-logo-scale" type="range" min=".04" max=".6" step=".01" value="${draft.logoScale}"></label><label>Logo 水平位置<input id="ad-logo-x" type="range" min="0" max="1" step=".01" value="${draft.logoX}"></label><label>Logo 垂直位置<input id="ad-logo-y" type="range" min="0" max="1" step=".01" value="${draft.logoY}"></label>`:''}</div>`:''}</div>`:''}${item.autoError&&!(activeTab!=='reference'&&spec.format==='GIF'&&item.motionJob?.error===item.autoError)?`<div class="ad-caution" id="ad-auto-error">自动制作失败：${esc(item.autoError)}</div>`:''}${item.autoWarning?`<div class="ad-caution" id="ad-auto-warning">${esc(item.autoWarning)}</div>`:''}${!batch?'<div class="ad-note">先在投放业务中创建任务，导入 JPG 或 PSD 后会自动制作。<button class="button primary" id="ad-empty-create">新建投放任务</button></div>':''}</div></aside></div>
    <dialog class="ad-dialog ad-create-dialog" id="ad-create-dialog"><div class="ad-create-body"><h3>新建投放任务</h3><p>导入 JPG 或 PSD 后自动生成所有尺寸和 GIF 候选。创建后逐张检查；带 Logo 稿建议同时提供独立 Logo。</p><label class="ad-create-name">素材名称 / 任务名称<input id="ad-project-name" maxlength="100" placeholder="例如：甄嬛送花" autocomplete="off"></label><div class="ad-create-assets"><b>源素材 <small>至少一张主视觉，可补充独立 Logo</small></b><div class="ad-paste-zone" id="ad-paste-zone" tabindex="0" role="button" aria-label="粘贴或选择图片素材"><strong>按 Ctrl+V 粘贴图片</strong><span>也可拖入 JPG、PNG、WebP、PSD，或选择本地文件</span></div><input id="ad-create-files" type="file" accept="image/png,image/jpeg,image/webp,.psd" multiple hidden><button class="button secondary ad-choose-files" id="ad-choose-files" type="button">选择 JPG / PSD 素材</button><div class="ad-staged-assets" id="ad-staged-assets" aria-live="polite"></div></div><p class="ad-create-error" id="ad-create-error" role="alert" hidden></p><div class="ad-create-actions"><button class="button secondary" id="ad-create-cancel" type="button">取消</button><button class="button primary" id="ad-create-confirm" type="button">创建并自动制作</button></div></div></dialog>
  </div>`;
  const root=content.querySelector('.ad-page');
  const sliders=root.querySelector('.ad-sliders');
  if(sliders){
    const adjustments=document.createElement('section');adjustments.className='ad-adjustments';
    const heading=document.createElement('h4');heading.textContent='调整参数';
    sliders.before(adjustments);adjustments.append(heading,sliders);
  }
  root.dataset.adCatalogSha=catalog.sourceSha256;
  if(item.draftDirty)root.querySelector('#ad-stage-final')?.setAttribute('hidden','');
  if(batch&&activeTab==='compose'&&spec.format==='JPG'){
    const actions=document.createElement('div');actions.className='ad-working-actions';
    actions.innerHTML='<span id="ad-working-status" role="status"></span><div><button class="button ghost" type="button" id="ad-draft-undo">撤销</button><button class="button ghost" type="button" id="ad-draft-redo">重做</button><button class="button secondary" type="button" id="ad-current-download">下载当前稿</button><button class="button primary" type="button" id="ad-keep-version">保留当前方案</button></div>';
    root.querySelector('.ad-tabs').after(actions);
  }
  if(batch){
    const historyTab=document.createElement('button');historyTab.type='button';historyTab.dataset.adTab='versions';historyTab.className=activeTab==='versions'?'active':'';historyTab.textContent=`历史版本（${item.versions.length}）`;
    root.querySelector('.ad-tabs').append(historyTab);
    if(activeTab==='versions'){
      const history=document.createElement('div');stopHistoryPreview=mountAdVersionHistory(history,item.versions,{draftDirty:item.draftDirty,pendingReview:item.aiEditJob?.status==='awaiting_review',thumbnailBase:endpoint(batch,spec),onDelete:async number=>{
        await aiSaveQueue();const result=await api(`${endpoint(batch,spec)}/versions/${number}`,{method:'DELETE',body:JSON.stringify({expectedVersion:item.versions.at(-1)?.number||0})});
        toast(result.retainedForDelivery?'已从历史中删除，已交付的文件继续保留':'版本已删除，未被引用的图片文件已清理');await refresh();
      },onError:error=>toast(error.message)});root.querySelector('.ad-composer').replaceWith(history);
      root.querySelector('.ad-controls')?.remove();
      const notice=document.createElement('div');notice.className='ad-note';notice.innerHTML='点击缩略图查看各版完整画面、修改要求和时间。历史预览不会替换当前交付稿。<p><button type="button" class="button secondary" data-ad-tab="compose">返回制作画面</button></p>';
      root.querySelector('.ad-inspector-scroll').prepend(notice);
    }
  }
  const includesGif=specs.some(entry=>entry.format==='GIF');
  root.querySelector('.ad-create-body>p').textContent=`导入 JPG 或 PSD 后，按当前规范自动制作 ${specs.length} 项资源位。${includesGif?'GIF 使用微光画布可灵 V3 制作，可继续查看其他尺寸。':''}带 Logo 稿建议同时提供独立 Logo。`;
  if(latest?.invalidatedReason){const caution=document.createElement('div');caution.id='ad-invalid-candidate';caution.className='ad-caution';caution.textContent=latest.invalidatedReason;root.querySelector('.ad-inspector-scroll').prepend(caution)}
  const makeProgress=()=>{const node=document.createElement('p');node.className='ad-control-help';node.setAttribute('role','status');node.setAttribute('aria-live','polite');node.style.display='none';return node};
  const showProgress=(node,message)=>{node.textContent=message;node.style.display=message?'block':'none'};
  const createLimit=document.createElement('small');createLimit.className='ad-control-help';createLimit.textContent=AD_UPLOAD_LIMIT_TEXT;
  const createProgress=makeProgress();createProgress.id='ad-create-progress';
  root.querySelector('#ad-choose-files').after(createLimit,createProgress);
  const replacementProgress=makeProgress();replacementProgress.id='ad-upload-progress';
  root.querySelector('.ad-controls')?.after(replacementProgress);
  root.querySelector('#ad-browse-rules')?.addEventListener('click',()=>onBrowseRules?.());
  if(latest&&spec.format==='GIF'){
    const link=document.createElement('a');
    link.className='ad-original-gif-link';
    link.href=latest.url;
    link.target='_blank';
    link.rel='noopener';
    link.textContent='原尺寸查看 GIF';
    root.querySelector('.ad-stage-caption')?.append(link);
  }
  if(source&&spec.logo==='forbidden'&&hasEmbeddedLogo(source)){const warning=document.createElement('div');warning.className='ad-caution';warning.textContent='当前主视觉文件名标记了 Logo；此稿要求无 Logo。请更换为无 Logo 源图，避免裁出半截 Logo 或误交付。';root.querySelector('.ad-inspector-scroll').prepend(warning)}
  const pageActive=()=>root.isConnected&&isActive();
  let motionSubmitBusy=false,downloadBusy=false;
  const motionPanel=activeTab==='compose'&&spec.format==='GIF'&&batch?document.createElement('div'):null;
  if(motionPanel){
    motionPanel.className='ad-note ad-motion-panel';motionPanel.setAttribute('aria-live','polite');
      motionPanel.innerHTML=`<strong>${AD_MOTION_MODEL_LABEL}</strong><p id="ad-motion-status"></p><p id="ad-motion-error" hidden></p><p id="ad-motion-preserved" hidden></p><p id="ad-motion-scene-plan"></p><p>固定输出 10 帧、1 秒循环。按原画意境制作连贯微动，保持人物造型、文案与原稿色调；生成后请检查动作和循环效果。可离开本页，制作状态会自动保存。</p><div class="ad-motion-actions"><button class="button secondary" id="ad-motion-generate" type="button"></button><button class="button secondary" id="ad-motion-query" type="button" hidden>查询结果</button></div>`;
    root.querySelector('.ad-inspector-scroll').prepend(motionPanel);
  }
  const batchMotionJobs=()=>specs.filter(entry=>entry.format==='GIF').map(entry=>({spec:entry,item:batch?.items?.[entry.id]})).filter(entry=>entry.item?.motionJob);
  const updateMotionPresentation=()=>{
    for(const entry of batchMotionJobs()){
      const job=entry.item.motionJob,node=root.querySelector(`[data-ad-spec="${entry.spec.id}"] em`);
      if(node&&(isAdMotionRunning(job)||job.status==='failed'||isAdMotionUncertain(job)))node.textContent=adMotionStatusText(job);
    }
    let notice=root.querySelector('#ad-motion-background-status');
    const running=batchMotionJobs().filter(entry=>isAdMotionRunning(entry.item.motionJob));
    if(running.length){
      if(!notice){notice=document.createElement('div');notice.id='ad-motion-background-status';notice.className='ad-note';notice.setAttribute('role','status');root.querySelector('.ad-workspace').before(notice)}
      notice.textContent=running.map(entry=>`${entry.spec.name}：${adMotionStatusText(entry.item.motionJob)}`).join('；')+'。可继续查看其他尺寸。';
    }else notice?.remove();
    if(motionPanel){
      const job=item.motionJob,uncertain=isAdMotionUncertain(job),busy=motionSubmitBusy||isAdMotionRunning(job);
      const scenePlan=job?.scenePlan||latest?.motion?.scenePlan;
      root.querySelector('#ad-motion-scene-plan').textContent=scenePlan?`${scenePlan.label}：${scenePlan.description}`:'由可灵查看当前画面，选择合适的花叶、水波、柔光或已有能量变化。';
      motionPanel.classList.toggle('ad-caution',job?.status==='failed'||uncertain);
      root.querySelector('#ad-motion-status').textContent=motionSubmitBusy?'正在提交动效制作…':job?.status==='completed'&&!hasAdMotionVersion(job)?'正在确认生成版本…':job?adMotionStatusText(job).replace(`${AD_MOTION_MODEL_LABEL} · `,''):'默认自动制作视频动效';
      const error=root.querySelector('#ad-motion-error');error.hidden=!(job?.error||uncertain);error.textContent=job?.error||(uncertain?'已保留本次视频任务，请查询结果。为避免重复制作，暂不重新提交。':'');
      const preserved=root.querySelector('#ad-motion-preserved');preserved.hidden=!(job?.status==='failed'&&job.videoReady);preserved.textContent='视频已保留，重试仅转换 GIF，不会重复生成视频。';
      const button=root.querySelector('#ad-motion-generate');button.textContent=busy?'动效制作中…':adMotionAction(job).label;button.disabled=busy||uncertain||!source;
      const query=root.querySelector('#ad-motion-query');query.hidden=!uncertain;query.disabled=motionSubmitBusy;
      root.querySelectorAll('#ad-source-upload,.ad-sliders input').forEach(node=>{node.disabled=busy||uncertain});
      const caption=root.querySelector('.ad-stage-caption>span:first-child');
      if(caption&&latest){caption.textContent=busy?'当前播放上一版 · 新动效制作中':uncertain?'当前播放上一版 · 新动效结果待确认':job?.status==='failed'?'当前播放上一版 · 新动效未完成':`动效播放中 · ${latest.frames} 帧 · ${gifDurationSeconds(latest)} 秒循环`;}
    }
    const download=root.querySelector('#ad-download-all');if(download)download.disabled=downloadBusy||!batch||batch.sourceSha256!==catalog.sourceSha256||Boolean(running.length)||Object.values(batch?.items||{}).some(entry=>isAdAiEditLocked(entry.aiEditJob));
  };
  const acceptMotionUpdate=(specId,result)=>{
    if(!pageActive())return;
    const current=batch?.items?.[specId];if(!current)return;
    if(result.motionJob)current.motionJob=result.motionJob;
    updateMotionPresentation();
    if(hasAdMotionVersion(result.motionJob,result.version)&&Number(result.version?.number||result.motionJob.versionNumber)>Number(current.versions?.at(-1)?.number||0)){
      toast('可灵 V3 动效已生成，请检查播放效果');
      if(root.querySelector('#ad-create-dialog')?.open)root.dataset.motionRefreshNeeded='true';else refresh();
    }
  };
  const resumeMotionWatches=()=>{
    stopMotionWatchers();
    const stops=batchMotionJobs().filter(entry=>isAdMotionRunning(entry.item.motionJob)).map(entry=>watchAdMotionJob({api,batchId:batch.id,specId:entry.spec.id,isActive:pageActive,onUpdate:result=>acceptMotionUpdate(entry.spec.id,result),onError:error=>{
      if(!pageActive())return;
      const node=root.querySelector('#ad-motion-status');if(node)node.textContent=`状态查询暂未成功：${error.message}。正在继续查询，勿重复提交。`;
    }}));
    stopMotionWatchers=()=>stops.forEach(stop=>stop());
  };
  const recordPendingMotion=result=>{
    batch.items??={};batch.items[spec.id]=item;item.motionJob=result.motionJob;
    updateMotionPresentation();resumeMotionWatches();
  };
  const persist=async(next=draft,{syncSimilar=false}={})=>{if(!batch)return;return api(`${endpoint(batch,spec)}/draft`,{method:'PUT',body:JSON.stringify({...next,...(syncSimilar?{syncSimilar:true}:{})})})};
  async function updatePreview(){
    const stage=root.querySelector('#ad-stage'),visual=root.querySelector('#ad-stage-source');
    if(!stage||!visual||!source)return;
    try{
      const img=await cacheImage(source.url);if(!stage.isConnected)return;
      const p=placement(spec,img,draft);Object.assign(visual.style,{left:`${p.left/spec.width*100}%`,top:`${p.top/spec.height*100}%`,width:`${p.width/spec.width*100}%`,height:`${p.height/spec.height*100}%`});
      const logoNode=stage.querySelector('.ad-stage-logo');
      if(logoNode&&logo){
        const art=await cacheImage(logo.url);if(!stage.isConnected)return;
        const geometry=adLogoGeometry(spec,art,draft);
        Object.assign(logoNode.style,{left:`${geometry.left/spec.width*100}%`,top:`${geometry.top/spec.height*100}%`,width:`${geometry.width/spec.width*100}%`,height:`${geometry.height/spec.height*100}%`});
        updateAdLogoSliders(root,spec,geometry);
      }
    }catch(error){toast(error.message)}
  }
  updatePreview();
  root.querySelectorAll('[data-ad-spec]').forEach(button=>{
    const count=batch?.items?.[button.dataset.adSpec]?.versions?.length||0,caption=button.querySelector('em');
    if(count&&caption){caption.dataset.adHistory='true';caption.classList.add('ad-history-link');caption.title=`点击查看全部 ${count} 个保留方案`}
    button.onclick=event=>{activeSpecId=button.dataset.adSpec;activeTab=event.target.closest('[data-ad-history]')?'versions':'compose';refresh()};
  });
  root.querySelectorAll('[data-ad-tab]').forEach(button=>button.onclick=()=>{activeTab=button.dataset.adTab;refresh()});
  const createDialog=root.querySelector('#ad-create-dialog');
  const nameField=root.querySelector('.ad-create-name'),createFields=document.createElement('div');
  createFields.className='ad-create-fields';nameField.before(createFields);createFields.append(nameField);
  const projectField=document.createElement('label');projectField.className='ad-create-project';
  projectField.innerHTML=`所属项目<select id="ad-create-project"><option value="">${projects.length?'选择项目（可选）':'暂无项目，暂不归档'}</option>${projects.map(project=>`<option value="${esc(project.id)}">${esc(project.name)}</option>`).join('')}</select>`;
  createFields.append(projectField);
  const projectSelect=projectField.querySelector('select');
  const logoChoice=bindProjectLogoChoice(projectSelect,projects,{anchor:projectField,api,businessLineIds:['performance-marketing']});
  let createMode='single',bulkSession=currentAdBulkSession(),stopBulkProgress=()=>{},singleCreateRequestId=crypto.randomUUID();
  let bulkSeenResult=bulkSession?.rows.find(row=>row.batchId===batch?.id)?.result;
  const createModes=document.createElement('nav');createModes.className='ad-create-modes';createModes.setAttribute('aria-label','任务创建方式');createModes.innerHTML='<button type="button" data-ad-create-mode="single" class="active">单个任务</button><button type="button" data-ad-create-mode="bulk">批量新建</button>';createFields.before(createModes);
  const bulkSummary=document.createElement('p');bulkSummary.className='ad-bulk-summary';bulkSummary.hidden=true;root.querySelector('#ad-staged-assets').before(bulkSummary);
  const bulkResults=document.createElement('section');bulkResults.className='ad-bulk-results';bulkResults.hidden=true;root.querySelector('#ad-create-error').before(bulkResults);
  const bulkBanner=document.createElement('div');bulkBanner.className='ad-note ad-bulk-banner';bulkBanner.hidden=true;bulkBanner.innerHTML='<span role="status"></span><button type="button" class="button secondary">查看批量进度</button>';root.querySelector('.ad-heading').after(bulkBanner);
  const stagedAssets=[];
  const projectInput=root.querySelector('#ad-project-name');let projectNameEdited=false;
  projectInput.addEventListener('input',()=>{projectNameEdited=true});
  let createdBatch=null,createBusy=false;
  const createError=message=>{const node=root.querySelector('#ad-create-error');node.textContent=message;node.hidden=!message};
  projectSelect.addEventListener('change',()=>{if(root.querySelector('#ad-create-error').textContent==='项目正在创建，请稍候')createError('');});
  const clearStaged=()=>{stagedAssets.forEach(asset=>{if(asset.preview)URL.revokeObjectURL(asset.preview)});stagedAssets.length=0};
  const renderStaged=()=>{
    root.querySelector('#ad-staged-assets').hidden=Boolean(bulkSession)&&createMode==='bulk';
    root.querySelector('#ad-staged-assets').innerHTML=stagedAssets.map((asset,index)=>`<div class="ad-staged-asset ${createMode==='bulk'?'ad-bulk-staged':''}">${/\.psd$/i.test(asset.file.name)?'<span class="ad-staged-icon">PSD</span>':`<img src="${asset.preview}" alt="">`}<span title="${esc(asset.file.name)} · ${formatAdUploadFileSize(asset.file.size)}">${esc(asset.file.name)} · ${formatAdUploadFileSize(asset.file.size)}${asset.uploadedId?' · 已导入':''}${createMode==='bulk'&&asset.role==='visual'?`<label class="ad-bulk-task-name">任务名称<input data-ad-bulk-name="${index}" maxlength="100" aria-label="${esc(asset.file.name)}的任务名称" value="${esc(asset.taskName)}" ${createBusy||bulkSession?'disabled':''}></label>`:''}</span><select data-ad-asset-role="${index}" aria-label="${esc(asset.file.name)}的用途" ${createBusy||asset.uploadedId||bulkSession?'disabled':''}><option value="visual" ${asset.role==='visual'?'selected':''}>主视觉</option><option value="logo" ${asset.role==='logo'?'selected':''}>${createMode==='bulk'?'共用 Logo':'Logo'}</option></select><button type="button" data-ad-remove-asset="${index}" aria-label="移除${esc(asset.file.name)}" ${createBusy||asset.uploadedId||bulkSession?'disabled':''}>×</button></div>`).join('');
    root.querySelectorAll('[data-ad-bulk-name]').forEach(node=>node.oninput=()=>{stagedAssets[Number(node.dataset.adBulkName)].taskName=node.value;});
    root.querySelectorAll('[data-ad-asset-role]').forEach(node=>node.onchange=()=>{if(!createBusy&&!bulkSession){stagedAssets[Number(node.dataset.adAssetRole)].role=node.value;renderStaged();}});
    root.querySelectorAll('[data-ad-remove-asset]').forEach(node=>node.onclick=()=>{if(createBusy)return;const [removed]=stagedAssets.splice(Number(node.dataset.adRemoveAsset),1);if(removed.preview)URL.revokeObjectURL(removed.preview);renderStaged()});
    if(createMode==='bulk'&&!bulkSession){const count=stagedAssets.filter(a=>a.role==='visual').length;bulkSummary.textContent=count?`将分别创建 ${count} 个独立任务，每张主视觉一个工作台。`:'每张主视觉创建一个独立任务，可统一使用项目 Logo。';root.querySelector('#ad-create-confirm').textContent=count?`创建 ${count} 个独立任务并制作`:'批量创建并制作';}
  };
  const renderBulkProgress=()=>{
    if(!bulkSession)return;
    const current=bulkSession.rows.find(row=>row.batchId===batch?.id);if(current?.result&&current.result!==bulkSeenResult){bulkSeenResult=current.result;if(!createDialog.open){void refresh();return;}}
    const completed=bulkSession.completed,total=bulkSession.rows.length,working=bulkSession.running;
    bulkBanner.hidden=false;bulkBanner.querySelector('span').textContent=`批量新建 · ${completed}/${total} 个已完成制作${bulkSession.failed?` · ${bulkSession.failed} 个待处理`:''}`;
    if(createMode!=='bulk')return;
    bulkSummary.textContent=working?'任务正在依次导入和制作，收起进度后仍会在当前页面继续。':`已保留 ${bulkSession.rows.filter(r=>r.batchId).length} 个独立任务。`;
    bulkResults.hidden=false;bulkResults.innerHTML=`<div class="ad-bulk-result-list">${bulkSession.rows.map(row=>`<article class="ad-bulk-result ${['failed','partial'].includes(row.stage)?'has-error':''}"><div><b>${esc(row.name)}</b><span>${esc(row.message)}</span>${row.error?`<small role="alert">${esc(row.error)}</small>`:''}${row.warnings.length?`<small>${esc([...new Set(row.warnings)].join('；'))}</small>`:''}</div>${row.batchId?`<button type="button" class="button secondary" data-ad-bulk-open="${esc(row.batchId)}">打开工作台</button>`:''}</article>`).join('')}</div>${!working?'<button type="button" class="button ghost" data-ad-bulk-reset>新建另一批</button>':''}`;
    bulkResults.querySelectorAll('[data-ad-bulk-open]').forEach(button=>button.onclick=()=>{activeBatchId=button.dataset.adBulkOpen;activeSpecId=specs[0].id;activeTab='compose';createDialog.close();});
    bulkResults.querySelector('[data-ad-bulk-reset]')?.addEventListener('click',()=>{clearAdBulkSession();stopBulkProgress();bulkSession=null;bulkResults.hidden=true;bulkBanner.hidden=true;clearStaged();updateCreateMode();});
    const confirm=root.querySelector('#ad-create-confirm');confirm.disabled=working||!bulkSession.failed;confirm.hidden=!working&&!bulkSession.failed;confirm.textContent=working?'正在批量制作…':'继续处理未完成任务';
    root.querySelector('#ad-create-cancel').textContent=working?'收起进度':'完成';
  };
  const updateCreateMode=()=>{
    const bulk=createMode==='bulk',locked=createBusy||Boolean(bulkSession);createDialog.classList.toggle('is-bulk',bulk);nameField.hidden=bulk;createFields.classList.toggle('ad-create-fields-bulk',bulk);bulkSummary.hidden=!bulk;bulkResults.hidden=!bulk||!bulkSession;
    createModes.querySelectorAll('button').forEach(button=>{button.classList.toggle('active',button.dataset.adCreateMode===createMode);button.setAttribute('aria-pressed',String(button.dataset.adCreateMode===createMode));button.disabled=locked;});
    createDialog.querySelectorAll('#ad-create-files,#ad-choose-files,#ad-create-project,.project-logo-choice select').forEach(node=>node.disabled=locked);
    pasteZone.setAttribute('aria-disabled',String(locked));pasteZone.tabIndex=locked?-1:0;
    const confirm=root.querySelector('#ad-create-confirm');confirm.hidden=false;confirm.disabled=createBusy;confirm.textContent=bulk?'批量创建并制作':'创建并自动制作';root.querySelector('#ad-create-cancel').textContent='取消';renderStaged();renderBulkProgress();
  };
  const watchBulk=session=>{stopBulkProgress();bulkSession=session;stopBulkProgress=session.subscribe(()=>{if(!root.isConnected){stopBulkProgress();return;}renderBulkProgress();});};
  createModes.querySelectorAll('button').forEach(button=>button.onclick=()=>{if(createBusy||bulkSession||createdBatch)return;createMode=button.dataset.adCreateMode;createError('');updateCreateMode();});
  const setCreateBusy=value=>{
    createBusy=value;
    createDialog.querySelectorAll('input,select,button').forEach(node=>{node.disabled=value});
    projectInput.disabled=value||Boolean(createdBatch);
    projectSelect.disabled=value||Boolean(createdBatch);
    createModes.querySelectorAll('button').forEach(button=>button.disabled=value||Boolean(createdBatch));
    pasteZone.setAttribute('aria-disabled',String(value));pasteZone.tabIndex=value?-1:0;
    renderStaged();
  };
  const addFiles=files=>{
    if(createBusy||bulkSession)return;
    const rejected=[];
    for(const file of files){
      const validation=validateAdUploadFile(file);
      if(!validation.ok){rejected.push(validation.error);continue}
      if(stagedAssets.some(asset=>adBulkFileKey(asset.file)===adBulkFileKey(file)))continue;
      if(createMode==='bulk'&&stagedAssets.length>=AD_BULK_MAX_TASKS+1){rejected.push(`每批最多 ${AD_BULK_MAX_TASKS} 张主视觉和一张共用 Logo`);continue;}
      stagedAssets.push({file,taskName:adBulkTaskName(file.name),role:'visual',preview:validation.isPsd?'':URL.createObjectURL(file),uploadedId:''});
      if(!projectNameEdited&&!projectInput.value.trim()&&file.name)projectInput.value=file.name.replace(/\.(?:psd|jpe?g|png|webp)$/i,'').trim();
    }
    renderStaged();createError(rejected.length?`${rejected.length} 个文件未添加：${rejected[0]}`:'');
  };
  const openCreateDialog=()=>{if(createBusy)return;if(bulkSession)createMode='bulk';updateCreateMode();createDialog.showModal();if(createMode==='single')projectInput.focus();};
  bulkBanner.querySelector('button').onclick=openCreateDialog;
  root.querySelector('#ad-create-new').addEventListener('click',openCreateDialog);
  root.querySelector('#ad-empty-create')?.addEventListener('click',openCreateDialog);
  if(openCreate)queueMicrotask(openCreateDialog);
  root.querySelector('#ad-create-cancel').onclick=()=>{if(!createBusy)createDialog.close()};
  createDialog.addEventListener('cancel',event=>{if(createBusy)event.preventDefault()});
  createDialog.addEventListener('close',()=>{clearStaged();projectInput.value='';projectInput.disabled=false;projectSelect.value='';projectSelect.disabled=false;logoChoice.render();projectNameEdited=false;singleCreateRequestId=crypto.randomUUID();if(createdBatch){activeBatchId=createdBatch.id;activeSpecId=specs[0].id;activeTab='compose';createdBatch=null;refresh({preserveViewport:false})}else if(bulkSession?.rows.some(row=>row.batchId)||root.dataset.motionRefreshNeeded==='true')refresh()});
  root.querySelector('#ad-project-name').onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();root.querySelector('#ad-create-confirm').click()}};
  root.querySelector('#ad-choose-files').onclick=()=>root.querySelector('#ad-create-files').click();
  root.querySelector('#ad-create-files').onchange=event=>{addFiles(event.target.files);event.target.value=''};
  const pasteZone=root.querySelector('#ad-paste-zone');
  pasteZone.onclick=()=>pasteZone.focus();
  pasteZone.onkeydown=event=>{if(createBusy)return;if(event.key==='Enter'||event.key===' '){event.preventDefault();root.querySelector('#ad-create-files').click()}};
  createDialog.addEventListener('paste',event=>{const files=[...(event.clipboardData?.items||[])].filter(item=>item.kind==='file'&&(item.type.startsWith('image/')||/photoshop|psd/i.test(item.type))).map(item=>item.getAsFile()).filter(Boolean);if(!files.length)return;event.preventDefault();addFiles(files)});
  pasteZone.ondragover=event=>{event.preventDefault();pasteZone.classList.add('dragging')};
  pasteZone.ondragleave=()=>pasteZone.classList.remove('dragging');
  pasteZone.ondrop=event=>{event.preventDefault();pasteZone.classList.remove('dragging');addFiles(event.dataTransfer?.files||[])};
  if(bulkSession){createMode='bulk';projectSelect.value=bulkSession.projectId;logoChoice.render();const choice=createDialog.querySelector('[name="projectLogoId"]');if(choice)choice.value=bulkSession.projectLogoId;watchBulk(bulkSession);}updateCreateMode();
  const downloadAll=root.querySelector('#ad-download-all');downloadAll.disabled=!batch||batch.sourceSha256!==catalog.sourceSha256;
  downloadAll.onclick=async()=>{if(!batch||downloadBusy)return;downloadBusy=true;downloadAll.disabled=true;const label=downloadAll.textContent;try{
    await aiSaveQueue();
    downloadAll.textContent='正在检查并补齐…';
    const prepared=await api(`/api/ad-resources/batches/${encodeURIComponent(batch.id)}/prepare-download`,{method:'POST',body:'{}'});
    if(!prepared.ready){
      const first=prepared.blocked[0];
      if(first){activeSpecId=first.specId;activeTab='compose';await refresh();}
      throw Error(first?`${first.label}：${first.reason}${prepared.blocked.length>1?`（另有 ${prepared.blocked.length-1} 项待处理）`:''}`:'当前还有未完成的资源位，请检查后下载');
    }
    downloadAll.textContent='正在确认并打包…';
    const response=await fetch(`/api/ad-resources/batches/${encodeURIComponent(batch.id)}/download`,{method:'POST'});
    if(!response.ok){const error=await response.json();throw Error(error.error||'成套下载失败')}
    const url=URL.createObjectURL(await response.blob()),link=document.createElement('a');link.href=url;link.download=`${batch.project}_投放资源位.zip`;link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
    toast('成套文件已下载，整套设计稿已确认');refresh();
  }catch(error){toast(error.message)}finally{downloadBusy=false;downloadAll.disabled=false;downloadAll.textContent=label}};
  root.querySelector('#ad-create-confirm').onclick=async()=>{
    if(logoChoice.creatingProject){createError('项目正在创建，请稍候');return;}
    if(createBusy)return;
    if(createMode==='bulk'){
      try{
        if(bulkSession){void bulkSession.run();return;}
        const visuals=stagedAssets.filter(asset=>asset.role==='visual'),logos=stagedAssets.filter(asset=>asset.role==='logo'),project=projects.find(p=>p.id===projectSelect.value),logoId=logos.length?'':logoChoice.value==='default'?(project?.defaultLogoId||''):logoChoice.value;
        const session=startAdBulkSession({visuals,logos,projectId:projectSelect.value,projectLogoId:logoId},{api,upload:uploadAdAsset});clearStaged();watchBulk(session);createError('');updateCreateMode();
      }catch(error){createError(error.message);}return;
    }
    const project=root.querySelector('#ad-project-name').value.trim(),button=root.querySelector('#ad-create-confirm');
    if(!project){createError('请填写素材名称 / 任务名称。');root.querySelector('#ad-project-name').focus();return}
    if(!stagedAssets.some(asset=>asset.role==='visual')){createError('请至少添加一张 JPG 或 PSD 主视觉。');pasteZone.focus();return}
    const invalid=stagedAssets.map(asset=>validateAdUploadFile(asset.file)).find(result=>!result.ok);
    if(invalid){createError(invalid.error);return}
    setCreateBusy(true);createError('');
    const assetWarnings=[];
    try{
      button.textContent='正在创建任务…';
      if(!createdBatch){const result=await api('/api/ad-resources/batches',{method:'POST',body:JSON.stringify({project,projectId:projectSelect.value,projectLogoId:logoChoice.value,requestId:singleCreateRequestId})});createdBatch=result.batch;activeBatchId=createdBatch.id}
      for(let index=0;index<stagedAssets.length;index++){
        const asset=stagedAssets[index];if(asset.uploadedId)continue;
        button.textContent=`正在导入素材 ${index+1}/${stagedAssets.length}…`;
        const result=await uploadAdAsset(createdBatch.id,asset.file,{role:asset.role,onProgress:progress=>{showProgress(createProgress,`${asset.file.name} · ${progress.message}`);button.textContent=progress.phase==='processing'?progress.message:`正在上传 ${index+1}/${stagedAssets.length} · ${Math.round(progress.percent||0)}%`;}});
        asset.uploadedId=result.asset.id;
        assetWarnings.push(...(result.warnings||[]));
      }
      showProgress(createProgress,includesGif?'素材已导入，正在适配各尺寸；GIF 将自动使用可灵 V3 制作…':`素材已导入，正在按新规范制作 ${specs.length} 项资源位…`);
      button.textContent=includesGif?'正在准备各尺寸与可灵动效…':'正在制作各尺寸…';
      const result=await api(`/api/ad-resources/batches/${encodeURIComponent(createdBatch.id)}/auto-generate`,{method:'POST',body:'{}'});
      toast([adGenerationMessage(result),...assetWarnings].join(' '));
      createDialog.close();
    }catch(error){createError(createdBatch?`任务已保留：${error.message}。可重试继续制作，不会重复创建。`:error.message)}
    finally{setCreateBusy(false);showProgress(createProgress,'');button.textContent='创建并自动制作'}
  };
  let aiSaveQueue=()=>Promise.resolve();
  if(batch){
    const select=document.createElement('select');select.className='ad-batch-select';select.setAttribute('aria-label','切换投放任务');
    select.innerHTML=batches.map(entry=>`<option value="${entry.id}" ${entry.id===batch.id?'selected':''}>${esc(entry.project)}</option>`).join('');
    root.querySelector('.ad-heading-actions').prepend(select);select.onchange=()=>{activeBatchId=select.value;refresh({preserveViewport:false})};
    let renderQueue=Promise.resolve(),changeCount=0;
    aiSaveQueue=()=>renderQueue;
    const updateWorkingState=result=>{
      const updated=mergeAdWorkingUpdate(batch,spec.id,result);
      const count=result.sync?.updated?.length||0,status=root.querySelector('#ad-working-status');if(status){status.textContent=count?`已自动保存 · 已同步 ${count} 个同类尺寸`:item.draftDirty?'编辑稿已自动保存 · 同类尺寸自动联动':'微调自动保存并同步同类尺寸';status.title='Logo 大小与位置同步至同类带 Logo 稿；画面缩放与位置同步至同类画面。不会新增历史版本。';}
      for(const id of updated){const current=batch.items[id],card=root.querySelector(`[data-ad-spec="${CSS.escape(id)}"]`),caption=card?.querySelector('em');if(caption&&current.draftDirty)caption.textContent=`${current.versions.length} 个保留方案 · 编辑稿已更新`;const image=card?.querySelector('img');if(image&&current.draftDirty&&current.draft?.sourceAssetId)image.src=adWorkingThumbnailUrl(batch.id,id,current);}
      if(result.sync?.skipped?.length)toast(`部分尺寸未联动：${result.sync.skipped.map(entry=>{const target=specs.find(s=>s.id===entry.specId);return `${target?.width}×${target?.height} ${entry.reason}`}).join('；')}`);
      const undo=root.querySelector('#ad-draft-undo'),redo=root.querySelector('#ad-draft-redo');if(undo)undo.disabled=!result.canUndo;if(redo)redo.disabled=!result.canRedo;
      const final=root.querySelector('#ad-stage-final');if(final)final.hidden=item.draftDirty;
      root.dispatchEvent(new CustomEvent('ad-working-updated'));
    };
    updateWorkingState({draft:item.draft,draftDirty:item.draftDirty,canUndo:Boolean(item.draftUndo?.length),canRedo:Boolean(item.draftRedo?.length)});
    let manualBusy=false;
    const manualAction=async operation=>{
      if(manualBusy)return;manualBusy=true;
      const controls=[...root.querySelectorAll('.ad-working-actions button,.ad-sliders input,#ad-source-upload,#ad-logo-upload')],disabled=controls.map(node=>node.disabled);controls.forEach(node=>{node.disabled=true});
      try{await aiSaveQueue();await operation()}catch(error){toast(error.message)}finally{manualBusy=false;controls.forEach((node,i)=>{if(node.isConnected)node.disabled=disabled[i]})}
    };
    root.querySelector('#ad-keep-version')?.addEventListener('click',()=>manualAction(async()=>{
      const result=await api(`${endpoint(batch,spec)}/snapshots`,{method:'POST',body:JSON.stringify({expectedVersion:item.versions.at(-1)?.number||0,draft:{...draft}})});
      toast(result.deduplicated?'当前方案已保留，没有新增重复版本':`已保留为第 ${result.version.number} 版`);await refresh();
    }));
    for(const direction of ['undo','redo'])root.querySelector(`#ad-draft-${direction}`)?.addEventListener('click',()=>manualAction(async()=>{
      await api(`${endpoint(batch,spec)}/draft/${direction}`,{method:'POST',body:JSON.stringify({draft:{...draft}})});await refresh();
    }));
    root.querySelector('#ad-current-download')?.addEventListener('click',()=>manualAction(async()=>{
      const response=await fetch(`${endpoint(batch,spec)}/preview`);if(!response.ok){const error=await response.json();throw Error(error.error||'当前稿下载失败')}
      const url=URL.createObjectURL(await response.blob()),link=document.createElement('a');link.href=url;link.download=`${batch.project}_${spec.width}x${spec.height}.jpg`;link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
    }));
    const updateSavedCandidate=async(version,snapshot,token)=>{
      batch.items??={};batch.items[spec.id]=item;
      const previous=item.versions.findIndex(entry=>entry.number===version.number);
      if(previous<0)item.versions.push(version);else item.versions[previous]=version;
      item.versions.sort((a,b)=>a.number-b.number);item.draft=snapshot;
      root.dispatchEvent(new CustomEvent('ad-candidate-updated'));
      const restore=rememberAdViewport(content),card=root.querySelector(`[data-ad-spec="${spec.id}"]`);
      const status=`${item.versions.length} 个保留方案 · 待检查`;
      const historyTab=root.querySelector('[data-ad-tab="versions"]');if(historyTab)historyTab.textContent=`历史版本（${item.versions.length}）`;
      const thumbnail=card?.querySelector('img');
      if(thumbnail){thumbnail.src=version.url;thumbnail.alt=status}
      else if(card){const image=document.createElement('img');image.src=version.url;image.alt=status;card.querySelector('.ad-spec-icon')?.replaceWith(image)}
      if(card){const caption=card.querySelector('em');caption.textContent=status;caption.dataset.adHistory='true';caption.classList.add('ad-history-link');caption.title=`点击查看全部 ${item.versions.length} 个保留方案`}
      item.autoError='';item.autoWarning='';
      root.querySelectorAll('#ad-invalid-candidate,#ad-auto-error,#ad-auto-warning').forEach(node=>node.remove());restore();
      // A previous save must never cover a newer drag with its rendered image.
      const stillCurrent=()=>pageActive()&&token===changeCount&&Object.keys(snapshot).every(key=>draft[key]===snapshot[key]);
      if(!stillCurrent())return;
      try{await cacheImage(version.url)}catch{if(stillCurrent())toast('调整已保存，候选预览暂时无法加载');return}
      if(!stillCurrent())return;
      const stage=root.querySelector('#ad-stage');if(!stage)return;
      let candidate=stage.querySelector('#ad-stage-final');
      if(!candidate){candidate=document.createElement('img');candidate.id='ad-stage-final';candidate.className='ad-stage-final';candidate.alt='当前交付候选';stage.insertBefore(candidate,stage.querySelector('.ad-safe'))}
      candidate.src=version.url;candidate.hidden=false;
    };
    const saveAndRender=({inPlace=false}={})=>{
      if(!pageActive())return;
      if(spec.format==='GIF'&&(motionSubmitBusy||isAdMotionRunning(item.motionJob)||isAdMotionUncertain(item.motionJob)))return;
      inPlace=inPlace&&draft.sourceAssetId===source?.id;
      const snapshot={...draft},token=++changeCount;
      if(spec.format==='GIF'){motionSubmitBusy=true;updateMotionPresentation()}
      renderQueue=renderQueue.catch(()=>{}).then(async()=>{
        const saved=await persist(snapshot,{syncSimilar:spec.format==='JPG'&&inPlace});
        if(spec.format==='JPG')return {...saved,workingDraft:true};
        return snapshot.sourceAssetId?api(`${endpoint(batch,spec)}/render`,{method:'POST',body:JSON.stringify({draft:snapshot})}):null;
      });
      renderQueue.then(async result=>{
        if(!pageActive())return;
        if(result?.workingDraft){if(token!==changeCount)return;if(inPlace){updateWorkingState(result);return}await refresh();return}
        if(inPlace&&spec.format!=='GIF'&&result?.version){await updateSavedCandidate(result.version,snapshot,token);if(token===changeCount&&pageActive())toast('调整已自动保存，新候选已生成');return}
        if(token!==changeCount)return;
        if(isAdMotionPending(result)){recordPendingMotion(result);toast('可灵 V3 动效正在后台制作，可继续查看其他尺寸')}
        else{toast(snapshot.sourceAssetId?'调整已自动保存，新候选已生成':'选择已保存');refresh()}
      }).catch(error=>{
        if(token===changeCount&&pageActive()){toast(`保存未完成：${error.message}`);refresh()}
      }).finally(()=>{motionSubmitBusy=false;if(pageActive())updateMotionPresentation()});
    };
    root.querySelector('#ad-motion-generate')?.addEventListener('click',async()=>{
      if(motionSubmitBusy||isAdMotionRunning(item.motionJob)||isAdMotionUncertain(item.motionJob)||!source)return;
      const payload={draft:{...draft},...adMotionAction(item.motionJob).payload};
      motionSubmitBusy=true;updateMotionPresentation();
      try{
        await persist(payload.draft);
        const result=await api(`${endpoint(batch,spec)}/generate-gif`,{method:'POST',body:JSON.stringify(payload)});
        if(!pageActive())return;
        if(isAdMotionPending(result)){recordPendingMotion(result);toast('可灵 V3 动效正在后台制作，可继续查看其他尺寸')}
        else if(result.version){toast('可灵 V3 动效已生成，请检查播放效果');refresh()}
        else throw Error('未收到动效任务状态，请查询当前任务后再操作');
      }catch(error){if(pageActive()){toast(`动效制作未完成：${error.message}`);refresh()}}
      finally{motionSubmitBusy=false;if(pageActive())updateMotionPresentation()}
    });
    root.querySelector('#ad-motion-query')?.addEventListener('click',async()=>{
      if(motionSubmitBusy)return;
      motionSubmitBusy=true;updateMotionPresentation();
      try{
        const result=await api(`${endpoint(batch,spec)}/motion-job?refresh=1`);
        if(!pageActive())return;
        acceptMotionUpdate(spec.id,result);resumeMotionWatches();
      }catch(error){if(pageActive())toast(`状态查询失败：${error.message}`)}
      finally{motionSubmitBusy=false;if(pageActive())updateMotionPresentation()}
    });
    let uploadBusy=false;
    const upload=async(input,role)=>{
      const file=input.files?.[0];if(!file||uploadBusy)return;
      const validation=validateAdUploadFile(file);
      if(!validation.ok){input.value='';toast(validation.error);return}
      uploadBusy=true;
      const controls=[...root.querySelectorAll('#ad-source-upload,#ad-logo-upload,#ad-create-new,.ad-batch-select')];
      const previousDisabled=controls.map(node=>node.disabled);controls.forEach(node=>{node.disabled=true});
      try{
        const result=await uploadAdAsset(batch.id,file,{role,onProgress:progress=>{if(replacementProgress.isConnected)showProgress(replacementProgress,`${file.name} · ${progress.message}`)}});
        if(role==='logo'){const skipped=result.logoUpdate?.skipped?.length||0;toast(`新 Logo 已同步到 ${result.logoUpdate?.updated?.length||0} 张编辑稿${skipped?`；另有 ${skipped} 张源图已含 Logo，未重复叠加`:''}`);refresh()}
        else{draft.sourceAssetId=result.asset.id;if(result.warnings?.length)toast(result.warnings.join(' '));saveAndRender()}
      }catch(error){toast(error.message)}
      finally{uploadBusy=false;input.value='';controls.forEach((node,index)=>{node.disabled=previousDisabled[index]});showProgress(replacementProgress,'')}
    };
    root.querySelector('#ad-source-upload')?.addEventListener('change',event=>upload(event.target,'visual'));
    root.querySelector('#ad-logo-upload')?.addEventListener('change',event=>upload(event.target,'logo'));
    const sliders=[['#ad-zoom','zoom'],['#ad-x','offsetX'],['#ad-y','offsetY'],['#ad-logo-scale','logoScale'],['#ad-logo-x','logoX'],['#ad-logo-y','logoY']];
    sliders.forEach(([selector,key])=>{const input=root.querySelector(selector);if(!input)return;input.oninput=()=>{root.querySelector('#ad-stage-final')?.setAttribute('hidden','');draft[key]=Number(input.value);if(key==='zoom')root.querySelector('#ad-zoom-value').textContent=`${Math.round(draft.zoom*100)}%`;updatePreview()};input.onchange=()=>saveAndRender({inPlace:spec.format!=='GIF'})});
    updateMotionPresentation();resumeMotionWatches();
  }
  if(batch)stopAiWatcher=mountAdAiEditor({root,batch,spec,specs,item,draft,source,logos,api,toast,isActive:pageActive,refresh,waitForSaves:()=>aiSaveQueue()});
  if(batch&&data.creationRunningBatchIds?.includes(batch.id)){
    root.querySelectorAll('.ad-inspector input,.ad-inspector select,.ad-inspector button,.ad-working-actions button').forEach(node=>node.disabled=true);
    root.querySelector('#ad-download-all').disabled=true;
    const notice=document.createElement('div');notice.className='ad-note';notice.textContent='当前任务正在自动制作，可先查看画面，完成后再调整。';root.querySelector('.ad-center-head').after(notice);
  }
  restoreViewport();
}
