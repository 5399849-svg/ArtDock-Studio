// 首页一打开就让浏览器同时下载全部脚本：发 index.html 时，把它的 <script type="module"> 一层层静态 import 到的
// 模块都写成 <link rel="modulepreload">。不写的话浏览器要读完一个文件才知道下一层要哪些，一百多个文件得一层层等。
// - 地址照 import 里写的原样（含 ?v=），按导入它的文件解析：地址不一样浏览器就当成另一个模块，预载等于白下；
// - 只管静态的 import / export from，动态 import() 是用到时才要的，不预载；
// - 每次请求重新核对文件的修改时间，改过的文件重新读，所以改了 import 不用重启。
import fsp from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';

const IMPORT = /(?:^|[;}\n])\s*(?:import\s*(?:[\w$*{}\s,]+?\s*from\s*)?|export\s*(?:\*(?:\s*as\s+[\w$]+)?|\{[^}]*\})\s*from\s*)["']([^"'\n]+)["']/g;
const MODULE_SCRIPT = /<script\b[^>]*\btype=["']module["'][^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
const BASE = 'http://workbench.local';

/** 文件里静态 import 的地址（原样）。整行注释掉的不算（只认行首的注释，免得把字符串里的 // 、/* 当成注释）。 */
export function staticImports(source) {
  const code = source.replace(/^\s*\/\*[\s\S]*?\*\//gm, '').replace(/^\s*\/\/.*$/gm, '');
  return [...code.matchAll(IMPORT)].map(match => match[1]);
}

export function createModulePreloads(publicDir) {
  const parsed = new Map(); // 文件 → {mtimeMs, size, imports}

  async function importsOf(file) {
    const stat = await fsp.stat(file).catch(() => null);
    if (!stat?.isFile()) return null;
    const known = parsed.get(file);
    if (known && known.mtimeMs === stat.mtimeMs && known.size === stat.size) return known.imports;
    const imports = staticImports(await fsp.readFile(file, 'utf8'));
    parsed.set(file, {mtimeMs: stat.mtimeMs, size: stat.size, imports});
    return imports;
  }

  /** 同源、在 public 里的模块地址 → 文件；别的（外站、裸模块名、跑出 public）返回 null。 */
  function fileFor(url) {
    if (url.origin !== BASE) return null;
    const file = path.resolve(publicDir, '.' + decodeURIComponent(url.pathname));
    return file.startsWith(path.resolve(publicDir) + path.sep) ? file : null;
  }

  /** 从这些入口出发能静态导入到的全部模块地址（不含入口本身，按发现顺序）。 */
  async function moduleGraph(entries) {
    const seen = new Set(entries), order = [], missing = new Set();
    let layer = entries;
    while (layer.length) {
      // 同一层并行读文件，但按层里的顺序收结果：列表顺序固定，首页内容和 ETag 才不会因为谁先读完而变。
      const imported = await Promise.all(layer.map(async href => {
        const from = new URL(href, BASE), file = fileFor(from);
        return {href, from, imports: file && await importsOf(file)};
      }));
      const next = [];
      for (const {href, from, imports} of imported) {
        if (!imports) { missing.add(href); continue; }
        for (const specifier of imports) {
          if (!/^(?:\/|\.\.?\/)/.test(specifier)) continue;
          const url = new URL(specifier, from);
          const target = url.pathname + url.search;
          if (seen.has(target) || !fileFor(url)) continue;
          seen.add(target);
          next.push(target);
        }
      }
      order.push(...next);
      layer = next;
    }
    // 不存在的文件不预载（让真正导入它的地方照常报错）。
    return order.filter(href => !missing.has(href));
  }

  /** index.html 加上预载列表后的内容和 ETag。 */
  async function render(indexFile) {
    const html = await fsp.readFile(indexFile, 'utf8');
    const entries = [...html.matchAll(MODULE_SCRIPT)].map(match => {const url = new URL(match[1], BASE + '/'); return url.pathname + url.search;});
    const links = (await moduleGraph(entries)).map(href => `<link rel="modulepreload" href="${href.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}">`).join('');
    const body = links ? html.replace(/<\/head>/i, `${links}</head>`) : html;
    return {body, etag: `W/"${createHash('sha1').update(body).digest('hex').slice(0, 20)}"`};
  }

  /** 发 index.html（带预载列表）；If-None-Match 对上就 304。 */
  async function serveIndex(req, res, indexFile) {
    const {body, etag} = await render(indexFile);
    const headers = {'Content-Type': 'text/html; charset=utf-8', ETag: etag, 'Cache-Control': 'private, no-cache', 'X-Content-Type-Options': 'nosniff'};
    const match = req.headers?.['if-none-match'];
    if (match && match.split(',').map(value => value.trim()).includes(etag)) { res.writeHead(304, headers); res.end(); return; }
    res.writeHead(200, {...headers, 'Content-Length': Buffer.byteLength(body)});
    res.end(req.method === 'HEAD' ? undefined : body);
  }

  return {render, serveIndex, moduleGraph};
}
