const loaded = new Map();
let registeredCompanyFonts = [];
let companyFontsById = new Map();

function legacyProjectFonts(task, projects) {
  return (projects.find(p => p.id === task.projectId)?.assets || []).filter(a => /\.(ttf|otf|woff2?)$/i.test(a.name) && a.url);
}

export function setCompanyFonts(fonts = []) {
  companyFontsById = new Map();
  for (const asset of fonts) {
    if (!asset?.id || !asset.name || !asset.url || companyFontsById.has(asset.id)) continue;
    companyFontsById.set(asset.id, { ...asset, source: 'company-library' });
  }
  registeredCompanyFonts = [...companyFontsById.values()];
}

export function companyFonts() {
  return [...registeredCompanyFonts];
}

export function projectFonts(task, projects) {
  const legacy = legacyProjectFonts(task, projects);
  const project = projects.find(p => p.id === task.projectId);
  const recommendations = [...new Set(project?.recommendedFontIds || [])]
    .map(id => companyFontsById.get(id)).filter(Boolean);
  return [...legacy, ...recommendations];
}

function stableHash(value) {
  let hash = 2166136261;
  for (const char of value) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(16);
}

export function projectFontFamily(asset) {
  if (asset.source === 'company-library') {
    const fileIdentity = /^[a-f0-9]{64}$/i.test(asset.sha256 || '') ? asset.sha256.toLowerCase() : stableHash(asset.url);
    return `CompanyFont_${stableHash(String(asset.id))}_${fileIdentity}`;
  }
  // Existing tasks use this URL-derived family; keep their rendering identity.
  return `ProjectFont_${stableHash(asset.url)}`;
}

export async function loadFontAsset(asset) {
  if (!asset?.url) throw new Error('字体文件地址缺失');
  const family = projectFontFamily(asset);
  if (!loaded.has(family)) {
    const promise = Promise.resolve().then(() => new FontFace(family, `url(${JSON.stringify(asset.url)})`).load())
      .then(face => { document.fonts.add(face); return face; });
    loaded.set(family, promise);
  }
  const promise = loaded.get(family);
  try { return await promise; }
  catch (error) {
    if (loaded.get(family) === promise) loaded.delete(family);
    throw error;
  }
}

export async function loadProjectFonts(task, projects) {
  await loadPopupFonts(task);
  if(task.sourceAdaptation)return;
  for (const kind of ['title', 'subtitle']) {
    const id = task.parameters?.[`${kind}FontId`];
    if (id && !companyFontsById.has(id)) throw new Error(`${kind === 'title' ? '主标' : '副标'}所选版权字体不在当前字体库中：${id}`);
  }
  const previews = projectFonts(task, projects).slice(0, 3);
  const selected = ['title', 'subtitle'].map(kind => selectedProjectFont(task, projects, kind)).filter(Boolean);
  const popup=task.parameters?.communityPopupNativeByTemplate?.['community-community-popup'];
  if(popup)for(const [kind,copy]of Object.entries(popup)){const historical=selectedProjectFont({...task,parameters:{...task.parameters,[kind+'FontId']:copy.fontId,[kind+'FontAsset']:copy.fontAsset}},projects,kind);if(historical)selected.push(historical);}
  const assets = [...new Map([...previews, ...selected].map(asset => [projectFontFamily(asset), asset])).values()];
  await Promise.all(assets.map(loadFontAsset));
}

export function selectedProjectFont(task, projects, kind) {
  const selectedId = task.parameters?.[`${kind}FontId`];
  return companyFontsById.get(selectedId) || legacyProjectFonts(task, projects)
    .find(asset => asset.name === task.parameters?.[`${kind}FontAsset`]);
}

export function popupFontFamily(config){
 if(!config?.buttonFontId)return undefined;
 const asset=companyFontsById.get(config.buttonFontId);
 if(!asset)throw Error('按钮版权字体不可用，请重新选择');
 return projectFontFamily(asset);
}
export async function loadPopupFonts(task){
 const configs=[...Object.values(task.parameters?.communityPopupByTemplate||{}),...Object.values(task.parameters?.sourceCompositionByTemplate||{}).map(c=>c.popup)].filter(Boolean);
 for(const id of new Set(configs.map(c=>c.buttonFontId).filter(Boolean))){const font=companyFontsById.get(id);if(!font)throw Error('按钮版权字体不可用，请重新选择');await loadFontAsset(font);}
}
