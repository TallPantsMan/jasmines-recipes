import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'api-instagram-dev-server',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          if (req.url && req.url.startsWith('/api/instagram')) {
            try {
              const urlObj = new URL(req.url, 'http://localhost');
              const targetUrl = urlObj.searchParams.get('url');
              if (!targetUrl) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'Missing url parameter' }));
                return;
              }

              const shortcodeMatch = String(targetUrl).match(/\/(?:p|reel|reels|share\/reel)\/([A-Za-z0-9_-]+)/);
              if (!shortcodeMatch) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'Could not extract shortcode' }));
                return;
              }
              const shortcode = shortcodeMatch[1];
              const userMatch = String(targetUrl).match(/instagram\.com\/([A-Za-z0-9_.-]+)\/(?:reel|p)\//);
              const authorName = userMatch && !['p', 'reel', 'reels', 'share'].includes(userMatch[1])
                ? `@${userMatch[1]}`
                : 'Instagram Reel';

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
                const captionMatch = html.match(/class="Caption"[^>]*>([\s\S]*?)<\/div>/i);
                if (captionMatch) {
                  captionText = captionMatch[1].replace(/<[^>]+>/g, '').trim();
                }
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
                if (!captionText) {
                  const metaMatch = html.match(/property="og:description"\s+content="([^"]*)"/i) || html.match(/content="([^"]*)"\s+property="og:description"/i);
                  if (metaMatch) {
                    captionText = metaMatch[1];
                  }
                }
                if (captionText) {
                  res.statusCode = 200;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({
                    success: true,
                    shortcode,
                    caption: captionText,
                    authorName,
                    url: targetUrl
                  }));
                  return;
                }
              }

              res.statusCode = 404;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({
                error: 'Instagram caption could not be extracted directly',
                shortcode,
                authorName
              }));
            } catch (err: any) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: err.message }));
            }
            return;
          }
          next();
        });
      }
    }
  ],
});
