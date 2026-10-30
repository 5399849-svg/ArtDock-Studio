import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

const CACHE_DIRECTORY = 'community-extension-cache';
const FORMATS = new Set(['png', 'jpeg', 'jpg', 'webp']);
const sha256 = buffer => createHash('sha256').update(buffer).digest('hex');
const identityFields = ['taskId', 'templateId', 'sourceMasterFingerprint', 'sourceSha256', 'model'];

function invalid(message, cause) {
  return Object.assign(new Error(`延展缓存校验失败：${message}`, cause ? { cause } : undefined), { code: 'INVALID_COMMUNITY_EXTENSION_CACHE' });
}

function checkedIdentity(identity) {
  if (!identity || typeof identity !== 'object') throw invalid('缺少缓存身份');
  const result = {};
  for (const field of identityFields) {
    const value = identity[field];
    if (typeof value !== 'string' || !value.trim() || value.length > 1024 || value.includes('\0')) throw invalid(`身份字段 ${field} 无效`);
    result[field] = value;
  }
  if (!/^[a-f0-9]{64}$/.test(result.sourceSha256)) throw invalid('源图 SHA256 无效');
  return result;
}

function checkedRecord(record) {
  if (!record || typeof record !== 'object' || typeof record.jobId !== 'string' || !/^[a-zA-Z0-9_-]{1,192}$/.test(record.jobId)) throw invalid('任务编号无效');
  if (!FORMATS.has(record.format)) throw invalid('图片格式无效');
  const result = { jobId: record.jobId, format: record.format };
  for (const field of ['sourceWidth', 'sourceHeight', 'targetWidth', 'targetHeight']) {
    const value = record[field];
    if (!Number.isSafeInteger(value) || value < 1 || value > 65536) throw invalid(`尺寸字段 ${field} 无效`);
    result[field] = value;
  }
  const rect = record.preparedSourceRect;
  if (!rect || !['x', 'y', 'width', 'height'].every(field => typeof rect[field] === 'number' && Number.isFinite(rect[field]))) throw invalid('母版保护区域无效');
  if (rect.x < 0 || rect.y < 0 || rect.width <= 0 || rect.height <= 0 || rect.x + rect.width > 1.0000001 || rect.y + rect.height > 1.0000001) throw invalid('母版保护区域超出画面');
  result.preparedSourceRect = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  if (record.validation !== undefined) {
    const validation = record.validation;
    if (!validation || typeof validation.version !== 'string' || !validation.version.trim() || validation.version.length > 80 || validation.version.includes('\0') || !['passed', 'failed'].includes(validation.status)) throw invalid('对齐验证记录无效');
    if (validation.reason !== undefined && (typeof validation.reason !== 'string' || validation.reason.length > 500 || validation.reason.includes('\0'))) throw invalid('对齐验证原因无效');
    result.validation = { version: validation.version, status: validation.status };
    if (validation.reason !== undefined) result.validation.reason = validation.reason;
  }
  return result;
}

function inside(root, target) {
  const relative = path.relative(root, target);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw invalid('文件路径超出运行目录');
  return target;
}

function locations(runtimeDir, identity, record) {
  if (typeof runtimeDir !== 'string' || !runtimeDir.trim()) throw invalid('运行目录无效');
  const root = path.resolve(runtimeDir);
  const key = sha256(Buffer.from(JSON.stringify(identity)));
  const cachePath = inside(root, path.resolve(root, CACHE_DIRECTORY, `${key}.json`));
  const sourceRelativePath = record ? `registration/${record.jobId}/confirmed-master.png` : undefined;
  const generatedRelativePath = record ? `registration/${record.jobId}/extended.${record.format}` : undefined;
  return {
    root, cachePath, sourceRelativePath, generatedRelativePath,
    sourcePath: record ? inside(root, path.resolve(root, sourceRelativePath)) : undefined,
    generatedPath: record ? inside(root, path.resolve(root, generatedRelativePath)) : undefined,
  };
}

async function assertLocal(root, filename) {
  const [realRoot, realFile] = await Promise.all([fs.realpath(root), fs.realpath(filename)]);
  inside(realRoot, realFile);
}

async function verifiedFiles(paths, identity, expectedGeneratedSha256) {
  await Promise.all([assertLocal(paths.root, paths.sourcePath), assertLocal(paths.root, paths.generatedPath)]);
  const [source, buffer] = await Promise.all([fs.readFile(paths.sourcePath), fs.readFile(paths.generatedPath)]);
  if (sha256(source) !== identity.sourceSha256) throw invalid('已保存的确认母版与本次源图不一致');
  if (!buffer.length) throw invalid('已下载的延展图片为空');
  const generatedSha256 = sha256(buffer);
  if (expectedGeneratedSha256 && generatedSha256 !== expectedGeneratedSha256) throw invalid('已下载的延展图片发生变化');
  return { buffer, generatedSha256 };
}

// A missing entry may start a new job. An existing but invalid entry must stop
// the retry, so corruption never silently causes another paid generation.
export async function readCommunityExtensionCache(runtimeDir, identity) {
  const checked = checkedIdentity(identity);
  const entryPaths = locations(runtimeDir, checked);
  let serialized;
  try {
    await fs.lstat(entryPaths.cachePath);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw invalid(error.message, error);
  }
  try {
    await assertLocal(entryPaths.root, entryPaths.cachePath);
    serialized = await fs.readFile(entryPaths.cachePath, 'utf8');
  } catch (error) {
    throw invalid(error.message, error);
  }
  try {
    const entry = JSON.parse(serialized);
    if (entry.schemaVersion !== 1 || identityFields.some(field => entry.identity?.[field] !== checked[field])) throw invalid('缓存身份与本次延展不一致');
    const record = checkedRecord(entry.record);
    const paths = locations(runtimeDir, checked, record);
    if (entry.sourceRelativePath !== paths.sourceRelativePath || entry.generatedRelativePath !== paths.generatedRelativePath) throw invalid('缓存文件路径不合法');
    if (!/^[a-f0-9]{64}$/.test(entry.generatedSha256 || '')) throw invalid('延展图片 SHA256 无效');
    const { buffer } = await verifiedFiles(paths, checked, entry.generatedSha256);
    return { record, sourcePath: paths.sourcePath, generatedPath: paths.generatedPath, buffer };
  } catch (error) {
    if (error.code === 'INVALID_COMMUNITY_EXTENSION_CACHE') throw error;
    throw invalid(error.message, error);
  }
}

// The caller has already downloaded both files. Persist their exact identity
// before registration, allowing failed registration to be retried locally.
export async function writeCommunityExtensionCache(runtimeDir, identity, record) {
  const checked = checkedIdentity(identity);
  const checkedEntry = checkedRecord(record);
  const paths = locations(runtimeDir, checked, checkedEntry);
  let temporary;
  try {
    const { buffer, generatedSha256 } = await verifiedFiles(paths, checked);
    await fs.mkdir(path.dirname(paths.cachePath), { recursive: true });
    await assertLocal(paths.root, path.dirname(paths.cachePath));
    const entry = {
      schemaVersion: 1, identity: checked, record: checkedEntry, generatedSha256,
      sourceRelativePath: paths.sourceRelativePath, generatedRelativePath: paths.generatedRelativePath,
    };
    temporary = `${paths.cachePath}.${randomUUID()}.tmp`;
    await fs.writeFile(temporary, `${JSON.stringify(entry, null, 2)}\n`, { flag: 'wx' });
    await fs.rename(temporary, paths.cachePath);
    return { record: checkedEntry, sourcePath: paths.sourcePath, generatedPath: paths.generatedPath, buffer };
  } catch (error) {
    if (temporary) await fs.unlink(temporary).catch(() => {});
    if (error.code === 'INVALID_COMMUNITY_EXTENSION_CACHE') throw error;
    throw invalid(error.message, error);
  }
}
