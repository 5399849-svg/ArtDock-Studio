import {interviewProfile} from './interview-profile.js';
import {extraLayers} from './module-render.js';
// Transform offsets are relative to the automatic template layout, in export pixels.
export const layerState=(v,id)=>({x:0,y:0,scale:1,opacity:100,hidden:false,locked:false,...(Object.hasOwn(v.layers||{},id)?v.layers[id]:{})});
export function layerCatalog(p,v,includeDeleted=false){
 const rows=[];const add=(id,name,kind,selector,blockId='',field='')=>rows.push({id,name,kind,selector,blockId,field});
 add('hero.background','头图背景','image','.hero-art','hero');
 add('hero.shade','头图渐变遮罩','image','.hero-shade','hero');
 add('hero.logo','Logo','image','.game-logo','hero');
 add('hero.brand','栏目名称','text','.hero-topline>span','hero','brand');
 add('hero.title',interviewProfile(v)?'头图宣传语 / AI 艺术字':'主标题 / AI 艺术字','text','.hero-copy>h1','hero','title');
 add('hero.subtitle','副标题','text',interviewProfile(v)?'.subtitle-copy':'.hero-copy>p','hero','subtitle');
 if(interviewProfile(v))add('hero.subtitle-frame','副标题蓝金底框','image','.subtitle-ornament','hero');
 add('hero.edition',interviewProfile(v)?'受访者主标题':'期数文案','text','.edition','hero','edition');
 add('hero.bottom','头图底部文案','text','.hero-bottom','hero','bottom');
 if(v.overlayAssetId)add('hero.character','独立人物 / 装饰','image','.hero-overlay','hero');
 if(p.document.intro){add('intro.text','开篇导语','text','.intro-text','intro','intro');add('intro.frame','导语底框','image','.intro>.layer-surface','intro');}
 for(const b of p.document.blocks){if(v.hiddenBlocks?.includes(b.id))continue;const label=b.text.slice(0,18);const extra=extraLayers(b);if(extra){rows.push(...extra);continue;}
  if(b.kind==='dialogue'){if(interviewProfile(v))add('ornament:'+b.id,b.speaker+' · 头像金框','image','.portrait-ornament',b.id);add('text:'+b.id,label,'text','.bubble-copy',b.id,'block');add('bubble:'+b.id,'对话底框 · '+b.speaker,'image','.bubble>.layer-surface',b.id);add('portrait:'+b.id,b.speaker+' · 头像','image','.portrait',b.id);add('name:'+b.id,b.speaker+' · 名字','text','.speaker>span',b.id);}
  else if(b.kind==='section'){add('text:'+b.id,label,'text','h3',b.id,'block');add('panel:'+b.id,'章节内容底框 · '+label,'image','@panel',b.id);if(v.id==='a')add('frame:'+b.id,'章节装饰 · '+label,'image','.chapter-art',b.id);}
  else if(b.kind==='part'){add('text:'+b.id,label,'text','h2',b.id,'block');add('kicker:'+b.id,interviewProfile(v)?'分篇副标题':'分篇英文装饰','text','.part-kicker',b.id);add('line:'+b.id,'分篇分隔线','image','i',b.id);}
  else if(b.kind==='image'){add('image:'+b.id,'配图 · '+label,'image','img',b.id);add('text:'+b.id,label,'text','figcaption',b.id,'block');}
  else if(interviewProfile(v)&&b.kind==='paragraph'&&p.document.blocks[p.document.blocks.indexOf(b)-1]?.kind==='part'){add('text:'+b.id,label,'text','.part-intro-copy',b.id,'block');add('surface:'+b.id,'人物导语底框','image','.layer-surface',b.id);}else add('text:'+b.id,label,'text','',b.id,'block');
 }
 if(p.document.outro){add('outro.frame','结束语底框','image','.outro>.layer-surface','outro');add('outro.text','结束语','text','.outro>p','outro','outro');add('outro.symbol','结束装饰','text','.outro>span','outro');add('outro.signature','结束署名','text','.outro>small','outro');}
 for(const l of v.customLayers||[])rows.push({id:l.id,name:l.name,kind:l.kind,custom:true,field:l.kind==='text'?'custom':''});
 return includeDeleted?rows:rows.filter(l=>!layerState(v,l.id).deleted);
}
export function validateLayers(v){
 if(v.layerOrder!==undefined&&(!Array.isArray(v.layerOrder)||v.layerOrder.length>3000||new Set(v.layerOrder).size!==v.layerOrder.length||v.layerOrder.some(id=>typeof id!=='string'||id.length>160)))throw new Error('图层顺序无效');
 const map=v.layers||{};if(typeof map!=='object'||Array.isArray(map)||Object.keys(map).length>3000)throw new Error('图层数据无效');
 for(const [id,s] of Object.entries(map)){if(['__proto__','constructor','prototype'].includes(id)||!s||typeof s!=='object')throw new Error('图层编号无效');for(const [k,min,max] of [['x',-30000,30000],['y',-60000,60000],['scale',.1,5],['opacity',0,100],['z',-10,100]])if(s[k]!==undefined&&(!Number.isFinite(s[k])||s[k]<min||s[k]>max))throw new Error('图层参数超出范围：'+k);if(s.text!==undefined&&(typeof s.text!=='string'||s.text.length>20000))throw new Error('图层文字无效');if(s.align!==undefined&&!['','left','center','right'].includes(s.align))throw new Error('文字对齐方式无效');for(const key of ['fontId','artAssetId'])if(s[key]!==undefined&&(typeof s[key]!=='string'||s[key].length>160||!/^[a-z0-9._-]*$/i.test(s[key])))throw new Error('文字样式参数无效');for(const key of ['hidden','locked','moveTitle','deleted'])if(s[key]!==undefined&&typeof s[key]!=='boolean')throw new Error('图层状态无效');}
 const custom=v.customLayers||[];if(!Array.isArray(custom)||custom.length>100)throw new Error('最多添加 100 个自由图层');const ids=new Set();
 for(const l of custom){if(!/^custom-[a-z0-9-]+$/i.test(l.id)||ids.has(l.id)||!['text','image'].includes(l.kind))throw new Error('自由图层无效');ids.add(l.id);if(typeof l.name!=='string'||l.name.length>150||!Number.isFinite(l.width)||l.width<20||l.width>1500)throw new Error('自由图层尺寸无效');if(l.kind==='text'&&(typeof l.text!=='string'||l.text.length>10000||!Number.isFinite(l.fontSize)||l.fontSize<8||l.fontSize>160||!/^#[0-9a-f]{6}$/i.test(l.color)))throw new Error('自由文字参数无效');if(l.kind==='image'&&typeof l.assetId!=='string')throw new Error('自由图层素材无效');}
}

// Bottom to top, shared by the layer list, editor and exported image.
export function orderedLayers(p,v){
 const depth=l=>l.custom?100+(layerState(v,l.id).z??5):l.id==='hero.background'?0:l.id==='hero.shade'?1:l.id==='hero.character'||l.id==='hero.subtitle-frame'?2:/^(panel:|surface:|qframe:|aframe:|intro.frame|outro.frame)/.test(l.id)?2:l.id.startsWith('bubble:')?3:l.kind==='text'||l.id==='hero.logo'?5:4;
 const rows=layerCatalog(p,v).map((l,i)=>({l,i})).sort((a,b)=>depth(a.l)-depth(b.l)||a.i-b.i).map(x=>x.l);
 if(!v.layerOrder?.length)return rows;
 const byId=new Map(rows.map(l=>[l.id,l])),saved=v.layerOrder.map(id=>byId.get(id)).filter(Boolean),known=new Set(saved.map(l=>l.id));
 return [...saved,...rows.filter(l=>!known.has(l.id))];
}
export function reorderedLayers(p,v,id,action){
 if(v.locked||layerState(v,id).locked)throw new Error('请先解锁方案或图层');
 const rows=orderedLayers(p,v),ids=rows.map(l=>l.id),index=ids.indexOf(id);if(index<0)return ids;
 if(!['forward','backward','front','back','below-copy'].includes(action))throw new Error('图层排序操作无效');
 ids.splice(index,1);
 let target=action==='front'?ids.length:action==='back'?0:action==='forward'?Math.min(index+1,ids.length):Math.max(index-1,0);
 if(action==='below-copy'){const protectedIds=new Set(rows.filter(l=>l.kind==='text'||l.id==='hero.logo').map(l=>l.id));target=ids.findIndex(other=>protectedIds.has(other));if(target<0)target=ids.length;}
 ids.splice(target,0,id);return ids;
}

export function layerPatchSet(v,id,patch){const previous=layerState(v,id);if(v.locked||previous.locked)return {};patch={...patch};const changes={[id]:{...previous,...patch}};if(id.startsWith('frame:')&&previous.moveTitle&&(patch.x!==undefined||patch.y!==undefined)){const peerId='text:'+id.slice(6),peer=layerState(v,peerId);if(peer.deleted)return changes;if(peer.locked)throw new Error('标题文字已锁定，请先解锁或取消一起移动');changes[peerId]={...peer,x:Math.max(-30000,Math.min(30000,peer.x+(patch.x??previous.x)-previous.x)),y:Math.max(-60000,Math.min(60000,peer.y+(patch.y??previous.y)-previous.y))};}return changes;}
