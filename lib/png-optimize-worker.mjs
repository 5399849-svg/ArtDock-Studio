// 后台线程：收到 PNG，做纯计算的无损重压（lib/png-rebuild.mjs），把结果传回去。
import { parentPort, workerData } from "node:worker_threads";
import { rebuildPngLosslessly } from "./png-rebuild.mjs";

const result = rebuildPngLosslessly(Buffer.from(workerData));
parentPort.postMessage(result);
