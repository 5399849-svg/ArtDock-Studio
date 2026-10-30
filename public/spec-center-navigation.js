const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const stageModules=['store-preorder','store-launch','icon-preorder','icon-launch'];
const moduleLabels={'store-preorder':'商店图 · 预约期','store-launch':'商店图 · 测试与首发期','icon-preorder':'ICON · 预约期','icon-launch':'ICON · 测试与首发期','channel-resources':'渠道资源位','ad-resources':'投放资源位'};
const own=(object,key)=>Object.prototype.hasOwnProperty.call(object||{},key);
const formatLimit=spec=>[spec.minKB?`≥ ${spec.minKB} KB`:'',spec.maxKB?`≤ ${spec.maxKB} KB`:''].filter(Boolean).join(' · ')||spec.limitRaw||'原规范未设定';
const formatName=(spec,config)=>spec.outputFormat||spec.formats?.join(' / ')||spec.format||config?.format||'原规范未注明';
const localImage=value=>/^\/(?:storage|ad-reference)\/[\w%./-]+$/.test(value||'')?value:'';

export function normalizeSpecSelection(value={}){
 const module=value.module||'core';
 return {...value,module,lineId:value.lineId||value.businessLineId||'',segmentId:value.segmentId||'',
  templateId:value.templateId||(module==='core'?(value.specId||value.id||''):''),specId:String(value.specId??value.id??'')};
}

// A row without a configured ID is addressed by its index, never just by size:
// the same channel and size can have distinct Logo, corner, or page requirements.
export function moduleSpecRows(module,config){
 return (config?.specs||[]).map((spec,index)=>({...spec,_key:String(spec.id??index),_index:index,
  _title:spec.name||spec.psdGroup||`${spec.channel||spec.platform||'资源位'} · ${spec.width}×${spec.height}`,
  _format:formatName(spec,config),_limit:formatLimit(spec)}));
}

export function specConfiguredReady(row={},config={}){
 return row.productionReady!==false&&row.ready!==false&&row.enabled!==false&&config.productionReady!==false&&config.ready!==false&&config.enabled!==false;
}

export function buildSpecTree(data={},catalogs={}){
 const lines=data.businessLines||[],templates=data.templates||[];
 const core=(line,segment)=>({label:segment.name,key:`core:${line.id}:${segment.id}`,selection:{module:'core',lineId:line.id,segmentId:segment.id},count:templates.filter(t=>t.businessLineId===line.id&&t.segmentId===segment.id).length});
 const stage=module=>({label:module.endsWith('preorder')?'预约期':'测试与首发期',key:module,selection:{module},count:catalogs[module]?.specs?.length??null});
 return lines.map(line=>{
  let children=(line.segments||[]).map(segment=>core(line,segment));
  if(line.id==='platform-community'){
   const media=children.filter(node=>['community','official-media'].includes(node.selection.segmentId));
   children=children.filter(node=>!['community','official-media'].includes(node.selection.segmentId));
   if(media.length)children.push({label:'社区外媒',key:'community-media',children:media});
  }else if(line.id==='channel-distribution'){
   children=children.map(node=>node.selection.segmentId==='huawei'?{...node,key:'channel:huawei',selection:{module:'channel-resources',channelId:'huawei'},count:catalogs['channel-resources']?.rules?.length??node.count}:node);
   children=[{label:'渠道资源位',key:'channel-resources',children},{label:'商店图',key:'store',children:['store-preorder','store-launch'].map(stage)},{label:'ICON',key:'icon',children:['icon-preorder','icon-launch'].map(stage)}];
  }else if(line.id==='performance-marketing'){
   children.unshift({label:'投放资源位',key:'ad-resources',selection:{module:'ad-resources'},count:catalogs['ad-resources']?.catalog?.specs?.length??null});
  }
  return {label:line.name,key:line.id,line,children};
 });
}

export function createSpecCenterNavigation({data,api,onSelect,onSelectionChange=()=>{},openModule=()=>{},isActive=()=>true,treeActions={}}){
 const getData=()=>typeof data==='function'?data():data;
 const catalogs={},errors={},collapsed=new Set();let catalogPromise=null;
 const jobs=new Map();
 async function load(force=false){
  if(catalogPromise)return catalogPromise;
  const sources=[...stageModules.map(module=>[module,`/api/${module}/specs`]),['channel-resources','/api/channel-resources/rules'],['ad-resources','/api/ad-resources']];
  const needed=sources.filter(([module])=>force||!catalogs[module]);
  if(!needed.length)return catalogs;
  catalogPromise=(async()=>{const outcomes=await Promise.allSettled(needed.map(async([module,url])=>[module,await api(url)]));outcomes.forEach((result,index)=>{const module=needed[index][0];if(result.status==='fulfilled'){catalogs[module]=result.value[1];delete errors[module];}else errors[module]=result.reason?.message||'读取失败';});return catalogs;})();
  try{return await catalogPromise;}finally{catalogPromise=null;}
 }
 function selected(node,selection){
  const current=normalizeSpecSelection(selection);
  if(node.selection?.module==='channel-resources')return (current.module==='channel-resources'&&(current.channelId||'huawei')==='huawei')||(current.module==='core'&&current.lineId==='channel-distribution'&&current.segmentId==='huawei');
  if(node.selection?.module==='core')return current.module==='core'&&current.lineId===node.selection.lineId&&current.segmentId===node.selection.segmentId;
  return node.selection?.module===current.module;
 }
 function mountTree(aside,selection,actions={}){
  if(!aside)return;
  const callbacks={...treeActions,...actions};aside.classList.add('unified-spec-tree');
  function draw(){
   if(!aside.isConnected||!isActive())return;
   const scrollTop=aside.scrollTop,choices=[];
   function nodeHtml(node,depth=0){
    if(node.children){
     const controls=node.line?`<span class="sc-tree-actions">${callbacks.onAddSegment?'<button type="button" data-sc-action="add" title="新增分类" aria-label="新增分类">＋</button>':''}${callbacks.onRenameLine?'<button type="button" data-sc-action="rename" title="修改业务名称" aria-label="修改业务名称">✎</button>':''}${callbacks.onToggleLine?`<button type="button" data-sc-action="toggle" title="${node.line.enabled?'停用':'启用'}业务" aria-label="${node.line.enabled?'停用':'启用'}业务">${node.line.enabled?'◉':'○'}</button>`:''}</span>`:'';
     return `<details class="sc-tree-group sc-depth-${depth}" data-sc-group="${escapeHtml(node.key)}" ${collapsed.has(node.key)?'':'open'}><summary><span>${escapeHtml(node.label)}</span>${controls}</summary>${node.children.map(child=>nodeHtml(child,depth+1)).join('')}</details>`;
    }
    const index=choices.push(node.selection)-1;
    return `<button type="button" class="sc-tree-leaf sc-depth-${depth}${selected(node,selection)?' active':''}" data-sc-choice="${index}" ${selected(node,selection)?'aria-current="true"':''}><span>${escapeHtml(node.label)}</span><small>${node.count==null?'…':node.count}</small></button>`;
   }
   aside.innerHTML=`<div class="spec-pane-title"><h2>规范分类</h2>${callbacks.onAddLine?'<button type="button" data-sc-add-line title="新增业务线" aria-label="新增业务线">＋</button>':''}</div>${buildSpecTree(getData(),catalogs).map(node=>nodeHtml(node)).join('')}`;
   aside.querySelectorAll('[data-sc-choice]').forEach(button=>button.onclick=()=>onSelect(choices[Number(button.dataset.scChoice)]));
   aside.querySelectorAll('[data-sc-group]').forEach(details=>details.addEventListener('toggle',()=>{if(details.open)collapsed.delete(details.dataset.scGroup);else collapsed.add(details.dataset.scGroup);}));
   aside.querySelector('[data-sc-add-line]')?.addEventListener('click',()=>callbacks.onAddLine());
   aside.querySelectorAll('[data-sc-action]').forEach(button=>button.onclick=event=>{event.preventDefault();event.stopPropagation();const id=button.closest('[data-sc-group]').dataset.scGroup,line=(getData().businessLines||[]).find(line=>line.id===id);if(!line)return;const action=button.dataset.scAction;if(action==='add')callbacks.onAddSegment(id);if(action==='rename')callbacks.onRenameLine(id);if(action==='toggle')callbacks.onToggleLine(id,!line.enabled);});
   aside.scrollTop=scrollTop;
  }
  draw();load().then(draw);
 }
 function findCoreRule(row){
  return (getData().templates||[]).find(template=>template.businessLineId==='channel-distribution'&&template.segmentId==='huawei'&&String(template.sourceSpec?.number)===String(row.编号));
 }
 function card(row,active){
  const differences=[row.logo==='required'?'有 Logo':row.logo==='forbidden'?'无 Logo':'',own(row,'cornerRadiusPx')?(row.cornerRadiusPx?`圆角 ${row.cornerRadiusPx}`:'直角'):'',own(row,'badge')?(row.badge?`${row.badge}角标`:'无角标'):''].filter(Boolean);
  return `<button type="button" class="spec-resource-card sc-external-card${active?' active':''}" data-sc-row="${escapeHtml(row._key)}"><i aria-hidden="true">${escapeHtml(`${row.width||'—'}×${row.height||'—'}`)}</i><span><b>${escapeHtml(row._title)}</b><em>${escapeHtml(row.channel||row.platform||'资源位')}</em><small>${escapeHtml(row._format)} · ${escapeHtml(row._limit)}</small>${differences.length?`<small class="sc-rule-differences">${escapeHtml(differences.join(' · '))}</small>`:''}</span></button>`;
 }
 function sourceRows(module,config){
  if(module==='channel-resources')return (config?.rules||[]).map((row,index)=>{const size=String(row.尺寸||'').match(/(\d+)\s*[x×X*]\s*(\d+)/);return {...row,_key:`${row.编号}:${index}`,_index:index,_title:`${row.编号} · ${row.业务入口} · ${row.资源位}`,width:Number(size?.[1])||0,height:Number(size?.[2])||0,channel:'华为',_format:row.格式||'待核实',_limit:row.体积||'原规范未设定'};});
  if(module==='ad-resources')return moduleSpecRows(module,{specs:config?.catalog?.specs||[]});
  return moduleSpecRows(module,config);
 }
 function pick(rows,selection,module){
  const key=String(selection.specId??selection.id??'');
  return rows.find(row=>row._key===key||String(row.id??'')===key||`${module}-${row._index}`===key||`${row.channel}-${row.width}x${row.height}`===key||(module==='channel-resources'&&String(row.编号)===key))||rows[0];
 }
 const kv=(label,value)=>`<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value??'原规范未注明')}</dd></div>`;
 const paragraph=value=>`<p>${escapeHtml(value).replace(/\n/g,'<br>')}</p>`;
 function ruleDetails(module,row,config){
  let fields=[kv('尺寸',`${row.width}×${row.height}`),kv('格式',row._format),kv('体积',row._limit)],rules=[],source=[];
  if(module==='channel-resources'){
   fields.push(kv('预览要求',row.预览要求),kv('PSD 模板',row.模板==='/'?'未提供':row.模板));
   rules=[row.逐项制作规则,row.设计要求原文&&row.设计要求原文!=='/'?`需求表原文：${row.设计要求原文}`:'',row.状态].filter(Boolean);
   source=[`规则编号：${row.编号}`,row.模板&&row.模板!=='/'?`模板：${row.模板}`:''].filter(Boolean);
  }else if(module==='ad-resources'){
   fields.push(kv('Logo',row.logo==='required'?'必须有':row.logo==='forbidden'?'不允许':'按需求确认'),kv('素材类型',row.kind==='animation'?'动图':'静态图'));
   rules=[row.requirements,row.outputRule?`输出命名：${row.outputRule}`:'',row.safeInsetX?`左右各 ${row.safeInsetX} 范围为保护区，避免放置文字和人物立绘。`:'',...(row.cautions||[])].filter(Boolean);
   source=[`来源：${config.catalog?.sourceName||'投放尺寸表'}`,`工作表：${config.catalog?.sheet||'原表未注明'} · 第 ${row.row} 行`];
  }else{
   if(own(row,'cornerRadiusPx'))fields.push(kv('圆角',row.cornerRadiusPx?String(row.cornerRadiusPx):'直角'));
   if(row.formats?.length&&row.outputFormat)fields.push(kv('允许格式',row.formats.join(' / ')));
   if(row.badgeWidth&&row.badgeHeight)fields.push(kv('角标尺寸',`${row.badgeWidth}×${row.badgeHeight}`));
   if(module.startsWith('icon-'))fields.push(kv('角标',row.badge||'无角标'));
   if(config.pagesPerSet)fields.push(kv('每套页数',config.pagesPerSet));
   const composition={'crop-center':'保持中心内容，按目标比例裁切','extend':'按目标尺寸补齐外围背景'}[row.composition]||row.composition;
   rules=[row.note,composition?`构图方式：${composition}`:'',row.safeTopPx?`顶部 ${row.safeTopPx} 范围内不放文案。`:'',row.safeBottomPx?`底部 ${row.safeBottomPx} 范围内不放文案。`:'',row.psdGroup?`模板图层组：${row.psdGroup}`:'',row.transparentCanvas?`透明画布；内容 ${row.contentSize}×${row.contentSize}，内缩 ${row.contentInsetPx}，内容圆角 ${row.contentRadiusPx}。`:'',...(Array.isArray(row.requirements)?row.requirements:row.requirements?[row.requirements]:[])].filter(Boolean);
   const authority=typeof config.sourceAuthority==='string'?config.sourceAuthority:config.sourceAuthority?.conflictPolicy;
   source=[config.source,config.psdFile?`模板：${config.psdFile}`:'',authority?`规则依据：${authority}`:''].filter(Boolean);
  }
  const image=localImage(row.referenceUrl);
  const linked=module==='channel-resources'?findCoreRule(row):null;
  return `<div class="sc-rule-layout"><section class="sc-rule-section"><h3>基本规格</h3><dl>${fields.join('')}</dl></section><section class="sc-rule-section"><h3>制作要求</h3>${rules.length?rules.map(paragraph).join(''):'<p>按目标尺寸与格式制作，其他内容以本次需求为准。</p>'}${linked?`<button type="button" class="button secondary" data-sc-core-rule="${escapeHtml(linked.id)}">查看模板与区域</button>`:''}</section>${source.length?`<section class="sc-rule-section sc-rule-source"><h3>规范来源</h3>${source.map(paragraph).join('')}</section>`:''}${image?`<section class="sc-rule-section sc-rule-source"><h3>参考示意</h3><img class="sc-rule-reference" src="${escapeHtml(image)}" alt="${escapeHtml(row._title)}参考示意"/></section>`:''}</div>`;
 }
 async function usageRows(module,row){
  if(module==='channel-resources')return [];
  if(module==='ad-resources')return (catalogs[module]?.batches||[]).filter(batch=>batch.items?.[row.id]).map(batch=>({id:batch.id,label:batch.project||'投放任务',updatedAt:batch.createdAt}));
  if(!jobs.has(module))jobs.set(module,api(`/api/${module}/jobs`).catch(error=>{jobs.delete(module);throw error;}));
  const list=await jobs.get(module);
  return (Array.isArray(list)?list:list.jobs||[]).filter(job=>(job.outputs||[]).some(output=>output.specId?String(output.specId)===String(row.id):output.channel===row.channel&&output.width===row.width&&output.height===row.height)).map(job=>({id:job.id,label:job.project||job.name||'制作任务',updatedAt:job.updatedAt||job.createdAt}));
 }
 async function mountExternal(content,value){
  const selection=normalizeSpecSelection(value),module=selection.module;
  if(!stageModules.includes(module)&&!['channel-resources','ad-resources'].includes(module))throw new Error('不支持的规范分类');
  const root=document.createElement('section');root.className='sc-external-root';
  root.innerHTML='<header class="workspace-page-heading spec-center-heading"><h2>规范中心</h2></header><div class="spec-center-toolbar"><label>⌕<input id="spec-search" aria-label="搜索当前分类的资源位" placeholder="搜索当前分类的资源位"></label><button type="button" class="button secondary" data-sc-open-workbench>进入工作台</button></div><div class="spec-center-layout"><aside class="spec-system-tree"></aside><section class="spec-resource-pane"><div class="spec-pane-title"><h2>正在读取规范…</h2></div><div class="spec-resource-list"></div></section><main class="spec-detail-pane"><div class="sc-loading" role="status">正在读取规范…</div></main></div>';
  content.replaceChildren(root);mountTree(root.querySelector('aside'),selection);
  root.querySelector('.spec-resource-pane h2').textContent=moduleLabels[module];
  const live=()=>root.isConnected&&isActive();
  root.querySelector('[data-sc-open-workbench]').onclick=()=>openModule(module,'',module==='channel-resources'?selection.channelId||'huawei':'');
  await load();if(!live())return;
  const config=catalogs[module];
  if(!config){root.querySelector('.spec-resource-list').innerHTML='<div class="sc-loading">该分类的规范暂未载入</div>';root.querySelector('.spec-detail-pane').innerHTML=`<div class="sc-loading" role="alert">规范读取失败：${escapeHtml(errors[module]||'请稍后重试')}<button type="button" class="button secondary" data-sc-retry>重试</button></div>`;root.querySelector('[data-sc-retry]').onclick=async()=>{await load(true);if(live())mountExternal(content,selection);};return;}
  const rows=module==='channel-resources'&&selection.channelId&&selection.channelId!=='huawei'?[]:sourceRows(module,config);
  let current=pick(rows,selection,module),tab='detail';
  root.querySelector('.spec-resource-pane h2').textContent=`${moduleLabels[module]}（${rows.length}）`;
  function drawList(){const q=root.querySelector('#spec-search').value.trim().toLowerCase(),visible=rows.filter(row=>`${row._title} ${row._format} ${row._limit} ${row.channel} ${row.width}x${row.height} ${row.logo==='required'?'有logo':row.logo==='forbidden'?'无logo':''} ${own(row,'badge')?(row.badge||'无角标'):''}`.toLowerCase().includes(q));root.querySelector('.spec-resource-list').innerHTML=visible.map(row=>card(row,current?._key===row._key)).join('')||'<div class="sc-loading">当前筛选下暂无资源位</div>';root.querySelectorAll('[data-sc-row]').forEach(button=>button.onclick=()=>{current=rows.find(row=>row._key===button.dataset.scRow);const key=module==='channel-resources'?String(current.编号):current._key;onSelectionChange({...selection,id:key,specId:key});tab='detail';drawList();drawDetail();});}
  async function drawDetail(){
   const pane=root.querySelector('.spec-detail-pane');
   if(!current){pane.innerHTML='<div class="sc-loading">当前分类尚未录入规范</div>';return;}
   const row=current,channel=module==='channel-resources',ready=specConfiguredReady(row,config);
   const status=channel?'资料已录入，生产待核实':ready?'已录入规范':'待核实';
   pane.innerHTML=`<header><div><h2>${escapeHtml(row._title)}</h2><span class="tag">${escapeHtml(row.channel||row.platform||'资源位')}</span><span class="sc-config-state">${status}</span></div></header><nav class="spec-detail-tabs">${[['detail','规则详情'],['source','配置来源'],...(!channel?[['usage','使用记录']]:[])].map(([id,label])=>`<button type="button" data-sc-tab="${id}" class="${tab===id?'active':''}">${label}</button>`).join('')}</nav><div class="spec-detail-content"></div>`;
   const body=pane.querySelector('.spec-detail-content');
   if(tab==='detail')body.innerHTML=ruleDetails(module,row,config);
   if(tab==='source'){
    const configuredId=config.id||config.catalog?.sourceName||'本地渠道规则清单';
    body.innerHTML=`<section class="sc-rule-section"><h3>当前配置</h3><dl>${kv('配置标识',configuredId)}${config.specVersion?kv('模板版本',config.specVersion):''}${kv('规则标识',row.id||row.编号||`第 ${row._index+1} 项`)}</dl>${config.source?paragraph(config.source):''}${config.catalog?.sourceSha256?paragraph(`来源校验：${config.catalog.sourceSha256}`):''}</section>`;
   }
   pane.querySelectorAll('[data-sc-tab]').forEach(button=>button.onclick=()=>{tab=button.dataset.scTab;drawDetail();});
   pane.querySelector('[data-sc-core-rule]')?.addEventListener('click',event=>onSelect({module:'core',lineId:'channel-distribution',segmentId:'huawei',templateId:event.currentTarget.dataset.scCoreRule}));
   if(tab==='usage'){
    body.innerHTML='<p role="status">正在读取使用记录…</p>';
    try{const entries=await usageRows(module,row);if(!live()||current!==row||tab!=='usage'||!body.isConnected)return;body.innerHTML=entries.length?`<div class="sc-usage-list">${entries.map((entry,index)=>`<article><span><b>${escapeHtml(entry.label)}</b><small>${escapeHtml(entry.updatedAt?new Date(entry.updatedAt).toLocaleString('zh-CN'):'')}</small></span><button type="button" class="button secondary" data-sc-usage="${index}">打开任务</button></article>`).join('')}</div>`:'<p class="muted">暂无采用此项规范的输出记录</p>';body.querySelectorAll('[data-sc-usage]').forEach(button=>button.onclick=()=>openModule(module,entries[Number(button.dataset.scUsage)].id));}catch(error){if(live()&&body.isConnected)body.innerHTML=`<p role="alert">使用记录读取失败：${escapeHtml(error.message)}</p>`;}
   }
  }
  root.querySelector('#spec-search').oninput=drawList;drawList();drawDetail();
 }
 return {load,mountTree,mountExternal};
}
