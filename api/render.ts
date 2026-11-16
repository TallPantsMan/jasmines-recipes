import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import { requireLogin } from './_auth.js';
import { isBlockedHost } from './_net.js';
import { askGeminiJson, GeminiError } from './_gemini.js';
import { INSTRUCTIONS, SCHEMA } from './_recipePrompt.js';

// For recipe pages the plain download (/api/page) can't read: opens the page in a hidden Chrome, the way a person's
// browser would, so pages that build themselves after loading come out complete.
//   GET /api/render?url=...            -> { html, finalUrl }  the finished page, read by the app like any other page
//   GET /api/render?url=...&mode=pdf   -> { recipe, image }   the page saved as a PDF and read by the AI
export const config = { maxDuration: 60 };

const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const PDF_PROMPT =
  'This PDF is a saved web page. Find the main recipe on it and return it. Ignore ads, comments, menus and related-recipe lists. ' +
  'Include every ingredient and step even when they are in a picture.';

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
  const pdfMode = req.query?.mode === 'pdf';

  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | undefined;
  try {
    browser = await puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });
    const page = await browser.newPage();
    await page.setUserAgent(DESKTOP_UA);
    await page.setViewport({ width: 1200, height: 1600 });

    // Never let the page (or anything it redirects to) reach into a private network; skip things we don't need
    await page.setRequestInterception(true);
    page.on('request', (r) => {
      let blocked = true;
      try {
        const u = new URL(r.url());
        blocked = !/^https?:$/.test(u.protocol) || isBlockedHost(u.hostname);
      } catch {
        blocked = !r.url().startsWith('data:');
      }
      const type = r.resourceType();
      if (blocked || type === 'media' || type === 'font' || (!pdfMode && type === 'image')) r.abort();
      else r.continue();
    });

    await page.goto(target.href, { waitUntil: 'networkidle2', timeout: 30000 }).catch(async () => {
      // A page that never fully settles (chat widgets, trackers) is still usually readable
      if (!(await page.content()).includes('<body')) throw new Error('Page did not load');
    });

    if (!pdfMode) {
      const html = await page.content();
      if (html.length > 4_000_000) return res.status(502).json({ error: 'Page too large' });
      return res.status(200).json({ html, finalUrl: page.url() });
    }

    const image = await page
      .$eval('meta[property="og:image"]', (el) => el.getAttribute('content'))
      .catch(() => null);
    const pdf = Buffer.from(await page.pdf({ format: 'A4', printBackground: false, timeout: 20000 }));
    if (pdf.length > 15_000_000) return res.status(502).json({ error: 'Page too large' });
    await browser.close();
    browser = undefined;

    const recipe = await askGeminiJson(INSTRUCTIONS, PDF_PROMPT, SCHEMA, pdf.toString('base64'));
    return res.status(200).json({ recipe, image: image ? new URL(image, target.href).href : undefined });
  } catch (err: any) {
    if (err instanceof GeminiError && err.notConfigured) return res.status(503).json({ error: err.message });
    return res.status(502).json({ error: err?.message || 'Could not open the page' });
  } finally {
    await browser?.close().catch(() => {});
  }
}
