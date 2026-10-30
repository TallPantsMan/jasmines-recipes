const decodeEntities = (s: string) =>
  s.replace(/&amp;/g, '&').replace(/\\u0026/g, '&').replace(/\\\//g, '/').replace(/&#x2F;/g, '/').replace(/&quot;/g, '"');

function extractImageUrl(html: string): string {
  const patterns = [
    /class="EmbeddedMediaImage"[^>]*?src="([^"]+)"/i,
    /<img[^>]*class="[^"]*EmbeddedMediaImage[^"]*"[^>]*?src="([^"]+)"/i,
    /property="og:image"\s+content="([^"]+)"/i,
    /content="([^"]+)"\s+property="og:image"/i,
    /"display_url":"([^"]+)"/i,
    /"thumbnail_src":"([^"]+)"/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m && m[1]) return decodeEntities(m[1]);
  }
  return '';
}

// Instagram CDN links expire and block hotlinking, so we download the cover and return it inline.
async function fetchImageAsDataUri(url: string): Promise<string> {
  try {
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1',
        'Referer': 'https://www.instagram.com/',
      },
    });
    if (!r.ok) return '';
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length === 0 || buf.length > 3_000_000) return '';
    const type = r.headers.get('content-type') || 'image/jpeg';
    return `data:${type};base64,${buf.toString('base64')}`;
  } catch {
    return '';
  }
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

  // Extract shortcode from standard Instagram link
  const shortcodeMatch = String(rawUrl).match(/\/(?:p|reel|reels|share\/reel)\/([A-Za-z0-9_-]+)/);
  if (!shortcodeMatch) {
    return res.status(400).json({ error: 'Could not extract shortcode from Instagram URL' });
  }
  const shortcode = shortcodeMatch[1];

  // Also check if username is in the URL (e.g. instagram.com/feelgoodfoodie/reel/...)
  const userMatch = String(rawUrl).match(/instagram\.com\/([A-Za-z0-9_.-]+)\/(?:reel|p)\//);
  const authorName = userMatch && !['p', 'reel', 'reels', 'share'].includes(userMatch[1])
    ? `@${userMatch[1]}`
    : 'Instagram Reel';

  try {
    const embedUrl = `https://www.instagram.com/p/${shortcode}/embed/captioned/`;
    const response = await fetch(embedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      }
    });

    if (response.ok) {
      const html = await response.text();
      let captionText = '';

      // 1. Look for div.Caption
      const captionMatch = html.match(/class="Caption"[^>]*>([\s\S]*?)<\/div>/i);
      if (captionMatch) {
        captionText = captionMatch[1].replace(/<[^>]+>/g, '').trim();
      }

      // 2. Look for script JSON
      if (!captionText) {
        const jsonMatch = html.match(/"caption":\{"text":"(.*?)"/);
        if (jsonMatch) {
          try {
            captionText = JSON.parse(`"${jsonMatch[1]}"`);
          } catch {
            captionText = jsonMatch[1];
          }
        }
      }

      // 3. Look for og:description or title
      if (!captionText) {
        const metaMatch = html.match(/property="og:description"\s+content="([^"]*)"/i) || html.match(/content="([^"]*)"\s+property="og:description"/i);
        if (metaMatch) {
          captionText = metaMatch[1];
        }
      }

      const imageUrl = extractImageUrl(html);
      const image = imageUrl ? await fetchImageAsDataUri(imageUrl) : '';

      if (captionText || image) {
        return res.status(200).json({
          success: !!captionText,
          shortcode,
          image,
          caption: captionText,
          authorName,
          url: rawUrl
        });
      }
    }

    return res.status(404).json({
      error: 'Caption could not be extracted directly from this Instagram link (login wall)',
      shortcode,
      authorName
    });
  } catch (err: any) {
    return res.status(500).json({
      error: err.message || 'Scrape failed',
      shortcode
    });
  }
}