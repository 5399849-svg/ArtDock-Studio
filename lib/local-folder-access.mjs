export function isLocalWorkbenchRequest(request) {
  const address = request.socket?.remoteAddress;
  if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address)) return false;
  const host = request.headers?.host;
  const origin = request.headers?.origin;
  if (!host || !origin) return false;
  try {
    const url = new URL(origin);
    return url.protocol === 'http:' && url.host === host && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  } catch {
    return false;
  }
}
