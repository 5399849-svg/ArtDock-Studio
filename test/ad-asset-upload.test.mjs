import test from 'node:test';
import assert from 'node:assert/strict';
import {File} from 'node:buffer';
import {PSD_UPLOAD_MAX_BYTES, IMAGE_UPLOAD_MAX_BYTES, validateAdUploadFile, formatAdUploadFileSize} from '../public/ad-upload-policy.js';
import {uploadAdAsset} from '../public/ad-asset-upload.js';

function fileWithSize(name, type, size) {
  const file = new File(['8BPS'], name, {type});
  Object.defineProperty(file, 'size', {value: size});
  return file;
}

test('PSD accepts 81MB and exactly 500MB, while images retain the 20MB limit', () => {
  for (const size of [81 * 1024 * 1024, PSD_UPLOAD_MAX_BYTES]) assert.equal(validateAdUploadFile(fileWithSize('场景.PSD', '', size)).ok, true);
  assert.equal(validateAdUploadFile(fileWithSize('场景.psd', '', PSD_UPLOAD_MAX_BYTES + 1)).ok, false);
  assert.equal(validateAdUploadFile(fileWithSize('场景.png', 'image/png', IMAGE_UPLOAD_MAX_BYTES)).ok, true);
  assert.equal(validateAdUploadFile(fileWithSize('场景.png', 'image/png', IMAGE_UPLOAD_MAX_BYTES + 1)).ok, false);
  assert.equal(validateAdUploadFile(fileWithSize('场景.gif', 'image/gif', 100)).ok, false);
  assert.equal(validateAdUploadFile(fileWithSize('场景.psd', '', 0)).ok, false);
  assert.equal(formatAdUploadFileSize(81 * 1024 * 1024), '81MB');
});

function transport() {
  const requests = [];
  class Request {
    constructor() {this.upload = {}; this.headers = {}; requests.push(this);}
    open(method, url) {this.method = method; this.url = url;}
    setRequestHeader(name, value) {this.headers[name] = value;}
    send(body) {this.body = body;}
  }
  return {requests, Request};
}

test('uploads the original File as binary and keeps the PSD parsing state until the server returns', async () => {
  const {requests, Request} = transport();
  const file = fileWithSize('大场景 & 人物.psd', '', 81 * 1024 * 1024);
  const progress = [];
  const promise = uploadAdAsset('task/1', file, {XMLHttpRequestClass: Request, onProgress: event => progress.push(event)});
  const request = requests[0];
  assert.equal(request.method, 'POST');
  assert.equal(request.headers['Content-Type'], 'application/octet-stream');
  assert.equal(request.body, file);
  const path = new URL(request.url, 'http://localhost');
  assert.equal(path.pathname, '/api/ad-resources/batches/task%2F1/assets/upload');
  assert.equal(path.searchParams.get('name'), file.name);
  assert.equal(path.searchParams.get('role'), 'visual');
  request.upload.onprogress({loaded: 10, total: 20, lengthComputable: true});
  assert.equal(progress.at(-1).message, '正在上传 50%…');
  request.upload.onload();
  assert.equal(progress.at(-1).message, 'PSD 解析中…');
  request.upload.onprogress({loaded: 20, total: 20, lengthComputable: true});
  assert.equal(progress.at(-1).phase, 'processing');
  request.status = 201;
  request.response = {asset: {id: 'asset-1'}, derivedAssets: [{id: 'derived-1'}], logoUpdate: null};
  request.onload();
  assert.deepEqual(await promise, request.response);
});

test('rejects oversize files before any request and surfaces server or connection errors', async () => {
  const {requests, Request} = transport();
  await assert.rejects(uploadAdAsset('task', fileWithSize('too-big.psd', '', PSD_UPLOAD_MAX_BYTES + 1), {XMLHttpRequestClass: Request}), /500MB/);
  assert.equal(requests.length, 0);
  const file = new File(['png'], 'logo.png', {type: 'image/png'});
  const failure = uploadAdAsset('task', file, {role: 'logo', XMLHttpRequestClass: Request});
  requests[0].status = 413;
  requests[0].response = {error: '文件超过上传上限'};
  requests[0].onload();
  await assert.rejects(failure, /文件超过上传上限/);
  const disconnected = uploadAdAsset('task', file, {XMLHttpRequestClass: Request});
  requests[1].onerror();
  await assert.rejects(disconnected, /连接中断/);
});
