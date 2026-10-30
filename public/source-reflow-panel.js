import {sourceMergedLayer} from './source-adaptation-model.js';
import {normalizeSourceSelection} from './source-selection-model.js';
const colors=['#7957ff','#f27832','#17a999','#d94bb0','#267ce0','#b58a13'];
export function sourceSeparationDialog(){return `<dialog id="source-separation-dialog"><div class="source-split-heading"><h3>分离角色并补全背景</h3><button id="source-split-close" class="button ghost">关闭</button></div><p class="source-help">每个角色单独框选，包含完整头发、服饰和随身道具。Shift + 点击添加保留点，Alt + 点击添加排除点。</p><div class="source-split-tools"><div id="source-split-characters" aria-label="已框选角色"></div><button id="source-split-add" class="button secondary">＋ 添加角色</button><button id="source-split-reset" class="button ghost">重新框选当前角色</button></div><div class="source-split-stage"><canvas id="source-split-canvas"></canvas></div><p class="source-help">角色保留原图像素，分别成为可移动的素材；工作台自动补全移除角色后的背景。</p><p id="source-split-status" role="status"></p><button id="source-split-apply" class="button primary">分离角色并补全背景</button></dialog>`;}
export function mountSourceSeparation({root,task,images,post,work,updated,save,templateId}){
 const trigger=root.querySelector('#source-separate'),dialog=root.querySelector('#source-separation-dialog');if(!trigger||!dialog)return;
 const layer=sourceMergedLayer(task),img=images.get(layer.assetName),canvas=root.querySelector('#source-split-canvas'),ctx=canvas.getContext('2d'),status=root.querySelector('#source-split-status');
 const previous=task.sourceAdaptation.reflow,list=root.querySelector('#source-split-characters'),add=root.querySelector('#source-split-add');
 let selections=structuredClone(previous?.selections||(previous?.selection?[previous.selection]:[null])).map(s=>s?normalizeSourceSelection(s):null),active=0,start=null,processing=false;
 canvas.width=layer.width;canvas.height=layer.height;
 const tabs=()=>{list.innerHTML=selections.map((s,i)=>`<span class="source-split-character"><button type="button" data-split-character="${i}" aria-pressed="${active===i}" style="--character-color:${colors[i]}">角色 ${i+1}${s?'':' · 待框选'}</button><button type="button" data-split-remove="${i}" aria-label="移除角色 ${i+1}" ${selections.length===1?'disabled':''}>×</button></span>`).join('');add.disabled=selections.length>=6;};
 const paint=()=>{ctx.clearRect(0,0,canvas.width,canvas.height);if(img)ctx.drawImage(img,0,0,canvas.width,canvas.height);const ratio=canvas.width/(canvas.clientWidth||canvas.width);
  selections.forEach((s,i)=>{if(!s)return;const b=s.box;ctx.strokeStyle=colors[i];ctx.lineWidth=(active===i?3:2)*ratio;ctx.strokeRect(b[0]*canvas.width,b[1]*canvas.height,(b[2]-b[0])*canvas.width,(b[3]-b[1])*canvas.height);ctx.font=`bold ${15*ratio}px sans-serif`;ctx.fillStyle=colors[i];ctx.fillText(`角色 ${i+1}`,b[0]*canvas.width+4*ratio,Math.max(18*ratio,b[1]*canvas.height-5*ratio));for(const p of s.points){ctx.beginPath();ctx.arc(p.x*canvas.width,p.y*canvas.height,4*ratio,0,Math.PI*2);ctx.fillStyle=p.label?colors[i]:'#ef3340';ctx.fill();ctx.strokeStyle='white';ctx.lineWidth=ratio;ctx.stroke();}});
 };
 const point=e=>{const r=canvas.getBoundingClientRect();return {x:Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),y:Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))};};
 trigger.onclick=()=>{status.textContent='';dialog.showModal();tabs();paint();};root.querySelector('#source-split-close').onclick=()=>{if(!processing)dialog.close();};dialog.addEventListener('cancel',e=>{if(processing)e.preventDefault();});
 add.onclick=()=>{if(processing||selections.length>=6)return;if(selections.some(s=>!s))active=selections.findIndex(s=>!s);else{selections.push(null);active=selections.length-1;}tabs();paint();};
 list.onclick=e=>{if(processing)return;const pick=e.target.closest('[data-split-character]'),remove=e.target.closest('[data-split-remove]');if(pick)active=Number(pick.dataset.splitCharacter);if(remove&&selections.length>1){selections.splice(Number(remove.dataset.splitRemove),1);active=Math.min(active,selections.length-1);}tabs();paint();};
 root.querySelector('#source-split-reset').onclick=()=>{if(processing)return;selections[active]=null;tabs();paint();};
 canvas.onpointerdown=e=>{if(e.button!==0||processing)return;const p=point(e),selection=selections[active];if(e.shiftKey||e.altKey){if(!selection)return;const b=selection.box;if(p.x<b[0]||p.x>b[2]||p.y<b[1]||p.y>b[3]){status.textContent='请在当前角色的选框内添加提示点';return;}if(selection.points.length>=12){status.textContent='每个角色最多 12 个提示点';return;}selection.points.push({...p,label:e.altKey?0:1});paint();return;}start=p;canvas.setPointerCapture(e.pointerId);};
 canvas.onpointermove=e=>{if(!start||processing)return;const p=point(e),b=[Math.min(p.x,start.x),Math.min(p.y,start.y),Math.max(p.x,start.x),Math.max(p.y,start.y)];selections[active]={box:b,points:[],pointMode:'manual'};paint();};
 canvas.onpointerup=canvas.onpointercancel=()=>{start=null;if(!processing)tabs();};
 root.querySelector('#source-split-apply').onclick=()=>{if(processing)return;if(selections.some(s=>!s||s.box[2]-s.box[0]<.02||s.box[3]-s.box[1]<.02)){status.textContent='请为每个角色框选完整范围，或移除多余的空选框';return;}
  void work(async()=>{processing=true;status.textContent=`正在分别提取 ${selections.length} 个角色，并自动补全背景，请稍候…`;
   try{await save();await post('separate',{selections});status.textContent='角色和背景已就绪，正在排版当前尺寸…';try{await post('adapt',{templateIds:[templateId],fit:'reflow'});}finally{dialog.close();await updated({stage:'sizes'});}}
   catch(e){status.textContent=e.message;throw e;}finally{processing=false;}
  });
 };
}
