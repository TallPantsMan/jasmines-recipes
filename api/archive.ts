import { requireLogin } from './_auth.js';
import { isBlockedHost } from './_net.js';

// For recipe pages that block automated visitors: asks the Internet Archive (a public library of saved web pages)
// for its newest saved copy and returns that page's HTML, the same shape as /api/page.
export default async function handler(req: any, res: any) {
  if (!requireLogin(req, res)) return;

  let target: URL;
  try {
    target = new URL(String(req.query?.url));
  } catch {
    return res.status(400).json({ error: 'Missing or invalid url parameter' });
  }
  if (!/^https?:$/.test(target.protocol) || isBlockedHost(target.hostname)) {
    return res.status(400).json({ error: 'That address cannot be fetched' });
  }

  try {
    const look = await fetch(`https://archive.org/wayback/available?url=${encodeURIComponent(target.href)}`, {
      signal: AbortSignal.timeout(10000),
    });
    const found: any = await look.json().catch(() => null);
    const snap = found?.archived_snapshots?.closest;
    if (!snap?.available || !/^\d{14}$/.test(String(snap.timestamp))) return res.status(404).json({ error: 'No saved copy of that page' });

    // The "id_" form returns the page exactly as it was saved, without the Archive's own toolbar
    const r = await fetch(`https://web.archive.org/web/${snap.timestamp}id_/${target.href}`, {
      redirect: 'follow',
      headers: { Accept: 'text/html,application/xhtml+xml' },
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) return res.status(502).json({ error: `Archive answered ${r.status}` });
    const html = await r.text();
    if (html.length > 4_000_000) return res.status(502).json({ error: 'Page too large' });
    return res.status(200).json({ html, finalUrl: target.href, savedOn: String(snap.timestamp).slice(0, 8) });
  } catch (err: any) {
    return res.status(502).json({ error: err?.message || 'Archive lookup failed' });
  }
}
