import {isAdImageUrl} from './ad-image-url.js?v=20261022-draft-sync';
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const imageUrl=value=>isAdImageUrl(value)?value:'';
const time=value=>{const date=new Date(value);return Number.isFinite(date.getTime())?date.toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}):''};
const description=version=>version.toneCorrection?'依据上传原图校准肤色与服装配色，构图和文字不变':version.restoredFromVersion?`恢复修改前的第 ${version.restoredFromVersion} 版`:version.aiEdit?.prompt||'尺寸适配或画面调整';

export function fitAdHistoryPreviewSize(imageWidth,imageHeight,viewportWidth,viewportHeight){
  if(![imageWidth,imageHeight,viewportWidth,viewportHeight].every(value=>Number.isFinite(value)&&value>0))return null;
  const scale=Math.min(viewportWidth/imageWidth,viewportHeight/imageHeight);
  const width=imageWidth*scale,height=imageHeight*scale;
  return {width,height,left:Math.max(0,(viewportWidth-width)/2),top:Math.max(0,(viewportHeight-height)/2)};
}

export function renderAdVersionHistory(versions=[],options={}){
  const ordered=[...versions].sort((a,b)=>b.number-a.number),latest=ordered[0];
  const pending=options.pendingReview?'<div class="ad-history-review" role="status"><span>有新的 AI 修改候选尚未采用，下方显示的是此前保留的版本。</span><button type="button" class="button secondary" data-ad-tab="compose">查看新候选</button></div>':'';
  if(!latest)return `<section class="ad-history">${pending}<div class="ad-empty-preview">这个尺寸还没有保留方案，编辑稿仍可继续调整。</div></section>`;
  const current=options.draftDirty?null:latest.number;
  return `<section class="ad-history">${pending}<div class="ad-history-preview"><img id="ad-history-preview" src="${esc(imageUrl(latest.url))}" alt="第 ${latest.number} 版候选"></div><div class="ad-history-info" aria-live="polite"><div><b id="ad-history-label">第 ${latest.number} 版 · ${current?'当前保留方案':'历史预览'}</b><small id="ad-history-time">${esc(time(latest.createdAt))}</small><p id="ad-history-prompt">${esc(description(latest))}</p></div><a class="button secondary" id="ad-history-download" href="${esc(imageUrl(latest.url))}" download="${esc(latest.name)}">下载此版</a></div><div class="ad-history-thumbnails" aria-label="候选版本列表">${ordered.map(version=>`<div class="ad-history-tile"><button type="button" class="ad-history-card ${version===latest?'selected':''}" data-ad-history-version="${version.number}" aria-pressed="${version===latest}" aria-label="查看第 ${version.number} 版${version.number===current?'，当前保留方案':''}"><img loading="lazy" src="${esc(imageUrl(options.thumbnailBase?`${options.thumbnailBase}/versions/${version.number}/thumbnail`:version.thumbnailUrl||version.url))}" alt="第 ${version.number} 版缩略图"><span>第 ${version.number} 版${version.number===current?'<i>当前</i>':''}</span><small>${esc(time(version.createdAt))}</small></button><button type="button" class="ad-history-delete" data-ad-delete-version="${version.number}" title="删除第 ${version.number} 版" aria-label="删除第 ${version.number} 版">×</button></div>`).join('')}</div></section>`;
}

export function mountAdVersionHistory(root,versions,options={}){
  root.innerHTML=renderAdVersionHistory(versions,options);
  const current=versions.at(-1);
  const image=root.querySelector('#ad-history-preview'),viewport=root.querySelector('.ad-history-preview');
  const fit=()=>{
    if(!image||!viewport)return;
    const box=fitAdHistoryPreviewSize(image.naturalWidth,image.naturalHeight,viewport.clientWidth,viewport.clientHeight);
    if(box)Object.assign(image.style,Object.fromEntries(Object.entries(box).map(([key,value])=>[key,`${value}px`])));
  };
  let observer;if(viewport&&typeof ResizeObserver!=='undefined'){observer=new ResizeObserver(fit);observer.observe(viewport)}
  if(image){image.onload=fit;if(image.complete)fit()}
  for(const button of root.querySelectorAll('[data-ad-history-version]'))button.onclick=()=>{
    const version=versions.find(entry=>entry.number===Number(button.dataset.adHistoryVersion));if(!version)return;
    const image=root.querySelector('#ad-history-preview');image.src=imageUrl(version.url);image.alt=`第 ${version.number} 版候选`;
    root.querySelector('#ad-history-label').textContent=`第 ${version.number} 版${!options.draftDirty&&version.number===current.number?' · 当前保留方案':' · 历史预览'}`;
    root.querySelector('#ad-history-time').textContent=time(version.createdAt);
    root.querySelector('#ad-history-prompt').textContent=description(version);
    const download=root.querySelector('#ad-history-download');download.href=imageUrl(version.url);download.download=version.name||'';
    for(const card of root.querySelectorAll('[data-ad-history-version]')){const selected=card===button;card.classList.toggle('selected',selected);card.setAttribute('aria-pressed',String(selected))}
  };
  for(const button of root.querySelectorAll('[data-ad-delete-version]'))button.onclick=async event=>{
    event.preventDefault();event.stopPropagation();if(button.disabled||!options.onDelete)return;
    button.disabled=true;
    try{await options.onDelete(Number(button.dataset.adDeleteVersion))}catch(error){options.onError?.(error)}finally{button.disabled=false}
  };
  return ()=>{observer?.disconnect();if(image)image.onload=null};
}
