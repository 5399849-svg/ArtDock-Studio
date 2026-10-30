import {taskStatusBucket as bucket,statusLabels as labels,groupChannelBatchTasks,groupAdBatchTasks} from './workbench-model.js?v=20261022-bulk-create';
import {dashboardTaskKey,downloadHomeTasks} from './home-task-downloads.js?v=20261023-bulk-download';
import {homeTaskMenu} from './home-task-menu.js?v=20261028-task-menu';
export {groupChannelBatchTasks,groupAdBatchTasks};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icons={platform:'<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8m-4-4v4"/>',channel:'<rect x="9" y="2" width="6" height="6" rx="1"/><rect x="2" y="16" width="6" height="6" rx="1"/><rect x="16" y="16" width="6" height="6" rx="1"/><path d="M12 8v4H5v4m7-4h7v4"/>',ads:'<path d="M3 10v6h5l12 5V5L8 10H3zm5 6 2 6H6l-2-6m4-6v6"/>'};
const icon=key=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[key]}</svg>`;
export const businesses=[{id:'platform',line:'platform-community',name:'平台业务',description:'平台展示资源与多尺寸制作',tag:'平台资源位'},{id:'channel',line:'channel-distribution',name:'渠道发行业务',description:'统一管理渠道素材与专属资源'},{id:'ads',line:'performance-marketing',name:'投放业务',description:'广告素材适配与批量输出',tag:'投放素材'}];
export const selectDashboardRows=(tasks,filter='all')=>tasks.filter(task=>filter==='all'||bucket(task)===filter);
const relativeDate=value=>{if(!value)return '刚刚';const days=Math.max(0,Math.floor((Date.now()-new Date(value).getTime())/86400000));return days===0?'今天':`${days} 天前`};
const homeShortcutIcons={
 platform:'<rect x="9" y="17" width="30" height="22" rx="4"/><path d="M18 17v-5h12v5M9 27h30M22 27h4"/>',
 community:'<rect x="11" y="11" width="26" height="28" rx="4"/><path d="M16 8h16M24 18l2.2 4.8 5.2.6-3.8 3.5 1 5.1-4.6-2.5-4.6 2.5 1-5.1-3.8-3.5 5.2-.6z"/>',
 channel:'<path d="M15 17h18c5 0 7 3 9 11l1 5c.5 4-2 6-5 4l-7-5H17l-7 5c-3 2-5 0-5-4l1-5c2-8 4-11 9-11z"/><path d="M15 23v9m-4.5-4.5h9"/><circle cx="31" cy="24" r="1.5" fill="currentColor" stroke="none"/><circle cx="36" cy="29" r="1.5" fill="currentColor" stroke="none"/>',
 store:'<rect x="8" y="12" width="32" height="25" rx="4"/><path d="M8 21h32M8 29h32"/><circle cx="20" cy="21" r="3"/><circle cx="30" cy="29" r="3"/>',
 icon:'<rect x="11" y="10" width="26" height="28" rx="6"/><rect x="17" y="16" width="14" height="16" rx="5"/><path d="M24 27v-7m-4 4 4-4 4 4"/>',
 ads:'<rect x="9" y="12" width="30" height="27" rx="5"/><path d="m21 19 10 6-10 6zM17 7l-3 4m17-4 3 4"/>',
 mumu:'<rect x="9" y="15" width="30" height="24" rx="6"/><path d="M24 15V8m-8 3 4 4m12-4-4 4"/><circle cx="18" cy="26" r="2"/><circle cx="30" cy="26" r="2"/>',
 leidian:'<path d="M14 33a9 9 0 0 1-2-18 12 12 0 0 1 23 4 7 7 0 0 1-1 14H14z"/><path d="m27 23-7 9h5l-3 8 10-12h-5z"/>',
 custom:'<rect x="9" y="9" width="30" height="30" rx="4"/><path d="M9 18h6m-6 8h4m5-17v6m8-6v4M22 32l10-10m-6 0h6v6"/>',
 more:'<rect x="10" y="10" width="11" height="11" rx="3" fill="currentColor" stroke="none"/><rect x="27" y="10" width="11" height="11" rx="3" fill="currentColor" stroke="none"/><rect x="10" y="27" width="11" height="11" rx="3" fill="currentColor" stroke="none"/><rect x="27" y="27" width="11" height="11" rx="3" fill="currentColor" stroke="none"/>',
};
const workspaceServiceIcons={
 resource:'<path d="M14 12V8h20v4" fill="none" stroke="currentColor" stroke-width="4"/><rect x="5" y="12" width="38" height="30" rx="6" fill="currentColor" stroke="none"/><path d="M5 25h38" fill="none" stroke="#fff" stroke-width="3"/><circle cx="24" cy="25" r="6" fill="#fff" stroke="none"/><circle cx="24" cy="25" r="2" fill="currentColor" stroke="none"/>',
 asset:'<path d="M13 7h22" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><rect x="7" y="13" width="34" height="29" rx="5" fill="currentColor" stroke="none"/><path d="m24 18 2.4 5 5.5.8-4 3.9.9 5.5L24 30.6l-4.8 2.6.9-5.5-4-3.9 5.5-.8z" fill="#fff" stroke="none"/>'
};
const homeShortcuts=[
 ['platform','平台资源位','platform-workbench',''],['community','社区外媒','community-workbench',''],
 ['channel','渠道资源位','channel-resources','huawei'],['store','商店图改尺寸','store-workbench',''],
 ['icon','ICON改尺寸','icon-workbench',''],['ads','投放资源位','ad-resources',''],
 ['mumu','MuMu模拟器','ads-mumu',''],['leidian','雷电模拟器','ads-leidian',''],['custom','自定义尺寸','custom-canvas',''],['more','更多','',''],
];
export function mountDashboard(content,{data,form,thumb,coreCard,bindLegacy,navigate,openModule,loadTasks,openIndexedTask,isActive,deleteHomeTask,renameHomeTask,copyHomeTask}){
 content.innerHTML=`<div class="dashboard home-reference"><section class="home-command"><h2>今天你想处理什么任务?</h2><div class="home-hero-search-slot"></div><div class="home-shortcuts">${homeShortcuts.map(([key,label,view,anchor])=>`<button class="home-shortcut" type="button" data-home-shortcut="${key}" data-shortcut-view="${view}" data-shortcut-anchor="${anchor}"><span class="home-shortcut-icon"><svg viewBox="0 0 48 48" aria-hidden="true">${homeShortcutIcons[key]}</svg></span><span>${label}</span></button>`).join('')}</div><div class="home-more-panel" hidden><button type="button" data-home-more-view="tasks">全部任务</button><button type="button" data-home-more-view="assets">资产库</button><button type="button" data-home-more-view="specs">规范中心</button></div></section><section class="dash-recent"><div class="dash-recent-head"><h3>最近任务</h3><div class="dash-tabs">${['all','draft','running','review','done','issue'].map(k=>`<button data-dash-filter="${k}" class="${k==='all'?'active':''}">${k==='all'?'全部':labels[k]}</button>`).join('')}</div><button class="button ghost" data-go-view="tasks">查看全部任务</button><div class="dash-view-switch"><button data-dash-layout="list" aria-label="列表视图"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5h13M8 12h13M8 19h13M3 5h2M3 12h2M3 19h2"/></svg></button><button data-dash-layout="grid" aria-label="卡片视图" class="active"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="2" width="20" height="20" rx="1"/><path d="M2 9h20M2 16h20M9 2v20M16 2v20"/></svg></button></div></div><p class="dash-load-note" role="status">正在汇总任务…</p><div class="dash-task-list"></div></section></div>`;
 let filter='all',layout='grid',indexed=null,visibleRows=10,lastColumns=1,visibleTasks=[];
 const selected=new Set(),favoriteKey='home-task-favorites-v1';
 let favorites=new Set();try{favorites=new Set(JSON.parse(localStorage.getItem(favoriteKey)||'[]'))}catch{}
 const root=content.querySelector('.dashboard');
 const more=document.createElement('div');more.className='dash-load-more';more.hidden=true;more.innerHTML='<button type="button">加载更多</button>';root.querySelector('.dash-task-list').after(more);
 const bulk=document.createElement('div');bulk.className='dash-bulk-download';
 bulk.innerHTML='<label><input type="checkbox" data-dash-select-all aria-label="选择当前展示的全部任务">全选当前列表</label><span data-dash-selected-count>已选 0 个任务</span><div><button type="button" class="button ghost" data-dash-clear-selection hidden>取消选择</button><button type="button" class="button primary" data-dash-download-selected disabled>批量下载</button></div>';
 const downloadNote=document.createElement('p');downloadNote.className='dash-download-note';downloadNote.setAttribute('role','status');downloadNote.setAttribute('aria-live','polite');
 root.querySelector('.dash-task-list').before(bulk,downloadNote);
 let downloading=false;
 const tasks=()=>indexed||(data.tasks||[]).map(task=>({...task,cover:thumb(task)}));
 const updateSelection=()=>{
   const all=tasks(),valid=new Set(all.map(dashboardTaskKey));for(const key of selected)if(!valid.has(key))selected.delete(key);
   const visible=visibleTasks,visibleCount=visible.filter(task=>selected.has(dashboardTaskKey(task))).length;
   const toggle=bulk.querySelector('[data-dash-select-all]');toggle.checked=visible.length>0&&visibleCount===visible.length;toggle.indeterminate=visibleCount>0&&visibleCount<visible.length;toggle.disabled=downloading||!visible.length;
   bulk.querySelector('[data-dash-selected-count]').textContent=`已选 ${selected.size} 个任务`;
   const clear=bulk.querySelector('[data-dash-clear-selection]');clear.hidden=!selected.size;clear.disabled=downloading;
   const download=bulk.querySelector('[data-dash-download-selected]');download.disabled=downloading||!selected.size;download.textContent=downloading?'正在打包…':'批量下载';
   root.classList.toggle('has-task-selection',selected.size>0);
   root.querySelectorAll('[data-dash-select]').forEach(input=>{input.checked=selected.has(input.dataset.dashSelect);input.disabled=downloading;input.closest('article,tr')?.classList.toggle('is-selected',input.checked);});
 };
 bulk.querySelector('[data-dash-select-all]').onchange=event=>{if(downloading)return;for(const task of visibleTasks){const key=dashboardTaskKey(task);event.target.checked?selected.add(key):selected.delete(key);}updateSelection();};
 bulk.querySelector('[data-dash-clear-selection]').onclick=()=>{if(!downloading){selected.clear();updateSelection();}};
 bulk.querySelector('[data-dash-download-selected]').onclick=async()=>{
   if(downloading||!selected.size)return;downloading=true;updateSelection();
   try{
     const result=await downloadHomeTasks(tasks().filter(task=>selected.has(dashboardTaskKey(task))),{onProgress:message=>{downloadNote.textContent=message;}});
     if(root.isConnected&&isActive()){
       downloadNote.textContent=`已开始下载 ${result.downloaded} 个任务${result.skipped?`；${result.skipped} 个未下载，原因见压缩包内“未下载任务.txt”`:''}`;downloadNote.classList.remove('is-error');if(!result.skipped)selected.clear();
       await refreshTasks().catch(()=>{if(root.isConnected&&isActive())downloadNote.textContent+='；任务状态暂未刷新，请刷新页面查看。';});
     }
   }catch(error){if(root.isConnected&&isActive()){downloadNote.textContent=error.message;downloadNote.classList.add('is-error');}}
   finally{downloading=false;if(root.isConnected&&isActive())updateSelection();}
 };
 const isModule=task=>Boolean(task.module&&task.module!=='core');
 const renderRows=()=>{
   const all=tasks(),filtered=selectDashboardRows(all,filter);
   root.querySelectorAll('[data-dash-filter]').forEach(b=>{const k=b.dataset.dashFilter,count=selectDashboardRows(all,k).length;b.classList.toggle('active',k===filter);b.textContent=`${k==='all'?'全部':labels[k]} ${count}`;b.hidden=k==='issue'&&!count;});
  const attrs=t=>isModule(t)?`data-module="${t.module}" data-job-id="${esc(t.id)}" data-task-key="${esc(t.key||`${t.module}:${t.id}`)}"`:`data-task="${esc(t.id)}"`;
  const type=t=>t.module==='ad-resources'?'投放业务 / 投放资源位':isModule(t)?`渠道发行业务 / ${t.module==='channel-resources'?'渠道资源位':t.module.startsWith('store')?'商店图':'ICON'}`:(businesses.find(b=>b.line===t.businessLineId)?.name||'素材制作');
  const stage=t=>isModule(t)?(t.module==='channel-resources'?`${t.channelName||''} · ${t.itemCount} 张交付稿`:t.module==='ad-resources'?`${t.itemCount} 张交付稿`:t.module.endsWith('launch')?'测试和首发期':'预约期'):'';
  const sub=t=>t.phase||((t.status==='running')?`${t.progress||0} / ${t.total||0}`:t.error||'');
   const list=root.querySelector('.dash-task-list');
   if(layout==='grid'&&!list.querySelector('.dash-cards'))list.innerHTML='<div class="dash-cards"></div>';
   lastColumns=layout==='grid'?Math.max(1,getComputedStyle(list.querySelector('.dash-cards')).gridTemplateColumns.split(/\s+/).length):1;
   const rows=filtered.slice(0,visibleRows*lastColumns);visibleTasks=rows;more.hidden=rows.length>=filtered.length;
  const moduleCard=(t,i)=>`<article class="home-work-card home-recent-task-card dash-job-card" data-home-search-card>
    <div class="home-task-card-tools"><label title="选择任务"><input type="checkbox" data-dash-select="${esc(dashboardTaskKey(t))}" aria-label="选择${esc(t.project)}"></label><span class="home-task-tool-actions"><button type="button" class="home-task-favorite" data-dash-favorite="${esc(t.module)}:${esc(t.id)}" title="收藏任务" aria-label="收藏任务" aria-pressed="false">☆</button><button type="button" class="home-task-more" data-dash-menu="${i}" title="更多操作" aria-label="更多操作">•••</button></span></div>
    <button class="home-task-open" ${attrs(t)}><span class="home-card-cover">${t.cover?`<img src="${esc(t.cover)}" alt="">`:'<span class="home-cover-fallback">素材任务</span>'}</span><span class="home-task-card-meta"><strong>${esc(t.project)}</strong><small>更新于 ${relativeDate(t.updatedAt||t.createdAt)}</small></span><small class="dash-card-context">${type(t)} · ${stage(t)}</small><span class="dash-status ${bucket(t)}">${labels[bucket(t)]}</span></button>
    ${homeTaskMenu({index:i})}
  </article>`;
  root.querySelector('.dash-task-list').innerHTML=!rows.length?'<div class="dash-empty">暂无符合条件的任务</div>':layout==='grid'?`<div class="dash-cards">${rows.map((t,i)=>isModule(t)?moduleCard(t,i):coreCard(t,i)).join('')}</div>`:`<div class="dash-table-wrap"><table class="dash-table"><thead><tr><th>任务名称</th><th>业务 / 类型</th><th>当前状态</th><th>更新时间</th><th>操作</th></tr></thead><tbody>${rows.map(t=>`<tr><td><button class="dash-task-name" ${attrs(t)}>${t.cover?`<img src="${esc(t.cover)}" alt="">`:'<span class="dash-task-placeholder">▧</span>'}<strong>${esc(t.project)}</strong></button></td><td>${type(t)}<small>${stage(t)}</small></td><td><span class="dash-status ${bucket(t)}">${labels[bucket(t)]}</span><small title="${esc(sub(t))}">${esc(sub(t))}</small></td><td>${t.updatedAt||t.createdAt?esc(new Date(t.updatedAt||t.createdAt).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})):'—'}</td><td><button class="dash-link" ${attrs(t)}>${bucket(t)==='running'?'查看进度':bucket(t)==='issue'?'处理问题':'查看任务'}</button></td></tr>`).join('')}</tbody></table></div>`;
  bindLegacy();root.querySelectorAll('[data-module]').forEach(button=>button.onclick=()=>{const task=all.find(row=>row.key===button.dataset.taskKey)||(all.find(row=>row.module===button.dataset.module&&String(row.id)===button.dataset.jobId));if(task&&openIndexedTask)return openIndexedTask(task);openModule(button.dataset.module,button.dataset.jobId,task?.channelId);});
  const containers=layout==='grid'?root.querySelectorAll('.dash-cards > article'):root.querySelectorAll('.dash-table tbody tr');
  containers.forEach((container,index)=>{
   const task=rows[index];
   if(layout==='grid')return; // 卡片模式统一在“更多操作”中删除。
   const selection=document.createElement('input');selection.type='checkbox';selection.dataset.dashSelect=dashboardTaskKey(task);selection.setAttribute('aria-label',`选择${task.project}`);selection.className='dash-row-select';container.querySelector('td').prepend(selection);
   const button=document.createElement('button');
   button.type='button';button.className='dash-delete';button.textContent='删除';
   button.setAttribute('aria-label',`删除任务“${task.project}”`);
   button.onclick=async event=>{event.stopPropagation();button.disabled=true;try{await deleteHomeTask(task)}finally{if(button.isConnected)button.disabled=false}};
   container.querySelector('td:last-child').append(button);
  });

  root.querySelectorAll('[data-dash-select]').forEach(input=>{
   input.checked=selected.has(input.dataset.dashSelect);
   input.closest('article')?.classList.toggle('is-selected',input.checked);
   input.onchange=()=>{const key=input.dataset.dashSelect;input.checked?selected.add(key):selected.delete(key);updateSelection();};
  });
  root.querySelectorAll('[data-dash-favorite]').forEach(button=>{
   const key=button.dataset.dashFavorite,active=favorites.has(key);
   button.textContent=active?'★':'☆';button.setAttribute('aria-pressed',String(active));button.setAttribute('aria-label',active?'取消收藏任务':'收藏任务');
   button.onclick=event=>{event.stopPropagation();favorites.has(key)?favorites.delete(key):favorites.add(key);try{localStorage.setItem(favoriteKey,JSON.stringify([...favorites]))}catch{};const on=favorites.has(key);button.textContent=on?'★':'☆';button.setAttribute('aria-pressed',String(on));button.setAttribute('aria-label',on?'取消收藏任务':'收藏任务')};
  });
  root.querySelectorAll('[data-dash-menu]').forEach(button=>button.onclick=event=>{
   event.stopPropagation();const menu=root.querySelector(`[data-dash-menu-panel="${button.dataset.dashMenu}"]`);
   root.querySelectorAll('.home-task-menu').forEach(other=>{if(other!==menu)other.hidden=true});
   if(menu)menu.hidden=!menu.hidden;
  });
  root.querySelectorAll('[data-dash-action]').forEach(button=>button.onclick=async event=>{
   event.stopPropagation();button.closest('.home-task-menu').hidden=true;
   const task=rows[Number(button.dataset.dashIndex)];if(!task)return;
   try{
    if(button.dataset.dashAction==='rename')return await renameHomeTask(task);
    if(button.dataset.dashAction==='copy')return await copyHomeTask(task);
    if(button.dataset.dashAction==='trash')return await deleteHomeTask(task);
    if(button.dataset.dashAction==='download'){
     await downloadHomeTasks([task],{onProgress:message=>{downloadNote.textContent=message;}});downloadNote.textContent='已开始下载';await refreshTasks();
    }
   }catch(error){window.alert(error.message)}
  });
  updateSelection();
 };
 more.querySelector('button').onclick=()=>{visibleRows+=10;renderRows();};
 root.querySelectorAll('[data-dash-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.dashFilter;visibleRows=10;renderRows();});
 root.querySelectorAll('[data-dash-layout]').forEach(b=>b.onclick=()=>{layout=b.dataset.dashLayout;visibleRows=10;root.querySelectorAll('[data-dash-layout]').forEach(x=>x.classList.toggle('active',x===b));renderRows();});
 const resize=new ResizeObserver(()=>{if(!root.isConnected||!isActive()){resize.disconnect();return;}const grid=root.querySelector('.dash-cards');if(layout==='grid'&&grid&&getComputedStyle(grid).gridTemplateColumns.split(/\s+/).length!==lastColumns)renderRows();});resize.observe(root.querySelector('.dash-task-list'));
 root.querySelectorAll('[data-channel-anchor]').forEach(b=>b.onclick=()=>b.dataset.channelAnchor==='resources'?navigate('channel-resources','huawei'):navigate('business-channel',b.dataset.channelAnchor));
 root.querySelectorAll('[data-home-shortcut]').forEach(button=>button.onclick=()=>{
  if(button.dataset.homeShortcut==='more'){const panel=root.querySelector('.home-more-panel');panel.hidden=!panel.hidden;return;}
  navigate(button.dataset.shortcutView,button.dataset.shortcutAnchor);
 });
 root.querySelectorAll('[data-home-more-view]').forEach(button=>button.onclick=()=>navigate(button.dataset.homeMoreView));
 renderRows();
 async function refreshTasks(){
  const index=await loadTasks?.();
  if(!isActive()||!root.isConnected||!index)return;
  indexed=index.tasks.map(task=>({...task,cover:task.module==='core'?thumb(task):task.cover}));
  root.querySelector('.dash-load-note').textContent=index.missing?.length?'部分任务暂未加载，可进入对应模块查看。':'';
  renderRows();
 }
 Promise.resolve().then(refreshTasks).catch(()=>{
  if(isActive()&&root.isConnected)root.querySelector('.dash-load-note').textContent='任务暂未完整加载，请刷新重试。';
 });
}
export function mountBusinessOverview(content,{navigate}){
 content.innerHTML=`<div class="workspace-page workspace-all"><header class="workspace-hero"><h2>所有业务</h2><div class="workspace-hero-search"></div></header><div class="workspace-business-grid">${businesses.map(b=>`<article class="workspace-business-card"><span class="workspace-card-icon">${icon(b.id)}</span><div><h3>${b.name}</h3><p>${b.description}</p><div class="workspace-tags">${(b.id==='platform'?['平台资源位','社区外媒']:b.id==='channel'?['商店图','ICON','渠道资源位']:['投放素材']).map(tag=>`<span>${tag}</span>`).join('')}</div>${b.id==='channel'?'<small>华为 · OPPO · vivo · 小米 · 荣耀</small>':''}<button type="button" data-business-entry="${b.id}">进入${b.name}<span>⟶</span></button></div></article>`).join('')}</div></div>`;
 content.querySelectorAll('[data-business-entry]').forEach(button=>button.onclick=()=>navigate(`business-${button.dataset.businessEntry}`));
}
export function mountCommunityCatalog(content,{templates,openSpec,create}){
 const placements=templates.filter(template=>template.communityPlacement);
 const groups=['全部','公众号','社区','微信小程序','支付宝','小红书'];
 let selected='全部';
 content.innerHTML=`<div class="workspace-page community-catalog"><header class="community-catalog-head"><div><p class="community-catalog-kicker">平台业务 / 社区外媒</p><h2>社区外媒资源位</h2><p>已录入 ${placements.length} 个资源位。先在工作台完成母稿，再按目标尺寸重新排列背景、人物、文案和装饰。</p></div><button type="button" class="community-catalog-create">＋ 新建制作任务</button></header><div class="community-catalog-note">游戏品牌 Logo 与 IP 版权是两项独立规则。需要版权标识的资源位，仅在 IP 项目中添加；默认文字为 ©YUEWEN，可按项目替换。</div><div class="community-catalog-filters">${groups.map(group=>`<button type="button" data-community-group="${group}" class="${group===selected?'active':''}">${group}<span>${group==='全部'?placements.length:placements.filter(item=>item.family===group).length}</span></button>`).join('')}</div><div class="community-catalog-table-wrap"><table class="community-catalog-table"><thead><tr><th>序号</th><th>平台与资源位</th><th>尺寸</th><th>格式与大小</th><th>游戏品牌 Logo</th><th>IP 版权标识</th><th>操作</th></tr></thead><tbody></tbody></table></div></div>`;
 const tbody=content.querySelector('.community-catalog-table tbody');
 const draw=()=>{
  content.querySelectorAll('[data-community-group]').forEach(button=>button.classList.toggle('active',button.dataset.communityGroup===selected));
  tbody.innerHTML=placements.map((item,index)=>({item,index})).filter(({item})=>selected==='全部'||item.family===selected).map(({item,index})=>`<tr><td>${String(index+1).padStart(2,'0')}</td><td><b>${esc(item.name)}</b></td><td><strong>${item.width}×${item.height}</strong></td><td>PNG · ≤${item.maxBytes/1048576}MB</td><td><span class="community-rule ${item.brandLogo?'required':'excluded'}">${item.brandLogo?'需要':'不添加'}</span></td><td><span class="community-rule ${item.ipCopyright?'conditional':'excluded'}">${item.ipCopyright?'IP 项目需要':'不添加'}</span></td><td><button type="button" data-community-spec="${item.id}">查看规则</button></td></tr>`).join('');
  tbody.querySelectorAll('[data-community-spec]').forEach(button=>button.onclick=()=>openSpec(placements.find(item=>item.id===button.dataset.communitySpec)));
 };
 content.querySelectorAll('[data-community-group]').forEach(button=>button.onclick=()=>{selected=button.dataset.communityGroup;draw()});
 content.querySelector('.community-catalog-create').onclick=create;
 draw();
}
export function mountBusinessHub(content,businessId,{data,navigate,create,browse,anchor,selectedSegment=''}){
 const b=businesses.find(item=>item.id===businessId),line=data.businessLines.find(item=>item.id===b.line);
 if(b.id==='platform'){
  const cards=[
   {key:'platform',name:'平台资源位',description:'包含37网游平台、手游中心、玩心部落、官网等21个资源位，可自行选择所需尺寸进行制作。'},
   {key:'community',name:'社区外媒',description:'包含社区、论坛、微信小程序、小红书等，可自行选择所需尺寸进行制作。'},
   {key:'longform',name:'长图',description:'暂未开发',disabled:true}
  ];
  content.innerHTML=`<div class="workspace-page workspace-hub workspace-platform"><h2>平台业务</h2><div class="workspace-platform-grid">${cards.map(card=>`<article class="workspace-service-card ${card.disabled?'is-disabled':''}" ${card.disabled?'':`data-service-card="${card.key}" tabindex="0"`}><span class="workspace-service-icon"><svg viewBox="0 0 48 48" aria-hidden="true">${card.key==='platform'?workspaceServiceIcons.resource:workspaceServiceIcons.asset}</svg></span><div><h3>${card.name}</h3><p>${card.description}</p><div class="workspace-service-actions"><button type="button" data-service-spec="${card.key}" ${card.disabled?'disabled':''}>查看规范</button><button type="button" data-service-create="${card.key}" ${card.disabled?'disabled':''}>新建任务</button></div></div></article>`).join('')}</div></div>`;
  const serviceSegment=key=>key==='community'?'community-media':'platform';
  content.querySelectorAll('[data-service-card]').forEach(card=>{const open=()=>navigate(card.dataset.serviceCard==='community'?'community-workbench':'platform-workbench');card.onclick=event=>{if(!event.target.closest('button'))open()};card.onkeydown=event=>{if(event.target===card&&(event.key==='Enter'||event.key===' ')){event.preventDefault();open()}}});
  content.querySelectorAll('[data-service-spec]').forEach(button=>button.onclick=()=>browse(b.line,serviceSegment(button.dataset.serviceSpec)));
  content.querySelectorAll('[data-service-create]').forEach(button=>button.onclick=()=>create(b.line,serviceSegment(button.dataset.serviceCreate)));
 }else if(b.id==='channel'){
  const channels=[['huawei','华为'],['oppo','OPPO'],['vivo','VIVO'],['xiaomi','小米'],['honor','荣耀'],['alipay','支付宝']];
  content.innerHTML=`<div class="workspace-page workspace-hub workspace-channel"><h2>渠道业务</h2><section class="workspace-channel-panel"><header><span class="workspace-channel-icon"><svg viewBox="0 0 48 48" aria-hidden="true">${workspaceServiceIcons.resource}</svg></span><div><h3>渠道资源位</h3><p>选择制作类型开始任务，规范可单独查看。</p></div><button type="button" data-channel-more>查看更多</button></header><div class="workspace-channel-grid">${channels.map(([id,name])=>{const count=data.templates.filter(t=>t.businessLineId===b.line&&t.segmentId===id).length;return `<article><h4>${name}</h4><p data-channel-count="${id}">${count}个资源位，${count?'可制作':'待配置'}</p><div><button type="button" data-channel-spec="${id}" ${id==='alipay'?'disabled title="该渠道尚未配置"':''}>查看规范</button><button type="button" data-channel-create="${id}" ${id==='alipay'?'disabled title="该渠道尚未配置"':''}>新建任务</button></div></article>`}).join('')}</div></section><div class="workspace-phase-grid">${[['store','商店图改尺寸','横竖版素材，六页成套制作'],['icon','ICON改尺寸','正方形源图，适配尺寸、圆角和角标']].map(([id,name,description])=>`<article class="workspace-phase-card" id="hub-${id}"><span class="workspace-phase-icon"><svg viewBox="0 0 48 48" aria-hidden="true">${workspaceServiceIcons.asset}</svg></span><div><h3>${name}</h3><p>${description}</p><div><button type="button" data-module-view="${id}-preorder">预约期</button><button type="button" data-module-view="${id}-launch">测试&首发期</button></div></div></article>`).join('')}</div></div>`;
  fetch('/api/channel-resources/rules').then(response=>response.ok?response.json():null).then(result=>{if(!result)return;const count=new Set((result.rules||[]).map(rule=>String(rule.资源位||'').trim()).filter(Boolean)).size;const label=content.querySelector('[data-channel-count="huawei"]');if(label&&count)label.textContent=`${count}个资源位，已配置`;}).catch(()=>{});
  content.querySelector('[data-channel-more]').onclick=()=>navigate('channel-resources','huawei');
  content.querySelectorAll('[data-channel-spec]').forEach(button=>button.onclick=()=>navigate('channel-resources',`rules:${button.dataset.channelSpec}`));
  content.querySelectorAll('[data-channel-create]').forEach(button=>button.onclick=()=>navigate('channel-resources',`create:${button.dataset.channelCreate}`));
  content.querySelectorAll('[data-module-view]').forEach(button=>button.onclick=()=>navigate(button.dataset.moduleView));
 }else if(selectedSegment){
  const segment=line?.segments.find(item=>item.id===selectedSegment),specs=data.templates.filter(template=>template.businessLineId===b.line&&template.segmentId===selectedSegment);
  content.innerHTML=`<div class="workspace-page workspace-hub workspace-ads"><h2>${esc(segment?.name||'投放业务')}</h2><div class="workspace-platform-grid"><article class="workspace-service-card"><span class="workspace-service-icon"><svg viewBox="0 0 48 48" aria-hidden="true">${homeShortcutIcons.ads}</svg></span><div><h3>${esc(segment?.name||'投放资源位')}</h3><p>${specs.length} 个资源位，可查看规范并创建制作任务。</p><div class="workspace-service-actions"><button type="button" data-ad-spec>查看规范</button><button type="button" data-ad-segment-create>新建任务</button></div></div></article></div></div>`;
  content.querySelector('[data-ad-spec]').onclick=()=>browse(b.line,selectedSegment);
  content.querySelector('[data-ad-segment-create]').onclick=()=>create(b.line,selectedSegment);
 }else{
  const cards=[['resources','投放资源位','广告素材适配与批量输出，支持成套下载。'],['mumu','MuMu模拟器','按模拟器资源位规范制作和检查。'],['leidian','雷电模拟器','按模拟器资源位规范制作和检查。']];
  content.innerHTML=`<div class="workspace-page workspace-hub workspace-ads"><h2>投放业务</h2><div class="workspace-platform-grid">${cards.map(([key,name,description])=>`<article class="workspace-service-card"><span class="workspace-service-icon"><svg viewBox="0 0 48 48" aria-hidden="true">${homeShortcutIcons[key==='resources'?'ads':key]}</svg></span><div><h3>${name}</h3><p>${description}</p><div class="workspace-service-actions"><button type="button" data-ad-open="${key}">查看任务</button><button type="button" data-ad-create="${key}">新建任务</button></div></div></article>`).join('')}</div></div>`;
  content.querySelectorAll('[data-ad-open]').forEach(button=>button.onclick=()=>navigate(button.dataset.adOpen==='resources'?'ad-resources':`ads-${button.dataset.adOpen}`));
  content.querySelectorAll('[data-ad-create]').forEach(button=>button.onclick=()=>button.dataset.adCreate==='resources'?navigate('ad-resources','create'):create(b.line,button.dataset.adCreate));
 }
 if(anchor)content.querySelector(`#hub-${anchor}`)?.scrollIntoView({block:'nearest'});
}
