// 按《打包规范》把工作台打成可以上传到微光平台的 zip：dist/平台与社区素材工作台.zip
// 只放运行要用的文件（不带 node_modules、data/runtime、本机 Python 环境、Photoshop 队列、素材文件夹、测试和密钥）。
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {writeZip} from './zip.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const output = path.join(root, 'dist', '平台与社区素材工作台.zip');
const sha256 = buffer => createHash('sha256').update(buffer).digest('hex');
const exists = file => fs.access(file).then(() => true, () => false);
const problems = [];

async function listDir(relative, accept = () => true) {
  const result = [];
  const walk = async dir => {
    for (const item of await fs.readdir(path.join(root, dir), {withFileTypes: true})) {
      const rel = `${dir}/${item.name}`;
      if (item.isDirectory()) { if (!['node_modules', '__pycache__', '.git'].includes(item.name)) await walk(rel); }
      else if (item.isFile() && accept(rel)) result.push(rel);
    }
  };
  await walk(relative);
  return result;
}

// 1. 浏览器计算的运行库和模型都在、校验对
const manifest = JSON.parse(await fs.readFile(path.join(root, 'public/platform/runtime-manifest.json'), 'utf8'));
for (const entry of manifest.files) {
  const file = path.join(root, 'public/platform', ...entry.path.split('/'));
  if (!await exists(file)) { problems.push(`缺少 public/platform/${entry.path}（先运行 npm run prepare:browser-runtime）`); continue; }
  if (!entry.source.startsWith('build:') && sha256(await fs.readFile(file)) !== entry.sha256) problems.push(`校验不对：public/platform/${entry.path}`);
}

// 2. 投放尺寸表和随代码提交的清单一致（服务器上不重新解析）
const workbook = '02 规范与模板/投放/资源位规范/投放资源位尺寸表.xlsx';
const catalog = JSON.parse(await fs.readFile(path.join(root, 'config/ad-resources-v1.json'), 'utf8'));
if (catalog.workbookSha256 !== sha256(await fs.readFile(path.join(root, workbook)))) problems.push('投放尺寸表改过了：先在本机运行 scripts/sync-ad-resources.py 更新 config/ad-resources-v1.json');

// 3. 要放进包里的文件
const files = [
  'weiguang.json', 'package.json', 'package-lock.json', '.env.example', 'README.md', 'server.mjs', 'local-ai/pipeline.py', workbook,
  ...await listDir('platform'),
  ...await listDir('lib'),
  ...await listDir('public'),
  ...await listDir('config', rel => !/\/(ai-huabu|remove-bg)\.json$/.test(rel)),
  ...await listDir('scripts', rel => /^scripts\/[^/]+\.py$/.test(rel) || rel === 'scripts/import-company-fonts.mjs' || rel.startsWith('scripts/platform/')),
  ...(await fs.readdir(path.join(root, 'data'))).filter(name => /\.json$/.test(name)).map(name => `data/${name}`),
];

// 4. 按上传检查的规则先查一遍：不能带密钥文件；文本里不能有令牌（JWT、sk- 密钥、私钥）
const secretFile = /(^|\/)(\.env(\.(?!example$)[^/]*)?|[^/]*\.(pem|key|p12|pfx)|id_rsa[^/]*|id_ed25519[^/]*|credentials\.json)$/i;
const secretText = /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}|sk-[A-Za-z0-9]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----/;
for (const rel of files) {
  if (secretFile.test(rel)) problems.push(`不能打包密钥文件：${rel}`);
  if (/\.(m?js|json|py|md|html|css|txt|example)$/i.test(rel) && !rel.startsWith('public/platform/vendor/')) {
    const text = await fs.readFile(path.join(root, rel), 'utf8');
    if (secretText.test(text)) problems.push(`文件里像有密钥或令牌：${rel}`);
  }
  if (/\.(exe|dll|msi|dmg|asar|apk|ipa)$/i.test(rel)) problems.push(`不要打包桌面程序文件：${rel}`);
}

if (problems.length) {
  console.error(`没有打包：\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
await fs.mkdir(path.dirname(output), {recursive: true});
let done = 0;
const result = await writeZip(output, files.map(rel => ({name: rel, file: path.join(root, rel)})), () => {
  if (++done % 100 === 0) process.stdout.write(`已写入 ${done}/${files.length}\r`);
});
console.log(`已打包 ${result.files} 个文件，${(result.bytes / 1048576).toFixed(1)} MB：${path.relative(root, output)}`);
console.log('在微光平台「应用管理 → 新建应用」上传它；已有应用在「版本」里上传新版本。');
