const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1';

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', ndash: '–', mdash: '—',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', deg: '°', frac12: '½', frac14: '¼',
  frac34: '¾', times: '×', bull: '•', middot: '·', eacute: 'é', egrave: 'è', ntilde: 'ñ',
};

/** Decodes named (&amp;) and numeric (&#064; / &#x40;) HTML entities. */
export function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&([a-z0-9]+);/gi, (m, name) => NAMED_ENTITIES[name.toLowerCase()] ?? m)
    .replace(/\\u0026/g, '&')
    .replace(/\\\//g, '/');
}

const htmlToText = (html: string) =>
  decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(?:p|div|li)>/gi, '\n')
      .replace(/<li[^>]*>/gi, '• ')
      .replace(/<[^>]+>/g, '')
  )
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

export interface EmbedData {
  caption: string;
  username: string;
  imageUrl: string;
}

/** Pulls the caption, poster's username and cover image URL out of an Instagram /embed/captioned/ page. */
export function extractEmbed(html: string): EmbedData {
  let caption = '';
  let username = '';

  const start = html.search(/<div[^>]*class="Caption"[^>]*>/i);
  if (start >= 0) {
    const open = html.slice(start).match(/^<div[^>]*>/i)![0];
    let block = html.slice(start + open.length);
    // The caption ends where the "View all N comments" link / footer begins
    const end = block.search(/<div[^>]*class="(?:CaptionComments|Footer)"/i);
    block = end >= 0 ? block.slice(0, end) : (block.match(/^([\s\S]*?)<\/div>/i)?.[1] ?? block);

    // The poster's @name is the first link inside the caption; it is not part of the caption text
    const user = block.match(/<a[^>]*class="CaptionUsername"[^>]*>([^<]*)<\/a>/i);
    if (user) {
      username = decodeEntities(user[1]).trim().replace(/^@/, '');
      block = block.replace(user[0], '');
    }
    caption = htmlToText(block);
  }

  // Backup 1: caption embedded as JSON in a script tag
  if (!caption) {
    const json = html.match(/"caption":\{"text":"((?:[^"\\]|\\.)*)"/);
    if (json) {
      try {
        caption = JSON.parse(`"${json[1]}"`);
      } catch {
        caption = decodeEntities(json[1]);
      }
    }
  }

  // Backup 2: og:description, which looks like: 123 likes, 4 comments - user on March 3, 2024: "caption".
  if (!caption) {
    const meta =
      html.match(/property="og:description"\s+content="([^"]*)"/i) || html.match(/content="([^"]*)"\s+property="og:description"/i);
    if (meta) {
      const text = decodeEntities(meta[1]);
      const m = text.match(/^[\d.,KkMm]+ likes?,\s*[\d.,KkMm]+ comments?\s*-\s*([\w.]+) on [^:]+:\s*["“]?([\s\S]*?)["”]?\.?$/);
      if (m) {
        username = username || m[1];
        caption = m[2];
      } else {
        caption = text;
      }
    }
  }

  const imagePatterns = [
    /class="EmbeddedMediaImage"[^>]*?src="([^"]+)"/i,
    /<img[^>]*class="[^"]*EmbeddedMediaImage[^"]*"[^>]*?src="([^"]+)"/i,
    /property="og:image"\s+content="([^"]+)"/i,
    /content="([^"]+)"\s+property="og:image"/i,
    /"display_url":"([^"]+)"/i,
    /"thumbnail_src":"([^"]+)"/i,
  ];
  let imageUrl = '';
  for (const re of imagePatterns) {
    const m = html.match(re);
    if (m && m[1]) {
      imageUrl = decodeEntities(m[1]);
      break;
    }
  }

  return { caption, username, imageUrl };
}

// Instagram CDN links expire and block hotlinking, so we download the cover and return it inline.
async function fetchImageAsDataUri(url: string): Promise<string> {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': MOBILE_UA, Referer: 'https://www.instagram.com/' } });
    if (!r.ok) return '';
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length === 0 || buf.length > 3_000_000) return '';
    const type = r.headers.get('content-type') || 'image/jpeg';
    return `data:${type};base64,${buf.toString('base64')}`;
  } catch {
    return '';
  }
}

const SHORTCODE_RE = /\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/;

/** instagram.com/share/reel/XXXX links are redirects to the real post; follow them to find the real shortcode. */
async function resolveShortcode(rawUrl: string): Promise<string | null> {
  if (/\/share\//.test(rawUrl)) {
    try {
      const r = await fetch(rawUrl, { redirect: 'follow', headers: { 'User-Agent': MOBILE_UA } });
      const resolved = r.url.match(SHORTCODE_RE);
      if (resolved) return resolved[1];
    } catch {
      /* fall through to the code in the link itself */
    }
  }
  const direct = rawUrl.match(SHORTCODE_RE) || rawUrl.match(/\/share\/reel\/([A-Za-z0-9_-]+)/);
  return direct ? direct[1] : null;
}

export default async function handler(req: any, res: any) {
  // CORS configuration
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const rawUrl = req.query?.url || req.body?.url;
  if (!rawUrl) {
    return res.status(400).json({ error: 'Missing Instagram url parameter' });
  }

  const shortcode = await resolveShortcode(String(rawUrl));
  if (!shortcode) {
    return res.status(400).json({ error: 'Could not extract shortcode from Instagram URL' });
  }

  // A username in the URL (instagram.com/feelgoodfoodie/reel/...) is the fallback if the page doesn't name the poster
  const userMatch = String(rawUrl).match(/instagram\.com\/([A-Za-z0-9_.-]+)\/(?:reel|p)\//);
  const urlUser = userMatch && !['p', 'reel', 'reels', 'share', 'tv'].includes(userMatch[1]) ? userMatch[1] : '';

  try {
    const embedUrl = `https://www.instagram.com/p/${shortcode}/embed/captioned/`;
    const response = await fetch(embedUrl, {
      headers: {
        'User-Agent': MOBILE_UA,
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    if (response.ok) {
      const html = await response.text();
      const { caption, username, imageUrl } = extractEmbed(html);
      const image = imageUrl ? await fetchImageAsDataUri(imageUrl) : '';
      const handle = username || urlUser;

      if (caption || image) {
        return res.status(200).json({
          success: !!caption,
          shortcode,
          image,
          caption,
          username: handle,
          authorName: handle ? `@${handle}` : 'Instagram Reel',
          url: rawUrl,
        });
      }
    }

    return res.status(404).json({
      error: 'Caption could not be extracted directly from this Instagram link (login wall)',
      shortcode,
      authorName: urlUser ? `@${urlUser}` : 'Instagram Reel',
    });
  } catch (err: any) {
    return res.status(500).json({
      error: err.message || 'Scrape failed',
      shortcode,
    });
  }
}
