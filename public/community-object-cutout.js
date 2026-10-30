const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function openCommunityObjectCutout({url,title='提取当前稿人物',minKeepPoints=1,save}){
 const dialog=document.createElement('dialog');dialog.className='community-object-cutout';
 dialog.innerHTML=`<header><h3>${esc(title)}</h3><button type="button" data-close aria-label="关闭">×</button></header><nav><button type="button" data-tool="box" class="active" aria-pressed="true">框选主体</button><button type="button" data-tool="keep" aria-pressed="false">保留选点</button><button type="button" data-tool="remove" aria-pressed="false">排除选点</button><button type="button" data-reset>重置</button></nav><p>框住要提取的主体，再点击要保留的部位；排除选点可避开背景。</p><div class="community-object-cutout-stage"><canvas tabindex="0" aria-label="抠图选区"></canvas></div><p data-message role="status" aria-live="polite">正在加载当前画面…</p><footer><button type="button" class="button secondary" data-close>取消</button><button type="button" class="button primary" data-save disabled>开始提取</button></footer>`;
 document.body.append(dialog);dialog.showModal();
 return new Promise(resolve=>{
  const canvas=dialog.querySelector('canvas'),ctx=canvas.getContext('2d'),message=dialog.querySelector('[data-message]'),submit=dialog.querySelector('[data-save]');let image=new Image(),mode='box',box=[.02,.02,.98,.98],points=[],drag,busy=false,closed=false,loaded=false;
  const keepCount=()=>points.filter(point=>point.label===1).length;
  const showMessage=(text,error=false)=>{message.textContent=text;message.classList.toggle('is-error',error);};
  const selectionHint=()=>{
   if(!loaded||busy)return;const count=keepCount(),progress=`保留点 ${count}/${minKeepPoints}`;
   if(mode==='remove'){showMessage(`点击要排除的背景（${progress}）`);return;}
   if(count<minKeepPoints)showMessage(`${mode==='box'?'框住主体后，':''}${minKeepPoints>1?'在人物脸部和身体各点一下':'点击主体内部添加保留点'}（${progress}）`);
   else showMessage(`选区已就绪，可以开始提取（${progress}）`);
  };
  const close=result=>{if(busy||closed)return;closed=true;image.onload=image.onerror=null;dialog.close();dialog.remove();resolve(result);};
  dialog.querySelectorAll('[data-close]').forEach(button=>button.onclick=()=>close(null));dialog.addEventListener('cancel',event=>{event.preventDefault();close(null);});
  const setTool=value=>{mode=value;dialog.querySelectorAll('[data-tool]').forEach(button=>{const active=button.dataset.tool===value;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});selectionHint();};
  const redraw=()=>{
   if(!image.naturalWidth)return;ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);const [x1,y1,x2,y2]=box.map((n,i)=>n*(i%2?canvas.height:canvas.width));
   ctx.fillStyle='#16223566';ctx.fillRect(0,0,canvas.width,y1);ctx.fillRect(0,y2,canvas.width,canvas.height-y2);ctx.fillRect(0,y1,x1,y2-y1);ctx.fillRect(x2,y1,canvas.width-x2,y2-y1);ctx.strokeStyle='#9676ff';ctx.lineWidth=Math.max(2,canvas.width/500);ctx.strokeRect(x1,y1,x2-x1,y2-y1);
   for(const point of points){ctx.beginPath();ctx.arc(point.x*canvas.width,point.y*canvas.height,Math.max(5,canvas.width/180),0,Math.PI*2);ctx.fillStyle=point.label?'#17b482':'#fa606d';ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=Math.max(2,canvas.width/700);ctx.stroke();}
   // Keep validation actionable: a click explains missing selections rather than silently doing nothing.
   submit.disabled=busy||!loaded;submit.textContent=busy?'正在提交…':'开始提取';
  };
  dialog.querySelectorAll('[data-tool]').forEach(button=>button.onclick=()=>setTool(button.dataset.tool));dialog.querySelector('[data-reset]').onclick=()=>{points=[];box=[.02,.02,.98,.98];setTool('box');redraw();};
  const coordinate=event=>{const rect=canvas.getBoundingClientRect();return {x:Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width)),y:Math.max(0,Math.min(1,(event.clientY-rect.top)/rect.height))};};
  canvas.onpointerdown=event=>{
   if(busy||!image.naturalWidth||event.button!==0)return;const point=coordinate(event);event.preventDefault();
   if(mode==='box'){drag=point;canvas.setPointerCapture(event.pointerId);}
   else if(point.x>=box[0]&&point.x<=box[2]&&point.y>=box[1]&&point.y<=box[3]){if(points.length>=12){showMessage('最多添加 12 个选点',true);return;}points.push({...point,label:mode==='keep'?1:0});selectionHint();redraw();}
   else showMessage('请在紫色选框内添加选点',true);
  };
  canvas.onpointermove=event=>{if(!drag)return;const point=coordinate(event);box=[Math.min(point.x,drag.x),Math.min(point.y,drag.y),Math.max(point.x,drag.x),Math.max(point.y,drag.y)];redraw();};
  const finish=()=>{if(!drag)return;drag=null;points=points.filter(p=>p.x>=box[0]&&p.x<=box[2]&&p.y>=box[1]&&p.y<=box[3]);setTool('keep');redraw();};canvas.onpointerup=finish;canvas.onpointercancel=()=>{drag=null;};
  submit.onclick=async()=>{
   if(busy||!loaded)return;if(box[2]-box[0]<.02||box[3]-box[1]<.02){setTool('box');showMessage('选框太小，请重新框选',true);return;}
   if(keepCount()<minKeepPoints){setTool('keep');showMessage(`${minKeepPoints>1?'请先在人物脸部和身体各点一下':'请先点击主体内部添加保留点'}（保留点 ${keepCount()}/${minKeepPoints}）`,true);canvas.focus({preventScroll:true});return;}
   busy=true;dialog.querySelectorAll('button').forEach(b=>{b.disabled=true;});submit.textContent='正在提交…';showMessage('正在提交抠图选区…');
   try{const result=await save({box:[...box],points:points.map(p=>({...p}))});busy=false;close(result);}
   catch(error){busy=false;dialog.querySelectorAll('button').forEach(b=>{b.disabled=false;});showMessage(error.message,true);redraw();}
  };
  image.onload=()=>{if(closed)return;loaded=true;canvas.width=Math.min(1600,image.naturalWidth);canvas.height=Math.round(canvas.width*image.naturalHeight/image.naturalWidth);selectionHint();redraw();};image.onerror=()=>{if(closed)return;loaded=false;submit.disabled=true;showMessage('画面加载失败，请关闭后重试',true);};image.src=url;
 });
}
