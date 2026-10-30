const imageMime=/^image\/(?:png|jpe?g|webp|gif|avif|bmp|svg\+xml|x-icon|vnd\.microsoft\.icon)$/i;
const imageExtension=/\.(?:png|jpe?g|webp|gif|avif|bmp|svg|ico)(?:[?#]|$)/i;
const nonImageExtension=/\.(?:ttf|otf|woff2?|psd|psb|pdf|zip)(?:[?#]|$)/i;
const logoRole=/^(?:logo|brand-logo|game-logo|project-logo)$/i;
const copyright=/ip[-_ ]?(?:copyright|标识)|版权|copyright|yuewen|阅文/i;
const asAsset=value=>typeof value==='string'?{url:value}:value;

function displayable(asset){
 if(!asset?.url||nonImageExtension.test(asset.name||asset.url))return false;
 if(asset.mime)return imageMime.test(asset.mime);
 return imageExtension.test(asset.name||asset.url)||/^data:image\/(?:png|jpe?g|webp|gif|avif);base64,/i.test(asset.url);
}
function isLogo(asset){
 return !copyright.test(`${asset.role||''} ${asset.name||''}`)&&
  (logoRole.test(asset.role||'')||/logo|商标|品牌标志|游戏标志/i.test(asset.name||''));
}
const logoTheme=asset=>/白字|白色|反白|白标/.test(asset.name||'')&&!/材质|彩色/.test(asset.name||'')?'dark':'light';

// Project identity comes from its logo, rather than whichever source file was indexed first.
// Keep image candidates as fallbacks; a missing logo must not leave the card broken.
export function projectCoverCandidates(project,assets=[],brands=[]){
 const rows=assets.filter(displayable),unfiled=project?.id==='unfiled';
 const projectImageUrls=new Set(unfiled?[]:(project?.assets||[]).filter(displayable).map(asset=>asset.url));
 const candidates=[];
 // Uploaded project artwork also needs breathing room, even when its filename does not say "logo".
 const add=(asset,kind)=>{if(displayable(asset))candidates.push({url:asset.url,name:asset.name||'',kind,inset:kind==='logo'||projectImageUrls.has(asset.url),theme:kind==='logo'?logoTheme(asset):'light'})};
 if(!unfiled){
  const own=(project?.assets||[]).filter(Boolean);
  const libraryLogos=Array.isArray(project?.libraryLogos)?project.libraryLogos.map(asAsset).filter(Boolean):[];
  const explicit=[project?.logoAsset,project?.logo,project?.logoUrl].map(asAsset).filter(Boolean);
  for(const asset of explicit)add(asset,'logo');
  for(const asset of libraryLogos)add(asset,'logo');
  for(const asset of own)if(isLogo(asset))add(asset,'logo');
  for(const asset of brands.find(brand=>brand.id===project?.brandId)?.assets||[])if(isLogo(asset))add(asset,'logo');
  for(const asset of rows)if(isLogo(asset))add(asset,'logo');
 }
 const fallbacks=[...rows].sort((a,b)=>{
  const rank=asset=>asset.kind==='成品'?0:/^(?:master|master-landscape|master-portrait|clean-kv)$/.test(asset.role||'')?1:/reference/.test(asset.role||'')?3:2;
  return rank(a)-rank(b);
 });
 for(const asset of fallbacks)add(asset,'image');
 const seen=new Set();return candidates.filter(candidate=>{if(seen.has(candidate.url))return false;seen.add(candidate.url);return true});
}

export async function mountProjectCover(element,candidates,{ImageClass=globalThis.Image}={}){
 for(const candidate of candidates){
  if(!element.isConnected)return null;
  // Preload off-document so the global broken-image handler never replaces the cover.
  const image=new ImageClass();image.decoding='async';
  const ready=await new Promise(resolve=>{
   image.onload=()=>resolve(Boolean(image.naturalWidth&&image.naturalHeight));
   image.onerror=()=>resolve(false);image.src=candidate.url;
  });
  if(!element.isConnected)return null;
  if(!ready)continue;
  if(typeof image.decode==='function')await image.decode().catch(()=>{});
  if(!element.isConnected)return null;
  image.alt='';
  element.dataset.coverKind=candidate.kind;element.dataset.coverTheme=candidate.theme;
  element.dataset.coverInset=String(candidate.inset??candidate.kind==='logo');
  element.replaceChildren(image);return candidate;
 }
 return null;
}
