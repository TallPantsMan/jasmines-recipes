/** Refuse addresses that point back into a private network, so our routes can't be used to probe one */
export function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return (
    h === 'localhost' ||
    h.endsWith('.local') ||
    h.endsWith('.internal') ||
    /^(?:127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(h) ||
    /^172\.(?:1[6-9]|2\d|3[01])\./.test(h) ||
    h === '::1' ||
    h.startsWith('[')
  );
}
