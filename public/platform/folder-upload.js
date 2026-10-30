// 选择素材包文件夹：浏览器读出文件夹里的素材，逐个传到工作台的中转位置，导入接口拿到 upload:<编号> 照旧按文件夹导入。
// （服务器读不到你电脑上的路径，所以不再粘贴文件夹位置。）
const SUPPORTED = /\.(jpe?g|png|webp|psd|psb)$/i;
const LIMIT = 120;

export function folderPickerHtml({id = '', name = 'folderPath', label = '选择素材包文件夹'} = {}) {
  return `<span class="wb-folder-pick"><input type="hidden" name="${name}"${id ? ` id="${id}"` : ''}><button type="button" class="button" data-folder-pick>${label}</button><input type="file" webkitdirectory multiple hidden data-folder-input><small data-folder-status>还没有选择</small></span>`;
}

async function uploadFolder(files, onProgress) {
  const chosen = [...files].filter(file => SUPPORTED.test(file.name) && !file.name.startsWith('.') && !(file.webkitRelativePath || '').split('/').some(part => part.startsWith('.')));
  if (!chosen.length) throw new Error('文件夹里没有 JPG、PNG、WebP、PSD 或 PSB 素材');
  if (chosen.length > LIMIT) throw new Error(`素材包文件超过 ${LIMIT} 个，请精简后重试`);
  const id = crypto.randomUUID();
  let index = 0;
  for (const file of chosen) {
    const parts = (file.webkitRelativePath || file.name).split('/');
    const relative = (parts.length > 1 ? parts.slice(1) : parts).join('/');
    onProgress?.(`正在上传 ${++index}/${chosen.length}：${file.name}`);
    const response = await fetch(`/api/material-folder/upload/${id}?path=${encodeURIComponent(relative)}`, {method: 'PUT', headers: {'Content-Type': 'application/octet-stream'}, body: file});
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || `上传素材失败（HTTP ${response.status}）`);
    }
  }
  const megabytes = chosen.reduce((sum, file) => sum + file.size, 0) / 1048576;
  return {value: `upload:${id}`, summary: `已选 ${chosen.length} 个素材（${megabytes.toFixed(1)} MB）`};
}

// 给页面里的选择按钮接上事件；onChange 在上传完成后调用（参数是 upload:<编号>）。
export function bindFolderPickers(root, {onChange, onBusy} = {}) {
  for (const picker of root.querySelectorAll('.wb-folder-pick')) {
    if (picker.dataset.bound) continue;
    picker.dataset.bound = '1';
    const hidden = picker.querySelector('input[type=hidden]'), input = picker.querySelector('[data-folder-input]');
    const status = picker.querySelector('[data-folder-status]'), button = picker.querySelector('[data-folder-pick]');
    button.addEventListener('click', () => input.click());
    input.addEventListener('change', async () => {
      if (!input.files.length) return;
      button.disabled = true;
      onBusy?.(true);
      hidden.value = '';
      try {
        const result = await uploadFolder(input.files, text => { status.textContent = text; });
        hidden.value = result.value;
        status.textContent = result.summary;
        hidden.dispatchEvent(new Event('input', {bubbles: true}));
        onChange?.(result.value);
      } catch (error) {
        status.textContent = error.message;
      } finally {
        button.disabled = false;
        onBusy?.(false);
        input.value = '';
      }
    });
  }
}

// 不在表单里时（例如编辑器里的“导入素材包”）：弹出选择，返回 upload:<编号>；没选返回空字符串。
export function pickMaterialFolder(onProgress) {
  return new Promise((resolve, reject) => {
    const input = Object.assign(document.createElement('input'), {type: 'file', multiple: true});
    input.webkitdirectory = true;
    input.addEventListener('change', () => {
      if (!input.files.length) return resolve('');
      uploadFolder(input.files, onProgress).then(result => resolve(result.value), reject);
    });
    input.addEventListener('cancel', () => resolve(''));
    input.click();
  });
}
