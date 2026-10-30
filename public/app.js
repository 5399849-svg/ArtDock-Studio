import {drawLayerHandles} from '/source-canvas-transform.js';
import {folderPickerHtml,bindFolderPickers,pickMaterialFolder} from '/platform/folder-upload.js';
import {clipboardSourceFiles,quickSourceFile} from '/quick-source-files.js';
import {usesTaskSizeName,taskSizeImageName} from '/task-output-name.js';
import {targetSizeRemoveButton,nextTargetAfterRemoval} from '/target-size-actions.js';
import {mountRecycleBin} from '/workbench-recycle-bin.js?v=20261028-recycle';
import { projectFonts, projectFontFamily, loadProjectFonts, selectedProjectFont, setCompanyFonts, companyFonts, loadFontAsset, popupFontFamily } from '/project-fonts.js';
import { renderCommunityComposer,hasCommunityMaster } from '/community-composer.js?v=20261020-daylight-reflow';
import {renderMasterInputs,renderMasterAi,renderMasterWorkspace} from '/community-master-page.js?v=20261028-resize-cleanup-final';
import {assertSourceExport,isSourceAdaptation,drawSourceComposition,sourceComposition} from '/source-adaptation-model.js';
import {sourceCopyrightKey,sourceCopyrightArtifactsCurrent} from '/source-copyright.js';
import {renderSourceWorkspace,mountSourceWorkspace} from '/source-adaptation-ui.js';
import {renderCommunityObjectTabs,renderCommunityObjectInspector,mountCommunityObjects} from '/community-objects.js?v=20261027-prompt-character';
import {mountCommunityObjectCanvas} from '/community-object-canvas.js?v=20261026-character-scale-stack';
import {renderSizeMaterials,sourceMaterialDialog,mountSizeMaterials} from '/community-size-materials.js';
import {drawCommunityObjectLayers,placedCommunityObjects,communityObjectLayerImageKey,loadCommunityObjectLayerImages} from '/community-object-layers.js?v=20261026-character-scale-stack';
import {illustrationOptions,illustrationCharacterSources} from '/community-illustration-state.js?v=20261027-prompt-character';
import {mountCharacterReuseMenus,setCharacterReuse,assertReusableCharacterImage} from '/community-character-reuse.js?v=20261027-prompt-character';
import {drawCommunityCopyright,copyrightColorMode} from '/community-copyright.js?v=20261026-copyright-regular';
import {renderCommunityProperties,mountCommunityProperties,syncCommunityPropertyControls,communityPropertyKey} from '/community-properties.js?v=20261027-properties-final';
import {changeCommunityWorkspaceStage,disableDeliveredEditing} from '/community-workspace-navigation.js?v=20261028-resize-cleanup-final';
import {communityArtworkTargetPending,communityTargetHasComposition} from '/community-artwork-state.js?v=20261028-source-reflow';
import {isCommunityPopup,popupConfig,popupLayerBox,popupButtonTextBox,drawPopupBackground,drawPopupButton,clipPopupCharacterBottom,assertPopupPixels} from '/community-popup-model.js';
import {renderPopupPanel,mountPopupPanel} from '/community-popup-panel.js?v=20261028-inherit-master';
import {communityExtensionProgress} from '/community-extension-progress.js?v=20261022-reviewed-suite';
import {openMaterialFontPicker} from '/community-material-fonts.js?v=20261028-source-han';
import {renderTextCleanupTool,openCommunityTextCleanup} from '/community-text-cleanup.js?v=20261021-text-cleanup';
import {createBannerDesignLayout,renderBannerTitleMask} from '/banner-design-input.js?v=20261015-artwork';
import {planBannerEdit,applyBannerLayoutOperations,shouldGenerateBannerBacking} from '/banner-edit-plan.js?v=20261015-follow-backing';
import {chooseBannerFont,bannerTypographyTheme} from '/banner-font-direction.js?v=20261015-artwork';
import {createWorkbench} from '/workbench-management.js?v=20261028-task-thumbnails';
import {openProjectMaterialPicker} from '/project-design-center.js?v=20261028-resize-cleanup-final';
import {taskStatus,taskStatusBucket} from '/workbench-model.js?v=20261028-resize-cleanup-final';
import {homeTaskMenu,copyModuleTaskSetup} from '/home-task-menu.js?v=20261028-task-menu';
import {openTaskRename} from '/task-rename.js?v=20261022-task-name-logo-range';
import {mountDashboard,mountBusinessHub,mountBusinessOverview,businesses} from '/home-dashboard.js?v=20261028-task-menu';
import {mountTaskTypeWorkbench} from '/task-type-workbench.js?v=20261028-resize-cleanup-final';
import {openCustomCanvasTask,openCustomCanvasResize} from '/custom-canvas.js?v=20261028-resize-cleanup-final';
import {customCanvasTemplate} from '/custom-canvas-model.js?v=20261028-resize-cleanup-final';
import {customCanvasSpec} from '/custom-canvas-model.js?v=20261028-resize-cleanup-final';
import {renderTargetSizeDialog,bindTargetSizeDialog} from '/target-size-dialog.js?v=20261028-custom-targets';
import {mountPhaseWorkbench} from '/phase-workbench.js?v=20261015-consolidation';
import {createSpecCenterNavigation,normalizeSpecSelection} from '/spec-center-navigation.js?v=20261015-consolidation';
import { protectedComposition, drawRegisteredComposite, drawFeatheredOriginal } from "/outpaint-composite.js?v=20260911-universal-feather";
import { openRegionEditor } from "/region-editor.js?v=20260907-region-editor";
import { resolveProductionScope, selectProductionTemplates } from "/production-scope.js?v=20260908-intent-scope-2";
import { transformButtonPixels } from "/button-state.js?v=20260909-mumu-button-original-text";
import { coverPlacement, findForegroundOutput, fitSubjectToBreakout, isProductionForeground, keepImageAspect } from "/breakout-layer.js?v=20260915-dual-popup-layers-3";
import { mountStorePreorder } from "/store-preorder.js?v=20261023-project-create";
import { mountIconPreorder as mountIconLaunch } from '/icon-preorder.js?phase=launch&v=20261023-project-create';
import { mountStorePreorder as mountStoreLaunch } from '/store-preorder.js?phase=launch&v=20261023-project-create';
import { mountIconPreorder } from "/icon-preorder.js?v=20261023-project-create";
import { mountChannelResources } from "/channel-resources.js?v=20261023-project-create";
import { mountAdResources } from "/ad-resources.js?v=20261023-project-create";
import { normalizeElementEffects, drawElementWithEffects } from "/element-effects.js?v=20261009-flip";
import { remapCommunityLayer, remapCommunitySubtitleBacking } from "/community-auto-layout.js?v=20261015-artwork";
import { normalizeSubtitleBacking, createSubtitleBackingLayout, drawSubtitleBacking } from '/subtitle-backing.js?v=20261015-conversation';
import { measureNativeCopy, drawNativeCopy, defaultNativeCopyEffects } from '/native-copy-layer.js?v=20261015-follow-backing-v2';
import { isRenderableImageAsset, preferredSourceAsset, loadEditorImages } from '/editor-image-source.js?v=20261028-source-reflow';
const state = { data: null, view: "home", task: null, previewTemplateId: null, previewMode: "target", sourceImage: null, sourceAsset: null, assetImages: new Map(), filter: "全部", assetFilter: "全部素材", editorAssetFilter: "全部", editorAssetQuery: "", showGuides: true, editorHistory: null, reviewTaskId: null, reviewTab: "待审核", annotationType: "core-character", polygonPoints: [], cutoutPoints: [], cutoutSourceName: "", paramsSaveTimer: null, paramsSavePromise: Promise.resolve(true), inspectorTab: "elements", inspectorElement: "title", canvasDrag: null };
state.communitySideTab = "ai";
state.communityGenerationPoll = null;
state.communityPastedImages = new Set();
state.assetProjectFilter = "all";
state.projectSearch = "";
state.projectTypeFilter = "all";
state.projectCategoryFilter = "all";
state.projectOwnerFilter = "all";
state.projectDateFilter = "all";
state.projectSortAsc = false;
state.projectListView = false;
state.specLineId = "";
state.specSegmentId = "";
state.specTemplateId = "";
state.specTab = "detail";
state.specSelection = {module:'core'};
state.channelResourceChannel = "huawei";
state.modulePhases = { store: 'preorder', icon: 'preorder' };
const taskWorkbenchRoutes = Object.freeze({
  'custom-canvas':'custom',
  'platform-workbench': 'platform', 'community-workbench': 'community',
  'ads-mumu': 'mumu', 'ads-leidian': 'leidian',
});
const phaseWorkbenchViews = ['store-workbench', 'icon-workbench'];
const content = document.querySelector("#app-content");
const title = document.querySelector("#page-title");
const taskDialog = document.querySelector("#task-dialog");
const brandDialog = document.querySelector("#brand-dialog");
const specDialog = document.querySelector("#spec-dialog");
const referenceDialog = document.querySelector("#reference-dialog");
const projectDialog = document.querySelector("#project-dialog");
const ruleDialog = document.querySelector("#rule-dialog");

async function api(url, options = {}) {
  let response;
  try {
    response = await fetch(url, { headers: { "Content-Type": "application/json", ...(options.headers || {}) }, ...options });
  } catch {
    throw new Error("连不上工作台服务，请检查网络后刷新页面");
  }
  const type = response.headers.get("content-type") || "";
  const body = response.status === 204 ? null : type.includes("json") ? await response.json() : await response.text();
  if (!response.ok) throw new Error(body?.error || body?.errors?.join("；") || `请求失败（${response.status}）`);
  return body;
}

function esc(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}

function toast(message) {
  const el = document.querySelector("#toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove("show"), 2600);
}

const management=createWorkbench({content,data:()=>state.data,api,toast,reload:async()=>{state.data=await api("/api/bootstrap");management.invalidate();},
 openTask,openModule:(view,id,channel,specId)=>goDashboardView(view,channel||'',id,specId||''),
 navigate:(view,selection)=>{if(view==='specs')return openSpecCenter(selection||{module:'core'});state.managementSelection=selection;goDashboardView(view);},
 createTask:(projectId,asset,mode='original')=>{openNewTask();if(projectId){document.querySelector('#project-select').value=projectId;document.querySelector('#project-select').dispatchEvent(new Event('change'));}if(asset?.category&&asset.id){document.querySelector('#task-business-line').value='platform-community';syncTaskSegments();document.querySelectorAll('#task-segment-menu input').forEach(input=>input.checked=['community','official-media'].includes(input.value));updateTaskSegmentSummary();syncTaskTemplates();document.querySelector('#task-mode').value='master';syncTaskModeFields();quickProjectLibraryUse={projectId,assetId:asset.id,mode,asset};renderQuickPastedAssets();return;}if(asset){const session=quickTaskSession;quickAssetLoading=true;document.querySelector('#quick-source-result').textContent='正在读取所选素材…';(async()=>{try{const response=await fetch(asset.url);if(!response.ok)throw Error('原素材文件无法读取');const blob=await response.blob();if(!blob.type.startsWith('image/'))throw Error('此素材请通过文件夹导入');const file=new File([blob],asset.name,{type:blob.type});if(session!==quickTaskSession||!taskDialog.open)return;quickPastedAssets.push({id:crypto.randomUUID(),file,role:asset.role||"master",url:URL.createObjectURL(file),uploaded:false});renderQuickPastedAssets();document.querySelector('#quick-source-result').textContent='所选素材已加入，创建任务时保存。';}catch(e){toast(e.message);}finally{if(session===quickTaskSession)quickAssetLoading=false;}})();}},
 newProject:()=>openProjectDialog(),editProject:id=>openProjectDialog(id)
});
window.addEventListener('workbench-project-created',event=>{
  const project=event.detail?.project;if(!project?.id||!state.data)return;
  const known=state.data.projects.find(p=>p.id===project.id);
  if(known)Object.assign(known,project);else state.data.projects.unshift(project);
  management.invalidate();
});
const specNavigation=createSpecCenterNavigation({data:()=>state.data,api,onSelect:openSpecCenter,
 onSelectionChange:selection=>{state.specSelection=selection;},
 openModule:(module,id='',channel='')=>{
  if(/^(store|icon)-(preorder|launch)$/.test(module)&&!id)return goDashboardView(`${module.split('-')[0]}-workbench`,module.endsWith('launch')?'launch':'preorder');
  goDashboardView(module,channel||'',id);
 },
 isActive:()=>state.view==='specs'&&!state.task,
 treeActions:{onAddLine:addBusinessLine,onAddSegment:addSegment,onRenameLine:renameBusinessLine,onToggleLine:(id,enabled)=>patchBusinessLine(id,{enabled})},
});
function openSpecCenter(value={module:'core'}){
 const selection=normalizeSpecSelection(value);state.specSelection=selection;state.managementSelection=null;
 if(selection.module==='core'){
  state.specLineId=selection.lineId||state.specLineId;state.specSegmentId=selection.segmentId||'';state.specTemplateId=selection.templateId||'';state.specTab='detail';
 }
 goDashboardView('specs');
}
function renderTasks(){title.textContent='全部任务';management.tasks().catch(e=>toast(e.message));}
function renderProjects(){title.textContent='项目';management.projects(typeof state.managementSelection==='string'?state.managementSelection:'').catch(e=>toast(e.message));state.managementSelection='';}
function renderAssets(){title.textContent='资产库';management.assets(typeof state.managementSelection==='string'?state.managementSelection:'all').catch(e=>toast(e.message));state.managementSelection='';}
const globalSearch=document.querySelector('#topbar-search-input');
const globalSearchLabel=globalSearch.closest('.topbar-search');
const globalSearchTopbar=document.querySelector('.topbar-main');
const globalSearchPanel=document.querySelector('#workspace-search-panel');
const globalSearchToggle=document.querySelector('#workspace-search-toggle');
function closeGlobalSearch(){globalSearchPanel.hidden=true;globalSearchToggle.setAttribute('aria-expanded','false');document.body.classList.remove('workspace-search-open');globalResults.hidden=true;}
function moveGlobalSearchToPanel(){globalSearchPanel.append(globalSearchLabel,globalResults);}
globalSearchToggle.addEventListener('click',()=>{
 if(!globalSearchPanel.hidden){closeGlobalSearch();return;}
 moveGlobalSearchToPanel();globalSearchPanel.hidden=false;globalSearchToggle.setAttribute('aria-expanded','true');document.body.classList.add('workspace-search-open');globalSearch.focus();
});
const globalResults=document.createElement('div');globalResults.id='wb-global-results';globalResults.hidden=true;globalResults.className='wb-global-results';document.querySelector('.topbar-search').append(globalResults);
let globalSearchTimer;globalSearch.addEventListener('input',e=>{const q=e.target.value;clearTimeout(globalSearchTimer);globalSearchTimer=setTimeout(()=>management.search(q).catch(e=>toast(e.message)),180);});
globalSearch.addEventListener('focus',()=>management.invalidate());
document.addEventListener('click',e=>{if(!e.target.closest('.topbar-search'))globalResults.hidden=true;if(!globalSearchPanel.hidden&&!e.target.closest('#workspace-search-panel,#workspace-search-toggle'))closeGlobalSearch();});
globalSearch.addEventListener('keydown',e=>{if(e.key==='Escape'){if(!globalSearchPanel.hidden){closeGlobalSearch();globalSearchToggle.focus();}else globalResults.hidden=true;}});
document.addEventListener('error',e=>{if(e.target instanceof HTMLImageElement&&!e.target.dataset.failed){e.target.dataset.failed='true';e.target.hidden=true;const note=document.createElement('span');note.className='wb-file-missing';note.textContent='预览不可用 · 请检查原文件';e.target.after(note);}},true);

async function refresh() {
  const [data, fontLibrary] = await Promise.all([api("/api/bootstrap"), api('/api/company-fonts').catch(() => ({ fonts: companyFonts(), issues:state.companyFontIssues || [] }))]);
  state.data = data;
  setCompanyFonts(fontLibrary.fonts || []);
  state.companyFontIssues = fontLibrary.issues || [];
  management.invalidate();
  if (state.task) state.task = state.data.tasks.find((task) => task.id === state.task.id) || null;
  render();
}

function render() {
  closeGlobalSearch();
  if(state.view !== 'home'||state.task)moveGlobalSearchToPanel();
  globalSearch.placeholder=state.view==='home'&&!state.task?'搜索任意内容':'搜索项目、任务或资源位';
  document.body.classList.remove('project-design-mode');
  document.querySelector('.pdc-topbar')?.remove();
  document.body.classList.toggle("task-editor-mode", Boolean(state.task));
  document.body.classList.toggle("home-mode", state.view === "home" && !state.task);
  document.body.classList.toggle("workspace-shell-mode", !state.task);
  document.body.classList.toggle("overview-mode", !state.task&&['home','projects','business-all','business-platform','business-channel','business-ads','community-specs'].includes(state.view));
  document.body.classList.toggle("business-overview-mode", state.view==='business-all'&&!state.task);
  document.body.classList.toggle("business-hub-mode", state.view.startsWith('business-')&&state.view!=='business-all'&&!state.task);
  document.body.classList.toggle("review-mode", state.view === "review" && !state.task);
  document.body.classList.toggle("projects-mode", state.view === "projects" && !state.task);
  document.body.classList.toggle("ad-resources-mode", state.view === "ad-resources" && !state.task);
  document.body.classList.toggle("task-type-workbench-mode", Boolean(taskWorkbenchRoutes[state.view]) && !state.task);
  document.body.classList.toggle("phase-workbench-mode", (phaseWorkbenchViews.includes(state.view)||/^(store|icon)-(preorder|launch)$/.test(state.view)) && !state.task);
  const topbarEyebrow = document.querySelector(".topbar-title .eyebrow");
  if (topbarEyebrow) topbarEyebrow.textContent = "DESIGN PRODUCTION WORKBENCH";
  document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.view === state.view || (item.dataset.view === "business-platform" && ['platform-workbench','community-workbench'].includes(state.view)) || (item.dataset.view === "business-channel" && (/^(store|icon)-(preorder|launch)$/.test(state.view)||phaseWorkbenchViews.includes(state.view)||state.view==='channel-resources')) || (item.dataset.view === "business-ads" && ['ad-resources','ads-mumu','ads-leidian'].includes(state.view))));
  document.querySelector('.home-create-nav')?.classList.toggle('active',state.view==='business-all');
  const activeBusiness=/^(store|icon)-(preorder|launch)$/.test(state.view)||phaseWorkbenchViews.includes(state.view)||state.view==='channel-resources'?'business-channel':['ad-resources','ads-mumu','ads-leidian'].includes(state.view)?'business-ads':['community-specs','platform-workbench','community-workbench'].includes(state.view)?'business-platform':state.view;
  document.querySelectorAll('[data-home-business]').forEach(item=>item.classList.toggle('active',item.dataset.homeBusiness===activeBusiness));
  document.querySelectorAll('.nav-sub-item').forEach(item=>item.classList.toggle('active',item.dataset.view===state.view));
  document.querySelectorAll('.nav-channel-item').forEach(item=>item.classList.toggle('active',state.view==='channel-resources'&&item.dataset.channel===state.channelResourceChannel));
  const newTaskButton = document.querySelector("#new-task"); if (newTaskButton) newTaskButton.style.display = "none";
  if (state.task) return renderTaskDetail();
  if (phaseWorkbenchViews.includes(state.view)||/^(store|icon)-(preorder|launch)$/.test(state.view)) return renderPhaseWorkbench();
  if (taskWorkbenchRoutes[state.view]) return renderTaskTypeWorkbench(taskWorkbenchRoutes[state.view]);
  if (state.view === 'channel-resources') {const channel=state.channelResourceChannel,itemId=state.moduleJobId||'',openCreate=state.businessAnchor==='create',openRules=state.businessAnchor==='rules';state.moduleJobId='';state.businessAnchor='';return mountChannelResources(content,title,{api,toast,isActive:()=>state.view==='channel-resources'&&!state.task&&state.channelResourceChannel===channel,selectedChannel:channel,initialItemId:itemId,openCreate,openRules,selectChannel:id=>goDashboardView('channel-resources',id),onBrowseRules:id=>openSpecCenter(id==='huawei'?{module:'channel-resources',channelId:id}:{module:'core',lineId:'channel-distribution',segmentId:id})});}
  if (state.view === 'ad-resources') {const openCreate=state.businessAnchor==='create',initialBatchId=state.moduleJobId||'',initialSpecId=state.moduleSpecId||'';state.businessAnchor='';state.moduleJobId='';state.moduleSpecId='';return mountAdResources(content,title,{api,toast,isActive:()=>state.view==='ad-resources'&&!state.task,openCreate,initialBatchId,initialSpecId,onBrowseRules:()=>openSpecCenter({module:'ad-resources'})});}
  if (state.view === 'business-all') return renderBusinessOverview();
  if (state.view === 'community-specs') return renderCommunityCatalog();
  if (state.view.startsWith("business-")) return renderBusinessHub();
  if (state.view === "projects") return renderProjects();
  if (state.view === "tasks") return renderTasks();
  if (state.view === "assets") return renderAssets();
  if (state.view === "recycle-bin") {title.textContent='回收站';return mountRecycleBin(content,{api,toast,projects:state.data?.projects||[],isActive:()=>state.view==='recycle-bin'&&!state.task,onChanged:async()=>{state.data=await api('/api/bootstrap');management.invalidate();}});}
  if (state.view === "specs") return renderBusinessLines();
  if (state.view === "review") return renderReview();
  if (state.view === "templates") return renderTemplates();
  if (state.view === "brands") return renderBrands();
  if (state.view === "ai-center") return renderAiCenter();
  renderHome();
}

function goDashboardView(view, anchor = '', jobId = '', specId = '') {
  if(view==='channel-resources'&&anchor.startsWith('rules:')){const channel=anchor.split(':')[1];return openSpecCenter(channel==='huawei'?{module:'channel-resources',channelId:channel}:{module:'core',lineId:'channel-distribution',segmentId:channel});}
  state.view=view;state.task=null;state.businessAnchor=anchor;state.moduleJobId=jobId;state.moduleSpecId=specId;if(view==='channel-resources'&&anchor){if(anchor.startsWith('create:')||anchor.startsWith('rules:')){state.businessAnchor=anchor.split(':')[0];state.channelResourceChannel=anchor.split(':')[1];}else state.channelResourceChannel=anchor;}
  const phaseRoute=/^(store|icon)-(preorder|launch)$/.exec(view);
  if(phaseRoute)state.modulePhases[phaseRoute[1]]=phaseRoute[2];
  if(phaseWorkbenchViews.includes(view)&&['preorder','launch'].includes(anchor))state.modulePhases[view.split('-')[0]]=anchor;
  const address=new URL(location.href);
  address.searchParams.delete('task');address.searchParams.delete('template');
  if(view==='channel-resources'){address.searchParams.set('view',view);address.searchParams.set('channel',state.channelResourceChannel);}
  else if(taskWorkbenchRoutes[view]||phaseWorkbenchViews.includes(view)||['ad-resources','store-preorder','store-launch','icon-preorder','icon-launch'].includes(view)){address.searchParams.set('view',view);address.searchParams.delete('channel');}
  else{address.searchParams.delete('view');address.searchParams.delete('channel');}
  if(phaseWorkbenchViews.includes(view))address.searchParams.set('phase',state.modulePhases[view.split('-')[0]]);
  else address.searchParams.delete('phase');
  if(view==='ad-resources'&&specId)address.searchParams.set('spec',specId);else address.searchParams.delete('spec');
  if(jobId)address.searchParams.set('job',jobId);else address.searchParams.delete('job');history.replaceState(null,'',address);
  render();
  window.scrollTo(0,0);
}
function renderTaskTypeWorkbench(type){
  const view=state.view;
  mountTaskTypeWorkbench(content,{type,data:state.data,thumb:taskThumb,openTask,create:(line,segment)=>segment==='custom-canvas'?openCustomCanvasTask({projects:state.data.projects,api,created:async task=>{await refresh();await openTask(task.id);}}):openBusinessTask(line,segment),
    isActive:()=>state.view===view&&!state.task,
    browse:(line,segment)=>openSpecCenter({module:'core',lineId:line,segmentId:segment==='community-media'?'community':segment})
  });
  title.textContent=({platform:'平台资源位',community:'社区外媒',mumu:'MuMu模拟器',leidian:'雷电模拟器',custom:'自定义尺寸'})[type]+'工作台';
}
function renderPhaseWorkbench(){
  const view=state.view,legacy=/^(store|icon)-(preorder|launch)$/.exec(view);
  const kind=legacy?legacy[1]:view.split('-')[0],phase=legacy?legacy[2]:state.modulePhases[kind];
  const mount=kind==='store'?(phase==='launch'?mountStoreLaunch:mountStorePreorder):(phase==='launch'?mountIconLaunch:mountIconPreorder);
  return mountPhaseWorkbench(content,{kind,phase,title,mount,selectedJobId:state.moduleJobId,
    isActive:()=>state.view===view&&!state.task&&state.modulePhases[kind]===phase,
    onPhaseChange:next=>goDashboardView(`${kind}-workbench`,next),
  });
}
function renderHome() {
  title.textContent='首页';
  if(globalSearchLabel.parentElement!==globalSearchPanel)globalSearchPanel.append(globalSearchLabel);
  mountDashboard(content,{
    data:state.data,thumb:taskThumb,coreCard:homeRecentTaskCard,loadTasks:()=>management.load(true),openIndexedTask:management.open,
    form:`<form class="home-auto-form" id="home-auto-form">
          <textarea name="instruction" rows="2" required placeholder="例如：为XXX项目XXXKV生成平台全套资源位图"></textarea>
          <div>${folderPickerHtml()}<button class="button primary">一键自动生成</button></div>
          <small>素材包建议包含：横/竖完整KV、横/竖纯图背景、主标、副标、Logo、版权标识和按钮；系统只添加PSD当前版式要求的元素。</small>
        </form>`,
    navigate:goDashboardView,
    isActive:()=>state.view==='home'&&!state.task,
    openModule:(view,id,channel)=>goDashboardView(view,channel||'',id),
    renameHomeTask:async task=>{
      const saved=await openTaskRename(task,name=>api('/api/workbench/task-names',{method:'PUT',body:JSON.stringify({key:task.key||`${task.module||'core'}:${task.id}`,name})}));
      if(!saved)return;
      management.invalidate();if(state.view==='home'&&!state.task)renderHome();
      toast('任务名称已修改');
    },
    copyHomeTask:async task=>{
      await copyModuleTaskSetup(task,api);management.invalidate();
      if(state.view==='home'&&!state.task)renderHome();toast('已复制任务，草稿可继续制作');
    },
    deleteHomeTask:async task=>{
      if(!window.confirm(`确定删除任务“${task.project}”吗？任务、素材和全部历史版本将保留在回收站，可随时恢复。`))return;
      let url;
      if(task.module==='channel-resources')url=`/api/channel-resources/batches/${encodeURIComponent(task.batchId)}/projects/${encodeURIComponent(task.projectKey)}`;
      else if(task.module==='ad-resources')url=`/api/ad-resources/batches/${encodeURIComponent(task.id)}`;
      else if(['store-preorder','store-launch','icon-preorder','icon-launch'].includes(task.module))url=`/api/${task.module}/jobs/${encodeURIComponent(task.id)}`;
      else if(!task.module||task.module==='core')url=`/api/tasks/${encodeURIComponent(task.id)}`;
      else{toast('暂不支持删除此类任务');return}
      try{
        await api(url,{method:'DELETE'});
        if(task.module&&task.module!=='core'){management.invalidate();if(state.view==='home'&&!state.task)renderHome()}
        else await refresh();
        toast('任务已移至回收站，可在左侧回收站恢复');
      }catch(error){toast(`删除失败：${error.message}`)}
    },
    bindLegacy:()=>{
      const list=content.querySelector('.dash-task-list');
  list.querySelectorAll("[data-task]").forEach((button) => button.addEventListener("click", () => openTask(button.dataset.task)));
  list.querySelectorAll("[data-home-task-menu]").forEach((button) => button.addEventListener("click", (event) => {
    event.stopPropagation();
    const menu = list.querySelector(`[data-home-task-menu-panel="${button.dataset.homeTaskMenu}"]`);
    list.querySelectorAll(".home-task-menu").forEach((item) => { if (item !== menu) item.hidden = true; });
    if (menu) menu.hidden = !menu.hidden;
  }));
  list.querySelectorAll("[data-home-task-action]").forEach((button) => button.addEventListener("click", async (event) => {
    event.stopPropagation();
    button.closest(".home-task-menu").hidden = true;
    await handleHomeTaskAction(button.dataset.homeTaskAction, button.dataset.taskId);
  }));

    }
  });
  content.querySelectorAll('[data-go-view]').forEach(b=>b.onclick=()=>goDashboardView(b.dataset.goView));
  content.querySelector('#home-auto-form')?.addEventListener('submit',runOneClickProduction);
  const homeForm=content.querySelector('#home-auto-form');if(homeForm)bindFolderPickers(homeForm,{onBusy:busy=>{homeForm.querySelector('button.primary').disabled=busy;}});
  content.querySelector('.home-hero-search-slot')?.append(globalSearchLabel);
  globalSearchLabel.append(globalResults);
}
function renderBusinessOverview(){
  title.textContent='所有业务';
  mountBusinessOverview(content,{navigate:goDashboardView});
}
function renderBusinessHub(selectedSegment='') {
  const id=selectedSegment?'ads':state.view.replace('business-','');title.textContent=selectedSegment?selectedSegment==='mumu'?'MuMu模拟器':'雷电模拟器':businesses.find(b=>b.id===id).name;
  mountBusinessHub(content,id,{data:state.data,anchor:state.businessAnchor,selectedSegment,navigate:goDashboardView,
    create:openBusinessTask,
    browse:(line,segment)=>openSpecCenter({module:'core',lineId:line,segmentId:segment==='community-media'?'community':segment})
  });
}
function openBusinessTask(line,segment){
 const community=segment==='community-media';
 openNewTask(community?'master':'adapt');
 document.querySelector('#task-business-line').value=line;
 syncTaskSegments();
 if(segment){const selected=community?['community','official-media']:[segment];document.querySelectorAll('#task-segment-menu input').forEach(input=>input.checked=selected.includes(input.value));updateTaskSegmentSummary();syncTaskTemplates()}
 if(community)document.querySelector('#quick-scope').open=true;
}
function renderCommunityCatalog(){
 openSpecCenter({module:'core',lineId:'platform-community',segmentId:'community'});
}
function taskNameFromInstruction(instruction) {
  return String(instruction || "自动化素材生产").replace(/[。；;\n].*$/s, "").trim().slice(0, 40) || "自动化素材生产";
}

function templateHasExtensionZone(template) {
  const rule = state.data.psdLayoutRules?.templates?.find((item) => item.templateId === template.id);
  const variant = activePsdVariant(template);
  return [...(rule?.globalRegions || []), ...(variant?.regions || [])].some((region) => /^extend-/.test(region.type));
}

async function runOneClickProduction(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const submit = form.querySelector("button");
  const values = new FormData(form);
  const instruction = String(values.get("instruction") || "").trim();
  const folderPath = String(values.get("folderPath") || "").trim();
  if (!folderPath) return toast("请先点「选择素材包文件夹」，选好并上传完成后再生成");
  const scope = resolveProductionScope(instruction, state.data.businessLines || []);
  const selection = selectProductionTemplates(state.data.templates, state.data.resourceRules || [], scope);
  const eligible = selection.templates;
  if (!eligible.length) return toast(`没有找到“${scope.label}”可自动生成的资源位`);
  const project = state.data.projects.find((item) => instruction.includes(item.name)) || state.data.projects.find((item) => item.status === "active") || state.data.projects[0];
  const segmentIds = [...new Set(eligible.map((template) => template.segmentId))];
  const targetTemplateIds = eligible.map((template) => template.id);
  submit.disabled = true; submit.textContent = "正在创建任务…";
  try {
    const taskName = taskNameFromInstruction(instruction);
    const unfinished = state.data.tasks.find((task) => task.project === taskName && task.businessLineId === scope.businessLineId && targetTemplateIds.length === task.targetTemplateIds?.length && targetTemplateIds.every((id) => task.targetTemplateIds.includes(id)) && !task.assets?.length && ["草稿", "批量生成"].includes(task.status));
    const created = unfinished || await api("/api/tasks", { method: "POST", body: JSON.stringify({
      project: taskName, requester: "设计师", mode: "adapt", copy: "", notes: instruction,
      projectId: project?.id || "", brandId: project?.brandId || "", businessLineId: scope.businessLineId,
      segmentId: segmentIds[0], segmentIds, masterTemplateId: eligible[0].id, targetTemplateIds, submit: true,
    }) });
    submit.textContent = "正在读取素材包…";
    await api(`/api/tasks/${created.id}/assets/import-folder`, { method: "POST", body: JSON.stringify({ folderPath }) });
    if (created.status !== "批量生成") await api(`/api/tasks/${created.id}`, { method: "PATCH", body: JSON.stringify({ status: "批量生成", by: "自动生产", action: "素材识别完成，进入自动构图" }) });
    await refresh();
    await openTask(created.id);
    await autoApplyAllTemplates(false);

    const missing = [];
    if (!state.task.assets.some((asset) => asset.role === "master-landscape")) missing.push("横版完整KV");
    if (!state.task.assets.some((asset) => asset.role === "master-portrait")) missing.push("竖版完整KV");
    if (!state.task.assets.some((asset) => asset.role === "background-landscape")) missing.push("横版纯图背景");
    if (!state.task.assets.some((asset) => asset.role === "background-portrait")) missing.push("竖版纯图背景");
    if (missing.length) return toast(`素材包识别后仍缺少：${missing.join("、")}。任务已保留，请补充后再次自动套用`);

    const needsOutpaint = state.task.templates.filter((template) => templateHasExtensionZone(template) && getTemplateBackground(state.task, template).scale < 99);
    if (needsOutpaint.length && !state.data.aiHuabu?.enabled) return toast(`已完成自动构图；${needsOutpaint.length} 个尺寸需要扩图，但AI扩图服务未启用`);
    const failures = [];
    for (let index = 0; index < needsOutpaint.length; index += 1) {
      const template = needsOutpaint[index];
      toast(`自动扩图 ${index + 1}/${needsOutpaint.length}：${template.name}`);
      try {
        const background = getTemplateBackground(state.task, template);
        const result = await api(`/api/tasks/${state.task.id}/outpaint`, { method: "POST", body: JSON.stringify({ templateId: template.id, model: background.outpaintModel || "banana", sourceUrl: resolveBackgroundSourceUrl(state.task, template), prompt: background.outpaintPrompt || "", allowNewSubjects: false }) });
        if (result?.id) state.task = result;
      } catch (error) { failures.push(`${template.name}：${error.message}`); }
    }
    await hydrateOutpaintImages(state.task);
    if (failures.length) { renderTaskDetail(); return toast(`自动扩图有 ${failures.length} 项失败，已停在成套总览：${failures[0]}`); }
    await renderArtifacts(false);
    toast(selection.validationOnly ? `已按${scope.label}的${eligible.length}个尺寸生成验证稿；规范发布后可交付ZIP` : `已按${scope.label}的${eligible.length}个尺寸自动生成，请在成套总览中检查`);
  } catch (error) {
    toast(error.message);
    if (submit?.isConnected) { submit.disabled = false; submit.textContent = "一键自动生成"; }
  }
}

function relativeDate(value) { if (!value) return "刚刚"; const days = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86400000)); return days === 0 ? "今天" : `${days} 天前`; }
function homeCover(url, label, index = 0) { return url ? `<img src="${esc(url)}" alt="" />` : `<span class="home-cover-fallback tone-${index % 4}">${esc(label.slice(0,2))}</span>`; }
function homeProjectCard(project, index) { return `<button class="home-work-card" data-project-open="${project.id}" data-home-search-card><span class="home-card-cover">${homeCover(project.thumb, project.name, index)}</span><b>${esc(project.name)}</b><small>更新于 ${relativeDate(project.updatedAt)}</small></button>`; }
function homeRecentTaskCard(task, index) {
  const businessLine=state.data.businessLines?.find(line=>line.id===task.businessLineId);
  const segment=businessLine?.segments?.find(item=>item.id===task.segmentId);
  const taskContext=`${businessLine?.name||'素材制作'} / ${segment?.name||'资源位'} · ${task.targetTemplateIds?.length||1}张交付稿`;
  return `<article class="home-work-card home-recent-task-card" data-home-search-card>
    <div class="home-task-card-tools"><label title="选择任务"><input type="checkbox" data-dash-select="core:${task.id}" aria-label="选择${esc(task.project)}"></label><span class="home-task-tool-actions"><button type="button" class="home-task-favorite" data-dash-favorite="core:${task.id}" title="收藏任务" aria-label="收藏任务" aria-pressed="false">☆</button><button type="button" class="home-task-more" data-home-task-menu="${task.id}" title="更多操作" aria-label="更多操作">•••</button></span></div>
    <button class="home-task-open" data-task="${task.id}"><span class="home-card-cover">${homeCover(taskThumb(task), task.project, index)}</span><span class="home-task-card-meta"><strong>${esc(task.project)}</strong><small>更新于 ${relativeDate(task.updatedAt || task.createdAt)}</small></span><small class="dash-card-context">${esc(taskContext)}</small><em class="home-card-status ${taskStatusBucket(task)}" data-status="${taskStatus(task)}">${taskStatus(task)}</em></button>
    ${homeTaskMenu({taskId:task.id})}
  </article>`;
}
function homeTaskUrl(taskId) {
  const url = new URL(location.href);
  url.searchParams.set("task", taskId);
  return url.href;
}
async function copyHomeTask(task) {
  const created = await api("/api/tasks", { method: "POST", body: JSON.stringify({
    project: `${task.project} 副本`, requester: "设计师", mode: task.mode, copy: task.copy || "", notes: task.notes || "",
    projectId: task.projectId || "", brandId: task.brandId || "", businessLineId: task.businessLineId,
    segmentId: task.segmentId, segmentIds: task.segmentIds || [task.segmentId], masterTemplateId: task.sourceAdaptation?'community-banner-master':task.masterTemplateId,
    targetTemplateIds: task.targetTemplateIds, ...(task.customCanvas?{customCanvas:task.customCanvas}:{}), ...(task.customTargetSizes?.length?{customTargetSizes:task.customTargetSizes}:{}), submit: false
  }) });
  await refresh();
  toast(`已复制任务：${created.project}`);
}
async function copyText(value, successMessage) {
  try { await navigator.clipboard.writeText(value); toast(successMessage); }
  catch { window.prompt("复制下面的内容", value); }
}
async function handleHomeTaskAction(action, taskId) {
  const task = state.data.tasks.find((item) => item.id === taskId);
  if (!task) return toast("任务不存在或已被删除");
  if (action === 'rename') return renameTask(taskId);
  try {
    if (action === "copy") return await copyHomeTask(task);
    if (action === "download") {
      if (!task.artifacts?.length) return toast("该任务还没有可下载的成品");
      const link = document.createElement("a"); link.href = `/api/tasks/${task.id}/materials-package`; link.download = ""; document.body.appendChild(link); link.click(); link.remove(); return;
    }
    if (action === "move") {
      const projects = (state.data.projects || []).filter((item) => item.status === "active");
      const choice = window.prompt(`输入要移动到的项目序号：\n${projects.map((item, index) => `${index + 1}. ${item.name}`).join("\n")}`);
      const project = projects[Number(choice) - 1];
      if (!project) return choice === null ? undefined : toast("项目序号无效");
      await api("/api/workbench/project-links", { method: "PUT", body: JSON.stringify({ key: `core:${task.id}`, projectId: project.id }) }); await refresh(); return toast(`任务已移动到“${project.name}”`);
    }
    if (action === "share") {
      const shareData = { title: task.project, text: `${projectName(task.archiveProjectId??task.projectId)} · ${task.status}`, url: homeTaskUrl(task.id) };
      if (navigator.share) { try { await navigator.share(shareData); } catch (error) { if (error.name !== "AbortError") throw error; } }
      else await copyText(shareData.url, "任务链接已复制");
      return;
    }
    if (action === "link") return await copyText(homeTaskUrl(task.id), "任务链接已复制");
    if (action === "trash") return await removeTask(task.id);
  } catch (error) { toast(error.message); }
}
function homeTaskRow(task) { const mode = ({adapt:"延展一套尺寸","copy-replace":"已有图片换文案",master:"制作新Banner"})[task.mode] || task.mode; return `<tr><td><button class="task-link" data-task="${task.id}">${esc(task.project)}</button></td><td>${mode}</td><td>${esc(projectName(task.archiveProjectId??task.projectId))}</td><td><span class="status" data-status="${task.status}">${task.status}</span></td><td>${relativeDate(task.updatedAt || task.createdAt)}</td><td><button class="table-action" data-task="${task.id}">查看</button></td></tr>`; }

function homeProjectCardV2(project, index) {
  return `<article class="home-work-card home-project-card" data-home-search-card>
    <button class="home-project-open" data-project-open="${project.id}">
      <span class="home-card-cover">${homeCover(project.thumb, project.name, index)}</span>
      <b>${esc(project.name)}</b><small>更新于 ${relativeDate(project.updatedAt)}</small>
    </button>
    <div class="home-project-tasks"><span>项目任务（${project.tasks.length}）</span>
      ${project.tasks.slice(0, 3).map((task) => `<button data-task="${task.id}" title="${esc(task.project)}"><b>${esc(task.project)}</b><em data-status="${task.status}">${task.status}</em></button>`).join("") || `<small>暂无任务</small>`}
    </div>
  </article>`;
}

function homeTaskRowV2(task) {
  return `<tr data-home-search-card><td><button class="task-link" data-task="${task.id}">${esc(task.project)}</button></td><td>${modeLabel(task.mode)}</td><td>${esc(projectName(task.archiveProjectId??task.projectId))}</td><td><span class="status" data-status="${task.status}">${task.status}</span></td><td>${relativeDate(task.updatedAt || task.createdAt)}</td><td><div class="home-task-actions"><button class="table-action" data-task="${task.id}">查看</button><button class="table-action" data-task-rename="${task.id}">重命名</button><button class="table-action danger-text" data-task-remove="${task.id}">删除</button></div></td></tr>`;
}

async function renameTask(taskId) {
  const task = state.data.tasks.find((item) => item.id === taskId);
  if (!task) return;
  try {
    const saved=await openTaskRename(task,name=>api(`/api/tasks/${taskId}`, { method: "PATCH", body: JSON.stringify({ project: name }) }));
    if(!saved)return;
    management.invalidate();
    await refresh();
    toast("任务名称已修改");
  } catch (error) { toast(error.message); }
}

async function removeTask(taskId) {
  const task = state.data.tasks.find((item) => item.id === taskId);
  if (!task || !window.confirm(`确定删除任务“${task.project}”吗？任务、素材和全部历史版本将保留在回收站，可随时恢复。`)) return;
  try {
    await api(`/api/tasks/${taskId}`, { method: "DELETE" });
    await refresh();
    toast("任务已移至回收站，可在左侧回收站恢复");
  } catch (error) { toast(error.message); }
}

homeProjectCard = homeProjectCardV2;
homeTaskRow = homeTaskRowV2;

function metric(label, value, unit, icon) {
  return `<article class="metric-card"><span class="metric-icon">${icon}</span><p>${label}</p><b>${value}</b><small>${unit}</small></article>`;
}

function taskRow(task) {
  const modeName = ({ adapt: "已有成品适配", "copy-replace": "已有图片换文案", master: "主图完成后延展" })[task.mode] || task.mode;
  return `<tr><td><button class="task-link" data-task="${task.id}">${esc(task.project)}</button><span class="subtext">${modeName} · v${task.version}</span></td><td>${esc(task.requester)}</td><td>${task.targetTemplateIds.length} 个尺寸</td><td>${task.dueDate || "—"}</td><td><span class="status" data-status="${task.status}">${task.status}</span></td><td>${esc(task.assignee || "待认领")}</td></tr>`;
}

function lineName(id) { return state.data.businessLines.find((item) => item.id === id)?.name || "未归类"; }
function segmentName(lineId, segmentId) { return state.data.businessLines.find((item) => item.id === lineId)?.segments?.find((item) => item.id === segmentId)?.name || "未归类"; }
function projectName(id) { return state.data.projects.find((item) => item.id === id)?.name || "未归档任务"; }
function taskThumb(task) {
  const finished = task.artifacts?.find((item) => item.templateId === task.masterTemplateId) || task.artifacts?.[0];
  return task.coverPreview?.url || finished?.url || task.assets?.find((asset) => asset.role?.includes("master") || asset.role?.includes("background"))?.url || "";
}
function modeLabel(mode) { return ({adapt:"延展一套尺寸","copy-replace":"已有图片换文案",master:"制作新 Banner"})[mode] || mode; }

function renderTasksLegacy() {
  title.textContent = "生产任务";
  const all = state.data.tasks || [];
  const filtered = state.filter === "全部" ? all : all.filter((task) => task.status === state.filter);
  const selected = all.find((task) => task.id === state.reviewTaskId) || filtered[0] || all[0];
  state.reviewTaskId = selected?.id || null;
  content.innerHTML = `<div class="task-page-layout"><section class="task-list-area"><div class="task-toolbar"><label class="global-search compact">⌕<input placeholder="搜索任务名称 / 项目名称" /></label><div class="filters">${["全部","草稿","主图制作","批量生成","成套审核","已完成","生成失败"].map((item) => `<button class="filter ${state.filter === item ? "active" : ""}" data-task-filter="${item}">${item}</button>`).join("")}</div></div>
    <section class="panel task-table-panel">${filtered.length ? `<table><thead><tr><th>任务名称</th><th>所属项目</th><th>任务类型</th><th>业务方向</th><th>目标资源位</th><th>负责人</th><th>截止时间</th><th>状态</th></tr></thead><tbody>${filtered.map((task) => `<tr class="selectable-row ${task.id === selected?.id ? "selected" : ""}" data-select-task="${task.id}"><td><div class="task-name-cell">${taskThumb(task) ? `<img src="${taskThumb(task)}" />` : `<i>${esc(task.project.slice(0,1))}</i>`}<span><b>${esc(task.project)}</b><small>${task.id.slice(0,8)}</small></span></div></td><td>${esc(projectName(task.archiveProjectId??task.projectId))}</td><td><span class="tag">${modeLabel(task.mode)}</span></td><td>${esc(lineName(task.businessLineId))}</td><td>${task.targetTemplateIds.length} 个</td><td>${esc(task.assignee || "待认领")}</td><td>${task.dueDate || "—"}</td><td><span class="status" data-status="${task.status}">${task.status}</span></td></tr>`).join("")}</tbody></table>` : `<div class="empty"><b>没有符合条件的任务</b>请切换筛选条件或创建新任务。</div>`}</section></section>${selected ? taskSummaryPanel(selected) : ""}</div>`;
  content.querySelectorAll("[data-task-filter]").forEach((button) => button.addEventListener("click", () => { state.filter = button.dataset.taskFilter; renderTasks(); }));
  content.querySelectorAll("[data-select-task]").forEach((row) => row.addEventListener("click", () => { state.reviewTaskId = row.dataset.selectTask; renderTasks(); }));
  content.querySelector("[data-continue-task]")?.addEventListener("click", () => openTask(selected.id));
  const taskSearch = content.querySelector(".global-search input");
  if (taskSearch) taskSearch.addEventListener("input", (event) => {
    const keyword = event.target.value.trim().toLowerCase();
    content.querySelectorAll("table tbody tr").forEach((row) => { row.style.display = row.textContent.toLowerCase().includes(keyword) ? "" : "none"; });
  });
}

function taskSummaryPanel(task) {
  const hasRole = (roles) => task.assets?.some((asset) => roles.includes(asset.role));
  const project = state.data.projects.find((item) => item.id === task.projectId);
  const checklist = [["干净KV",hasRole(["clean-kv","master","master-landscape","master-portrait","background-landscape","background-portrait"])],["主标美术字PNG",hasRole(["title"])],["副标美术字PNG",hasRole(["subtitle"])],["Logo PNG",hasRole(["logo"])],["IP版权",project?.isIpProject ? hasRole(["copyright","ip-copyright"]) : null]];
  return `<aside class="task-summary"><div class="summary-head"><div><h2>${esc(task.project)}</h2><small>${task.id.slice(0,13)}</small></div><span class="status" data-status="${task.status}">${task.status}</span></div><h3>任务概览</h3><div class="info-list"><div class="info-row"><span>项目</span><b>${esc(projectName(task.archiveProjectId??task.projectId))}</b></div><div class="info-row"><span>任务类型</span><b>${modeLabel(task.mode)}</b></div><div class="info-row"><span>业务方向</span><b>${esc(lineName(task.businessLineId))}</b></div><div class="info-row"><span>目标资源位</span><b>${task.targetTemplateIds.length} 个</b></div><div class="info-row"><span>截止时间</span><b>${task.dueDate || "未设置"}</b></div></div><h3>输入清单</h3><div class="input-checklist">${checklist.map(([name,ok]) => `<div><span>${name}</span><b class="${ok === false ? "missing" : ""}">${ok === null ? "不适用" : ok ? "已上传" : "待上传"}</b></div>`).join("")}</div><h3>流程进度</h3><div class="mini-timeline">${["创建任务","接单","拆分确认","批量生成","成套审核","完成"].map((name,index) => `<div class="${index === 0 ? "active" : ""}"><i></i><span>${name}</span></div>`).join("")}</div><button class="button primary summary-action" data-continue-task>继续处理</button></aside>`;
}

function collectAssets() {
  const taskAssets = state.data.tasks.flatMap((task) => (task.assets || []).map((asset) => ({...asset, taskId:task.id, projectId:task.projectId, source:"人工上传"})));
  const derivedAssets = state.data.tasks.flatMap((task) => (task.localAi?.outputs || []).map((asset) => ({...asset, name:asset.name || asset.label || "自动拆分结果", role:"derived", mime:asset.mime || "image/png", bytes:asset.bytes || 0, taskId:task.id, projectId:task.projectId, source:"平台自动拆分"})));
  const projectAssets = (state.data.projects || []).flatMap((project) => (project.assets || []).map((asset) => ({...asset, projectId:project.id, source:"人工上传"})));
  return [...projectAssets, ...taskAssets, ...derivedAssets];
}

function assetCategory(asset) { if (asset.role === "derived") return "拆分结果"; if (["clean-kv","master","master-landscape","master-portrait","background-landscape","background-portrait"].includes(asset.role)) return "原始KV"; if (asset.role === "title") return "主标美术字"; if (asset.role === "subtitle") return "副标美术字"; if (asset.role === "logo") return "Logo"; if (["copyright","ip-copyright"].includes(asset.role)) return "IP版权"; if (asset.role === "button") return "按钮素材"; return "补充素材"; }

function renderAssetsLegacy() {
  title.textContent = "资产库";
  const assets = collectAssets(); const categories = ["全部素材","原始KV","主标美术字","副标美术字","Logo","IP版权","按钮素材","补充素材","拆分结果"];
  const visible = state.assetFilter === "全部素材" ? assets : assets.filter((asset) => assetCategory(asset) === state.assetFilter);
  content.innerHTML = `<div class="asset-toolbar"><label class="global-search compact">⌕<input placeholder="搜索素材名称、标签、描述" /></label><div class="filters">${categories.map((item) => `<button class="filter ${state.assetFilter === item ? "active" : ""}" data-asset-filter="${item}">${item}</button>`).join("")}</div></div><div class="asset-page-layout"><aside class="asset-tree"><h3>全部分类</h3><b>人工上传的源素材</b>${["原始KV","主标美术字","副标美术字","Logo","IP版权","按钮素材","补充素材"].map((name) => `<button data-asset-filter="${name}">${name}<span>${assets.filter((a) => assetCategory(a) === name).length}</span></button>`).join("")}<b>系统派生素材</b>${["重构背景","核心人物","次要人物","装饰元素"].map((name) => `<button disabled>${name}<span>0</span></button>`).join("")}</aside><section class="asset-main"><div class="section-title"><h2>${state.assetFilter}</h2><span>${visible.length} 项素材</span></div><div class="asset-card-grid">${visible.map((asset) => `<article class="library-asset"><div class="asset-preview">${asset.mime?.startsWith("image/") ? `<img src="${asset.url}" />` : `<i>FILE</i>`}<span>${esc(asset.source)}</span></div><b>${esc(asset.name)}</b><small>${assetCategory(asset)} · ${formatBytes(asset.bytes)}</small><small>${esc(projectName(asset.projectId))}</small></article>`).join("") || `<div class="empty"><b>暂无${state.assetFilter}</b>系统拆分结果会在设计师确认后出现在这里。</div>`}</div></section></div>`;
  content.querySelectorAll("[data-asset-filter]").forEach((button) => button.addEventListener("click", () => { state.assetFilter = button.dataset.assetFilter; renderAssets(); }));
  const assetSearch = content.querySelector(".global-search input");
  if (assetSearch) assetSearch.addEventListener("input", (event) => {
    const keyword = event.target.value.trim().toLowerCase();
    content.querySelectorAll(".library-asset").forEach((card) => { card.style.display = card.textContent.toLowerCase().includes(keyword) ? "" : "none"; });
  });
}

function renderAssetsPrevious() {
  title.textContent = "资产库";
  const assets = collectAssets();
  const categories = ["全部素材", "原始KV", "主标美术字", "副标美术字", "Logo", "IP版权", "按钮素材", "补充素材", "拆分结果"];
  const categoryAssets = state.assetFilter === "全部素材" ? assets : assets.filter((asset) => assetCategory(asset) === state.assetFilter);
  const projectIds = new Set((state.data.projects || []).map((project) => project.id));
  const projectCount = (projectId) => categoryAssets.filter((asset) => (asset.projectId || "unfiled") === projectId).length;
  const selectedAssets = state.assetProjectFilter === "all" ? categoryAssets : categoryAssets.filter((asset) => (asset.projectId || "unfiled") === state.assetProjectFilter);
  const groups = [];
  for (const project of state.data.projects || []) {
    const items = selectedAssets.filter((asset) => asset.projectId === project.id);
    if (items.length) groups.push({ id: project.id, name: project.name, items });
  }
  const unfiled = selectedAssets.filter((asset) => !asset.projectId || !projectIds.has(asset.projectId));
  if (unfiled.length) groups.push({ id: "unfiled", name: "未归档素材", items: unfiled });
  const assetCard = (asset) => `<article class="library-asset" data-asset-search-card><div class="asset-preview">${asset.mime?.startsWith("image/") ? `<img src="${asset.url}" alt="${esc(asset.name)}" loading="lazy" />` : `<i>FILE</i>`}</div><b title="${esc(asset.name)}">${esc(asset.name)}</b><small>▧ ${assetCategory(asset)} · ${formatBytes(asset.bytes)}</small><small>${esc(asset.source)}${asset.projectId ? ` · ${esc(projectName(asset.projectId))}` : ""}</small></article>`;
  content.innerHTML = `<div class="asset-toolbar"><label class="global-search compact">⌕<input placeholder="搜索素材名称、标签、描述" /></label><div class="filters">${categories.map((item) => `<button class="filter ${state.assetFilter === item ? "active" : ""}" data-asset-filter="${item}">${item}</button>`).join("")}</div></div>
    <div class="asset-page-layout"><aside class="asset-tree"><h3>按项目归类</h3><button class="${state.assetProjectFilter === "all" ? "active" : ""}" data-asset-project="all">全部项目<span>${categoryAssets.length}</span></button>${(state.data.projects || []).map((project) => `<button class="${state.assetProjectFilter === project.id ? "active" : ""}" data-asset-project="${project.id}">${esc(project.name)}<span>${projectCount(project.id)}</span></button>`).join("")}<button class="${state.assetProjectFilter === "unfiled" ? "active" : ""}" data-asset-project="unfiled">未归档素材<span>${projectCount("unfiled")}</span></button><h3 class="asset-tree-subtitle">素材类型</h3>${categories.slice(1).map((name) => `<button data-asset-filter="${name}">${name}<span>${assets.filter((asset) => assetCategory(asset) === name).length}</span></button>`).join("")}</aside>
      <section class="asset-main"><div class="section-title"><h2>${state.assetProjectFilter === "all" ? "全部项目素材" : state.assetProjectFilter === "unfiled" ? "未归档素材" : esc(projectName(state.assetProjectFilter))}</h2><span>${selectedAssets.length} 项素材</span></div><div class="asset-project-groups">${groups.map((group) => `<section class="asset-project-group" data-asset-project-group><div class="asset-project-heading"><div><h3>${esc(group.name)}</h3><small>${group.items.length} 项素材</small></div><button data-open-project-assets="${group.id}" ${group.id === "unfiled" ? "disabled" : ""}>查看项目</button></div><div class="asset-card-grid">${group.items.map(assetCard).join("")}</div></section>`).join("") || `<div class="empty"><b>当前分类没有素材</b>可切换项目或素材类型查看。</div>`}</div></section></div>`;
  content.querySelectorAll("[data-asset-filter]").forEach((button) => button.addEventListener("click", () => { state.assetFilter = button.dataset.assetFilter; renderAssets(); }));
  content.querySelectorAll("[data-asset-project]").forEach((button) => button.addEventListener("click", () => { state.assetProjectFilter = button.dataset.assetProject; renderAssets(); }));
  content.querySelectorAll("[data-open-project-assets]").forEach((button) => button.addEventListener("click", () => { state.view = "projects"; render(); }));
  const assetSearch = content.querySelector(".global-search input");
  if (assetSearch) assetSearch.addEventListener("input", (event) => {
    const keyword = event.target.value.trim().toLowerCase();
    content.querySelectorAll("[data-asset-search-card]").forEach((card) => { card.style.display = card.textContent.toLowerCase().includes(keyword) ? "" : "none"; });
    content.querySelectorAll("[data-asset-project-group]").forEach((group) => { group.style.display = [...group.querySelectorAll("[data-asset-search-card]")].some((card) => card.style.display !== "none") ? "" : "none"; });
  });
}

function renderReview() {
  title.textContent = "审核与交付";
  const topbarEyebrow = document.querySelector(".topbar-title .eyebrow");
  if (topbarEyebrow) topbarEyebrow.textContent = "集中处理生产任务的成套审核与资源交付";
  const delivered = (task) => task.history?.some((item) => item.action === "下载成套ZIP");
  const groups = {
    "待审核": state.data.tasks.filter((task) => task.status === "成套审核" || Object.values(task.resourceReviews || {}).some((item) => item.status === "submitted")),
    "已退回": state.data.tasks.filter((task) => task.status === "批量生成" && task.history?.some((item) => /审核.*退回|退回.*审核/.test(item.action))),
    "已通过": state.data.tasks.filter((task) => task.status === "已完成" && !delivered(task)),
    "已下载": state.data.tasks.filter((task) => task.status === "已完成" && delivered(task)),
  };
  const tasks = groups[state.reviewTab] || [];
  const selected = tasks.find((task) => task.id === state.reviewTaskId) || tasks[0];
  state.reviewTaskId = selected?.id || null;
  const partialReviewIds = Object.entries(selected?.resourceReviews || {}).filter(([, item]) => item.status === "submitted").map(([id]) => id);
  const isPartialReview = partialReviewIds.length > 0;
  const artifacts = (selected?.artifacts || []).filter((artifact) => !isPartialReview || partialReviewIds.includes(artifact.templateId));
  const passedCount = artifacts.filter((artifact) => artifact.qc?.passed === true).length;
  const confirmCount = artifacts.length - passedCount;
  const sourceAsset = selected?.assets?.find((asset) => asset.role?.includes("master") || asset.role?.includes("background")) || selected?.assets?.[0];
  const taskMeta = selected ? `${selected.id.slice(0, 13).toUpperCase()}　 所属项目：${esc(projectName(selected.projectId))}　 提交人：${esc(selected.requester || "设计师")}　 提交时间：${new Date(selected.updatedAt || selected.createdAt).toLocaleString("zh-CN", { hour12: false })}` : "";
  content.innerHTML = `<section class="review-page">
    <nav class="review-tabs">${Object.keys(groups).map((name) => `<button class="${state.reviewTab === name ? "active" : ""}" data-review-tab="${name}">${name}<span>${groups[name].length}</span></button>`).join("")}</nav>
    ${selected ? `<div class="review-batch-summary">本套共 <b>${artifacts.length || selected.targetTemplateIds.length}</b> 个资源位，<strong>${passedCount} 个通过</strong>，<em>${confirmCount} 个需要确认</em></div>
    <section class="review-suite-card">
      <header class="review-suite-head"><div><div class="review-suite-title"><h2>${esc(selected.project)}</h2>${tasks.length > 1 ? `<select aria-label="切换审核任务">${tasks.map((task) => `<option value="${task.id}" ${task.id === selected.id ? "selected" : ""}>${esc(task.project)}</option>`).join("")}</select>` : ""}</div><p>任务 ID：${taskMeta}</p></div><button class="button ghost review-source-button" data-review-source ${sourceAsset?.url ? "" : "disabled"}>查看源文件</button></header>
      <div class="review-grid review-artifact-grid">${artifacts.length ? artifacts.map((artifact, index) => reviewArtifactCard(artifact, selected, index)).join("") : selected.targetTemplateIds.map((id, index) => { const template = state.data.templates.find((item) => item.id === id); return `<article class="review-card placeholder"><div>${template?.width || 0}×${template?.height || 0}</div><b>${String(index + 1).padStart(2, "0")} · ${esc(template?.name || id)}</b><small>尚未生成最终成品</small><span class="review-status pending">● 等待生成</span></article>`; }).join("")}</div>
      <footer class="review-suite-footer">
        <div class="review-footer-main">${state.reviewTab === "待审核" ? `<details class="review-check-panel" open><summary>审核检查项</summary><div class="qc-list">${reviewQcChecklist(selected, partialReviewIds)}</div></details><label class="review-comment-label"><span>审核意见</span><textarea id="review-comment" placeholder="填写审核意见；退回修改时必填"></textarea></label>` : `<p class="review-history-note">${esc(selected.history?.at(-1)?.note || (state.reviewTab === "已退回" ? "任务已退回修改" : "任务已完成审核"))}</p>`}</div>
        <div class="review-actions">${isElementEffectOutputStale(selected) ? `<button class="button primary" data-review-edit>返回任务重新生成</button>` : state.reviewTab === "待审核" ? `<button class="button review-reject-button" id="review-reject">退回修改</button><button class="button primary" id="review-pass" disabled>${isPartialReview ? "通过当前资源" : "通过并交付"}</button>` : state.reviewTab === "已退回" ? `<button class="button primary" data-review-edit>进入任务修改</button>` : `<a class="button primary" href="/api/tasks/${selected.id}/package">下载成套ZIP</a>`}</div>
      </footer>
    </section>` : `<div class="empty review-empty"><b>暂无${state.reviewTab}任务</b>任务状态变化后会自动进入对应栏目。</div>`}
  </section>`;
  content.querySelectorAll("[data-review-tab]").forEach((button) => button.addEventListener("click", () => { state.reviewTab = button.dataset.reviewTab; state.reviewTaskId = null; renderReview(); }));
  content.querySelector(".review-suite-title select")?.addEventListener("change", (event) => { state.reviewTaskId = event.target.value; renderReview(); });
  content.querySelector("[data-review-source]")?.addEventListener("click", () => { if (sourceAsset?.url) window.open(sourceAsset.url, "_blank", "noopener"); });
  content.querySelectorAll("[data-review-preview]").forEach((button) => button.addEventListener("click", () => window.open(decodeURIComponent(button.dataset.reviewPreview), "_blank", "noopener")));
  content.querySelector("[data-review-edit]")?.addEventListener("click", () => openTask(selected.id));
  content.querySelectorAll("[data-review-submit]").forEach((button) => button.addEventListener("click", async () => {
    const comment = document.querySelector("#review-comment")?.value.trim() || "";
    try {
      await api(`/api/tasks/${selected.id}/resource-reviews/${button.dataset.reviewSubmit}`, { method: "PUT", body: JSON.stringify({ status: "submitted", by: "设计师", note: comment }) });
      state.reviewTaskId = null; await refresh(); toast("已提交单资源位审核，可在本页单独通过或退回");
    } catch (error) { toast(error.message); }
  }));
  content.querySelector("#review-reject")?.addEventListener("click", () => reviewTransition(selected, "批量生成", "审核退回修改", true, partialReviewIds));
  content.querySelector("#review-pass")?.addEventListener("click", () => reviewTransition(selected, "已完成", "成套审核通过", false, partialReviewIds, !isPartialReview));
  content.querySelectorAll("[data-manual-qc]").forEach((input) => input.addEventListener("change", updateReviewPassState));
  updateReviewPassState();
}
function reviewQcChecklist(task, resourceIds = []) {
  const project = state.data.projects.find((item) => item.id === task.projectId);
  const manual = ["核心人物与动作完整","文案未遮挡主体且可读","Logo位置与安全距离正确","页面UI遮挡验证通过"];
  if (project?.isIpProject) manual.push("IP版权标识正确");
  const relevantArtifacts = resourceIds.length ? (task.artifacts || []).filter((item) => resourceIds.includes(item.templateId)) : (task.artifacts || []);
  const technicalPassed = !isElementEffectOutputStale(task) && (resourceIds.length ? relevantArtifacts.length === resourceIds.length && relevantArtifacts.every((item) => item.qc?.passed) : task.qc?.passed === true && relevantArtifacts.length > 0 && relevantArtifacts.every((item) => item.qc?.passed));
  return `${manual.map((label) => `<label class="qc-row manual"><span>${label}</span><input type="checkbox" data-manual-qc /></label>`).join("")}<div class="qc-row ${technicalPassed ? "pass" : "fail"}"><span>尺寸、格式与文件大小</span><b>${technicalPassed ? "自动通过" : "未通过"}</b></div>`;
}

function updateReviewPassState() {
  const button = document.querySelector("#review-pass");
  if (!button) return;
  const checks = [...document.querySelectorAll("[data-manual-qc]")];
  const technicalPassed = Boolean(document.querySelector(".qc-row.pass"));
  button.disabled = !technicalPassed || checks.some((item) => !item.checked);
}

async function reviewTransition(task, status, action, requireComment, resourceIds = [], deliverAfter = false) {
  const comment = document.querySelector("#review-comment")?.value.trim() || "";
  if (requireComment && !comment) return toast("退回修改前请填写审核意见");
  try {
    if (resourceIds.length) {
      const resourceStatus = status === "已完成" ? "approved" : "rejected";
      await Promise.all(resourceIds.map((templateId) => api(`/api/tasks/${task.id}/resource-reviews/${templateId}`, { method:"PUT", body:JSON.stringify({ status:resourceStatus, by:"设计师", note:comment }) })));
      if (resourceStatus === "rejected") {
        await api(`/api/tasks/${task.id}`, { method:"PATCH", body:JSON.stringify({ status:"批量生成", by:"设计师", action:"单资源位审核退回", note:comment }) });
        state.reviewTab = "已退回";
      }
      state.reviewTaskId = null;
      await refresh();
      toast(resourceStatus === "approved" ? "当前资源位审核已通过" : "当前资源位已退回批量生成阶段");
      return;
    }
    await api(`/api/tasks/${task.id}`, { method:"PATCH", body:JSON.stringify({ status, assignee:"设计师", by:"设计师", action, note:comment }) });
    if (status === "已完成" && deliverAfter) {
      const response = await fetch(`/api/tasks/${task.id}/package`);
      if (!response.ok) { const error = await response.json().catch(() => ({})); throw new Error(error.error || "交付包下载失败"); }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob); const link = document.createElement("a");
      link.href = url; link.download = `${task.project}_成套素材_v${task.version}.zip`; document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      state.reviewTab = "已下载";
    } else if (status === "已完成") state.reviewTab = "已通过";
    else state.reviewTab = "已退回";
    state.reviewTaskId = null;
    await refresh();
    toast(status === "已完成" ? (deliverAfter ? "审核已通过，成套ZIP已开始下载" : "审核已通过") : "已退回批量生成阶段");
  } catch (error) { toast(error.message); }
}
function reviewArtifactCard(artifact, task, index = 0) {
  const review = task?.resourceReviews?.[artifact.templateId];
  const template = state.data.templates.find((item) => item.id === artifact.templateId);
  const canSubmit = task?.status === "成套审核" && artifact.qc?.passed === true && !review;
  const passed = artifact.qc?.passed === true;
  const statusClass = review?.status === "rejected" || !passed ? "warning" : review?.status === "submitted" ? "pending" : "passed";
  const statusText = review?.status === "submitted" ? "等待单项审核" : review?.status === "approved" ? "单项审核通过" : review?.status === "rejected" ? "单项审核退回" : passed ? "质检通过" : "需要确认";
  return `<article class="review-card ${statusClass === "warning" ? "needs-confirmation" : ""}"><button class="review-artifact-preview" data-review-preview="${encodeURIComponent(artifact.url || "")}" ${artifact.url ? "" : "disabled"}>${artifact.url ? `<img src="${artifact.url}" alt="${esc(template?.name || artifact.name)}" />` : ""}</button><b>${String(index + 1).padStart(2, "0")} · ${esc(template?.name || artifact.name)}</b><small>${artifact.width || "—"}×${artifact.height || "—"}.${String(artifact.format || "").toLowerCase()} · ${formatBytes(artifact.bytes || 0)}</small><span class="review-status ${statusClass}">${statusClass === "warning" ? "▲" : "●"} ${statusText}</span>${canSubmit ? `<button class="button secondary small" data-review-submit="${artifact.templateId}">提交单资源位审核</button>` : ""}</article>`;
}

function projectCover(project, tasks) {
  const recentTask = [...tasks].sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0)).find((task) => taskThumb(task));
  const imageAsset = (project.assets || []).find((asset) => String(asset.mime || "").startsWith("image/") && asset.url);
  return recentTask ? taskThumb(recentTask) : imageAsset?.url || "";
}

function projectCard(project) {
  const tasks = state.data.tasks.filter((task) => task.projectId === project.id);
  const cover = projectCover(project, tasks);
  const lastTask = [...tasks].sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0))[0];
  return `<article class="project-showcase-card ${project.status === "archived" ? "is-disabled" : ""}">
    <div class="project-showcase-cover">${cover ? `<img src="${cover}" alt="${esc(project.name)}" />` : `<span>${esc(project.name.slice(0, 1))}</span>`}</div>
    <div class="project-showcase-copy"><div><b>${esc(project.name)}</b><small>更新于 ${relativeDate(project.updatedAt || project.createdAt)}</small></div><strong>${esc(lastTask?.project || `${tasks.length} 个生产任务`)}</strong><div class="project-card-footer"><span class="home-card-status" data-status="${lastTask?.status || (project.status === "active" ? "已完成" : "草稿")}">${lastTask?.status || (project.status === "active" ? "启用" : "已归档")}</span><button data-project-edit="${project.id}">编辑</button><button data-project-toggle="${project.id}">${project.status === "active" ? "归档" : "启用"}</button></div></div>
  </article>`;
}

function renderProjectsLegacy() {
  title.textContent = "项目中心";
  const sourceProjects = state.data.projects || [];
  const ownerNames = [...new Set(state.data.tasks.map((task) => task.assignee).filter(Boolean))];
  const categories = state.data.businessLines.filter((line) => sourceProjects.some((project) => project.businessLineIds?.includes(line.id)));
  const cutoffDays = Number(state.projectDateFilter);
  const projects = sourceProjects.filter((project) => {
    const tasks = state.data.tasks.filter((task) => task.projectId === project.id);
    const keyword = state.projectSearch.toLowerCase();
    const searchHit = !keyword || [project.name, project.code, ...(project.assets || []).map((asset) => asset.name), ...tasks.map((task) => task.project)].join(" ").toLowerCase().includes(keyword);
    const typeHit = state.projectTypeFilter === "all" || (state.projectTypeFilter === "ip" ? project.isIpProject : !project.isIpProject);
    const categoryHit = state.projectCategoryFilter === "all" || project.businessLineIds?.includes(state.projectCategoryFilter);
    const ownerHit = state.projectOwnerFilter === "all" || tasks.some((task) => task.assignee === state.projectOwnerFilter);
    const dateHit = !cutoffDays || Date.now() - new Date(project.updatedAt || project.createdAt || 0).getTime() <= cutoffDays * 86400000;
    return searchHit && typeHit && categoryHit && ownerHit && dateHit;
  }).sort((a, b) => (new Date(a.updatedAt || 0) - new Date(b.updatedAt || 0)) * (state.projectSortAsc ? 1 : -1));
  const uploadedImages = [];
  const seen = new Set();
  for (const project of sourceProjects) for (const asset of project.assets || []) if (String(asset.mime || "").startsWith("image/") && asset.url && !seen.has(asset.url)) { seen.add(asset.url); uploadedImages.push({ ...asset, projectName: project.name }); }
  for (const task of state.data.tasks) for (const asset of task.assets || []) if (String(asset.mime || "").startsWith("image/") && asset.url && !seen.has(asset.url)) { seen.add(asset.url); uploadedImages.push({ ...asset, projectName: projectName(task.archiveProjectId??task.projectId) }); }
  content.innerHTML = `<div class="projects-page">
    <section class="projects-hero"><h2>所有项目</h2><label class="project-search"><span>⌕</span><input id="project-search" value="${esc(state.projectSearch)}" placeholder="搜索设计、文件夹和上传内容" /></label><div class="project-filter-row"><select id="project-type-filter"><option value="all">类型</option><option value="ip" ${state.projectTypeFilter === "ip" ? "selected" : ""}>IP项目</option><option value="standard" ${state.projectTypeFilter === "standard" ? "selected" : ""}>普通项目</option></select><select id="project-category-filter"><option value="all">类别</option>${categories.map((line) => `<option value="${line.id}" ${state.projectCategoryFilter === line.id ? "selected" : ""}>${esc(line.name)}</option>`).join("")}</select><select id="project-owner-filter"><option value="all">所有者</option>${ownerNames.map((name) => `<option value="${esc(name)}" ${state.projectOwnerFilter === name ? "selected" : ""}>${esc(name)}</option>`).join("")}</select><select id="project-date-filter"><option value="all">修改日期</option><option value="7" ${state.projectDateFilter === "7" ? "selected" : ""}>最近7天</option><option value="30" ${state.projectDateFilter === "30" ? "selected" : ""}>最近30天</option><option value="90" ${state.projectDateFilter === "90" ? "selected" : ""}>最近90天</option></select></div></section>
    <div class="project-view-tools"><button data-tooltip="${state.projectSortAsc ? "按最新修改排序" : "按最早修改排序"}" id="project-sort" aria-label="排序方式">⇅</button><button data-tooltip="${state.projectListView ? "以卡片形式查看" : "以列表形式查看"}" id="project-view-toggle" aria-label="切换项目视图">${state.projectListView ? "▦" : "☷"}</button><button data-tooltip="新建项目" id="new-project" aria-label="新建项目">＋</button></div>
    <section class="recent-projects"><h3>最近项目</h3><div class="project-carousel-shell"><button class="project-carousel-arrow previous" id="project-prev" aria-label="查看上一页">‹</button><div class="project-carousel-track ${state.projectListView ? "list-view" : ""}" id="project-carousel">${projects.map(projectCard).join("") || `<div class="empty"><b>没有符合条件的项目</b>请更改搜索或筛选条件。</div>`}</div><button class="project-carousel-arrow next" id="project-next" aria-label="查看更多项目">›</button></div></section>
    <details class="project-images" open><summary>图片 <span>${uploadedImages.length}</span></summary><div class="project-image-list">${uploadedImages.map((asset) => `<a href="${asset.url}" target="_blank" rel="noreferrer" class="project-image-card"><span><img src="${asset.url}" alt="${esc(asset.name)}" /></span><b title="${esc(asset.name)}">${esc(asset.name)}</b><small>${esc(asset.projectName || "未归档项目")} · ${formatBytes(asset.bytes || 0)}</small></a>`).join("") || `<div class="empty"><b>暂无上传图片</b>可在项目卡片的编辑入口中管理项目，并通过下方入口上传素材。</div>`}</div></details>
    ${projects.length ? `<section class="project-management-list">${projects.map((project) => `<label class="project-upload-row"><span>${esc(project.name)}</span><small>${(project.assets || []).length} 项项目素材</small><b>＋ 上传图片<input type="file" accept="image/*" multiple data-project-upload="${project.id}" /></b></label>`).join("")}</section>` : ""}
  </div>`;
  document.querySelector("#new-project")?.addEventListener("click", () => openProjectDialog());
  document.querySelector("#project-sort")?.addEventListener("click", () => { state.projectSortAsc = !state.projectSortAsc; renderProjects(); });
  document.querySelector("#project-view-toggle")?.addEventListener("click", () => { state.projectListView = !state.projectListView; renderProjects(); });
  document.querySelector("#project-prev")?.addEventListener("click", () => document.querySelector("#project-carousel")?.scrollBy({ left: -Math.max(360, innerWidth * .66), behavior: "smooth" }));
  document.querySelector("#project-next")?.addEventListener("click", () => document.querySelector("#project-carousel")?.scrollBy({ left: Math.max(360, innerWidth * .66), behavior: "smooth" }));
  document.querySelector("#project-search")?.addEventListener("input", (event) => { state.projectSearch = event.target.value; clearTimeout(renderProjects.searchTimer); renderProjects.searchTimer = setTimeout(renderProjects, 120); });
  for (const [id, key] of [["project-type-filter", "projectTypeFilter"], ["project-category-filter", "projectCategoryFilter"], ["project-owner-filter", "projectOwnerFilter"], ["project-date-filter", "projectDateFilter"]]) document.querySelector(`#${id}`)?.addEventListener("change", (event) => { state[key] = event.target.value; renderProjects(); });
  document.querySelectorAll("[data-project-edit]").forEach((button) => button.addEventListener("click", () => openProjectDialog(button.dataset.projectEdit)));
  document.querySelectorAll("[data-project-toggle]").forEach((button) => button.addEventListener("click", async () => {
    const project = projects.find((item) => item.id === button.dataset.projectToggle);
    await api(`/api/projects/${project.id}`, { method: "PATCH", body: JSON.stringify({ status: project.status === "active" ? "archived" : "active" }) });
    await refresh();
  }));
  document.querySelectorAll("[data-project-upload]").forEach((input) => input.addEventListener("change", async () => {
    const files = []; for (const file of input.files) files.push({ name: file.name, dataUrl: await fileToDataUrl(file) });
    if (!files.length) return;
    await api(`/api/projects/${input.dataset.projectUpload}/assets`, { method: "POST", body: JSON.stringify({ role: "supplement", files }) });
    await refresh(); toast(`已保存 ${files.length} 个项目素材`);
  }));
}

function openProjectDialog(projectId = "") {
  const form = document.querySelector("#project-form"); form.reset();
  const project = state.data.projects.find((item) => item.id === projectId);
  document.querySelector("#project-brand-select").innerHTML = `<option value="">不绑定品牌包</option>${state.data.brands.map((brand) => `<option value="${brand.id}">${esc(brand.name)}</option>`).join("")}`;
  document.querySelector("#project-business-lines").innerHTML = state.data.businessLines.filter((line) => line.enabled).map((line) => `<label class="inline-check"><input type="checkbox" name="businessLineIds" value="${line.id}" ${!project || project.businessLineIds?.includes(line.id) ? "checked" : ""} />${esc(line.name)}</label>`).join("");
  form.elements.projectId.value = project?.id || ""; form.elements.name.value = project?.name || ""; form.elements.code.value = project?.code || ""; form.elements.brandId.value = project?.brandId || ""; form.elements.isIpProject.checked = Boolean(project?.isIpProject); form.elements.copyrightNotice.value = project?.copyrightNotice || "";
  void fillProjectGames(project);
  document.querySelector("#project-dialog-title").textContent = project ? "编辑项目" : "创建独立项目";
  document.querySelector("#project-submit").textContent = project ? "保存修改" : "创建项目";
  projectDialog.showModal();
}

// 归属游戏从画布的游戏清单里选（用你自己的微光登录读取）；读不到时保留项目原来的选择，不会被清空。
async function fillProjectGames(project) {
  const select = document.querySelector("#project-game-select");
  const current = project?.gameTagId ? String(project.gameTagId) : "";
  const keep = current ? `<option value="${current}" selected>${esc(project.gameTagName || `游戏 ${current}`)}</option>` : "";
  select.innerHTML = keep || '<option value="">正在读取画布的游戏清单…</option>';
  try {
    const { items } = await api("/api/platform/game-tags");
    select.innerHTML = '<option value="">还没选（生成前要先选）</option>' + items.map((item) => `<option value="${item.id}" ${String(item.id) === current ? "selected" : ""}>${esc(item.name)}</option>`).join("");
    if (current && !items.some((item) => String(item.id) === current)) select.insertAdjacentHTML("beforeend", keep);
  } catch (error) {
    select.innerHTML = keep + `<option value="" ${current ? "" : "selected"} disabled>读不到游戏清单：${esc(error.message)}</option>`;
  }
}

function elementRuleSummary(profile) {
  const labels = { title: "标题", logo: "Logo", ipCopyright: "IP版权", secondaryCopy: "辅助文案", button: "按钮" };
  const states = { required: "必需", optional: "可选", forbidden: "禁止", unspecified: "待定义" };
  return Object.entries(labels).map(([key, label]) => `<span class="tag rule-${profile.elements[key] || "unspecified"}">${label}：${states[profile.elements[key] || "unspecified"]}</span>`).join("");
}

function renderBusinessLinesLegacy() {
  title.textContent = "规范中心";
  const lines = state.data.businessLines || [];
  content.innerHTML = `<div class="panel-head page-section-head"><div><h2>规范体系</h2><p>按业务线、渠道和资源位管理尺寸、内容要求、画面区域与导出规则。</p></div><button class="button primary" id="new-business-line">＋ 新增业务线</button></div>
    <div class="structure-note"><b>当前结构</b><span>平台社区 → 平台资源位 / 论坛社区 / 公众号与外媒</span><span>渠道发行 → 华为 / OPPO / VIVO / 小米 / 荣耀</span><span>投放 → MuMu模拟器 / 雷电模拟器 / 信息流</span></div>
    <div class="business-stack">${lines.map((line) => `<section class="panel business-line ${line.enabled ? "" : "is-disabled"}">
      <div class="panel-head"><div><h2>${esc(line.name)}</h2><p>${line.segments.length} 个细分渠道 / 类型 · ${state.data.templates.filter((item) => item.businessLineId === line.id).length} 个资源位</p></div><div class="category-actions"><button class="button ghost" data-line-rename="${line.id}">改名</button><button class="button ghost" data-line-move="${line.id}" data-delta="-10">上移</button><button class="button ghost" data-line-move="${line.id}" data-delta="10">下移</button><button class="button ${line.enabled ? "danger" : "secondary"}" data-line-toggle="${line.id}">${line.enabled ? "停用" : "启用"}</button></div></div>
      <div class="segment-list">${line.segments.map((segment) => {
        const templates = state.data.templates.filter((item) => item.businessLineId === line.id && item.segmentId === segment.id);
        return `<article class="segment-card ${segment.enabled ? "" : "is-disabled"}"><div class="segment-head"><div><h3>${esc(segment.name)}</h3><span>${templates.length} 个资源位</span></div><div><button data-segment-rename="${line.id}:${segment.id}">改名</button><button data-segment-move="${line.id}:${segment.id}" data-delta="-10">↑</button><button data-segment-move="${line.id}:${segment.id}" data-delta="10">↓</button><button data-segment-toggle="${line.id}:${segment.id}">${segment.enabled ? "停用" : "启用"}</button></div></div>
          <div class="resource-rule-list">${templates.map((template) => { const profile = state.data.resourceProfiles.find((item) => item.templateId === template.id); return `<div class="resource-rule-row"><div><b>${esc(template.name)}</b><span>${template.width}×${template.height} · ${template.format || "格式待补"} · ${template.maxBytes ? `≤${Math.round(template.maxBytes / 1024)}KB` : "大小待补"}</span><div class="tags">${elementRuleSummary(profile)}</div></div><button class="button secondary" data-rule-edit="${template.id}">编辑规则</button></div>`; }).join("") || `<p class="subtext empty-segment">尚未录入资源位，可先保留这个渠道分类。</p>`}</div>
        </article>`;
      }).join("")}</div><button class="button secondary add-segment" data-segment-add="${line.id}">＋ 新增细分渠道 / 类型</button>
    </section>`).join("")}</div>`;
  document.querySelector("#new-business-line").addEventListener("click", addBusinessLine);
  document.querySelectorAll("[data-line-rename]").forEach((button) => button.addEventListener("click", () => renameBusinessLine(button.dataset.lineRename)));
  document.querySelectorAll("[data-line-toggle]").forEach((button) => button.addEventListener("click", () => patchBusinessLine(button.dataset.lineToggle, { enabled: button.textContent === "启用" })));
  document.querySelectorAll("[data-line-move]").forEach((button) => button.addEventListener("click", () => moveBusinessLine(button.dataset.lineMove, Number(button.dataset.delta))));
  document.querySelectorAll("[data-segment-add]").forEach((button) => button.addEventListener("click", () => addSegment(button.dataset.segmentAdd)));
  document.querySelectorAll("[data-segment-rename]").forEach((button) => button.addEventListener("click", () => renameSegment(...button.dataset.segmentRename.split(":"))));
  document.querySelectorAll("[data-segment-toggle]").forEach((button) => button.addEventListener("click", () => patchSegment(...button.dataset.segmentToggle.split(":"), { enabled: button.textContent === "启用" })));
  document.querySelectorAll("[data-segment-move]").forEach((button) => button.addEventListener("click", () => moveSegment(...button.dataset.segmentMove.split(":"), Number(button.dataset.delta))));
  document.querySelectorAll("[data-rule-edit]").forEach((button) => button.addEventListener("click", () => openRuleDialog(button.dataset.ruleEdit)));
}

function specificationImage(template) {
  const specification = state.data.specifications?.find((item) => item.templateId === template.id && item.assets?.length);
  return specification?.assets?.[0]?.url || "";
}

function specElementRows(profile, template) {
  const labels = { title: "标题", logo: "Logo", secondaryCopy: "副标题/补充文案", ipCopyright: "IP版权", button: "按钮" };
  const states = { required: "必须", optional: "可选", forbidden: "禁止", unspecified: "待定义" };
  return Object.entries(labels).map(([key, label]) => {
    if (template.communityPlacement && key === "logo") return `<div><span>游戏品牌 Logo</span><b class="spec-requirement-${template.brandLogo ? "required" : "forbidden"}">${template.brandLogo ? "必须" : "禁止"}</b></div>`;
    if (template.communityPlacement && key === "ipCopyright") return `<div><span>IP 版权</span><b class="spec-requirement-${template.ipCopyright ? "required" : "forbidden"}">${template.ipCopyright ? "IP 项目必须" : "禁止"}</b></div>`;
    const rule = profile.elements[key] || "unspecified";
    return `<div><span>${label}</span><b class="spec-requirement-${rule}">${states[rule]}</b></div>`;
  }).join("");
}

function specProductionReady(template) {
  return template.automationReady !== false && state.data.resourceRules?.find(rule => rule.templateId === template.id)?.deliveryAllowed === true;
}

function editSpecRegions(templateId) {
  const template = state.data.templates.find(item => item.id === templateId);
  openRegionEditor({ template, rule:state.data.psdLayoutRules.templates.find(item => item.templateId === templateId), imageUrl:specificationImage(template),
    save:async draft => { await api('/api/templates/' + templateId + '/regions', {method:'PUT',body:JSON.stringify(draft)}); await refresh(); toast('区域已保存，请重新核实并发布规则'); }
  });
}

function specRegionPreview(template) {
  const layoutRule = state.data.psdLayoutRules?.templates?.find((item) => item.templateId === template.id);
  const variant = layoutRule?.variants?.[0];
  const regions = [...(layoutRule?.globalRegions || []), ...(variant?.regions || [])].filter((region) => region.bounds);
  const sourceImage = !regions.length ? specificationImage(template) : "";
  const colors = { core: "#ff5a62", copy: "#ff5a62", occlusion: "#3989f7", "page-occlusion": "#3989f7", "extend-left": "#50a34a", "extend-right": "#50a34a", "extend-top": "#50a34a", "extend-bottom": "#50a34a", fixed: "#8564ef", logo: "#e38b2c", ip: "#6d59e5", button: "#e38b2c", "body-boundary": "#00a8b5", "character-breakout": "#f0448a" };
  return `<div class="spec-canvas-preview" style="aspect-ratio:${template.width}/${template.height}">${sourceImage ? `<img class="spec-canvas-source-image" src="${esc(sourceImage)}" alt="${esc(template.name)}的原始规范图示">` : `<div class="spec-preview-placeholder">${template.width} × ${template.height}</div>`}${regions.map((region) => { const b = region.bounds; const color = colors[region.type] || "#6d59e5"; return `<div class="spec-region-overlay" data-shape="${region.shape || "rect"}" style="left:${b.x / template.width * 100}%;top:${b.y / template.height * 100}%;width:${b.width / template.width * 100}%;height:${b.height / template.height * 100}%;--region-color:${color}"><span>${esc(region.name || region.type)}</span></div>`; }).join("")}</div><div class="spec-region-legend">${regions.map((region) => `<span><i style="background:${colors[region.type] || "#6d59e5"}"></i>${esc(region.name || region.type)}（${Math.round(region.bounds.width)}×${Math.round(region.bounds.height)}）</span>`).join("") || `<span>${sourceImage ? "已附原始规范图示；" : ""}画面区域坐标待人工核实，可通过“编辑区域”补充。</span>`}</div>`;
}

function specDetailBody(template, profile) {
  const specs = state.data.specifications?.filter((item) => item.templateId === template.id) || [];
  const uses = state.data.tasks?.filter((task) => task.targetTemplateIds?.includes(template.id)) || [];
  const artifacts = state.data.tasks?.flatMap((task) => (task.artifacts || []).filter((artifact) => artifact.templateId === template.id).map((artifact) => ({ ...artifact, taskName: task.project }))) || [];
  if (state.specTab === "versions") return `<div class="spec-tab-list">${specs.map((item, index) => `<article><b>版本 ${specs.length - index}</b><span>${esc(item.name)}</span><small>${relativeDate(item.createdAt)} · ${item.assets?.length || 0} 个文件</small><span class="spec-version-actions">${(item.assets || []).map((asset) => `<a href="${asset.url}" ${asset.mime === "image/vnd.adobe.photoshop" ? "download" : "target=\"_blank\""}>${asset.mime === "image/vnd.adobe.photoshop" ? "下载 PSD" : "查看预览"}</a>`).join("")}</span></article>`).join("") || `<div class="empty">尚未上传规范版本</div>`}</div>`;
  if (state.specTab === "usage") return `<div class="spec-tab-list">${uses.map((task) => `<article><b>${esc(task.project)}</b><span>${esc(projectName(task.archiveProjectId??task.projectId))}</span><small>${task.status} · ${relativeDate(task.updatedAt || task.createdAt)}</small><button data-task="${task.id}">查看任务</button></article>`).join("") || `<div class="empty">暂无任务使用该资源位</div>`}</div>`;
  if (state.specTab === "assets") return `<div class="spec-related-assets">${artifacts.map((item) => `<article>${item.url ? `<img src="${item.url}">` : ""}<b>${esc(item.name)}</b><small>${esc(item.taskName)} · ${formatBytes(item.bytes || 0)}</small></article>`).join("") || `<div class="empty">暂无关联成品素材</div>`}</div>`;
  const layoutRule = state.data.psdLayoutRules?.templates?.find((item) => item.templateId === template.id);
  const hasRegions = [...(layoutRule?.globalRegions || []), ...(layoutRule?.variants || []).flatMap((variant) => variant.regions || [])].some((region) => region.bounds);
  const hasSpecImage = specs.some(item => item.assets?.some(asset => asset.mime?.startsWith("image/")));
  const formatIssues = (layoutRule?.issues || []).filter((issue) => !/等待人工核实/.test(issue));
  const issuePanel = formatIssues.length ? `<section class="spec-format-issues"><b>PSD检查发现 ${formatIssues.length} 项问题</b><ul>${formatIssues.map((issue) => `<li>${esc(issue)}</li>`).join("")}</ul><span>已按PSD实际画布录入；修正源PSD并重新导入前，该资源位禁止生产。</span></section>` : "";
  const verificationMessage = template.sourceSpec?.channel === "huawei"
    ? "尺寸与制作要求已录入；生产导出、画面区域和特殊格式仍待验证"
    : "按以下步骤完成后，状态会变为“可生产”";
  const verificationGuide = specProductionReady(template) ? "" : `<section class="spec-verification-guide"><div><b>该资源位待核实</b><span>${verificationMessage}</span></div><ol><li class="${hasSpecImage ? "done" : ""}"><i>${hasSpecImage ? "✓" : "1"}</i><span><b>上传规范图</b><small>保存平台或渠道的官方规范截图</small></span></li><li class="${hasRegions ? "done" : ""}"><i>${hasRegions ? "✓" : "2"}</i><span><b>检查画面区域</b><small>用“编辑区域”确认遮挡区、安全区和元素位置</small></span></li><li><i>3</i><span><b>核实并发布</b><small>填写已确认的规则、来源、日期和负责人</small></span></li></ol></section>`;
  return `${issuePanel}${verificationGuide}<div class="spec-detail-grid"><div class="spec-detail-side"><section><h3>基本规格</h3><dl><div><dt>尺寸</dt><dd>${template.width}×${template.height} px</dd></div><div><dt>格式</dt><dd>${esc(template.sourceSpec?.formats?.join(" / ") || template.format || "待定义")}</dd></div><div><dt>文件大小</dt><dd>${esc(template.sourceSpec?.sizeLimitText || (template.maxBytes ? `≤ ${Math.round(template.maxBytes / 1024)}KB` : "待定义"))}</dd></div><div><dt>色彩模式</dt><dd>${esc(template.sourceSpec?.colorMode || "RGB")}</dd></div><div><dt>分辨率</dt><dd>${esc(template.sourceSpec?.resolution || "72 dpi")}</dd></div></dl></section><section><h3>内容要求</h3><div class="spec-element-list">${specElementRows(profile,template)}</div></section><section><h3>${template.sourceSpec ? "来源与制作要求" : "导出要求"}</h3><ul>${(template.specification?.rules || ["按目标尺寸导出", "遵守页面遮挡区与安全区域"]).map((rule) => `<li>${esc(rule)}</li>`).join("")}</ul></section></div><section class="spec-visual-rules"><h3>画面区域</h3>${specRegionPreview(template)}</section></div>`;
}

function renderBusinessLines(){
 title.textContent='规范中心';
 const selection=state.specSelection||{module:'core'};
 if(selection.module!=='core')return specNavigation.mountExternal(content,selection).catch(error=>toast(error.message));
 renderBusinessLinesPrevious();
 specNavigation.mountTree(content.querySelector('.spec-system-tree'),{module:'core',lineId:state.specLineId,segmentId:state.specSegmentId,templateId:state.specTemplateId});
}
function renderBusinessLinesPrevious() {
  title.textContent = "规范中心";
  const lines = state.data.businessLines || [];
  const line = lines.find((item) => item.id === state.specLineId) || lines.find((item) => item.enabled) || lines[0];
  state.specLineId = line?.id || "";
  const segment = line?.segments?.find((item) => item.id === state.specSegmentId) || line?.segments?.find((item) => item.enabled) || line?.segments?.[0];
  state.specSegmentId = segment?.id || "";
  const templates = state.data.templates.filter((item) => item.businessLineId === line?.id && item.segmentId === segment?.id);
  const template = templates.find((item) => item.id === state.specTemplateId) || templates[0];
  state.specTemplateId = template?.id || "";
  const profile = state.data.resourceProfiles.find((item) => item.templateId === template?.id) || { status: "draft", elements: {} };
  const uses = state.data.tasks?.filter((task) => task.targetTemplateIds?.includes(template?.id)).length || 0;
  const specs = state.data.specifications?.filter((item) => item.templateId === template?.id).length || 0;
  content.innerHTML = `<header class="workspace-page-heading spec-center-heading"><h2>规范中心</h2></header><div class="spec-center-toolbar"><label>⌕<input id="spec-search" aria-label="搜索当前分类的资源位" placeholder="搜索当前分类的资源位"></label><button class="button primary" id="new-resource-position">＋ 新增资源位</button></div><div class="spec-center-layout">
    <aside class="spec-system-tree"></aside>
    <section class="spec-resource-pane"><div class="spec-pane-title"><h2>${esc(segment?.name || "资源位")}（${templates.length}）</h2></div><div class="spec-resource-list">${templates.map((item) => { return `<button class="spec-resource-card ${item.id === template?.id ? "active" : ""}" data-spec-template="${item.id}"><i class="spec-resource-placeholder" aria-hidden="true"></i><span><b>${esc(item.name)}</b><em>${item.family ? esc(item.family) : "资源位"}</em><small>${item.width}×${item.height}</small></span><strong class="${specProductionReady(item) ? "ready" : "pending"}" title="${specProductionReady(item) ? "规则已核实，可进入生产" : "选择后按右侧三步完成核实"}">● ${specProductionReady(item) ? "可生产" : "待核实"}</strong></button>`; }).join("") || `<div class="spec-empty-channel"><i>＋</i><b>${esc(segment?.name || "当前渠道")}还没有资源位</b><p>先录入资源位名称、尺寸和导出要求，再上传模板规范图。</p><button class="button primary" data-add-and-upload data-line-id="${line?.id || ""}" data-segment-id="${segment?.id || ""}">＋ 新增资源位并上传规范</button></div>`}</div><button class="spec-new-segment" data-segment-add="${line?.id || ""}">＋ 新建业务线分类</button></section>
    <main class="spec-detail-pane">${template ? `<header><div><h2>${esc(template.name)}</h2><span class="tag">${esc(template.family || "资源位")}</span><span class="spec-ready-dot ${specProductionReady(template) ? "" : "pending"}">● ${specProductionReady(template) ? "可生产" : "待核实"}</span></div><small>规范版本：${specs}　使用记录：${uses}</small></header><nav class="spec-detail-tabs"><button class="${state.specTab === "detail" ? "active" : ""}" data-spec-tab="detail">规则详情</button><button class="${state.specTab === "versions" ? "active" : ""}" data-spec-tab="versions">版本记录（${specs}）</button><button class="${state.specTab === "usage" ? "active" : ""}" data-spec-tab="usage">使用记录（${uses}）</button><button class="${state.specTab === "assets" ? "active" : ""}" data-spec-tab="assets">关联素材</button></nav><div class="spec-detail-content">${specDetailBody(template, profile)}</div><footer><button class="button ghost" data-spec-add="${template.id}">⇩ 上传规范图</button><button class="button ghost" data-region-edit="${template.id}">✎ 编辑区域</button><button class="button primary" data-rule-edit="${template.id}">${specProductionReady(template) ? "更新发布规则" : "核实并发布"}</button></footer>` : `<div class="spec-empty-detail"><i>⇩</i><b>${esc(segment?.name || "当前渠道")}暂无模板规范</b><p>新增资源位后会立即打开规范图上传窗口。</p><button class="button primary" data-add-and-upload data-line-id="${line?.id || ""}" data-segment-id="${segment?.id || ""}">新增资源位并上传规范</button></div>`}</main></div>`;
  document.querySelector("#new-business-line")?.addEventListener("click", addBusinessLine);
  document.querySelector("#new-resource-position")?.addEventListener("click", () => addResourcePosition(line?.id, segment?.id));
  content.querySelectorAll("[data-spec-line]").forEach((button) => button.addEventListener("click", () => { state.specLineId = button.dataset.specLine; state.specSegmentId = ""; state.specTemplateId = ""; renderBusinessLines(); }));
  content.querySelectorAll("[data-spec-segment]").forEach((button) => button.addEventListener("click", () => { const [lineId, segmentId] = button.dataset.specSegment.split(":"); state.specLineId = lineId; state.specSegmentId = segmentId; state.specTemplateId = ""; renderBusinessLines(); }));
  content.querySelectorAll("[data-spec-template]").forEach((button) => button.addEventListener("click", () => { state.specTemplateId = button.dataset.specTemplate; state.specTab = "detail"; renderBusinessLines(); }));
  content.querySelectorAll("[data-spec-tab]").forEach((button) => button.addEventListener("click", () => { state.specTab = button.dataset.specTab; renderBusinessLines(); }));
  content.querySelectorAll("[data-line-rename]").forEach((button) => button.addEventListener("click", () => renameBusinessLine(button.dataset.lineRename)));
  content.querySelectorAll("[data-line-toggle]").forEach((button) => button.addEventListener("click", () => patchBusinessLine(button.dataset.lineToggle, { enabled: button.textContent === "○" })));
  content.querySelectorAll("[data-segment-add]").forEach((button) => button.addEventListener("click", () => addSegment(button.dataset.segmentAdd)));
  content.querySelectorAll("[data-rule-edit]").forEach((button) => button.addEventListener("click", () => openRuleDialog(button.dataset.ruleEdit)));
  content.querySelectorAll("[data-region-edit]").forEach(button => button.addEventListener("click", () => editSpecRegions(button.dataset.regionEdit)));
  content.querySelectorAll("[data-spec-add]").forEach((button) => button.addEventListener("click", () => openSpecificationUpload(button.dataset.specAdd)));
  content.querySelectorAll("[data-add-and-upload]").forEach((button) => button.addEventListener("click", () => addResourcePosition(button.dataset.lineId, button.dataset.segmentId, { uploadAfter: true })));
  content.querySelectorAll("[data-task]").forEach((button) => button.addEventListener("click", () => openTask(button.dataset.task)));
  document.querySelector("#spec-search")?.addEventListener("input", (event) => { const q = event.target.value.trim().toLowerCase(); content.querySelectorAll(".spec-resource-card").forEach((card) => { card.style.display = card.textContent.toLowerCase().includes(q) ? "" : "none"; }); });
}

function requestResourceFields(){return new Promise(resolve=>{
 const dialog=document.createElement('dialog');dialog.className='dialog';dialog.innerHTML=`<form><div class="dialog-head"><h2>新增资源位</h2><button class="icon-button" type="button" aria-label="关闭">×</button></div><div class="form-grid"><label class="full">资源位名称<input name="name" required maxlength="100"/></label><label>宽度 px<input name="width" type="number" min="1" max="20000" required value="1920"/></label><label>高度 px<input name="height" type="number" min="1" max="20000" required value="550"/></label><label>输出格式<select name="format"><option>JPG</option><option>PNG</option></select></label><label>大小上限 KB<input name="maxKb" type="number" min="1" required value="600"/></label></div><div class="dialog-actions"><button class="button primary">创建资源位</button></div></form>`;
 document.body.append(dialog);let value=null;dialog.querySelector('.icon-button').onclick=()=>dialog.close();dialog.querySelector('form').onsubmit=e=>{e.preventDefault();value=Object.fromEntries(new FormData(e.currentTarget));dialog.close();};dialog.addEventListener('close',()=>{dialog.remove();resolve(value);},{once:true});dialog.showModal();
});}
async function addResourcePosition(businessLineId, segmentId, { uploadAfter = false } = {}) {
  if (!businessLineId || !segmentId) return toast("请先选择业务线分类");
  const values=await requestResourceFields();if(!values)return;
  const name=values.name,match=[null,values.width,values.height],format=values.format,maxKb=Number(values.maxKb);
  try {
    const created = await api("/api/templates", { method: "POST", body: JSON.stringify({ name: name.trim(), businessLineId, segmentId, width: Number(match[1]), height: Number(match[2]), format, maxBytes: Math.max(1, maxKb) * 1024 }) });
    state.specTemplateId = created.id;
    await refresh();
    if (uploadAfter) {
      openSpecificationUpload(created.id);
      toast("资源位已新增，请上传模板规范图");
    } else {
      toast("资源位已新增，请继续上传规范图并编辑规则");
    }
  } catch (error) { toast(error.message); }
}

async function addBusinessLine() { const name = prompt("新业务线名称"); if (name?.trim()) { await api("/api/business-lines", { method: "POST", body: JSON.stringify({ name }) }); await refresh(); } }
async function renameBusinessLine(id) { const line = state.data.businessLines.find((item) => item.id === id); const name = prompt("修改业务线名称", line.name); if (name?.trim()) await patchBusinessLine(id, { name }); }
async function patchBusinessLine(id, changes) { await api(`/api/business-lines/${id}`, { method: "PATCH", body: JSON.stringify(changes) }); await refresh(); }
async function moveBusinessLine(id, delta) { const line = state.data.businessLines.find((item) => item.id === id); await patchBusinessLine(id, { order: line.order + delta }); }
async function addSegment(lineId) { const name = prompt("细分渠道 / 类型名称"); if (name?.trim()) { await api(`/api/business-lines/${lineId}/segments`, { method: "POST", body: JSON.stringify({ name }) }); await refresh(); } }
async function renameSegment(lineId, segmentId) { const segment = state.data.businessLines.find((item) => item.id === lineId)?.segments.find((item) => item.id === segmentId); const name = prompt("修改细分名称", segment.name); if (name?.trim()) await patchSegment(lineId, segmentId, { name }); }
async function patchSegment(lineId, segmentId, changes) { await api(`/api/business-lines/${lineId}/segments/${segmentId}`, { method: "PATCH", body: JSON.stringify(changes) }); await refresh(); }
async function moveSegment(lineId, segmentId, delta) { const segment = state.data.businessLines.find((item) => item.id === lineId)?.segments.find((item) => item.id === segmentId); await patchSegment(lineId, segmentId, { order: segment.order + delta }); }

function openRuleDialog(templateId) {
  const template = state.data.templates.find((item) => item.id === templateId); const profile = state.data.resourceProfiles.find((item) => item.templateId === templateId); const form = document.querySelector("#rule-form"); form.reset();
  const options = `<option value="unspecified">待定义</option><option value="required">必须包含</option><option value="optional">可选</option><option value="forbidden">禁止出现</option>`;
  ["title", "logo", "ipCopyright", "secondaryCopy", "button"].forEach((key) => { form.elements[key].innerHTML = options; form.elements[key].value = profile.elements[key] || "unspecified"; });
  form.dataset.layoutRevision = String(state.data.psdLayoutRules.templates.find(item => item.templateId === templateId)?.revision || 0);
  form.elements.templateId.value = templateId; form.elements.status.value = profile.status || "draft"; form.elements.notes.value = profile.notes || "";
  const rule = state.data.resourceRules?.find((item) => item.templateId === templateId);
  form.elements.ruleVerified.checked = rule?.deliveryAllowed === true && rule?.status === "verified";
  form.elements.ruleVerifiedRules.value = (rule?.verifiedVisualRules || []).join("\n");
  form.elements.ruleNote.value = rule?.note || "";
  const statusText = rule ? ({ verified: "已核实", partial: "部分核实", technical_only: "仅技术规格", provisional: "待核实", draft: "待补充" })[rule.status] || rule.status : "无记录";
  document.querySelector("#rule-delivery-info").textContent = rule
    ? `当前：${statusText} · ${rule.deliveryAllowed ? "允许交付" : "禁止交付"}${rule.missing?.length ? ` · 待确认：${rule.missing.join("；")}` : ""}`
    : "该资源位暂无视觉规则记录，只能验证，不能交付";
  document.querySelector("#rule-resource-name").textContent = `${template.name} · ${template.width}×${template.height}`; ruleDialog.showModal();
}

function renderTemplates() {
  title.textContent = "模板中心";
  const categories = state.data.categories || [];
  const baseline = state.data.psdBaseline;
  const baselineTemplateIds = new Set((baseline?.templates || []).map((item) => item.workbenchTemplateId));
  const pending = state.data.templates.filter((item) => item.automationReady === false && baselineTemplateIds.has(item.id));
  const conflicts = baseline?.templates?.filter((item) => item.issues?.length) || [];
  content.innerHTML = `<div class="panel-head" style="padding:0 0 20px;border:0"><div><h2>资源位大类与优秀案例</h2><p>Banner按规格生产；PSD仅用于规则解析和页面效果预览。大类可新增、改名、排序和停用。</p></div><button class="button primary" id="new-category">＋ 新增大类</button></div>
    ${baseline ? `<section class="panel psd-baseline-panel"><div><p class="eyebrow">PSD SPECIFICATION BASELINE</p><h2>模板规范 ${esc(baseline.baselineVersion)}</h2><p>来源：模版规范PSD版本：${esc(baseline.baselineVersion)}。原PSD只读，工作台使用结构化解析结果。</p></div><div class="baseline-metrics"><span><b>${baseline.psdCount}</b>PSD总数</span><span class="pass"><b>${baseline.psdCount - pending.length}</b>可试点</span><span class="warn"><b>${pending.length}</b>待核实</span><span class="danger"><b>${conflicts.length}</b>尺寸冲突</span></div><details><summary>查看${pending.length}个已登记但尚未开放生产的资源位</summary><div class="baseline-pending">${pending.map((item) => `<span>${esc(item.name)} · ${item.width}×${item.height}</span>`).join("")}</div></details></section>` : ""}
    <div class="category-stack">${categories.map((category) => {
      const items = state.data.templates.filter((item) => item.categoryId === category.id);
      const references = state.data.references.filter((item) => item.categoryId === category.id);
      return `<section class="panel category-section ${category.enabled ? "" : "is-disabled"}"><div class="panel-head"><div><h2>${esc(category.name)}</h2><p>${items.length} 个资源位 · ${references.length} 套优秀案例</p></div><div class="category-actions"><button class="button ghost" data-category-rename="${category.id}">改名</button><button class="button ghost" data-category-move="${category.id}" data-delta="-10">上移</button><button class="button ghost" data-category-move="${category.id}" data-delta="10">下移</button><button class="button ${category.enabled ? "danger" : "secondary"}" data-category-toggle="${category.id}">${category.enabled ? "停用" : "启用"}</button></div></div>
      <div class="category-body"><div><h3>资源位规格</h3><div class="template-grid compact">${items.map(templateCard).join("") || `<p class="subtext">暂未关联资源位</p>`}</div></div><div><h3>优秀案例库</h3><div class="reference-grid">${references.map(referenceCard).join("") || `<p class="subtext">暂无案例</p>`}</div><button class="button secondary" data-reference-add="${category.id}">＋ 上传优秀案例图片</button></div></div></section>`;
    }).join("")}</div>`;
  document.querySelector("#new-category").addEventListener("click", addCategory);
  document.querySelectorAll("[data-category-rename]").forEach((button) => button.addEventListener("click", () => renameCategory(button.dataset.categoryRename)));
  document.querySelectorAll("[data-category-toggle]").forEach((button) => button.addEventListener("click", () => updateCategory(button.dataset.categoryToggle, { enabled: button.textContent === "启用" })));
  document.querySelectorAll("[data-category-move]").forEach((button) => button.addEventListener("click", () => moveCategory(button.dataset.categoryMove, Number(button.dataset.delta))));
  document.querySelectorAll("[data-reference-add]").forEach((button) => button.addEventListener("click", () => addReference(button.dataset.referenceAdd)));
  document.querySelectorAll("[data-spec-add]").forEach((button) => button.addEventListener("click", () => openSpecificationUpload(button.dataset.specAdd)));
}

function templateCard(template) { const specs = state.data.specifications?.filter((item) => item.templateId === template.id) || []; const psd = state.data.psdBaseline?.templates?.find((item) => item.workbenchTemplateId === template.id); const coordinates = state.data.psdLayoutRules?.templates?.find((item) => item.templateId === template.id); return `<article class="template-card ${template.automationReady === false ? "template-pending" : ""}">${specs[0]?.assets?.[0] ? `<img class="spec-thumb" src="${specs[0].assets[0].url}" alt="${esc(specs[0].name)}" />` : `<div class="ratio-box" style="height:${Math.max(80, Math.min(140, 110 * template.height / template.width + 50))}px"><span>${template.width} × ${template.height}</span></div>`}<p>${esc(template.family)}</p><h3>${esc(template.name)}</h3><div class="tags"><span class="tag">${template.format || "格式待核实"}</span>${template.maxBytes ? `<span class="tag">≤ ${Math.round(template.maxBytes / 1024)}KB</span>` : `<span class="tag warning-tag">大小待核实</span>`}<span class="tag">${template.automationReady === false ? "禁止任务选择" : template.pagePreviewPsd ? "含页面PSD预览" : "Banner直接生产"}</span>${template.specification?.bottomWhiteGradientPx ? `<span class="tag">底部${template.specification.bottomWhiteGradientPx}px白色渐变</span>` : ""}${psd ? `<span class="tag psd-tag">PSD ${esc(psd.sourceVersion)}</span><span class="tag">${psd.layoutGroups.length || 1}套版式</span>` : `<span class="tag warning-tag">未关联V1.0 PSD</span>`}${coordinates ? `<span class="tag coordinate-tag">坐标已解析</span>` : ""}</div>${psd ? `<p class="spec-status ${template.automationReady === false || coordinates?.issues?.length ? "pending" : ""}">${template.automationReady === false || coordinates?.issues?.length ? "!" : "✓"} 已读取 ${psd.layerCount} 个图层 · ${coordinates?.issues?.length ? esc(coordinates.issues.join("；")) : esc(template.readinessNote || psd.fileName)}</p>` : specs.length ? `<p class="spec-status">✓ 已保存 ${specs.length} 套规范图</p>` : `<p class="spec-status pending">尚未上传规范图</p>`}<button class="button secondary full-button" data-spec-add="${template.id}">＋ ${specs.length ? "补充规范图" : "上传规范图"}</button></article>`; }

function referenceCard(item) { return `<article class="reference-card">${item.assets?.length ? `<div class="reference-images">${item.assets.slice(0,3).map((asset) => `<img src="${asset.url}" alt="${esc(item.name)}" />`).join("")}</div>` : ""}<b>${esc(item.name)}</b><p>${esc(item.description)}</p><div class="tags">${item.tags.map((tag) => `<span class="tag">${esc(tag)}</span>`).join("")}</div><small>${item.layoutReusable ? "可直接作为布局参考" : "仅分析构图规律"}</small></article>`; }

async function addCategory() { const name = prompt("新大类名称"); if (name?.trim()) { await api("/api/categories", { method:"POST", body:JSON.stringify({name}) }); await refresh(); } }
async function renameCategory(id) { const current = state.data.categories.find((item) => item.id === id); const name = prompt("修改大类名称", current.name); if (name?.trim()) await updateCategory(id, {name}); }
async function updateCategory(id, changes) { await api(`/api/categories/${id}`, {method:"PATCH",body:JSON.stringify(changes)}); await refresh(); }
async function moveCategory(id, delta) { const item = state.data.categories.find((value) => value.id === id); await updateCategory(id, {order:item.order + delta}); }
function addReference(categoryId) { const category = state.data.categories.find((item) => item.id === categoryId); const form = document.querySelector("#reference-form"); form.reset(); form.elements.categoryId.value = categoryId; document.querySelector("#reference-category-name").textContent = `所属大类：${category?.name || ""}`; document.querySelector("#reference-upload-preview").innerHTML = ""; referenceDialog.showModal(); }
function openSpecificationUpload(templateId) { const template = state.data.templates.find((item) => item.id === templateId); const form = document.querySelector("#spec-form"); form.reset(); form.elements.templateId.value = templateId; form.elements.name.value = `${template.name}规范`; form.elements.notes.value = template.specification?.rules?.join("；") || ""; document.querySelector("#spec-resource-name").textContent = `${template.name} · ${template.width}×${template.height}`; document.querySelector("#spec-upload-preview").innerHTML = ""; specDialog.showModal(); }

function renderAiCenter() {
  title.textContent = "AI生成中心";
  const models = state.data.privacy?.approvedModels || [];
  const heroRule = state.data.resourceRules?.find((item) => item.templateId === "37-home-hero");
  const geometry = heroRule?.geometry || {};
  const demoBase = "/generated-demo/";
  content.innerHTML = `
    <section class="ai-hero">
      <article class="ai-policy">
        <p class="eyebrow">CONTROLLED EXTERNAL AI</p>
        <h2>外部AI已开放，但规范拥有最终决定权</h2>
        <p>外部模型只负责背景扩展、缺失区域补画、局部重绘和画面重构。最终图片仍由工作台按资源位的精确像素、页面遮挡、核心内容区、固定渐变和文件大小重新处理。模型输出不会直接标记为成品。</p>
        <div class="ai-policy-badges"><span>按任务授权</span><span>显示模型与点数</span><span>保留原图和候选图</span><span>设计师最终审核</span></div>
      </article>
      <article class="panel pipeline-card"><h3>一套图的生产顺序</h3><div class="pipeline-flow">
        ${[["1","读取资源位规范"],["2","AI生成2–3个候选"],["3","精确尺寸与渐变处理"],["4","页面效果预览与审核"]].map(([n,t])=>`<div class="pipeline-step"><i>${n}</i><div><b>${t}</b><span class="subtext">${n === "2" ? "这一阶段才允许发送素材" : "由工作台确定性执行"}</span></div></div>`).join("")}
      </div></article>
    </section>
    <section class="panel" style="padding:20px"><div class="panel-head" style="padding:0 0 16px"><div><h2>可调用模型</h2><p>模型能力与调用成本在任务提交前明确展示</p></div><span class="status" data-status="已完成">${models.length} 个通道</span></div>
      <div class="model-grid">${models.map((model,index)=>`<article class="model-card ${index===0?"recommended":""}"><div class="model-card-head"><div><p class="eyebrow">${index===0?"RECOMMENDED":"OPTIONAL"}</p><h3>${esc(model.name)}</h3></div><span class="model-cost">约 ${model.points} 点/次</span></div><p>${esc(model.purpose)}</p><div class="tags"><span class="tag">候选图</span><span class="tag">必须审核</span></div><span class="model-channel">调用通道：${esc(model.channel)}</span></article>`).join("")}</div>
    </section>
    <section class="panel spec-workflow"><div class="panel-head" style="padding:0 0 16px"><div><h2>37网游平台首页头图 · 硬性规范</h2><p>最终Banner与页面效果预览必须同时通过</p></div><span class="status" data-status="成套审核">截图坐标待复核</span></div>
      <div class="page-demo"><div class="core-zone">核心内容区</div><div class="login-mask"></div><div class="content-mask"></div><div class="gradient-zone"></div><span class="demo-label" style="left:18%;top:3%">登录框遮挡预览</span><span class="demo-label" style="left:40%;bottom:3%">页面内容遮挡预览</span></div>
      <div class="spec-rule-grid">
        <div class="spec-rule"><b>最终导出</b><small>${geometry.exportCanvas?.width || 1920}×${geometry.exportCanvas?.height || 550}px · JPG · ≤600KB</small></div>
        <div class="spec-rule"><b>核心内容区</b><small>x ${geometry.mainElementRegion?.x || 346} · y ${geometry.mainElementRegion?.y || 44} · ${geometry.mainElementRegion?.width || 1228}×${geometry.mainElementRegion?.height || 440}</small></div>
        <div class="spec-rule"><b>页面遮挡检查</b><small>登录框与下方页面内容仅用于预览，绝不导出进Banner</small></div>
        <div class="spec-rule"><b>底部固定渐变</b><small>最后64px白色渐变直接写入最终Banner</small></div>
      </div>
      <div class="live-demo-head"><div><p class="eyebrow">REAL EXTERNAL-AI RESULT</p><h2>真实试跑结果 · 非占位图</h2><p>外部AI只重构背景与人物；标题和Logo由原素材像素级叠回，随后再做精确尺寸、渐变和压缩。</p></div><span class="status" data-status="成套审核">待设计师审图</span></div>
      <div class="live-demo-grid">
        <article class="live-demo-card"><img src="${demoBase}banner-v01.jpg" alt="赘婿1920×550 Banner候选图"><div><b>Banner候选 V01</b><span>1920×550 · JPG · 202KB · 底部64px白色渐变</span><a class="button secondary" href="${demoBase}banner-v01.jpg" download="赘婿_37网游平台首页头图_1920x550_V01.jpg">下载候选图</a></div></article>
        <article class="live-demo-card"><img src="${demoBase}page-preview-v01.jpg" alt="赘婿平台页面效果预览"><div><b>页面效果预览</b><span>登录框与下方内容只存在于预览，不写入Banner</span><a class="button secondary" href="${demoBase}page-preview-v01.jpg" download="赘婿_37网游平台首页头图_页面效果预览_V01.jpg">下载预览图</a></div></article>
      </div>
      <div class="qc-strip"><span class="pass">✓ 尺寸 1920×550</span><span class="pass">✓ JPG ≤600KB</span><span class="pass">✓ 渐变写入Banner</span><span class="warn">! 构图与标题位置待设计师确认</span></div>
    </section>`;
}

function renderBrands() {
  title.textContent = "项目品牌库";
  content.innerHTML = `<div class="panel-head" style="padding:0 0 20px;border:0"><div><h2>项目级品牌资产</h2><p>仅保存于内网，用于约束模板编排与设计审核</p></div><button class="button primary" id="new-brand">＋ 新建品牌包</button></div><div class="brand-grid">${state.data.brands.map((brand) => `
    <article class="brand-card"><p>PROJECT BRAND KIT</p><h3>${esc(brand.name)}</h3><div>${brand.colors.map((color) => `<i class="brand-color" style="background:${esc(color)}"></i>`).join("")}</div><p>${esc(brand.rules || "尚未填写品牌规则")}</p><div class="tags">${brand.fonts.map((font) => `<span class="tag">${esc(font)}</span>`).join("")}</div><div class="asset-list">${brand.assets.map((asset) => `<div class="asset-item"><span>${esc(asset.name)}</span><span>${formatBytes(asset.bytes)}</span></div>`).join("") || `<span class="subtext">暂无长期资产</span>`}</div><label class="file-drop" style="margin-top:12px">＋ 上传 Logo／字体／常用素材<input type="file" multiple data-brand-upload="${brand.id}" /></label></article>`).join("")}</div>`;
  document.querySelector("#new-brand").addEventListener("click", () => brandDialog.showModal());
  document.querySelectorAll("[data-brand-upload]").forEach((input) => input.addEventListener("change", uploadBrandAssets));
}

async function uploadBrandAssets(event) {
  const files = [...event.target.files];
  if (!files.length) return;
  try {
    const payload = [];
    for (const file of files) payload.push({ name: file.name, dataUrl: await fileToDataUrl(file) });
    await api(`/api/brands/${event.target.dataset.brandUpload}/assets`, { method: "POST", body: JSON.stringify({ files: payload }) });
    await refresh();
    toast(`已加入 ${files.length} 个长期品牌资产`);
  } catch (error) { toast(error.message); }
}

async function openTask(id) {
  const previousTask = state.task;
  try {
  // The dashboard list is a snapshot. Always reopen the saved task, including per-size layouts.
  state.task = await api(`/api/tasks/${id}`);
  installCustomEditorTemplate(state.task);
  if(!isSourceAdaptation(state.task)&&state.task.masterTemplate?.communityPlacement&&!state.task.masterTemplate.communityMaster&&!(state.task.status==='已完成'&&state.task.deliveredPackage)&&state.task.communityGeneration?.status!=='running'&&state.task.outpaint?.status!=='running'){
    state.task=await api(`/api/tasks/${id}/community-master-workspace`,{method:'POST',body:JSON.stringify({expectedUpdatedAt:state.task.updatedAt})});
  }
  const cached = state.data.tasks.findIndex((task) => task.id === id);
  if (cached >= 0) state.data.tasks[cached] = state.task;
  state.editorHistory = null;
  state.editorAssetFilter = "全部";
  state.editorAssetQuery = "";
  state.showGuides = true;
  state.communitySideTab = "ai";
  state.communityWorkspaceStage='master';
  state.masterMaterialView='composite';state.masterMaterialFilter='all';state.masterPreviewZoom=1;
  state.masterPropertiesOpen=true;
  state.communityPreciseOpen={};state.communityAspectLocks={};
  state.communityObjectMode='ai';state.communityObjectSelection=null;state.communityObjectStyleDraft=null;state.communityObjectRequest=null;
  state.communityPastedImages.clear();
  const requestedTemplate = new URLSearchParams(location.search).get("template");
  const lastTemplate = localStorage.getItem(`community-last-template:${id}`);
  const preferredTemplate = requestedTemplate || lastTemplate;
  state.previewTemplateId = preferredTemplate && state.task.targetTemplateIds?.includes(preferredTemplate)
    ? preferredTemplate
    : (state.data.templates.some((item) => item.id === state.task.masterTemplateId) ? state.task.masterTemplateId : (state.data.templates.find((item) => state.task.targetTemplateIds?.includes(item.id))?.id || null));
  state.previewMode = "target";
  if(state.task.masterTemplate?.communityMaster){state.previewTemplateId=state.task.masterTemplateId;state.showGuides=false;state.inspectorElement='background';}
  Object.assign(state, await loadEditorImages(state.task, loadImage));
  try { await loadProjectFonts(state.task, state.data.projects || []); } catch (error) {
    if(state.task.parameters?.titleFontId || state.task.parameters?.subtitleFontId)throw error;
    toast('项目字体加载失败，请刷新后重试');
  }
  if(!state.task.sourceAdaptation)await hydrateOutpaintImages(state.task);
  if (!state.task.artifacts?.length && !state.task.coverPreview?.url) await saveTaskCoverPreview();
  if (state.task.outpaint?.status === "running") scheduleOutpaintPoll();
  if (state.task.communityGeneration?.status === "running") scheduleCommunityGenerationPoll();
  render();
  return true;
  } catch (error) {
    state.task = previousTask;
    toast(`无法打开任务：${error.message}。请重试。`);
    return false;
  }
}

function wireMasterWorkspaceEvents(){
  document.querySelector('#custom-canvas-resize')?.addEventListener('click',async()=>{
    try{if(!await flushPendingParameterSave())return;const task=state.task,template=task.masterTemplate,layouts=Object.fromEntries(['character','character2','foreground','title','subtitle','subtitle-backing','logo','ip-copyright','button'].filter(k=>hasCanvasAsset(k,template)||nativeCopyValue(task,template,k)).map(k=>[k,getElementLayout(task,template,k)]));
      openCustomCanvasResize({task,layouts,api,resized:async saved=>{if(state.task?.id!==saved.id)return;state.task=saved;installCustomEditorTemplate(saved);state.previewTemplateId=saved.masterTemplateId;state.editorHistory=null;state.inspectorElement='background';Object.assign(state,await loadEditorImages(saved,loadImage));renderTaskDetail();await saveTaskCoverPreview();management.invalidate();toast('画布尺寸已更新，素材保持原有比例');}});
    }catch(e){toast(e.message);}
  });
  document.querySelector('#master-project-materials')?.addEventListener('click',async()=>{
    const task=state.task;if(!task?.projectId)return;
    try{await openProjectMaterialPicker({projectId:task.projectId,api,task,toast,onUse:async(asset,mode,textKind)=>{
      if(state.task?.id!==task.id)throw Error('当前任务已变化，请重新打开项目素材');
      if(!await flushPendingParameterSave())throw Error('当前排版尚未保存，请稍后再加入素材');
      const saved=await api(`/api/projects/${task.projectId}/design-library/assets/${asset.id}/use`,{method:'POST',body:JSON.stringify({taskId:task.id,expectedUpdatedAt:state.task.updatedAt,requestId:crypto.randomUUID(),mode,textKind,scope:['title','subtitle'].includes(state.task.parameters?.communityMaterialKind)?'text':'illustration'})});
      state.task=saved;Object.assign(state,await loadEditorImages(saved,loadImage));await loadCommunityObjectLayerImages(saved,loadImage,state.assetImages);await loadProjectFonts(saved,state.data.projects);renderTaskDetail();toast(mode==='reference'?'项目素材已加入 AI 参考图':'项目素材已加入当前画布');
    }});}catch(e){toast(e.message);}
  });
  state.stopCommunityObjects?.();
  state.stopCommunityObjectCanvas?.();
  state.stopCharacterReuseMenus?.();
  const objectRoot=content.querySelector('.community-master-workspace'),objectTaskId=state.task.id;
  const properties=objectRoot.querySelector('.master-element-details');
  properties?.addEventListener('toggle',()=>{if(properties.isConnected&&state.task?.id===objectTaskId)state.masterPropertiesOpen=properties.open;});
  properties?.querySelector('summary')?.addEventListener('click',()=>{state.masterPropertiesOpen=!properties.open;});
  const propertyTemplate=state.data.templates.find(t=>t.id===state.previewTemplateId)||state.task.masterTemplate,propertyKey=communityPropertyKey(state.task,propertyTemplate,state.inspectorElement);
  mountCommunityProperties(objectRoot,{
    selectLayer:kind=>{state.inspectorElement=kind;state.inspectorTab='elements';renderTaskDetail();},
    setRatioLocked:locked=>{(state.communityAspectLocks||={})[propertyKey]=locked;},
    setPreciseOpen:open=>{(state.communityPreciseOpen||={})[propertyKey]=open;}
  });
  const setReuseCharacter=async name=>{
    const id=state.task.id;
    if(state.task.communityGeneration?.status==='running'||state.task.communityObjectJob?.status==='running'||state.task.outpaint?.status==='running'||state.task.status==='已完成'&&state.task.deliveredPackage)return;
    try{
      const clear=!name||illustrationOptions(state.task).characterSourceName===name;
      if(!clear){
        const asset=illustrationCharacterSources(state.task).find(a=>a.name===name);
        if(!asset||asset.mime?.split(';')[0].toLowerCase()!=='image/png')throw Error('请选择当前任务中的透明角色 PNG');
        const image=state.assetImages.get(name)||await loadImage(asset.url);assertReusableCharacterImage(image);
        if(state.task?.id!==id)return;state.assetImages.set(name,image);
      }
      if(state.task?.id!==id)return;
      setCharacterReuse(state.task,clear?'':name);state.task.parameters.communityMaterialKind='illustration';state.communityObjectMode='ai';state.communitySideTab='ai';state.communityDesignError='';
      scheduleParamsSave();renderTaskDetail();toast(clear?'已取消原样使用，角色按提示词生成':'已选为下次生成的原样角色');
    }catch(error){if(state.task?.id===id)bannerComposerError(error.message);}
  };
  state.stopCharacterReuseMenus=mountCharacterReuseMenus(objectRoot,setReuseCharacter);
  objectRoot.querySelector('[data-character-reuse-clear]')?.addEventListener('click',()=>void setReuseCharacter(''));
  state.stopCommunityObjects=mountCommunityObjects({root:objectRoot,task:state.task,ui:state,api,flush:flushPendingParameterSave,refresh:async fresh=>{if(state.task?.id!==fresh.id)return;state.task=fresh;await Promise.all(fresh.assets.filter(a=>isRenderableImageAsset(a)&&!a.objectRunId&&!state.assetImages.has(a.name)).map(async a=>{try{state.assetImages.set(a.name,await loadImage(a.url));}catch{}}));await loadCommunityObjectLayerImages(fresh,loadImage,state.assetImages);renderTaskDetail();},render:renderTaskDetail,toast,isActive:()=>state.task?.id===objectTaskId});
  state.stopCommunityObjectCanvas=mountCommunityObjectCanvas({root:objectRoot,getTask:()=>state.task,getTemplate:()=>state.data.templates.find(t=>t.id===state.previewTemplateId)||state.task.masterTemplate,ui:state,images:state.assetImages,loadImage,flush:flushPendingParameterSave,save:()=>saveParameters(true),schedule:scheduleParamsSave,render:renderTaskDetail,redraw:redrawPreview,toast,pixelHit:characterPixelAt,aboveCharacterHit:(template,point)=>['title','subtitle','subtitle-backing','logo','ip-copyright','button'].includes(hitCanvasElement(template,point)),isActive:()=>state.previewMode==='target'});
  document.querySelector('#master-upload-toggle')?.addEventListener('click',event=>{
    const button=event.currentTarget,choices=document.querySelector('#master-upload-choices');if(!choices)return;choices.hidden=!choices.hidden;button.setAttribute('aria-expanded',String(!choices.hidden));
  });
  document.querySelector('#preview-canvas')?.style.setProperty('--master-zoom',state.masterPreviewZoom||1);
  document.querySelector('#community-cleanup-text')?.addEventListener('click',async event=>{
    const button=event.currentTarget;button.disabled=true;button.classList.add('is-cleaning');const id=state.task.id;
    try{
      if(!await flushPendingParameterSave()||state.task?.id!==id)return;
      if(state.task.communityGeneration?.status==='running'||state.task.outpaint?.status==='running')return toast('请等待当前生成完成');
      const kind=state.inspectorElement,name=state.task.parameters.assetByTemplate?.[state.task.masterTemplateId]?.[kind],asset=state.task.assets.find(a=>a.name===name),expectedUpdatedAt=state.task.updatedAt;
      if(!['title','subtitle'].includes(kind)||!asset)return toast('请先选中独立主标或副标素材');
      const result=await openCommunityTextCleanup({asset,kind,anchor:document.querySelector('.editor-workspace'),onSave:async(strokes,requestId)=>{
        try{return await api(`/api/tasks/${id}/community-materials/cleanup`,{method:'POST',signal:AbortSignal.timeout(60000),body:JSON.stringify({kind,sourceName:name,expectedUpdatedAt,requestId,strokes})});}
        catch(error){try{const fresh=await api(`/api/tasks/${id}`);if(fresh.assets.some(a=>a.cleanupRequestId===requestId))return fresh;}catch{}throw error;}
      }});
      if(state.task?.id!==id)return;
      if(result?.saved){state.task=result.saved;const selected=state.task.parameters.assetByTemplate[state.task.masterTemplateId][kind],fresh=state.task.assets.find(a=>a.name===selected);if(fresh)state.assetImages.set(selected,await loadImage(fresh.url));renderTaskDetail();toast('已另存清理版，原素材和字形保留');}
    }catch(error){toast(error.message);}finally{if(button.isConnected){button.disabled=false;button.classList.remove('is-cleaning');}}
  });
  const refreshMaterial=async fresh=>{
    if(state.task?.id!==fresh.id)return;
    state.task=fresh;
    await Promise.all(fresh.assets.filter(a=>isRenderableImageAsset(a)&&!state.assetImages.has(a.name)).map(async a=>{try{state.assetImages.set(a.name,await loadImage(a.url))}catch{}}));
    await loadCommunityObjectLayerImages(fresh,loadImage,state.assetImages);
    renderTaskDetail();
  };
  document.querySelectorAll('[data-master-kind]').forEach(button=>button.addEventListener('click',()=>{
    state.task.parameters.communityMaterialKind=button.dataset.masterKind;state.communityDesignError='';scheduleParamsSave();renderTaskDetail();
  }));
  const chooseMaterialFont=async clear=>{
    const task=state.task,kind=task.parameters?.communityMaterialKind||'illustration';if(!['title','subtitle'].includes(kind)||task.communityGeneration?.status==='running')return;
    try{
      if(!await flushPendingParameterSave()||state.task?.id!==task.id)return;
      const result=clear?{id:null}:await openMaterialFontPicker({fonts:companyFonts(),selectedId:task.parameters.communityMaterialFontIds?.[kind],kind,text:kind==='title'?task.copy:task.parameters.subtitleText});
      if(!result||state.task?.id!==task.id)return;
      const previous=structuredClone(state.task.parameters.communityMaterialFontIds||{});
      (state.task.parameters.communityMaterialFontIds||={})[kind]=result.id;
      if(!await saveParameters(true)){state.task.parameters.communityMaterialFontIds=previous;renderTaskDetail();return;}
      renderTaskDetail();toast(result.id?'已选择版权字，可直接排字或生成 AI 字效':'已取消版权字选择');
    }catch(error){toast(error.message);}
  };
  document.querySelector('#community-choose-font')?.addEventListener('click',()=>void chooseMaterialFont(false));
  document.querySelector('#community-clear-font')?.addEventListener('click',()=>void chooseMaterialFont(true));
  document.querySelector('#community-typeset-font')?.addEventListener('click',async event=>{
    const button=event.currentTarget,id=state.task.id,kind=state.task.parameters.communityMaterialKind,color=document.querySelector('#community-typeset-color')?.value,fitBacking=document.querySelector('#community-typeset-backing')?.checked!==false,requestId=crypto.randomUUID();
    button.disabled=true;button.textContent='正在排字…';
    try{
      if(!await flushPendingParameterSave()||state.task?.id!==id)return;
      const body={kind,color,fitBacking,requestId,fontId:state.task.parameters.communityMaterialFontIds?.[kind],expectedUpdatedAt:state.task.updatedAt};
      let fresh;try{fresh=await api(`/api/tasks/${id}/community-materials/typeset`,{method:'POST',signal:AbortSignal.timeout(60000),body:JSON.stringify(body)});}
      catch(error){const current=await api(`/api/tasks/${id}`);if(current.assets.some(a=>a.typesettingRequestId===requestId))fresh=current;else throw error;}
      if(state.task?.id!==id)return;
      state.inspectorElement=kind;state.masterMaterialView='composite';await refreshMaterial(fresh);toast('已另存版权字素材，无描边'+(fresh.assets.find(a=>a.typesettingRequestId===requestId)?.typesetting?.fitBacking?'，已适配副标底板':''));
    }catch(error){toast(error.message);}finally{if(button.isConnected){button.disabled=false;button.textContent='直接使用版权字';}}
  });
  document.querySelector('#community-material-prompt')?.addEventListener('input',event=>{
    const p=state.task.parameters;(p.communityMaterialDrafts||={})[p.communityMaterialKind||'illustration']=event.target.value;state.communityDesignError='';scheduleParamsSave();
  });
  document.querySelector('#community-material-prompt')?.addEventListener('keydown',event=>{if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)){event.preventDefault();void submitCommunityMaterial();}});
  document.querySelector('#community-generate-material')?.addEventListener('click',()=>void submitCommunityMaterial());
  document.querySelector('#community-resume-material')?.addEventListener('click',async event=>{
    const button=event.currentTarget;button.disabled=true;try{const fresh=await api(`/api/tasks/${state.task.id}/community-materials/resume`,{method:'POST',body:'{}'});await refreshMaterial(fresh);scheduleCommunityGenerationPoll();}catch(error){bannerComposerError(error.message);if(button.isConnected)button.disabled=false;}
  });
  document.querySelectorAll('[data-master-material]').forEach(button=>button.addEventListener('click',async()=>{
    button.disabled=true;const id=state.task.id;
    try{if(!await flushPendingParameterSave()||state.task?.id!==id)return;
      const layer=button.dataset.materialKind==='illustration'?'background':button.dataset.materialKind,name=decodeURIComponent(button.dataset.masterMaterial);
      if(state.task.parameters?.assetByTemplate?.[state.task.masterTemplateId]?.[layer]===name){state.inspectorElement=layer;state.masterMaterialView='composite';renderTaskDetail();return;}
      const fresh=await api(`/api/tasks/${id}/community-materials/select`,{method:'POST',body:JSON.stringify({name:decodeURIComponent(button.dataset.masterMaterial),expectedUpdatedAt:state.task.updatedAt})});
      state.inspectorElement=button.dataset.materialKind==='illustration'?'background':button.dataset.materialKind;state.masterMaterialView='composite';await refreshMaterial(fresh);
    }catch(error){toast(error.message);}finally{if(button.isConnected)button.disabled=false;}
  }));
  document.querySelectorAll('[data-master-remove-material]').forEach(button=>button.addEventListener('click',async event=>{
    event.stopPropagation();button.disabled=true;const id=state.task.id;
    try{if(!await flushPendingParameterSave()||state.task?.id!==id)return;
      const fresh=await api(`/api/tasks/${id}/community-materials/remove`,{method:'POST',body:JSON.stringify({name:decodeURIComponent(button.dataset.masterRemoveMaterial),expectedUpdatedAt:state.task.updatedAt})});
      await refreshMaterial(fresh);toast('素材已从素材库移除');
    }catch(error){toast(error.message);}finally{if(button.isConnected)button.disabled=false;}
  }));
  const filter=state.masterMaterialFilter||'all';
  document.querySelectorAll('[data-master-filter]').forEach(button=>{button.classList.toggle('active',button.dataset.masterFilter===filter);button.addEventListener('click',()=>{state.masterMaterialFilter=button.dataset.masterFilter;renderTaskDetail();});});
  document.querySelectorAll('[data-master-group]').forEach(group=>{const value=group.dataset.masterGroup;group.hidden=filter!=='all'&&(filter==='text'?!['title','subtitle'].includes(value):value!==filter);});
  document.querySelectorAll('[data-master-view]').forEach(button=>{button.classList.toggle('active',button.dataset.masterView===(state.masterMaterialView||'composite'));button.addEventListener('click',()=>{state.masterMaterialView=button.dataset.masterView;document.querySelectorAll('[data-master-view]').forEach(b=>b.classList.toggle('active',b===button));redrawPreview();});});
  if(state.task.parameters?.communityArtworkByTemplate?.[state.task.masterTemplateId])document.querySelectorAll('[data-master-view]:not([data-master-view="composite"])').forEach(button=>{button.disabled=true;button.title='当前为历史整稿，先生成并选用无字插画后再分别预览';});
  const changeStage=stage=>changeCommunityWorkspaceStage(state,stage,{flush:flushPendingParameterSave,synchronize:task=>api(`/api/tasks/${task.id}/community-target-sync`,{method:'POST',body:JSON.stringify({expectedUpdatedAt:task.updatedAt})}),render:renderTaskDetail,notify:toast});
  document.querySelector('#community-back-master')?.addEventListener('click',()=>void changeStage('master'));
  document.querySelector('#community-go-sizes')?.addEventListener('click',()=>void changeStage('sizes'));
  document.querySelectorAll('[data-master-mode]').forEach(button=>button.addEventListener('click',()=>{
    state.communityComposerTaskId=state.task.id;state.communityComposerMode=button.dataset.masterMode;state.communityDesignError='';renderTaskDetail();
  }));
  document.querySelector('#community-edit-prompt')?.addEventListener('input',event=>{state.task.parameters.communityFollowupDraft=event.target.value;scheduleParamsSave();});
  const submitEdit=()=>{const prompt=document.querySelector('#community-edit-prompt')?.value.trim();if(!prompt)return;state.task.parameters.communityFollowupDraft='';void submitCommunityArtwork('concept-edit',prompt);};
  document.querySelector('#community-submit-edit')?.addEventListener('click',submitEdit);
  document.querySelector('#community-edit-prompt')?.addEventListener('keydown',event=>{if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)){event.preventDefault();submitEdit();}});
  document.querySelector('#community-target-prompt')?.addEventListener('input',event=>{(state.communityTargetDrafts ||= {})[state.task.id+':'+state.previewTemplateId]=event.target.value;});
  document.querySelector('#community-resume-target')?.addEventListener('click',async event=>{
    const button=event.currentTarget,id=state.task.id,templateId=button.dataset.templateId,runId=button.dataset.runId;button.disabled=true;
    try{
      if(!await flushPendingParameterSave()||state.task?.id!==id)return;
      const fresh=await api(`/api/tasks/${id}/community-target-resume`,{method:'POST',body:JSON.stringify({templateId,runId,expectedUpdatedAt:state.task.updatedAt})});
      if(state.task?.id!==id)return;state.task=fresh;renderTaskDetail();scheduleCommunityGenerationPoll();toast('正在处理已保存结果，无需重新生图');
    }catch(error){toast(error.message);}finally{if(button.isConnected)button.disabled=false;}
  });
  document.querySelectorAll('[data-master-version]').forEach(button=>button.addEventListener('click',()=>{const select=document.querySelector('#community-design-version');select.value=button.dataset.masterVersion;void restoreCommunityBanner();}));
  const preview=(original=false)=>{
    const dialog=document.querySelector('#master-preview-dialog'),img=document.querySelector('#master-preview-image');
    const name=state.task.parameters.assetByTemplate?.[state.task.masterTemplateId]?.background,asset=state.task.assets.find(a=>a.name===name);
    img.src=original&&asset?asset.url:renderCanvas(state.task.masterTemplate,false).toDataURL('image/png');dialog.showModal();
  };
  document.querySelector('#master-compare')?.addEventListener('click',()=>preview(true));
  document.querySelector('#master-fullscreen')?.addEventListener('click',()=>preview());
  document.querySelector('#master-preview-close')?.addEventListener('click',()=>document.querySelector('#master-preview-dialog').close());
  document.querySelector('#master-preview-dialog')?.addEventListener('click',event=>{if(event.target===event.currentTarget)event.currentTarget.close();});
  document.querySelectorAll('[data-master-zoom]').forEach(button=>button.addEventListener('click',()=>{
    state.masterPreviewZoom=button.dataset.masterZoom==='reset'?1:Math.max(.5,Math.min(2,(state.masterPreviewZoom||1)+Number(button.dataset.masterZoom)));
    document.querySelector('#preview-canvas').style.setProperty('--master-zoom',state.masterPreviewZoom);
  }));
}

function communityEditorPrimaryAction(task){
  const pending=task.templates?.filter(t=>communityArtworkTargetPending(task,t)).length||0;
  const retained=task.templates?.length&&task.templates.every(t=>communityTargetHasComposition(task,t));
  if(task.status!=='已完成'&&task.communityMasterApproval?.at&&pending)return retained?'<button class="button primary" id="editor-approve-current-suite">确认现有尺寸并输出</button>':`<button class="button primary" disabled>还有 ${pending} 张尺寸待生成</button>`;
  if(task.status==='已完成')return `<button class="button ghost" id="editor-start-revision">开始新版本</button><a class="button primary" id="editor-download-suite-link" href="/api/tasks/${task.id}/package">下载已交付版本</a>`;
  if(task.communityGeneration?.phase==='targets'&&task.communityGeneration.status==='partial')return retained?'<button class="button primary" id="editor-approve-current-suite">确认现有尺寸并输出</button>':`<button class="button primary" disabled title="先完成缺少的尺寸稿">延展未完成（${task.communityGeneration.total-task.communityGeneration.done} 张）</button>`;
  if(task.status==='草稿')return '<button class="button primary" id="editor-start-master">开始制作母稿</button>';
  if(task.status==='主图制作')return '<button class="button primary" id="approve-community-master">确认母版</button>';
  if(['批量生成','生成失败'].includes(task.status))return task.communityMasterApproval?.at
    ? `<button class="button primary" id="editor-download-materials">确认并下载整套（${task.targetTemplateIds.length} 张 ZIP）</button>${task.deliveredPackage ? `<a class="button ghost" href="/api/tasks/${task.id}/package?delivery=latest">下载上一交付版</a>` : ''}`
    : `<button class="button primary" id="approve-community-master">确认母版</button>${task.deliveredPackage ? `<a class="button ghost" href="/api/tasks/${task.id}/package?delivery=latest">下载上一交付版</a>` : ''}`;
  if(task.status==='成套审核'&&!task.communityMasterApproval?.at)return '<button class="button primary" id="approve-community-master">确认母版</button>';
  if(task.status==='成套审核'&&task.qc?.passed)return '<button class="button primary" id="editor-download-suite">成套下载并确认交付</button>';
  return '';
}

function communityWorkflow(task) {
  const delivered = task.status === '已完成' && Boolean(task.deliveredPackage);
  const approved = delivered || Boolean(task.communityMasterApproval?.at);
  const extended = delivered || Boolean(task.communityMasterApproval?.fingerprint && task.parameters?.communityAutoLayoutMasterFingerprint===task.communityMasterApproval.fingerprint) && !(task.communityGeneration?.phase === 'targets' && task.communityGeneration.status === 'partial');
  const steps = [
    ['参考与素材','调性 · 文案 · 人物',true],
    ['AI 生成母版','整稿设计与修改',Boolean(task.assets.some(asset => asset.role === 'mother-candidate'))],
    ['确认母版','锁定文案和品牌元素',approved],
    ['延展与质检','各尺寸重构与导出',extended],
  ];
  const current = !approved ? 1 : !extended ? 2 : 3;
  const errors = task.communityGeneration?.phase === 'targets' && task.communityGeneration.status === 'partial' ? task.communityGeneration.errors || [] : [];
  return `<div class="community-workflow"><div class="community-workflow-heading"><b>从参考到成套交付</b><small>先确定视觉方向和文案，再延展各资源位</small></div><div class="community-workflow-steps">${steps.map(([label,detail,done],index) => `<div class="community-workflow-step ${index===current?'active':done?'done':''}"><span>${done&&index<current?'✓':index+1}</span><div><b>${label}</b><small>${detail}</small></div></div>`).join('')}</div></div>${errors.length ? `<div class="community-extension-alert" role="alert"><b>尺寸延展仅完成 ${task.communityGeneration.done}/${task.communityGeneration.total} 张</b><span>${errors.map(esc).join('；')}</span><span>未完成尺寸暂显示母版背景；可在右侧只延展这些尺寸。</span></div>` : ''}`;
}

function projectFontControls(task) {
  const mode=state.communityComposerTaskId===task.id?state.communityComposerMode:undefined;
  if(task.parameters?.communityArtworkByTemplate?.[task.masterTemplateId] && mode!=='design')return '<section class="community-input-card"><b>整稿文案</b><p>文字与画面统一设计。修改字效或排版，请在右侧描述；需要指定公司字体时，选择「分层制作」。</p></section>';
  const fonts=projectFonts(task,state.data.projects||[]);
  const recommended = fonts.length ? '<section class="community-input-card project-font-card"><b>项目常用字体</b>'+fonts.slice(0,3).map(asset=>`<div class="project-font-item"><span>${esc(asset.name.replace(/\.(ttf|otf|woff2?)$/i,''))}</span><div class="project-font-preview" style="font-family: ${projectFontFamily(asset)}" title="字体预览">${esc(task.copy || state.data.projects.find(p=>p.id===task.projectId)?.name || '字体效果预览')}</div><div class="project-font-actions"><button type="button" class="button secondary" data-use-project-font="${encodeURIComponent(asset.name)}" ${asset.id ? `data-company-font-id="${esc(asset.id)}"` : ''} data-font-kind="title">用于主标</button><button type="button" class="button secondary" data-use-project-font="${encodeURIComponent(asset.name)}" ${asset.id ? `data-company-font-id="${esc(asset.id)}"` : ''} data-font-kind="subtitle">用于副标</button>${asset.source==='company-library' ? '' : `<a href="${esc(asset.url)}" download="${esc(asset.name)}">下载</a>`}</div></div>`).join('')+'</section>' : '';
  const library = companyFonts();
  if(!library.length)return recommended;
  const issues=state.companyFontIssues || [],issueNote=issues.map(issue=>`${issue.name}：官方下载文件待核对`).join('；');
  const selected = library.find(font=>font.id===(state.companyFontPreviewId || task.parameters?.titleFontId || task.parameters?.subtitleFontId));
  if(selected)state.companyFontPreviewId=selected.id;
  return recommended+`<section class="community-input-card project-font-card company-font-card"><div class="company-font-heading"><b>公司版权字体库</b><small title="${esc(issueNote)}">${library.length} 款${issues.length?' · '+issues.length+' 款待核对':''}</small></div><input type="search" id="company-font-search" placeholder="搜索字魂 / 字小魂字体" aria-label="搜索公司字体"><select id="company-font-select" aria-label="选择公司字体"><option value="">选择字体预览</option>${companyFontOptions(library,selected?.id)}</select><div id="company-font-preview" class="project-font-preview ${selected?'':'company-font-placeholder'}" ${selected ? `style="font-family:${projectFontFamily(selected)}"` : ''}>${esc(selected ? task.copy || '字体效果预览' : '选择后预览字体效果')}</div><div class="project-font-actions"><button type="button" class="button secondary" data-use-company-font="title" ${selected?'':'disabled'}>用于主标</button><button type="button" class="button secondary" data-use-company-font="subtitle" ${selected?'':'disabled'}>用于副标</button></div></section>`;
}

function companyFontOptions(fonts,selectedId) {
  return fonts.map(font=>`<option value="${esc(font.id)}" ${font.id===selectedId?'selected':''}>${esc(font.name)}${font.style && !['Regular','常规','常规体'].includes(font.style) ? ' · '+esc(font.style) : ''}</option>`).join('');
}

function communityReferenceInputs(task) {
  return `<div class="community-input-heading"><h3>文案与素材</h3></div><section class="community-input-card community-copy-fields"><label>最终主文案<input id="community-master-title" value="${esc(task.copy)}" placeholder="填写确认后的主文案"></label><label>最终副文案<input id="community-master-subtitle" value="${esc(task.parameters?.subtitleText || '')}" placeholder="填写确认后的副文案"></label></section>${projectFontControls(task)}<div class="community-assets-divider">可编辑素材库</div>`;
}

function communityCandidateStrip(task) {
  if(task.communityDesign?.currentVersionId){
    let preview='';try{preview=renderCanvas(task.masterTemplate,false).toDataURL('image/png');}catch{}
    const whole=Boolean(task.parameters?.communityArtworkByTemplate?.[task.masterTemplateId]);
    return `<section class="community-candidate-strip"><div class="community-candidate-intro"><b>完整母版</b><small>历史版本可在右侧恢复</small></div><div class="community-candidate-list"><button class="community-candidate selected" data-preview-template="${esc(task.masterTemplateId)}">${preview?`<img src="${preview}" alt="当前完整母版">`:''}<span><b>${whole?'当前整稿母版':'当前分层母版'}</b><small>${whole?'AI 整稿 · 独立 Logo':'背景 · 人物 · 文案 · 底板 · Logo'}</small></span></button></div></section>`;
  }
  const candidates = task.assets.filter(asset => asset.role === 'mother-candidate').slice(-8).reverse();
  const selected = task.parameters?.assetByTemplate?.[task.masterTemplateId]?.background;
  const run = task.communityGeneration;
  return `<section class="community-candidate-strip"><div class="community-candidate-intro"><b>母版候选</b><small>${run?.status==='running'&&run.phase==='master'?`画布生成中 ${run.done}/${run.total}`:'生成后先比较调性，再选用母版'}</small></div><div class="community-candidate-list">${candidates.map((asset,index) => `<button class="community-candidate ${selected===asset.name?'selected':''}" data-community-candidate="${encodeURIComponent(asset.name)}"><img src="${esc(asset.url)}" alt="母版候选"><span><b>${asset.generatorModel==='gpt-image-2'?'GPT Image':asset.generatorModel==='banana_pro'?'Nano Banana':'导入候选'} ${candidates.length-index}</b><small>${selected===asset.name?'当前母版':asset.toneIssues?.length?`调性${esc(asset.toneIssues.join('、'))} · 点击仍可选用`:'点击预览并选用'}</small></span></button>`).join('') || '<span class="community-candidate-empty">生成或导入图片后，方案会显示在这里</span>'}<label class="community-candidate-import">＋<small>导入 IMAGE 候选</small><input id="community-candidate-upload" type="file" accept="image/png,image/jpeg,image/webp" hidden></label></div></section>`;
}

function communityAiPanel(task) {
  const model = task.parameters?.communityImageModel || 'banana_pro';
  const run = task.communityGeneration;
  const running = run?.status === 'running';
  const hasTargetBackgrounds = task.assets.some(asset => asset.role === 'generated-background' && asset.sourceTemplateId !== task.masterTemplateId);
  const stages={preparing:'准备素材',direction:'设计完整画面',background:'整理独立背景','title-material':'设计版权字形效果','subtitle-backing':'设计副标底板',ready:'完成'};
  const status = running ? run.phase==='artwork'?run.mode==='adapt'?'正在按母版重新组织当前尺寸…':'正在统一设计完整画面与文案…':run.phase==='compose'?`${stages[run.stage] || '处理母版'}…`:`${run.phase==='master'?'母版生成':run.phase==='background'?'背景重做':run.phase==='typography'?'文案重做':'尺寸延展'}中：${run.done}/${run.total}`
    : run?.status === 'partial' || run?.status === 'failed' || run?.status === 'interrupted' ? (run.errors?.[0] || run.error || '生成中断')
    : run?.status === 'done' ? run.mode==='adapt'?'当前尺寸试稿已生成，请检查画面':['compose','artwork'].includes(run.phase)?'母版已更新，请检查后确认':`已完成 ${run.done}/${run.total} 张` : run?.status==='candidate-ready'?'整稿方案已保留，可预览后应用':'';
  const mode=state.communityComposerTaskId===task.id?state.communityComposerMode:undefined;
  const active=task.templates.find(t=>t.id===state.previewTemplateId),canAdapt=Boolean(task.parameters?.communityArtworkByTemplate?.[task.masterTemplateId] && active && active.id!==task.masterTemplateId);
  const adaptButton=canAdapt?`<button type="button" class="button secondary full-button" id="community-adapt-current" data-template-id="${esc(active.id)}" ${running||state.communityGenerationSubmitting?'disabled':''}>${communityArtworkTargetPending(task,active)?'生成当前尺寸试稿':'重新排版当前尺寸'} · ${active.width}×${active.height}</button>`:'';
  return `<div class="community-ai-panel"><div class="community-ai-head"><h3>AI 创作</h3></div><section class="community-composer-section">${renderCommunityComposer(task,{model,disabled:running||state.communityGenerationSubmitting,running,mode,activeTemplate:active,error:state.communityComposerTaskId===task.id?state.communityDesignError || '':'',uploading:Boolean(state.communityInputUploads)})}${adaptButton}<button type="button" class="button secondary community-extend-button" id="community-generate-targets" ${running||!task.communityMasterApproval?.at||!state.data.aiHuabu?.enabled?'disabled':''}>${running&&run.phase==='targets'?'正在延展其它尺寸…':(run?.phase==='targets'&&run.status==='partial'?`↻ 重试未完成尺寸（${run.total-run.done} 张）`:'✦ 按确认母版一键延展其它尺寸')}</button>${status?`<div class="community-generation-status" role="status">${esc(status)}</div>`:''}</section></div>`;
}

function installCustomEditorTemplate(task){const templates=[...(task?.templates||[]).filter(t=>t.customTarget),...(task?.customCanvas?[customCanvasTemplate(task.customCanvas)]:[]),...(task?.masterTemplate?.sourceMaster?[task.masterTemplate]:[])];for(const template of templates){const i=state.data.templates.findIndex(t=>t.id===template.id);if(i<0)state.data.templates.push(template);else state.data.templates[i]=template;}}
function renderSourceTaskDetail(){
 state.sourceWorkspaceCleanup?.();state.sourceWorkspaceCleanup=null;
 const task=state.task,stage='sizes';state.communityWorkspaceStage='sizes';
 if(!task.targetTemplateIds.includes(state.previewTemplateId))state.previewTemplateId=task.targetTemplateIds[0];
 const template=state.data.templates.find(t=>t.id===state.previewTemplateId)||task.masterTemplate;
 title.textContent=task.project;content.innerHTML=renderSourceWorkspace(task,{template,stage,project:state.data.projects?.find(p=>p.id===task.projectId),selectedId:state.sourceSelectedId,dialogs:editorAddSizeDialog(task)});
 bindTargetSizeDialog(content.querySelector('#add-size-dialog'));
 state.sourceWorkspaceCleanup=mountSourceWorkspace({root:content,task,template,project:state.data.projects?.find(p=>p.id===task.projectId),images:state.assetImages,selectedId:state.sourceSelectedId,api,select:id=>state.sourceSelectedId=id,
  home:()=>{state.task=null;state.view='home';render();},download:downloadCurrentArtifact,suite:downloadMaterialPackage,upload:uploadAssets,importFolder:importKvPack,addSizes:addTargetSizes,removeSize:removeTargetSize,
  updated:async(saved,options={})=>{if(state.task?.id!==saved.id)return;state.task=saved;installCustomEditorTemplate(saved);if(options.stage)state.communityWorkspaceStage=options.stage;if(options.templateId)state.previewTemplateId=options.templateId;Object.assign(state,await loadEditorImages(saved,loadImage));await loadProjectFonts(saved,state.data.projects||[]);if(options.render!==false)renderTaskDetail();}
 });
}
function renderTaskDetail() {
  state.stopSizeMaterials?.();state.stopSizeMaterials=null;state.stopPopupComposer?.();state.stopPopupComposer=null;
  installCustomEditorTemplate(state.task);
  const task = state.task;
  if(isSourceAdaptation(task)&&(!(task.status==='已完成'&&task.deliveredPackage)||task.sourceAdaptation)){renderSourceTaskDetail();return;}
  const communityBatch = task.templates.some(template => template.communityPlacement);
  const communityProject = communityBatch ? state.data.projects.find(project => project.id === task.projectId) : null;
  ensureEditorHistory();
  const modern=Boolean(task.masterTemplate?.communityMaster),sizeStage=modern&&!task.customCanvas&&state.communityWorkspaceStage==='sizes';
  if(modern&&!sizeStage)state.previewTemplateId=task.masterTemplateId;
  if(sizeStage&&!task.targetTemplateIds.includes(state.previewTemplateId))state.previewTemplateId=task.targetTemplateIds[0];
  const activeTemplate = state.data.templates.find((item) => item.id === state.previewTemplateId) || task.masterTemplate;
  if(!templateAllowsElement(task,activeTemplate,state.inspectorElement))state.inspectorElement='background';
  const activeBackground = getTemplateBackground(task, activeTemplate);
  title.textContent = task.project;
  if(!modern)content.innerHTML = `<div class="production-editor ${communityBatch?'community-editor':''} ${communityBatch&&task.status==='已完成'&&task.deliveredPackage?'delivered-editor':''}">
    <header class="production-editor-header"><div class="editor-title"><button id="back-dashboard" aria-label="返回">←</button><h2>${esc(task.project)}</h2><span class="status" data-status="${task.status}">${task.status}</span></div><div class="editor-header-actions"><button class="button ghost" id="editor-download-single">单张下载</button>${!communityBatch && task.status !== "已完成" && !(task.status === "成套审核" && task.qc?.passed) ? `<button class="button ghost" id="editor-download-materials">下载当前素材包</button>` : ""}${communityBatch ? communityEditorPrimaryAction(task) : isElementEffectOutputStale(task) && ["成套审核","已完成"].includes(task.status) ? `<button class="button primary" id="editor-regenerate-suite">重新生成成套</button>` : task.status === "成套审核" && task.qc?.passed ? `<button class="button primary" id="editor-download-suite">确认交付并成套下载</button>` : task.status === "已完成" ? `<a class="button primary" id="editor-download-suite-link" href="/api/tasks/${task.id}/package">成套下载</a>` : `<button class="button primary" id="editor-submit-review">提交审核</button>`}</div></header>
    ${communityBatch ? communityWorkflow(task) : ''}
    ${communityBatch && task.status==='已完成' && task.deliveredPackage ? '<div class="community-delivered-note">此版已完成交付。需要继续修改时，请先点击右上角「开始新版本」。</div>' : ''}
    <div class="production-editor-grid">
      <aside class="editor-assets-panel">${communityBatch?communityReferenceInputs(task):'<div class="editor-panel-title"><h3>素材库</h3></div>'}<div class="asset-search editor-asset-search"><span aria-hidden="true">⌕</span><input id="editor-asset-search" placeholder="搜索素材" value="${esc(state.editorAssetQuery)}"/><select id="editor-asset-filter" aria-label="筛选素材分类">${["全部","背景","核心人物","次要人物","前景装饰","主标","副标","Logo","IP版权","按钮","补充素材"].map((name) => `<option value="${name}" ${state.editorAssetFilter === name ? "selected" : ""}>${name}</option>`).join("")}</select></div>${editorAssetLibrary(task)}<input id="asset-role" type="hidden" value="supplement"><input id="asset-upload" type="file" multiple accept="image/png,image/jpeg,image/webp,.psd,.psb" hidden /><button class="button secondary full-button" id="import-kv-pack">导入本地KV素材包</button></aside>
      <main class="editor-workspace">${communityBatch?`<div class="community-canvas-heading"><b>母版画布</b><span>${esc(activeTemplate.name)}</span><small>${activeTemplate.width}×${activeTemplate.height} · ${activeTemplate.format} · ≤${Math.round(activeTemplate.maxBytes/1048576)}MB</small></div>`:''}<div class="editor-commandbar"><div><button type="button" id="editor-undo" title="撤销本次打开任务后的位置或缩放调整" ${state.editorHistory?.undo.length ? "" : "disabled"}>↶ 撤销调整</button><button type="button" id="editor-redo" title="重做位置或缩放调整" ${state.editorHistory?.redo.length ? "" : "disabled"}>↷ 重做调整</button><button type="button" id="editor-align-center" title="将当前图层在画布中水平居中">⌖ 水平居中</button><button type="button" id="editor-toggle-guides" aria-pressed="${state.showGuides}">↕ ${state.showGuides ? "隐藏参考线" : "显示参考线"}</button></div><div>${communityBatch ? '' : '<button class="ai-tool" id="editor-auto-layout" title="按 PSD 规则重新套用各尺寸版式，可能覆盖手工调整">✦ 自动套用全部尺寸</button>'}<button class="ai-tool ${activeBackground.url ? "active" : ""}" id="editor-smart-expand" ${state.task.outpaint?.status === "running" ? "disabled" : ""}>${activeBackground.url ? "↻ 重新扩图" : state.task.outpaint?.status === "running" ? "⏳ 扩图中…" : "✣ 智能扩图"}</button>${communityBatch ? '' : '<button class="ai-tool" id="editor-import-expand">⇪ 导入扩图候选</button><input id="editor-import-expand-file" type="file" accept="image/png,image/jpeg" hidden>'}<button class="ai-tool" id="editor-character-cutout">✂ 人物抠图</button><button class="ai-tool" id="editor-background-repair">▧ 背景修补</button>${communityBatch ? '' : '<button class="ai-tool" id="editor-layout-advice">✣ 构图建议</button>'}</div></div><div class="editor-canvas-shell"><div class="editor-stage prototype-stage" id="editor-drop-stage"><canvas id="preview-canvas" class="annotation-canvas" tabindex="0"></canvas><div class="editor-empty" id="preview-empty"><b>上传或拖入一张干净KV</b>主标、副标、Logo、IP标识和按钮也可以直接从左侧拖到画布。</div></div><div class="canvas-zoom"><button id="canvas-select-tool" class="active" title="拖动画面中的元素">☝</button><button id="canvas-scale-down" title="缩小当前元素">−</button><b id="canvas-scale-label">${selectedScalePercent(task)}%</b><button id="canvas-scale-up" title="放大当前元素">＋</button><button id="canvas-scale-reset" title="恢复当前元素默认大小">⛶</button></div></div>${communityBatch?communityCandidateStrip(task):''}${editorTargetDock(task)}</main>
      <aside class="editor-inspector-panel">${communityBatch?`<div class="community-side-tabs"><button data-community-side="ai" class="${state.communitySideTab==='ai'?'active':''}">AI 生成</button><button data-community-side="elements" class="${state.communitySideTab==='elements'?'active':''}">元素属性</button></div><div class="community-side-content" ${state.communitySideTab==='ai'?'':'hidden'}>${communityAiPanel(task)}</div><div class="community-side-content" ${state.communitySideTab==='elements'?'':'hidden'}>${editorInspector(task)}<button type="button" class="button secondary full-button" id="editor-auto-layout">重排其它尺寸的人物与文案</button></div>`:editorInspector(task)}</aside>
    </div>
    ${editorAddSizeDialog(task)}
    ${characterCutoutDialog(task)}
  </div>`;
  else{
    const running=task.communityGeneration?.status==='running'||task.outpaint?.status==='running'||task.communityObjectJob?.status==='running'||state.communityGenerationSubmitting;
    const canvas=`<div class="editor-canvas-shell"><div class="editor-stage prototype-stage" id="editor-drop-stage"><canvas id="preview-canvas" tabindex="0"></canvas><div class="editor-empty" id="preview-empty"><b>${task.customCanvas?'开始设计你的画布':'开始设计你的母版'}</b>在右侧粘贴参考图，分别生成插画和文案。</div></div></div>`;
    const mode=state.communityComposerTaskId===task.id?state.communityComposerMode:task.parameters?.communityArtworkByTemplate?.[task.masterTemplateId]?'concept-edit':'concept';
    const ai=sizeStage&&isCommunityPopup(activeTemplate)?renderPopupPanel(task,activeTemplate,{disabled:running||Boolean(task.status==='已完成'&&task.deliveredPackage),draft:state.popupDrafts?.[task.id],preview:state.popupPreview||'checker'}):sizeStage?`<div class="master-ai-heading"><h3>尺寸延展</h3></div><div class="master-target-size"><b>${activeTemplate.width} × ${activeTemplate.height}</b><span>${esc(activeTemplate.name)}</span></div><textarea id="community-target-prompt" rows="5" placeholder="选填：描述当前尺寸的构图调整">${esc(state.communityTargetDrafts?.[task.id+':'+activeTemplate.id])}</textarea><button id="community-adapt-current" data-template-id="${activeTemplate.id}" class="button primary full-button" ${running?'disabled':''}>${communityArtworkTargetPending(task,activeTemplate)?'生成当前尺寸':'重新排版当前尺寸'}</button><button id="community-generate-targets" class="button secondary full-button" ${running||!task.communityMasterApproval?.at||!task.templates.some(t=>communityArtworkTargetPending(task,t))?'disabled':''}>${running?'正在延展…':task.templates.some(t=>communityArtworkTargetPending(task,t))?'同步并延展待更新尺寸':'全部尺寸已同步'}</button>${task.communityGeneration?.workflow==='layered-reflow-v1'||task.communityTargetSync?communityExtensionProgress(task,activeTemplate):`<p class="master-ai-status" role="status">${task.communityGeneration?.status==='running'?`正在处理 ${task.communityGeneration.done}/${task.communityGeneration.total}`:['partial','failed','interrupted'].includes(task.communityGeneration?.status)?esc(task.communityGeneration.error||task.communityGeneration.errors?.[0]||'部分尺寸尚未完成'):''}</p>`}`:renderMasterAi(task,{mode,fonts:companyFonts(),disabled:running||!state.data.aiHuabu?.enabled,error:state.communityComposerTaskId===task.id?state.communityDesignError:''});
    const panelScroll=[...content.querySelectorAll('.editor-assets-panel,.editor-inspector-panel')].map(e=>e.scrollTop);
    const objectInspector=!sizeStage?renderCommunityObjectInspector(task,state):'';
    content.innerHTML=renderMasterWorkspace(task,{stage:sizeStage?'sizes':'master',canvas,inputs:renderMasterInputs(task),ai:objectInspector||(!sizeStage?renderCommunityObjectTabs():'')+ai,dock:sizeStage?editorTargetDock(task):'',inspector:editorInspector(task),actions:communityEditorPrimaryAction(task),dialogs:(task.customCanvas?'':editorAddSizeDialog(task))+characterCutoutDialog(task),running,canExtend:Boolean(task.communityMasterApproval?.at),propertiesOpen:state.masterPropertiesOpen!==false});
    [...content.querySelectorAll('.editor-assets-panel,.editor-inspector-panel')].forEach((e,i)=>e.scrollTop=panelScroll[i]||0);
    if(!sizeStage&&activeBackground.fit==='contain'){const badge=document.createElement('span');badge.textContent='历史母版';badge.title='保留旧稿原有比例；新生成或导入的素材使用当前画布比例';badge.className='master-legacy-badge';content.querySelector('.community-canvas-heading>small')?.after(badge);}
    if(sizeStage){const sidebar=content.querySelector('.editor-assets-panel');sidebar.insertAdjacentHTML('beforeend',renderSizeMaterials(task,activeTemplate,{disabled:running||Boolean(task.status==='已完成'&&task.deliveredPackage)}));content.insertAdjacentHTML('beforeend',sourceMaterialDialog(state.data.projects?.find(p=>p.id===task.projectId)));const heading=content.querySelector('.community-canvas-heading');heading.querySelector('b').after(Object.assign(document.createElement('span'),{textContent:`${activeTemplate.width} × ${activeTemplate.height}`}));}
  }
  const scaleLabel = document.querySelector("#canvas-scale-label");
  const heading=content.querySelector('.community-canvas-heading>b');if(heading)heading.textContent=task.customCanvas?'画布':activeTemplate.id===task.masterTemplateId?'母版画布':'尺寸画布';
  if(communityArtworkTargetPending(task,activeTemplate)){
    const notice=document.createElement('div');notice.className='community-size-pending';notice.id='community-size-pending';const retained=communityTargetHasComposition(task,activeTemplate);notice.textContent=retained?'母版已更新，已保留此尺寸上次的背景、构图与手动调整。确认母版后优先本地同步图层。':'此尺寸尚未重排，当前显示完整母版参考。可在右侧生成当前尺寸试稿。';
    notice.style.cssText='position:absolute;top:12px;left:12px;right:12px;z-index:4;padding:10px 12px;border:1px solid #ded8ff;border-radius:10px;background:#f5f2ff;color:#6651ca;font-size:12px;line-height:1.5;pointer-events:none';
    content.querySelector('.editor-canvas-shell').prepend(notice);
    const download=content.querySelector('#editor-download-single');download.disabled=!retained;download.title=retained?'当前显示上次尺寸稿，可下载保留版本':'先生成当前尺寸试稿，再下载成稿';
    if(!retained)content.querySelectorAll('.canvas-zoom button,#editor-smart-expand,#editor-background-repair,#editor-character-cutout,#editor-align-center').forEach(button=>button.disabled=true);
    if(!retained)content.querySelector('#preview-canvas').style.pointerEvents='none';
  }
  if (scaleLabel) scaleLabel.textContent = selectedScaleDescription(task);
  wireDetailEvents();
  if(modern)wireMasterWorkspaceEvents();
  if(modern&&sizeStage){state.stopSizeMaterials?.();state.stopSizeMaterials=mountSizeMaterials({root:content,task,template:activeTemplate,api,isBusy:()=>['communityGeneration','communityObjectJob','outpaint'].some(k=>state.task?.[k]?.status==='running'),flush:async()=>await flushPendingParameterSave()?state.task:null,select:id=>{state.communityObjectCanvasSelectedId=id;document.querySelector('#preview-canvas')?.focus({preventScroll:true});redrawPreview();},updated:async saved=>{if(state.task?.id!==saved.id)return;state.task=saved;state.editorHistory=null;Object.assign(state,await loadEditorImages(saved,loadImage));await loadCommunityObjectLayerImages(saved,loadImage,state.assetImages);renderTaskDetail();toast('素材已加入当前尺寸');}});}
  if(isCommunityPopup(activeTemplate)){
    if(!modern){const panel=content.querySelector('.editor-inspector-panel');panel.insertAdjacentHTML('afterbegin',renderPopupPanel(task,activeTemplate,{disabled:Boolean(task.status==='已完成'&&task.deliveredPackage),draft:state.popupDrafts?.[task.id],preview:state.popupPreview||'checker'}));}
    const preview=mode=>{state.popupPreview=mode;const stage=content.querySelector('#editor-drop-stage');stage?.classList.toggle('popup-transparent',Boolean(popupConfig(state.task,activeTemplate)));if(stage)stage.dataset.popupPreview=mode;};preview(state.popupPreview||'checker');
    state.stopPopupComposer?.();state.stopPopupComposer=mountPopupPanel({root:content,task,api,getButtonImage:c=>state.assetImages.get(c.buttonBackingAsset),textSelected:()=>state.popupTextSelectedKey===`${task.id}:${activeTemplate.id}`,onTextSelect:selected=>{state.popupTextSelectedKey=selected?`${task.id}:${activeTemplate.id}`:null;if(selected){state.inspectorElement='background';state.communityObjectCanvasSelectedId=null;}redrawPreview();},onGeneration:scheduleCommunityGenerationPoll,flush:async()=>await flushPendingParameterSave()?state.task:null,resolveAsset:(current,source,kind)=>selectedAssetName(current,current.templates?.find(t=>t.id===source)||current.masterTemplate,kind),onPreview:preview,onDraft:draft=>{(state.popupDrafts||={})[task.id]=draft;redrawPreview();},updated:async saved=>{if(state.task?.id!==saved.id)return;state.task=saved;state.editorHistory=null;Object.assign(state,await loadEditorImages(saved,loadImage));await loadProjectFonts(saved,state.data.projects||[]);renderTaskDetail();},});
  }
  if(communityBatch && (task.communityGeneration?.status==='running' || task.outpaint?.status==='running')) {
    for(const control of document.querySelectorAll('#approve-community-master,#editor-auto-layout')){control.disabled=true;control.title='生成尚未结束，请等待所有图层完成';}
  }
  if (communityBatch && task.status === "已完成" && task.deliveredPackage) {
    disableDeliveredEditing(document,{modern});
  }
  redrawPreview();
  requestAnimationFrame(() => {
    const card=document.querySelector('.target-size-card[aria-pressed="true"]');
    const list=card?.closest('.target-size-list');
    if(card&&list)list.scrollLeft=card.offsetLeft-list.offsetLeft-(list.clientWidth-card.clientWidth)/2;
  });
}

function targetThumbnail(canvas) {
  const thumbnail=document.createElement('canvas');
  thumbnail.width=Math.min(200,canvas.width);thumbnail.height=Math.max(1,Math.round(canvas.height*thumbnail.width/canvas.width));
  thumbnail.getContext('2d').drawImage(canvas,0,0,thumbnail.width,thumbnail.height);
  return thumbnail.toDataURL('image/png');
}

function editorTargetDock(task) {
  const selected = state.previewTemplateId;
  const community = task.templates.some(template => template.communityPlacement);
  const layoutStatus = "已自动继承当前画布元素";
  const failedNames = task.communityGeneration?.phase === 'targets' && task.communityGeneration.status === 'partial' ? (task.communityGeneration.errors || []).map(error => error.split('：')[0]) : [];
  return `<section class="target-size-dock"><div class="target-size-head"><h3>目标尺寸（${task.templates.length}）</h3>${community ? '' : `<span>${layoutStatus}</span>`}</div><div class="target-size-list-wrap"><button type="button" class="target-size-edge target-size-edge-left" data-target-scroll="-1" aria-label="向左浏览目标尺寸">‹</button><div class="target-size-list" tabindex="0" aria-label="目标尺寸，支持左右方向键浏览">${task.templates.map((template) => {
    const artifact = task.artifacts?.find((item) => item.templateId === template.id);
    const background = getTemplateBackground(task, template);
    const selectedBackground = selectedAssetName(task, template, "background");
    const source = task.assets.find((asset) => asset.name === selectedBackground && isRenderableImageAsset(asset))?.url;
    let preview = artifact?.url || background.url || source || state.sourceAsset?.url || "";
    if(template.communityPlacement){try{preview=targetThumbnail(renderCanvas(template,false));}catch{}}
    const active = template.id === selected;
    const failed = failedNames.includes(template.name);
    const pending = communityArtworkTargetPending(task,template) || failed && task.communityGeneration.errors.some(error=>error.startsWith(`${template.name}：`)&&error.includes('待按确认母版延展'));
    return `<div class="target-size-item"><button class="target-size-card ${active ? "active" : ""} ${failed ? 'extension-failed' : ''}" data-preview-template="${template.id}" aria-pressed="${active}"><span class="target-thumb" style="aspect-ratio:${template.width}/${template.height}">${preview ? `<img src="${preview}" alt=""/>` : ""}${active ? `<i class="target-selected-mark">✓ 当前</i>` : ""}</span><b>${template.width}×${template.height}</b><small>${pending?'待重排 · ':failed?'⚠ 延展失败 · ':''}${esc(template.name.replace(/^.*?-/, ""))}</small></button>${targetSizeRemoveButton(task,template)}</div>`;
  }).join("")}<button class="target-size-card target-add" id="editor-add-size"><span>＋</span><b>添加尺寸</b></button></div><button type="button" class="target-size-edge target-size-edge-right" data-target-scroll="1" aria-label="向右浏览目标尺寸">›</button></div></section>`;
}

function editorAssetLibrary(task) {
  const imageAssets = task.assets.filter(isRenderableImageAsset).filter(a=>!task.recycledAssetUrls?.includes(a.url));
  const derived = task.localAi?.outputs || [];
  const groups = [
    ["背景", imageAssets.filter((item) => ["clean-kv","background","background-landscape","background-portrait","mother-candidate","generated-background"].includes(item.role)), "clean-kv"],
    ["核心人物", [...imageAssets.filter((item) => ["character","core-character"].includes(item.role)), ...derived.filter(isProductionForeground).map((item) => ({ ...item, derived: true }))], "character"],
    ["前景装饰", imageAssets.filter((item) => item.role === "foreground"), "foreground"],
    ["次要人物", [...imageAssets.filter((item) => item.role === "secondary-character"), ...derived.filter((item) => /次要|secondary/i.test(item.name))], "secondary-character"],
    ["主标", imageAssets.filter((item) => item.role === "title"), "title"],
    ["副标", imageAssets.filter((item) => item.role === "subtitle"), "subtitle"],
    ["Logo", imageAssets.filter((item) => item.role === "logo"), "logo"],
    ["IP版权", imageAssets.filter((item) => ["copyright","ip-copyright"].includes(item.role)), "ip-copyright"],
    ["按钮", imageAssets.filter((item) => item.role === "button"), "button"],
    ["补充素材", imageAssets.filter((item) => item.role === "supplement"), "supplement"],
  ];
  const template = state.data.templates.find((item) => item.id === state.previewTemplateId) || task.masterTemplate;
  return groups.map(([name,items,kind,isDerived]) => {
    const role = isDerived ? "supplement" : kind;
    const selectedName = selectedAssetName(task, template, role);
    const orderedItems = [...items].sort((a, b) => Number(b.name === selectedName) - Number(a.name === selectedName) || String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
    return `<section class="editor-asset-group" data-editor-asset-group="${name}"><div><b>${name}</b><span>⌄</span></div><div class="editor-asset-thumbs">${orderedItems.map((item) => {
    const selected = selectedAssetName(task, template, role) === item.name || (role === "character" && templateAllowsElement(task,template,"character2") && selectedAssetName(task,template,"character2") === item.name);
    return `<span class="editor-asset-wrap" data-editor-asset-name="${esc(item.name.toLowerCase())}"><button class="editor-asset-thumb ${selected ? "selected" : ""}" draggable="true" data-canvas-asset="${encodeURIComponent(item.name)}" data-canvas-role="${role}" data-apply-asset="${encodeURIComponent(item.name)}"><img src="${item.url}" draggable="false" alt="${esc(item.name)}" title="拖到画布使用：${esc(item.name)}"/><span class="asset-drag-hint">拖入</span></button>${item.needsCutout ? `<button type="button" class="editor-asset-cutout" data-cutout-asset="${encodeURIComponent(item.name)}" title="人物素材仍带背景，点击抠图">待抠图</button>` : ''}${isDerived || item.derived ? "" : `<button class="editor-asset-delete" data-delete-asset="${encodeURIComponent(item.name)}" title="删除素材“${esc(item.name)}”">×</button>`}</span>`;
  }).join("")}<button class="editor-asset-add" data-upload-kind="${kind}">＋</button></div></section>`;
  }).join("") + editorSourceDocuments(task);
}

function editorSourceDocuments(task) {
  const sources = task.assets.filter(asset => /\.ps[db]$/i.test(asset.name));
  const characterSources = task.assets.filter(asset => asset.role === 'source-character');
  const archived = characterSources.length ? `<details class="editor-asset-group editor-character-sources"><summary>人物源文件（${characterSources.length}）</summary>${characterSources.map(asset => `<div class="editor-source-document"><a href="${esc(asset.url)}" download>${esc(asset.name)}</a></div>`).join('')}</details>` : '';
  return (sources.length ? `<section class="editor-asset-group"><b>PSD / PSB 源文件</b>${sources.map(asset => `<div class="editor-source-document"><a href="${esc(asset.url)}" download>${esc(asset.name)}</a><small>${asset.psdExtraction?.status === 'done' ? `已提取 ${asset.psdExtraction.count} 个图层素材` : esc(asset.psdExtraction?.error || '可提取原始角色图层')}</small><button type="button" class="button secondary" data-extract-psd="${encodeURIComponent(asset.name)}">${asset.psdExtraction?.status === 'done' ? '重新提取角色' : '提取角色'}</button></div>`).join('')}</section>` : '') + archived;
}

function editorAddSizeDialog(task) {
  const available = state.data.templates.filter((template) => !template.communityMaster&&!template.customTarget&&template.businessLineId === task.businessLineId && (task.segmentIds?.includes(template.segmentId) || template.segmentId === task.segmentId) && !task.targetTemplateIds.includes(template.id));
  return renderTargetSizeDialog(available,{allowCustom:Boolean(task.masterTemplate?.communityPlacement)});
}

const MAX_ELEMENT_SCALE = 500;
const MAX_BACKGROUND_SCALE = 250;
const EFFECT_ELEMENT_KINDS = new Set(["title", "subtitle", "logo", "ip-copyright", "button"]);
function isElementEffectOutputStale(task) {
  const edited=Date.parse(task.parameters?.elementEffectsUpdatedAt||"");
  const generated=Date.parse(task.qc?.checkedAt||"");
  return Boolean(task.artifacts?.length && Number.isFinite(edited) && (!Number.isFinite(generated) || edited>generated));
}

function updateEditorPackageAction() {
  if (!isElementEffectOutputStale(state.task) || !["成套审核","已完成"].includes(state.task.status)) return;
  const current=document.querySelector("#editor-download-suite,#editor-download-suite-link");
  if (!current) return;
  current.outerHTML='<button class="button primary" id="editor-regenerate-suite">重新生成成套</button>';
  document.querySelector("#editor-regenerate-suite")?.addEventListener("click", event => renderArtifacts(false,event.currentTarget));
}

function nativeCopyValue(task,template,kind) {
  if(!template?.communityPlacement || !templateAllowsElement(task,template,kind) || selectedAssetName(task,template,kind))return '';
  const popupText=isCommunityPopup(template)&&task.parameters?.communityPopupNativeByTemplate?.[template.id]?.[kind];if(popupText)return popupText.text;
  if(kind==='title')return String(task.copy || '').trim();
  if(kind==='subtitle')return String(task.parameters?.subtitleText || '').trim();
  if(kind==='ip-copyright')return String(state.data.projects?.find(project=>project.id===task.projectId)?.copyrightNotice || '©YUEWEN').trim();
  return '';
}

function nativeCopyOptions(task,template,kind) {
  const popupText=isCommunityPopup(template)&&task.parameters?.communityPopupNativeByTemplate?.[template.id]?.[kind];
  const fontTask=popupText?{...task,parameters:{...task.parameters,[kind+'FontId']:popupText.fontId,[kind+'FontAsset']:popupText.fontAsset}}:task;
  const customFont=selectedProjectFont(fontTask,state.data.projects||[],kind);
  return {text:nativeCopyValue(task,template,kind),rect:getElementLayout(task,template,kind),fill:getElementLayout(task,template,kind).textColor,kind,
    fontFamily:customFont?projectFontFamily(customFont):'"Microsoft YaHei",sans-serif',fontWeight:customFont||kind==='ip-copyright'?400:900,
    preferred:kind==='title'?Math.min(template.width*.085,template.height*.21):kind==='subtitle'?Math.min(template.width*.033,template.height*.1):Math.min(template.width*.018,template.height*.055)};
}

function editableElementEffects(layout,template,kind) {
  if(layout.effects===undefined && nativeCopyValue(state.task,template,kind)) {
    const ctx=document.createElement('canvas').getContext('2d');
    return defaultNativeCopyEffects(measureNativeCopy(ctx,nativeCopyOptions(state.task,template,kind)).fontSize);
  }
  return normalizeElementEffects(layout.effects);
}

function editorEffectControls(layout,template,kind) {
  const { stroke, shadow } = editableElementEffects(layout,template,kind);
  const input = (group, field, value, options = "") => `<input data-effect-field="${group}.${field}" value="${typeof value==='number'?Math.round(value*100)/100:value}" ${options} ${!{stroke,shadow}[group].enabled ? "disabled" : ""}>`;
  return `<section class="element-effects"><h4>描边与投影</h4><p>效果跟随文字或素材轮廓，按当前尺寸单独保存。</p>
    <div class="element-effect-card ${stroke.enabled ? "enabled" : ""}" data-effect-group="stroke"><label class="element-effect-toggle"><input type="checkbox" data-effect-field="stroke.enabled" ${stroke.enabled ? "checked" : ""}><b>描边</b></label><div class="element-effect-fields"><label>颜色 ${input("stroke","color",stroke.color,'type="color"')}</label><label>粗细 ${input("stroke","width",stroke.width,'type="number" min="1" max="30" step="0.1"')}</label></div></div>
    <div class="element-effect-card ${shadow.enabled ? "enabled" : ""}" data-effect-group="shadow"><label class="element-effect-toggle"><input type="checkbox" data-effect-field="shadow.enabled" ${shadow.enabled ? "checked" : ""}><b>投影</b></label><div class="element-effect-fields"><label>颜色 ${input("shadow","color",shadow.color,'type="color"')}</label><label>不透明度 ${input("shadow","opacity",shadow.opacity,'type="number" min="0" max="100"')}</label><label>模糊 ${input("shadow","blur",shadow.blur,'type="number" min="0" max="80"')}</label><label>水平偏移 ${input("shadow","offsetX",shadow.offsetX,'type="number" min="-100" max="100"')}</label><label>垂直偏移 ${input("shadow","offsetY",shadow.offsetY,'type="number" min="-100" max="100"')}</label></div></div>
  </section>`;
}

function subtitleBackingControls(task,template,kind,layout) {
  if(!template.communityPlacement)return '';
  const existing=task.parameters?.layoutByTemplate?.[template.id]?.['subtitle-backing'];
  if(kind==='subtitle')return `<section class="subtitle-backing-controls"><h4>副标承托</h4><button type="button" class="button secondary full-button" id="add-subtitle-backing">${existing?.backing?.enabled?'编辑副标承托':'添加简洁承托区域'}</button></section>`;
  if(kind!=='subtitle-backing')return '';
  const backing=normalizeSubtitleBacking(layout.backing);
  if(backing.assetName)return `<section class="subtitle-backing-controls"><h4>AI 副标底板</h4><p>底板为独立图层，可移动、缩放。回到 AI 创作输入“副标底板改成纸质题签”等要求即可重新设计。</p><div class="subtitle-backing-fields"><label>不透明度<input type="number" min="0" max="100" data-backing-field="opacity" value="${backing.opacity}"></label></div><button type="button" class="button ghost full-button" id="remove-subtitle-backing">移除承托区域</button></section>`;
  return `<section class="subtitle-backing-controls"><h4>承托样式</h4><div class="subtitle-backing-fields"><label>形状<select data-backing-field="shape"><option value="round-rect" ${backing.shape==='round-rect'?'selected':''}>圆角</option><option value="capsule" ${backing.shape==='capsule'?'selected':''}>胶囊</option><option value="rect" ${backing.shape==='rect'?'selected':''}>矩形</option></select></label><label>颜色<input type="color" data-backing-field="fill" value="${backing.fill}"></label><label>不透明度<input type="number" min="0" max="100" data-backing-field="opacity" value="${backing.opacity}"></label><label>圆角<input type="number" min="0" max="1000" data-backing-field="radius" value="${backing.radius}" ${backing.shape==='round-rect'?'':'disabled'}></label></div><button type="button" class="button ghost full-button" id="remove-subtitle-backing">移除承托区域</button></section>`;
}

function editorInspector(task) {
  const compact=task.masterTemplate?.communityMaster;
  const template = state.data.templates.find((item) => item.id === state.previewTemplateId) || task.masterTemplate;
  if (!template) return `<aside class="editor-inspector-panel"><div class="inspector-resource"><h3>资源位与规范</h3></div></aside>`;
  const rule = state.data.resourceRules?.find((item) => item.templateId === template.id);
  const artifact = task.artifacts?.find((item) => item.templateId === template.id);
  const technicalPassed = artifact?.qc?.passed === true;
  const requestedKind = state.inspectorElement;
  const kind = templateAllowsElement(task, template, requestedKind) ? requestedKind : "background";
  const layout = kind === "background" ? null : getElementLayout(task, template, kind);
  const background = getTemplateBackground(task, template);
  const elementLabel = ({background:"背景",character:"角色 1",character2:"角色 2",foreground:"前景",title:"主标",subtitle:"副标","subtitle-backing":"副标承托",logo:"Logo","ip-copyright":"IP版权",button:"按钮"})[kind] || "元素";
  const tab = (value, label) => { const allowed = templateAllowsElement(task, template, value); const unavailable = template.communityPlacement ? (value === 'logo' ? '本尺寸规定无游戏品牌 Logo' : value === 'ip-copyright' ? '本尺寸或当前项目不需要 IP 版权标识' : `本尺寸不使用${label}`) : value === "character" && template.renderMode === "masked-popup" ? "请先在左侧核心人物区域上传PSD导出的透明角色PNG" : `自动选择的PSD版式未定义${label}区域`; return `<button class="${kind === value ? "active" : ""}" data-inspector-element="${value}" ${allowed ? "" : `disabled title="${unavailable}"`}>${label}</button>`; };
  const elementTabs = `<div class="element-switch">${tab("background", "背景")}${tab("character", templateAllowsElement(task,template,"character2") ? "角色 1" : "角色")}${templateAllowsElement(task,template,"character2") ? tab("character2", "角色 2") : ""}${tab("foreground", "前景")}${tab("title", "主标")}${tab("subtitle", "副标")}${task.parameters?.layoutByTemplate?.[template.id]?.['subtitle-backing']?.backing?.enabled ? tab('subtitle-backing','承托') : ''}${tab("logo", "Logo")}${tab("ip-copyright", "IP")}${tab("button", "按钮")}</div>`;
  const basicBackgroundProperties = `<div class="property-grid"><label>水平焦点<input type="number" min="0" max="100" data-background-field="focalX" value="${background.focalX}"></label><label>垂直焦点<input type="number" min="0" max="100" data-background-field="focalY" value="${background.focalY}"></label></div><label class="element-scale-control">画面缩放 <b>${background.scale}%</b><input type="range" min="50" max="${MAX_BACKGROUND_SCALE}" value="${background.scale}" data-element-scale="background"></label>`;
  const extendedBackgroundProperties = `<div class="property-grid"><label>水平焦点<input type="number" min="0" max="100" data-background-field="focalX" value="${background.focalX}"></label><label>垂直焦点<input type="number" min="0" max="100" data-background-field="focalY" value="${background.focalY}"></label></div><label class="element-scale-control">画面缩放 <b>${background.scale}%</b><input type="range" min="50" max="${MAX_BACKGROUND_SCALE}" value="${background.scale}" data-element-scale="background"></label><label class="outpaint-prompt-control">扩图优化关键词<textarea id="outpaint-prompt" rows="3" placeholder="例如：延续蓝天、草地和远山">${esc(background.outpaintPrompt || "")}</textarea></label><div class="visibility-row outpaint-subject-policy"><span><b>默认：仅生成环境背景</b><small>原图明暗、色彩保持不变；禁止新增或复制人物、动物及其他主体</small></span><label title="仅在确实需要AI补画新主体的特殊任务中启用"><input type="checkbox" id="allow-outpaint-subjects" ${background.allowNewSubjects === true ? "checked" : ""}> 允许新增主体（例外）</label></div>${background.url ? `<button class="button ghost full-button" id="restore-template-background">恢复原图</button>` : ""}`;
  const backgroundProperties=compact?basicBackgroundProperties:extendedBackgroundProperties;
  const elementProperties = layout ? `<div class="property-grid"><label>位置 X<input type="number" data-layout-field="x" value="${Math.round(layout.x)}"></label><label>位置 Y<input type="number" data-layout-field="y" value="${Math.round(layout.y)}"></label><label>宽度<input type="number" min="1" data-layout-field="width" value="${Math.round(layout.width)}"></label><label>高度<input type="number" min="1" data-layout-field="height" value="${Math.round(layout.height)}"></label></div><label class="element-scale-control">等比缩放 <b>${elementScalePercent(task, template, kind)}%</b><input type="range" min="25" max="${MAX_ELEMENT_SCALE}" step="5" value="${elementScalePercent(task, template, kind)}" data-element-scale="${kind}"></label><div class="visibility-row"><span>拖动画布可移动</span><label><input type="checkbox" id="layout-visible" ${layout.visible !== false ? "checked" : ""}> 显示${elementLabel}</label></div>` : "";
  const flipControl = layout && ['character','character2'].includes(kind) ? `<label class="editor-flip-control"><input type="checkbox" id="layout-flip-x" ${layout.flipX === true ? 'checked' : ''}> 水平翻转${elementLabel}</label>` : '';
  const popupDragHint = template.renderMode === "masked-popup" && ["background", "character"].includes(kind)
    ? `<p class="inspector-help">当前拖动层：${kind === "background" ? "背景" : "人物"}。切换上方“背景 / 角色”后，两层可分别移动和缩放；人物头部不会被拖出画布。</p>` : "";
  const elementActions = `<p class="editor-save-hint">调整后自动保存${kind === "background" ? "" : "；在画布中选中元素后按 Delete 可移除"}</p>`;
  const cleanupTool=template.communityMaster ? renderTextCleanupTool(kind,task.assets.find(asset=>asset.name===selectedAssetName(task,template,kind)),{disabled:task.communityGeneration?.status==='running'||task.outpaint?.status==='running'||Boolean(task.status==='已完成'&&task.deliveredPackage)}) : '';
  const plainCopyright=kind==='ip-copyright'&&Boolean(nativeCopyValue(task,template,kind));
  if(compact){
    const key=communityPropertyKey(task,template,kind),choices=[['background','背景'],['character',templateAllowsElement(task,template,'character2')?'角色 1':'角色'],...(templateAllowsElement(task,template,'character2')?[['character2','角色 2']]:[]),['foreground','前景'],['title','主标'],['subtitle','副标'],...(task.parameters?.layoutByTemplate?.[template.id]?.['subtitle-backing']?.backing?.enabled?[['subtitle-backing','副标承托']]:[]),['logo','Logo'],['ip-copyright','IP 版权'],['button','按钮']].map(([value,label])=>({value,label,allowed:templateAllowsElement(task,template,value)}));
    return renderCommunityProperties({kind,choices,layout,background,scale:kind==='background'?background.scale:elementScalePercent(task,template,kind),maximum:kind==='background'?MAX_BACKGROUND_SCALE:MAX_ELEMENT_SCALE,
      ratioLocked:state.communityAspectLocks?.[key]!==false,preciseOpen:state.communityPreciseOpen?.[key]===true,plainCopyright,colorMode:copyrightColorMode(layout?.copyrightColorMode),
      effects:EFFECT_ELEMENT_KINDS.has(kind)&&layout&&!plainCopyright?editableElementEffects(layout,template,kind):null,extra:subtitleBackingControls(task,template,kind,layout),cleanup:cleanupTool});
  }
  const copyrightControl=plainCopyright?`<label class="copyright-color-control">版权字色<select id="copyright-color-mode">${[['auto','自动适配画面'],['black','黑色'],['white','白色']].map(([mode,label])=>`<option value="${mode}" ${copyrightColorMode(layout.copyrightColorMode)===mode?'selected':''}>${label}</option>`).join('')}</select></label>`:'';
  const properties = `<div class="inspector-body"><h4>元素与尺寸</h4>${elementTabs}${cleanupTool}${kind === "background" ? backgroundProperties : elementProperties}${flipControl}${copyrightControl}${subtitleBackingControls(task,template,kind,layout)}${EFFECT_ELEMENT_KINDS.has(kind) && layout && !plainCopyright ? editorEffectControls(layout,template,kind) : ""}${compact?'':popupDragHint+elementActions}</div>`;
  const checks = `<div class="inspector-body"><h4>校验结果</h4>${editorQcRows(task, template, rule, technicalPassed)}<div class="inspector-warning">${technicalPassed ? "技术规格已通过；视觉项仍需设计师成套确认" : "有警告时可保存草稿，但生成成品后才能提交审核"}</div></div>`;
  return `${compact?'':`<div class="inspector-resource"><h3>资源位与规范</h3><b>${esc(template.name)}</b><span>${template.width}×${template.height} · ${template.format} · ≤${Math.round(template.maxBytes/1024)}KB</span></div>`}<div class="inspector-tabs"><button class="${state.inspectorTab === "elements" ? "active" : ""}" data-inspector-tab="elements">元素属性</button><button class="${state.inspectorTab === "qc" ? "active" : ""}" data-inspector-tab="qc">规范检查</button></div>${state.inspectorTab === "elements" ? properties : checks}`;
}

function activePsdVariant(template, task = state.task) {
  const rule = state.data.psdLayoutRules?.templates?.find((item) => item.templateId === template.id);
  const selectedId = task?.parameters?.variantByTemplate?.[template.id];
  return rule?.variants?.find((variant) => variant.id === selectedId)
    || (rule?.variants?.length === 1 ? rule.variants[0] : null)
    || choosePsdVariant(task, template)
    || null;
}

function psdRegionInfo(template, type) {
  const rule = state.data.psdLayoutRules?.templates?.find(item => item.templateId === template.id);
  return [...(activePsdVariant(template)?.regions || []), ...(rule?.globalRegions || [])].find(region => region.type === type && region.bounds) || null;
}

function psdRegion(template, type) {
  return psdRegionInfo(template, type)?.bounds || null;
}

function psdRegions(template, types) {
  const rule = state.data.psdLayoutRules?.templates?.find(item => item.templateId === template.id);
  const wanted = new Set(types);
  return [...(activePsdVariant(template)?.regions || []), ...(rule?.globalRegions || [])]
    .filter(region => wanted.has(region.type) && region.bounds);
}

function elementRegionType(kind) {
  return ["title", "subtitle"].includes(kind) ? "copy" : kind === "ip-copyright" ? "ip" : kind;
}

function taskIsIpProject(task) {
  return Boolean(state.data.projects?.find((project) => project.id === task.projectId)?.isIpProject)
    || task.assets?.some((asset) => ["ip-copyright", "copyright"].includes(asset.role));
}

function templateAllowsElement(task, template, kind) {
  if (kind === "background") return true;
  if (template?.communityPlacement) {
    if(kind==="button"&&popupConfig(task,template))return true;
    const backgroundName=selectedAssetName(task,template,'background');
    const artwork=Object.values(task.parameters?.communityArtworkByTemplate || {}).find(a=>a.assetName===backgroundName);
    if(artwork && ['character','character2','foreground','title','subtitle','subtitle-backing'].includes(kind))return false;
    if (["character", "foreground", "title", "subtitle", "subtitle-backing"].includes(kind)) return true;
    if (kind === "character2") return task.assets.filter(asset => ["character","core-character"].includes(asset.role) && asset.mime?.startsWith("image/")).length > 1;
    if (kind === "logo") return template.brandLogo === true;
    if (kind === "ip-copyright") return template.ipCopyright === true && taskIsIpProject(task);
    return false;
  }
  if (kind === "character") return template.renderMode === "masked-popup"
    && Boolean(psdRegion(template, "character-breakout"))
    && (task.assets.some((asset) => ["character", "core-character"].includes(asset.role) && asset.mime?.startsWith("image/png"))
      || Boolean(findForegroundOutput(task.localAi, selectedAssetName(task, template, "background"))));
  if (!psdRegion(template, elementRegionType(kind))) return false;
  if (kind === "ip-copyright" && !taskIsIpProject(task)) return false;
  return true;
}

function assetAspect(asset) {
  const image = state.assetImages.get(asset?.name);
  return image?.naturalWidth > 0 && image?.naturalHeight > 0 ? image.naturalWidth / image.naturalHeight : null;
}

function closestAspectAsset(assets, desiredAspect, kind) {
  if (!assets.length) return null;
  return [...assets].sort((a, b) => {
    const score = (asset) => {
      const ratio = assetAspect(asset);
      let value = ratio ? Math.abs(Math.log(ratio / desiredAspect)) : 4;
      const name = String(asset.name || "");
      if (kind === "background") {
        const wantsPortrait = desiredAspect < 1;
        if (wantsPortrait && /竖|portrait/i.test(name)) value -= 2;
        if (!wantsPortrait && /横|landscape/i.test(name)) value -= 2;
      } else if (kind === "title") {
        const preferred = desiredAspect >= 3 ? "one" : "two";
        if (preferred === "one" && /一行|one.?line/i.test(name)) value -= 2;
        if (preferred === "two" && /两行|二行|two.?line/i.test(name)) value -= 2;
        if (preferred === "vertical" && /竖排|vertical/i.test(name)) value -= 2;
      }
      return value;
    };
    return score(a) - score(b);
  })[0];
}

function automaticAsset(task, template, kind) {
  if (!templateAllowsElement(task, template, kind)) return null;
  if (kind === "background") {
    const cleanCandidates = task.assets.filter((asset) => isRenderableImageAsset(asset) && ["clean-kv","background","background-landscape","background-portrait"].includes(asset.role));
    const candidates = cleanCandidates.length ? cleanCandidates : task.assets.filter((asset) => isRenderableImageAsset(asset) && ["master","master-landscape","master-portrait"].includes(asset.role));
    return closestAspectAsset(candidates, template.width / template.height, kind);
  }
  const roles = kind === "ip-copyright" ? ["ip-copyright", "copyright"] : ["character","character2"].includes(kind) ? ["character", "core-character"] : [kind];
  const candidates = task.assets.filter((asset) => isRenderableImageAsset(asset) && roles.includes(asset.role));
  if (kind === "character2") return candidates.find(asset => asset.name !== selectedAssetName(task,template,"character")) || null;
  const region = psdRegion(template, elementRegionType(kind));
  return kind === "title" && template.communityPlacement ? closestAspectAsset(candidates, template.width / template.height, kind)
    : kind === "title" && region ? closestAspectAsset(candidates, region.width / region.height, kind) : candidates[0] || null;
}

function defaultElementLayout(template, kind) {
  if(kind==="button"&&popupConfig(state.task,template))return popupLayerBox("button");
  if(kind==='subtitle-backing')return {x:0,y:0,width:1,height:1,visible:false,backing:normalizeSubtitleBacking()};
  if (template?.communityPlacement && kind === "character2") {
    const portrait = template.height > template.width;
    return portrait
      ? {x:template.width*.04,y:template.height*.48,width:template.width*.43,height:template.height*.49,visible:true}
      : {x:template.width*.025,y:template.height*.09,width:template.width*.34,height:template.height*.88,visible:true};
  }
  if (template?.communityPlacement && template.communityLayout?.[kind === "ip-copyright" ? "copyright" : kind]) {
    const [x,y,width,height] = template.communityLayout[kind === "ip-copyright" ? "copyright" : kind];
    return {x:x*template.width,y:y*template.height,width:width*template.width,height:height*template.height,visible:true};
  }
  if (kind === "character") {
    const boundName = state.task.parameters?.assetByTemplate?.[template.id]?.character || state.task.parameters?.assetByRole?.character;
    const asset = template.renderMode === "masked-popup"
      ? popupForegroundFor(template, getTemplateBackground(state.task, template))
      : (state.task.assets.find((item) => item.name === boundName) || automaticAsset(state.task, template, "character"));
    const image = asset && state.assetImages.get(asset.name);
    if (asset?.sourceAssetName && image) {
      // The first popup foreground placement is persisted by the server.
      // Its scale reference must remain fixed when the background changes.
      return { ...coverPlacement(image.naturalWidth, image.naturalHeight, template.width, template.height, { focalX: 50, focalY: 50, scale: 100 }), visible:true };
    }
    const body = psdRegion(template, "body-boundary");
    const breakout = psdRegion(template, "character-breakout");
    const subjectBounds = image ? { x: 0, y: 0, width: image.naturalWidth, height: image.naturalHeight } : null;
    const fitted = fitSubjectToBreakout(subjectBounds, body, breakout);
    return fitted ? { ...fitted.target, visible: true } : { x: 0, y: 0, width: 1, height: 1, visible: false };
  }
  const type = elementRegionType(kind);
  const bounds = psdRegion(template, type);
  if (bounds && kind === "subtitle") return { x: bounds.x, y: bounds.y + bounds.height * .76, width: bounds.width, height: bounds.height * .24, visible: true };
  if (bounds) return { ...bounds, visible: true };
  return { x: 0, y: 0, width: 1, height: 1, visible: false };
}

function getElementLayout(task, template, kind) {
  const saved = task.parameters?.layoutByTemplate?.[template.id]?.[kind];
  const automatic = defaultElementLayout(template, kind);
  // 主标和副标共用 PSD 的文案保护区。两者同时存在时自动上下分区，
  // 避免新任务还需要逐尺寸手动缩放和错开。
  if (!saved && kind === "title" && selectedAssetName(task, template, "subtitle")) {
    automatic.height *= .72;
  }
  const layout = { ...automatic, ...(saved || {}) };
  if (!["character","character2"].includes(kind) || !saved) return layout;
  const image = characterSourceImage(task, template, kind);
  if (!image || Math.abs(layout.width / layout.height - image.naturalWidth / image.naturalHeight) < .005) return layout;
  return keepImageAspect(layout, image.naturalWidth, image.naturalHeight);
}

function getTemplateBackground(task, template) {
  const defaults = {
    focalX: Number(task.parameters?.focalX ?? 50),
    focalY: Number(task.parameters?.focalY ?? 50),
    scale: Number(task.parameters?.scale ?? 100),
    smartExpand: Boolean(task.parameters?.smartExpand),
    url: "",
    modelUsed: "",
    outpaintModel: "banana",
    outpaintPrompt: "",
    allowNewSubjects: false,
  };
  const result = { ...defaults, ...(task.parameters?.backgroundByTemplate?.[template?.id] || {}) };
  // 修复前生成的扩图没有分段策略与生产保护，可能包含模糊延展或伪文字。
  // 文件继续保留用于追溯，但不再作为当前画布背景。
  if (result.url && Number(result.pipelineVersion || 0) < 2) {
    result.url = "";
    result.modelUsed = "";
    result.smartExpand = false;
  }
  return result;
}

function selectedAssetName(task, template, kind) {
  if(kind==='subtitle-backing')return '';
  const key = kind === "clean-kv" ? "background" : kind;
  if (!templateAllowsElement(task, template, key)) return "";
  const perTemplate = task.parameters?.assetByTemplate?.[template?.id]?.[key];
  if (template.communityPlacement && Object.hasOwn(task.parameters?.assetByTemplate?.[template?.id] || {},key) && perTemplate === null) return "";
  if (perTemplate) return perTemplate;
  if (key === "background" && template.communityPlacement && template.id !== task.masterTemplateId) {
    const masterBackground = task.parameters?.assetByTemplate?.[task.masterTemplateId]?.background;
    if (masterBackground && task.assets.some(asset => asset.name === masterBackground)) return masterBackground;
  }
  const automatic = automaticAsset(task, template, key)?.name;
  if (automatic) return automatic;
  const global = key === "background" ? task.primaryAssetName : task.parameters?.assetByRole?.[key];
  if (global && task.assets.some((asset) => asset.name === global)) return global;
  return "";
}

function characterSourceImage(task, template, kind = "character") {
  const selected = selectedAssetName(task, template, kind);
  const manual = task.assets.find((asset) => asset.name === selected && ["character", "core-character"].includes(asset.role));
  const manualImage = manual && state.assetImages.get(manual.name);
  if (manualImage) return manualImage;
  const generated = popupForegroundFor(template, getTemplateBackground(task, template));
  return generated && state.assetImages.get(generated.name);
}

function detachCommunityCopyAsset(kind) {
  const task = state.task;
  if (!task?.templates?.some(template => template.communityPlacement)) return;
  task.parameters.assetByTemplate ||= {};
  for (const template of task.templates) {
    if (!template.communityPlacement) continue;
    if(popupConfig(task,template))continue;
    task.parameters.assetByTemplate[template.id] ||= {};
    task.parameters.assetByTemplate[template.id][kind] = null;
  }
}

function templateSourceImage(task, template) {
  const background = getTemplateBackground(task, template);
  if (background.url) return state.assetImages.get(`__outpaint_${template.id}`) || state.sourceImage;
  const name = selectedAssetName(task, template, "background");
  return state.assetImages.get(name) || state.sourceImage;
}

function drawProtectedOriginal(ctx, template, background) {
  if (!background.url || background.modelUsed !== "banana_pro" || !background.originalPlacement) return;
  const sourceName = background.sourceAssetName || selectedAssetName(state.task, template, "background");
  const image = state.assetImages.get(sourceName);
  if (!image) return;
  const placement = background.originalPlacement;
  const scale = Math.max(template.width / image.naturalWidth, template.height / image.naturalHeight) * (Number(placement.scale || 100) / 100);
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  const x = -(drawWidth - template.width) * (Number(placement.focalX ?? 50) / 100);
  const y = -(drawHeight - template.height) * (Number(placement.focalY ?? 50) / 100);
  const feather = Math.max(12, Math.round(Math.min(template.width, template.height) * .035));
  drawFeatheredOriginal(ctx, image, { x, y, width: drawWidth, height: drawHeight }, { featherX: feather, featherY: feather });
}

function scaleReferenceLayout(task, template, kind) {
  const material=task.parameters?.layoutByTemplate?.[template.id]?.[kind];
  if(material?.scaleBaseWidth&&material?.scaleBaseHeight)return {...material,width:material.scaleBaseWidth,height:material.scaleBaseHeight};
  if(kind==='subtitle-backing'){
    const saved=task.parameters?.layoutByTemplate?.[template.id]?.[kind] || defaultElementLayout(template,kind);
    return {...saved,width:saved.scaleBaseWidth || saved.width,height:saved.scaleBaseHeight || saved.height};
  }
  const base = defaultElementLayout(template, kind);
  if (!["character","character2"].includes(kind)) return base;
  const image = characterSourceImage(task, template, kind);
  return image ? keepImageAspect(base, image.naturalWidth, image.naturalHeight) : base;
}

function elementScalePercent(task, template, kind) {
  const layout = getElementLayout(task, template, kind);
  const base = scaleReferenceLayout(task, template, kind);
  return Math.max(1, Math.round(layout.width / Math.max(1, base.width) * 100));
}

function selectedScaleDescription(task = state.task) {
  const label = ({ background: "背景", character: "人物 1", character2: "人物 2", foreground: "前景", title: "主标", subtitle: "副标", "subtitle-backing":"承托", logo: "Logo", "ip-copyright": "IP", button: "按钮" })[state.inspectorElement] || "图层";
  return `${label} ${selectedScalePercent(task)}%`;
}

function selectedScalePercent(task = state.task) {
  if (!task) return 100;
  const template = state.data?.templates?.find((item) => item.id === state.previewTemplateId) || task.masterTemplate;
  if (state.inspectorElement === "background") return Math.round(getTemplateBackground(task, template).scale || 100);
  return template ? elementScalePercent(task, template, state.inspectorElement) : 100;
}

function setElementScale(percent, shouldRender = false) {
  const maximum = state.inspectorElement === "background" ? MAX_BACKGROUND_SCALE : MAX_ELEMENT_SCALE;
  const value = Math.max(state.inspectorElement === "background" ? 50 : 25, Math.min(maximum, Math.round(percent)));
  if (state.inspectorElement === "background") {
    const template = state.data.templates.find((item) => item.id === state.previewTemplateId) || state.task.masterTemplate;
    state.task.parameters.backgroundByTemplate ||= {};
    state.task.parameters.backgroundByTemplate[template.id] = { ...getTemplateBackground(state.task, template), scale: value };
  } else {
    const template = state.data.templates.find((item) => item.id === state.previewTemplateId);
    if (!template) return;
    const kind = state.inspectorElement;
    const base = scaleReferenceLayout(state.task, template, kind);
    const current = getElementLayout(state.task, template, kind);
    const centerX = current.x + current.width / 2;
    const centerY = current.y + current.height / 2;
    const width = Math.max(1, Math.round(base.width * value / 100));
    const height = Math.max(1, Math.round(base.height * value / 100));
    state.task.parameters.layoutByTemplate ||= {};
    state.task.parameters.layoutByTemplate[template.id] ||= {};
    let y = Math.round(centerY - height / 2);
    if (kind === "character" && template.renderMode === "masked-popup") {
      const layer = popupForegroundFor(template, getTemplateBackground(state.task, template));
      const image = layer && state.assetImages.get(layer.name);
      if (image && layer.subjectBounds?.y >= 0) y = Math.max(y, Math.ceil(8 - layer.subjectBounds.y / image.naturalHeight * height));
    }
    state.task.parameters.layoutByTemplate[template.id][kind] = { ...current, x: Math.round(centerX - width / 2), y, width, height };
  }
  redrawPreview();
  scheduleParamsSave();
  const label = document.querySelector("#canvas-scale-label");
  if (label) label.textContent = selectedScaleDescription();
  const inspectorScale = document.querySelector(".element-scale-control b");
  if (inspectorScale) inspectorScale.textContent = `${selectedScalePercent()}%`;
  if (shouldRender) renderTaskDetail();
}

function updateBackgroundField(field, value) {
  const template = state.data.templates.find((item) => item.id === state.previewTemplateId) || state.task.masterTemplate;
  state.task.parameters.backgroundByTemplate ||= {};
  state.task.parameters.backgroundByTemplate[template.id] = { ...getTemplateBackground(state.task, template), [field]: Math.max(0, Math.min(100, Number(value))) };
  redrawPreview();
  scheduleParamsSave();
}

function updateOutpaintPrompt(value) {
  const template = state.data.templates.find((item) => item.id === state.previewTemplateId) || state.task.masterTemplate;
  state.task.parameters.backgroundByTemplate ||= {};
  state.task.parameters.backgroundByTemplate[template.id] = { ...getTemplateBackground(state.task, template), outpaintPrompt: String(value || "").slice(0, 500) };
  scheduleParamsSave();
}

function updateOutpaintModel(value) {
  const template = state.data.templates.find((item) => item.id === state.previewTemplateId) || state.task.masterTemplate;
  state.task.parameters.backgroundByTemplate ||= {};
  state.task.parameters.backgroundByTemplate[template.id] = { ...getTemplateBackground(state.task, template), outpaintModel: value === "rh" ? "rh" : "banana" };
  scheduleParamsSave();
}

function updateOutpaintSubjectPolicy(allowed) {
  const template = state.data.templates.find((item) => item.id === state.previewTemplateId) || state.task.masterTemplate;
  state.task.parameters.backgroundByTemplate ||= {};
  state.task.parameters.backgroundByTemplate[template.id] = { ...getTemplateBackground(state.task, template), allowNewSubjects: allowed === true };
  scheduleParamsSave();
}

function updateElementLayout(field, value) {
  const template = state.data.templates.find((item) => item.id === state.previewTemplateId);
  if (!template) return;
  state.task.parameters.layoutByTemplate ||= {};
  state.task.parameters.layoutByTemplate[template.id] ||= {};
  const current = getElementLayout(state.task, template, state.inspectorElement);
  if(['x','y','width','height'].includes(field)&&!Number.isFinite(value))return;
  if(['width','height'].includes(field))value=Math.max(1,value);
  let next = { ...current, [field]: value };
  if(taskHasCommunityPropertyRatioLock(state.task,template,state.inspectorElement)&&['width','height'].includes(field)){
    const other=field==='width'?'height':'width';next[other]=Math.max(1,Math.round(current[other]*value/current[field]));
  }else if (!state.task.masterTemplate?.communityMaster&&state.inspectorElement === "character" && ["width", "height"].includes(field)) {
    const image = characterSourceImage(state.task, template);
    if (image) next = keepImageAspect(next, image.naturalWidth, image.naturalHeight, field);
  }
  state.task.parameters.layoutByTemplate[template.id][state.inspectorElement] = next;
  redrawPreview();
  scheduleParamsSave();
}

function taskHasCommunityPropertyRatioLock(task,template,kind){
  return task.masterTemplate?.communityMaster&&state.communityAspectLocks?.[communityPropertyKey(task,template,kind)]!==false;
}

function updateElementEffect(path, value) {
  const template = state.data.templates.find((item) => item.id === state.previewTemplateId);
  if (!template || !EFFECT_ELEMENT_KINDS.has(state.inspectorElement)) return;
  const [group, field] = path.split(".");
  if (!(["stroke", "shadow"].includes(group) && field)) return;
  const effects = editableElementEffects(getElementLayout(state.task, template, state.inspectorElement),template,state.inspectorElement);
  effects[group][field] = field === "enabled" ? value === true : value;
  state.task.parameters.elementEffectsUpdatedAt = new Date().toISOString();
  updateElementLayout("effects", normalizeElementEffects(effects));
  updateEditorPackageAction();
}

async function addSubtitleBacking() {
  const task=state.task,template=state.data.templates.find(item=>item.id===state.previewTemplateId);
  if(!template?.communityPlacement || !hasCanvasAsset('subtitle',template))return toast('请先输入副文案或添加副标素材');
  task.parameters.layoutByTemplate ||= {};task.parameters.layoutByTemplate[template.id] ||= {};
  const previous=task.parameters.layoutByTemplate[template.id]['subtitle-backing'];
  let layout;
  if(previous?.backing){layout={...previous,visible:true,backing:{...normalizeSubtitleBacking(previous.backing),enabled:true}};}
  else{
    let bounds=getElementLayout(task,template,'subtitle');
    if(nativeCopyValue(task,template,'subtitle')){
      const metrics=measureNativeCopy(document.createElement('canvas').getContext('2d'),nativeCopyOptions(task,template,'subtitle'));
      const tm=metrics.textMetrics,left=Math.max(0,tm?.actualBoundingBoxLeft || 0);
      const top=Number.isFinite(tm?.actualBoundingBoxAscent)?tm.actualBoundingBoxAscent:metrics.fontSize*.55;
      const bottom=Number.isFinite(tm?.actualBoundingBoxDescent)?tm.actualBoundingBoxDescent:metrics.fontSize*.55;
      bounds={...bounds,x:bounds.x-left,y:bounds.y+bounds.height/2-top,width:Math.max(1,metrics.textWidth,left+(tm?.actualBoundingBoxRight || 0)),height:Math.max(1,top+bottom)};
    }
    layout=createSubtitleBackingLayout(bounds,template);
  }
  layout.scaleBaseWidth ||= layout.width;layout.scaleBaseHeight ||= layout.height;
  task.parameters.layoutByTemplate[template.id]['subtitle-backing']=layout;
  task.parameters.elementEffectsUpdatedAt=new Date().toISOString();
  state.inspectorElement='subtitle-backing';state.communitySideTab='elements';
  if(!await saveParameters(true))return;
  renderTaskDetail();toast('已添加独立承托，可分别移动文字与底形');
}

function updateSubtitleBacking(field,value) {
  if(!['shape','fill','opacity','radius'].includes(field))return;
  const template=state.data.templates.find(item=>item.id===state.previewTemplateId);
  if(!template||state.inspectorElement!=='subtitle-backing')return;
  const backing=normalizeSubtitleBacking({...getElementLayout(state.task,template,'subtitle-backing').backing,[field]:value});
  state.task.parameters.elementEffectsUpdatedAt=new Date().toISOString();
  updateElementLayout('backing',backing);updateEditorPackageAction();
}

function editorQcRows(task, template, rule, technicalPassed) {
  const needsTitle = templateAllowsElement(task, template, "title");
  const needsLogo = templateAllowsElement(task, template, "logo");
  const needsIp = templateAllowsElement(task, template, "ip-copyright");
  const contentRule = [needsTitle ? "标题" : "", needsLogo ? "Logo" : ""].filter(Boolean).join("与") || "不需要";
  const rows = [
    ["尺寸", `${template.width}×${template.height}`, technicalPassed],
    ["文件大小", technicalPassed ? "符合" : "待生成", technicalPassed],
    ["核心人物完整", "需人工确认", null],
    ["标题与Logo", contentRule === "不需要" ? contentRule : `${contentRule}按${template.communityPlacement ? '本资源位独立图层规则' : '自动选定的PSD版式'}`, contentRule === "不需要" ? true : null],
    ["IP版权规则", needsIp ? (template.communityPlacement ? "IP 项目按资源位独立显示" : "按自动选定的PSD版式") : "不需要", needsIp ? null : true],
  ];
  return `<div class="inspector-qc">${rows.map(([label,value,passed]) => `<div><span>${label}</span><b class="${passed === true ? "pass" : passed === false ? "warn" : "pending"}">${esc(value)} ${passed === true ? "●" : passed === false ? "▲" : ""}</b></div>`).join("")}</div>`;
}

const annotationTypes = {
  "core-character": ["核心人物", "#ff4d6d"],
  "secondary-character": ["次要人物", "#f4a340"],
  "core-prop": ["核心道具", "#00a6fb"],
  "must-keep": ["必须保留区域", "#6c5ce7"],
  "removable": ["可删除元素", "#8b93a7"],
  "no-cover": ["禁止覆盖区域", "#00a884"],
};

function annotationToolbar(task) {
  const objects = task.annotations?.objects || [];
  const localAi = state.data.localAi;
  const run = task.localAi;
  return `<section class="annotation-panel"><div><b>KV自动拆分与对象确认</b><span>先自动生成前景总图和背景草稿；多人重叠时再通过标注细分核心人物、次要人物和装饰元素。</span></div><div class="split-actions"><button class="button primary" id="run-local-ai" ${localAi?.installed ? "" : "disabled"}>运行KV自动拆分</button><span>${run?.status === "completed" ? `已生成 ${run.outputs?.length || 0} 个拆分文件` : localAi?.installed ? "等待拆分" : "本地视觉处理尚未安装完整"}</span></div>${run?.outputs?.length ? `<div class="derived-assets"><h4>KV自动拆分结果</h4>${run.outputs.map((item,index) => `<div><a href="${item.url}" target="_blank" rel="noopener">${esc(item.name)}</a><span class="tag">${index === 0 ? "自动拆分" : "待确认"}</span></div>`).join("")}</div>` : ""}<details class="fine-tune"><summary>需要细分或修边时展开人工校正</summary><div class="annotation-types">${Object.entries(annotationTypes).map(([key,[label,color]]) => `<button class="annotation-type ${state.annotationType === key ? "active" : ""}" data-annotation-type="${key}" style="--annotation-color:${color}">${label}</button>`).join("")}</div><div class="annotation-undo"><button class="button ghost" id="undo-point" ${state.polygonPoints.length ? "" : "disabled"}>↶ 撤销上一点 <kbd>Ctrl+Z</kbd></button><button class="button ghost" id="cancel-polygon" ${state.polygonPoints.length ? "" : "disabled"}>取消本次标注 <kbd>Esc</kbd></button><button class="button ghost" id="undo-object" ${objects.length ? "" : "disabled"}>撤销上一个对象 <kbd>Delete</kbd></button><span>${state.polygonPoints.length ? `当前已有 ${state.polygonPoints.length} 个点` : "尚未开始绘制"}</span></div><div class="object-chips">${objects.map((item,index) => `<span style="--annotation-color:${annotationTypes[item.type]?.[1] || '#777'}">${esc(item.label || annotationTypes[item.type]?.[0])}<button data-remove-object="${index}">×</button></span>`).join("") || `<small>尚未进行人工细分</small>`}<button class="button secondary" id="save-annotations">保存校正结果</button></div></details><p class="subtext">自动拆分结果必须经设计师确认；缺失肢体和大面积背景仍可能需要AI补全或人工修整。</p></section>`;
}

function actionButtons(task) {
  if (task.status === "草稿") return `<button class="button primary" data-transition="${task.mode === "master" ? "主图制作" : "批量生成"}">开始处理</button>`;
  if (task.status === "主图制作") return `<button class="button primary" data-transition="批量生成">进入批量生成</button>`;
  const requiresPsd = task.templates?.some((template) => template.requiresPsd);
  if (task.status === "生成失败") {
    const actions = [];
    if (!requiresPsd) actions.push(`<button class="button secondary" id="render-local">本地生成并质检</button>`);
    actions.push(`<button class="button primary" id="queue-photoshop">发送 Photoshop 验证队列</button>`);
    return `${actions.join("")}<span class="subtext">按模板默认布局与任务版式参数执行，不需要逐尺寸构图确认</span>`;
  }
  if (task.status === "批量生成" && !requiresPsd) return `<button class="button primary" id="render-local">在本机继续生成</button>`;
  if (task.status === "成套审核") { const blocked = task.targetTemplateIds.some((id) => state.data.resourceRules?.find((rule) => rule.templateId === id)?.deliveryAllowed !== true); return `<button class="button secondary" id="reject-visual">退回修改</button><button class="button primary" data-transition="已完成" ${blocked ? "disabled" : ""}>成套视觉审核通过</button><span class="subtext">${blocked ? "资源位视觉规则尚未核实完成，当前结果只能验证，不能交付" : "审核通过后才能下载交付 ZIP"}</span>`; }
  if (task.status === "已完成") return `<a class="button primary" href="/api/tasks/${task.id}/package">下载成套 ZIP</a>`;
  return "";
}

function previewGallery(task) {
  if (!task.pagePreviews?.length) return "";
  return `<section class="result-section"><div class="result-head"><div><p class="eyebrow">PAGE PREVIEWS</p><h3>页面效果预览</h3></div><span class="status" data-status="已完成">${task.pagePreviews.length} 张</span></div><div class="result-grid">${task.pagePreviews.map((item) => `<article class="result-card"><a href="${item.url}" target="_blank"><img src="${item.url}" alt="页面效果预览" /></a><div class="result-meta"><b>${esc(state.data.templates.find((t) => t.id === item.templateId)?.name || item.name)}</b><span>页面PSD预览 · ${item.format}</span></div></article>`).join("")}</div></section>`;
}

function info(label, value) { return `<div class="info-row"><span>${label}</span><b>${esc(value)}</b></div>`; }

function controls(params) {
  const slider = (key, label, min, max, suffix = "") => `<div class="control"><div class="control-head"><span>${label}</span><b id="${key}-value">${params[key]}${suffix}</b></div><input type="range" data-param="${key}" min="${min}" max="${max}" value="${params[key]}" data-suffix="${suffix}" /></div>`;
  return `${slider("focalX", "水平焦点", 0, 100, "%")}${slider("focalY", "垂直焦点", 0, 100, "%")}${slider("scale", "画面缩放", 80, 180, "%")}${slider("textX", "文案水平位置", 0, 80, "%")}${slider("textY", "文案垂直位置", 5, 90, "%")}${slider("fontSize", "文案字号", 18, 120, "px")}${slider("overlay", "暗色蒙层", 0, 70, "%")}<div class="inline-controls"><label>文字颜色<input data-param="textColor" type="color" value="${params.textColor}" /></label><label>背景颜色<input data-param="background" type="color" value="${params.background}" /></label><label class="inline-check"><input id="param-show-text" type="checkbox" ${params.showText ? "checked" : ""} />在预览中显示文案</label></div>`;
}

function parametersDrawer(task) {
  const params = task.parameters || {};
  return `<section class="parameters-drawer" id="parameters-drawer" hidden>
    <div class="drawer-head"><h3>版式参数</h3><span>拖动即调整预览，松手自动保存；最终按模板默认布局执行</span></div>
    ${controls(params)}
    <div class="drawer-copy"><label>文案内容<textarea id="copy-control" rows="2" placeholder="需要显示的推广文案…">${esc(task.copy || "")}</textarea></label></div>
    <div class="layout-actions"><button class="button primary" id="save-params">保存参数</button></div>
  </section>`;
}

function artifactGallery(task) {
  if (!task.artifacts.length) return "";
  return `<section class="result-section"><div class="result-head"><div><p class="eyebrow">GENERATED OUTPUTS</p><h3>生成结果</h3></div><span class="status" data-status="${task.qc?.passed ? "已完成" : "生成失败"}">${task.artifacts.length} 张成品</span></div><div class="result-grid">${task.artifacts.map((artifact) => {
    const template = state.data.templates.find((item) => item.id === artifact.templateId);
    return `<article class="result-card"><a href="${artifact.url}" target="_blank" rel="noopener"><img src="${artifact.url}" alt="${esc(template?.name || artifact.name)}" loading="lazy" /></a><div class="result-meta"><b>${esc(template?.name || artifact.name)}</b><span>${artifact.width}×${artifact.height} · ${artifact.format} · ${formatBytes(artifact.bytes)}</span><div><span class="${artifact.qc.passed ? "result-pass" : "result-fail"}">${artifact.qc.passed ? "✓ 质检通过" : "! 质检失败"}</span>${artifact.templateApplied ? `<span class="result-pass">✓ PSD模板</span>` : ""}<a href="${artifact.url}" download="${esc(artifact.name)}">下载单张</a></div></div></article>`;
  }).join("")}</div></section>`;
}

function wireDetailEvents() {
  document.querySelector('#company-font-search')?.addEventListener('input',event=>{
    const query=event.target.value.trim().toLowerCase(),select=document.querySelector('#company-font-select');
    if(!select)return;
    const matches=companyFonts().filter(font=>[font.name,font.family,font.style,...(font.aliases || [])].some(value=>String(value||'').toLowerCase().includes(query)));
    select.innerHTML='<option value="">'+(matches.length?'选择字体预览':'没有匹配字体')+'</option>'+companyFontOptions(matches,state.companyFontPreviewId);
  });
  document.querySelector('#company-font-select')?.addEventListener('change',async event=>{
    const id=event.target.value,asset=companyFonts().find(font=>font.id===id),preview=document.querySelector('#company-font-preview');
    state.companyFontPreviewId=id;
    document.querySelectorAll('[data-use-company-font]').forEach(button=>button.disabled=true);
    if(!asset){if(preview){preview.textContent='选择后预览字体效果';preview.classList.add('company-font-placeholder');}return;}
    if(preview)preview.textContent='正在加载字体…';
    try{
      await loadFontAsset(asset);
      if(state.companyFontPreviewId!==id||!preview?.isConnected)return;
      preview.style.fontFamily=projectFontFamily(asset);preview.textContent=state.task.copy || '字体效果预览';preview.classList.remove('company-font-placeholder');
      document.querySelectorAll('[data-use-company-font]').forEach(button=>button.disabled=false);
    }catch(error){if(state.companyFontPreviewId===id&&preview?.isConnected)preview.textContent='字体加载失败，请重新选择';toast(error.message);}
  });
  document.querySelectorAll('[data-use-company-font]').forEach(button=>button.addEventListener('click',async()=>{
    const task=state.task,kind=button.dataset.useCompanyFont,asset=companyFonts().find(font=>font.id===state.companyFontPreviewId);
    if(!asset)return;
    if(kind==='subtitle'&&!task.parameters?.subtitleText?.trim())return toast('请先填写最终副文案');
    button.disabled=true;
    try{
      await loadFontAsset(asset);
      if(state.task?.id!==task.id)return;
      task.parameters[kind+'FontId']=asset.id;task.parameters[kind+'FontSource']='manual';delete task.parameters[kind+'FontAsset'];
      detachCommunityCopyAsset(kind);
      if(!await saveParameters(true))return;
      renderTaskDetail();toast('已使用公司字体排字');
    }catch(error){toast('字体使用失败：'+error.message);}finally{if(button.isConnected)button.disabled=false;}
  }));
  document.querySelectorAll('[data-use-project-font]').forEach(button=>button.addEventListener('click',async()=>{
    const task=state.task,kind=button.dataset.fontKind,name=decodeURIComponent(button.dataset.useProjectFont);
    if(kind==='subtitle'&&!task.parameters?.subtitleText?.trim())return toast('请先填写最终副文案');
    button.disabled=true;
    try {
      const companyAsset=button.dataset.companyFontId && companyFonts().find(font=>font.id===button.dataset.companyFontId);
      const projectAsset=projectFonts(task,state.data.projects||[]).find(font=>font.name===name);
      if(companyAsset)await loadFontAsset(companyAsset);else if(projectAsset)await loadFontAsset(projectAsset);
      if(state.task?.id!==task.id)return;
      if(companyAsset){task.parameters[kind+'FontId']=companyAsset.id;task.parameters[kind+'FontSource']='manual';delete task.parameters[kind+'FontAsset'];}
      else{task.parameters[kind+'FontAsset']=name;task.parameters[kind+'FontSource']='manual';delete task.parameters[kind+'FontId'];}
      detachCommunityCopyAsset(kind);
      if(!await saveParameters(true))return;
      renderTaskDetail();toast('已使用项目字体排字，可继续调整位置和大小');
    }catch(error){toast('字体使用失败：'+error.message);}finally{if(button.isConnected)button.disabled=false;}
  }));
  document.querySelector('#editor-start-master')?.addEventListener('click',()=>transition('主图制作'));
  document.querySelector('#editor-start-batch')?.addEventListener('click',()=>transition('批量生成'));
  document.querySelector('#editor-generate-community')?.addEventListener('click',event=>renderArtifacts(false,event.currentTarget));
  document.querySelector('#community-master-title')?.addEventListener('input',event=>{state.task.copy=event.target.value;detachCommunityCopyAsset('title');redrawPreview();scheduleParamsSave()});
  document.querySelector('#community-master-subtitle')?.addEventListener('input',event=>{state.task.parameters.subtitleText=event.target.value;detachCommunityCopyAsset('subtitle');redrawPreview();scheduleParamsSave()});
  document.querySelector('#community-copy-reference')?.addEventListener('input',event=>{state.task.parameters.communityCopyReference=event.target.value;scheduleParamsSave()});
  document.querySelector('#community-image-prompt')?.addEventListener('input',event=>{state.task.parameters.communityDesignDraft=event.target.value;state.communityDesignError='';scheduleParamsSave()});
  document.querySelector('#community-image-prompt')?.addEventListener('keydown',event=>{if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)){event.preventDefault();void submitCommunityBanner();}});
  document.querySelector('#community-composer-mode')?.addEventListener('change',event=>{state.communityComposerTaskId=state.task.id;state.communityComposerMode=event.target.value;state.communityDesignError='';renderTaskDetail();});
  document.querySelector('#community-restore-version')?.addEventListener('click',()=>void restoreCommunityBanner());
  document.querySelector('#community-resume-artwork')?.addEventListener('click',async event=>{
    const taskId=state.task.id,runId=event.currentTarget.dataset.runId;event.currentTarget.disabled=true;
    try{
      if(!await flushPendingParameterSave())return;
      const fresh=await api(`/api/tasks/${taskId}/community-artwork-resume`,{method:'POST',body:JSON.stringify({runId})});
      if(state.task?.id!==taskId)return;
      state.task=fresh;state.communityDesignError='';renderTaskDetail();scheduleCommunityGenerationPoll();
    }catch(error){bannerComposerError(error.message);}
  });
  document.querySelector('#community-apply-artwork')?.addEventListener('click',async event=>{
    const taskId=state.task.id,runId=event.currentTarget.dataset.runId;event.currentTarget.disabled=true;
    try{
      if(!await flushPendingParameterSave())return;
      const fresh=await api(`/api/tasks/${taskId}/community-artwork-apply`,{method:'POST',body:JSON.stringify({runId,expectedUpdatedAt:state.task.updatedAt})});
      if(state.task?.id!==taskId)return;
      state.task=fresh;state.communityComposerMode='concept-edit';
      await Promise.all(fresh.assets.filter(a=>isRenderableImageAsset(a)&&!state.assetImages.has(a.name)).map(async a=>state.assetImages.set(a.name,await loadImage(a.url))));
      renderTaskDetail();toast('已应用整稿方案，请检查后确认母版');
    }catch(error){bannerComposerError(error.message);}
  });
  document.querySelectorAll('#approve-community-master').forEach(control=>control.addEventListener('click',async event=>{
    const button=event.currentTarget;button.disabled=true;
    try{
      if(state.task.communityGeneration?.status==='running' || state.task.outpaint?.status==='running')return toast('生成尚未结束，请等待所有图层完成后再确认母版');
      if(!await saveParameters(true))return;
      state.previewTemplateId=state.task.masterTemplateId;state.previewMode='target';
      state.task=await api(`/api/tasks/${state.task.id}/approve-community-master`,{method:'POST',body:'{}'});
      if(state.task.masterTemplate?.communityMaster){state.communityWorkspaceStage='sizes';state.previewTemplateId=state.task.targetTemplateIds[0];}
      renderTaskDetail();toast('母版已确认，可逐尺寸延展');
    }catch(error){toast(error.message)}finally{if(button.isConnected)button.disabled=false}
  }));
  document.querySelector('#community-reference-upload')?.addEventListener('change',event=>uploadCommunityInput(event,'reference-image'));
  document.querySelector('#community-copy-upload')?.addEventListener('change',event=>uploadCommunityInput(event,'reference-copy'));
  document.querySelector('#community-model-select')?.addEventListener('change',event=>{state.task.parameters.communityImageModel=event.target.value;event.target.style.width=event.target.value==='gpt-image-2'?'90px':'110px';scheduleParamsSave();});
  document.querySelectorAll('[data-community-paste]').forEach(zone=>{
    zone.addEventListener('click',event=>{if(!event.target.closest('button,input,textarea,select,label,a'))document.querySelector('#community-material-prompt,#community-image-prompt')?.focus()});
    zone.addEventListener('paste',event=>pasteCommunityReference(event,zone.dataset.communityPaste));
  });
  document.querySelector('#community-candidate-upload')?.addEventListener('change',event=>uploadCommunityInput(event,'mother-candidate'));
  document.querySelectorAll('[data-community-remove-ref]').forEach(button=>button.addEventListener('click',()=>button.dataset.referenceScope?removeScopedCommunityReference(decodeURIComponent(button.dataset.communityRemoveRef),button.dataset.referenceScope,button):deleteAsset(decodeURIComponent(button.dataset.communityRemoveRef))));
  document.querySelectorAll('[data-community-candidate]').forEach(button=>button.addEventListener('click',()=>selectCommunityCandidate(decodeURIComponent(button.dataset.communityCandidate))));
  document.querySelectorAll('[data-community-model]').forEach(button=>button.addEventListener('click',()=>{state.task.parameters.communityImageModel=button.dataset.communityModel;scheduleParamsSave();renderTaskDetail()}));
  document.querySelectorAll('[data-community-side]').forEach(button=>button.addEventListener('click',()=>{state.communitySideTab=button.dataset.communitySide;renderTaskDetail()}));
  document.querySelector('#community-generate-master')?.addEventListener('click',()=>void submitCommunityBanner());
  document.querySelector('#community-adapt-current')?.addEventListener('click',event=>void submitCommunityArtworkAdapt(event.currentTarget.dataset.templateId));
  document.querySelector('#community-generate-targets')?.addEventListener('click',()=>generateCommunityImages('targets'));
  document.querySelector('#editor-approve-current-suite')?.addEventListener('click',async event=>{
    const button=event.currentTarget,id=state.task.id;button.disabled=true;button.textContent='正在确认尺寸稿…';
    try{
      if(!await flushPendingParameterSave()||state.task?.id!==id)return;
      state.task=await api(`/api/tasks/${id}/approve-community-targets`,{method:'POST',body:JSON.stringify({confirmed:true,expectedUpdatedAt:state.task.updatedAt})});
      renderTaskDetail();await downloadMaterialPackage();
    }catch(error){toast(error.message);}finally{if(button.isConnected){button.disabled=false;button.textContent='确认现有尺寸并输出';}}
  });
  document.querySelector("#back-dashboard")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    const saved = await flushPendingParameterSave();
    if (!saved) { button.disabled = false; return; }
    await saveTaskCoverPreview();
    const returnView=button.dataset.returnView||(taskWorkbenchRoutes[state.view]?state.view:'tasks');
    state.sourceImage = null; goDashboardView(returnView);
  });
  document.querySelector("#editor-undo")?.addEventListener("click", () => void stepEditorHistory("undo"));
  document.querySelector("#editor-redo")?.addEventListener("click", () => void stepEditorHistory("redo"));
  document.querySelector("#editor-align-center")?.addEventListener("click", centerEditorLayer);
  document.querySelector("#editor-toggle-guides")?.addEventListener("click", () => { state.showGuides = !state.showGuides; renderTaskDetail(); });
  document.querySelector("#editor-asset-search")?.addEventListener("input", (event) => { state.editorAssetQuery = event.target.value; filterEditorAssets(); });
  document.querySelector("#editor-asset-filter")?.addEventListener("change", (event) => { state.editorAssetFilter = event.target.value; filterEditorAssets(); });
  filterEditorAssets();
  document.querySelectorAll("[data-transition]").forEach((button) => button.addEventListener("click", () => transition(button.dataset.transition)));
  document.querySelectorAll("[data-param]").forEach((input) => input.addEventListener("input", () => {
    const key = input.dataset.param;
    state.task.parameters[key] = input.type === "range" ? Number(input.value) : input.value;
    const output = document.querySelector(`#${key}-value`);
    if (output) output.textContent = `${input.value}${input.dataset.suffix || ""}`;
    redrawPreview();
    scheduleParamsSave();
  }));
  document.querySelector("#param-show-text")?.addEventListener("change", (event) => { state.task.parameters.showText = event.target.checked; redrawPreview(); scheduleParamsSave(); });
  document.querySelector("#copy-control")?.addEventListener("input", (event) => { state.task.copy = event.target.value; redrawPreview(); scheduleParamsSave(); });
  document.querySelector("#save-params")?.addEventListener("click", saveParameters);
  document.querySelector("#toggle-params")?.addEventListener("click", () => { const drawer = document.querySelector("#parameters-drawer"); if (drawer) drawer.hidden = !drawer.hidden; });
  document.querySelector("#asset-upload").addEventListener("change", uploadAssets);
  document.querySelector("#import-kv-pack")?.addEventListener("click", importKvPack);
  document.querySelectorAll("[data-delete-asset]").forEach((button) => button.addEventListener("click", (event) => { event.stopPropagation(); deleteAsset(decodeURIComponent(button.dataset.deleteAsset)); }));
  document.querySelectorAll("[data-primary-asset]").forEach((button) => button.addEventListener("click", () => setPrimaryAsset(decodeURIComponent(button.dataset.primaryAsset))));
  document.querySelectorAll("[data-apply-asset]").forEach((button) => button.addEventListener("click", () => applyCanvasAsset(decodeURIComponent(button.dataset.applyAsset), button.dataset.canvasRole)));
  document.querySelector("#render-local")?.addEventListener("click", renderArtifacts);
  document.querySelector("#queue-photoshop")?.addEventListener("click", queuePhotoshop);
  document.querySelector("#reject-visual")?.addEventListener("click", rejectVisual);
  document.querySelectorAll("[data-annotation-type]").forEach((button) => button.addEventListener("click", () => { state.annotationType = button.dataset.annotationType; renderTaskDetail(); }));
  document.querySelectorAll("[data-remove-object]").forEach((button) => button.addEventListener("click", () => { state.task.annotations.objects.splice(Number(button.dataset.removeObject), 1); renderTaskDetail(); }));
  document.querySelector("#save-annotations")?.addEventListener("click", saveAnnotations);
  document.querySelectorAll(".run-local-ai-trigger").forEach((button) => button.addEventListener("click", runLocalAi));
  document.querySelector("#undo-point")?.addEventListener("click", undoAnnotationPoint);
  document.querySelector("#cancel-polygon")?.addEventListener("click", cancelCurrentPolygon);
  document.querySelector("#undo-object")?.addEventListener("click", undoLastObject);
  document.querySelectorAll("[data-upload-kind]").forEach((button) => button.addEventListener("click", () => { document.querySelector("#asset-role").value = button.dataset.uploadKind; document.querySelector("#asset-upload").click(); }));
  document.querySelectorAll('[data-extract-psd]').forEach(button => button.addEventListener('click', async () => {
    button.disabled = true; button.textContent = '正在提取角色…';
    try {
      const task = await api(`/api/tasks/${state.task.id}/assets/extract-psd`, {method:'POST', body:JSON.stringify({name:decodeURIComponent(button.dataset.extractPsd),role:'character'})});
      state.task = task;
      Object.assign(state, await loadEditorImages(task, loadImage));
      state.previewMode = 'target';
      renderTaskDetail();
      const source = task.assets.find(asset => asset.name === decodeURIComponent(button.dataset.extractPsd));
      toast(source?.psdExtraction?.status === 'failed' ? source.psdExtraction.error : '角色已加入左侧素材库，可单独移动和缩放');
    } catch (error) { toast(error.message); button.disabled = false; button.textContent = '重试提取角色'; }
  }));
  document.querySelector("#editor-background-repair")?.addEventListener("click", () => toast("背景修补需要接入已授权的图像模型接口；当前不会伪造提交结果"));
  document.querySelector("#editor-character-cutout")?.addEventListener("click", openCharacterCutout);
  document.querySelectorAll('[data-cutout-asset]').forEach(button => button.addEventListener('click', event => { event.stopPropagation(); openCharacterCutout(decodeURIComponent(button.dataset.cutoutAsset)); }));
  document.querySelector("#close-character-cutout")?.addEventListener("click", () => document.querySelector("#character-cutout-dialog")?.close());
  document.querySelector("#cutout-source")?.addEventListener("change", changeCutoutSource);
  document.querySelector("#cutout-stage")?.addEventListener("click", addCutoutPoint);
  document.querySelector("#cutout-source-image")?.addEventListener("load", renderCutoutMarkers);
  document.querySelector("#clear-cutout-points")?.addEventListener("click", () => { state.cutoutPoints = []; renderCutoutMarkers(); });
  document.querySelector("#undo-cutout-point")?.addEventListener("click", () => { state.cutoutPoints.pop(); renderCutoutMarkers(); });
  document.querySelector("#run-character-cutout")?.addEventListener("click", runCharacterCutout);
  document.querySelector("#editor-download-single")?.addEventListener("click", downloadCurrentArtifact);
  document.querySelector("#editor-download-materials")?.addEventListener("click", downloadMaterialPackage);
  document.querySelector("#editor-submit-review")?.addEventListener("click", submitEditorForReview);
  document.querySelector("#editor-download-suite")?.addEventListener("click", approveAndDownloadSuite);
  document.querySelector("#editor-start-revision")?.addEventListener("click", async () => {
    try {
      state.task = await api(`/api/tasks/${state.task.id}/start-revision`, { method: "POST", body: "{}" });
      state.communityWorkspaceStage='master';state.previewTemplateId=state.task.masterTemplateId;
      renderTaskDetail();
      toast("已开始新版本；上一版交付 ZIP 已保留");
    } catch (error) { toast(error.message); }
  });
  document.querySelector("#editor-regenerate-suite")?.addEventListener("click", event => renderArtifacts(false,event.currentTarget));
  document.querySelectorAll("[data-remove-target]").forEach(button=>button.addEventListener("click",async()=>{button.disabled=true;try{await removeTargetSize(button.dataset.removeTarget);}catch(error){toast(error.message);}finally{if(button.isConnected)button.disabled=false;}}));
  document.querySelectorAll("[data-preview-template]").forEach((button) => button.addEventListener("click", () => { state.previewTemplateId = button.dataset.previewTemplate; localStorage.setItem(`community-last-template:${state.task.id}`, state.previewTemplateId); state.previewMode = "target"; renderTaskDetail(); }));
  document.querySelectorAll("[data-inspector-tab]").forEach((button) => button.addEventListener("click", () => { state.inspectorTab = button.dataset.inspectorTab; renderTaskDetail(); }));
  document.querySelectorAll("[data-inspector-element]").forEach((button) => button.addEventListener("click", () => { state.inspectorElement = button.dataset.inspectorElement; renderTaskDetail(); }));
  document.querySelectorAll("[data-layout-field]").forEach((input) => input.addEventListener("input", () => {if(input.value!=='')updateElementLayout(input.dataset.layoutField, Number(input.value));}));
  document.querySelector('#copyright-color-mode')?.addEventListener('change',event=>{
    state.task.parameters.elementEffectsUpdatedAt=new Date().toISOString();updateElementLayout('copyrightColorMode',copyrightColorMode(event.target.value));updateEditorPackageAction();
  });
  document.querySelectorAll("[data-background-field]").forEach((input) => input.addEventListener("input", () => updateBackgroundField(input.dataset.backgroundField, input.value)));
  document.querySelector("#outpaint-prompt")?.addEventListener("input", (event) => updateOutpaintPrompt(event.target.value));
  const promptControl = document.querySelector(".outpaint-prompt-control");
  if (promptControl) {
    const template = state.data.templates.find((item) => item.id === state.previewTemplateId) || state.task.masterTemplate;
    const selectedModel = getTemplateBackground(state.task, template).outpaintModel || "banana";
    promptControl.insertAdjacentHTML("beforebegin", `<label class="outpaint-model-control">智能扩图模型<select id="outpaint-model"><option value="banana" ${selectedModel === "banana" ? "selected" : ""}>Nano Banana Pro（推荐）</option><option value="rh" ${selectedModel === "rh" ? "selected" : ""}>RH 定向扩图</option></select><small>严格使用所选模型，失败不自动切换。保留原图、禁止模糊填充；生成后请检查画风与接缝。</small></label>`);
    document.querySelector("#outpaint-model")?.addEventListener("change", (event) => updateOutpaintModel(event.target.value));
  }
  document.querySelector("#allow-outpaint-subjects")?.addEventListener("change", (event) => updateOutpaintSubjectPolicy(event.target.checked));
  document.querySelectorAll("[data-element-scale]").forEach((input) => input.addEventListener("input", () => {if(input.value!==''&&Number.isFinite(Number(input.value)))setElementScale(Number(input.value));}));
  document.querySelector("#layout-visible")?.addEventListener("change", (event) => updateElementLayout("visible", event.target.checked));
  document.querySelector("#layout-flip-x")?.addEventListener("change", (event) => updateElementLayout("flipX", event.target.checked));
  document.querySelector('#add-subtitle-backing')?.addEventListener('click',()=>void addSubtitleBacking());
  document.querySelectorAll('[data-backing-field]').forEach(input=>input.addEventListener(input.tagName==='SELECT'?'change':'input',()=>{
    updateSubtitleBacking(input.dataset.backingField,input.value);
    if(input.dataset.backingField==='shape')renderTaskDetail();
  }));
  document.querySelector('#remove-subtitle-backing')?.addEventListener('click',async()=>{
    const template=state.data.templates.find(item=>item.id===state.previewTemplateId);
    const layout=getElementLayout(state.task,template,'subtitle-backing');
    state.task.parameters.layoutByTemplate[template.id]['subtitle-backing']={...layout,visible:false,backing:{...layout.backing,enabled:false}};
    state.task.parameters.elementEffectsUpdatedAt=new Date().toISOString();
    if(!await saveParameters(true))return;
    state.inspectorElement='subtitle';renderTaskDetail();toast('已移除承托区域');
  });
  document.querySelectorAll("[data-effect-field]").forEach((input) => input.addEventListener(input.type === "checkbox" ? "change" : "input", () => {
    updateElementEffect(input.dataset.effectField, input.type === "checkbox" ? input.checked : input.value);
    if (input.type === "checkbox") {
      const card = input.closest(".element-effect-card");
      card?.classList.toggle("enabled", input.checked);
      card?.querySelectorAll(".element-effect-fields input").forEach(field => { field.disabled = !input.checked; });
    }
  }));
  document.querySelector("#canvas-scale-down")?.addEventListener("click", () => setElementScale(selectedScalePercent() - 5, true));
  document.querySelector("#canvas-scale-up")?.addEventListener("click", () => setElementScale(selectedScalePercent() + 5, true));
  document.querySelector("#canvas-scale-reset")?.addEventListener("click", () => setElementScale(100, true));
  document.querySelector("#editor-smart-expand")?.addEventListener("click", toggleSmartExpand);
  document.querySelector("#editor-import-expand")?.addEventListener("click", () => document.querySelector("#editor-import-expand-file")?.click());
  document.querySelector("#editor-import-expand-file")?.addEventListener("change", importOutpaintCandidate);
  document.querySelector("#restore-template-background")?.addEventListener("click", restoreTemplateBackground);
  document.querySelector("#editor-auto-layout")?.addEventListener("click", () => autoApplyAllTemplates());
  document.querySelector("#editor-layout-advice")?.addEventListener("click", () => toast("已按当前资源位显示核心区和页面UI遮挡区"));
  const sizeList = document.querySelector(".target-size-list");
  if (sizeList) {
    const buttons = document.querySelectorAll("[data-target-scroll]");
    const updateScrollButtons = () => buttons.forEach(button => {
      button.disabled = Number(button.dataset.targetScroll) < 0
        ? sizeList.scrollLeft <= 1
        : sizeList.scrollLeft + sizeList.clientWidth >= sizeList.scrollWidth - 1;
    });
    buttons.forEach(button => button.addEventListener("click", () => {
      sizeList.scrollBy({left: Number(button.dataset.targetScroll) * sizeList.clientWidth * .75, behavior: "smooth"});
    }));
    sizeList.addEventListener("scroll", updateScrollButtons, {passive: true});
    sizeList.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
      event.preventDefault();
      sizeList.scrollBy({ left: (event.key === "ArrowLeft" ? -1 : 1) * sizeList.clientWidth * .75, behavior: "smooth" });
    });
    sizeList.addEventListener("wheel", event => {
      if (event.ctrlKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? sizeList.clientWidth : 1);
      const canScroll = delta < 0 ? sizeList.scrollLeft > 0 : sizeList.scrollLeft + sizeList.clientWidth < sizeList.scrollWidth - 1;
      if (canScroll) { event.preventDefault(); sizeList.scrollLeft += delta; }
    }, {passive: false});
    requestAnimationFrame(updateScrollButtons);
    const observer = new ResizeObserver(() => {
      if (!sizeList.isConnected) { observer.disconnect(); return; }
      updateScrollButtons();
    });
    observer.observe(sizeList);
  }
  document.querySelector("#editor-add-size")?.addEventListener("click", () => document.querySelector("#add-size-dialog")?.showModal());
  document.querySelector("#close-add-size")?.addEventListener("click", () => document.querySelector("#add-size-dialog")?.close());
  document.querySelector("#cancel-add-size")?.addEventListener("click", () => document.querySelector("#add-size-dialog")?.close());
  document.querySelector("#add-size-form")?.addEventListener("submit", addTargetSizes);
  bindTargetSizeDialog(document.querySelector('#add-size-dialog'));
  wireCanvasEditing();
  wireObjectDrawing();
}

function resolveBackgroundSourceUrl(task, template) {
  // 重试扩图始终从原始KV开始，避免把上一次AI结果继续送入模型造成逐代劣化。
  const name = selectedAssetName(task, template, "background");
  return task.assets.find((asset) => asset.name === name && isRenderableImageAsset(asset))?.url || state.sourceAsset?.url || "";
}

async function pollOutpaintUntilSettled(taskId, deadline = 600_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < deadline) {
    const fresh = await api(`/api/tasks/${taskId}`);
    if (fresh.outpaint?.status !== "running") return fresh;
    await new Promise((resolve) => setTimeout(resolve, 2500));
  }
  return null;
}

async function hydrateOutpaintImages(task) {
  const saved = Object.entries(task?.parameters?.backgroundByTemplate || {}).filter(([, item]) => item?.url);
  await Promise.all(saved.map(async ([templateId, item]) => {
    try { state.assetImages.set(`__outpaint_${templateId}`, await loadImage(item.url)); } catch {}
  }));
}

// 页面打开时遇到 running 状态的扩图任务 → 后台轮询到终态后刷新
function scheduleOutpaintPoll() {
  if (state.outpaintPolling) return;
  const taskId = state.task?.id;
  if (!taskId || state.task?.outpaint?.status !== "running") return;
  state.outpaintPolling = true;
  pollOutpaintUntilSettled(taskId).then(async (fresh) => {
    state.outpaintPolling = false;
    if (!fresh?.id) return toast("扩图仍在进行或已超时，请稍后在任务中查看");
    const stored = state.data.tasks.findIndex((task) => task.id === fresh.id);
    if (stored >= 0) state.data.tasks[stored] = fresh;
    if (!state.task || state.task.id !== fresh.id) return;
    state.task = fresh;
    await hydrateOutpaintImages(fresh);
    renderTaskDetail();
    toast(fresh.outpaint?.status === "completed" ? "AI 扩图已完成" : `AI 扩图失败：${fresh.outpaint?.error || "未知原因"}`);
  }).catch(() => { state.outpaintPolling = false; });
}

// “✣ 智能扩图”：只允许使用真实生成式扩图。生产画布禁止镜像/拉伸兜底。
async function toggleSmartExpand() {
  const template = state.data.templates.find((item) => item.id === state.previewTemplateId) || state.task.masterTemplate;
  const button = document.querySelector("#editor-smart-expand");
  const current = getTemplateBackground(state.task, template);
  if (current.url && !confirm(`将使用当前关键词重新生成“${template.name}”的扩图。生成失败时会保留现在这一版，是否继续？`)) return;
  if (!state.data.aiHuabu?.enabled) {
    return toast("AI 扩图模型尚未启用，画布不会使用镜像或拉伸代替");
  }
  const sourceUrl = resolveBackgroundSourceUrl(state.task, template);
  if (!sourceUrl) return toast("请先为当前资源位选择背景素材");
  if (button) { button.disabled = true; button.textContent = "⏳ AI 扩图中…"; }
  try {
    const result = await api(`/api/tasks/${state.task.id}/outpaint`, { method: "POST", body: JSON.stringify({ templateId: template.id, model: current.outpaintModel || "banana", sourceUrl, prompt: current.outpaintPrompt || "", allowNewSubjects: current.allowNewSubjects === true }) });
    if (result.outpaint?.status === "running" || result.message?.includes("正在执行")) {
      toast("该资源位扩图正在执行，完成后将自动刷新");
      scheduleOutpaintPoll();
      return;
    }
    if (result.message) {
      toast(result.message); // 无需扩图（背景已覆盖画布）
    } else {
      const stored = state.data.tasks.findIndex((task) => task.id === result.id);
      if (stored >= 0) state.data.tasks[stored] = result;
      state.task = result;
      await hydrateOutpaintImages(result);
      toast("AI 扩图已完成，已设为该资源位背景");
    }
    renderTaskDetail();
  } catch (error) {
    // Do not present mirrored edge filling as an AI result. It duplicates people,
    // text and logos, and is unsuitable for production KV delivery.
    renderTaskDetail();
    toast(`AI 扩图失败：${error.message}。已保留当前版本，未使用镜像兜底`);
  }
}

async function importOutpaintCandidate(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const template = state.data.templates.find(item => item.id === state.previewTemplateId) || state.task.masterTemplate;
  const sourceUrl = resolveBackgroundSourceUrl(state.task, template);
  if (!sourceUrl) { event.target.value = ""; return toast("请先选择原始背景素材"); }
  try {
    const updated = await api(`/api/tasks/${state.task.id}/outpaint/import-candidate`, {
      method: "POST", body: JSON.stringify({ templateId:template.id, sourceUrl, dataUrl:await fileToDataUrl(file) }),
    });
    const index = state.data.tasks.findIndex(item => item.id === updated.id);
    if (index >= 0) state.data.tasks[index] = updated;
    state.task = updated;
    await hydrateOutpaintImages(updated);
    renderTaskDetail();
    toast("扩图候选已导入，请检查画风与接缝");
  } catch (error) { toast(`候选导入失败：${error.message}`); }
  finally { event.target.value = ""; }
}

async function restoreTemplateBackground() {
  const template = state.data.templates.find((item) => item.id === state.previewTemplateId) || state.task.masterTemplate;
  const stored = { ...(state.task.parameters?.backgroundByTemplate?.[template.id] || {}) };
  const originalPlacement = stored.originalPlacement;
  delete stored.url;
  delete stored.modelUsed;
  delete stored.pipelineVersion;
  delete stored.qualityStatus;
  delete stored.registration;
  delete stored.originalPlacement;
  delete stored.sourceAssetName;
  delete stored.safetyMethod;
  delete stored.safetyPolicy;
  if (originalPlacement) {
    stored.focalX = Number(originalPlacement.focalX ?? stored.focalX ?? 50);
    stored.focalY = Number(originalPlacement.focalY ?? stored.focalY ?? 50);
    // Restoring the original must visibly return to a normal full-canvas crop.
    // Reusing a sub-100% outpaint placement leaves exposed side gaps and looks
    // indistinguishable from a failed extension.
    stored.scale = Math.max(100, Number(originalPlacement.scale ?? stored.scale ?? 100));
  }
  state.task.parameters.backgroundByTemplate ||= {};
  state.task.parameters.backgroundByTemplate[template.id] = { ...stored, smartExpand: false };
  try {
    state.task = await api(`/api/tasks/${state.task.id}`, { method: "PATCH", body: JSON.stringify({ parameters: state.task.parameters, copy: state.task.copy }) });
    state.assetImages.delete(`__outpaint_${template.id}`);
    renderTaskDetail();
    toast(`已恢复“${template.name}”的原始KV背景；扩图文件仍保留在任务记录中`);
  } catch (error) {
    toast(`恢复原图失败：${error.message}`);
  }
}

function referenceAssetsForTemplate(task, template) {
  const portrait = template.height > template.width;
  const completeRoles = portrait ? ["master-portrait", "master", "master-landscape"] : ["master-landscape", "master", "master-portrait"];
  const cleanRoles = portrait ? ["background-portrait", "clean-kv", "background", "background-landscape"] : ["background-landscape", "clean-kv", "background", "background-portrait"];
  const pick = (roles) => roles.map((role) => task.assets.find((asset) => asset.role === role && asset.mime?.startsWith("image/"))).find(Boolean);
  return { complete: pick(completeRoles), clean: pick(cleanRoles) };
}

function imageDifferenceMap(completeImage, cleanImage, width = 128, height = 80) {
  if (!completeImage || !cleanImage) return null;
  const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(completeImage, 0, 0, width, height);
  const complete = ctx.getImageData(0, 0, width, height).data;
  ctx.clearRect(0, 0, width, height); ctx.drawImage(cleanImage, 0, 0, width, height);
  const clean = ctx.getImageData(0, 0, width, height).data;
  const values = new Float32Array(width * height);
  for (let pixel = 0, offset = 0; pixel < values.length; pixel += 1, offset += 4) {
    values[pixel] = (Math.abs(complete[offset] - clean[offset]) + Math.abs(complete[offset + 1] - clean[offset + 1]) + Math.abs(complete[offset + 2] - clean[offset + 2])) / 765;
  }
  return { values, width, height };
}

function averageDifference(map, bounds, template) {
  if (!map || !bounds) return 0;
  const x0 = Math.max(0, Math.floor(bounds.x / template.width * map.width));
  const y0 = Math.max(0, Math.floor(bounds.y / template.height * map.height));
  const x1 = Math.min(map.width, Math.ceil((bounds.x + bounds.width) / template.width * map.width));
  const y1 = Math.min(map.height, Math.ceil((bounds.y + bounds.height) / template.height * map.height));
  let total = 0; let count = 0;
  for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) { total += map.values[y * map.width + x]; count += 1; }
  return count ? total / count : 0;
}

function choosePsdVariant(task, template) {
  const rule = state.data.psdLayoutRules?.templates?.find((item) => item.templateId === template.id);
  const variants = rule?.variants || [];
  if (variants.length <= 1) return variants[0] || null;
  const { complete, clean } = referenceAssetsForTemplate(task, template);
  const diff = imageDifferenceMap(state.assetImages.get(complete?.name), state.assetImages.get(clean?.name));
  const titleAssets = task.assets.filter((asset) => asset.role === "title" && asset.mime?.startsWith("image/"));
  const has = (role) => task.assets.some((asset) => asset.role === role || (role === "ip" && asset.role === "ip-copyright"));
  const scored = variants.map((variant, order) => {
    let score = -order * 0.0001;
    for (const [type, weight] of [["copy", 5], ["logo", 3], ["ip", 1.5], ["button", 1.5]]) {
      const region = variant.regions?.find((item) => item.type === type && item.bounds);
      if (region) score += averageDifference(diff, region.bounds, template) * weight;
      if (region && type !== "copy" && has(type)) score += .05;
    }
    const copy = variant.regions?.find((item) => item.type === "copy" && item.bounds)?.bounds;
    if (copy && titleAssets.length) {
      const chosen = closestAspectAsset(titleAssets, copy.width / copy.height, "title");
      const ratio = assetAspect(chosen);
      if (ratio) score -= Math.abs(Math.log(ratio / (copy.width / copy.height))) * .08;
    }
    return { variant, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.variant || variants[0];
}

async function autoSelectPsdVariants(task) {
  task.parameters ||= {};
  task.parameters.variantByTemplate ||= {};
  for (const template of task.templates) {
    const variant = choosePsdVariant(task, template);
    if (variant) task.parameters.variantByTemplate[template.id] = variant.id;
  }
}

async function autoApplyAllTemplates(askConfirmation = true) {
  if (state.task.templates.some((template) => template.communityPlacement)) return autoApplyCommunityTemplates(askConfirmation);
  if (askConfirmation && !confirm("将按新版PSD规则重新分析横/竖完整KV，自动选择版式并匹配纯图背景、主标、副标、Logo、IP和按钮。是否继续？")) return;
  const preservedButtons = Object.fromEntries(Object.entries(state.task.parameters?.assetByTemplate || {}).filter(([, value]) => value?.button).map(([id, value]) => [id, value.button]));
  if (state.task.templates.some((template) => template.renderMode === "masked-popup") && !state.task.localAi?.outputs?.some((item) => item.kind === "foreground")) {
    toast("正在为弹窗准备人物破框层…");
    state.task = await api(`/api/tasks/${state.task.id}/local-ai/preprocess`, { method: "POST", body: "{}" });
    await Promise.all((state.task.localAi?.outputs || []).filter((asset) => asset.url).map(async (asset) => { try { state.assetImages.set(asset.name, await loadImage(asset.url)); } catch {} }));
  }
  const params = state.task.parameters;
  params.assetByTemplate = {};
  params.layoutByTemplate = {};
  params.backgroundByTemplate = {};
  params.variantByTemplate = {};
  params.focalX = 50;
  params.focalY = 50;
  params.scale = 100;
  try {
    await autoSelectPsdVariants(state.task);
    for (const template of state.task.templates) {
      const asset = automaticAsset(state.task, template, "background");
      const image = state.assetImages.get(asset?.name);
      let scale = 100;
      if (image?.naturalWidth && image?.naturalHeight) {
        const cover = Math.max(template.width / image.naturalWidth, template.height / image.naturalHeight);
        const contain = Math.min(template.width / image.naturalWidth, template.height / image.naturalHeight);
        scale = Math.max(50, Math.min(100, Math.round(contain / cover * 100)));
      }
      params.backgroundByTemplate[template.id] = { focalX: 50, focalY: 50, scale, smartExpand: false, url: "", outpaintPrompt: "", allowNewSubjects: false };
      const buttonName = preservedButtons[template.id];
      if (buttonName && state.task.assets.some((item) => item.name === buttonName)) {
        params.assetByTemplate[template.id] ||= {};
        params.assetByTemplate[template.id].button = buttonName;
      }
    }
    if (!await saveParameters(true)) return;
    state.inspectorElement = "background";
    renderTaskDetail();
    toast(`已根据完整KV自动选择版式并套用 ${state.task.templates.length} 个尺寸`);
  } catch (error) {
    toast(error.message);
  }
}

async function removeTargetSize(templateId) {
  if(!await flushPendingParameterSave())throw Error('当前构图尚未保存，请稍后重试');
  const task=state.task,next=nextTargetAfterRemoval(task.targetTemplateIds,state.previewTemplateId,templateId);
  const saved=await api(`/api/tasks/${task.id}/target-sizes`,{method:'POST',body:JSON.stringify({action:'remove',templateIds:[templateId],expectedUpdatedAt:task.updatedAt})});
  const stored=state.data.tasks.findIndex(t=>t.id===saved.id);if(stored>=0)state.data.tasks[stored]=saved;
  if(state.task?.id!==saved.id)return;
  state.task=saved;state.previewTemplateId=next;state.previewMode='target';
  localStorage.setItem(`community-last-template:${saved.id}`,next);
  renderTaskDetail();toast('已移除尺寸，素材与历史排版已保留');
}

async function addTargetSizes(event) {
  event.preventDefault();
  const form=event.currentTarget,values=new FormData(form),custom=form.dataset.mode==='custom',selected=custom?[]:[...values.getAll('templateIds')],submit=form.querySelector('[type=submit]'),errorBox=form.querySelector('[role=alert]');
  if(submit.disabled)return;
  errorBox.hidden=true;submit.disabled=true;
  try {
    const customSizes=custom?[customCanvasSpec(Object.fromEntries(values))]:[];
    if(!custom&&!selected.length)throw Error('请至少选择一个目标尺寸');
    if(!await flushPendingParameterSave())throw Error('当前构图尚未保存，请稍后重试');
    const previous=new Set(state.task.targetTemplateIds);
    state.task = await api(`/api/tasks/${state.task.id}/target-sizes`, { method: 'POST', body: JSON.stringify({templateIds:selected,customSizes,expectedUpdatedAt:state.task.updatedAt}) });
    const added=state.task.targetTemplateIds.filter(id=>!previous.has(id));
    installCustomEditorTemplate(state.task);
    const stored = state.data.tasks.findIndex((task) => task.id === state.task.id);
    if (stored >= 0) state.data.tasks[stored] = state.task;
    state.previewTemplateId = added[0]||state.previewTemplateId;
    state.previewMode = "target";
    renderTaskDetail();
    toast(added.length?`已添加 ${added.length} 个目标尺寸；可在右侧调整构图或延展新增尺寸`:'该尺寸已在当前任务中');
  } catch (error) { errorBox.textContent=error.message;errorBox.hidden=false; }finally{if(submit.isConnected)submit.disabled=false;}
}

function scheduleParamsSave() {
  recordEditorHistory();
  clearTimeout(state.paramsSaveTimer);
  state.paramsSaveTimer = setTimeout(() => { state.paramsSaveTimer = null; void saveParameters(true); }, 900);
}

function flushPendingParameterSave() {
  if (state.paramsSaveTimer) return saveParameters(true);
  return state.paramsSavePromise;
}

async function autoApplyCommunityTemplates(askConfirmation = true) {
  if(state.task.communityGeneration?.status==='running' || state.task.outpaint?.status==='running'){toast('生成尚未结束，请稍候再重排');return false;}
  clearTimeout(state.paramsSaveTimer);
  if(!await saveParameters(true))return false;
  const task = state.task;
  const master = task.masterTemplate;
  if (!master?.communityPlacement) { toast("请先选择社区外媒母稿尺寸"); return false; }
  if (!task.communityMasterApproval?.fingerprint) { toast("请先完成并确认母稿，再套用全部尺寸"); return false; }
  if (askConfirmation && task.parameters?.communityAutoLayoutAt && !confirm("将同步当前确认母版的素材，并重排其它尺寸的人物、文案和 Logo。母版保持不变，目标尺寸的手工位置会更新。确定重排吗？")) return false;
  const kinds = ["character", "character2", "foreground", "title", "subtitle", "logo", "ip-copyright"];
  const masterAssets=Object.fromEntries(['background',...kinds].map(kind=>[kind,selectedAssetName(task,master,kind) || null]));
  const layoutByTemplate={};
  const baseLayout = (template, kind) => {
    const layout = defaultElementLayout(template, kind);
    if (kind === "title" && masterAssets.subtitle) layout.height *= .72;
    return layout;
  };
  for (const template of task.templates) {
    if (template.id === master.id || !template.communityPlacement) continue;
    if(popupConfig(task,template))continue;
    const targetLayouts = layoutByTemplate[template.id] = {};
    for (const kind of kinds) {
      if (!templateAllowsElement(task, template, kind)) {
        continue;
      }
      targetLayouts[kind] = remapCommunityLayer(
        master, template, baseLayout(master, kind), baseLayout(template, kind), getElementLayout(task, master, kind),{preserveAspect:['character','character2'].includes(kind)},
      );
    }
    const backing=remapCommunitySubtitleBacking(master,template,getElementLayout(task,master,'subtitle'),targetLayouts.subtitle,task.parameters?.layoutByTemplate?.[master.id]?.['subtitle-backing']);
    if(backing){
      targetLayouts['subtitle-backing']={...backing,scaleBaseWidth:backing.width,scaleBaseHeight:backing.height};
      const alignment=getElementLayout(task,master,'subtitle').backingAlignment;
      const body=backing.backing?.assetName && (alignment?.assetName===backing.backing.assetName?alignment.contentRect:backing.backing.contentRect);
      if(body && targetLayouts.subtitle)targetLayouts.subtitle={...targetLayouts.subtitle,x:backing.x+backing.width*body.x,y:backing.y+backing.height*body.y,width:backing.width*body.width,height:backing.height*body.height,align:'center',verticalAlign:'middle'};
    }
  }
  try {
    state.task=await api(`/api/tasks/${task.id}/reflow-community-targets`,{method:'POST',body:JSON.stringify({masterFingerprint:task.communityMasterApproval.fingerprint,masterAssets,layoutByTemplate})});
    await Promise.all(state.task.assets.filter(asset=>isRenderableImageAsset(asset)&&!state.assetImages.has(asset.name)).map(async asset=>state.assetImages.set(asset.name,await loadImage(asset.url))));
    state.previewTemplateId = task.templates.find((template) => template.id !== master.id)?.id || master.id;
    state.previewMode = "target";state.inspectorElement = "background";
    renderTaskDetail();
    toast(`已按确认母版同步背景、人物与文案，并重排 ${Object.keys(layoutByTemplate).length} 个尺寸`);
    return true;
  }catch(error){toast(error.message);return false;}
}

function editorGeometrySnapshot() {
  const parameters = state.task?.parameters || {};
  const backgrounds = Object.fromEntries(Object.entries(parameters.backgroundByTemplate || {}).map(([id, value]) => [id, {
    focalX: value.focalX, focalY: value.focalY, scale: value.scale,
  }]));
  return JSON.stringify({ layoutByTemplate: parameters.layoutByTemplate || {}, backgrounds,communityObjectLayersByTemplate:parameters.communityObjectLayersByTemplate||{} });
}

function ensureEditorHistory() {
  if (!state.task) return;
  if (state.editorHistory?.taskId !== state.task.id) {
    state.editorHistory = { taskId: state.task.id, current: editorGeometrySnapshot(), undo: [], redo: [] };
  }
}

function recordEditorHistory() {
  ensureEditorHistory();
  const history = state.editorHistory;
  if (!history) return;
  const current = editorGeometrySnapshot();
  if (current === history.current) return;
  history.undo.push(history.current);
  if (history.undo.length > 40) history.undo.shift();
  history.current = current;
  history.redo = [];
  const undo = document.querySelector("#editor-undo");
  const redo = document.querySelector("#editor-redo");
  if (undo) undo.disabled = false;
  if (redo) redo.disabled = true;
}

async function stepEditorHistory(direction) {
  ensureEditorHistory();
  const history = state.editorHistory;
  const from = direction === "undo" ? history.undo : history.redo;
  const to = direction === "undo" ? history.redo : history.undo;
  if (!from.length) return;
  clearTimeout(state.paramsSaveTimer);
  to.push(history.current);
  history.current = from.pop();
  const snapshot = JSON.parse(history.current);
  const parameters = state.task.parameters ||= {};
  parameters.layoutByTemplate = snapshot.layoutByTemplate;
  parameters.communityObjectLayersByTemplate=snapshot.communityObjectLayersByTemplate||{};
  parameters.backgroundByTemplate ||= {};
  for (const background of Object.values(parameters.backgroundByTemplate)) {
    delete background.focalX; delete background.focalY; delete background.scale;
  }
  for (const [id, placement] of Object.entries(snapshot.backgrounds)) {
    parameters.backgroundByTemplate[id] = { ...parameters.backgroundByTemplate[id], ...placement };
  }
  await saveParameters();
  renderTaskDetail();
}

function centerEditorLayer() {
  const template = state.data.templates.find((item) => item.id === state.previewTemplateId) || state.task.masterTemplate;
  if (state.inspectorElement === "background") updateBackgroundField("focalX", 50);
  else {
    if (!hasCanvasAsset(state.inspectorElement, template)) return toast("请先在当前尺寸添加该图层内容");
    const layout = getElementLayout(state.task, template, state.inspectorElement);
    updateElementLayout("x", Math.round((template.width - layout.width) / 2));
  }
  renderTaskDetail();
  toast("当前图层已水平居中");
}

function filterEditorAssets() {
  const query = state.editorAssetQuery.trim().toLowerCase();
  document.querySelectorAll("[data-editor-asset-group]").forEach((group) => {
    let matches = 0;
    group.querySelectorAll("[data-editor-asset-name]").forEach((item) => {
      item.hidden = Boolean(query && !item.dataset.editorAssetName.includes(query));
      if (!item.hidden) matches++;
    });
    group.hidden = (state.editorAssetFilter !== "全部" && group.dataset.editorAssetGroup !== state.editorAssetFilter) || Boolean(query && !matches);
  });
}

async function deleteAsset(name) {
  if (!confirm(`确定删除素材“${name}”吗？素材将移至回收站，当前画布和历史版本使用的文件会继续保留。`)) return;
  try {
    if (!await flushPendingParameterSave()) return;
    const taskId = state.task.id;
    const saved = await api(`/api/tasks/${taskId}/assets/${encodeURIComponent(name)}`, {method:"DELETE"});
    if(state.task?.id !== taskId)return;
    state.task = {...saved,parameters:state.task.parameters,copy:state.task.copy};
    state.sourceAsset = preferredSourceAsset(state.task);
    state.sourceImage = state.sourceAsset ? await loadImage(state.sourceAsset.url) : null;
    state.polygonPoints = [];
    renderTaskDetail();
    toast("素材已移至回收站");
  } catch (error) { toast(error.message); }
}

async function setPrimaryAsset(name) {
  try { state.task = await api(`/api/tasks/${state.task.id}/assets/${encodeURIComponent(name)}/primary`, {method:"PUT"}); state.previewMode = "target"; state.sourceAsset = preferredSourceAsset(state.task); state.sourceImage = await loadImage(state.sourceAsset.url); state.polygonPoints = []; renderTaskDetail(); toast(`已设为当前背景：${name}`); } catch(error) { toast(error.message); }
}

function roleToElement(role) {
  if (["clean-kv", "background", "background-landscape", "background-portrait"].includes(role)) return "background";
  if (role === "title") return "title";
  if (role === "subtitle") return "subtitle";
  if (role === "foreground") return "foreground";
  if (role === "logo") return "logo";
  if (["copyright", "ip-copyright"].includes(role)) return "ip-copyright";
  if (role === "button") return "button";
  if (["character", "core-character"].includes(role)) return "character";
  return null;
}

async function applyCanvasAsset(name, role, point = null) {
  let kind = roleToElement(role);
  if (!kind) return toast("该素材需要先完成对象拆分，当前暂不能作为独立图层放入画布");
  const template = state.data.templates.find((item) => item.id === state.previewTemplateId);
  if (!template) return;
  if (kind === "character" && template.communityPlacement && templateAllowsElement(state.task,template,"character2")
    && selectedAssetName(state.task,template,"character") !== name) kind = "character2";
  if (!templateAllowsElement(state.task, template, kind)) return toast(template.communityPlacement ? `“${template.name}”的规则不使用${assetRoleName(role)}，当前尺寸不会添加` : `自动选择的PSD版式未定义${assetRoleName(role)}区域，当前尺寸不会添加该元素`);
  const asset = state.task.assets.find((item) => item.name === name && isRenderableImageAsset(item))
    || (kind === "character" ? (state.task.localAi?.outputs || []).find((item) => item.name === name && isProductionForeground(item)) : null);
  if (asset && !state.assetImages.has(asset.name)) {
    try { state.assetImages.set(asset.name, await loadImage(asset.url)); }
    catch { return toast(`无法加载素材：${name}`); }
  }
  if (!asset) return toast(`未找到素材：${name}`);
  state.task.parameters.assetByTemplate ||= {};
  state.task.parameters.assetByTemplate[template.id] ||= {};
  state.task.parameters.assetByTemplate[template.id][kind] = name;
  if (kind === "character" && asset.sourceAssetName && asset.derived) {
    // A generated transparent layer is paired with the original orientation.
    // The renderer will replace that original with its reviewed character-free background.
    state.task.parameters.assetByTemplate[template.id].background = asset.sourceAssetName;
  }
  if (kind === "background") {
    // An empty editor has no global fallback image yet. Keep the selection scoped
    // to this template, but seed the renderer so the first drop is visible.
    if (!state.sourceImage) {
      state.sourceAsset = asset;
      state.sourceImage = state.assetImages.get(asset.name);
    }
    state.inspectorElement = "background";
    state.previewMode = "target";
    scheduleParamsSave();
    renderTaskDetail();
    return toast(`已为“${template.name}”切换背景，其他尺寸不受影响`);
  }
  state.task.parameters.layoutByTemplate ||= {};
  state.task.parameters.layoutByTemplate[template.id] ||= {};
  const layout = getElementLayout(state.task, template, kind);
  layout.visible = true;
  if (point) {
    layout.x = Math.round(Math.max(-layout.width / 2, Math.min(template.width - layout.width / 2, point.x - layout.width / 2)));
    layout.y = Math.round(Math.max(-layout.height / 2, Math.min(template.height - layout.height / 2, point.y - layout.height / 2)));
  }
  state.task.parameters.layoutByTemplate[template.id][kind] = layout;
  state.inspectorElement = kind;
  state.previewMode = "target";
  scheduleParamsSave();
  renderTaskDetail();
  toast(point ? `已将${assetRoleName(role)}放入画布，可拖动和缩放` : `已使用${assetRoleName(role)}，可在画布中调整`);
}

async function removeCurrentCanvasElement() {
  const template = state.data.templates.find((item) => item.id === state.previewTemplateId) || state.task?.masterTemplate;
  const kind = state.inspectorElement;
  if (!template || kind === "background" || !templateAllowsElement(state.task, template, kind)) return;
  state.task.parameters.layoutByTemplate ||= {};
  state.task.parameters.layoutByTemplate[template.id] ||= {};
  state.task.parameters.layoutByTemplate[template.id][kind] = { ...getElementLayout(state.task, template, kind), visible: false };
  try {
    if (!await saveParameters(true)) return;
    state.inspectorElement = "background";
    renderTaskDetail();
    const label = ({ character: "角色 1", character2: "角色 2", foreground: "前景", title: "主标", subtitle: "副标", "subtitle-backing":"副标承托", logo: "Logo", "ip-copyright": "IP版权", button: "按钮" })[kind] || "元素";
    toast(`已从“${template.name}”移除${label}，其他尺寸不受影响`);
  } catch (error) { toast(error.message); }
}

function canvasEventPoint(event, canvas) {
  const rect = canvas.getBoundingClientRect();
  return { x: (event.clientX - rect.left) * canvas.width / rect.width, y: (event.clientY - rect.top) * canvas.height / rect.height };
}

function hasCanvasAsset(kind, template = state.data.templates.find((item) => item.id === state.previewTemplateId) || state.task.masterTemplate) {
  if (!templateAllowsElement(state.task, template, kind)) return false;
  if(kind==='subtitle-backing')return normalizeSubtitleBacking(getElementLayout(state.task,template,kind).backing).enabled;
  if(kind==="button"&&popupConfig(state.task,template)?.buttonVisible)return true;
  if(nativeCopyValue(state.task,template,kind))return true;
  const selectedName = selectedAssetName(state.task, template, kind);
  if (kind === "character" && template.renderMode === "masked-popup") {
    const layer = popupForegroundFor(template, getTemplateBackground(state.task, template));
    return Boolean(layer && state.assetImages.has(layer.name));
  }
  return Boolean(selectedName && state.task.assets.some((asset) => asset.mime?.startsWith("image/") && asset.name === selectedName));
}

function nativeCopyHitPoint(template,kind,box,point){
  if(!box.rotation || !nativeCopyValue(state.task,template,kind))return point;
  const body=box.contentRect || box,cx=body.x+body.width/2,cy=body.y+body.height/2;
  const angle=-box.rotation*Math.PI/180,dx=point.x-cx,dy=point.y-cy;
  return {x:cx+dx*Math.cos(angle)-dy*Math.sin(angle),y:cy+dx*Math.sin(angle)+dy*Math.cos(angle)};
}

function hitCanvasElement(template, point) {
  const selected=state.inspectorElement;
  if(selected!=='background'&&hasCanvasAsset(selected,template)){
    const box=getElementLayout(state.task,template,selected);
    const hit=nativeCopyHitPoint(template,selected,box,point);
    if(box.visible!==false&&hit.x>=box.x&&hit.x<=box.x+box.width&&hit.y>=box.y&&hit.y<=box.y+box.height){
      const image=['character','character2'].includes(selected)?characterSourceImage(state.task,template,selected):null;
      if(!['character','character2'].includes(selected)||(image&&characterPixelAt(image,box,point)))return selected;
    }
  }
  const nativeOrder=template.communityPlacement?['ip-copyright','subtitle','title'].filter(kind=>nativeCopyValue(state.task,template,kind)):[];
  const order = template.communityPlacement
    ? [...nativeOrder,"button", "ip-copyright", "logo", "subtitle", "title", "subtitle-backing", "foreground", "character2", "character"]
    : ["button", "ip-copyright", "logo", "subtitle", "title", "foreground", "character"];
  for (const kind of order) {
    if (!hasCanvasAsset(kind, template)) continue;
    const box = getElementLayout(state.task, template, kind);
    const hit=nativeCopyHitPoint(template,kind,box,point);
    if (box.visible === false || hit.x < box.x || hit.x > box.x + box.width || hit.y < box.y || hit.y > box.y + box.height) continue;
    if (["character","character2"].includes(kind)) {
      const image = characterSourceImage(state.task, template, kind);
      if (!image || !characterPixelAt(image, box, point)) continue;
    }
    return kind;
  }
  return "background";
}

const characterHitCache = new WeakMap();
function characterPixelAt(image, layout, point) {
  let sample = characterHitCache.get(image);
  if (!sample) {
    const canvas = document.createElement("canvas");
    const ratio = Math.min(1, 512 / Math.max(image.naturalWidth, image.naturalHeight));
    canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    sample = { width: canvas.width, height: canvas.height, pixels: ctx.getImageData(0, 0, canvas.width, canvas.height).data };
    characterHitCache.set(image, sample);
  }
  const fittedScale = Math.min(layout.width / image.naturalWidth, layout.height / image.naturalHeight);
  const fittedWidth = image.naturalWidth * fittedScale;
  const fittedHeight = image.naturalHeight * fittedScale;
  const fittedX = layout.x + (layout.width - fittedWidth) / 2;
  const fittedY = layout.y + (layout.height - fittedHeight) / 2;
  const sampleX = (point.x - fittedX) / fittedWidth;
  const x = layout.flipX === true ? sample.width - 1 - Math.floor(sampleX * sample.width) : Math.floor(sampleX * sample.width);
  const y = Math.floor((point.y - fittedY) / fittedHeight * sample.height);
  return x >= 0 && y >= 0 && x < sample.width && y < sample.height && sample.pixels[(y * sample.width + x) * 4 + 3] > 40;
}

function wireCanvasEditing() {
  const stage = document.querySelector("#editor-drop-stage");
  const canvas = document.querySelector("#preview-canvas");
  if (!stage || !canvas || state.previewMode !== "target") return;
  document.querySelectorAll("[data-canvas-asset]").forEach((button) => button.addEventListener("dragstart", (event) => {
    event.dataTransfer.effectAllowed = "copy";
    const payload = JSON.stringify({ name: decodeURIComponent(button.dataset.canvasAsset), role: button.dataset.canvasRole });
    event.dataTransfer.setData("application/x-workbench-asset", payload);
    // text/plain is retained by browsers/WebViews that discard custom drag MIME types.
    event.dataTransfer.setData("text/plain", payload);
    button.classList.add("is-dragging");
  }));
  document.querySelectorAll("[data-canvas-asset]").forEach((button) => button.addEventListener("dragend", () => {
    button.classList.remove("is-dragging");
    stage.classList.remove("drag-over");
  }));
  stage.addEventListener("dragover", (event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; stage.classList.add("drag-over"); });
  stage.addEventListener("dragleave", (event) => { if (!stage.contains(event.relatedTarget)) stage.classList.remove("drag-over"); });
  stage.addEventListener("drop", (event) => {
    event.preventDefault(); stage.classList.remove("drag-over");
    try {
      const raw = event.dataTransfer.getData("application/x-workbench-asset") || event.dataTransfer.getData("text/plain");
      if (!raw) throw new Error("empty drag payload");
      const payload = JSON.parse(raw);
      const point = canvas.style.display === "none" ? null : canvasEventPoint(event, canvas);
      void applyCanvasAsset(payload.name, payload.role, point);
    } catch { toast("无法识别拖入的素材"); }
  });
  canvas.addEventListener("pointerdown", (event) => {
    const template = state.data.templates.find((item) => item.id === state.previewTemplateId);
    if (!template || state.previewMode!=='target') return;
    canvas.focus({ preventScroll: true });
    const point = canvasEventPoint(event, canvas);
    const chosen = state.inspectorElement;
    const kind = template.renderMode === "masked-popup" && ["background", "character"].includes(chosen) && templateAllowsElement(state.task, template, chosen)
      ? chosen : hitCanvasElement(template, point);
    const background = getTemplateBackground(state.task, template);
    state.inspectorElement = kind;
    if (kind !== "background" && template.communityPlacement) state.communitySideTab = "elements";
    state.canvasDrag = { kind, templateId: template.id, start: point, focalX: background.focalX, focalY: background.focalY, layout: kind === "background" ? null : { ...getElementLayout(state.task, template, kind) } };
    canvas.setPointerCapture(event.pointerId);
    canvas.classList.add("is-dragging");
    redrawPreview();
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!state.canvasDrag) return;
    const template = state.data.templates.find((item) => item.id === state.previewTemplateId);
    const point = canvasEventPoint(event, canvas);
    const dx = point.x - state.canvasDrag.start.x;
    const dy = point.y - state.canvasDrag.start.y;
    if (state.canvasDrag.kind === "background") {
      state.task.parameters.backgroundByTemplate ||= {};
      state.task.parameters.backgroundByTemplate[template.id] = { ...getTemplateBackground(state.task, template), focalX: Math.max(0, Math.min(100, state.canvasDrag.focalX - dx / canvas.width * 100)), focalY: Math.max(0, Math.min(100, state.canvasDrag.focalY - dy / canvas.height * 100)) };
    } else {
      const kind = state.canvasDrag.kind;
      state.task.parameters.layoutByTemplate ||= {};
      state.task.parameters.layoutByTemplate[template.id] ||= {};
      let y = Math.round(state.canvasDrag.layout.y + dy);
      if (kind === "character" && template.renderMode === "masked-popup") {
        const layer = popupForegroundFor(template, getTemplateBackground(state.task, template));
        const image = layer && state.assetImages.get(layer.name);
        if (image && layer.subjectBounds?.y >= 0) {
          const minY = 8 - layer.subjectBounds.y / image.naturalHeight * state.canvasDrag.layout.height;
          y = Math.max(y, Math.ceil(minY));
        }
      }
      state.task.parameters.layoutByTemplate[template.id][kind] = { ...state.canvasDrag.layout, x: Math.round(state.canvasDrag.layout.x + dx), y };
    }
    redrawPreview();
  });
  const finishDrag = () => {
    if (!state.canvasDrag) return;
    const selectedKind = state.canvasDrag.kind;
    state.canvasDrag = null;
    canvas.classList.remove("is-dragging");
    scheduleParamsSave();
    renderTaskDetail();
    if (selectedKind !== "background") document.querySelector("#preview-canvas")?.focus({ preventScroll: true });
  };
  canvas.addEventListener("pointerup", finishDrag);
  canvas.addEventListener("pointercancel", finishDrag);
  canvas.addEventListener("wheel", (event) => { event.preventDefault(); setElementScale(selectedScalePercent() + (event.deltaY < 0 ? 5 : -5)); }, { passive: false });
}

function undoAnnotationPoint() {
  if (!state.polygonPoints.length) return;
  state.polygonPoints.pop();
  renderTaskDetail();
  toast("已撤销上一个标注点");
}

function cancelCurrentPolygon() {
  if (!state.polygonPoints.length) return;
  state.polygonPoints = [];
  renderTaskDetail();
  toast("已取消本次未完成标注");
}

function undoLastObject() {
  const objects = state.task?.annotations?.objects;
  if (!objects?.length) return;
  const removed = objects.pop();
  renderTaskDetail();
  toast(`已撤销：${removed.label || annotationTypes[removed.type]?.[0] || "上一个对象"}`);
}

function handleAnnotationShortcut(event) {
  if (!state.task || ["INPUT", "TEXTAREA", "SELECT"].includes(event.target?.tagName)) return;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") { event.preventDefault(); undoAnnotationPoint(); }
  else if (event.key === "Escape") { event.preventDefault(); cancelCurrentPolygon(); }
  else if (event.key === "Delete") {
    if (event.target?.id !== "preview-canvas") return;
    event.preventDefault();
    if (state.previewMode === "target" && state.inspectorElement !== "background") void removeCurrentCanvasElement();
    else undoLastObject();
  }
}

async function saveAnnotations() { state.task = await api(`/api/tasks/${state.task.id}/annotations`, {method:"PUT",body:JSON.stringify({objects:state.task.annotations.objects,activeType:state.annotationType})}); renderTaskDetail(); toast("对象标注已保存在本机"); }

async function runLocalAi() {
  const button = document.querySelector("#run-local-ai");
  button.disabled = true;
  button.textContent = "本地处理中…";
  try {
    state.task = await api(`/api/tasks/${state.task.id}/annotations`, { method: "PUT", body: JSON.stringify({ objects: state.task.annotations.objects, activeType: state.annotationType }) });
    state.task = await api(`/api/tasks/${state.task.id}/local-ai/preprocess`, { method: "POST", body: "{}" });
    renderTaskDetail();
    toast("本地拆分已完成，请检查透明对象与背景草稿");
  } catch (error) {
    renderTaskDetail();
    toast(error.message);
  }
}

async function rejectVisual() {
  try {
    await api(`/api/tasks/${state.task.id}`, { method: "PATCH", body: JSON.stringify({ status: "批量生成", by: "设计师", action: "成套视觉审核不通过" }) });
    await refresh();
    toast("已退回批量生成阶段，可直接重新生成");
  } catch (error) { toast(error.message); }
}

function wireObjectDrawing() {
  const canvas = document.querySelector("#preview-canvas");
  if (!canvas || !state.sourceImage || state.previewMode !== "source") return;
  const point = (event) => { const box = canvas.getBoundingClientRect(); return { x: (event.clientX - box.left) * canvas.width / box.width, y: (event.clientY - box.top) * canvas.height / box.height }; };
  canvas.addEventListener("click", (event) => { state.polygonPoints.push(point(event)); redrawPreview(); });
  canvas.addEventListener("dblclick", (event) => { event.preventDefault(); if (state.polygonPoints.length >= 3) { const label = annotationTypes[state.annotationType][0]; state.task.annotations.objects.push({ id: crypto.randomUUID(), type: state.annotationType, label: `${label}${state.task.annotations.objects.filter((item) => item.type === state.annotationType).length + 1}`, points: state.polygonPoints.map((p) => ({x:Math.round(p.x),y:Math.round(p.y)})), sourceTemplateId: state.previewTemplateId }); } state.polygonPoints = []; renderTaskDetail(); });
}

async function transition(next) {
  try {
    state.task = await api(`/api/tasks/${state.task.id}`, { method: "PATCH", body: JSON.stringify({ status: next, assignee: "设计师", by: "设计师", action: next === "已完成" ? "成套审核通过" : "推进任务" }) });
    await refresh();
    toast(`任务已进入：${next}`);
  } catch (error) { toast(error.message); }
}

async function saveParameters(silent = false) {
  if (!state.task) return false;
  if(isSourceAdaptation(state.task)&&state.task.sourceAdaptation)return true;
  clearTimeout(state.paramsSaveTimer);
  state.paramsSaveTimer = null;
  recordEditorHistory();
  const taskId = state.task.id;
  const payload = JSON.stringify({ parameters: state.task.parameters, copy: state.task.copy });
  const communitySaveVersion=state.task.masterTemplate?.communityMaster?state.task.updatedAt:null;
  const persist = async () => {
    try {
      const outgoing=JSON.parse(payload);
      if(communitySaveVersion)outgoing.expectedUpdatedAt=communitySaveVersion;
      const saved = await api(`/api/tasks/${taskId}`, { method: "PATCH", body: JSON.stringify(outgoing) });
      if (state.task?.id === taskId) {
        // Keep edits made while the request was in flight; the next queued save writes them.
        const current = JSON.stringify({ parameters: state.task.parameters, copy: state.task.copy });
        state.task = current === payload ? saved : { ...saved, parameters: state.task.parameters, copy: state.task.copy };
        const cached = state.data.tasks.findIndex((task) => task.id === taskId);
        if (cached >= 0) state.data.tasks[cached] = state.task;
      }
      if (!silent) toast("版式参数已保存");
      return true;
    } catch (error) { toast(error.message); return false; }
  };
  // Serialize full-parameters PATCH requests so an older response cannot overwrite a newer layout.
  state.paramsSavePromise = state.paramsSavePromise.then(persist, persist);
  return state.paramsSavePromise;
}

async function saveTaskCoverPreview() {
  if (state.task?.status === "已完成" && state.task?.deliveredPackage) return;
  if (!state.task?.templates?.some((template) => template.communityPlacement) || (!state.sourceImage && !state.assetImages.size)) return;
  const taskId = state.task.id;
  const template = state.data.templates.find((item) => item.id === state.task.masterTemplateId) || state.task.masterTemplate;
  if (!template) return;
  try {
    const composite = renderCanvas(template, false);
    const preview = document.createElement("canvas");
    const scale = Math.min(1, 800 / Math.max(composite.width, composite.height));
    preview.width = Math.max(1, Math.round(composite.width * scale));
    preview.height = Math.max(1, Math.round(composite.height * scale));
    const ctx = preview.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, preview.width, preview.height);
    ctx.drawImage(composite, 0, 0, preview.width, preview.height);
    const blob = await canvasBlob(preview, "image/jpeg", 0.82);
    const updated = await api(`/api/tasks/${taskId}/cover-preview`, { method: "POST", body: JSON.stringify({ templateId: template.id, dataUrl: await blobToDataUrl(blob) }) });
    if (state.task?.id === taskId) state.task.coverPreview = updated.coverPreview;
    const cached = state.data.tasks.find((item) => item.id === taskId);
    if (cached) cached.coverPreview = updated.coverPreview;
  } catch (error) {
    console.warn("首页完整画面预览保存失败", error);
  }
}

async function uploadCommunityInput(event, role) {
  const files = [...(event.target.files || [])];
  if (!files.length) return;
  await uploadCommunityFiles(files,role);
  event.target.value='';
}

function activeCommunityReferenceScope(){return state.task?.masterTemplate?.communityMaster?(state.task.parameters?.communityMaterialKind==='illustration'||!state.task.parameters?.communityMaterialKind?'illustration':'text'):null;}

async function removeScopedCommunityReference(name,scope,button){
  button.disabled=true;const id=state.task.id;
  try{
    if(!await flushPendingParameterSave()||state.task?.id!==id)return;
    const fresh=await api(`/api/tasks/${id}/community-material-references/${encodeURIComponent(name)}`,{method:'DELETE',body:JSON.stringify({scope,expectedUpdatedAt:state.task.updatedAt})});
    if(state.task?.id!==id)return;
    state.task={...fresh,copy:state.task.copy,parameters:{...fresh.parameters,subtitleText:state.task.parameters.subtitleText,communityMaterialDrafts:state.task.parameters.communityMaterialDrafts,communityMaterialKind:state.task.parameters.communityMaterialKind}};
    for(const key of state.communityPastedImages)if(key.startsWith(`${id}:reference-image:${scope}:`))state.communityPastedImages.delete(key);
    renderTaskDetail();toast('已移除当前参考图');
  }catch(error){toast(error.message);}finally{if(button.isConnected)button.disabled=false;}
}

async function pasteCommunityReference(event, role) {
  const referenceScope=activeCommunityReferenceScope();
  const clipboard = event.clipboardData;
  const supported = file => /^image\/(png|jpeg|webp)$/i.test(file?.type || '');
  const itemFiles = [...(clipboard?.items || [])].filter(item => item.kind === 'file' && supported(item)).map(item => item.getAsFile()).filter(Boolean);
  const files = itemFiles.length ? itemFiles : [...(clipboard?.files || [])].filter(supported);
  // Text pasted into the unified textarea must retain the browser's normal behavior.
  if (!files.length) return;
  event.preventDefault();
  const pending = [];
  const renamed = [];
  for (const file of files) {
    const bytes = await file.arrayBuffer();
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(value => value.toString(16).padStart(2,'0')).join('');
    const key = `${state.task.id}:${role}:${referenceScope||'legacy'}:${hash}`;
    if (state.communityPastedImages.has(key)) continue;
    state.communityPastedImages.add(key);
    pending.push(key);
    const extension = file.type === 'image/jpeg' ? 'jpg' : file.type === 'image/webp' ? 'webp' : 'png';
    renamed.push(new File([bytes],`剪贴板参考图-${crypto.randomUUID()}.${extension}`,{type:file.type}));
  }
  if (!renamed.length) return toast('这张图片已粘贴到当前参考区');
  const saved = await uploadCommunityFiles(renamed,role,referenceScope);
  if (!saved) pending.forEach(key => state.communityPastedImages.delete(key));
  else requestAnimationFrame(() => document.querySelector('#community-material-prompt,#community-image-prompt')?.focus({preventScroll:true}));
}

async function uploadCommunityFiles(files, role,referenceScope=activeCommunityReferenceScope()) {
  if(state.communityInputUploads){toast('参考图正在保存，请稍候再添加');return false;}
  const taskId = state.task.id;
  state.communityInputUploads = (state.communityInputUploads || 0) + 1;
  document.querySelector('#community-generate-master,#community-generate-material')?.setAttribute('disabled','');
  try {
    if (!await flushPendingParameterSave()) return false;
    const payload = await Promise.all(files.map(async file => ({name:file.name,dataUrl:await fileToDataUrl(file)})));
    const scoped=referenceScope&&['reference-image','reference-copy','reference-tone'].includes(role);
    const saved = await api(`/api/tasks/${taskId}/${scoped?'community-material-references':'assets'}`,{method:'POST',body:JSON.stringify({files:payload,role,...(scoped?{scope:referenceScope,expectedUpdatedAt:state.task.updatedAt}:{})})});
    if (state.task?.id !== taskId) return true;
    state.task = scoped?{...saved,copy:state.task.copy,parameters:{...saved.parameters,subtitleText:state.task.parameters.subtitleText,communityMaterialDrafts:state.task.parameters.communityMaterialDrafts,communityMaterialKind:state.task.parameters.communityMaterialKind}}:{ ...saved, parameters:state.task.parameters, copy:state.task.copy };
    await Promise.all(state.task.assets.filter(asset=>files.some(file=>file.name===asset.name)&&asset.mime?.startsWith('image/')).map(async asset=>{
      try{state.assetImages.set(asset.name,await loadImage(asset.url))}catch{}
    }));
    if(role==='mother-candidate') await selectCommunityCandidate(state.task.assets.findLast(asset=>asset.role==='mother-candidate')?.name);
    else { renderTaskDetail();toast(`已保存 ${files.length} 张参考图`); }
    return true;
  }catch(error){toast(error.message);return false}
  finally {
    state.communityInputUploads = Math.max(0,(state.communityInputUploads || 1)-1);
    if (state.task?.id === taskId) {
      const button=document.querySelector('#community-generate-master,#community-generate-material');
      if(button)button.disabled=Boolean(state.communityInputUploads || state.task.communityGeneration?.status==='running' || !state.data.aiHuabu?.enabled);
      if(!state.communityInputUploads)document.querySelector('.community-composer-uploading')?.remove();
    }
  }
}

async function selectCommunityCandidate(name) {
  if (!name) return;
  const asset = state.task.assets.find(item=>item.name===name&&item.role==='mother-candidate');
  if (!asset) return toast('母版候选不存在');
  try {
    if(!state.assetImages.has(name))state.assetImages.set(name,await loadImage(asset.url));
    if(state.task.masterTemplate?.communityMaster){
      if(!await flushPendingParameterSave())return;
      if(state.task.customCanvas){
        state.task=await api(`/api/tasks/${state.task.id}/community-materials/select`,{method:'POST',body:JSON.stringify({name,expectedUpdatedAt:state.task.updatedAt})});
        state.masterMaterialView='composite';state.previewTemplateId=state.task.masterTemplateId;state.communityWorkspaceStage='master';renderTaskDetail();toast('已导入插画，可继续组合角色与文案');return;
      }
      state.task=await api(`/api/tasks/${state.task.id}/community-import-master`,{method:'POST',body:JSON.stringify({name,expectedUpdatedAt:state.task.updatedAt})});
      state.communityWorkspaceStage='master';state.previewTemplateId=state.task.masterTemplateId;state.communityComposerMode='concept-edit';state.communityComposerTaskId=state.task.id;renderTaskDetail();toast('母版已导入，原始分辨率已保留');return;
    }
    state.task.parameters.assetByTemplate ||= {};
    state.task.parameters.assetByTemplate[state.task.masterTemplateId] ||= {};
    state.task.parameters.assetByTemplate[state.task.masterTemplateId].background=name;
    if(!state.sourceImage){state.sourceImage=state.assetImages.get(name);state.sourceAsset=asset}
    state.previewTemplateId=state.task.masterTemplateId;
    state.previewMode='target';
    if(!await saveParameters(true))return;
    renderTaskDetail();toast('已选用母版候选；检查图层和文案后请确认母版');
  }catch(error){toast(error.message)}
}

function bannerComposerError(message){
  message=`本次操作未执行：${message}`;
  state.communityComposerTaskId=state.task.id;state.communityDesignError=message;
  const box=document.querySelector('#community-design-error');
  if(box){box.textContent=message;box.hidden=false;}
  toast(message);
}

async function bannerDesignFont(task,kind,direction='',preserveSelected=false){
  const library=companyFonts(),project=state.data.projects.find(p=>p.id===task.projectId);
  const selection=chooseBannerFont({fonts:library,task,project,kind,direction,preserveSelected});
  let font=selection.font;
  if(!font && kind==='title' && task.parameters.titleFontSource==='manual'){
    const old=selectedProjectFont(task,state.data.projects,kind);
    const name=String(old?.name || '').replace(/\(.*?\)|（.*?）|\.(ttf|otf|woff2?)$/gi,'').trim();
    if(name)font=library.find(f=>String(f.name).replace(/\(.*?\)|（.*?）/g,'').trim()===name);
  }
  if(!font)throw new Error('公司字体库中没有可用字体，请先选择公司版权字体');
  await loadFontAsset(font);return {...font,selectionSource:selection.source,designTheme:selection.theme};
}

async function submitCommunityArtworkAdapt(targetTemplateId){
  if(!state.task.parameters?.communityArtworkByTemplate?.[state.task.masterTemplateId])return generateCommunityImages('targets',[targetTemplateId],document.querySelector('#community-target-prompt')?.value||'');
  if(state.task?.communityGeneration?.status==='running' || state.communityGenerationSubmitting)return;
  const taskId=state.task.id;state.communityGenerationSubmitting=true;
  const button=document.querySelector('#community-adapt-current');if(button){button.disabled=true;button.textContent='准备尺寸重排…';}
  try{
    if(!await flushPendingParameterSave() || state.task?.id!==taskId)return;
    const prompt=document.querySelector('#community-target-prompt')?.value||'';
    const fresh=await api(`/api/tasks/${taskId}/community-compose`,{method:'POST',body:JSON.stringify({mode:'adapt',targetTemplateId,prompt,model:state.task.parameters.communityImageModel || 'banana_pro',expectedUpdatedAt:state.task.updatedAt})});
    if(state.task?.id!==taskId)return;
    state.task=fresh;state.previewTemplateId=targetTemplateId;state.previewMode='target';state.communityDesignError='';renderTaskDetail();scheduleCommunityGenerationPoll();toast('已提交当前尺寸重排');
  }catch(error){bannerComposerError(error.message);}
  finally{state.communityGenerationSubmitting=false;if(state.task?.id===taskId)renderTaskDetail();}
}

async function submitCommunityArtwork(mode,prompt){
  const taskId=state.task.id;
  if(!String(state.task.copy || '').trim())return bannerComposerError('请先填写最终主文案');
  if(!state.data.aiHuabu?.enabled)return bannerComposerError('画布服务未启用');
  state.communityGenerationSubmitting=true;state.communityComposerTaskId=taskId;state.communityComposerMode=mode;state.communityDesignError='';
  const button=document.querySelector('#community-generate-master');if(button){button.disabled=true;button.textContent='准备整稿…';}
  const previousError=document.querySelector('#community-design-error');if(previousError){previousError.textContent='';previousError.hidden=true;}
  try{
    if(!await flushPendingParameterSave() || state.task?.id!==taskId)return;
    const task=state.task,template=task.masterTemplate;let currentDataUrl;
    if(mode==='concept-edit'&&!task.parameters?.communityArtworkByTemplate?.[template.id]){
      // Original brand marks remain local and must not be repainted by the model.
      const staged=structuredClone(task);staged.parameters.layoutByTemplate ||= {};staged.parameters.layoutByTemplate[template.id] ||= {};
      for(const kind of ['logo','ip-copyright'])staged.parameters.layoutByTemplate[template.id][kind]={...getElementLayout(task,template,kind),visible:false};
      try{state.task=staged;currentDataUrl=renderCanvas(template,false).toDataURL('image/png');}finally{state.task=task;}
    }
    const fresh=await api(`/api/tasks/${taskId}/community-compose`,{method:'POST',body:JSON.stringify({mode,prompt,model:task.parameters.communityImageModel || 'banana_pro',expectedUpdatedAt:task.updatedAt,currentDataUrl})});
    if(state.task?.id!==taskId)return;
    state.task=fresh;state.previewTemplateId=template.id;state.previewMode='target';renderTaskDetail();scheduleCommunityGenerationPoll();toast('已提交整稿设计');
  }catch(error){bannerComposerError(error.message);}
  finally{state.communityGenerationSubmitting=false;if(state.task?.id===taskId)renderTaskDetail();}
}

async function submitCommunityMaterial(){
  const task=state.task;if(!task?.masterTemplate?.communityMaster||state.communityGenerationSubmitting||task.communityGeneration?.status==='running')return;
  if(state.communityInputUploads)return toast('参考图正在保存，请稍候');
  const kind=task.parameters?.communityMaterialKind||'illustration',prompt=document.querySelector('#community-material-prompt')?.value.trim(),key=`community-material-request:${task.id}:${kind}`;
  if(!prompt)return bannerComposerError('请填写本次素材的提示词');
  state.communityGenerationSubmitting=true;state.communityComposerTaskId=task.id;state.communityDesignError='';
  const button=document.querySelector('#community-generate-material');if(button)button.disabled=true;
  try{
    if(!await flushPendingParameterSave()||state.task?.id!==task.id)return;
    const request={kind,prompt,model:state.task.parameters.communityImageModel||'gpt-image-2',expectedUpdatedAt:state.task.updatedAt,...(kind==='illustration'?{illustration:illustrationOptions(state.task)}:{})};
    let stored;try{stored=JSON.parse(sessionStorage.getItem(key)||'null')}catch{}
    const pending=stored&&JSON.stringify(stored.input)===JSON.stringify(request)&&state.task.communityGeneration?.requestId!==stored.requestId?stored:{requestId:crypto.randomUUID(),input:request};
    sessionStorage.setItem(key,JSON.stringify(pending));
    const fresh=await api(`/api/tasks/${task.id}/community-materials`,{method:'POST',body:JSON.stringify({...request,requestId:pending.requestId})});
    if(state.task?.id!==task.id)return;state.task=fresh;state.masterMaterialView='composite';renderTaskDetail();scheduleCommunityGenerationPoll();toast('已提交独立素材生成');
  }catch(error){
    try{const fresh=await api(`/api/tasks/${task.id}`),saved=JSON.parse(sessionStorage.getItem(key)||'null');
      if(state.task?.id===task.id&&saved?.requestId===fresh.communityGeneration?.requestId){state.task=fresh;Object.assign(state,await loadEditorImages(fresh,loadImage));renderTaskDetail();scheduleCommunityGenerationPoll();}
      else bannerComposerError(error.message);
    }catch{bannerComposerError('暂时无法确认提交结果，请刷新查询本次任务，原请求已保留');}
  }
  finally{state.communityGenerationSubmitting=false;if(state.task?.id===task.id)renderTaskDetail();}
}

async function submitCommunityBanner(){
  if(!state.task?.masterTemplate?.communityPlacement)return;
  if(state.task.communityGeneration?.status==='running'||state.communityGenerationSubmitting)return;
  if(state.communityInputUploads)return bannerComposerError('参考图正在保存，请稍候');
  const taskId=state.task.id;
  const mode=document.querySelector('#community-composer-mode')?.value || 'concept';
  const prompt=String(document.querySelector('#community-image-prompt')?.value || '').trim();
  if(!prompt)return bannerComposerError('请填写创作或修改要求');
  if(mode.startsWith('concept'))return submitCommunityArtwork(mode,prompt);
  const plan=planBannerEdit(prompt,{mode});
  if(mode==='edit' && plan.unresolved.length)return bannerComposerError(`请明确修改图层和要求：${plan.unresolved.join('；')}。例如“人物缩小10%，副标底板改成纸质题签，其余保留”。`);
  const unsupported=plan.operations.filter(op=>op.type==='design' && !['background','title','subtitle-backing'].includes(op.kind));
  if(unsupported.length)return bannerComposerError(`暂时无法执行“${unsupported.map(op=>op.prompt).join('；')}”。副标文字内容和字体可在左侧文字区修改；位置、大小和沿底板倾斜可直接在这里描述。`);
  if(mode==='design' && !String(state.task.copy || '').trim())return bannerComposerError('请先在左侧填写最终主文案');
  state.communityGenerationSubmitting=true;
  state.communityComposerTaskId=taskId;state.communityComposerMode=mode;state.communityDesignError='';
  const button=document.querySelector('#community-generate-master');if(button){button.disabled=true;button.textContent='准备素材…';}
  const previousError=document.querySelector('#community-design-error');if(previousError){previousError.textContent='';previousError.hidden=true;}
  try{
    if(!await flushPendingParameterSave())return;
    if(state.task?.id!==taskId)return;
    const task=state.task,template=task.masterTemplate;
    const kinds=['character','character2','foreground','title','subtitle','logo','ip-copyright'];
    const masterAssets=Object.fromEntries(['background',...kinds].map(k=>[k,selectedAssetName(task,template,k) || null]));
    await Promise.all(kinds.filter(kind=>masterAssets[kind]&&!state.assetImages.has(masterAssets[kind])).map(async kind=>{
      const asset=task.assets.find(a=>a.name===masterAssets[kind]);
      if(!asset)throw new Error('选用的素材不存在，请刷新后重试');
      state.assetImages.set(asset.name,await loadImage(asset.url));
    }));
    if(state.task?.id!==taskId)return;
    const hasAi=mode==='design'||plan.operations.some(op=>op.type==='design');
    if(hasAi && !state.data.aiHuabu?.enabled)throw new Error('画布服务未启用，请先启用现有生图服务');
    if(mode==='edit' && plan.operations.some(op=>op.kind==='title'&&op.type==='design')){
      const oldTitle=task.assets.find(a=>a.name===masterAssets.title);
      if(oldTitle && (!oldTitle.glyphSourceName || !oldTitle.fontProvenance?.fontId))throw new Error('这版旧主标没有可追溯的版权字形。请先选择公司字体并生成完整母版，再继续修改字效。');
    }
    let titleFont,subtitleFont;
    if(mode==='design'||plan.operations.some(op=>op.kind==='title' && op.type==='design'))titleFont=await bannerDesignFont(task,'title',prompt,mode==='edit');
    if(mode==='design' && String(task.parameters.subtitleText || '').trim())subtitleFont=await bannerDesignFont(task,'subtitle',prompt);
    if(state.task?.id!==taskId)return;
    const sourceLayouts=Object.fromEntries([...kinds,'subtitle-backing'].map(kind=>[kind,mode==='edit' && task.parameters.layoutByTemplate?.[template.id]?.[kind]
      ? structuredClone(task.parameters.layoutByTemplate[template.id][kind]):getElementLayout(task,template,kind)]));
    const aspectByKind=Object.fromEntries(kinds.map(kind=>{const image=state.assetImages.get(masterAssets[kind]);return [kind,image?image.naturalWidth/image.naturalHeight:null];}));
    const layouts=createBannerDesignLayout(template,{layouts:sourceLayouts,aspectByKind,copy:task.copy,subtitle:task.parameters.subtitleText,direction:prompt,reset:mode==='design'});
    if(mode==='design'){
      for(const kind of ['character','character2','foreground','logo','ip-copyright'])if(!masterAssets[kind])layouts[kind].visible=false;
    }
    if(mode==='design'){
      layouts.title.effects={stroke:{enabled:false},shadow:{enabled:false}};
      layouts.subtitle.effects={stroke:{enabled:false},shadow:{enabled:false}};
      layouts.subtitle.textColor='#453627';
      layouts.subtitle.align='center';layouts.subtitle.verticalAlign='middle';
    }
    const needsBacking=mode==='design'?shouldGenerateBannerBacking(prompt,task.parameters.subtitleText):plan.operations.some(op=>op.kind==='subtitle-backing'&&op.type==='design');
    if(needsBacking && (!layouts['subtitle-backing']?.backing?.enabled || layouts['subtitle-backing'].width<=1)){
      layouts['subtitle-backing']=createSubtitleBackingLayout(layouts.subtitle,template,{opacity:100});
    }
    if(mode==='design' && !needsBacking)layouts['subtitle-backing']={...layouts['subtitle-backing'],visible:false,backing:{...layouts['subtitle-backing']?.backing,enabled:false}};
    const targetLayouts=mode==='edit'?applyBannerLayoutOperations(layouts,template,plan.operations).layouts:layouts;
    let currentDataUrl,guideDataUrl,titleMaskDataUrl;
    if(hasAi){
      currentDataUrl=renderCanvas(template,false).toDataURL('image/png');
      let maskCanvas;
      if(titleFont){
        const selectedTitle=task.assets.find(a=>a.name===masterAssets.title);
        const sourceMask=mode==='edit'&&selectedTitle?.fontProvenance?.fontId===titleFont.id&&task.assets.find(a=>a.name===selectedTitle.glyphSourceName);
        if(sourceMask){
          const image=state.assetImages.get(sourceMask.name) || await loadImage(sourceMask.url);
          maskCanvas=document.createElement('canvas');maskCanvas.width=image.naturalWidth;maskCanvas.height=image.naturalHeight;maskCanvas.getContext('2d').drawImage(image,0,0);
        }else maskCanvas=renderBannerTitleMask({text:task.copy,fontFamily:projectFontFamily(titleFont),rect:targetLayouts.title,emphasizeFirstLine:titleFont.designTheme==='playful'}).canvas;
        titleMaskDataUrl=maskCanvas.toDataURL('image/png');
      }
      const originalTask=state.task;
      const staged=structuredClone(task);
      staged.parameters.layoutByTemplate ||= {};staged.parameters.assetByTemplate ||= {};
      staged.parameters.layoutByTemplate[template.id]=targetLayouts;
      staged.parameters.assetByTemplate[template.id]={...masterAssets,...(mode==='design'?{title:null,subtitle:null}:{})};
      if(titleFont)staged.parameters.titleFontId=titleFont.id;
      if(subtitleFont)staged.parameters.subtitleFontId=subtitleFont.id;
      try{
        state.task=staged;
        let guide;
        if(mode==='edit')guide=renderCanvas(template,false);
        else{
          guide=document.createElement('canvas');guide.width=template.width;guide.height=template.height;
          const ctx=guide.getContext('2d');ctx.fillStyle='#eeeae0';ctx.fillRect(0,0,guide.width,guide.height);
          for(const kind of ['character','character2','foreground','logo','ip-copyright'])drawUploadedElement(ctx,template,kind);
          if(maskCanvas){const box=targetLayouts.title;ctx.drawImage(maskCanvas,box.x,box.y,box.width,box.height);}
          if(String(task.parameters.subtitleText || '').trim())drawNativeCopy(ctx,{...nativeCopyOptions(staged,template,'subtitle'),effects:targetLayouts.subtitle.effects});
        }
        guideDataUrl=guide.toDataURL('image/png');
      }finally{state.task=originalTask;}
    }
    const fresh=await api(`/api/tasks/${taskId}/community-compose`,{method:'POST',body:JSON.stringify({mode,prompt,expectedUpdatedAt:task.updatedAt,model:task.parameters.communityImageModel || 'banana_pro',masterAssets,layouts,titleFontId:titleFont?.id,subtitleFontId:subtitleFont?.id,titleFontSource:titleFont?.selectionSource,titleDesignTheme:titleFont?.designTheme || bannerTypographyTheme(task,state.data.projects.find(p=>p.id===task.projectId),prompt),currentDataUrl,guideDataUrl,titleMaskDataUrl})});
    if(state.task?.id!==taskId)return;
    state.task=fresh;
    state.previewTemplateId=template.id;state.previewMode='target';
    renderTaskDetail();scheduleCommunityGenerationPoll();
    toast(hasAi?'已提交，将自动完成后显示可编辑母版':'正在调整当前母版');
  }catch(error){bannerComposerError(error.message);}
  finally{state.communityGenerationSubmitting=false;if(state.task?.id===taskId)renderTaskDetail();}
}

async function restoreCommunityBanner(){
  if(state.task.communityGeneration?.status==='running')return;
  const taskId=state.task.id,versionId=document.querySelector('#community-design-version')?.value;
  if(!versionId||versionId===state.task.communityDesign?.currentVersionId)return;
  try{
    if(!await flushPendingParameterSave())return;
    const fresh=await api(`/api/tasks/${taskId}/community-design-restore`,{method:'POST',body:JSON.stringify({versionId})});
    if(state.task?.id!==taskId)return;
    state.task=fresh;await loadProjectFonts(fresh,state.data.projects);
    await Promise.all(fresh.assets.filter(a=>isRenderableImageAsset(a)&&!state.assetImages.has(a.name)).map(async a=>state.assetImages.set(a.name,await loadImage(a.url))));
    state.previewTemplateId=fresh.masterTemplateId;state.previewMode='target';renderTaskDetail();toast('已恢复此版，请检查后重新确认母版');
  }catch(error){bannerComposerError(error.message);}
}

async function generateCommunityImages(phase,requestedTargets,targetPrompt='') {
  const task=state.task;
  if(phase==='targets'&&task?.parameters?.communityPopupByTemplate){requestedTargets=(requestedTargets||task.targetTemplateIds).filter(id=>!popupConfig(task,{id}));if(!requestedTargets.length)return toast('透明弹窗请使用右侧面板保存或重新排版');}
  const layered=task?.masterTemplate?.communityMaster&&task.parameters?.communityMaterialWorkflow?.version>=1&&!task.parameters?.communityArtworkByTemplate?.[task.masterTemplateId];
  if(!task?.templates?.some(template=>template.communityPlacement))return;
  if(task.communityGeneration?.status==='running'||state.communityGenerationSubmitting)return toast('生成任务正在执行，请稍候');
  if(phase==='targets'&&!task.communityMasterApproval?.at)return toast('请先确认母版');
  const failedIds=phase==='targets'&&task.communityGeneration?.phase==='targets'&&task.communityGeneration.status==='partial' ? task.targetTemplateIds.filter(id=>id!==task.masterTemplateId&&task.communityGeneration.errors?.some(error=>error.startsWith(`${task.templates.find(template=>template.id===id)?.name}：`))) : [];
  if(state.communityInputUploads)return toast('参考图正在保存，请稍候再生成');
  const prompt=String(task.parameters?.communityImagePrompt||'').trim();
  if(!prompt&&phase!=='typography'&&phase!=='targets')return toast('请先填写画面创作要求');
  const model=task.parameters?.communityImageModel||'banana_pro';
  const button=document.querySelector(phase==='master'?'#community-generate-master':phase==='background'?'#community-generate-background':phase==='typography'?'#community-generate-typography':'#community-generate-targets');
  state.communityGenerationSubmitting=true;
  if(button){button.disabled=true;button.textContent='正在提交画布任务…'}
  try{
    clearTimeout(state.paramsSaveTimer);
    if(phase==='targets'&&!layered&&task.parameters?.communityAutoLayoutMasterFingerprint!==task.communityMasterApproval?.fingerprint)if(!await autoApplyCommunityTemplates(false))return;
    if(!await saveParameters(true))return;
    const receiptKey=`community-target-submit:${task.id}`,signature=JSON.stringify([task.communityMasterApproval?.fingerprint,requestedTargets||null,targetPrompt]);
    let receipt;try{receipt=JSON.parse(sessionStorage.getItem(receiptKey));}catch{}
    if(!receipt||receipt.signature!==signature)receipt={signature,requestId:crypto.randomUUID()};
    if(phase==='targets'&&layered)sessionStorage.setItem(receiptKey,JSON.stringify(receipt));
    state.task=await api(`/api/tasks/${task.id}/community-generate`,{method:'POST',body:JSON.stringify({phase,model,prompt:phase==='targets'&&layered?targetPrompt:prompt,count:phase==='background'?1:3,...(layered?{requestId:receipt.requestId}:{}),...(requestedTargets?.length?{targetTemplateIds:requestedTargets}:!layered&&failedIds.length ? {targetTemplateIds:failedIds} : {})})});
    if(phase==='targets'&&layered)sessionStorage.removeItem(receiptKey);
    renderTaskDetail();scheduleCommunityGenerationPoll();
    toast(phase==='master'?'已提交统一母版任务：3 个背景方案和主副文案透明图层':phase==='background'?'已提交结合角色与创作说明设计背景':phase==='typography'?'已提交按参考重做主副文案':'已提交按确认母版延展其它尺寸的任务');
  }catch(error){toast(error.message)}finally{state.communityGenerationSubmitting=false;renderTaskDetail()}
}

function scheduleCommunityGenerationPoll() {
  clearTimeout(state.communityGenerationPoll);
  if(!state.task||state.task.communityGeneration?.status!=='running')return;
  const taskId=state.task.id;
  state.communityGenerationPoll=setTimeout(async()=>{
    if(state.task?.id!==taskId)return;
    try{
      if(!await flushPendingParameterSave())return scheduleCommunityGenerationPoll();
      if(state.task?.id!==taskId)return;
      const localSnapshot=JSON.stringify({parameters:state.task.parameters,copy:state.task.copy});
      const fresh=await api(`/api/tasks/${taskId}`);
      if(state.task?.id!==taskId)return;
      if(state.paramsSaveTimer||JSON.stringify({parameters:state.task.parameters,copy:state.task.copy})!==localSnapshot)return scheduleCommunityGenerationPoll();
      const oldNames=new Set(state.task.assets.map(asset=>asset.name));
      state.task=fresh;
      const cached=state.data.tasks.findIndex(task=>task.id===taskId);
      if(cached>=0)state.data.tasks[cached]=fresh;
      await Promise.all(fresh.assets.filter(asset=>!oldNames.has(asset.name)&&asset.mime?.startsWith('image/')).map(async asset=>{try{state.assetImages.set(asset.name,await loadImage(asset.url))}catch{}}));
       await loadCommunityObjectLayerImages(fresh,loadImage,state.assetImages);
      renderTaskDetail();
      if(fresh.communityGeneration?.status==='running')scheduleCommunityGenerationPoll();
      else {
        if(['compose','artwork'].includes(fresh.communityGeneration?.phase) && fresh.communityGeneration.status==='done'){
          state.communityComposerTaskId=taskId;state.communityComposerMode=fresh.communityGeneration.phase==='artwork'?'concept-edit':'edit';state.communityDesignError='';
          renderTaskDetail();
        }
        const currentItem=fresh.communityGeneration?.items?.find(item=>item.templateId===state.previewTemplateId);
        toast(currentItem?.status==='failed'?`本次调整未应用，保留上次画面：${currentItem.error}`:fresh.communityGeneration?.status==='done'?fresh.communityGeneration.phase==='targets'?'尺寸延展已完成，请逐张检查':fresh.communityGeneration.mode==='adapt'?'当前尺寸试稿已生成，请检查画面':'母版已更新，请检查后确认':fresh.communityGeneration?.status==='candidate-ready'?'新方案已保留，当前画面调整未被覆盖':fresh.communityGeneration?.error || `任务完成 ${fresh.communityGeneration?.done||0}/${fresh.communityGeneration?.total||0}；请查看失败信息`);
      }
    }catch(error){toast(error.message);scheduleCommunityGenerationPoll()}
  },2200);
}

async function uploadAssets(event) {
  const files = [...event.target.files];
  if (!files.length) return;
  if(state.task?.masterTemplate?.communityMaster&&!await flushPendingParameterSave())return;
  event.target.disabled = true;
  const hasPsd = files.some(file => /\.ps[db]$/i.test(file.name));
  if (hasPsd) toast('正在读取 PSD / PSB 原始图层，请稍候…');
  try {
    const payload = [];
    for (const file of files) payload.push({ name: file.name, dataUrl: await fileToDataUrl(file) });
    const role = document.querySelector("#asset-role").value;
    state.task = await api(`/api/tasks/${state.task.id}/assets`, { method: "POST", body: JSON.stringify({ files: payload, role }) });
    Object.assign(state, await loadEditorImages(state.task, loadImage));
    state.previewMode = 'target';
    renderTaskDetail();
    const failures = state.task.assets.filter(asset => files.some(file => file.name === asset.name) && asset.psdExtraction?.status === 'failed');
    toast(failures.length ? failures[0].psdExtraction.error : hasPsd ? '源文件已保存，原始图层已加入素材库' : `已保存 ${files.length} 个内网素材`);
  } catch (error) { toast(error.message); }
  finally { event.target.disabled = false; event.target.value = ''; }
}

async function importKvPack() {
  const button = document.querySelector("#import-kv-pack");
  let folderPath = "";
  try { folderPath = await pickMaterialFolder(text => { button.textContent = text.slice(0, 24); }); }
  catch (error) { button.textContent = "导入本地KV素材包"; return toast(error.message); }
  if (!folderPath) return;
  try {
    const inspection = await api("/api/material-folder/inspect", { method: "POST", body: JSON.stringify({ folderPath }) });
    if (state.task.artifacts?.length && !window.confirm(`找到 ${inspection.files.length} 个素材。若素材有更新，重新导入会撤回当前已生成的图片和审核结果；完全相同的文件会跳过。确定继续吗？`)) return;
    button.disabled = true;
    button.textContent = "正在导入…";
    state.task = await api(`/api/tasks/${state.task.id}/assets/import-kv-pack`, { method: "POST", body: JSON.stringify({ folderPath }) });
    state.previewMode = "target";
    Object.assign(state, await loadEditorImages(state.task, loadImage));
    renderTaskDetail();
    toast(state.task.importedCount ? `本地KV素材包已导入 ${state.task.importedCount} 个新素材` : "素材包已导入过，文件没有变化，现有成品保持不变");
  } catch (error) {
    button.disabled = false;
    button.textContent = "导入本地KV素材包";
    toast(error.message);
  }
}

async function queuePhotoshop() {
  try {
    await saveParameters();
    await api(`/api/tasks/${state.task.id}/queue`, { method: "POST", body: "{}" });
    await refresh();
    toast("已进入 Photoshop 本地执行队列");
  } catch (error) { toast(error.message); }
}

async function submitEditorForReview() {
  if (state.task.status === "成套审核") { state.task = null; state.view = "review"; render(); return; }
  if (!["生成失败", "批量生成"].includes(state.task.status)) return toast(`当前状态“${state.task.status}”还不能提交审核`);
  await renderArtifacts(true);
}

async function downloadCurrentArtifact() {
  const template = state.data.templates.find((item) => item.id === state.previewTemplateId) || state.task.masterTemplate;
  const button = document.querySelector("#editor-download-single");
  if (!template) return toast("请先选择要下载的资源位");
  if(communityArtworkTargetPending(state.task,template)&&!communityTargetHasComposition(state.task,template))return toast('当前只有母版参考，请先生成此尺寸试稿');
  if (!state.sourceImage && !state.assetImages.size) return toast("当前任务没有可导出的主图，请先导入或上传素材");
  if (button) { button.disabled = true; button.textContent = "正在生成…"; }
  try {
    if(state.task.customCanvas&&!await flushPendingParameterSave())throw Error('排版尚未保存，请稍后再导出');
    const canvas = renderCanvas(template, false);
    if(state.task.sourceAdaptation)assertSourceExport(state.task,template,canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data);
    if(popupConfig(state.task,template))assertPopupPixels(canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data);
    if (canvas.outpaintCoverageValid === false) throw new Error("AI扩展范围不足，请增大缩放或重新扩图后再下载");
    const type = String(template.format || "JPG").toUpperCase() === "PNG" ? "image/png" : "image/jpeg";
    let blob;
    if (type === "image/png") {
      blob = await compressPngCanvas(canvas, template.maxBytes, template.id);
    } else {
      let quality = 0.92;
      blob = await canvasBlob(canvas, type, quality);
      while (blob.size > template.maxBytes && quality > 0.30) {
        quality -= 0.06;
        blob = await canvasBlob(canvas, type, quality);
      }
    }
    if (blob.size > template.maxBytes) throw new Error(`当前图片在保留画质后仍为 ${formatBytes(blob.size)}，超过 ${formatBytes(template.maxBytes)} 上限。请调整画面内容后重试`);
    const extension = type === "image/png" ? "png" : "jpg";
    const safe = (value) => String(value || "").replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, " ").trim();
    const platformResource = state.data.resourceProfiles?.some(profile => profile.templateId === template.id && profile.segmentId === "platform");
    const filename = usesTaskSizeName(state.task,template)?taskSizeImageName(state.task,template,extension):platformResource
      ? `${safe(template.name)}_${template.width}x${template.height}.${extension}`
      : `${safe(state.task.project)}_${safe(template.name)}_${template.width}x${template.height}_v${state.task.version || 1}.${extension}`;
    const objectUrl = URL.createObjectURL(blob);
    if(state.task.customCanvas){
      const taskId=state.task.id,saved=await api(`/api/tasks/${taskId}/custom-canvas/export`,{method:'POST',body:JSON.stringify({dataUrl:await blobToDataUrl(blob),expectedUpdatedAt:state.task.updatedAt,requestId:crypto.randomUUID()})});
      if(state.task?.id!==taskId){URL.revokeObjectURL(objectUrl);return;}state.task=saved;const index=state.data.tasks.findIndex(t=>t.id===taskId);if(index>=0)state.data.tasks[index]=saved;management.invalidate();renderTaskDetail();
    }
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    toast(`正在下载：${template.name}（${template.width}×${template.height} · ${formatBytes(blob.size)}）`);
  } catch (error) {
    toast(`单张下载失败：${error.message}`);
  } finally {
    if (button?.isConnected) { button.disabled = false; button.textContent = state.task.customCanvas?'导出成品':template.communityMaster?'下载母版':'单张下载'; }
  }
}

async function downloadMaterialPackage() {
  const button = document.querySelector("#editor-download-materials");
  const originalText = button?.textContent || "输出整套素材";
  try {
    const complete = state.task.artifacts?.length === state.task.targetTemplateIds.length && (Boolean(state.task.deliveredPackage)||sourceCopyrightArtifactsCurrent(state.task,state.task.templates,state.data.projects?.find(p=>p.id===state.task.projectId)));
    if (!complete) {
      const generated = await renderArtifacts(false, button);
      if (!generated) return;
    }
    if (button?.isConnected) {
      button.disabled = true;
      button.textContent = "正在打包…";
    }
    if(state.task.templates.every(t=>t.communityPlacement)){
      if(!await flushPendingParameterSave())throw Error('排版尚未保存，请重试');
      const id=state.task.id;
      const saved=state.task.status==='已完成'&&state.task.deliveredPackage?state.task:await api(`/api/tasks/${id}/confirm-materials-package`,{method:'POST',body:JSON.stringify({confirmed:true,expectedUpdatedAt:state.task.updatedAt})});
      if(state.task?.id===id)state.task=saved;
      const index=state.data.tasks.findIndex(t=>t.id===id);if(index>=0)state.data.tasks[index]=saved;management.invalidate();
      const response=await fetch(`/api/tasks/${id}/package`);if(!response.ok){const error=await response.json();throw Error(error.error||'交付包下载失败');}
      const blob=await response.blob(),objectUrl=URL.createObjectURL(blob),link=document.createElement('a');link.href=objectUrl;
      const name=/filename\*=UTF-8''([^;]+)/i.exec(response.headers.get('content-disposition')||'');link.download=name?decodeURIComponent(name[1]):saved.deliveredPackage.name;
      document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(objectUrl),1000);
      if(state.task?.id===id)renderTaskDetail();toast(`整套 ${saved.artifacts.length} 张素材已确认，任务已完成，ZIP 已开始下载`);return;
    }
    const link = document.createElement("a");
    link.href = "/api/tasks/" + state.task.id + "/materials-package";
    link.download = "";
    document.body.appendChild(link);
    link.click();
    link.remove();
    toast(`整套 ${state.task.artifacts.length} 张素材已生成，ZIP 已开始下载`);
  } catch (error) {
    toast("素材包下载失败：" + error.message);
  } finally {
    if (button?.isConnected) {
      button.disabled = false;
      button.textContent = originalText;
    }
  }
}

function cutoutSourceAssets() {
  return state.task.assets.filter((asset) => isRenderableImageAsset(asset) && ["clean-kv","background","background-landscape","background-portrait","master","master-landscape","master-portrait","generated-background","character","core-character","secondary-character"].includes(asset.role));
}

function openCharacterCutout(sourceName) {
  const template = state.data.templates.find((item) => item.id === state.previewTemplateId) || state.task.masterTemplate;
  const background = getTemplateBackground(state.task, template);
  const selectedCharacter = state.task.assets.find(asset => asset.name === selectedAssetName(state.task, template, 'character') && asset.needsCutout);
  const preferred = typeof sourceName === 'string' ? sourceName : selectedCharacter?.name || background.sourceAssetName || selectedAssetName(state.task, template, "background") || cutoutSourceAssets()[0]?.name;
  const select = document.querySelector("#cutout-source");
  if (select && [...select.options].some((option) => decodeURIComponent(option.value) === preferred)) select.value = encodeURIComponent(preferred);
  state.cutoutSourceName = preferred || "";
  state.cutoutPoints = [];
  const dialog = document.querySelector("#character-cutout-dialog");
  dialog?.showModal();
  changeCutoutSource();
  requestAnimationFrame(renderCutoutMarkers);
}

function changeCutoutSource() {
  const select = document.querySelector("#cutout-source");
  if (!select) return;
  state.cutoutSourceName = decodeURIComponent(select.value || "");
  state.cutoutPoints = [];
  const asset = cutoutSourceAssets().find((item) => item.name === state.cutoutSourceName);
  const image = document.querySelector("#cutout-source-image");
  if (asset && image) { image.src = asset.url; image.alt = asset.name; }
  renderCutoutMarkers();
}

function addCutoutPoint(event) {
  if (event.target.closest?.(".cutout-marker")) return;
  const image = document.querySelector("#cutout-source-image");
  if (!image?.naturalWidth || state.cutoutPoints.length >= 6) return;
  const rect = image.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) return;
  state.cutoutPoints.push({
    x: Math.round((event.clientX - rect.left) * image.naturalWidth / rect.width),
    y: Math.round((event.clientY - rect.top) * image.naturalHeight / rect.height),
    nx: (event.clientX - rect.left) / rect.width,
    ny: (event.clientY - rect.top) / rect.height,
  });
  renderCutoutMarkers();
}

function renderCutoutMarkers() {
  const markers = document.querySelector("#cutout-markers");
  const image = document.querySelector("#cutout-source-image");
  const stage = document.querySelector("#cutout-stage");
  if (markers && image && stage) {
    const imageRect = image.getBoundingClientRect(), stageRect = stage.getBoundingClientRect();
    markers.innerHTML = state.cutoutPoints.map((point, index) => `<button type="button" class="cutout-marker" data-cutout-point="${index}" style="left:${imageRect.left - stageRect.left + point.nx * imageRect.width}px;top:${imageRect.top - stageRect.top + point.ny * imageRect.height}px" title="删除此人物选点">${index + 1}</button>`).join("");
  }
  document.querySelectorAll("[data-cutout-point]").forEach((marker) => marker.addEventListener("click", (event) => { event.stopPropagation(); state.cutoutPoints.splice(Number(marker.dataset.cutoutPoint), 1); renderCutoutMarkers(); }));
  const count = document.querySelector("#cutout-point-count");
  if (count) count.textContent = `已选 ${state.cutoutPoints.length} 人，建议每个人只点一次；点击标记可删除。`;
}

async function runCharacterCutout() {
  if (!state.cutoutSourceName) return toast("请先选择一张源图");
  const engine = document.querySelector("#cutout-engine")?.value || "sam2";
  if (!state.cutoutPoints.length) return toast("请在每个要保留人物的脸部点击一次");
  const button = document.querySelector("#run-character-cutout");
  if (button) { button.disabled = true; button.textContent = "正在精细抠图…"; }
  try {
    const templateId = state.previewTemplateId;
    state.task = await api(`/api/tasks/${state.task.id}/local-ai/cutout`, { method:"POST", body:JSON.stringify({ sourceAssetName:state.cutoutSourceName, templateId, engine, points:state.cutoutPoints.map(({x,y}) => ({x,y})) }) });
    await Promise.all((state.task.localAi?.outputs || []).filter((asset) => asset.url).map(async (asset) => { try { state.assetImages.set(asset.name, await loadImage(`${asset.url}?v=${Date.now()}`)); } catch {} }));
    const generated = state.task.localAi?.outputs?.find((item) => item.kind === "foreground" && item.sourceAssetName === state.cutoutSourceName);
    if (generated) { try { state.assetImages.set(generated.name, await loadImage(`${generated.url}?v=${Date.now()}`)); } catch {} }
    state.inspectorElement = "character";
    document.querySelector("#character-cutout-dialog")?.close();
    renderTaskDetail();
    toast(isCommunityPopup({id:templateId})?"人物透明素材已生成，请在弹窗素材中选择；原背景有角色时请换用无人物底图":"人物透明层已生成，可在画布中单独移动和缩放");
  } catch (error) {
    toast(error.message);
    if (button) { button.disabled = false; button.textContent = "生成透明人物层"; }
  }
}

function characterCutoutDialog(task) {
  const sources = cutoutSourceAssets();
  const selected = sources.find((asset) => asset.name === state.cutoutSourceName) || sources[0];
  return `<dialog id="character-cutout-dialog" class="dialog character-cutout-dialog"><div class="dialog-head"><div><p class="eyebrow">CHARACTER CUTOUT</p><h2>独立人物抠图</h2><p>选择干净KV，然后依次点击每个需要保留人物的脸部。生成后人物会成为可单独移动、缩放的透明图层。</p></div><button type="button" class="icon-button" id="close-character-cutout">×</button></div><div class="cutout-options"><label class="cutout-source-select">抠图源图<select id="cutout-source">${sources.map((asset) => `<option value="${encodeURIComponent(asset.name)}" ${asset === selected ? "selected" : ""}>${esc(asset.name)}</option>`).join("")}</select></label><label class="cutout-source-select">抠图引擎<select id="cutout-engine"><option value="sam2">本机 SAM2（离线快速）</option><option value="removebg">remove.bg（整图一次精细抠图）</option></select></label></div><div class="cutout-stage" id="cutout-stage">${selected ? `<img id="cutout-source-image" src="${selected.url}" alt="${esc(selected.name)}" draggable="false"><div id="cutout-markers"></div>` : `<p>请先上传干净KV。</p>`}</div><div class="cutout-help"><b>点击每位主角的脸部添加选点</b><span id="cutout-point-count">已选 ${state.cutoutPoints.length} 人，建议每个人只点一次；点击标记可删除。</span></div><div class="dialog-actions"><button type="button" class="button ghost" id="clear-cutout-points">清空选点</button><button type="button" class="button secondary" id="undo-cutout-point">撤销一点</button><button type="button" class="button primary" id="run-character-cutout" ${selected ? "" : "disabled"}>生成透明人物层</button></div></dialog>`;
}
async function approveAndDownloadSuite() {
  const button = document.querySelector("#editor-download-suite");
  if (!state.task.qc?.passed || state.task.artifacts?.length !== state.task.targetTemplateIds.length) return toast("全套尺寸尚未完成技术质检，不能下载");
  if (button) { button.disabled = true; button.textContent = "正在打包…"; }
  try {
    state.task = await api(`/api/tasks/${state.task.id}`, { method: "PATCH", body: JSON.stringify({ status: "已完成", by: "设计师", action: "成套总览确认通过", note: "在生产编辑器确认全套无误" }) });
    const link = document.createElement("a");
    link.href = `/api/tasks/${state.task.id}/package`;
    link.download = "";
    document.body.appendChild(link); link.click(); link.remove();
    renderTaskDetail();
    toast("全套已确认，ZIP 已开始下载");
  } catch (error) {
    toast(error.message);
    if (button?.isConnected) { button.disabled = false; button.textContent = "确认交付并成套下载"; }
  }
}

async function renderArtifacts(submitAfter = false, triggerButton = null) {
  if(state.task.templates.some(t=>communityArtworkTargetPending(state.task,t)))return toast('请先完成其它尺寸的重排，母版参考不能作为交付稿');
  if (state.task.templates.some(template=>template.communityPlacement) && !state.task.communityMasterApproval?.at) return toast('请先完成并确认母稿，再生成各尺寸');
  if (!state.sourceImage) return toast("请先上传可预览的 JPG 或 PNG 主图");
  const button = triggerButton || document.querySelector("#render-local") || document.querySelector("#editor-submit-review");
  button.disabled = true;
  button.textContent = submitAfter ? "生成并质检中…" : "正在生成…";
  try {
    await saveParameters();
    if (state.task.status === "生成失败") {
      state.task = await api(`/api/tasks/${state.task.id}`, { method: "PATCH", body: JSON.stringify({ status: "批量生成", by: "设计师", action: "启动本地尺寸适配" }) });
    }
    const files = [];
    for (const template of state.task.templates) {
      const canvas = renderCanvas(template, false);
      if(state.task.sourceAdaptation)assertSourceExport(state.task,template,canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data);
    if(popupConfig(state.task,template))assertPopupPixels(canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data);
      if (canvas.outpaintCoverageValid === false) throw new Error(template.name + "：AI扩展范围不足，请增大缩放或重新扩图，不能导出留白成品");
      const type = template.format === "JPG" ? "image/jpeg" : "image/png";
      let quality = 0.92;
      let blob = await canvasBlob(canvas, type, quality);
      while (type === "image/jpeg" && blob.size > template.maxBytes && quality > 0.46) {
        quality -= 0.08;
        blob = await canvasBlob(canvas, type, quality);
      }
      if (type === "image/png" && blob.size > template.maxBytes) {
        blob = await compressPngCanvas(canvas, template.maxBytes, template.id);
      }
      if (blob.size > template.maxBytes) throw new Error(`${template.name}：PNG在保留画质后仍为${formatBytes(blob.size)}，超过${formatBytes(template.maxBytes)}上限`);
      const templateApplied = !template.requiresPsd || Boolean(state.data.psdLayoutRules?.templates?.some((rule) => rule.templateId === template.id));
      files.push({ templateId: template.id, width: canvas.width, height: canvas.height, format: template.format, templateApplied, sourceCopyrightKey:sourceCopyrightKey(state.task,template,state.data.projects?.find(p=>p.id===state.task.projectId)), dataUrl: await blobToDataUrl(blob) });
    }
    state.task = await api(`/api/tasks/${state.task.id}/artifacts`, { method: "POST", body: JSON.stringify({ files, expectedUpdatedAt:state.task.updatedAt, by: "浏览器内网执行器" }) });
    const passed = state.task.qc?.passed;
    if (passed && submitAfter) {
      state.task = null; state.view = "review"; state.reviewTab = "待审核"; await refresh();
      toast("全部尺寸已生成并通过技术质检，已进入待审核");
    } else {
      await refresh();
      if (passed) toast("全部尺寸已生成并通过质检");
      else {
        const failed = state.task?.artifacts?.filter((item) => !item.qc?.passed).map((item) => state.data.templates.find((template) => template.id === item.templateId)?.name || item.name) || [];
        toast(failed.length ? `以下资源位质检失败：${failed.join("、")}` : "生成数量不完整，尚不能提交审核");
      }
    }
    if (passed) await saveTaskCoverPreview();
    return Boolean(passed && state.task?.artifacts?.length === state.task?.targetTemplateIds?.length);
  } catch (error) {
    toast(error.message);
    if (button?.isConnected) { button.disabled = false; button.textContent = submitAfter ? "提交审核" : "本地生成并质检"; }
    return false;
  }
}

function redrawPreview() {
  const canvas = document.querySelector("#preview-canvas");
  const empty = document.querySelector("#preview-empty");
  if (!canvas) return;
  const objectTask=state.task;
  if(Object.values(objectTask?.parameters?.communityObjectLayersByTemplate||{}).flat().some(layer=>!state.assetImages.has(communityObjectLayerImageKey(objectTask,layer)))){
    if(state.communityObjectImageLoadingTask!==objectTask){state.communityObjectImageLoadingTask=objectTask;void loadCommunityObjectLayerImages(objectTask,loadImage,state.assetImages).then(()=>{if(state.task?.id===objectTask.id)redrawPreview();}).catch(error=>toast('独立素材加载失败：'+error.message)).finally(()=>{if(state.communityObjectImageLoadingTask===objectTask)state.communityObjectImageLoadingTask=null;});}return;
  }
  const template = state.data.templates.find((item) => item.id === state.previewTemplateId) || state.task.masterTemplate;
  const drawable = template ? templateSourceImage(state.task, template) : state.sourceImage;
  if(template&&state.task.masterTemplate?.communityMaster)syncCommunityPropertyControls(content,{layout:state.inspectorElement==='background'?null:getElementLayout(state.task,template,state.inspectorElement),background:getTemplateBackground(state.task,template),scale:selectedScalePercent()});
  const hasProjectText = template?.communityPlacement && (['title','subtitle','ip-copyright'].some(kind=>nativeCopyValue(state.task,template,kind)&&getElementLayout(state.task,template,kind).visible!==false) || hasCanvasAsset('subtitle-backing',template));
  if (!drawable && !(state.previewMode === 'target' && (state.assetImages.size || hasProjectText))) { canvas.style.display = "none"; empty.style.display = "block"; return; }
  empty.style.display = "none";
  canvas.style.display = "block";
  if (state.previewMode === "target" && template) {
    let rendered;
    const view=template.communityMaster&&state.communityWorkspaceStage!=='sizes'?state.masterMaterialView||'composite':'composite';
    if(view==='text'||view==='character'){
      rendered=document.createElement('canvas');rendered.width=template.width;rendered.height=template.height;const ctx=rendered.getContext('2d');
      for(let y=0;y<template.height;y+=24)for(let x=0;x<template.width;x+=24){ctx.fillStyle=((x+y)/24)%2?'#eef0f7':'#fff';ctx.fillRect(x,y,24,24);}
      for(const kind of view==='text'?['title','subtitle']:['character','character2']){const name=selectedAssetName(state.task,template,kind),image=state.assetImages.get(name),rect=getElementLayout(state.task,template,kind);if(image&&rect.visible!==false)ctx.drawImage(image,rect.x,rect.y,rect.width,rect.height);}
      if(view==='character'){const temporary=structuredClone(state.task);if(temporary.parameters.communityObjectLayersByTemplate?.[template.id])temporary.parameters.communityObjectLayersByTemplate[template.id]=temporary.parameters.communityObjectLayersByTemplate[template.id].filter(l=>l.appearance.kind==='character');drawCommunityObjectLayers(ctx,temporary,template,state.assetImages);}
    }else if(view==='illustration'){
      const original=state.task,temporary=structuredClone(original);temporary.parameters.layoutByTemplate||={};temporary.parameters.layoutByTemplate[template.id]||={};
      for(const kind of ['title','subtitle','subtitle-backing','logo','ip-copyright'])temporary.parameters.layoutByTemplate[template.id][kind]={...getElementLayout(original,template,kind),visible:false};
      if(original.assets.find(a=>a.name===original.parameters.assetByTemplate?.[template.id]?.background)?.layeredIllustration){
        for(const kind of ['character','character2','foreground'])temporary.parameters.layoutByTemplate[template.id][kind]={...getElementLayout(original,template,kind),visible:false};
        (temporary.parameters.communityObjectLayersByTemplate||={})[template.id]=[];
      }
      try{state.task=temporary;rendered=renderCanvas(template,false);}finally{state.task=original;}
    }else rendered=renderCanvas(template, state.showGuides,{popupButtonDraft:state.popupDrafts?.[state.task.id]?.config});
    canvas.width = rendered.width;
    canvas.height = rendered.height;
    canvas.getContext("2d").drawImage(rendered, 0, 0);
    if(state.inspectorElement!=='background'||state.communityObjectCanvasSelectedId)state.popupTextSelectedKey=null;
    if(state.popupTextSelectedKey===`${state.task.id}:${template.id}`){
      const saved=popupConfig(state.task,template),c=state.popupDrafts?.[state.task.id]?.config||saved;
      if(c&&saved){const box=popupButtonTextBox(canvas.getContext('2d'),c,getElementLayout(state.task,template,'button'),{image:state.assetImages.get(c.buttonBackingAsset),fontFamily:popupFontFamily(c)});if(box.visible)drawLayerHandles(canvas.getContext('2d'),box,7,template);}
    }
    const thumbnail=document.querySelector(`.target-size-card[data-preview-template="${template.id}"] .target-thumb img`);
    if(thumbnail && template.communityPlacement)thumbnail.src=targetThumbnail(rendered);
    return;
  }
  canvas.width = state.sourceImage.naturalWidth;
  canvas.height = state.sourceImage.naturalHeight;
  const ctx = canvas.getContext("2d"); ctx.drawImage(state.sourceImage, 0, 0);
  for (const object of state.task.annotations?.objects || []) drawPolygon(ctx, object.points, annotationTypes[object.type]?.[1] || "#777", object.label);
  if (state.polygonPoints.length) drawPolygon(ctx, state.polygonPoints, annotationTypes[state.annotationType]?.[1] || "#777", "正在标注", false);
}

function tracePsdRegion(ctx, region, begin = true) {
  const { x, y, width, height } = region.bounds;
  if (begin) ctx.beginPath();
  if (region.shape === "ellipse") ctx.ellipse(x + width / 2, y + height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
  else if (region.shape === "path" && ctx.roundRect) ctx.roundRect(x, y, width, height, Math.min(width, height) * .08);
  else ctx.rect(x, y, width, height);
}

function sampledCanvasColor(ctx, bounds) {
  const x = Math.max(0, Math.floor(bounds.x)), y = Math.max(0, Math.floor(bounds.y));
  const width = Math.max(1, Math.min(ctx.canvas.width - x, Math.ceil(bounds.width)));
  const height = Math.max(1, Math.min(ctx.canvas.height - y, Math.ceil(bounds.height)));
  const pixels = ctx.getImageData(x, y, width, height).data;
  const step = Math.max(1, Math.floor(Math.sqrt(width * height / 5000)));
  let red = 0, green = 0, blue = 0, weight = 0;
  for (let py = 0; py < height; py += step) for (let px = 0; px < width; px += step) {
    const offset = (py * width + px) * 4, alpha = pixels[offset + 3] / 255;
    const brightness = (pixels[offset] + pixels[offset + 1] + pixels[offset + 2]) / 3;
    if (alpha < .35 || brightness < 8 || brightness > 247) continue;
    red += pixels[offset] * alpha; green += pixels[offset + 1] * alpha; blue += pixels[offset + 2] * alpha; weight += alpha;
  }
  return weight ? [red / weight, green / weight, blue / weight] : [40, 45, 55];
}

function adaptiveDarkRgb(rgb) {
  const peak = Math.max(...rgb) || 1;
  const target = Math.max(22, Math.min(48, peak * .3));
  return rgb.map(value => Math.round(value * target / peak));
}

function adaptiveStrokeRgb(rgb, ring) {
  // Keep the artwork's hue, then lift it into a bright enamel/gold range.
  // A popup ring must remain visible on the black page mask and must never
  // collapse into a neutral black or grey outline.
  const peak = Math.max(...rgb), floor = Math.min(...rgb);
  const chroma = Math.max(18, peak - floor);
  const vivid = rgb.map(value => 118 + ((value - floor) / chroma) * 105);
  const warmHighlight = ring === "inner" ? [255, 226, 157] : [255, 244, 211];
  const mix = ring === "inner" ? .36 : .58;
  return vivid.map((value, index) => Math.max(150, Math.min(255, Math.round(value * (1 - mix) + warmHighlight[index] * mix))));
}

function repairedBackgroundFor(sourceName) {
  return (state.task.localAi?.outputs || []).find((item) => item.kind === "repaired-background" && item.sourceAssetName === sourceName);
}

function popupForegroundFor(template, background) {
  const selected = selectedAssetName(state.task, template, "character");
  const manual = state.task.assets.find((item) => item.name === selected && !item.derived && ["character", "core-character"].includes(item.role));
  if (manual) return manual;
  const requestedSource = background.sourceAssetName || selectedAssetName(state.task, template, "background");
  return findForegroundOutput(state.task.localAi, requestedSource);
}

function rgba(rgb, alpha) { return `rgba(${rgb.map(Math.round).join(",")},${alpha})`; }

function drawFixedPsdElements(ctx, template) {
  const rule = state.data.psdLayoutRules?.templates?.find((item) => item.templateId === template.id);
  const allRegions = [...(rule?.globalRegions || []), ...(activePsdVariant(template)?.regions || [])];
  const regions = allRegions.filter((region) => region.type === "fixed" && region.bounds);
  const kvBounds = allRegions.find((region) => region.type === "kv-input" && region.bounds)?.bounds || { x: 0, y: 0, width: ctx.canvas.width, height: ctx.canvas.height };
  const kvColor = sampledCanvasColor(ctx, kvBounds);
  for (const region of regions) {
    const { x, y, width, height } = region.bounds;
    const effect = region.effect || {};
    if (effect.kind === "adaptive-stroke" || /圆形边框.*KV取色/.test(region.name)) {
      const ring = effect.ring || (/内圈/.test(region.name) ? "inner" : "outer");
      const body = allRegions.find((item) => item.type === "body-boundary" && item.bounds);
      const strokeRegion = ring === "inner" && body?.shape === "ellipse" ? body : { ...region, shape: "ellipse" };
      ctx.save();
      tracePsdRegion(ctx, strokeRegion);
      ctx.strokeStyle = rgba(adaptiveStrokeRgb(kvColor, ring), ring === "inner" ? .98 : .9);
      ctx.lineWidth = Math.max(ring === "inner" ? 3 : 1, Math.round(Math.min(width, height) * (ring === "inner" ? .006 : .002)));
      ctx.stroke(); ctx.restore();
      continue;
    }
    const adaptive = effect.kind === "adaptive-dark-gradient" || /暗色渐变_KV取色/.test(region.name);
    const fixedDark = effect.kind === "dark-gradient" || /黑色蒙层渐变|底部暗色渐变/.test(region.name);
    if (adaptive || fixedDark) {
      const side = effect.side || (/左侧/.test(region.name) ? "left" : /右侧/.test(region.name) ? "right" : /上侧/.test(region.name) ? "top" : "bottom");
      const color = adaptive ? adaptiveDarkRgb(sampledCanvasColor(ctx, region.bounds)) : [0, 0, 0];
      const gradient = side === "left" ? ctx.createLinearGradient(x, 0, x + width, 0)
        : side === "right" ? ctx.createLinearGradient(x, 0, x + width, 0)
        : side === "top" ? ctx.createLinearGradient(0, y, 0, y + height)
        : ctx.createLinearGradient(0, y, 0, y + height);
      const outerFirst = side === "left" || side === "top";
      gradient.addColorStop(0, rgba(color, outerFirst ? .82 : 0));
      gradient.addColorStop(1, rgba(color, outerFirst ? 0 : .82));
      ctx.fillStyle = gradient; ctx.fillRect(x, y, width, height); continue;
    }
    if (/底部白色渐变/.test(region.name)) {
      const gradient = ctx.createLinearGradient(0, y, 0, y + height);
      gradient.addColorStop(0, "rgba(255,255,255,0)"); gradient.addColorStop(1, "rgba(255,255,255,1)");
      ctx.fillStyle = gradient; ctx.fillRect(x, y, width, height);
    }
  }
}

function drawFinalPsdEffects(ctx, template) {
  const rule = state.data.psdLayoutRules?.templates?.find((item) => item.templateId === template.id);
  const allRegions = [...(rule?.globalRegions || []), ...(activePsdVariant(template)?.regions || [])];
  const regions = allRegions.filter((region) => region.bounds && (region.type === "transparent-fade" || region.effect?.kind === "alpha-fade"));
  for (const region of regions) {
    const { x, y, width, height } = region.bounds;
    const side = region.effect?.side || "bottom";
    const gradient = side === "top"
      ? ctx.createLinearGradient(0, y, 0, y + height)
      : side === "left" || side === "right"
        ? ctx.createLinearGradient(x, 0, x + width, 0)
        : ctx.createLinearGradient(0, y, 0, y + height);
    const eraseAtStart = side === "top" || side === "left";
    gradient.addColorStop(0, eraseAtStart ? "rgba(0,0,0,1)" : "rgba(0,0,0,0)");
    gradient.addColorStop(1, eraseAtStart ? "rgba(0,0,0,0)" : "rgba(0,0,0,1)");
    ctx.save();
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, width, height);
    ctx.restore();
  }
}

function drawBreakoutCharacter(ctx, template) {
  const breakout = psdRegionInfo(template, "character-breakout");
  const body = psdRegionInfo(template, "body-boundary");
  if (!breakout || !body) return;
  const manualName = selectedAssetName(state.task, template, "character");
  const manualAsset = state.task.assets.find((item) => item.name === manualName && !item.derived && ["character", "core-character"].includes(item.role));
  const manualImage = manualAsset && state.assetImages.get(manualAsset.name);
  const background = getTemplateBackground(state.task, template);
  const asset = popupForegroundFor(template, background);
  const image = asset && state.assetImages.get(asset.name);
  if (!manualImage && !image) return;
  const layer = document.createElement("canvas");
  layer.width = ctx.canvas.width; layer.height = ctx.canvas.height;
  const layerCtx = layer.getContext("2d");
  layerCtx.imageSmoothingEnabled = true; layerCtx.imageSmoothingQuality = "high";
  let contentTop = Infinity;
  if (manualImage) {
    const layout = getElementLayout(state.task, template, "character");
    if (layout.visible === false) return;
    layerCtx.drawImage(manualImage, layout.x, layout.y, layout.width, layout.height);
    applyImageBottomFade(layerCtx, manualImage, layout);
    contentTop = layout.y + imageAlphaBounds(manualImage).top / manualImage.naturalHeight * layout.height;
  } else {
    // 自动人物层同样完整覆盖主体区；背景已换成配套的无人物底图，
    // 因而移动或缩放时不会从底层露出第二套人物。
    const draw = getElementLayout(state.task, template, "character");
    if (draw.visible === false) return;
    // Reviewed character layers have their own transparent silhouette. A
    // circular body clip would cut off people near the circle's side edge.
    layerCtx.drawImage(image, draw.x, draw.y, draw.width, draw.height);
    if (!/reviewed-source-pixel-cutout/.test(asset.qualityStatus || "")) applyImageBottomFade(layerCtx, image, draw);
    contentTop = draw.y + imageAlphaBounds(image).top / image.naturalHeight * draw.height;
  }
  if (asset?.protectedRegions?.length && !manualImage && body.shape === "ellipse") {
    applyProtectedCircleExit(layerCtx, body, breakout, asset, getElementLayout(state.task, template, "character"), image);
  } else if (manualImage || !/reviewed-source-pixel-cutout/.test(asset?.qualityStatus || "")) {
    applyCharacterEdgeFade(layerCtx, body, breakout, contentTop);
  }

  ctx.drawImage(layer, 0, 0);
}

function applyProtectedCircleExit(layerCtx, body, breakout, asset, draw, image) {
  const { x, y, width, height } = body.bounds;
  const rx = width / 2, ry = height / 2;
  const cx = x + rx, cy = y + ry;
  const safeTop = breakout.bounds.y + breakout.bounds.height;
  const feather = Math.max(26, Math.min(60, width * .09));
  const regions = asset.protectedRegions.map((region) => ({
    cx: draw.x + region.center[0] / image.naturalWidth * draw.width,
    cy: draw.y + region.center[1] / image.naturalHeight * draw.height,
    rx: region.radius[0] / image.naturalWidth * draw.width,
    ry: region.radius[1] / image.naturalHeight * draw.height,
  }));
  const mask = document.createElement("canvas");
  mask.width = layerCtx.canvas.width; mask.height = layerCtx.canvas.height;
  const maskCtx = mask.getContext("2d", { willReadFrequently: true });
  const pixels = maskCtx.createImageData(mask.width, mask.height);
  for (let py = 0; py < mask.height; py += 1) {
    for (let px = 0; px < mask.width; px += 1) {
      let alpha = 255;
      if (py > safeTop) {
        const radial = Math.hypot((px - cx) / rx, (py - cy) / ry);
        const outside = Math.max(0, (radial - 1) * Math.min(rx, ry));
        alpha = Math.round(255 * Math.max(0, 1 - outside / feather));
        if (alpha < 255 && regions.some((region) => region.rx > 0 && region.ry > 0
          && ((px - region.cx) / region.rx) ** 2 + ((py - region.cy) / region.ry) ** 2 <= 1)) alpha = 255;
      }
      pixels.data[(py * mask.width + px) * 4 + 3] = alpha;
    }
  }
  maskCtx.putImageData(pixels, 0, 0);
  layerCtx.save(); layerCtx.globalCompositeOperation = "destination-in";
  layerCtx.drawImage(mask, 0, 0); layerCtx.restore();
}

const alphaBoundsCache = new WeakMap();
function imageAlphaBounds(image) {
  if (alphaBoundsCache.has(image)) return alphaBoundsCache.get(image);
  const sample = document.createElement("canvas");
  const ratio = Math.min(1, 512 / Math.max(image.naturalWidth, image.naturalHeight));
  sample.width = Math.max(1, Math.round(image.naturalWidth * ratio));
  sample.height = Math.max(1, Math.round(image.naturalHeight * ratio));
  const sampleCtx = sample.getContext("2d", { willReadFrequently:true });
  sampleCtx.drawImage(image, 0, 0, sample.width, sample.height);
  const pixels = sampleCtx.getImageData(0, 0, sample.width, sample.height).data;
  let top = sample.height, bottom = -1;
  for (let y = 0; y < sample.height; y += 1) for (let x = 0; x < sample.width; x += 1) {
    if (pixels[(y * sample.width + x) * 4 + 3] > 20) { top = Math.min(top, y); bottom = Math.max(bottom, y); }
  }
  const bounds = bottom >= top ? { top:top / ratio, bottom:(bottom + 1) / ratio } : { top:0, bottom:image.naturalHeight };
  alphaBoundsCache.set(image, bounds);
  return bounds;
}

function applyImageBottomFade(layerCtx, image, draw) {
  const bounds = imageAlphaBounds(image);
  const contentTop = draw.y + bounds.top / image.naturalHeight * draw.height;
  const contentBottom = draw.y + bounds.bottom / image.naturalHeight * draw.height;
  const fade = Math.max(34, Math.min(150, (contentBottom - contentTop) * .2));
  // destination-in clears every destination pixel where the source is
  // transparent. Applying it to only the fade rectangle therefore erased the
  // entire head/breakout area and left a horizontal strip. Build a full-size
  // mask instead: keep the complete figure above the lower transition, then
  // feather only the actual bottom edge of the extracted character content.
  const mask = document.createElement("canvas");
  mask.width = layerCtx.canvas.width; mask.height = layerCtx.canvas.height;
  const maskCtx = mask.getContext("2d");
  const fadeStart = Math.max(0, contentBottom - fade);
  maskCtx.fillStyle = "#fff";
  maskCtx.fillRect(0, 0, mask.width, fadeStart);
  const gradient = maskCtx.createLinearGradient(0, fadeStart, 0, contentBottom);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  maskCtx.fillStyle = gradient;
  maskCtx.fillRect(0, fadeStart, mask.width, Math.max(1, contentBottom - fadeStart));
  layerCtx.save(); layerCtx.globalCompositeOperation = "destination-in";
  layerCtx.drawImage(mask, 0, 0); layerCtx.restore();
}

function applyCharacterEdgeFade(layerCtx, body, breakout, contentTop = Infinity) {
  const bounds = breakout.bounds;
  if (!bounds || bounds.height <= 0) return;
  const fade = Math.max(18, Math.min(bounds.height * .28, layerCtx.canvas.height * .075));
  const mask = document.createElement("canvas");
  mask.width = layerCtx.canvas.width; mask.height = layerCtx.canvas.height;
  const maskCtx = mask.getContext("2d");
  maskCtx.save(); tracePsdRegion(maskCtx, breakout); maskCtx.clip();
  if (contentTop < bounds.y - 8) {
    const gradient = maskCtx.createLinearGradient(0, bounds.y, 0, bounds.y + fade);
    gradient.addColorStop(0, "rgba(255,255,255,0)");
    gradient.addColorStop(1, "rgba(255,255,255,1)");
    maskCtx.fillStyle = gradient;
  } else maskCtx.fillStyle = "#fff";
  maskCtx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height); maskCtx.restore();
  const sideFade = Math.max(18, Math.min(bounds.width * .1, layerCtx.canvas.width * .045));
  maskCtx.save(); tracePsdRegion(maskCtx, breakout); maskCtx.clip(); maskCtx.globalCompositeOperation = "destination-in";
  const horizontal = maskCtx.createLinearGradient(bounds.x, 0, bounds.x + bounds.width, 0);
  const edge = Math.min(.24, sideFade / bounds.width);
  horizontal.addColorStop(0, "rgba(255,255,255,0)"); horizontal.addColorStop(edge, "rgba(255,255,255,1)");
  horizontal.addColorStop(1 - edge, "rgba(255,255,255,1)"); horizontal.addColorStop(1, "rgba(255,255,255,0)");
  maskCtx.fillStyle = horizontal; maskCtx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height); maskCtx.restore();
  maskCtx.fillStyle = "#fff"; tracePsdRegion(maskCtx, body); maskCtx.fill();
  layerCtx.save(); layerCtx.globalCompositeOperation = "destination-in"; layerCtx.drawImage(mask, 0, 0); layerCtx.restore();
}

function drawCommunityBackdrop(ctx, template) {
  const {width:w,height:h}=template,portrait=h>w;
  const gradient=ctx.createLinearGradient(0,0,w,h);
  gradient.addColorStop(0,'#12324e');gradient.addColorStop(.55,'#265a75');gradient.addColorStop(1,'#132640');
  ctx.fillStyle=gradient;ctx.fillRect(0,0,w,h);
  ctx.save();ctx.translate(portrait?w*.48:w*.72,h*.54);
  const radius=Math.max(w,h)*1.5;
  for(let i=0;i<28;i++){
    const a=i*Math.PI*2/28,b=a+Math.PI/28;
    ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(Math.cos(a)*radius,Math.sin(a)*radius);ctx.lineTo(Math.cos(b)*radius,Math.sin(b)*radius);ctx.closePath();
    ctx.fillStyle=i%3===0?'rgba(255,187,78,.23)':'rgba(69,199,218,.12)';ctx.fill();
  }
  ctx.restore();
  ctx.fillStyle='rgba(9,25,48,.35)';ctx.fillRect(0,h*.8,w,h*.2);
  ctx.strokeStyle='rgba(255,223,154,.65)';ctx.lineWidth=Math.max(2,w*.004);
  ctx.strokeRect(w*.017,h*.028,w*.966,h*.944);
  ctx.strokeStyle='rgba(115,218,230,.45)';ctx.lineWidth=Math.max(1,w*.002);
  ctx.strokeRect(w*.027,h*.048,w*.946,h*.904);
  const dotCount=Math.max(10,Math.round(w/30));
  for(let i=0;i<dotCount;i++){
    const x=((i*137.51)%w),y=((i*73.79)%h);
    ctx.fillStyle=i%2?'rgba(255,220,122,.42)':'rgba(124,231,255,.4)';
    ctx.beginPath();ctx.arc(x,y,Math.max(1,w*.0025),0,Math.PI*2);ctx.fill();
  }
}

function drawCommunityCopyAndCopyright(ctx,template,{kinds=['title','subtitle','ip-copyright']}={}){
  for(const kind of kinds){
    if(!nativeCopyValue(state.task,template,kind))continue;
    const options=nativeCopyOptions(state.task,template,kind);
    if(kind==='ip-copyright')drawCommunityCopyright(ctx,options);
    else drawNativeCopy(ctx,{...options,effects:options.rect.effects});
  }
}

function renderCanvas(template, showGuide,{popupButtonDraft}={}) {
  const canvas = document.createElement("canvas");
  canvas.width = template.width;
  canvas.height = template.height;
  const ctx = canvas.getContext("2d");
  if(state.task.sourceAdaptation&&isSourceAdaptation(state.task)){drawSourceComposition(ctx,state.task,template,state.assetImages,{project:state.data.projects?.find(p=>p.id===state.task.projectId)});return canvas;}
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  if(communityArtworkTargetPending(state.task,template)&&!communityTargetHasComposition(state.task,template)){
    const master=renderCanvas(state.task.masterTemplate,false),scale=Math.min(canvas.width/master.width,canvas.height/master.height);
    ctx.fillStyle='#eef1f7';ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(master,(canvas.width-master.width*scale)/2,(canvas.height-master.height*scale)/2,master.width*scale,master.height*scale);
    canvas.outpaintCoverageValid=false;canvas.communityReferenceOnly=true;return canvas;
  }
  const params = state.task.parameters;
  const background = getTemplateBackground(state.task, template);
  const buttonOnly = template.renderMode === "button-only";
  let usingRepairedPopupBackground = false;
  const savedPopup=popupConfig(state.task,template),popup=savedPopup&&popupButtonDraft?{...savedPopup,buttonFontSize:popupButtonDraft.buttonFontSize,buttonTextPosition:popupButtonDraft.buttonTextPosition}:savedPopup;
  if(popup){drawPopupBackground(ctx,popup,state.assetImages.get(selectedAssetName(state.task,template,"background")),background);canvas.outpaintCoverageValid=true;}
  else if (buttonOnly) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    canvas.outpaintCoverageValid = true;
  } else {
    const communityCleanBackground = template.communityPlacement && !background.url && !selectedAssetName(state.task, template, 'background');
    if (communityCleanBackground) {
      drawCommunityBackdrop(ctx, template);
      canvas.outpaintCoverageValid = true;
    } else {
    const bodyBoundary = psdRegionInfo(template, "body-boundary");
    if (bodyBoundary) { ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.save(); tracePsdRegion(ctx, bodyBoundary); ctx.clip(); }
    ctx.fillStyle = background.fit==='contain'?'#eef1f7':params.background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    let image = templateSourceImage(state.task, template);
    if (template.renderMode === "masked-popup") {
      const foreground = popupForegroundFor(template, background);
      const sourceName = foreground?.sourceAssetName || background.sourceAssetName || selectedAssetName(state.task, template, "background");
      const repaired = foreground && repairedBackgroundFor(sourceName);
      const repairedImage = repaired && state.assetImages.get(repaired.name);
      if (repairedImage) { image = repairedImage; usingRepairedPopupBackground = true; }
    }
    if (image) {
    const scale = (background.fit==='contain'?Math.min:Math.max)(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight) * (background.scale / 100);
    const drawWidth = image.naturalWidth * scale;
    const drawHeight = image.naturalHeight * scale;
    const x = -(drawWidth - canvas.width) * (background.focalX / 100);
    const y = -(drawHeight - canvas.height) * (background.focalY / 100);
    if (background.url && background.registration?.sourceRect && !usingRepairedPopupBackground) {
      const source = state.assetImages.get(background.sourceAssetName);
      if (!source) throw new Error("原始KV未加载，无法保护人物，请重新打开任务");
      const geometry = protectedComposition(canvas.width,canvas.height,source.naturalWidth,source.naturalHeight,background.originalPlacement,background.registration.sourceRect,background);
      // Wide banners make a short 3.5% blend visibly read as two vertical
      // joins. Use a broader transition on the extension axis while keeping
      // the protected source pixels intact through the centre.
      const featherX = Math.max(48, Math.min(Math.round(geometry.original.width * .12), Math.round(canvas.width * .08)));
      const featherY = Math.max(18, Math.min(Math.round(geometry.original.height * .08), Math.round(canvas.height * .08)));
      if (background.registration.safetyMethod === "generated-extension-edge-blend-v4") {
        ctx.drawImage(image,geometry.generated.x,geometry.generated.y,geometry.generated.width,geometry.generated.height);
      } else {
        drawRegisteredComposite(ctx,source,image,geometry,background.registration.safetyMethod === "generated-extension-original-protected-v3" ? {} : {featherX,featherY});
      }
      // Incomplete coverage is visible for adjustment, and explicitly rejected on export.
      canvas.outpaintCoverageValid = geometry.covered;
      if (!geometry.covered && showGuide) { ctx.fillStyle="#b83242";ctx.font="16px Microsoft YaHei";ctx.fillText("扩图范围不足，请增大缩放或重新扩图",12,24); }
    } else {
      ctx.drawImage(image, x, y, drawWidth, drawHeight);
      // A repaired popup background is deliberately character-free. Restoring
      // the protected original here puts the original figures back underneath
      // the movable foreground and creates visible duplicates after scaling.
      if (!usingRepairedPopupBackground) drawProtectedOriginal(ctx, template, background);
    }
    }
    if (bodyBoundary) ctx.restore();
    }
  }
  if (!buttonOnly) {
    drawFixedPsdElements(ctx, template);
    ctx.save();clipPopupCharacterBottom(ctx,popup,template.width);
    drawBreakoutCharacter(ctx, template);
    if (template.communityPlacement) drawUploadedElement(ctx, template, 'character');
    if (template.communityPlacement) drawUploadedElement(ctx, template, 'character2');
    if(template.communityPlacement)drawCommunityObjectLayers(ctx,state.task,template,state.assetImages,{kinds:['character'],selectedId:state.communityObjectCanvasSelectedId,showSelection:showGuide});
    ctx.restore();
    if (template.communityPlacement) drawUploadedElement(ctx, template, 'foreground');
  }
  const psdVariant = activePsdVariant(template);
  if (!buttonOnly && !template.communityPlacement && params.overlay > 0 && !psdVariant) { ctx.fillStyle = `rgba(8,10,20,${params.overlay / 100})`; ctx.fillRect(0, 0, canvas.width, canvas.height); }
  if (!template.communityPlacement && params.showText && state.task.copy.trim() && templateAllowsElement(state.task, template, "title") && !selectedAssetName(state.task, template, "title")) {
    const fontSize = Math.max(16, Math.round(params.fontSize * Math.min(1, canvas.width / 900)));
    ctx.font = `700 ${fontSize}px "Microsoft YaHei", sans-serif`;
    ctx.textBaseline = "top";
    ctx.fillStyle = params.textColor;
    ctx.shadowColor = "rgba(0,0,0,.45)";
    ctx.shadowBlur = Math.max(4, fontSize * 0.13);
    wrapText(ctx, state.task.copy, canvas.width * params.textX / 100, canvas.height * params.textY / 100, canvas.width * 0.72, fontSize * 1.28, template.textMax);
    ctx.shadowBlur = 0;
  }
  if(template.communityPlacement){
    const backing=getElementLayout(state.task,template,'subtitle-backing');
    drawSubtitleBacking(ctx,backing,backing.backing,state.assetImages.get(backing.backing?.assetName));
  }
  drawUploadedElement(ctx, template, "title");
  drawUploadedElement(ctx, template, "subtitle");
  drawUploadedElement(ctx, template, "logo");
  drawUploadedElement(ctx, template, "ip-copyright");
  if(popup&&(popup.buttonBackingAsset||!selectedAssetName(state.task,template,"button"))){
    const image=popup.buttonBackingAsset?state.assetImages.get(popup.buttonBackingAsset):null;
    if(popup.buttonBackingAsset&&!image)throw Error('按钮底板尚未加载，请刷新后导出');
    drawPopupButton(ctx,popup,getElementLayout(state.task,template,"button"),{image,fontFamily:popupFontFamily(popup)});
  }else drawUploadedElement(ctx,template,"button");
   if (template.communityPlacement) drawCommunityCopyAndCopyright(ctx, template,{kinds:['title','subtitle']});
   if(template.communityPlacement)drawCommunityObjectLayers(ctx,state.task,template,state.assetImages,{kinds:['reward','material'],selectedId:state.communityObjectCanvasSelectedId,showSelection:showGuide});
   if(template.communityPlacement)drawCommunityCopyAndCopyright(ctx,template,{kinds:['ip-copyright']});
  drawFinalPsdEffects(ctx, template);
  if (showGuide) {
    ctx.save();
    const rule = state.data.resourceRules?.find((item) => item.templateId === template.id);
    const region = psdRegion(template, "core") || rule?.geometry?.mainElementRegion;
    const safe = region || (() => { const s = template.safeArea || {left:.06,top:.08,right:.06,bottom:.08}; return {x:canvas.width*s.left,y:canvas.height*s.top,width:canvas.width*(1-s.left-s.right),height:canvas.height*(1-s.top-s.bottom)}; })();
    ctx.strokeStyle = "#079f72";
    ctx.lineWidth = Math.max(2, canvas.width / 700);
    ctx.setLineDash([canvas.width / 80, canvas.width / 120]);
    ctx.strokeRect(safe.x, safe.y, safe.width, safe.height);
    drawGuideLabel(ctx, safe.x, safe.y, `核心内容区 ${Math.round(safe.width)}×${Math.round(safe.height)}`, "#079f72");
    const layoutRule = state.data.psdLayoutRules?.templates?.find(item => item.templateId === template.id);
    const psdOcclusion = [...(activePsdVariant(template)?.regions || []), ...(layoutRule?.globalRegions || [])].filter(item => item.type === "page-occlusion" && item.bounds).map(item => ({ ...item.bounds, name:item.name }));
    const occlusionZones = psdOcclusion.length ? psdOcclusion : (rule?.geometry?.pageOcclusionZones || []);
    for (const zone of occlusionZones) {
      ctx.setLineDash([]); ctx.fillStyle = "rgba(239,68,68,.28)"; ctx.fillRect(zone.x, zone.y, zone.width, zone.height);
      ctx.strokeStyle = "#ef4444"; ctx.strokeRect(zone.x, zone.y, zone.width, zone.height);
      drawGuideLabel(ctx, zone.x, zone.y, `${zone.name || "页面UI遮挡区"} ${zone.width}×${zone.height}`, "#ef4444");
    }
    if (state.inspectorElement !== "background" && hasCanvasAsset(state.inspectorElement, template)) {
      const selected = getElementLayout(state.task, template, state.inspectorElement);
      ctx.save();
      if(selected.rotation && nativeCopyValue(state.task,template,state.inspectorElement)){
        const body=selected.contentRect || selected,cx=body.x+body.width/2,cy=body.y+body.height/2;
        ctx.translate(cx,cy);ctx.rotate(selected.rotation*Math.PI/180);ctx.translate(-cx,-cy);
      }
      ctx.setLineDash([10, 7]); ctx.lineWidth = Math.max(3, canvas.width / 620); ctx.strokeStyle = "#6c5ce7";
      ctx.strokeRect(selected.x, selected.y, selected.width, selected.height);
      ctx.setLineDash([]); ctx.fillStyle = "#ffffff"; ctx.strokeStyle = "#6c5ce7";
      for (const [handleX, handleY] of [[selected.x,selected.y],[selected.x+selected.width,selected.y],[selected.x,selected.y+selected.height],[selected.x+selected.width,selected.y+selected.height]]) {
        ctx.beginPath(); ctx.rect(handleX - 7, handleY - 7, 14, 14); ctx.fill(); ctx.stroke();
      }
      ctx.restore();
    }
    ctx.restore();
  }
  return canvas;
}

const buttonStateImageCache = new WeakMap();

function buttonImageForState(image, stateName) {
  if (!stateName || stateName === "normal") return image;
  let states = buttonStateImageCache.get(image);
  if (!states) { states = new Map(); buttonStateImageCache.set(image, states); }
  if (states.has(stateName)) return states.get(stateName);
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(image, 0, 0);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  transformButtonPixels(imageData.data, stateName, canvas.width, canvas.height);
  context.putImageData(imageData, 0, 0);
  states.set(stateName, canvas);
  return canvas;
}

function drawUploadedElement(ctx, template, kind) {
  if (!templateAllowsElement(state.task, template, kind)) return;
  const selectedName = selectedAssetName(state.task, template, kind);
  const selectedAsset = state.task.assets.find((item) => item.name === selectedName && item.mime?.startsWith("image/"));
  const buttonLabel = template.buttonLabel || "立即下载";
  const hasExplicitButton = kind === "button" && Boolean(state.task.parameters?.assetByTemplate?.[template?.id]?.button);
  const matchingButton = kind === "button"
    ? state.task.assets.find((item) => item.role === "button" && item.copy === buttonLabel && item.mime?.startsWith("image/"))
    : null;
  // A per-template choice is the designer's explicit selection. Keep copy-based
  // matching as the automatic fallback for templates that have no binding.
  const asset = hasExplicitButton ? selectedAsset : (matchingButton || selectedAsset);
  const image = asset && state.assetImages.get(asset.name);
  const layout = getElementLayout(state.task, template, kind);
  if (!image || layout.visible === false) return;
  const drawable = kind === "button" ? buttonImageForState(image, template.buttonState) : image;
  const naturalWidth = drawable.naturalWidth || drawable.width;
  const naturalHeight = drawable.naturalHeight || drawable.height;
  const scale = Math.min(layout.width / naturalWidth, layout.height / naturalHeight);
  const width = naturalWidth * scale;
  const height = naturalHeight * scale;
  const rect = { x:layout.x + (layout.width - width) / 2, y:layout.y + (layout.height - height) / 2, width, height };
  const fallbackShadow = kind === "button" && template.buttonState === "hover-gold"
    ? { color:"#ffcd69", opacity:16, blur:Math.max(2,height*.035), offsetX:0, offsetY:0 }
    : template.communityPlacement && ["character","character2"].includes(kind)
      ? { color:"#704c31", opacity:22, blur:Math.max(5,height*.025), offsetX:0, offsetY:Math.max(2,height*.012) }
      : null;
  drawElementWithEffects(ctx, drawable, rect, layout.effects, { fallbackShadow, flipX: ['character','character2'].includes(kind) && layout.flipX === true });
}

function drawGuideLabel(ctx, x, y, text, color) {
  const size = Math.max(11, Math.round(ctx.canvas.width / 95));
  ctx.font = `700 ${size}px "Microsoft YaHei", sans-serif`;
  const width = ctx.measureText(text).width + size;
  ctx.fillStyle = color; ctx.fillRect(x, Math.max(0, y - size * 2), width, size * 2);
  ctx.fillStyle = "#fff"; ctx.fillText(text, x + size / 2, Math.max(size * 1.35, y - size * .55));
}

function drawPolygon(ctx, points, color, label, close = true) {
  if (!points?.length) return;
  ctx.save(); ctx.strokeStyle = color; ctx.fillStyle = `${color}2a`; ctx.lineWidth = Math.max(3, ctx.canvas.width / 350); ctx.setLineDash([]);
  ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y); for (const point of points.slice(1)) ctx.lineTo(point.x, point.y); if (close) ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = color; ctx.font = `700 ${Math.max(12, ctx.canvas.width / 80)}px "Microsoft YaHei"`; ctx.fillText(label || "对象", points[0].x + 5, Math.max(18, points[0].y - 5)); ctx.restore();
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxChars) {
  const normalized = text.trim().slice(0, maxChars * 2);
  const lines = [];
  let line = "";
  for (const char of normalized) {
    const test = line + char;
    if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = char; } else line = test;
  }
  if (line) lines.push(line);
  lines.slice(0, 2).forEach((value, index) => ctx.fillText(value, x, y + index * lineHeight));
}

function canvasBlob(canvas, type, quality) { return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("图片编码失败")), type, quality)); }
async function optimizePngBlobLosslessly(blob) {
  const result = await api("/api/png/optimize", { method: "POST", body: JSON.stringify({ dataUrl: await blobToDataUrl(blob) }) });
  return await (await fetch(result.dataUrl)).blob();
}
async function compressPngCanvas(sourceCanvas, maxBytes, templateId = "") {
  const original = await canvasBlob(sourceCanvas, "image/png");
  if (original.size <= maxBytes) return original;
  let best = original;
  try {
    const optimized = await optimizePngBlobLosslessly(original);
    if (optimized.size < best.size) best = optimized;
    if (optimized.size <= maxBytes) return optimized;
  } catch { /* 服务不可用时继续使用浏览器高保真候选 */ }
  // 官网头图的渐变和肤色对粗量化很敏感；达到画质下限后应提示超限，不能继续压坏画面。
  const colorSteps = templateId === "platform-mobile-official-hero" ? [8, 10, 11, 12, 13, 14] : [8, 12, 16, 24];
  for (const step of colorSteps) {
    const canvas = document.createElement("canvas");
    canvas.width = sourceCanvas.width; canvas.height = sourceCanvas.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(sourceCanvas, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = imageData.data;
    for (let offset = 0; offset < pixels.length; offset += 4) {
      pixels[offset] = Math.min(255, Math.round(pixels[offset] / step) * step);
      pixels[offset + 1] = Math.min(255, Math.round(pixels[offset + 1] / step) * step);
      pixels[offset + 2] = Math.min(255, Math.round(pixels[offset + 2] / step) * step);
    }
    ctx.putImageData(imageData, 0, 0);
    let candidate = await canvasBlob(canvas, "image/png");
    try { candidate = await optimizePngBlobLosslessly(candidate); } catch { /* 保留浏览器编码结果 */ }
    if (candidate.size < best.size) best = candidate;
    if (candidate.size <= maxBytes) return candidate;
  }
  return best;
}
function fileToDataUrl(file) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); }); }
function blobToDataUrl(blob) { return fileToDataUrl(blob); }
function loadImage(url) { return new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error("无法读取主图")); image.src = url; }); }
function formatBytes(bytes) { return bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)}MB` : `${Math.ceil(bytes / 1024)}KB`; }
function assetRoleName(role) { return ({ "clean-kv":"干净KV", master: "通用完整主视觉", "master-landscape": "完整主视觉（横版）", "master-portrait": "完整主视觉（竖版）", background: "通用无文字底图", "background-landscape": "无文字底图（横版）", "background-portrait": "无文字底图（竖版）", foreground: "前景装饰透明PNG", title: "主标美术字PNG", subtitle: "副标美术字PNG", logo: "Logo PNG", "ip-copyright":"IP版权标识", button: "按钮素材", character: "透明角色PNG", "core-character": "透明核心人物PNG", supplement: "补充素材", "source-psd": "主图PSD留档" })[role] || "补充素材"; }

function populateTaskForm() {
  document.querySelector("#project-select").innerHTML = `<option value="">选择项目（可选）</option>${state.data.projects.filter((project) => project.status === "active").map((project) => `<option value="${esc(project.id)}">${esc(project.name)}</option>`).join("")}`;
  document.querySelector("#task-business-line").innerHTML = state.data.businessLines.filter((line) => line.enabled).map((line) => `<option value="${line.id}">${esc(line.name)}</option>`).join("");
  document.querySelector("#brand-select").value = "";
  syncTaskSegments();
}

function syncTaskSegments() {
  const lineId = document.querySelector("#task-business-line").value;
  const line = state.data.businessLines.find((item) => item.id === lineId);
  updateQuickTaskHeading();
  const segments = (line?.segments || []).filter((segment) => segment.enabled);
  document.querySelector("#task-segment-menu").innerHTML = segments.map((segment, index) => `<label><input type="checkbox" name="segmentIds" value="${segment.id}" ${index === 0 ? "checked" : ""}/><span>${esc(segment.name)}</span></label>`).join("");
  document.querySelectorAll('#task-segment-menu input').forEach((input) => input.addEventListener("change", () => { updateTaskSegmentSummary(); syncTaskTemplates(); }));
  updateTaskSegmentSummary();
  syncTaskTemplates();
  updateQuickScope();
}

function selectedTaskSegmentIds() {
  return [...document.querySelectorAll('#task-segment-menu input:checked')].map((input) => input.value);
}

function updateTaskSegmentSummary() {
  const checked = [...document.querySelectorAll('#task-segment-menu input:checked')];
  const button = document.querySelector("#task-segment-toggle");
  if (!button) return;
  button.textContent = checked.length ? checked.map((input) => input.nextElementSibling.textContent).join("、") : "请选择细分渠道 / 类型";
  button.classList.toggle("placeholder", checked.length === 0);
}

function syncTaskTemplates() {
  const lineId = document.querySelector("#task-business-line").value;
  const segmentIds = selectedTaskSegmentIds();
  const visibleTemplates = state.data.templates.filter((template) => !template.communityMaster&&template.businessLineId === lineId && segmentIds.includes(template.segmentId));
  document.querySelector("#target-templates").innerHTML = visibleTemplates.map((template) => { const readiness = template.automationReady === false ? " · 规范待补充" : ""; return `<label class="check-card"><input type="checkbox" name="targetTemplateIds" value="${template.id}" ${template.automationReady === false ? "disabled" : "checked"}/><span><b>${esc(template.name)}</b><small>${template.width}×${template.height} · ${template.format} · ≤${Math.round(template.maxBytes / 1024)}KB${readiness}</small></span></label>`; }).join("") || `<p class="subtext">请至少选择一个细分渠道 / 类型。</p>`;
  updateQuickScope();
}

function syncTaskModeFields() {
  document.querySelectorAll("[data-quick-mode]").forEach(b=>{const active=b.dataset.quickMode===document.querySelector("#task-mode").value;b.classList.toggle("active",active);b.setAttribute("aria-pressed",String(active));});
}

let quickCreatedTask = null;
let quickTaskSession=0;
let quickAssetLoading=false;
let quickBusy = false;
let quickSuggestedName = '';
let quickFolderInspection = 0;
let quickPastedAssets = [];
let quickImportedFolder = '';
let quickProjectBusy = false;
let quickProjectLibraryUse = null;
function renderQuickPastedAssets() {
  const staged=quickProjectLibraryUse;
  document.querySelector('#quick-pasted-assets').innerHTML=(staged?`<div class="quick-pasted-asset">${staged.asset.category==='font'?'':`<img src="${esc(staged.asset.url)}" alt="项目素材预览">`}<span>${esc(staged.asset.displayName||staged.asset.name)}<small>项目素材 · ${staged.mode==='reference'?'AI 参考':'原样使用'}</small></span><button type="button" data-remove-project-material aria-label="移除项目素材" ${quickBusy?'disabled':''}>×</button></div>`:'')+quickPastedAssets.map(a=>`<div class="quick-pasted-asset">${a.url?`<img src="${a.url}" alt="源素材预览"/>`:`<span class="quick-source-file-icon">${/\.psb$/i.test(a.file.name)?'PSB':/\.psd$/i.test(a.file.name)?'PSD':'图片'}</span>`}<span>${esc(a.file.name)}<small>${formatBytes(a.file.size)}${a.uploaded?' · 已保存':''}</small></span><button type="button" data-remove-paste="${a.id}" aria-label="移除 ${esc(a.file.name)}" ${a.uploaded||quickBusy?'disabled':''}>×</button></div>`).join('');
}
function clearQuickPastedAssets(){quickPastedAssets.forEach(a=>{if(a.url)URL.revokeObjectURL(a.url);});quickPastedAssets=[];renderQuickPastedAssets();}
const quickSourceBox=document.querySelector('.quick-source-box'),quickSourceFiles=document.querySelector('#quick-source-files');
let quickPasteTimer=0;
function stageQuickSourceFiles(files){
 if(quickBusy||quickAssetLoading)return;
 try{for(const original of files){const {file,photoshop}=quickSourceFile(original);if(quickPastedAssets.some(a=>a.file.name===file.name&&a.file.size===file.size))continue;quickPastedAssets.push({id:crypto.randomUUID(),file,url:photoshop?'':URL.createObjectURL(file),uploaded:false});}renderQuickPastedAssets();document.querySelector('#quick-task-error').textContent='';}catch(e){document.querySelector('#quick-task-error').textContent=e.message;}
}
async function pasteQuickSourceFiles(){
 if(!taskDialog.open||quickBusy||quickAssetLoading)return;
 if(window.wbPlatform?.mode==='platform'){document.querySelector('#quick-task-error').textContent='在平台上请点“上传文件”或把源文件拖进来；浏览器读不到在文件夹里复制的 PSD。';return;}
 const session=quickTaskSession;quickAssetLoading=true;
 const error=document.querySelector('#quick-task-error');error.textContent='';
 try{const result=await api('/api/source-clipboard',{method:'POST',headers:{'Content-Type':'application/json','X-Workbench-Clipboard':'1'},body:'{}'});if(session!==quickTaskSession||!taskDialog.open)return;if(!result.files.length)throw Error('剪贴板中没有源文件。请在文件夹中复制 PSD 或图片后粘贴，也可点击“上传文件”。');for(const file of result.files){if(!quickPastedAssets.some(a=>a.file.name===file.name&&a.file.size===file.size))quickPastedAssets.push({id:crypto.randomUUID(),file:{name:file.name,size:file.size},ticket:file.ticket,url:'',uploaded:false});}renderQuickPastedAssets();}
 catch(e){if(session===quickTaskSession)error.textContent=e.message;}finally{if(session===quickTaskSession)quickAssetLoading=false;}
}
quickSourceBox.addEventListener('click',e=>{if(!e.target.closest('button'))e.currentTarget.focus();});
quickSourceBox.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='v'){clearTimeout(quickPasteTimer);quickPasteTimer=setTimeout(()=>void pasteQuickSourceFiles(),250);}});
document.querySelector('#quick-source-upload').onclick=()=>quickSourceFiles.click();quickSourceFiles.onchange=()=>{stageQuickSourceFiles([...quickSourceFiles.files]);quickSourceFiles.value='';};
document.querySelector('#quick-source-paste').onclick=()=>void pasteQuickSourceFiles();
quickSourceBox.addEventListener('dragover',e=>{e.preventDefault();quickSourceBox.classList.add('dragging');});quickSourceBox.addEventListener('dragleave',()=>quickSourceBox.classList.remove('dragging'));quickSourceBox.addEventListener('drop',e=>{e.preventDefault();quickSourceBox.classList.remove('dragging');stageQuickSourceFiles([...e.dataTransfer.files]);});
taskDialog.addEventListener('paste',event=>{
 if(quickBusy)return;clearTimeout(quickPasteTimer);const files=clipboardSourceFiles(event.clipboardData);
 if(files.length){event.preventDefault();stageQuickSourceFiles(files);return;}
 if(quickSourceBox.contains(event.target)){event.preventDefault();void pasteQuickSourceFiles();}
});
document.querySelector('#quick-pasted-assets').addEventListener('click',event=>{
  if(event.target.closest('[data-remove-project-material]')&&!quickBusy){quickProjectLibraryUse=null;renderQuickPastedAssets();return;}
  const button=event.target.closest('[data-remove-paste]');if(!button||quickBusy)return;
  const asset=quickPastedAssets.find(a=>a.id===button.dataset.removePaste);if(!asset||asset.uploaded)return;
  if(asset.url)URL.revokeObjectURL(asset.url);quickPastedAssets=quickPastedAssets.filter(a=>a!==asset);renderQuickPastedAssets();
});
function renderQuickProjectPicker(){
  const select=document.querySelector('#project-select');
  document.querySelector('#quick-project-value').textContent=select.selectedOptions[0]?.textContent||'选择项目（可选）';
  document.querySelector('#quick-project-options').innerHTML=[...select.options].map(option=>`<button type="button" role="option" data-quick-project="${esc(option.value)}" aria-selected="${option.selected}" tabindex="${option.selected?'0':'-1'}"><span>${esc(option.textContent)}</span><span aria-hidden="true">${option.selected?'✓':''}</span></button>`).join('');
}
function showQuickProjectCreation(show){
  document.querySelector('#quick-project-create').hidden=!show;
  document.querySelector('#quick-new-project').hidden=show;
  document.querySelector('#quick-new-project').setAttribute('aria-expanded',String(show));
  document.querySelector('#quick-project-error').textContent='';
  if(show)document.querySelector('#quick-project-name').focus();
}
function closeQuickProjectMenu({focus=false}={}){
  document.querySelector('#quick-project-menu').hidden=true;
  document.querySelector('#quick-project-toggle').setAttribute('aria-expanded','false');
  showQuickProjectCreation(false);
  if(focus)document.querySelector('#quick-project-toggle').focus();
}
function openQuickProjectMenu(){
  if(quickBusy||quickProjectBusy)return;
  renderQuickProjectPicker();
  document.querySelector('#quick-project-menu').hidden=false;
  document.querySelector('#quick-project-toggle').setAttribute('aria-expanded','true');
  document.querySelector('#quick-project-options [aria-selected="true"]')?.focus();
}
document.querySelector('#quick-project-toggle').onclick=()=>{
  if(document.querySelector('#quick-project-menu').hidden)openQuickProjectMenu();else closeQuickProjectMenu({focus:true});
};
document.querySelector('#quick-project-toggle').addEventListener('keydown',event=>{
  if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();openQuickProjectMenu();}
});
document.querySelector('#quick-project-options').addEventListener('click',event=>{
  const option=event.target.closest('[data-quick-project]');if(!option||quickBusy||quickProjectBusy)return;
  const select=document.querySelector('#project-select');select.value=option.dataset.quickProject;select.dispatchEvent(new Event('change',{bubbles:true}));closeQuickProjectMenu({focus:true});
});
document.querySelector('#quick-project-options').addEventListener('keydown',event=>{
  const options=[...event.currentTarget.querySelectorAll('[role=option]')],index=options.indexOf(document.activeElement);
  if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
  event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?options.length-1:(index+(event.key==='ArrowDown'?1:-1)+options.length)%options.length;
  options.forEach((option,i)=>option.tabIndex=i===next?0:-1);options[next]?.focus();
});
document.querySelector('.quick-project-picker').addEventListener('keydown',event=>{
  if(event.key==='Escape'&&!document.querySelector('#quick-project-menu').hidden){event.preventDefault();event.stopPropagation();if(!quickProjectBusy)closeQuickProjectMenu({focus:true});}
});
document.querySelector('.quick-project-picker').addEventListener('focusout',event=>{
  if(event.relatedTarget&&!event.currentTarget.contains(event.relatedTarget)&&!quickProjectBusy)closeQuickProjectMenu();
});
document.addEventListener('click',event=>{if(!event.target.closest('.quick-project-picker')&&!quickProjectBusy)closeQuickProjectMenu();});
document.querySelector('#quick-new-project').onclick=()=>{if(!quickProjectBusy&&!quickBusy)showQuickProjectCreation(true);};
document.querySelector('#quick-project-cancel').onclick=()=>{if(!quickProjectBusy){showQuickProjectCreation(false);document.querySelector('#quick-new-project').focus();}};
async function createQuickProject(){
  if(quickProjectBusy||quickBusy)return;
  const input=document.querySelector('#quick-project-name'),error=document.querySelector('#quick-project-error'),name=input.value.trim();error.textContent='';
  if(!name){error.textContent='请填写项目名称';input.focus();return;}
  const controls=[...document.querySelectorAll('.quick-project-picker button,.quick-project-picker input')];
  quickProjectBusy=true;controls.forEach(control=>control.disabled=true);
  const save=document.querySelector('#quick-project-save');save.textContent='正在创建…';
  try{
    const project=await api('/api/projects',{method:'POST',body:JSON.stringify({name,businessLineIds:[document.querySelector('#task-business-line').value]})});
    if(!project?.id||!project.name)throw Error('项目创建回执不完整，请刷新项目列表核对');
    window.dispatchEvent(new CustomEvent('workbench-project-created',{detail:{project}}));
    const select=document.querySelector('#project-select');select.add(new Option(project.name,project.id));select.value=project.id;select.dispatchEvent(new Event('change',{bubbles:true}));
    closeQuickProjectMenu();input.value='';toast('项目已创建并选中');
  }catch(e){error.textContent=e.message;}finally{quickProjectBusy=false;controls.forEach(control=>control.disabled=false);save.textContent='创建并选中';if(document.querySelector('#quick-project-menu').hidden)document.querySelector('#quick-project-toggle').focus();}
}
document.querySelector('#quick-project-save').onclick=createQuickProject;
document.querySelector('#quick-project-name').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();createQuickProject();}});

function updateQuickTaskHeading() {
  renderQuickProjectPicker();
  const line=document.querySelector('#task-business-line').value;
  const business=businesses.find(b=>b.line===line);
  document.querySelector('#quick-task-title').textContent=`新建${line==='platform-community'?'平台':line==='performance-marketing'?'投放':'渠道资源位'}任务`;
  document.querySelector('#quick-task-business').textContent=business?.name||'素材制作';
  const project=state.data.projects.find(p=>p.id===document.querySelector('#project-select').value);
  const input=document.querySelector('#task-form [name=project]');
  if(!input.value||input.value===quickSuggestedName){quickSuggestedName=`${project?.name||'新素材'}－${business?.name||'制作任务'}`;input.value=quickSuggestedName;}
  updateQuickScope();
}
function updateQuickScope(){
  const count=document.querySelectorAll('#target-templates input:checked').length;
  document.querySelector('#quick-scope-name').textContent=document.querySelector('#task-segment-toggle').textContent||'目标资源位';
  document.querySelector('#quick-scope-count').textContent=`已选 ${count} 个资源位 · 可调整制作范围`;
}
async function checkQuickFolder(){
  const folderPath=document.querySelector('#quick-folder').value.trim(),result=document.querySelector('#quick-source-result');
  const token=++quickFolderInspection;
  if(!folderPath){result.textContent='可先保存任务，稍后在编辑器添加素材。';return;}
  result.textContent='正在检查素材文件夹…';
  try{const data=await api('/api/material-folder/inspect',{method:'POST',body:JSON.stringify({folderPath})});
    if(token!==quickFolderInspection)return;
     result.innerHTML=`<div class="quick-file-chips">${data.files.slice(0,6).map(f=>`<span>${esc(f.name)}</span>`).join('')}</div><small>已找到 ${data.files.length} 个素材文件${data.files.length>6?'，仅展示前6个':''}。${data.files.every(f=>/\.ps[db]$/i.test(f.name))?'创建时自动提取 PSD/PSB 的可见图层组，源文件同时保留。':'创建时导入并按现有规则识别用途。'}</small>`;
  }catch(e){if(token===quickFolderInspection)result.textContent=e.message;throw e;}
}
function openNewTask(mode = 'adapt') {
  if(quickBusy||quickProjectBusy)return;
  const form=document.querySelector('#task-form');form.reset();quickTaskSession++;quickAssetLoading=false;quickProjectLibraryUse=null;clearQuickPastedAssets();quickImportedFolder='';closeQuickProjectMenu();quickCreatedTask=null;quickBusy=false;quickSuggestedName='';quickFolderInspection++;
  form.querySelectorAll('details').forEach(d=>d.open=false);document.querySelector('#quick-source-result').textContent='';document.querySelector('#quick-task-error').textContent='';
  populateTaskForm();
  let recent='';try{recent=localStorage.getItem('task-recent-project')||'';}catch{}
  const project=state.data.projects.find(p=>p.id===recent&&p.status==='active')||state.data.projects.find(p=>p.status==='active');
  if(project){document.querySelector('#project-select').value=project.id;document.querySelector('#brand-select').value=project.brandId||'';}
  document.querySelector('#task-mode').value=mode;syncTaskModeFields();updateQuickTaskHeading();taskDialog.showModal();
}
document.querySelectorAll('[data-quick-mode]').forEach(b=>b.onclick=()=>{document.querySelector('#task-mode').value=b.dataset.quickMode;syncTaskModeFields();});
document.querySelector('#target-templates').addEventListener('change',updateQuickScope);
document.querySelector('#quick-check-folder').onclick=()=>checkQuickFolder().catch(()=>{});
document.querySelector('#quick-folder').addEventListener('input',()=>{quickFolderInspection++;document.querySelector('#quick-source-result').textContent='';});
bindFolderPickers(document.querySelector('#task-form'),{onChange:()=>{void checkQuickFolder().catch(()=>{});}});

document.querySelectorAll(".nav-item[data-view]").forEach((button) => button.addEventListener("click", () => goDashboardView(button.dataset.view)));
document.querySelectorAll('.nav-sub-item').forEach(button=>button.addEventListener('click',()=>goDashboardView(button.dataset.view)));
document.querySelector('.home-create-nav')?.addEventListener('click',()=>goDashboardView('business-all'));
document.querySelectorAll('[data-home-business]').forEach(button=>button.addEventListener('click',()=>goDashboardView(button.dataset.homeBusiness)));
document.querySelectorAll('.nav-channel-item').forEach(button=>button.addEventListener('click',()=>goDashboardView('channel-resources',button.dataset.channel)));
const channelNavToggle=document.querySelector('#channel-nav-toggle');
const channelNavList=document.querySelector('#channel-nav-list');
const setChannelNavCollapsed=collapsed=>{channelNavList.hidden=collapsed;channelNavToggle.textContent=collapsed?'›':'⌄';channelNavToggle.setAttribute('aria-expanded',String(!collapsed));channelNavToggle.setAttribute('aria-label',collapsed?'展开渠道列表':'收起渠道列表')};
setChannelNavCollapsed(localStorage.getItem('channel-nav-collapsed')==='true');
channelNavToggle.addEventListener('click',()=>{const collapsed=!channelNavList.hidden;setChannelNavCollapsed(collapsed);localStorage.setItem('channel-nav-collapsed',String(collapsed))});
document.addEventListener("keydown", handleAnnotationShortcut);
document.querySelector("#new-task")?.addEventListener("click", () => openNewTask());
document.querySelector("#task-mode").addEventListener("change", syncTaskModeFields);
document.querySelector("#task-business-line").addEventListener("change", syncTaskSegments);
document.querySelector("#task-segment-toggle").addEventListener("click", () => {
  const menu = document.querySelector("#task-segment-menu");
  menu.hidden = !menu.hidden;
  document.querySelector("#task-segment-toggle").setAttribute("aria-expanded", String(!menu.hidden));
});
document.addEventListener("click", (event) => {
  const picker = document.querySelector("#task-segment");
  if (!picker || picker.contains(event.target)) return;
  document.querySelector("#task-segment-menu").hidden = true;
  document.querySelector("#task-segment-toggle").setAttribute("aria-expanded", "false");
});
document.querySelector("#project-select").addEventListener("change", (event) => {
  const project = state.data.projects.find((item) => item.id === event.target.value);
  document.querySelector("#brand-select").value = project?.brandId || "";
  updateQuickTaskHeading();
});
document.querySelectorAll(".close-dialog").forEach((button) => button.addEventListener("click", () => taskDialog.close()));
document.querySelectorAll(".close-brand").forEach((button) => button.addEventListener("click", () => brandDialog.close()));
document.querySelectorAll(".close-spec").forEach((button) => button.addEventListener("click", () => specDialog.close()));
document.querySelectorAll(".close-reference").forEach((button) => button.addEventListener("click", () => referenceDialog.close()));
document.querySelectorAll(".close-project").forEach((button) => button.addEventListener("click", () => projectDialog.close()));
document.querySelectorAll(".close-rule").forEach((button) => button.addEventListener("click", () => ruleDialog.close()));

function wireImagePreview(inputSelector, previewSelector) {
  document.querySelector(inputSelector).addEventListener("change", (event) => {
    const preview = document.querySelector(previewSelector);
    preview.innerHTML = [...event.target.files].map((file) => `<figure><img src="${URL.createObjectURL(file)}" alt="${esc(file.name)}" /><figcaption>${esc(file.name)}</figcaption></figure>`).join("");
  });
}
wireImagePreview('#spec-form input[name="files"]', "#spec-upload-preview");
wireImagePreview('#reference-form input[name="files"]', "#reference-upload-preview");

document.querySelector("#spec-form").addEventListener("submit", async (event) => {
  event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); const files = [];
  for (const file of data.getAll("files")) if (file.size) files.push({name:file.name,dataUrl:await fileToDataUrl(file)});
  try { await api(`/api/templates/${data.get("templateId")}/specifications`, {method:"POST",body:JSON.stringify({name:data.get("name"),notes:data.get("notes"),files})}); specDialog.close(); await refresh(); toast(`已保存 ${files.length} 张规范图`); } catch(error) { toast(error.message); }
});

document.querySelector("#reference-form").addEventListener("submit", async (event) => {
  event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); const files = [];
  for (const file of data.getAll("files")) if (file.size) files.push({name:file.name,dataUrl:await fileToDataUrl(file)});
  try { await api("/api/references", {method:"POST",body:JSON.stringify({categoryId:data.get("categoryId"),name:data.get("name"),description:data.get("description"),tags:String(data.get("tags")||"").split(/[,，]/).map((item)=>item.trim()).filter(Boolean),layoutReusable:data.get("layoutReusable")==="on",files})}); referenceDialog.close(); await refresh(); toast(`已保存 ${files.length} 张优秀案例图片`); } catch(error) { toast(error.message); }
});

document.querySelector("#project-form").addEventListener("submit", async (event) => {
  event.preventDefault(); const formElement = event.currentTarget; const data = new FormData(formElement);
  const payload = Object.fromEntries(data.entries()); payload.businessLineIds = data.getAll("businessLineIds"); payload.isIpProject = data.get("isIpProject") === "on";
  const projectId = data.get("projectId"); const url = projectId ? `/api/projects/${projectId}` : "/api/projects"; const method = projectId ? "PATCH" : "POST";
  try { await api(url, { method, body: JSON.stringify(payload) }); projectDialog.close(); await refresh(); toast(projectId ? "项目修改已保存" : "项目已创建"); } catch (error) { toast(error.message); }
});

document.querySelector("#rule-form").addEventListener("submit", async (event) => {
  event.preventDefault(); const data = new FormData(event.currentTarget); const templateId = data.get("templateId");
  const elements = Object.fromEntries(["title", "logo", "ipCopyright", "secondaryCopy", "button"].map((key) => [key, data.get(key)]));
  const verified = data.get("ruleVerified") === "on";
  const layoutRevision = Number(event.currentTarget.dataset.layoutRevision || 0);
  const deliveryRule = state.data.resourceRules?.find((item) => item.templateId === templateId);
  try {
    await api(`/api/resource-profiles/${templateId}`, { method: "PUT", body: JSON.stringify({ elements, status: data.get("status"), notes: data.get("notes") }) });
    if (deliveryRule) {
      const verifiedRules = String(data.get("ruleVerifiedRules") || "").split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
      await api(`/api/resource-rules/${templateId}`, { method: "PUT", body: JSON.stringify({
        status: verified ? "verified" : deliveryRule.status,
        deliveryAllowed: verified,
        layoutRevision,
        verifiedVisualRules: verifiedRules,
        missing: verified ? [] : undefined,
        note: String(data.get("ruleNote") || ""),
        by: "设计师",
      }) });
    }
    ruleDialog.close(); await refresh(); toast("资源位规则已保存");
  } catch (error) { toast(error.message); }
});

document.querySelector('#task-form').addEventListener('submit',async event=>{
  event.preventDefault();if(quickBusy||quickProjectBusy)return;if(quickAssetLoading){document.querySelector('#quick-task-error').textContent='素材正在读取，请稍候再创建。';return;}
  const formElement=event.currentTarget,form=new FormData(formElement),payload=Object.fromEntries(form.entries());
  payload.segmentIds=form.getAll('segmentIds');payload.segmentId=payload.segmentIds[0]||'';payload.targetTemplateIds=form.getAll('targetTemplateIds');payload.submit=event.submitter?.name==='submit';
  if(quickProjectLibraryUse)payload.projectLibraryUse={assetId:quickProjectLibraryUse.assetId,projectId:quickProjectLibraryUse.projectId,mode:quickProjectLibraryUse.mode};
  const errorBox=document.querySelector('#quick-task-error');errorBox.textContent='';
  if(!payload.targetTemplateIds.length){document.querySelector('#quick-scope').open=true;errorBox.textContent='请至少选择一个目标资源位。';return;}
  const folderPath=String(payload.folderPath||'').trim();delete payload.folderPath;
   const buttons=[...formElement.querySelectorAll('button')],submitButton=event.submitter,submitLabel=submitButton?.textContent;
   quickBusy=true;buttons.forEach(b=>b.disabled=true);if(submitButton)submitButton.textContent=folderPath?'正在检查素材…':'正在创建任务…';
  try{
    if(folderPath)await checkQuickFolder();
     if(submitButton)submitButton.textContent='正在创建任务…';
    const task=quickCreatedTask||await api('/api/tasks',{method:'POST',body:JSON.stringify(payload)});quickCreatedTask=task;
     if(folderPath&&quickImportedFolder!==folderPath){if(submitButton)submitButton.textContent='正在导入素材…';await api(`/api/tasks/${task.id}/assets/import-folder`,{method:'POST',body:JSON.stringify({folderPath})});quickImportedFolder=folderPath;}
    for(const asset of quickPastedAssets.filter(a=>!a.uploaded)){
      if(submitButton)submitButton.textContent='正在导入源文件…';
      const current=await api(`/api/tasks/${task.id}`);
      if(asset.ticket)await api(`/api/tasks/${task.id}/assets/source-clipboard`,{method:'POST',headers:{'Content-Type':'application/json','X-Workbench-Clipboard':'1'},body:JSON.stringify({ticket:asset.ticket,expectedUpdatedAt:current.updatedAt})});
      else if(asset.role&&!/\.ps[db]$/i.test(asset.file.name))await api(`/api/tasks/${task.id}/assets`,{method:'POST',body:JSON.stringify({files:[{name:asset.file.name,dataUrl:await fileToDataUrl(asset.file)}],role:asset.role})});
      else await api(`/api/tasks/${task.id}/assets/source-upload?name=${encodeURIComponent(asset.file.name)}&expectedUpdatedAt=${encodeURIComponent(current.updatedAt)}`,{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:asset.file});
      asset.uploaded=true;
    }
    clearQuickPastedAssets();
    try{localStorage.setItem('task-recent-project',payload.projectId||'');}catch{}
    taskDialog.close();await refresh();const opened=await openTask(task.id);
    if(opened)toast(payload.submit?'任务已创建，可在编辑器继续制作':'草稿已保存');quickCreatedTask=null;
  }catch(e){errorBox.textContent=quickCreatedTask?`任务已保存，素材导入未完成：${e.message}。可重试导入，不会重复建任务。`:e.message;}
   finally{quickBusy=false;buttons.forEach(b=>b.disabled=false);if(submitButton)submitButton.textContent=submitLabel;renderQuickPastedAssets();}
});

document.querySelector("#brand-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const formElement = event.currentTarget;
  const form = Object.fromEntries(new FormData(formElement).entries());
  form.colors = form.colors.split(",").map((item) => item.trim()).filter(Boolean);
  form.fonts = form.fonts.split(",").map((item) => item.trim()).filter(Boolean);
  try { await api("/api/brands", { method: "POST", body: JSON.stringify(form) }); brandDialog.close(); formElement.reset(); await refresh(); toast("品牌包已保存"); } catch (error) { toast(error.message); }
});

const sidebarToggle = document.querySelector("#sidebar-toggle");
const sidebarCollapsed = localStorage.getItem("sidebar-collapsed") === "true";
document.body.classList.toggle("sidebar-collapsed", sidebarCollapsed);
if (sidebarToggle) {
  sidebarToggle.textContent = sidebarCollapsed ? "›" : "‹";
  sidebarToggle.setAttribute("aria-label", sidebarCollapsed ? "展开侧栏" : "收起侧栏");
  sidebarToggle.addEventListener("click", () => {
    const collapsed = document.body.classList.toggle("sidebar-collapsed");
    localStorage.setItem("sidebar-collapsed", String(collapsed));
    sidebarToggle.textContent = collapsed ? "›" : "‹";
    sidebarToggle.setAttribute("aria-label", collapsed ? "展开侧栏" : "收起侧栏");
    sidebarToggle.title = collapsed ? "展开侧栏" : "收起侧栏";
  });
}

document.querySelector("#topbar-notification")?.addEventListener("click", () => toast("暂无新消息"));
const topbarUserButton = document.querySelector("#topbar-user-button");
const topbarUserMenu = document.querySelector("#topbar-user-menu");
topbarUserButton?.addEventListener("click", () => {
  topbarUserMenu.hidden = !topbarUserMenu.hidden;
  topbarUserButton.setAttribute("aria-expanded", String(!topbarUserMenu.hidden));
});

const navIcons={home:'<path d="m3 10 9-7 9 7v11H3z"/><path d="M9 21v-8h6v8"/>',projects:'<path d="M3 6h7l2 3h9v12H3z"/>','business-platform':'<rect x="3" y="3" width="18" height="14" rx="2"/><path d="M8 21h8m-4-4v4"/>','business-channel':'<rect x="9" y="2" width="6" height="6" rx="1"/><rect x="2" y="16" width="6" height="6" rx="1"/><rect x="16" y="16" width="6" height="6" rx="1"/><path d="M12 8v4H5v4m7-4h7v4"/>','business-ads':'<path d="M3 9h5l12-5v16L8 15H3zm5 6 2 6H6l-2-6"/>',tasks:'<path d="M8 5h13M8 12h13M8 19h13M3 5h1M3 12h1M3 19h1"/>',assets:'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="m3 17 5-5 4 4 4-7 5 8"/><circle cx="8" cy="8" r="1"/>',specs:'<path d="M5 3h14v18H5zM8 7h8M8 12h8M8 17h5"/>'};
const homeNavIcons={
  home:'<path d="m12 2 10 8v11a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V10zm0 7-1.1 2.9L8 13l2.9 1.1L12 17l1.1-2.9L16 13l-2.9-1.1z" fill-rule="evenodd"/>',
  projects:'<path d="M9 3h6a2 2 0 0 1 2 2v2h3a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3H4a3 3 0 0 1-3-3v-9a3 3 0 0 1 3-3h3V5a2 2 0 0 1 2-2m0 4h6V5H9zm2 4v2H9v2h2v2h2v-2h2v-2h-2v-2z" fill-rule="evenodd"/>',
  create:'<path d="M5 2h8v3H5v14h14v-8h3v8a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V5a3 3 0 0 1 3-3"/><path d="m10 14 1-4 7.9-7.9a2.1 2.1 0 0 1 3 3L14 13z"/>',
  tasks:'<path d="M9 2h6l1 2h3a3 3 0 0 1 3 3v13a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3h3zm0 6h6V6H9zm-3 5 1.5 1.5L10 12l1 1-3.5 3.5L5 14zm6 0h7v2h-7zm0 5h7v2h-7z" fill-rule="evenodd"/>',
  assets:'<path d="M4 2h16a2 2 0 0 1 2 2v5H2V4a2 2 0 0 1 2-2m-2 9h20v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2zm10 2-4 4h3v3h2v-3h3z" fill-rule="evenodd"/>',
  specs:'<path d="M5 1h14a2 2 0 0 1 2 2v19a1 1 0 0 1-1.5.9L12 19l-7.5 3.9A1 1 0 0 1 3 22V3a2 2 0 0 1 2-2m2 4v2h10V5zm5 5-1 2.2-2.4.3 1.8 1.7-.4 2.4 2-1.1 2 1.1-.4-2.4 1.8-1.7-2.4-.3z" fill-rule="evenodd"/>'
};
document.querySelectorAll('.nav-item').forEach(b=>{const span=b.querySelector('span'),key=b.classList.contains('home-create-nav')?'create':b.dataset.view,path=navIcons[key],homePath=homeNavIcons[key];if(span&&homePath)span.innerHTML=`${path?`<svg class="nav-default-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`:''}<svg class="nav-home-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${homePath}</svg>`;else if(span&&path)span.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;});
await refresh();
const startupUrl=new URL(location.href),linkedTaskId=startupUrl.searchParams.get("task"),linkedJobId=startupUrl.searchParams.get('job')||'';
if (linkedTaskId && state.data.tasks.some((task) => task.id === linkedTaskId)) await openTask(linkedTaskId);
else if (startupUrl.searchParams.get('view') === 'channel-resources') goDashboardView('channel-resources',startupUrl.searchParams.get('channel')||'huawei',linkedJobId);
else if (startupUrl.searchParams.get('view') === 'ad-resources') goDashboardView('ad-resources','',linkedJobId,startupUrl.searchParams.get('spec')||'');
else if (taskWorkbenchRoutes[startupUrl.searchParams.get('view')]||phaseWorkbenchViews.includes(startupUrl.searchParams.get('view'))||['store-preorder','store-launch','icon-preorder','icon-launch'].includes(startupUrl.searchParams.get('view'))) goDashboardView(startupUrl.searchParams.get('view'),startupUrl.searchParams.get('phase')||'',linkedJobId);

























