import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { safeChild, sanitizeFileName } from './core.mjs';
import { prepareCharacterAssets } from './character-preflight.mjs';
import {localPython} from '../platform/local-compute.mjs';

const exec = promisify(execFile);
export const isPhotoshopAsset = asset => /\.ps[db]$/i.test(asset.name || '');

const psdHash = async sourcePath => createHash('sha256').update(await fs.readFile(sourcePath)).update('visible-groups-v1').digest('hex');
const runPsdExport = ({ root, sourcePath, temporary, role }) => localPython([path.join(root, 'scripts', 'export-task-psd-assets.py'), '--source', sourcePath, '--output', temporary, '--role', role,
], { cwd: root, windowsHide: true, timeout: 180_000, maxBuffer: 4 * 1024 * 1024,
  env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONPATH: path.join(root, 'local-ai', 'psd-deps') } });

// 慢的一步：把 PSD 交给（浏览器）计算导出可见图层组，放进任务存储下的临时文件夹。只读源文件、不碰任务数据，
// 调用方在任务数据的写锁外面做，再把结果交给 extractTaskPsdAssets：锁里只剩复制文件、登记素材这些快的部分，
// 别人的保存不用排队等浏览器计算（可能几分钟）。knownHashes 里有这个文件（以前提取过）就不再导出；导出失败不抛出，
// 结果里带 error，extractTaskPsdAssets 照旧记成“图层提取失败”。
export async function exportTaskPsdLayers({ root, storageDir, taskId, sourceName, role = 'supplement', knownHashes = [] }) {
  const sourcePath = safeChild(storageDir, taskId, 'assets', sourceName);
  const hash = await psdHash(sourcePath);
  if (knownHashes.includes(hash)) return { hash, sourceName };
  const temporary = await fs.mkdtemp(safeChild(storageDir, taskId, 'psd-extract-'));
  try {
    const { stdout } = await runPsdExport({ root, sourcePath, temporary, role });
    return { hash, sourceName, temporary, manifest: JSON.parse(stdout) };
  } catch (error) {
    await fs.rm(temporary, { recursive: true, force: true });
    return { hash, sourceName, error };
  }
}

/** 导出结果没用上时删掉临时文件夹。 */
export async function discardTaskPsdExport(exported) {
  if (exported?.temporary) await fs.rm(exported.temporary, { recursive: true, force: true });
}

export async function extractTaskPsdAssets({ root, storageDir, task, source, role = 'supplement', exported = null }) {
  const sourcePath = safeChild(storageDir, task.id, 'assets', source.name);
  const usable = exported?.sourceName === source.name ? exported : null;
  if (exported && !usable) await discardTaskPsdExport(exported);
  const hash = usable?.hash || await psdHash(sourcePath);
  const previous = task.assets.filter(asset => asset.psdSourceHash === hash);
  if (previous.length && (await Promise.all(previous.map(asset => fs.access(safeChild(storageDir, task.id, 'assets', asset.name)).then(() => true, () => false)))).every(Boolean)) {
    await discardTaskPsdExport(usable);
    const prepared = await prepareCharacterAssets({ storageDir, task, assets: previous });
    source.psdExtraction = { status: 'done', count: previous.length, hash };
    return [...previous, ...prepared];
  }
  // 锁外已经导出好的直接用；没导出过（或以前提取的文件已不在）才在这里导出。
  const temporary = usable?.temporary || (usable?.error ? null : await fs.mkdtemp(safeChild(storageDir, task.id, 'psd-extract-')));
  try {
    if (usable?.error) throw usable.error;
    const manifest = usable?.manifest || JSON.parse((await runPsdExport({ root, sourcePath, temporary, role })).stdout);
    const outputs = [];
    for (const [index, layer] of manifest.layers.entries()) {
      const name = sanitizeFileName(`${path.parse(source.name).name}-${layer.layerPath.at(-1)}-${hash.slice(0, 12)}-${index + 1}.png`);
      const target = safeChild(storageDir, task.id, 'assets', name);
      await fs.copyFile(safeChild(temporary, layer.file), target);
      outputs.push({ name, mime: 'image/png', role: layer.role, bytes: (await fs.stat(target)).size,
        url: `/storage/${encodeURIComponent(task.id)}/assets/${encodeURIComponent(name)}`,
        width: layer.width, height: layer.height, transparent: layer.transparent,
        sourceAssetName: source.name, sourceLayerPath: layer.layerPath, sourceBounds: layer.sourceBounds,
        psdSourceHash: hash, extractionMethod: 'psd-visible-layer-group', createdAt: new Date().toISOString() });
    }
    task.assets.push(...outputs.filter(output => !task.assets.some(asset => asset.name === output.name)));
    outputs.push(...await prepareCharacterAssets({ storageDir, task, assets: outputs }));
    source.psdExtraction = { status: 'done', count: outputs.length, hash };
    source.role = 'source-psd';
    return outputs;
  } catch (error) {
    const detail = (error.stderr || error.message || '').trim().split(/\r?\n/).at(-1);
    source.psdExtraction = { status: 'failed', error: `源文件已保存，图层提取失败：${detail}` };
    return [];
  } finally {
    // mkdtemp created this exact directory under this task's storage directory.
    if (temporary) await fs.rm(temporary, { recursive: true, force: true });
  }
}
