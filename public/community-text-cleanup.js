import {TextEraseDocument,textEraseImagePoint,validateEraseStrokes} from './text-erase.js?v=20261021-text-cleanup';

export function renderTextCleanupTool(kind,asset,{disabled=false}={}){
 if(!['title','subtitle'].includes(kind)||!asset?.mime?.startsWith('image/'))return '';
 return `<section class="text-cleanup-tool"><h4>文案工具</h4><button type="button" id="community-cleanup-text" ${disabled?'disabled':''}><span aria-hidden="true">▱</span> 擦除杂点</button></section>`;
}

export async function openCommunityTextCleanup({asset,kind,anchor,onSave}){
 const image=await createImageBitmap(await fetch(asset.url,{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('文案素材读取失败');return r.blob();}));
 const dialog=document.createElement('dialog');dialog.className='text-cleanup-dialog';dialog.setAttribute('aria-label','擦除文案杂点');
 dialog.innerHTML=`<header><h3>清理文案 · ${kind==='title'?'主标':'副标'}</h3><button type="button" data-cleanup-close>返回组合预览</button></header>
 <p class="text-cleanup-hint">只擦除多余像素，保留原有字形与材质</p>
 <div class="text-cleanup-viewport" tabindex="0" aria-label="文案清理画布"><div class="text-cleanup-mat"><canvas tabindex="0" aria-label="按住鼠标拖动擦除，空格可移动画布"></canvas></div><div class="text-cleanup-cursor" hidden></div></div>
 <div class="text-cleanup-toolbar"><button type="button" data-cleanup-tool="erase" class="active">▱ 橡皮擦</button><button type="button" data-cleanup-tool="hand">移动</button><label>画笔大小 <input data-cleanup-brush type="range" min="2" max="200" value="24"><output>24 px</output></label><button type="button" data-cleanup-undo>↶ 撤销</button><button type="button" data-cleanup-redo>↷ 重做</button><button type="button" data-cleanup-compare>按住对比原图</button><button type="button" data-cleanup-zoom="out" aria-label="缩小">−</button><button type="button" data-cleanup-zoom="fit">适应</button><b data-cleanup-zoom-value></b><button type="button" data-cleanup-zoom="in" aria-label="放大">＋</button></div>
 <p class="text-cleanup-error" role="alert" hidden></p><footer><span>原素材保留</span><button type="button" class="button ghost" data-cleanup-close>取消</button><button type="button" class="button primary" data-cleanup-save>另存为新版本</button></footer>`;
 document.body.append(dialog);
 const $=s=>dialog.querySelector(s),canvas=$('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true}),viewport=$('.text-cleanup-viewport'),mat=$('.text-cleanup-mat'),cursor=$('.text-cleanup-cursor');
 canvas.width=image.width;canvas.height=image.height;ctx.drawImage(image,0,0);image.close();
 const original=ctx.getImageData(0,0,canvas.width,canvas.height),model=new TextEraseDocument(original.data,canvas.width,canvas.height),edited=new ImageData(model.data,canvas.width,canvas.height);
 let brush=24,zoom=1,tool='erase',space=false,comparing=false,saving=false,pointer=null,pan=null,lastSignature='',requestId='';
 const error=message=>{const e=$('.text-cleanup-error');e.hidden=!message;e.textContent=message;};
 const controls=()=>{
  $('[data-cleanup-undo]').disabled=saving||!model.strokes.length;$('[data-cleanup-redo]').disabled=saving||!model.redos.length;
  $('[data-cleanup-save]').disabled=saving||!model.strokes.length;
  dialog.querySelectorAll('[data-cleanup-tool]').forEach(b=>b.classList.toggle('active',b.dataset.cleanupTool===tool));
  canvas.style.cursor=tool==='hand'||space?'grab':'none';
 };
 const paint=box=>{if(!box||comparing)return;ctx.putImageData(edited,0,0,box.left,box.top,box.right-box.left,box.bottom-box.top);};
 const layout=()=>{
  const fit=Math.min((viewport.clientWidth-48)/canvas.width,(viewport.clientHeight-48)/canvas.height,1),scale=Math.max(.005,fit)*zoom;
  canvas.style.width=canvas.width*scale+'px';canvas.style.height=canvas.height*scale+'px';
  mat.style.width=Math.max(viewport.clientWidth,canvas.width*scale+48)+'px';mat.style.height=Math.max(viewport.clientHeight,canvas.height*scale+48)+'px';
  $('[data-cleanup-zoom-value]').textContent=Math.round(scale*100)+'%';cursor.hidden=true;
 };
 const position=()=>{
  const r=anchor?.isConnected?anchor.getBoundingClientRect():null,fit=r&&r.width>620&&r.height>400;
  Object.assign(dialog.style,{left:fit?r.left+'px':'3vw',top:fit?r.top+'px':'4vh',width:fit?r.width+'px':'94vw',height:fit?r.height+'px':'92vh'});layout();
 };
 const point=e=>textEraseImagePoint(e.clientX,e.clientY,canvas.getBoundingClientRect(),canvas.width,canvas.height);
 const showCursor=e=>{
  if(tool!=='erase'||space||saving||comparing||(e.target!==canvas&&pointer!==e.pointerId)){cursor.hidden=true;return;}
  const r=viewport.getBoundingClientRect(),scale=canvas.getBoundingClientRect().width/canvas.width,size=Math.max(4,brush*scale);
  Object.assign(cursor.style,{left:e.clientX-r.left+viewport.scrollLeft+'px',top:e.clientY-r.top+viewport.scrollTop+'px',width:size+'px',height:size+'px'});cursor.hidden=false;
 };
 const finish=()=>{if(pointer===null)return;model.end();pointer=null;pan=null;controls();};
 const compare=value=>{comparing=value;ctx.putImageData(value?original:edited,0,0);$('[data-cleanup-compare]').classList.toggle('active',value);cursor.hidden=true;};
 const setZoom=(value,e)=>{
  const anchorPoint=e?{x:e.clientX,y:e.clientY}:{x:viewport.getBoundingClientRect().left+viewport.clientWidth/2,y:viewport.getBoundingClientRect().top+viewport.clientHeight/2},p=textEraseImagePoint(anchorPoint.x,anchorPoint.y,canvas.getBoundingClientRect(),canvas.width,canvas.height);
  zoom=Math.max(.25,Math.min(16,value));layout();const r=canvas.getBoundingClientRect();viewport.scrollLeft+=r.left+p.x/canvas.width*r.width-anchorPoint.x;viewport.scrollTop+=r.top+p.y/canvas.height*r.height-anchorPoint.y;
 };
 return new Promise(resolve=>{
  const close=result=>{if(saving)return;observer.disconnect();window.removeEventListener('resize',position);window.removeEventListener('pointerup',releaseCompare);window.removeEventListener('blur',resetTransient);dialog.close();dialog.remove();resolve(result);};
  const releaseCompare=()=>{if(comparing)compare(false);};
  const resetTransient=()=>{finish();space=false;releaseCompare();controls();};
  const undo=()=>{if(saving)return;finish();model.undo();compare(false);controls();};
  const redo=()=>{if(saving)return;finish();model.redo();compare(false);controls();};
  const save=async()=>{
   finish();if(saving||!model.strokes.length)return;
   try{
    validateEraseStrokes(model.strokes,canvas.width,canvas.height);const strokes=structuredClone(model.strokes),signature=JSON.stringify(strokes);
    if(signature!==lastSignature){requestId=crypto.randomUUID();lastSignature=signature;}
    saving=true;error('');dialog.querySelectorAll('button,input').forEach(e=>e.disabled=true);$('[data-cleanup-save]').textContent='正在保存…';cursor.hidden=true;
    const saved=await onSave(strokes,requestId);saving=false;close({saved});
   }catch(e){saving=false;dialog.querySelectorAll('button,input').forEach(e=>e.disabled=false);$('[data-cleanup-save]').textContent='另存为新版本';error(e.message||'保存失败，擦除操作仍保留，可重试');controls();}
  };
  dialog.querySelectorAll('[data-cleanup-close]').forEach(b=>b.addEventListener('click',()=>close(null)));
  dialog.addEventListener('cancel',e=>{e.preventDefault();close(null);});
  $('[data-cleanup-save]').addEventListener('click',save);$('[data-cleanup-undo]').addEventListener('click',undo);$('[data-cleanup-redo]').addEventListener('click',redo);
  dialog.querySelectorAll('[data-cleanup-tool]').forEach(b=>b.addEventListener('click',()=>{finish();tool=b.dataset.cleanupTool;cursor.hidden=true;controls();}));
  $('[data-cleanup-brush]').addEventListener('input',e=>{brush=Number(e.target.value);$('output').textContent=brush+' px';cursor.hidden=true;});
  dialog.querySelectorAll('[data-cleanup-zoom]').forEach(b=>b.addEventListener('click',()=>setZoom(b.dataset.cleanupZoom==='fit'?1:zoom*(b.dataset.cleanupZoom==='in'?1.25:.8))));
  $('[data-cleanup-compare]').addEventListener('pointerdown',e=>{if(saving)return;e.preventDefault();finish();compare(true);});
  $('[data-cleanup-compare]').addEventListener('keydown',e=>{if(['Space','Enter'].includes(e.code)){e.preventDefault();compare(true);}});
  $('[data-cleanup-compare]').addEventListener('keyup',releaseCompare);
  viewport.addEventListener('pointerdown',e=>{
   if(saving||comparing||e.button!==0)return;if(tool!=='hand'&&!space&&e.target!==canvas)return;
   e.preventDefault();error('');canvas.focus({preventScroll:true});pointer=e.pointerId;viewport.setPointerCapture(pointer);
   if(tool==='hand'||space){pan={x:e.clientX,y:e.clientY,left:viewport.scrollLeft,top:viewport.scrollTop};cursor.hidden=true;return;}
   try{paint(model.begin(point(e),brush/2));showCursor(e);}catch(err){finish();error(err.message);}
  });
  viewport.addEventListener('pointermove',e=>{
   showCursor(e);if(pointer!==e.pointerId||saving)return;
   if(pan){viewport.scrollLeft=pan.left+pan.x-e.clientX;viewport.scrollTop=pan.top+pan.y-e.clientY;return;}
   try{paint(model.append(point(e)));}catch(err){finish();error(err.message);}
  });
  viewport.addEventListener('pointerup',finish);viewport.addEventListener('pointercancel',finish);viewport.addEventListener('lostpointercapture',finish);
  viewport.addEventListener('pointerleave',()=>cursor.hidden=true);
  viewport.addEventListener('wheel',e=>{if(e.ctrlKey||e.metaKey){e.preventDefault();setZoom(zoom*(e.deltaY<0?1.15:1/1.15),e);}},{passive:false});
  dialog.addEventListener('keydown',e=>{
   e.stopPropagation();if(saving)return;
   if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?redo():undo();}
   else if((e.ctrlKey||e.metaKey)&&['s','Enter'].includes(e.key)){e.preventDefault();void save();}
   else if(e.code==='Space'&&!['INPUT','BUTTON'].includes(e.target.tagName)){e.preventDefault();space=true;cursor.hidden=true;controls();}
  });
  dialog.addEventListener('keyup',e=>{e.stopPropagation();if(e.code==='Space'){space=false;controls();}});
  const observer=new ResizeObserver(layout);observer.observe(viewport);window.addEventListener('resize',position);window.addEventListener('pointerup',releaseCompare);window.addEventListener('blur',resetTransient);
  dialog.showModal();position();controls();canvas.focus({preventScroll:true});
 });
}
