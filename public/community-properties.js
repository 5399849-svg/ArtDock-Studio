const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const paths={
 chevron:'<path d="m6 9 6 6 6-6"/>',copyright:'<circle cx="12" cy="12" r="8.5"/><path d="M14.4 8.4a4 4 0 1 0 0 7.2"/>',
 picture:'<rect x="3.5" y="3.5" width="17" height="17" rx="3"/><circle cx="8.4" cy="8.4" r="1.3"/><path d="m4 17 5-5 4 4 3-4 4 5"/>',
 link:'<path d="m10 14 4-4M8.5 15.5l-1 1a3.5 3.5 0 0 1-5-5l4-4a3.5 3.5 0 0 1 5 0M15.5 8.5l1-1a3.5 3.5 0 0 1 5 5l-4 4a3.5 3.5 0 0 1-5 0"/>',
 layers:'<path d="m12 3 9 5-9 5-9-5 9-5ZM3 12l9 5 9-5M3 16l9 5 9-5"/>',text:'<path d="M5 5h14M12 5v15M8 20h8"/>',
 auto:'<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 1 0 17Z" fill="currentColor" stroke="none"/>',
 stroke:'<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M8 8h8v8H8Z" stroke-dasharray="2 3"/>',
 shadow:'<path d="M9 20h8a3 3 0 0 0 3-3V9"/><rect x="3" y="3" width="14" height="14" rx="3"/>'
};
export const communityPropertyIcon=(name,cls='')=>`<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${paths[name]||paths.layers}</svg>`;
const iconFor=kind=>kind==='ip-copyright'?'copyright':['title','subtitle'].includes(kind)?'text':['background','logo'].includes(kind)?'picture':'layers';
export const communityPropertyKey=(task,template,kind)=>`${task.id}:${template.id}:${kind}`;
const numberField=({label,prefix,value,attribute,min,max,unit=''})=>`<label class="cp-number">${prefix?`<span>${prefix}</span>`:''}<input type="number" aria-label="${label}" ${attribute} value="${Number.isFinite(Number(value))?Math.round(Number(value)*100)/100:0}" ${min===undefined?'':`min="${min}"`} ${max===undefined?'':`max="${max}"`}>${unit?`<span class="cp-unit">${unit}</span>`:''}</label>`;
const toggle=(label,attribute,checked)=>`<span class="cp-switch"><input type="checkbox" aria-label="${label}" ${attribute} ${checked?'checked':''}><span></span></span>`;
function effectControl(group,label,effect){
 const field=(key,name,min,max,unit='px')=>`<div class="cp-effect-field"><span>${name}</span>${numberField({label:`${label}${name}`,value:effect[key],attribute:`data-effect-field="${group}.${key}"`,min,max,unit})}</div>`;
 const color=`<div class="cp-effect-field"><span>颜色</span><div class="cp-color-field"><input type="color" aria-label="${label}颜色" data-effect-field="${group}.color" value="${escape(effect.color)}"><output>${escape(effect.color).toUpperCase()}</output></div></div>`;
 return `<section class="cp-effect element-effect-card ${effect.enabled?'enabled':''}" data-effect-group="${group}"><div class="cp-effect-row"><span>${communityPropertyIcon(group)}${label}</span>${toggle(`启用${label}`,`data-effect-field="${group}.enabled"`,effect.enabled)}</div><div class="cp-effect-fields element-effect-fields">${color}${group==='stroke'?field('width','粗细',1,30):field('opacity','不透明度',0,100,'%')+field('blur','模糊',0,80)+'<span aria-hidden="true"></span>'+field('offsetX','水平偏移',-100,100)+field('offsetY','垂直偏移',-100,100)}</div></section>`;
}

export function renderCommunityProperties({kind,choices,layout,background,scale,maximum,ratioLocked=true,preciseOpen=false,plainCopyright=false,colorMode='auto',effects,extra='',cleanup=''}){
 const isBackground=kind==='background',label=choices.find(c=>c.value===kind)?.label||'图层',minimum=isBackground?50:25,progress=Math.max(0,Math.min(100,(scale-minimum)/(maximum-minimum)*100));
 const select=`<div class="cp-layer-picker">${communityPropertyIcon(iconFor(kind),'cp-type-icon')}<select id="community-property-layer" aria-label="当前图层">${choices.map(c=>`<option value="${c.value}" ${c.value===kind?'selected':''} ${c.allowed?'':'disabled'}>${escape(c.label)}</option>`).join('')}</select>${communityPropertyIcon('chevron','cp-select-chevron')}</div>`;
 const size=!isBackground&&layout?`<div class="cp-size-group"><div class="cp-group-head"><h3>尺寸<span>px</span></h3><button type="button" class="cp-ratio" aria-label="锁定宽高比例" aria-pressed="${ratioLocked}">${communityPropertyIcon('link')}等比</button></div><div class="cp-fields">${numberField({label:'宽度',prefix:'宽',value:layout.width,attribute:'data-layout-field="width"',min:1})}${numberField({label:'高度',prefix:'高',value:layout.height,attribute:'data-layout-field="height"',min:1})}</div></div>`:'';
 const copyright=plainCopyright?`<div class="cp-appearance-line"><span>版权字色</span><div class="cp-color-options" role="group" aria-label="版权字色">${[['auto','自动'],['white','白色'],['black','黑色']].map(([value,text])=>`<button type="button" data-copyright-mode="${value}" class="cp-color-choice ${colorMode===value?'active':''}" aria-pressed="${colorMode===value}">${value==='auto'?communityPropertyIcon('auto'): `<i class="cp-swatch ${value}"></i>`}${text}</button>`).join('')}</div><select id="copyright-color-mode" hidden aria-label="版权字色选项">${['auto','white','black'].map(value=>`<option value="${value}" ${colorMode===value?'selected':''}>${value}</option>`).join('')}</select></div>`:'';
 const flip=!isBackground&&['character','character2'].includes(kind)?`<label class="cp-appearance-line cp-flip"><span>水平翻转</span>${toggle('水平翻转', 'id="layout-flip-x"',layout?.flipX===true)}</label>`:'';
 const appearance=copyright+flip+(effects&&!plainCopyright?effectControl('stroke','描边',effects.stroke)+effectControl('shadow','投影',effects.shadow):'')+(extra?`<div class="cp-extra">${extra}</div>`:'');
 const precise=isBackground?numberField({label:'水平焦点',prefix:'水平',value:background.focalX,attribute:'data-background-field="focalX"',min:0,max:100,unit:'%'})+numberField({label:'垂直焦点',prefix:'垂直',value:background.focalY,attribute:'data-background-field="focalY"',min:0,max:100,unit:'%'}):numberField({label:'位置 X',prefix:'X',value:Math.round(layout?.x||0),attribute:'data-layout-field="x"'})+numberField({label:'位置 Y',prefix:'Y',value:Math.round(layout?.y||0),attribute:'data-layout-field="y"'});
 return `<div class="community-properties inspector-body" data-property-kind="${kind}"><p class="cp-field-label">当前图层</p><div class="cp-layer-line">${select}${isBackground?'':`<label class="cp-visibility">显示${toggle(`显示${label}`,'id="layout-visible"',layout?.visible!==false)}</label>`}</div>${size}<div class="cp-scale-group"><div class="cp-scale-head"><label for="community-property-scale">${isBackground?'画面缩放':'缩放'}</label><label class="cp-scale-value"><input id="community-property-scale" type="number" min="${minimum}" max="${maximum}" data-element-scale="${kind}" aria-label="等比缩放百分比" value="${scale}">%</label></div><input class="cp-scale-range" type="range" min="${minimum}" max="${maximum}" step="1" value="${scale}" data-element-scale="${kind}" aria-label="等比缩放" style="--cp-progress:${progress}%"></div>${appearance?`<hr class="cp-divider"><h3 class="cp-section-heading">外观</h3>${appearance}`:''}${cleanup?`<div class="cp-cleanup">${cleanup}</div>`:''}<details class="cp-precise" ${preciseOpen?'open':''}><summary>${communityPropertyIcon('chevron')}精确定位<span>${isBackground?'%':'px'}</span></summary><div class="cp-fields">${precise}</div></details></div>`;
}

export function mountCommunityProperties(root,{selectLayer,setRatioLocked,setPreciseOpen}={}){
 const panel=root?.querySelector('.community-properties');if(!panel)return;
 panel.querySelector('#community-property-layer')?.addEventListener('change',e=>selectLayer(e.target.value));
 const ratio=panel.querySelector('.cp-ratio');ratio?.addEventListener('click',()=>{const locked=ratio.getAttribute('aria-pressed')!=='true';ratio.setAttribute('aria-pressed',String(locked));setRatioLocked(locked);});
 const precise=panel.querySelector('.cp-precise');precise?.addEventListener('toggle',()=>{if(precise.isConnected)setPreciseOpen(precise.open);});
 // Record the intent before any intervening render removes the old details.
 precise?.querySelector('summary')?.addEventListener('click',()=>setPreciseOpen(!precise.open));
 panel.querySelectorAll('[data-copyright-mode]').forEach(button=>button.addEventListener('click',()=>{
  const select=panel.querySelector('#copyright-color-mode');if(select.disabled)return;
  select.value=button.dataset.copyrightMode;select.dispatchEvent(new Event('change',{bubbles:true}));
  panel.querySelectorAll('[data-copyright-mode]').forEach(b=>{b.classList.toggle('active',b===button);b.setAttribute('aria-pressed',String(b===button));});
 }));
 panel.querySelectorAll('input[type="color"]').forEach(input=>input.addEventListener('input',()=>{input.parentElement.querySelector('output').textContent=input.value.toUpperCase();}));
}

export function syncCommunityPropertyControls(root,{layout,background,scale}){
 const panel=root?.querySelector('.community-properties');if(!panel)return;
 const set=(selector,value)=>panel.querySelectorAll(selector).forEach(input=>{if(input!==document.activeElement)input.value=value;});
 if(layout)for(const key of ['x','y','width','height'])set(`[data-layout-field="${key}"]`,Math.round(layout[key]));
 if(background)for(const key of ['focalX','focalY'])set(`[data-background-field="${key}"]`,Math.round(background[key]*100)/100);
 set('[data-element-scale]',scale);
 panel.querySelectorAll('input[type="range"][data-element-scale]').forEach(input=>input.style.setProperty('--cp-progress',`${(scale-Number(input.min))/(Number(input.max)-Number(input.min))*100}%`));
}
