// 工作台改成平台应用后，服务器上的 Python 都交给使用者的浏览器算（platform/local-compute.mjs），测试里没有浏览器。
// 本机有 local-ai/.venv 的 Python 时，测试直接用它跑这些脚本（和改造前一样）；没有就让依赖它的测试跳过，并写明原因。
import fs from 'node:fs';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {setLocalCompute} from '../../platform/local-compute.mjs';

const exec = promisify(execFile);
const root = fileURLToPath(new URL('../..', import.meta.url));
const python = [`${root}local-ai/.venv/Scripts/python.exe`, `${root}local-ai/.venv/bin/python`].find(file => fs.existsSync(file)) || null;

/** 给 test() 的 skip：本机没有 Python 时是跳过的原因，有就是 false。 */
export const withoutLocalPython = python ? false : '本机没有 local-ai/.venv 的 Python（这些脚本平时在浏览器里算）';

/** 让 localPython() 在本机 Python 里跑；没有 Python 时什么都不做。 */
export function useLocalPython() {
  if (python) setLocalCompute({runPython: (script, args = [], options = {}) => exec(python, [script, ...args], options)});
}
