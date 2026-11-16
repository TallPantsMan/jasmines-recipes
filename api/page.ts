import { requireLogin } from './_auth.js';
import { isBlockedHost } from './_net.js';

const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// Fetches a recipe web page on the server (no browser CORS limits) and returns its HTML.
export default async function handler(req: any, res: any) {
  if (!requireLogin(req, res)) return;

  const raw = req.query?.url;
  let target: URL;
  try {
    target = new URL(String(raw));
  } catch {
    return res.status(400).json({ error: 'Missing or invalid url parameter' });
  }
  if (!/^https?:$/.test(target.protocol) || isBlockedHost(target.hostname)) {
    return res.status(400).json({ error: 'That address cannot be fetched' });
  }

  try {
    const r = await fetch(target.href, {
      redirect: 'follow',
      headers: { 'User-Agent': DESKTOP_UA, Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'en-US,en;q=0.9' },
    });
    if (!r.ok) return res.status(502).json({ error: `Site answered ${r.status}` });
    const html = await r.text();
    if (html.length > 4_000_000) return res.status(502).json({ error: 'Page too large' });
    return res.status(200).json({ html, finalUrl: r.url });
  } catch (err: any) {
    return res.status(502).json({ error: err.message || 'Fetch failed' });
  }
}
