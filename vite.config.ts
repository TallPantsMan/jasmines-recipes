import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import instagramHandler from './api/instagram.js';
import pageHandler from './api/page.js';
import loginHandler from './api/login.js';
import cleanHandler from './api/clean.js';

// While developing locally, run the very same serverless functions that ship in /api
const API_ROUTES: Record<string, (req: any, res: any) => Promise<unknown>> = {
  '/api/instagram': instagramHandler,
  '/api/page': pageHandler,
  '/api/login': loginHandler,
  '/api/clean': cleanHandler,
};

async function readJsonBody(req: any): Promise<unknown> {
  if (req.method !== 'POST') return {};
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk);
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    return {};
  }
}

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'local-api-routes',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          const url = new URL(req.url || '', 'http://localhost');
          const handler = API_ROUTES[url.pathname];
          if (!handler) {
            next();
            return;
          }

          // Minimal version of the response helpers the serverless platform provides
          const shim = {
            setHeader: (name: string, value: string) => res.setHeader(name, value),
            status(code: number) {
              res.statusCode = code;
              return shim;
            },
            json(body: unknown) {
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify(body));
              return shim;
            },
            end() {
              res.end();
              return shim;
            },
          };

          try {
            const body = await readJsonBody(req);
            await handler({ method: req.method, query: Object.fromEntries(url.searchParams), body, headers: req.headers }, shim);
          } catch (err: any) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: err.message || 'Local API error' }));
          }
        });
      }
    }
  ],
});
