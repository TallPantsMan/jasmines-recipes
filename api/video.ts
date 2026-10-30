import { requireLogin } from './_auth.js';
import { decodeEntities } from './instagram.js';

const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

type Platform = 'tiktok' | 'youtube';

function platformOf(rawUrl: string): Platform | null {
  let host = '';
  try {
    host = new URL(rawUrl).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (host === 'tiktok.com' || host.endsWith('.tiktok.com')) return 'tiktok';
  if (host === 'youtu.be' || host === 'youtube.com' || host.endsWith('.youtube.com')) return 'youtube';
  return null;
}

async function fetchImageAsDataUri(url: string): Promise<string> {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': DESKTOP_UA } });
    if (!r.ok) return '';
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length === 0 || buf.length > 3_000_000) return '';
    const type = r.headers.get('content-type') || 'image/jpeg';
    return `data:${type};base64,${buf.toString('base64')}`;
  } catch {
    return '';
  }
}

async function oembed(endpoint: string, url: string): Promise<any | null> {
  try {
    const r = await fetch(`${endpoint}${encodeURIComponent(url)}&format=json`, { headers: { 'User-Agent': DESKTOP_UA } });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

/** YouTube keeps the recipe in the video description, which is embedded in the watch page. */
async function youtubeDescription(url: string): Promise<string> {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': DESKTOP_UA, 'Accept-Language': 'en-US,en;q=0.9' } });
    if (!r.ok) return '';
    const html = await r.text();
    const m = html.match(/"shortDescription":"((?:[^"\\]|\\.)*)"/);
    if (m) {
      try {
        return JSON.parse(`"${m[1]}"`);
      } catch {
        return decodeEntities(m[1]);
      }
    }
    const meta = html.match(/<meta name="description" content="([^"]*)"/i);
    return meta ? decodeEntities(meta[1]) : '';
  } catch {
    return '';
  }
}

export default async function handler(req: any, res: any) {
  if (!requireLogin(req, res)) return;

  const rawUrl = String(req.query?.url || req.body?.url || '');
  const platform = platformOf(rawUrl);
  if (!platform) return res.status(400).json({ error: 'That is not a TikTok or YouTube link' });

  try {
    if (platform === 'tiktok') {
      const data = await oembed('https://www.tiktok.com/oembed?url=', rawUrl);
      if (!data) return res.status(404).json({ error: 'TikTok did not share this video', platform });
      const image = data.thumbnail_url ? await fetchImageAsDataUri(data.thumbnail_url) : '';
      return res.status(200).json({
        success: true,
        platform,
        caption: String(data.title || ''),
        title: '',
        authorName: data.author_name ? `@${String(data.author_name).replace(/^@/, '')}` : 'TikTok',
        image,
      });
    }

    const data = await oembed('https://www.youtube.com/oembed?url=', rawUrl);
    const description = await youtubeDescription(rawUrl);
    if (!data && !description) return res.status(404).json({ error: 'YouTube did not share this video', platform });
    const image = data?.thumbnail_url ? await fetchImageAsDataUri(data.thumbnail_url) : '';
    return res.status(200).json({
      success: true,
      platform,
      caption: description,
      title: String(data?.title || ''),
      authorName: data?.author_name || 'YouTube',
      image,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Could not read this video', platform });
  }
}
