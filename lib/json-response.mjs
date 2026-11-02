// 发 JSON 回应。GET 成功的回应带 ETag（内容摘要）：平台把 Cache-Control 统一改成 private, no-cache，浏览器每次都来核对，
// 内容没变就回 304、不再传一遍（首页汇总、任务、资产库这些一次几百 KB 到几 MB，服务器出口只有 1.5 MB/s）。
// 只认真正的请求（res.req）；/api/workbench/batch 在进程里转调各接口时没有 res.req，照常拿到完整内容。
import {createHash} from 'node:crypto';

/** If-None-Match 里有没有这个 ETag（弱比较：W/ 前缀不计）。 */
export function etagMatches(req, etag) {
  const header = req?.headers?.['if-none-match'];
  if (!header) return false;
  const bare = value => value.trim().replace(/^W\//, '');
  return header === '*' || header.split(',').map(bare).includes(bare(etag));
}

export function sendJson(res, status, value, headers = {}) {
  const body = Buffer.from(JSON.stringify(value));
  const req = res.req;
  if (status === 200 && (req?.method === 'GET' || req?.method === 'HEAD')) {
    const etag = `W/"${createHash('sha1').update(body).digest('base64url')}"`;
    const cached = {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-cache', ETag: etag, ...headers};
    if (etagMatches(req, etag)) { res.writeHead(304, cached); res.end(); return; }
    res.writeHead(200, {...cached, 'Content-Length': body.length});
    res.end(req.method === 'HEAD' ? undefined : body);
    return;
  }
  res.writeHead(status, {'Content-Type': 'application/json; charset=utf-8', 'Content-Length': body.length, 'Cache-Control': 'no-store', ...headers});
  res.end(body);
}
