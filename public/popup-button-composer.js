const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Keep unsent references across editor rerenders, separately for each task and size.
const drafts=new Map();
const key=(task,id)=>`${task.id}:${id}`;
function draftFor(task,id){
 const k=key(task,id);if(!drafts.has(k)){const run=task.communityGeneration?.phase==='popup-button'&&task.communityGeneration.templateId===id?task.communityGeneration:null;
  drafts.set(k,{prompt:run?.prompt||'',references:(run?.referenceNames||[run?.referenceName]).filter(Boolean).map(name=>task.assets.find(a=>a.name===name)).filter(Boolean).map(a=>({assetName:a.name,name:a.label||a.name,url:a.url}))});}
 return drafts.get(k);
}
export function renderPopupButtonComposer(task,c,{templateId='community-community-popup',disabled=false}={}){
 const run=task.communityGeneration?.phase==='popup-button'&&task.communityGeneration.templateId===templateId?task.communityGeneration:null,running=run?.status==='running',recover=run&&['failed','interrupted'].includes(run.status)&&(run.submittedAt||run.providerJobId||run.rawFile),locked=disabled||running||run?.status==='interrupted',d=draftFor(task,templateId);
 return `<details class="source-button-ai popup-button-ai" open><summary>✦ AI 生成按钮底板</summary><div class="popup-button-composer" tabindex="0" data-button-composer><h4>参考图</h4><div class="popup-button-references" data-button-references></div><input type="file" accept="image/png,image/jpeg,image/webp" multiple data-button-files hidden><p class="popup-button-hint">上传或 Ctrl + V 粘贴，最多 5 张</p>${c.buttonBackingAsset?`<button type="button" class="button ghost full-button" data-button-current ${locked?'disabled':''}>＋ 将当前底板加入参考图</button>`:''}<label for="source-button-prompt">底板样式</label><textarea id="source-button-prompt" rows="5" maxlength="1200" placeholder="例如：参考图1的红金配色、图2的祥云边框，中间留出按钮文案的位置。" ${locked?'disabled':''}>${esc(d.prompt)}</textarea><div class="popup-button-tags"><span>透明 PNG</span><span>独立底板</span></div><div class="popup-button-footer"><select aria-label="按钮生成模型" disabled><option>GPT-Image2</option></select><button type="button" id="source-button-generate" class="button primary" ${locked?'disabled':''}>${running?'生成中…':'生成并使用 ↑'}</button></div><small>按钮文案和版权字体沿用当前设置。</small><p data-button-error class="popup-error" role="alert"></p></div>${recover?'<button type="button" id="source-button-resume" class="button secondary full-button">继续处理本次生成</button>':''}<p class="source-help" role="status">${running?'按钮底板生成中…':esc(run?.error||(run?.status==='done'?(run.applied?'新底板已应用':'底板已保存，可从已有底板中选择'):''))}</p></details>`;
}
export function mountPopupButtonComposer({root,task,templateId='community-community-popup',config,isBusy=()=>false,disabled=false,generate}){
 const box=root.querySelector('[data-button-composer]');if(!box)return ()=>{};
 const d=draftFor(task,templateId),grid=box.querySelector('[data-button-references]'),input=box.querySelector('[data-button-files]'),error=box.querySelector('[data-button-error]'),prompt=box.querySelector('textarea');let pending=false,disposed=false;
 const locked=()=>disabled||pending||isBusy()||['running','interrupted'].includes(task.communityGeneration?.phase==='popup-button'?task.communityGeneration.status:'');
 const draw=()=>{grid.innerHTML=d.references.map((r,i)=>`<figure class="popup-button-reference"><img src="${esc(r.url||r.dataUrl)}" alt="参考图${i+1}"><button type="button" data-button-remove="${i}" aria-label="移除图${i+1}" ${locked()?'disabled':''}>×</button><figcaption>图${i+1}${i?`<button type="button" data-button-earlier="${i}" title="向前移" aria-label="将图${i+1}向前移" ${locked()?'disabled':''}>←</button>`:''}</figcaption></figure>`).join('')+`<button type="button" class="popup-button-paste" data-button-upload ${locked()||d.references.length>=5?'disabled':''}><b>＋</b>粘贴图片<small>Ctrl + V</small></button>`;};
 const read=file=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('参考图读取失败'));reader.readAsDataURL(file);});
 async function add(files){if(locked())return;pending=true;draw();error.textContent='';try{
  if(d.references.length+files.length>5)throw Error('最多添加 5 张参考图');const refs=[];
  for(const file of files){if(!/^image\/(png|jpeg|webp)$/.test(file.type)||file.size>10*1048576)throw Error('参考图请使用 10 MB 以内的 PNG、JPG 或 WebP');refs.push({name:file.name,dataUrl:await read(file)});}
  if([...d.references,...refs].reduce((n,r)=>n+(r.dataUrl?.length||0),0)>25*1048576*4/3)throw Error('参考图总大小不能超过 25 MB');
  if(!disposed)d.references.push(...refs);
 }catch(e){error.textContent=e.message;}finally{pending=false;input.value='';draw();}}
 grid.onclick=e=>{if(locked())return;const remove=e.target.closest('[data-button-remove]'),earlier=e.target.closest('[data-button-earlier]');if(remove)d.references.splice(Number(remove.dataset.buttonRemove),1);else if(earlier){const i=Number(earlier.dataset.buttonEarlier);[d.references[i-1],d.references[i]]=[d.references[i],d.references[i-1]];}else if(e.target.closest('[data-button-upload]'))input.click();draw();};
 input.onchange=()=>void add([...input.files]);
 box.addEventListener('paste',e=>{const files=[...(e.clipboardData?.files||[])].filter(f=>f.type.startsWith('image/'));if(!files.length)return;e.preventDefault();e.stopPropagation();void add(files);});
 prompt.oninput=()=>{d.prompt=prompt.value;};
 box.querySelector('[data-button-current]')?.addEventListener('click',()=>{if(locked())return;const asset=task.assets.find(a=>a.name===config().buttonBackingAsset);if(!asset)return;if(d.references.some(r=>r.assetName===asset.name))return;if(d.references.length>=5){error.textContent='最多添加 5 张参考图';return;}d.references.push({assetName:asset.name,name:asset.label||asset.name,url:asset.url});draw();});
 const submit=async resume=>{if(disabled||pending||isBusy()||(!resume&&locked()))return;error.textContent='';if(!resume&&!d.prompt.trim()){error.textContent='请填写想要的按钮底板样式';prompt.focus();return;}pending=true;draw();box.querySelector('#source-button-generate').disabled=true;
  try{await generate({resume,prompt:d.prompt.trim(),references:d.references.map(({assetName,name,dataUrl})=>assetName?{assetName}:{name,dataUrl})});}catch(e){error.textContent=e.message;}finally{pending=false;if(!disposed){draw();box.querySelector('#source-button-generate').disabled=locked();}}};
 box.querySelector('#source-button-generate').onclick=()=>void submit(false);root.querySelector('#source-button-resume')?.addEventListener('click',()=>void submit(true));draw();return ()=>{disposed=true;};
}
