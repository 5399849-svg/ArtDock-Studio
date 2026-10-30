import {illustrationOptions,illustrationCharacterSources} from './community-illustration-state.js?v=20261027-prompt-character';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function renderCharacterReuseMenu(task,asset,{disabled=false}={}){
 const selected=illustrationOptions(task).characterSourceName===asset.name,png=asset.mime?.split(';')[0].toLowerCase()==='image/png';
 return `<button type="button" class="community-character-menu-trigger" data-character-menu="${encodeURIComponent(asset.name)}" data-can-reuse="${png}" data-reuse-selected="${selected}" aria-label="${esc(asset.displayName||asset.name)}素材菜单" title="素材菜单" aria-haspopup="menu" aria-expanded="false" ${disabled?'disabled':''}>⋯</button>`;
}
export function mountCharacterReuseMenus(root,onSelect){
 let menu,opener;
 const close=()=>{menu?.remove();menu=null;opener?.setAttribute('aria-expanded','false');opener=null;};
 const outside=event=>{if(menu&&!menu.contains(event.target)&&!opener?.contains(event.target))close();};
 const escape=event=>{if(menu&&event.key==='Escape'){const button=opener;close();button?.focus({preventScroll:true});event.preventDefault();}};
 const buttons=[...root.querySelectorAll('[data-character-menu]')],handlers=[];
 for(const button of buttons){const handler=event=>{
  event.stopPropagation();const wasOpen=opener===button;close();if(wasOpen)return;
  opener=button;button.setAttribute('aria-expanded','true');menu=document.createElement('div');menu.className='community-character-menu-popover';menu.setAttribute('role','menu');
  const item=document.createElement('button');item.type='button';item.setAttribute('role','menuitem');item.textContent=button.dataset.reuseSelected==='true'?'取消原样使用':'原样使用角色';item.disabled=button.dataset.canReuse!=='true';if(item.disabled)item.title='原样使用需要透明 PNG';
  menu.append(item);document.body.append(menu);const rect=button.getBoundingClientRect();menu.style.left=`${Math.max(8,Math.min(rect.left,window.innerWidth-menu.offsetWidth-8))}px`;menu.style.top=`${Math.min(rect.bottom+6,window.innerHeight-menu.offsetHeight-8)}px`;
  item.onclick=()=>{const name=decodeURIComponent(button.dataset.characterMenu);close();void onSelect(name);};if(!item.disabled)item.focus({preventScroll:true});
 };button.addEventListener('click',handler);handlers.push([button,handler]);}
 document.addEventListener('pointerdown',outside,true);document.addEventListener('keydown',escape);window.addEventListener('scroll',close,true);window.addEventListener('resize',close);
 return ()=>{close();handlers.forEach(([button,handler])=>button.removeEventListener('click',handler));document.removeEventListener('pointerdown',outside,true);document.removeEventListener('keydown',escape);window.removeEventListener('scroll',close,true);window.removeEventListener('resize',close);};
}
export function renderCharacterReuseSelection(task){
 const options=illustrationOptions(task);if(options.characterMode!=='original')return '';
 const asset=illustrationCharacterSources(task).find(a=>a.name===options.characterSourceName);
 return `<div class="community-character-reuse-selection" role="status"><span>原样使用 · ${esc(asset?.label||'所选素材已移除')}</span><button type="button" data-character-reuse-clear aria-label="取消原样使用">×</button></div>`;
}
export function setCharacterReuse(task,name){
 task.parameters.communityIllustrationOptions={version:2,characterMode:name?'original':'prompt',characterSourceName:name||'',action:'',side:'auto'};
}
export function assertReusableCharacterImage(image){
 const scale=Math.min(1,512/Math.max(image.naturalWidth,image.naturalHeight)),canvas=document.createElement('canvas');
 canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
 const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(image,0,0,canvas.width,canvas.height);
 const pixels=context.getImageData(0,0,canvas.width,canvas.height).data;let empty=0;
 for(let p=3;p<pixels.length;p+=4)if(pixels[p]<16)empty++;
 if(empty<canvas.width*canvas.height*.01)throw Error('这张图没有透明背景，请先提供透明角色 PNG 或完成抠图。');
}
