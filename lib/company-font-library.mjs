import { mkdir, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { inspectFontBytes } from '../scripts/import-company-fonts.mjs';
import { writeJson } from './json-store.mjs';

export const COMPANY_FONT_LIBRARY_DIRECTORY = 'data/fonts/company-library';
// 平台上（有应用自己的库时）公司字体库在数据目录里，由有授权的同事在工作台在线导入，随数据存进库、全组共用；
// 本机没有库时照旧用 data/fonts/company-library。
export function companyFontLibraryDirectory() {
  return process.env.WORKBENCH_FONT_LIBRARY || (process.env.DATABASE_URL ? 'data/runtime/fonts/company-library' : COMPANY_FONT_LIBRARY_DIRECTORY);
}
const formats = new Map([
  ['ttf', 'font/ttf'], ['otf', 'font/otf'], ['ttc', 'font/collection'],
  ['woff', 'font/woff'], ['woff2', 'font/woff2'],
]);
const fail = (message, status = 422) => { throw Object.assign(new Error(message), { status }); };
const inside = (parent, child) => {
  const relative = path.relative(parent, child);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
};

const normalizeFamily = value => String(value || '').replace(/[（(][^）)]*(?:授权|商用)[^）)]*[）)]/g, '').trim();
export function reviewCompanyFontSources(font) {
  const sources = font.sources || [];
  const titles = [...new Set(sources.map(source => source.title).filter(Boolean))];
  const internalNames = new Set([font.family, ...(font.familyNames || [])].map(normalizeFamily));
  const matching = titles.filter(title => internalNames.has(normalizeFamily(title)));
  const mismatchedDuplicate = titles.length > 1 && matching.length > 0;
  const issues = [], validSources = [];
  for (const source of sources) {
    const rejected = source.eligibleForLibrary === false || source.needsVendorCheck === true || (mismatchedDuplicate && !internalNames.has(normalizeFamily(source.title)));
    if (rejected) {
      issues.push({ worksId: source.worksId, name: source.title, reason: 'official-duplicate-package',
        status: 'needs-vendor-check', eligibleForLibrary: false, sha256: font.sha256, internalFamily: font.family,
        actualFontName: matching[0] || font.name,
        message: '官网作品下载包的内部字体名称与作品名称不一致，不能作为该名称的可用字体。' });
    } else validSources.push(source);
  }
  const validTitles = [...new Set(validSources.map(source => source.title).filter(Boolean))];
  const name = validTitles.find(title => internalNames.has(normalizeFamily(title))) || validTitles[0] || font.name;
  return { name, aliases: validTitles.filter(title => title !== name), validSources, issues,
    duplicatePackage: issues.length ? { status: 'needs-vendor-check', unavailableOfficialNames: issues.map(issue => issue.name), internalFamily: font.family } : null };
}

export async function readCompanyFontCatalog({ root = process.cwd() } = {}) {
  let catalog;
  try {
    catalog = JSON.parse(await readFile(path.join(root, companyFontLibraryDirectory(), 'catalog.json'), 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return { schemaVersion: 1, fonts: [], licenseAssertion: null };
    throw error;
  }
  if (catalog.schemaVersion !== 1 || !Array.isArray(catalog.fonts)) fail('公司字体库格式无效');
  return catalog;
}

export async function readCompanyFontLibrary(options = {}) {
  const catalog = await readCompanyFontCatalog(options);
  const reviewed = catalog.fonts.map(font => ({ font, review: reviewCompanyFontSources(font) }));
  const issues = [...(catalog.issues || []), ...reviewed.flatMap(({ review }) => review.issues)];
  const uniqueIssues = [...new Map(issues.map(issue => [`${issue.worksId}:${issue.reason}`, issue])).values()];
  return {
    schemaVersion: 1,
    updatedAt: catalog.updatedAt || null,
    licenseAssertion: catalog.licenseAssertion || null,
    issues: uniqueIssues,
    fonts: reviewed.filter(({ font, review }) => font.status === 'ready' && (!font.sources?.length || review.validSources.length)).map(({ font, review }) => ({
      id: font.id, name: review.name, aliases: review.aliases, duplicatePackage: review.duplicatePackage, family: font.family, style: font.style,
      version: font.version, sha256: font.sha256, bytes: font.bytes,
      format: font.format, faceIndex: font.faceIndex ?? 0,
      url: `/api/company-fonts/${encodeURIComponent(font.id)}/file`,
      source: 'company-library', vendor: font.vendor,
      license: font.license || null,
      evidenceStatus: font.license==='OFL-1.1'?'open-source-license-recorded':catalog.licenseAssertion?.evidenceStatus || 'not-recorded',
      sourceStatus: font.sourceStatus,
      importedBy: font.importedBy?.name || null, importedAt: font.importedAt || null,
      removable: font.sourceStatus === 'online-import',
    })),
  };
}

export async function resolveCompanyFontFile(id, { root = process.cwd() } = {}) {
  if (typeof id !== 'string' || !/^font-[a-f0-9]{64}-\d{1,3}$/.test(id)) fail('字体编号无效', 404);
  const catalog = await readCompanyFontCatalog({ root });
  const font = catalog.fonts.find(item => item.id === id && item.status === 'ready');
  if (!font) fail('公司字体不存在', 404);
  if (typeof font.file !== 'string' || !/^files\/[a-f0-9]{64}\.(ttf|otf|ttc|woff|woff2)$/.test(font.file)) fail('字体文件路径无效');
  if (font.file !== `files/${font.sha256}.${font.format}` || id !== `font-${font.sha256}-${font.faceIndex ?? 0}`) fail('字体编号与文件记录不一致');
  const workspace = await realpath(root);
  const library = await realpath(path.join(workspace, companyFontLibraryDirectory()));
  if (!inside(workspace, library)) fail('公司字体库目录超出工作区');
  const files = await realpath(path.join(library, 'files'));
  if (!inside(library, files)) fail('字体目录超出公司字体库');
  const file = await realpath(path.join(library, ...font.file.split('/')));
  if (!inside(files, file)) fail('字体文件超出公司字体库');
  const information = await stat(file);
  if (!information.isFile() || information.size !== font.bytes) fail('字体文件已变化');
  return file;
}

export async function readCompanyFontBytes(id, options = {}) {
  const catalog = await readCompanyFontCatalog(options);
  const file = await resolveCompanyFontFile(id, options);
  const font = catalog.fonts.find(item => item.id === id);
  const bytes = await readFile(file);
  if (createHash('sha256').update(bytes).digest('hex') !== font.sha256) fail('字体文件校验失败');
  return { bytes, contentType: formats.get(font.format) || 'application/octet-stream', font };
}

// 在线导入一个字体文件（TTF、OTF、TTC、WOFF）。导入人确认公司已获得授权；记下是谁导入的。
export async function importCompanyFontFile({ root = process.cwd(), buffer, fileName = '', importedBy, licenseConfirmed }) {
  if (licenseConfirmed !== true) fail('请先确认公司已获得这个字体的使用授权');
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) fail('字体文件无效');
  let metadata;
  try { metadata = inspectFontBytes(buffer); } catch (error) { fail(`不是能用的字体文件：${error.message}`); }
  const hash = createHash('sha256').update(buffer).digest('hex');
  const library = path.join(root, companyFontLibraryDirectory());
  await mkdir(path.join(library, 'files'), { recursive: true });
  const file = `files/${hash}.${metadata.format}`;
  await writeFile(path.join(library, file), buffer, { flag: 'wx' }).catch(error => { if (error.code !== 'EEXIST') throw error; });
  const catalogFile = path.join(library, 'catalog.json');
  let catalog;
  try { catalog = JSON.parse(await readFile(catalogFile, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; catalog = { schemaVersion: 1, fonts: [] }; }
  const now = new Date().toISOString(), added = [];
  const label = String(fileName).replace(/\.[^.]+$/, '').slice(0, 100);
  for (const [faceIndex, face] of metadata.faces.entries()) {
    const id = `font-${hash}-${faceIndex}`;
    if (catalog.fonts.some(font => font.id === id && font.status === 'ready')) continue;
    catalog.fonts = catalog.fonts.filter(font => font.id !== id);
    catalog.fonts.push({ id, name: face.family || label, ...face, format: metadata.format, faceIndex, sha256: hash, bytes: buffer.length, file,
      vendor: '', status: 'ready', sourceStatus: 'online-import', importedAt: now, sources: [],
      importedBy: importedBy ? { accountId: String(importedBy.accountId), name: String(importedBy.name || '') } : null, originalName: String(fileName).slice(0, 180) });
    added.push(id);
  }
  catalog.updatedAt = now;
  await writeJson(catalogFile, catalog);
  return { added, faces: metadata.faces.length, sha256: hash };
}

// 只删在线导入的字体；已经用在任务里的画面不受影响（任务保存了需要的字形结果）。
export async function removeCompanyFont({ root = process.cwd(), id }) {
  const library = path.join(root, companyFontLibraryDirectory()), catalogFile = path.join(library, 'catalog.json');
  const catalog = JSON.parse(await readFile(catalogFile, 'utf8'));
  const font = catalog.fonts.find(item => item.id === id);
  if (!font) fail('字体不存在', 404);
  if (font.sourceStatus !== 'online-import') fail('只能删除在工作台里导入的字体', 403);
  catalog.fonts = catalog.fonts.filter(item => item.id !== id);
  if (!catalog.fonts.some(item => item.sha256 === font.sha256)) await rm(path.join(library, ...font.file.split('/')), { force: true });
  catalog.updatedAt = new Date().toISOString();
  await writeJson(catalogFile, catalog);
  return { removed: id };
}
