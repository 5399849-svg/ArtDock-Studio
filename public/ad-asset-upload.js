import {validateAdUploadFile} from './ad-upload-policy.js?v=20261015-psd500';

export function adAssetUploadProgressText(file, progress) {
  if (progress.phase === 'processing') return /\.psd$/i.test(file.name) ? 'PSD 解析中…' : '正在处理素材…';
  return Number.isFinite(progress.percent) ? `正在上传 ${Math.round(progress.percent)}%…` : '正在上传素材…';
}

export function uploadAdAsset(batchId, file, {role = 'visual', requestId, onProgress, XMLHttpRequestClass = globalThis.XMLHttpRequest} = {}) {
  const validation = validateAdUploadFile(file);
  if (!validation.ok) return Promise.reject(Error(validation.error));
  if (!batchId || !['visual', 'logo'].includes(role)) return Promise.reject(Error('上传任务或素材用途无效。'));
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequestClass();
    const path = `/api/ad-resources/batches/${encodeURIComponent(batchId)}/assets/upload?name=${encodeURIComponent(file.name || '粘贴图片.png')}&role=${role}${requestId?`&requestId=${encodeURIComponent(requestId)}`:''}`;
    request.open('POST', path);
    request.setRequestHeader('Content-Type', 'application/octet-stream');
    request.responseType = 'json';
    request.timeout = 15 * 60 * 1000;
    let processing = false;
    const report = progress => onProgress?.({...progress, message: adAssetUploadProgressText(file, progress)});
    request.upload.onprogress = event => {
      if (processing) return;
      report({phase: 'uploading', loaded: event.loaded, total: event.lengthComputable ? event.total : file.size, percent: event.lengthComputable && event.total ? event.loaded / event.total * 100 : null});
    };
    request.upload.onload = () => {processing = true; report({phase: 'processing', loaded: file.size, total: file.size, percent: 100});};
    request.onload = () => {
      const response = request.response;
      if (request.status >= 200 && request.status < 300 && response?.asset?.id) resolve(response);
      else reject(Error(response?.error || `素材上传失败（${request.status || '无响应'}），请重试。`));
    };
    request.onerror = () => reject(Error('素材上传连接中断，请重试。'));
    request.ontimeout = () => reject(Error('素材上传或解析超时，请重试。'));
    request.onabort = () => reject(Error('素材上传已取消。'));
    report({phase: 'uploading', loaded: 0, total: file.size, percent: 0});
    request.send(file);
  });
}
