export async function openCommunityCutoutEditor({sourceUrl,maskUrl,save}){
 const dialog=document.createElement('dialog');dialog.className='community-cutout-editor';
 dialog.innerHTML='<header><h3>检查与修边</h3><button type="button" data-close aria-label="关闭">×</button></header><nav><button type="button" data-tool="restore" class="active">补回</button><button type="button" data-tool="erase">擦除</button><label>画笔大小<input type="range" min="2" max="180" value="18" data-brush></label><button type="button" data-undo disabled>撤销</button><label>缩放<select data-zoom><option value="1">适合窗口</option><option value="1.5">150%</option><option value="2">200%</option><option value="3">300%</option></select></label><select data-background aria-label="预览底色"><option value="checker">透明棋盘</option><option value="white">白底</option><option value="dark">深色底</option></select><label><input type="checkbox" data-original>对照原图</label></nav><p>补回原图中被误删的部位，擦除残留背景；放大后检查发梢和手持道具。</p><div class="community-cutout-edit-stage"><canvas></canvas></div><p data-message role="status" aria-live="polite">正在加载原图与抠图…</p><footer><button type="button" class="button secondary" data-close>取消</button><button type="button" class="button primary" data-save disabled>保存修整</button></footer>';
 document.body.append(dialog);dialog.showModal();
 return new Promise(resolve=>{
  const canvas=dialog.querySelector('canvas'),ctx=canvas.getContext('2d'),mask=document.createElement('canvas'),maskCtx=mask.getContext('2d'),cutout=document.createElement('canvas'),cutoutCtx=cutout.getContext('2d'),stage=dialog.querySelector('.community-cutout-edit-stage'),message=dialog.querySelector('[data-message]'),submit=dialog.querySelector('[data-save]'),undo=dialog.querySelector('[data-undo]'),original=dialog.querySelector('[data-original]');
  const source=new Image(),initial=new Image(),strokes=[];let loaded=false,closed=false,busy=false,tool='restore',stroke,cursor,fitWidth=0;
  const close=result=>{if(busy||closed)return;closed=true;dialog.close();dialog.remove();resolve(result);};dialog.querySelectorAll('[data-close]').forEach(button=>button.onclick=()=>close(null));dialog.oncancel=event=>{event.preventDefault();close(null);};
  const notice=(text,error=false)=>{message.textContent=text;message.classList.toggle('is-error',error);};
  const paint=(value,from,to)=>{
   const radius=value.radius*Math.min(mask.width,mask.height);maskCtx.globalCompositeOperation=value.tool==='restore'?'source-over':'destination-out';maskCtx.fillStyle='#fff';maskCtx.strokeStyle='#fff';maskCtx.lineWidth=radius*2;maskCtx.lineCap=maskCtx.lineJoin='round';
   maskCtx.beginPath();if(!from){maskCtx.arc(to.x*mask.width,to.y*mask.height,radius,0,Math.PI*2);maskCtx.fill();}else{maskCtx.moveTo(from.x*mask.width,from.y*mask.height);maskCtx.lineTo(to.x*mask.width,to.y*mask.height);maskCtx.stroke();}maskCtx.globalCompositeOperation='source-over';
  };
  const redraw=()=>{
   if(!loaded)return;cutoutCtx.clearRect(0,0,canvas.width,canvas.height);cutoutCtx.globalCompositeOperation='source-over';cutoutCtx.drawImage(source,0,0,canvas.width,canvas.height);cutoutCtx.globalCompositeOperation='destination-in';cutoutCtx.drawImage(mask,0,0);cutoutCtx.globalCompositeOperation='source-over';
   ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(original.checked?source:cutout,0,0,canvas.width,canvas.height);
   if(cursor&&!busy){ctx.beginPath();ctx.arc(cursor.x*canvas.width,cursor.y*canvas.height,Number(dialog.querySelector('[data-brush]').value)/1000*Math.min(canvas.width,canvas.height),0,Math.PI*2);ctx.lineWidth=2;ctx.strokeStyle=tool==='restore'?'#21af8b':'#ec6377';ctx.stroke();}
   submit.disabled=busy||!strokes.length;undo.disabled=busy||!strokes.length;
  };
  const replay=()=>{maskCtx.clearRect(0,0,mask.width,mask.height);maskCtx.drawImage(initial,0,0,mask.width,mask.height);for(const s of strokes)for(let i=0;i<s.points.length;i++)paint(s,i?s.points[i-1]:null,s.points[i]);redraw();};
  dialog.querySelectorAll('[data-tool]').forEach(button=>button.onclick=()=>{tool=button.dataset.tool;dialog.querySelectorAll('[data-tool]').forEach(b=>b.classList.toggle('active',b===button));redraw();});
  undo.onclick=()=>{if(busy)return;strokes.pop();replay();notice(strokes.length?'已撤销上一笔':'已恢复最初的抠图');};
  dialog.querySelector('[data-brush]').oninput=redraw;original.onchange=redraw;
  dialog.querySelector('[data-background]').onchange=event=>{stage.dataset.background=event.target.value;};
  dialog.querySelector('[data-zoom]').onchange=event=>{canvas.style.width=Math.round(fitWidth*Number(event.target.value))+'px';};
  const coordinate=event=>{const rect=canvas.getBoundingClientRect();return {x:Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width)),y:Math.max(0,Math.min(1,(event.clientY-rect.top)/rect.height))};};
  canvas.onpointerdown=event=>{
   if(!loaded||busy||event.button!==0)return;event.preventDefault();if(strokes.length>=200){notice('最多修整 200 笔，请先保存',true);return;}
   original.checked=false;cursor=coordinate(event);stroke={tool,radius:Number(dialog.querySelector('[data-brush]').value)/1000,points:[cursor]};strokes.push(stroke);canvas.setPointerCapture(event.pointerId);paint(stroke,null,cursor);notice(tool==='restore'?'正在补回原图细节':'正在擦除背景');redraw();
  };
  canvas.onpointermove=event=>{
   if(!loaded||busy)return;cursor=coordinate(event);if(stroke){const from=stroke.points.at(-1);if(stroke.points.length<4000){stroke.points.push(cursor);paint(stroke,from,cursor);}}redraw();
  };
  const finish=()=>{if(!stroke)return;stroke=null;notice('检查完成后保存修整，原素材会保留在历史版本中');redraw();};canvas.onpointerup=finish;canvas.onpointercancel=finish;canvas.onpointerleave=()=>{if(!stroke){cursor=null;redraw();}};
  submit.onclick=async()=>{
   if(!loaded||busy||!strokes.length)return;busy=true;dialog.querySelectorAll('button,input,select').forEach(e=>{e.disabled=true;});notice('正在保存原图像素与修整后的透明区域…');
   try{const result=await save(strokes.map(s=>({...s,points:s.points.map(p=>({...p}))})));busy=false;close(result);}
   catch(error){busy=false;dialog.querySelectorAll('button,input,select').forEach(e=>{e.disabled=false;});notice(error.message,true);redraw();}
  };
  const imageReady=image=>new Promise((done,fail)=>{image.onload=done;image.onerror=()=>fail(Error('原图或抠图加载失败，请关闭后重试'));});
  const ready=Promise.all([imageReady(source),imageReady(initial)]);source.src=sourceUrl;initial.src=maskUrl;
  ready.then(()=>{if(closed)return;if(source.naturalWidth!==initial.naturalWidth||source.naturalHeight!==initial.naturalHeight)throw Error('抠图与原图未对齐，未修改素材');const width=Math.min(1400,source.naturalWidth),height=Math.round(width*source.naturalHeight/source.naturalWidth);for(const c of [canvas,mask,cutout]){c.width=width;c.height=height;}fitWidth=Math.min(width,stage.clientWidth-2);canvas.style.width=fitWidth+'px';loaded=true;replay();notice('请选择补回或擦除，拖动画笔修整');}).catch(error=>{if(!closed)notice(error.message,true);});
 });
}
