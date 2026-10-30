/**
 * Downloads the HTML of a web page from the browser. Sites block direct requests (CORS), so this tries our own
 * serverless route first, then a few free public proxies, so one flaky proxy no longer breaks every import.
 */

const TIMEOUT_MS = 12000;

async function getText(url: string, expectJson = false): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    if (expectJson) {
      // Without our server route the dev server answers with the app's own page, which must not count as success
      if (!(res.headers.get('content-type') || '').includes('json')) throw new Error('not json');
      const data = await res.json();
      if (typeof data.html !== 'string' || data.html.length < 200) throw new Error('empty');
      return data.html;
    }
    const text = await res.text();
    if (text.length < 200) throw new Error('empty');
    return text;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchPageHtml(targetUrl: string): Promise<string> {
  const enc = encodeURIComponent(targetUrl);
  const routes: Array<() => Promise<string>> = [
    () => getText(`/api/page?url=${enc}`, true),
    () => getText(`https://api.allorigins.win/raw?url=${enc}`),
    () => getText(`https://corsproxy.io/?url=${enc}`),
    () => getText(`https://api.codetabs.com/v1/proxy?quest=${enc}`),
  ];
  let lastError: unknown;
  for (const route of routes) {
    try {
      return await route();
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Could not fetch URL content');
}
