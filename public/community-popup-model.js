// Shared by the editor and server. An opt-in flag keeps existing 500×650 drafts unchanged.
export const COMMUNITY_POPUP_ID='community-community-popup';
export const isCommunityPopup=template=>template?.id===COMMUNITY_POPUP_ID;
export const popupConfig=(task,template)=>isCommunityPopup(template)&&task.parameters?.communityPopupByTemplate?.[template.id]?.version===1?task.parameters.communityPopupByTemplate[template.id]:null;
export const popupSnapshotKeys=['assetByTemplate','layoutByTemplate','backgroundByTemplate','communityArtworkByTemplate','communityTargetRevisions','communityObjectLayersByTemplate','communityPopupByTemplate','communityPopupNativeByTemplate'];
export function popupNativeCopy(task){return Object.fromEntries(['title','subtitle'].map(k=>[k,{text:String(k==='title'?task.copy||'':task.parameters?.subtitleText||''),fontId:task.parameters?.[k+'FontId']||'',fontAsset:task.parameters?.[k+'FontAsset']||''}]));}
export function popupDefaults(){return {version:1,shape:'circle',frame:{x:30,y:78,width:440,height:440},clipCharacterBottom:true,outline:false,outlineColor:'#ad8bff',buttonVisible:true,buttonLabel:'立即去玩',buttonColor:'#7258ee',buttonFontId:'',buttonBackingAsset:'',masterFingerprint:''};}
export function normalizePopupConfig(value={}){
 const c={...popupDefaults(),...value,version:1,frame:{...popupDefaults().frame,...value.frame}};
 if(!['circle','ellipse','asset','none'].includes(c.shape))throw Error('请选择有效的弹窗背景形状');
 for(const k of ['x','y','width','height'])if(!Number.isFinite(c.frame[k]))throw Error('背景轮廓的位置和尺寸无效');
 if(c.frame.width<50||c.frame.height<50||c.frame.x<0||c.frame.y<0||c.frame.x+c.frame.width>500||c.frame.y+c.frame.height>650)throw Error('背景轮廓必须位于 500×650 画布内，宽高至少 50 px');
 if(c.shape==='circle')c.frame.height=c.frame.width;
 if(c.frame.y+c.frame.height>650)throw Error('圆形背景超出画布，请调整位置或大小');
 if(!/^#[\da-f]{6}$/i.test(c.buttonColor)||!/^#[\da-f]{6}$/i.test(c.outlineColor))throw Error('颜色格式无效');
 const outlineWidth=c.outlineWidth??2;if(!Number.isFinite(outlineWidth)||outlineWidth<1||outlineWidth>20)throw Error('描边粗细请设置为 1–20 px');
 let buttonLayout;
 if(c.buttonLayout){buttonLayout=Object.fromEntries(['x','y','width','height'].map(k=>[k,c.buttonLayout[k]]));if(Object.values(buttonLayout).some(v=>!Number.isFinite(v))||buttonLayout.width<20||buttonLayout.height<10||buttonLayout.x<0||buttonLayout.y<0||buttonLayout.x+buttonLayout.width>500.01||buttonLayout.y+buttonLayout.height>650.01)throw Error('按钮必须位于 500×650 画布内');}
 c.buttonLabel=String(c.buttonLabel??'').trim();if(c.buttonLabel.length>16||c.buttonVisible&&!c.buttonLabel)throw Error('按钮文案请填写 1–16 个字');
 const buttonFontId=String(c.buttonFontId||''),buttonBackingAsset=String(c.buttonBackingAsset||'');
 const buttonFontSize=c.buttonFontSize;
 let buttonTextPosition;
 if(c.buttonTextPosition!=null){
  const {x,y}=c.buttonTextPosition;
  if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||x>500||y<0||y>650)throw Error('按钮文字中心必须位于 500×650 画布内');
  buttonTextPosition={x,y};
 }
 if(buttonFontSize!==undefined&&buttonFontSize!==null&&(!Number.isFinite(buttonFontSize)||buttonFontSize<8||buttonFontSize>120))throw Error('按钮文字大小请设置为 8–120 px');
 if(buttonFontId.length>200||buttonBackingAsset.length>255||/[\x00-\x1f]/.test(buttonFontId+buttonBackingAsset))throw Error('按钮素材或字体无效');
 return {version:1,shape:c.shape,frame:c.frame,clipCharacterBottom:value.clipCharacterBottom===true,outline:!!c.outline,outlineColor:c.outlineColor,outlineWidth,buttonVisible:!!c.buttonVisible,buttonLabel:c.buttonLabel,buttonColor:c.buttonColor,buttonFontId,buttonBackingAsset,...(buttonFontSize!=null?{buttonFontSize}:{}),...(buttonTextPosition?{buttonTextPosition}:{}),...(buttonLayout?{buttonLayout}:{}),masterFingerprint:String(c.masterFingerprint||'')};
}
export const popupBoxes={character:[.06,.06,.88,.62],character2:[.50,.17,.46,.49],foreground:[.02,.29,.96,.40],title:[.04,.59,.92,.18],subtitle:[.07,.77,.86,.045],logo:[.68,.035,.26,.09],'ip-copyright':[.63,.95,.33,.025],button:[.20,.855,.60,.088]};
export function popupLayerBox(kind){const b=popupBoxes[kind]||popupBoxes.character;return {x:b[0]*500,y:b[1]*650,width:b[2]*500,height:b[3]*650,visible:true};}
export function fitPopupLayer(kind,asset,original={}){
 const box=popupLayerBox(kind),source=asset?.alphaBounds||{x:0,y:0,width:asset?.width||original.width||box.width,height:asset?.height||original.height||box.height};
 const scale=Math.min(box.width/source.width,box.height/source.height),width=(asset?.width||source.width)*scale,height=(asset?.height||source.height)*scale;
 const result={...structuredClone(original),x:box.x+(box.width-source.width*scale)/2-(source.x||0)*scale,y:box.y+(box.height-source.height*scale)/2-(source.y||0)*scale,width,height,scaleBaseWidth:width,scaleBaseHeight:height,visible:original.visible!==false};
 if(result.effects&&original.width){const ratio=width/original.width;if(result.effects.stroke?.width)result.effects.stroke.width*=ratio;for(const k of ['blur','offsetX','offsetY'])if(result.effects.shadow?.[k])result.effects.shadow[k]*=ratio;}
 return result;
}
export function tracePopupFrame(ctx,c){const r=c.frame;ctx.beginPath();ctx.ellipse(r.x+r.width/2,r.y+r.height/2,r.width/2,r.height/2,0,0,Math.PI*2);}
// The upper half may break out of the frame; the lower body stays inside it.
// Opt-in on saved configurations keeps restored historical renders unchanged.
export function clipPopupCharacterBottom(ctx,c,width=500){
 if(!c?.clipCharacterBottom||!['circle','ellipse'].includes(c.shape))return;
 const r=c.frame,cy=r.y+r.height/2;
 ctx.beginPath();ctx.rect(0,0,width,cy);ctx.moveTo(r.x+r.width,cy);ctx.ellipse(r.x+r.width/2,cy,r.width/2,r.height/2,0,0,Math.PI*2);ctx.clip();
}
export function drawPopupBackground(ctx,c,image,placement={}){
 if(c.shape==='none')return;
 if(!image)throw Error('弹窗背景尚未加载，请重新选择背景素材');
 const r=c.frame,w=image.naturalWidth||image.width,h=image.naturalHeight||image.height;
 ctx.save();
 if(c.shape!=='asset'){tracePopupFrame(ctx,c);ctx.clip();}
 const scale=(c.shape==='asset'?Math.min:Math.max)(r.width/w,r.height/h)*Number(placement.scale||100)/100;
 const dw=w*scale,dh=h*scale;
 ctx.drawImage(image,r.x+(r.width-dw)*Number(placement.focalX??50)/100,r.y+(r.height-dh)*Number(placement.focalY??50)/100,dw,dh);
 ctx.restore();
 drawPopupOutline(ctx,c);
}
export function drawPopupOutline(ctx,c){if(c?.outline&&['circle','ellipse'].includes(c.shape)){ctx.save();tracePopupFrame(ctx,c);ctx.strokeStyle=c.outlineColor;ctx.lineWidth=c.outlineWidth??2;ctx.stroke();ctx.restore();}}
export function popupButtonRect(c,layout,image){
 const box=c.buttonLayout||layout;if(!image)return {...box};
 const w=image.naturalWidth||image.width,h=image.naturalHeight||image.height,scale=Math.min(box.width/w,box.height/h);
 return {...box,x:box.x+(box.width-w*scale)/2,y:box.y+(box.height-h*scale)/2,width:w*scale,height:h*scale};
}
export function popupButtonBaseFontSize(c,layout,image){return Number.isFinite(c.buttonFontSize)?c.buttonFontSize:Math.min(32,popupButtonRect(c,layout,image).height*.52);}
export function popupButtonTextCenter(c,layout,image){const r=popupButtonRect(c,layout,image);return c.buttonTextPosition||{x:r.x+r.width/2,y:r.y+r.height/2};}
// A native text layer: decorated PNG bounds only determine the legacy default.
// Once positioned, lettering keeps its own canvas anchor across backing changes.
export function popupButtonTextBox(ctx,c,layout,{image,fontFamily}={}){
 const rect=popupButtonRect(c,layout,image),center=popupButtonTextCenter(c,layout,image);
 let size=popupButtonBaseFontSize(c,layout,image);
 const family=fontFamily?`400 SIZEpx "${fontFamily}"`:'700 SIZEpx "Microsoft YaHei",sans-serif';
 ctx.save();ctx.font=family.replace('SIZE',size);
 while(!Number.isFinite(c.buttonFontSize)&&ctx.measureText(c.buttonLabel).width>rect.width*.86&&size>9){size--;ctx.font=family.replace('SIZE',size);}
 const width=Math.max(1,ctx.measureText(c.buttonLabel).width),height=size*1.2,font=ctx.font;ctx.restore();
 return {x:center.x-width/2,y:center.y-height/2,width,height,fontSize:size,font,visible:!!c.buttonVisible&&layout.visible!==false};
}
export function transformPopupButtonText(c,box,original){
 c.buttonTextPosition={x:Math.max(0,Math.min(500,box.x+box.width/2)),y:Math.max(0,Math.min(650,box.y+box.height/2))};
 if(Math.abs(box.width-original.width)>.001)c.buttonFontSize=Math.max(8,Math.min(120,Math.round(original.fontSize*box.width/original.width*10)/10));
}
export function drawPopupButtonText(ctx,c,layout,options={}){
 const text=popupButtonTextBox(ctx,c,layout,options);if(!text.visible)return;
 ctx.save();ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#fff';ctx.font=text.font;
 ctx.fillText(c.buttonLabel,text.x+text.width/2,text.y+text.height/2);ctx.restore();
}
export function drawPopupButton(ctx,c,layout,{image,fontFamily}={}){
 if(!c.buttonVisible||layout.visible===false)return;
 const {x,y,width,height}=popupButtonRect(c,layout,image);ctx.save();
 if(image){const scale=Math.min(width/(image.naturalWidth||image.width),height/(image.naturalHeight||image.height)),w=(image.naturalWidth||image.width)*scale,h=(image.naturalHeight||image.height)*scale;ctx.drawImage(image,x+(width-w)/2,y+(height-h)/2,w,h);}
 else {ctx.beginPath();ctx.roundRect(x,y,width,height,Math.min(height*.2,14));ctx.fillStyle=c.buttonColor;ctx.fill();ctx.strokeStyle='rgba(255,255,255,.55)';ctx.lineWidth=1.5;ctx.stroke();}
 ctx.restore();drawPopupButtonText(ctx,c,layout,{image,fontFamily});
}
export function assertPopupPixels(data){let clear=0,ink=0;for(let i=3;i<data.length;i+=4){if(data[i]===0)clear++;if(data[i]>32)ink++;}if(clear<Math.max(4,data.length/4*.01)||ink<16)throw Error('弹窗必须包含有效画面和真实透明区域，请检查背景与图层');}
