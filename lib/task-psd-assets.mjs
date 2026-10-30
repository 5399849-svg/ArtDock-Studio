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

export async function extractTaskPsdAssets({ root, storageDir, task, source, role = 'supplement' }) {
  const sourcePath = safeChild(storageDir, task.id, 'assets', source.name);
  const hash = createHash('sha256').update(await fs.readFile(sourcePath)).update('visible-groups-v1').digest('hex');
  const previous = task.assets.filter(asset => asset.psdSourceHash === hash);
  if (previous.length && (await Promise.all(previous.map(asset => fs.access(safeChild(storageDir, task.id, 'assets', asset.name)).then(() => true, () => false)))).every(Boolean)) {
    const prepared = await prepareCharacterAssets({ storageDir, task, assets: previous });
    source.psdExtraction = { status: 'done', count: previous.length, hash };
    return [...previous, ...prepared];
  }
  const temporary = await fs.mkdtemp(safeChild(storageDir, task.id, 'psd-extract-'));
  try {
    const { stdout } = await localPython([path.join(root, 'scripts', 'export-task-psd-assets.py'), '--source', sourcePath, '--output', temporary, '--role', role,
    ], { cwd: root, windowsHide: true, timeout: 180_000, maxBuffer: 4 * 1024 * 1024,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONPATH: path.join(root, 'local-ai', 'psd-deps') } });
    const manifest = JSON.parse(stdout);
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
    await fs.rm(temporary, { recursive: true, force: true });
  }
}
