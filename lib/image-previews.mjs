// 页面上显示的图片一律给压缩过的（做法同 QCanvas 的 ?w= 预览；2026-10-30 用户：“所有图片都按压缩的走”）：
// - 地址后面带 ?w=<档位>（列表、卡片、缩略条）：最长边不超过这个档位的 WebP（质量 86，只缩小不放大，透明保留）；
//   档位只认 PREVIEW_WIDTHS 里的值，别的写法照旧给原图；
// - 不带 ?w=、但是浏览器为了显示而取的图（<img>、编辑器画布读的图：请求头 Sec-Fetch-Dest: image）：尺寸不变的压缩版，
//   不透明的用有损 WebP 质量 90，带透明的（主标、Logo、按钮、抠图）用近无损 WebP，文字边缘不发虚。尺寸不变，编辑器按原图
//   宽高算的位置、导出的尺寸都不变；
// - 下载、打包、浏览器计算（fetch，不是 image）照旧给原图；
// - 所有图片都带 ETag、Last-Modified：平台把 Cache-Control 统一改成 private, no-cache，浏览器每次核对，没变就 304，不再重下；
//   同一个地址按 Sec-Fetch-Dest 给不同内容，所以带 Vary；
// - 压缩版第一次生成后放在数据目录的 .previews/<原图相对数据目录的路径>/ 下，文件名带原图大小和修改时间：原图改了就是新名字，
//   原图彻底删除时一起删掉（forget）；定时清理删掉原图已经不在、已经改过的，和 30 天没人读的；空闲时把已有的图提前转好（warm）；
// - 动图（GIF、动态 WebP）、PSD 和其他非图片，以及生成失败、超时、压缩后反而更大的，都照旧给原图：请求不会因此打不开。
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import sharp from 'sharp';

export const PREVIEW_WIDTHS = [128, 256, 384, 512, 768, 1024, 1536, 2048];
const PREVIEW_QUALITY = 86;
// 尺寸不变的压缩版：不透明的有损质量 90（实测 PSNR 40～44 dB），带透明的近无损 60（实测最差 48 dB）。
const FULL_QUALITY = 90, FULL_NEAR_LOSSLESS = 60;
const RESIZABLE = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
};
// 同时最多做两张，免得一页几十张图一起占满 CPU；一张最多等 15 秒，超时的原图 5 分钟内直接给原图。提前转图只在没人等的时候做，一次一张。
const MAX_CONCURRENT = 2;
const RENDER_DEADLINE_MS = 15_000;
const TIMEOUT_MEMO_MS = 5 * 60_000;
const MAX_SOURCE_PIXELS = 250_000_000;
const PREVIEW_DIR = '.previews';

/** 请求里的 ?w=：只认档位表里的值（页面按显示大小往上取档），别的写法返回 null。 */
export function previewWidth(value) {
  if (typeof value !== 'string' || !/^[1-9]\d{0,4}$/.test(value)) return null;
  const width = Number(value);
  return PREVIEW_WIDTHS.includes(width) ? width : null;
}

/** 这次请求要哪种：{width} 缩小的预览、{full: true} 尺寸不变的压缩版，或 null 原图。 */
export function requestedVariant(req, url, ext) {
  if (!RESIZABLE.has(ext) || req.headers?.range) return null;
  const width = previewWidth(url?.searchParams?.get('w') ?? undefined);
  if (width) return {width};
  return req.headers?.['sec-fetch-dest'] === 'image' ? {full: true} : null;
}

const etagOf = (stat, extra = '') => `W/"${stat.size.toString(16)}-${Math.trunc(stat.mtimeMs).toString(16)}${extra}"`;
const fresh = (req, etag, stat) => {
  const match = req.headers?.['if-none-match'];
  if (match) return match.split(',').map(value => value.trim()).includes(etag);
  const since = Date.parse(req.headers?.['if-modified-since'] || '');
  return Number.isFinite(since) && Math.trunc(stat.mtimeMs / 1000) <= Math.trunc(since / 1000);
};

function sendStream(req, res, file, stat, type, etag, extra = {}) {
  const headers = {'Content-Type': type, ETag: etag, 'Last-Modified': new Date(stat.mtimeMs).toUTCString(), 'Cache-Control': 'private, no-cache', 'X-Content-Type-Options': 'nosniff', ...extra};
  if (fresh(req, etag, stat)) { res.writeHead(304, headers); res.end(); return Promise.resolve(); }
  res.writeHead(200, {...headers, 'Content-Length': stat.size});
  if (req.method === 'HEAD') { res.end(); return Promise.resolve(); }
  return new Promise((resolve, reject) => {
    const stream = fs.createReadStream(file);
    stream.on('error', error => { res.destroy(error); reject(error); });
    res.on('close', () => { stream.destroy(); resolve(); });
    stream.pipe(res);
  });
}

export function createImagePreviews({runtimeDir, log = console}) {
  const cacheDir = path.join(runtimeDir, PREVIEW_DIR);
  const running = new Map(), timedOut = new Map();
  let active = 0;
  const queue = [];
  const slot = () => new Promise(resolve => { if (active < MAX_CONCURRENT) { active++; resolve(); } else queue.push(resolve); });
  const release = () => { const next = queue.shift(); if (next) next(); else active--; };

  // 一张原图的压缩版都在它自己的文件夹里；文件名带种类、质量、原图大小和修改时间，原图一变就是新名字，不会拿到旧的。
  // 数据目录以外的图片（目前没有）不做。
  const previewDir = file => {
    const relative = path.relative(runtimeDir, path.resolve(file));
    return !relative || relative.startsWith('..') || path.isAbsolute(relative) || relative.split(path.sep)[0] === PREVIEW_DIR ? null : path.join(cacheDir, relative);
  };
  const stamp = stat => `${stat.size.toString(16)}-${Math.trunc(stat.mtimeMs).toString(16)}`;
  const variantName = (stat, variant) => variant.full ? `full-q${FULL_QUALITY}nl${FULL_NEAR_LOSSLESS}-${stamp(stat)}.webp` : `w${variant.width}-q${PREVIEW_QUALITY}-${stamp(stat)}.webp`;
  const cacheFile = (file, stat, variant) => { const dir = previewDir(file); return dir ? path.join(dir, variantName(stat, variant)) : null; };

  async function render(file, target, variant) {
    const image = sharp(file, {animated: false, sequentialRead: true, limitInputPixels: MAX_SOURCE_PIXELS, failOn: 'none'});
    const meta = await image.metadata();
    // 动图压成静态图会丢动画，照旧给原图。
    if ((meta.pages || 1) > 1) return null;
    await fsp.mkdir(path.dirname(target), {recursive: true});
    // 临时文件名尽量短：Windows 上整条路径超过 260 个字符就写不进去。
    const temporary = `${target}.${randomBytes(4).toString('hex')}.tmp`;
    try {
      const pipeline = image.rotate();
      if (variant.full) pipeline.webp(meta.hasAlpha ? {nearLossless: true, quality: FULL_NEAR_LOSSLESS, effort: 4} : {quality: FULL_QUALITY, effort: 4});
      else pipeline.resize({width: variant.width, height: variant.width, fit: 'inside', withoutEnlargement: true}).webp({quality: PREVIEW_QUALITY, alphaQuality: 90, effort: 4});
      await pipeline.toFile(temporary);
      // 压缩后反而比原图大（原图本来就很小，或已经是压缩过的）时不用它。
      const [made, original] = await Promise.all([fsp.stat(temporary), fsp.stat(file)]);
      if (made.size >= original.size) return null;
      await fsp.rename(temporary, target);
      return target;
    } finally {
      await fsp.rm(temporary, {force: true});
    }
  }

  async function generate(file, target, variant) {
    await slot();
    let timer;
    const deadline = new Promise((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error('生成压缩图超时'), {code: 'PREVIEW_TIMEOUT'})), RENDER_DEADLINE_MS); });
    try {
      return await Promise.race([render(file, target, variant), deadline]);
    } catch (error) {
      if (error.code === 'PREVIEW_TIMEOUT') timedOut.set(file, Date.now() + TIMEOUT_MEMO_MS);
      throw error;
    } finally {
      clearTimeout(timer);
      release();
    }
  }

  // 压缩后不比原图小的，记一个空标记，免得每次都重做一遍。
  const skipFile = target => `${target}.skip`;
  async function preview(file, stat, variant) {
    if ((timedOut.get(file) || 0) > Date.now()) return null;
    const target = cacheFile(file, stat, variant);
    if (!target) return null;
    const cached = await fsp.stat(target).catch(() => null);
    if (cached?.isFile()) {
      // 记下最近用过（按修改时间清理；很多服务器不更新访问时间）。
      if (Date.now() - cached.mtimeMs > 24 * 3600_000) await fsp.utimes(target, new Date(), new Date()).catch(() => {});
      return target;
    }
    if (await fsp.stat(skipFile(target)).then(() => true, () => false)) return null;
    if (!running.has(target)) running.set(target, generate(file, target, variant).then(async made => {
      if (!made) await fsp.writeFile(skipFile(target), '').catch(() => {});
      return made;
    }).finally(() => running.delete(target)));
    return running.get(target);
  }

  /** 发一个文件：显示用的图片给压缩版（见文件开头），其余给原文件；都带 ETag。文件不存在返回 false。 */
  async function serve(req, res, file, url) {
    let stat;
    try { stat = await fsp.stat(file); } catch { return false; }
    if (!stat.isFile()) return false;
    const ext = path.extname(file).toLowerCase(), type = MIME[ext] || 'application/octet-stream';
    const vary = RESIZABLE.has(ext) ? {Vary: 'Sec-Fetch-Dest'} : {};
    const variant = requestedVariant(req, url, ext);
    if (variant) {
      try {
        const made = await preview(file, stat, variant);
        if (made) { await sendStream(req, res, made, await fsp.stat(made), 'image/webp', etagOf(stat, variant.full ? '-full' : `-w${variant.width}`), vary); return true; }
      } catch (error) {
        // 坏图、超大图、超时：给原图，页面照样能看。
        log.warn?.(`[图片压缩] ${path.basename(file)} 没生成压缩图，返回原图：${error.message}`);
      }
    }
    await sendStream(req, res, file, stat, type, etagOf(stat), vary);
    return true;
  }

  /** 原图彻底删除时调用：它的压缩版一起删掉。 */
  async function forget(file) {
    const dir = previewDir(file);
    if (dir) await fsp.rm(dir, {recursive: true, force: true});
  }

  // 每 6 小时清一次：原图已经不在或改过的压缩版删掉，30 天没被读过的也删掉。
  async function sweep(maxAgeMs = 30 * 24 * 3600_000) {
    const cutoff = Date.now() - maxAgeMs;
    const visit = async dir => {
      const entries = await fsp.readdir(dir, {withFileTypes: true}).catch(() => []);
      const variants = entries.filter(entry => entry.isFile() && /\.webp(?:\.skip)?$/.test(entry.name));
      if (variants.length) {
        const original = path.join(runtimeDir, path.relative(cacheDir, dir));
        const stat = await fsp.stat(original).catch(() => null);
        if (!stat?.isFile()) { await fsp.rm(dir, {recursive: true, force: true}); return; }
        const current = `-${stamp(stat)}.webp`;
        for (const entry of variants) {
          const file = path.join(dir, entry.name), s = await fsp.stat(file).catch(() => null);
          if (!entry.name.replace(/\.skip$/, '').endsWith(current) || (s && s.mtimeMs < cutoff)) await fsp.rm(file, {force: true});
        }
      }
      for (const entry of entries) if (entry.isDirectory()) await visit(path.join(dir, entry.name));
      await fsp.rmdir(dir).catch(() => {});
    };
    await visit(cacheDir);
  }

  /**
   * 空闲时把 folder 下已有的图片提前转成尺寸不变的压缩版，第一次打开任务就不用现转。没人在等压缩图时才做，一次一张，
   * 每张之间歇一下；不设 15 秒期限（没人在等）。返回转了多少张。
   */
  let warming = null;
  async function warm(folder, {pauseMs = 200} = {}) {
    if (warming) return warming;
    warming = (async () => {
      let made = 0, seen = 0;
      const visit = async dir => {
        for (const entry of await fsp.readdir(dir, {withFileTypes: true}).catch(() => [])) {
          const file = path.join(dir, entry.name);
          if (entry.isDirectory()) { await visit(file); continue; }
          if (!entry.isFile() || !RESIZABLE.has(path.extname(entry.name).toLowerCase())) continue;
          seen++;
          const stat = await fsp.stat(file).catch(() => null), target = stat && cacheFile(file, stat, {full: true});
          if (!target || running.has(target) || await fsp.stat(target).then(() => true, () => false) || await fsp.stat(skipFile(target)).then(() => true, () => false)) continue;
          while (active > 0 || queue.length) await new Promise(resolve => setTimeout(resolve, 1000));
          active++;
          try {
            const done = await render(file, target, {full: true}).catch(() => null);
            if (done) made++; else await fsp.writeFile(skipFile(target), '').catch(() => {});
          } finally { release(); }
          await new Promise(resolve => setTimeout(resolve, pauseMs));
        }
      };
      await visit(folder);
      log.info?.(`[图片压缩] 提前转好 ${made} 张（共看了 ${seen} 张）`);
      return made;
    })().finally(() => { warming = null; });
    return warming;
  }

  const timer = setInterval(() => { void sweep().catch(() => {}); }, 6 * 3600_000);
  timer.unref?.();

  return {serve, forget, sweep, warm, cacheDir};
}
