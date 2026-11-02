import assert from 'node:assert/strict';
import test from 'node:test';
import { isLocalWorkbenchRequest } from '../lib/local-folder-access.mjs';

const request = (address, host = '127.0.0.1:4173', origin = 'http://127.0.0.1:4173') => ({
  socket: { remoteAddress: address }, headers: { host, origin },
});

test('explicit external-folder access requires the local workbench page', () => {
  assert.equal(isLocalWorkbenchRequest(request('127.0.0.1')), true);
  assert.equal(isLocalWorkbenchRequest(request('::ffff:127.0.0.1')), true);
  assert.equal(isLocalWorkbenchRequest(request('192.168.1.5')), false);
  assert.equal(isLocalWorkbenchRequest(request('127.0.0.1', '127.0.0.1:4173', 'http://another-site.test')), false);
  const noOrigin = request('127.0.0.1');
  delete noOrigin.headers.origin;
  assert.equal(isLocalWorkbenchRequest(noOrigin), false);
});
