import { createHash } from 'node:crypto';
import { inflateRawSync, inflateSync } from 'node:zlib';
import { mkdir, open, readFile, realpath, rename, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { COMPANY_FONT_LIBRARY_DIRECTORY, readCompanyFontCatalog, reviewCompanyFontSources } from '../lib/company-font-library.mjs';

const FONT_LIMIT = 128 * 1024 * 1024;
const ZIP_TOTAL_LIMIT = 512 * 1024 * 1024;
const DEFAULT_MANIFEST = '03 公共素材/字体/字魂与字小魂/官方原包/download-manifest.json';
const DEFAULT_EVIDENCE = 'C:/Users/Administrator/AppData/Local/Temp/codex-clipboard-5156977f-95c1-4c5d-a797-7435f48545b0.png';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const inside = (parent, child) => {
  const relative = path.relative(parent, child);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
};
function range(buffer, offset, size) {
  if (!Number.isInteger(offset) || !Number.isInteger(size) || offset < 0 || size < 0 || offset + size > buffer.length) throw new Error('字体或压缩包数据越界');
}
function officialUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || !/(^|\.)(izihun|zihunziku)\.com$/i.test(url.hostname)) throw new Error('来源不是字魂官方域名');
  return `${url.origin}${url.pathname}`;
}
function safeMemberName(name) {
  if (!name || name.includes('\0') || name.includes(':') || /^[\\/]/.test(name) || name.split(/[\\/]/).some(segment => segment === '..')) throw new Error('压缩包或下载路径包含路径穿越');
  return name.replaceAll('\\', '/');
}
const crcTable = Array.from({ length: 256 }, (_, value) => {
  for (let i = 0; i < 8; i++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

// Reads archives in memory; never executes or extracts arbitrary archive members.
export function extractFontMembers(buffer) {
  if (buffer.length > ZIP_TOTAL_LIMIT) throw new Error('压缩包超过大小限制');
  let end = -1;
  for (let offset = buffer.length - 22; offset >= Math.max(0, buffer.length - 65557); offset--) {
    if (buffer.readUInt32LE(offset) === 0x06054b50 && offset + 22 + buffer.readUInt16LE(offset + 20) === buffer.length) { end = offset; break; }
  }
  if (end < 0) throw new Error('ZIP中央目录不存在');
  const count = buffer.readUInt16LE(end + 10), directorySize = buffer.readUInt32LE(end + 12), directory = buffer.readUInt32LE(end + 16);
  if (buffer.readUInt16LE(end + 4) || buffer.readUInt16LE(end + 6) || buffer.readUInt16LE(end + 8) !== count || count === 65535 || directory === 0xffffffff || directorySize === 0xffffffff || count > 5000) throw new Error('不支持分卷、ZIP64或超大目录');
  range(buffer, directory, directorySize);
  if (directory + directorySize > end) throw new Error('ZIP目录位置无效');
  const members = [];
  let cursor = directory, total = 0;
  for (let i = 0; i < count; i++) {
    range(buffer, cursor, 46);
    if (buffer.readUInt32LE(cursor) !== 0x02014b50) throw new Error('ZIP目录记录无效');
    const flags = buffer.readUInt16LE(cursor + 8), method = buffer.readUInt16LE(cursor + 10);
    const crc = buffer.readUInt32LE(cursor + 16), packed = buffer.readUInt32LE(cursor + 20), unpacked = buffer.readUInt32LE(cursor + 24);
    const nameSize = buffer.readUInt16LE(cursor + 28), extraSize = buffer.readUInt16LE(cursor + 30), commentSize = buffer.readUInt16LE(cursor + 32);
    const attrs = buffer.readUInt32LE(cursor + 38), local = buffer.readUInt32LE(cursor + 42);
    range(buffer, cursor + 46, nameSize + extraSize + commentSize);
    const name = safeMemberName(buffer.subarray(cursor + 46, cursor + 46 + nameSize).toString(flags & 0x800 ? 'utf8' : 'latin1'));
    cursor += 46 + nameSize + extraSize + commentSize;
    if ((attrs >>> 16 & 0xf000) === 0xa000) throw new Error('压缩包包含符号链接');
    if (!/\.(ttf|otf|ttc|woff)$/i.test(name)) continue;
    total += unpacked;
    if (flags & 1 || ![0, 8].includes(method) || unpacked > FONT_LIMIT || total > ZIP_TOTAL_LIMIT || unpacked / Math.max(packed, 1) > 300) throw new Error('字体压缩成员不安全或超过限制');
    range(buffer, local, 30);
    if (buffer.readUInt32LE(local) !== 0x04034b50) throw new Error('ZIP成员头无效');
    const localFlags = buffer.readUInt16LE(local + 6), localMethod = buffer.readUInt16LE(local + 8);
    const localNameSize = buffer.readUInt16LE(local + 26), localExtra = buffer.readUInt16LE(local + 28);
    range(buffer, local + 30, localNameSize + localExtra);
    const localName = safeMemberName(buffer.subarray(local + 30, local + 30 + localNameSize).toString(localFlags & 0x800 ? 'utf8' : 'latin1'));
    if (localName !== name || localMethod !== method || localFlags & 1) throw new Error('ZIP成员头与目录不一致');
    const start = local + 30 + localNameSize + localExtra;
    range(buffer, start, packed);
    if (start + packed > directory) throw new Error('ZIP成员与目录重叠');
    const compressed = buffer.subarray(start, start + packed);
    const bytes = method === 0 ? Buffer.from(compressed) : inflateRawSync(compressed, { maxOutputLength: FONT_LIMIT });
    if (bytes.length !== unpacked || crc32(bytes) !== crc) throw new Error('ZIP字体长度或CRC不匹配');
    members.push({ name, bytes });
  }
  if (cursor !== directory + directorySize) throw new Error('ZIP目录长度不匹配');
  return members;
}

function decodeName(bytes, platform, encoding) {
  if (platform === 0 || platform === 3) {
    if (bytes.length % 2) return '';
    const swapped = Buffer.alloc(bytes.length);
    for (let i = 0; i < bytes.length; i += 2) { swapped[i] = bytes[i + 1]; swapped[i + 1] = bytes[i]; }
    return swapped.toString('utf16le').replaceAll('\0', '').trim();
  }
  if (platform === 1 && encoding === 0) return bytes.toString('latin1').replaceAll('\0', '').trim();
  return '';
}
function nameMetadata(table) {
  range(table, 0, 6);
  const version = table.readUInt16BE(0), count = table.readUInt16BE(2), strings = table.readUInt16BE(4);
  if (![0, 1].includes(version) || count > 4096 || strings < 6 + count * 12) throw new Error('字体名称表无效');
  range(table, 6, count * 12);
  const names = [];
  for (let i = 0; i < count; i++) {
    const pos = 6 + i * 12;
    const platform = table.readUInt16BE(pos), encoding = table.readUInt16BE(pos + 2), language = table.readUInt16BE(pos + 4), id = table.readUInt16BE(pos + 6);
    const size = table.readUInt16BE(pos + 8), offset = strings + table.readUInt16BE(pos + 10);
    range(table, offset, size);
    const text = decodeName(table.subarray(offset, offset + size), platform, encoding);
    if (text) names.push({ id, language, platform, text });
  }
  const values = id => [...new Set(names.filter(n => n.id === id).sort((a, b) => Number(/\p{Script=Han}/u.test(b.text)) - Number(/\p{Script=Han}/u.test(a.text))).map(n => n.text))];
  const familyNames = [...new Set([...values(16), ...values(1)])];
  const styleNames = [...new Set([...values(17), ...values(2)])];
  if (!familyNames.length) throw new Error('字体缺少内部family名称');
  return { family: familyNames[0], style: styleNames[0] || 'Regular', familyNames, styleNames, fullNames: values(4), postscriptNames: values(6), version: values(5)[0] || null };
}
function checkTables(tables) {
  if (!['head', 'maxp', 'cmap', 'name'].every(tag => tables.has(tag)) || !['glyf', 'CFF ', 'CFF2'].some(tag => tables.has(tag))) throw new Error('文件缺少必要的字体表');
}
function sfntFace(buffer, offset) {
  range(buffer, offset, 12);
  const tag = buffer.subarray(offset, offset + 4).toString('latin1');
  if (!['\u0000\u0001\u0000\u0000', 'OTTO', 'true', 'typ1'].includes(tag)) throw new Error('字体SFNT签名无效');
  const count = buffer.readUInt16BE(offset + 4);
  if (!count || count > 256) throw new Error('字体表数量无效');
  range(buffer, offset + 12, count * 16);
  const tables = new Map();
  for (let i = 0; i < count; i++) {
    const pos = offset + 12 + i * 16, tableTag = buffer.subarray(pos, pos + 4).toString('latin1');
    const start = buffer.readUInt32BE(pos + 8), size = buffer.readUInt32BE(pos + 12);
    range(buffer, start, size);
    if (tables.has(tableTag)) throw new Error('字体表重复');
    tables.set(tableTag, buffer.subarray(start, start + size));
  }
  checkTables(tables);
  return nameMetadata(tables.get('name'));
}
export function inspectFontBytes(buffer) {
  if (buffer.length > FONT_LIMIT || buffer.length < 12) throw new Error('字体大小无效');
  const signature = buffer.subarray(0, 4).toString('latin1');
  if (signature === 'ttcf') {
    const count = buffer.readUInt32BE(8);
    if (!count || count > 100) throw new Error('字体集合face数量无效');
    range(buffer, 12, count * 4);
    return { format: 'ttc', faces: Array.from({ length: count }, (_, i) => sfntFace(buffer, buffer.readUInt32BE(12 + i * 4))) };
  }
  if (signature === 'wOFF') {
    range(buffer, 0, 44);
    if (buffer.readUInt32BE(8) !== buffer.length) throw new Error('WOFF长度无效');
    const count = buffer.readUInt16BE(12), tables = new Map();
    if (!count || count > 256) throw new Error('WOFF表数量无效');
    range(buffer, 44, count * 20);
    for (let i = 0; i < count; i++) {
      const pos = 44 + i * 20, tag = buffer.subarray(pos, pos + 4).toString('latin1');
      const start = buffer.readUInt32BE(pos + 4), packed = buffer.readUInt32BE(pos + 8), unpacked = buffer.readUInt32BE(pos + 12);
      range(buffer, start, packed);
      if (packed > unpacked || unpacked > FONT_LIMIT || tables.has(tag)) throw new Error('WOFF字体表无效');
      const bytes = buffer.subarray(start, start + packed);
      const contents = tag === 'name' && packed !== unpacked ? inflateSync(bytes, { maxOutputLength: FONT_LIMIT }) : bytes;
      if (tag === 'name' && contents.length !== unpacked) throw new Error('WOFF名称表长度无效');
      tables.set(tag, contents);
    }
    checkTables(tables);
    return { format: 'woff', faces: [nameMetadata(tables.get('name'))] };
  }
  if (signature === 'wOF2') throw new Error('WOFF2需要额外解码器，请使用官方TTF、OTF、TTC或WOFF版本');
  return { format: signature === 'OTTO' ? 'otf' : 'ttf', faces: [sfntFace(buffer, 0)] };
}

async function importUnlocked({ root = process.cwd(), manifestPath = DEFAULT_MANIFEST, evidencePath = DEFAULT_EVIDENCE } = {}) {
  root = await realpath(root);
  const absoluteManifest = await realpath(path.resolve(root, manifestPath));
  if (!inside(root, absoluteManifest)) throw new Error('下载清单必须位于工作区');
  const sourceDirectory = path.dirname(absoluteManifest);
  const manifest = JSON.parse(await readFile(absoluteManifest, 'utf8'));
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.fonts)) throw new Error('官方下载清单格式无效');
  const officialCatalog = JSON.parse(await readFile(path.join(sourceDirectory, 'official-catalog.json'), 'utf8'));
  if (officialCatalog.schemaVersion !== 1 || !Array.isArray(officialCatalog.fonts)) throw new Error('官方作品目录格式无效');
  const works = new Map(officialCatalog.fonts.map(font => [String(font.worksId), font]));
  const library = path.join(root, COMPANY_FONT_LIBRARY_DIRECTORY);
  await mkdir(path.join(library, 'files'), { recursive: true });
  if (!inside(root, await realpath(library)) || !inside(await realpath(library), await realpath(path.join(library, 'files')))) throw new Error('公司字体库目录不可指向工作区外部');
  const catalog = await readCompanyFontCatalog({ root });
  catalog.licenseAssertion ||= {
    source: 'user-provided-screenshot', evidenceStatus: 'provided-screenshot',
    authorizedFontDescription: '【字魂网】字魂及字小魂前缀字体', territory: '全球', channels: '全渠道', term: '永久',
    licensee: null, contractNumber: null, newlyAddedFonts: 'not-shown', fontEmbedding: 'not-shown', fontModification: 'not-shown',
    screenshotOriginalPath: evidencePath, recordedAt: new Date().toISOString(),
  };
  if (!catalog.licenseAssertion.evidenceFile && evidencePath) {
    try {
      const evidence = await readFile(evidencePath), hash = sha256(evidence);
      await mkdir(path.join(library, 'evidence'), { recursive: true });
      if (!inside(await realpath(library), await realpath(path.join(library, 'evidence')))) throw new Error('授权证据目录超出公司字体库');
      const relative = `evidence/license-screenshot-${hash}.png`;
      await writeFile(path.join(library, relative), evidence, { flag: 'wx' }).catch(error => { if (error.code !== 'EEXIST') throw error; });
      catalog.licenseAssertion.evidenceFile = relative;
      catalog.licenseAssertion.evidenceSha256 = hash;
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  catalog.importBatches ||= [];
  const batch = { id: `official-${sha256(await readFile(absoluteManifest)).slice(0, 24)}`, manifest: path.relative(root, absoluteManifest).replaceAll('\\', '/'), importedAt: new Date().toISOString(), imported: 0, reused: 0, errors: [] };
  for (const source of manifest.fonts) {
    try {
      if (!/^\d+$/.test(String(source.worksId || '')) || !/^字(?:小)?魂/.test(source.title || '') || source.source !== 'official-public-font-list' || !/^[a-f0-9]{64}$/i.test(source.sha256 || '')) throw new Error('下载记录缺少官方作品ID、字库前缀或SHA256');
      const work = works.get(String(source.worksId));
      if (!work || work.title !== source.title || work.officialHash !== source.officialHash || !/^[a-f0-9]{32}$/i.test(source.officialHash || '') || work.brandId !== source.brandId || ![1, 2, 3, 4].includes(source.brandId) || work.source !== source.source) throw new Error('下载字体与官网作品目录不匹配');
      const sourceUrl = officialUrl(source.sourceUrl), listUrl = officialUrl(source.listUrl), downloadApi = officialUrl(source.downloadApi);
      if (listUrl !== officialUrl(work.listUrl) || downloadApi !== officialUrl(work.downloadApi) || !downloadApi.endsWith(`/v1/download/${source.worksId}`)) throw new Error('下载接口与官网作品ID不匹配');
      const relative = safeMemberName(source.file);
      const downloaded = await realpath(path.resolve(sourceDirectory, relative));
      if (!inside(sourceDirectory, downloaded)) throw new Error('下载文件超出官方包目录');
      const information = await stat(downloaded);
      if (!information.isFile() || information.size > ZIP_TOTAL_LIMIT || information.size !== source.bytes) throw new Error('下载文件大小与清单不匹配');
      const original = await readFile(downloaded);
      if (sha256(original) !== source.sha256.toLowerCase()) throw new Error('下载文件SHA256与清单不匹配');
      const isZip = original.readUInt32LE(0) === 0x04034b50;
      const members = isZip ? extractFontMembers(original) : [{ name: path.basename(relative), bytes: original }];
      if (!members.length) throw new Error('官方包未包含支持的字体文件');
      for (const member of members) {
        const metadata = inspectFontBytes(member.bytes), hash = sha256(member.bytes), existing = catalog.fonts.find(font => font.sha256 === hash);
        const file = existing?.file || `files/${hash}.${metadata.format}`;
        if (!new RegExp(`^files/${hash}\\.(ttf|otf|ttc|woff)$`).test(file)) throw new Error('已有字体的存储路径无效');
        await writeFile(path.join(library, file), member.bytes, { flag: 'wx' }).catch(error => { if (error.code !== 'EEXIST') throw error; });
        const stored = await realpath(path.join(library, file));
        if (!inside(await realpath(path.join(library, 'files')), stored) || sha256(await readFile(stored)) !== hash) throw new Error('公司库内已有字体文件校验失败');
        for (const [faceIndex, face] of metadata.faces.entries()) {
          const id = `font-${hash}-${faceIndex}`;
          let entry = catalog.fonts.find(font => font.id === id);
          const origin = { worksId: String(source.worksId), title: source.title, source: source.source, listUrl, sourceUrl, downloadApi,
            officialHash: source.officialHash, brandId: source.brandId, brandName: source.brandName || null, sourcePublisher: source.sourcePublisher || null,
            packageFile: path.relative(root, downloaded).replaceAll('\\', '/'), packageSha256: source.sha256.toLowerCase(), memberName: member.name,
            downloadBatch: manifest.batchId || manifest.createdAt || manifest.updatedAt || source.acquiredAt || null, acquiredAt: source.acquiredAt || null, importBatch: batch.id };
          if (source.eligibleForLibrary === false || source.needsVendorCheck === true) {
            origin.eligibleForLibrary = false; origin.needsVendorCheck = true; origin.status = source.status || 'official-duplicate-package';
          }
          if (!entry) {
            entry = { id, name: source.title, ...face, format: metadata.format, faceIndex, sha256: hash, bytes: member.bytes.length, file,
              vendor: '字魂网', status: 'ready', sourceStatus: 'official-catalog-and-manifest-sha256-matched', importedAt: new Date().toISOString(), sources: [] };
            catalog.fonts.push(entry); batch.imported++;
          } else batch.reused++;
          entry.sourceStatus = 'official-catalog-and-manifest-sha256-matched';
          const sourceIndex = entry.sources.findIndex(item => item.worksId === origin.worksId && item.packageSha256 === origin.packageSha256 && item.memberName === origin.memberName);
          if (sourceIndex < 0) entry.sources.push(origin);
          else entry.sources[sourceIndex] = { ...entry.sources[sourceIndex], ...origin, importBatch: entry.sources[sourceIndex].importBatch };
        }
      }
    } catch (error) { batch.errors.push({ worksId: source.worksId || null, title: source.title || null, file: source.file || null, message: error.message }); }
  }
  catalog.issues = [];
  for (const font of catalog.fonts) {
    const reviewed = reviewCompanyFontSources(font);
    font.name = reviewed.name; font.aliases = reviewed.aliases; font.duplicatePackage = reviewed.duplicatePackage;
    for (const issue of reviewed.issues) {
      const source = font.sources.find(item => item.worksId === issue.worksId);
      if (source) { source.eligibleForLibrary = false; source.needsVendorCheck = true; source.status = issue.reason; }
      catalog.issues.push(issue);
    }
    if (font.sources?.length && !reviewed.validSources.length) font.status = 'needs-vendor-check';
  }
  catalog.issues = [...new Map(catalog.issues.map(issue => [`${issue.worksId}:${issue.reason}`, issue])).values()];
  catalog.updatedAt = new Date().toISOString();
  catalog.importBatches = catalog.importBatches.filter(item => item.id !== batch.id);
  catalog.importBatches.push(batch);
  const destination = path.join(library, 'catalog.json'), temporary = `${destination}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');
  await rename(temporary, destination);
  return { total: catalog.fonts.length, imported: batch.imported, reused: batch.reused, errors: batch.errors, catalog: path.relative(root, destination).replaceAll('\\', '/') };
}

export async function importCompanyFonts(options = {}) {
  const root = await realpath(options.root || process.cwd());
  const library = path.join(root, COMPANY_FONT_LIBRARY_DIRECTORY);
  await mkdir(library, { recursive: true });
  if (!inside(root, await realpath(library))) throw new Error('公司字体库目录不可指向工作区外部');
  const lockPath = path.join(library, 'import.lock');
  let lock;
  try { lock = await open(lockPath, 'wx'); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const previous = JSON.parse(await readFile(lockPath, 'utf8'));
    if (!Number.isInteger(previous.pid) || previous.pid <= 0) throw new Error('字体入库锁无效，需要检查正在运行的入库任务');
    let running = true;
    try { process.kill(previous.pid, 0); }
    catch (check) { if (check.code === 'ESRCH') running = false; }
    if (running) throw new Error(`字体入库正在运行（PID ${previous.pid}），请等待完成`);
    await unlink(lockPath);
    lock = await open(lockPath, 'wx');
  }
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
    return await importUnlocked({ ...options, root });
  } finally {
    await lock.close();
    await unlink(lockPath);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const options = {};
  for (let i = 2; i < process.argv.length; i += 2) {
    const key = { '--root': 'root', '--manifest': 'manifestPath', '--evidence': 'evidencePath' }[process.argv[i]];
    if (!key || !process.argv[i + 1]) throw new Error('用法：node scripts/import-company-fonts.mjs [--manifest 路径] [--root 工作区] [--evidence 截图路径]');
    options[key] = process.argv[i + 1];
  }
  const result = await importCompanyFonts(options);
  console.log(JSON.stringify(result, null, 2));
  if (result.errors.length) process.exitCode = 1;
}
