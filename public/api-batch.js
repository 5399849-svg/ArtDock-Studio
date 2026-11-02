// 同一时刻发出的多个只读请求合成一个（/api/workbench/batch）：服务器出网带宽小、请求要排队时，首页汇总只等一次往返，
// 不用二十多个请求各排一次队。服务器在内部逐个走原来的接口（权限照旧核对），按顺序返回 {status, body}。
// 合并请求本身失败（例如还是旧版本的服务器）时，退回一个个单独请求。
export function batchedGet(api) {
  let pending = [], timer = null;
  const failure = result => new Error(result?.body?.error || result?.body?.errors?.join?.('；') || `请求失败（${result?.status ?? '无响应'}）`);
  const flush = async () => {
    const calls = pending;
    pending = []; timer = null;
    if (calls.length === 1) { api(calls[0].url).then(calls[0].resolve, calls[0].reject); return; }
    let results;
    try {
      results = (await api(`/api/workbench/batch?${calls.map(call => `p=${encodeURIComponent(call.url)}`).join('&')}`)).results;
      if (!Array.isArray(results) || results.length !== calls.length) throw new Error('合并请求的结果不完整');
    } catch {
      for (const call of calls) api(call.url).then(call.resolve, call.reject);
      return;
    }
    calls.forEach((call, index) => {
      const result = results[index];
      if (result?.status >= 200 && result.status < 300) call.resolve(result.body); else call.reject(failure(result));
    });
  };
  return (url, options) => {
    if (options?.method && options.method !== 'GET') return api(url, options);
    return new Promise((resolve, reject) => {
      pending.push({url, resolve, reject});
      if (!timer) timer = setTimeout(flush, 0);
    });
  };
}
