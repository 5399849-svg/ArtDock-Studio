import { Worker } from "node:worker_threads";
import sharp from "sharp";
import { rebuildPngLosslessly } from "./png-rebuild.mjs";

const PNG_SIGNATURE = Buffer.from([137,80,78,71,13,10,26,10]);

// 纯计算的重压放到后台线程里（大图一次一两秒），服务器照常回应别的请求；线程起不来时照旧在这里算，结果一样。
function rebuildInWorker(source) {
  return new Promise((resolve, reject) => {
    // execArgv: [] 不继承父进程的启动参数（例如 --input-type 在线程里会让它起不来）。
    const worker = new Worker(new URL("./png-optimize-worker.mjs", import.meta.url), { workerData: source, execArgv: [] });
    worker.once("message", value => resolve(Buffer.from(value)));
    worker.once("error", reject);
    worker.once("exit", code => { if (code) reject(new Error(`PNG 优化线程异常退出（${code}）`)); });
  });
}

export async function optimizePngLosslessly(input) {
  const source = Buffer.from(input);
  if (source.length < 33 || !source.subarray(0, 8).equals(PNG_SIGNATURE)) return source;
  const [result, sharpResult] = await Promise.all([
    rebuildInWorker(source).catch(() => rebuildPngLosslessly(source)),
    sharp(source).png({ compressionLevel: 9, adaptiveFiltering: true, palette: false, effort: 10 }).toBuffer(),
  ]);
  return [source, result, sharpResult].reduce((best, item) => item.length < best.length ? item : best);
}
