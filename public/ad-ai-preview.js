import {isAdImageUrl} from './ad-image-url.js?v=20261022-ai-preview';

export function createAdAiPreview({root,onState=()=>{}}){
 let state={status:'idle',url:''},request=0,disposed=false,options={},image,message;
 const announce=(status,url)=>{state={status,url};onState(state);};
 const show=(url,nextOptions={},force=false)=>{
  if(disposed)return state;
  options=nextOptions;
  const stage=root.querySelector('#ad-stage');if(!stage)return state;
  const caption=root.querySelector('.ad-stage-caption>span');if(caption)caption.textContent=options.caption||'AI 候选预览 · 尚未采用';
  if(state.url===url&&!force)return state;
  const token=++request;
  image=stage.querySelector('#ad-stage-final');
  if(!image){image=document.createElement('img');image.id='ad-stage-final';image.className='ad-stage-final';stage.insertBefore(image,stage.querySelector('.ad-safe'));}
  message??=document.createElement('div');message.className='ad-preview-status';message.setAttribute('role','status');
  if(!message.parentElement)stage.append(message);
  const fail=()=>{
   if(disposed||token!==request)return;
   image.hidden=true;message.hidden=false;message.textContent='预览图片加载失败，原稿未改变。';
   const retry=document.createElement('button');retry.type='button';retry.className='button secondary';retry.textContent='重新加载预览';retry.onclick=()=>show(url,options,true);message.append(retry);announce('failed',url);
  };
  image.onload=()=>{if(disposed||token!==request)return;image.hidden=false;message.hidden=true;announce('ready',url);};
  image.onerror=fail;image.hidden=true;message.hidden=false;message.textContent='正在加载预览…';announce('loading',url);
  if(!isAdImageUrl(url)){fail();return state;}
  image.alt=options.alt||'AI 候选预览，尚未采用';image.src=url;
  if(image.complete&&image.naturalWidth>0)image.onload();
  return state;
 };
 return {show,get state(){return state},dispose(){disposed=true;request++;if(image){image.onload=null;image.onerror=null}message?.remove();}};
}
