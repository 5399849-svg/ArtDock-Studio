const types = {core:'核心主体',copy:'主标/文案',logo:'Logo',ip:'IP版权',button:'按钮','kv-input':'完整KV',fixed:'固定效果','page-occlusion':'页面遮挡','extend-left':'左侧扩图','extend-right':'右侧扩图','extend-top':'顶部扩图','extend-bottom':'底部扩图','body-boundary':'成品主体边界','character-breakout':'角色允许破界'};
const colors = {'page-occlusion':'#3989f7',core:'#ef5263',copy:'#ef5263',fixed:'#8661e9',logo:'#ce7b1d',ip:'#7656d9',button:'#ce7b1d','body-boundary':'#00a8b5','character-breakout':'#f0448a'};
const escape = value => String(value ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function openRegionEditor({template, rule, imageUrl, save}) {
  const draft = structuredClone(rule || {templateId:template.id,revision:0,globalRegions:[],variants:[{id:'layout-01',name:'默认版式',regions:[]}]});
  let variantId = draft.variants[0].id, selected = '', dirty = false, saving = false;
  const dialog = document.createElement('dialog');
  dialog.className = 'dialog region-editor';
  dialog.innerHTML = `<div class="dialog-head"><div><h2>编辑画面区域</h2><p>${escape(template.name)} · ${template.width}×${template.height} px</p></div><button class="icon-button" data-close aria-label="关闭区域编辑器">×</button></div>
    <div class="region-toolbar"><label>当前版式 <select data-variant>${draft.variants.map(v=>`<option value="${escape(v.id)}">${escape(v.name)}</option>`).join('')}</select></label><span>拖动区域移动，拖动右下角缩放；坐标以原画布像素保存。</span></div>
    <div class="region-workspace"><div class="region-stage"><div class="region-canvas" tabindex="0" aria-label="画面区域画布"></div><p>底图仅供对照；区域以目标画布坐标为准。固定效果名称保留其生产含义。</p></div><aside class="region-inspector"><div class="region-list"></div><button class="button secondary" data-add>＋ 新增区域</button><div class="region-fields"></div></aside></div>
    <div class="region-message" role="status"></div><div class="dialog-actions"><small>保存后须在规则表单中重新人工核实，方可交付。</small><button class="button ghost" data-close>取消</button><button class="button primary" data-save>保存区域</button></div>`;
  document.body.append(dialog);
  const canvas = dialog.querySelector('.region-canvas');
  // Fit both wide and tall canvases without distorting their coordinate system.
  canvas.style.aspectRatio = `${template.width}/${template.height}`;
  canvas.style.width = `min(100%, ${520 * template.width / template.height}px)`;
  const entries = () => [...draft.globalRegions.map((r,i)=>({r,key:`global:${i}`,scope:'global',index:i})), ...draft.variants.find(v=>v.id===variantId).regions.map((r,i)=>({r,key:`variant:${i}`,scope:'variant',index:i}))];
  const current = () => entries().find(e=>e.key===selected);
  const listFor = scope => scope === 'global' ? draft.globalRegions : draft.variants.find(v=>v.id===variantId).regions;
  const close = () => { if (saving) return; if (dirty && !confirm('尚有未保存的区域修改，确定放弃？')) return; dialog.close(); dialog.remove(); };
  dialog.addEventListener('cancel', e=>{e.preventDefault();close();});
  dialog.querySelectorAll('[data-close]').forEach(b=>b.onclick=close);
  const draw = () => {
    canvas.innerHTML = `${imageUrl ? `<img src="${escape(imageUrl)}" alt="区域参考底图" draggable="false">` : ''}${entries().map(({r,key})=>`<div tabindex="0" role="button" aria-label="${escape(r.name)}" data-region="${key}" data-shape="${escape(r.shape || 'rect')}" class="region-box ${key===selected?'selected':''}" style="left:${r.bounds.x/template.width*100}%;top:${r.bounds.y/template.height*100}%;width:${r.bounds.width/template.width*100}%;height:${r.bounds.height/template.height*100}%;--region-color:${colors[r.type] || '#4d9851'}"><span>${escape(r.name)}</span>${key===selected?'<i data-resize aria-label="缩放区域"></i>':''}</div>`).join('')}`;
    dialog.querySelector('.region-list').innerHTML = entries().map(({r,key,scope})=>`<button class="${key===selected?'active':''}" data-select="${key}">${escape(r.name)}<small>${scope==='global'?'所有版式':types[r.type]}</small></button>`).join('') || '<p>当前版式尚无区域</p>';
    dialog.querySelectorAll('[data-select]').forEach(b=>b.onclick=()=>{selected=b.dataset.select;render();});
  };
  const fields = () => {
    const entry = current();
    const panel = dialog.querySelector('.region-fields');
    if (!entry) { panel.innerHTML='<p>选择或新增一个区域开始编辑</p>'; return; }
    const {r,scope} = entry;
    panel.innerHTML = `<label>区域名称<input data-field="name" maxlength="100" value="${escape(r.name)}"></label><label>类型<select data-field="type">${Object.entries(types).map(([v,n])=>`<option value="${v}" ${v===r.type?'selected':''}>${n}</option>`).join('')}</select></label><label>形状<select data-field="shape"><option value="rect" ${r.shape==='rect'||!r.shape?'selected':''}>矩形</option><option value="ellipse" ${r.shape==='ellipse'?'selected':''}>圆形/椭圆</option><option value="path" ${r.shape==='path'?'selected':''}>PSD路径</option></select></label><label>应用范围<select data-field="scope"><option value="variant" ${scope==='variant'?'selected':''}>仅当前版式</option><option value="global" ${scope==='global'?'selected':''}>所有版式</option></select></label><div class="region-coordinates">${['x','y','width','height'].map(k=>`<label>${{x:'X',y:'Y',width:'宽度',height:'高度'}[k]}<input data-field="${k}" type="number" step="1" min="${k==='x'||k==='y'?0:1}" value="${r.bounds[k]}"></label>`).join('')}</div><button class="button ghost" data-delete>删除此区域</button>`;
    panel.querySelectorAll('[data-field]').forEach(input=>input.onchange=()=>{
      const key=input.dataset.field;
      if (key==='scope') { listFor(scope).splice(entry.index,1); const list=listFor(input.value); list.push(r); selected=`${input.value}:${list.length-1}`; }
      else if (key==='name' || key==='type' || key==='shape') r[key]=input.value;
      else { const value=Number(input.value); if (!input.value || !Number.isInteger(value)) { fields(); return; } r.bounds[key]=value; clamp(r.bounds); }
      dirty=true;render();
    });
    panel.querySelector('[data-delete]').onclick=()=>{listFor(scope).splice(entry.index,1);selected='';dirty=true;render();};
  };
  function clamp(b) { b.x=Math.max(0,Math.min(template.width-1,b.x)); b.y=Math.max(0,Math.min(template.height-1,b.y)); b.width=Math.max(1,Math.min(template.width-b.x,b.width)); b.height=Math.max(1,Math.min(template.height-b.y,b.height)); }
  function render() { draw(); fields(); }
  dialog.querySelector('[data-variant]').onchange=e=>{variantId=e.target.value;selected='';render();};
  dialog.querySelector('[data-add]').onclick=()=>{const list=listFor('variant');list.push({type:'core',name:'新建核心区域',bounds:{x:Math.round(template.width*.1),y:Math.round(template.height*.1),width:Math.max(1,Math.round(template.width*.3)),height:Math.max(1,Math.round(template.height*.3))}});selected=`variant:${list.length-1}`;dirty=true;render();};
  let drag;
  canvas.addEventListener('pointerdown', e=>{
    if (e.button!==0) return;
    const box=e.target.closest('[data-region]');if(!box)return;
    selected=box.dataset.region;
    drag={pointer:e.pointerId,x:e.clientX,y:e.clientY,b:{...current().r.bounds},resize:Boolean(e.target.closest('[data-resize]')),rect:canvas.getBoundingClientRect()};
    canvas.setPointerCapture(e.pointerId);e.preventDefault();render();
  });
  canvas.addEventListener('pointermove', e=>{
    if(!drag || drag.pointer!==e.pointerId)return;
    const b=current().r.bounds, dx=Math.round((e.clientX-drag.x)*template.width/drag.rect.width), dy=Math.round((e.clientY-drag.y)*template.height/drag.rect.height);
    if(drag.resize) {b.width=drag.b.width+dx;b.height=drag.b.height+dy;clamp(b);}
    else { b.x=Math.max(0,Math.min(template.width-b.width,drag.b.x+dx)); b.y=Math.max(0,Math.min(template.height-b.height,drag.b.y+dy)); }
    dirty=true;render();
  });
  const endDrag=()=>{drag=null;};
  canvas.addEventListener('pointerup',endDrag);canvas.addEventListener('pointercancel',endDrag);canvas.addEventListener('lostpointercapture',endDrag);
  canvas.addEventListener('keydown',e=>{
    if(saving)return;
    if(e.key==='Enter' || e.key===' ') {const el=e.target.closest('[data-region]');if(el){e.preventDefault();selected=el.dataset.region;render();}return;}
    const entry=current();if(!entry || !['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;
    e.preventDefault();const b=entry.r.bounds,step=e.shiftKey?10:1;
    b.x=Math.max(0,Math.min(template.width-b.width,b.x+({ArrowLeft:-step,ArrowRight:step}[e.key]||0)));
    b.y=Math.max(0,Math.min(template.height-b.height,b.y+({ArrowUp:-step,ArrowDown:step}[e.key]||0)));dirty=true;render();canvas.focus();
  });
  dialog.querySelector('[data-save]').onclick=async()=>{
    if(saving)return;if(!dirty){close();return;}saving=true;
    dialog.querySelectorAll('button,input,select').forEach(el=>el.disabled=true);
    canvas.style.pointerEvents='none';
    try {await save({...draft,revision:rule?.revision||0});dirty=false;saving=false;close();}
    catch(error){dialog.querySelector('.region-message').textContent=error.message;saving=false;dialog.querySelectorAll('button,input,select').forEach(el=>el.disabled=false);canvas.style.pointerEvents='';}
  };
  render();dialog.showModal();
}
