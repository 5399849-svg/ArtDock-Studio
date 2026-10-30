// 补齐浏览器计算用的运行库和模型（public/platform/vendor、public/platform/models，约 400 MB，不进 Git）。
// 按 public/platform/runtime-manifest.json：下载的文件核对 sha256；psd-tools 从 local-ai/psd-deps 打包；
// u2net 从 local-ai/models 复制；SAM2 用 scripts/platform/export-sam2-onnx.py 从 local-ai/models 导出。
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {writeZip} from './zip.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const base = path.join(root, 'public', 'platform');
const manifest = JSON.parse(await fs.readFile(path.join(base, 'runtime-manifest.json'), 'utf8'));
const sha256 = buffer => createHash('sha256').update(buffer).digest('hex');
const exists = file => fs.access(file).then(() => true, () => false);

async function current(file, entry) {
  if (!await exists(file)) return false;
  if (entry.source.startsWith('build:')) return true;
  return sha256(await fs.readFile(file)) === entry.sha256;
}

async function buildPsdTools(target) {
  const source = path.join(root, 'local-ai', 'psd-deps', 'psd_tools');
  const entries = [];
  const walk = async dir => {
    for (const item of await fs.readdir(dir, {withFileTypes: true})) {
      const full = path.join(dir, item.name);
      if (item.isDirectory()) { if (item.name !== '__pycache__') await walk(full); }
      else if (!/\.(pyd|so|cpp)$/.test(item.name)) entries.push({name: path.relative(path.dirname(source), full).split(path.sep).join('/'), file: full});
    }
  };
  await walk(source);
  const license = path.join(root, 'local-ai', 'psd-deps', 'psd_tools-1.19.0.dist-info', 'LICENSE');
  if (await exists(license)) entries.push({name: 'psd_tools/LICENSE', file: license});
  await writeZip(target, entries);
}

let missing = 0;
for (const entry of manifest.files) {
  const target = path.join(base, ...entry.path.split('/'));
  if (await current(target, entry)) continue;
  await fs.mkdir(path.dirname(target), {recursive: true});
  process.stdout.write(`准备 ${entry.path} … `);
  if (/^https:/.test(entry.source)) {
    const response = await fetch(entry.source);
    if (!response.ok) throw new Error(`下载失败 ${entry.source}（HTTP ${response.status}）`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (sha256(bytes) !== entry.sha256) throw new Error(`校验不对：${entry.path}`);
    await fs.writeFile(target, bytes);
  } else if (entry.source.startsWith('copy:')) {
    const bytes = await fs.readFile(path.join(root, entry.source.slice(5)));
    if (sha256(bytes) !== entry.sha256) throw new Error(`校验不对：${entry.path}`);
    await fs.writeFile(target, bytes);
  } else if (entry.source === 'build:psd-tools') {
    await buildPsdTools(target);
  } else if (entry.source === 'build:sam2') {
    const python = path.join(root, 'local-ai', 'generative', '.venv', os.platform() === 'win32' ? 'Scripts/python.exe' : 'bin/python');
    if (!await exists(python)) { console.log('跳过：需要装有 torch、transformers、onnx 的 Python，见 scripts/platform/export-sam2-onnx.py'); missing++; continue; }
    execFileSync(python, [path.join(root, 'scripts', 'platform', 'export-sam2-onnx.py'), path.dirname(target)], {stdio: 'inherit'});
  }
  console.log('好了');
}
console.log(missing ? `还有 ${missing} 个文件没准备好` : '浏览器计算用的运行库和模型都齐了');
process.exitCode = missing ? 1 : 0;
