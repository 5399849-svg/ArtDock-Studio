export const PSD_UPLOAD_MAX_BYTES = 500 * 1024 * 1024;
export const IMAGE_UPLOAD_MAX_BYTES = 20 * 1024 * 1024;
export const AD_UPLOAD_LIMIT_TEXT = 'JPG、PNG、WebP 最大 20MB；PSD 最大 500MB。';

export function validateAdUploadFile(file) {
  const isPsd = /\.psd$/i.test(file?.name || '');
  const maxBytes = isPsd ? PSD_UPLOAD_MAX_BYTES : IMAGE_UPLOAD_MAX_BYTES;
  if (!file || (!isPsd && !['image/png', 'image/jpeg', 'image/webp'].includes(file.type))) {
    return {ok: false, isPsd, maxBytes, error: `支持 JPG、PNG、WebP 或 PSD。${AD_UPLOAD_LIMIT_TEXT}`};
  }
  if (!Number.isFinite(file.size) || file.size <= 0) {
    return {ok: false, isPsd, maxBytes, error: '文件为空或无法读取，请重新选择。'};
  }
  if (file.size > maxBytes) {
    return {ok: false, isPsd, maxBytes, error: `${file.name || '素材'} 超过 ${isPsd ? 500 : 20}MB 上限。${AD_UPLOAD_LIMIT_TEXT}`};
  }
  return {ok: true, isPsd, maxBytes, error: ''};
}

export function formatAdUploadFileSize(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.ceil(bytes / 1024))}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, '')}MB`;
}
