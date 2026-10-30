import { requireLogin } from './_auth.js';

// Sends text copies of recipes to the family Google Sheet through a small Apps Script attached to it.
// The script's address and secret live only in the server's environment (BACKUP_URL, BACKUP_SECRET).
const MAX_RECIPES = 25;
const CELL_LIMIT = 45000; // Google Sheets allows 50,000 characters in one cell

export const COLUMNS = [
  'Backed up at', 'Device ID', 'Device', 'Recipe ID', 'Title', 'Source type', 'Source name', 'Source URL',
  'Servings', 'Prep (min)', 'Cook (min)', 'Categories', 'Tags', 'Favorite', 'Want to try', 'Rating',
  'Description', 'Ingredients', 'Instructions', 'Notes', 'First saved', 'Last edited', 'Full data (JSON, no photos)',
];

const cell = (v: unknown): string | number => {
  if (typeof v === 'number') return v;
  const s = String(v ?? '');
  return s.length > CELL_LIMIT ? s.slice(0, CELL_LIMIT) : s;
};

/** One sheet row per recipe. Photos are left out: they are far too big for a cell. */
export function toRow(r: any, device: { id: string; name: string }, now: string): Array<string | number> {
  const lightweight = { ...r, userPhotos: undefined, coverImage: String(r.coverImage || '').startsWith('data:') ? undefined : r.coverImage };
  return [
    now, device.id, device.name, r.id, r.title, r.sourceType, r.sourceName, r.sourceUrl,
    r.servings, r.prepTimeMinutes, r.cookTimeMinutes, (r.categories || []).join(', '), (r.tags || []).join(', '),
    r.favorite ? 'yes' : '', r.wantToTry ? 'yes' : '', r.rating || '',
    r.description, (r.ingredients || []).map((i: any) => i.raw).join('\n'),
    (r.instructions || []).map((s: any, n: number) => `${n + 1}. ${s.text}`).join('\n'),
    (r.jasmineNotes || []).map((n: any) => n.text).join('\n'),
    r.createdAt, r.updatedAt, JSON.stringify(lightweight),
  ].map(cell);
}

export default async function handler(req: any, res: any) {
  if (!requireLogin(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const url = process.env.BACKUP_URL;
  const secret = process.env.BACKUP_SECRET;
  if (!url || !secret) return res.status(503).json({ error: 'Backup is not set up yet', code: 'not_configured' });

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }
  const recipes: any[] = Array.isArray(body?.recipes) ? body.recipes.slice(0, MAX_RECIPES) : [];
  const device = {
    id: String(body?.device?.id || 'unknown').slice(0, 40),
    name: String(body?.device?.name || 'Unknown device').slice(0, 80),
  };
  if (recipes.length === 0) return res.status(400).json({ error: 'Nothing to back up' });

  const now = new Date().toISOString();
  try {
    const r = await fetch(url, {
      method: 'POST',
      // Plain text keeps Google's script endpoint from treating this as a cross-site request
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        secret,
        headers: COLUMNS,
        keys: ['Device ID', 'Recipe ID'],
        rows: recipes.map((rec) => toRow(rec, device, now)),
      }),
      redirect: 'follow',
      signal: AbortSignal.timeout(25000),
    });
    const out: any = await r.json().catch(() => null);
    if (!r.ok || !out?.ok) return res.status(502).json({ error: out?.error || `Sheet answered ${r.status}` });
    return res.status(200).json({ ok: true, saved: recipes.length });
  } catch (err: any) {
    return res.status(502).json({ error: err?.message || 'Backup failed' });
  }
}
