import { requireLogin } from './_auth.js';

// Keeps each person's recipes in the family Google Sheet ("Profiles" tab) so every device they use shows the same box.
const PROFILES = ['Jasmine', 'Leslie', 'Alex'];
const MAX_JSON = 450000; // ten 45,000-character cells per recipe

async function callSheet(body: Record<string, unknown>): Promise<any> {
  const r = await fetch(process.env.BACKUP_URL as string, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ secret: process.env.BACKUP_SECRET, ...body }),
    redirect: 'follow',
    signal: AbortSignal.timeout(25000),
  });
  return r.json().catch(() => null);
}

/** Squeezes a recipe under the cell limit: first drop the user's own photos, then a photo cover. */
function fit(recipe: any): string | null {
  let json = JSON.stringify(recipe);
  if (json.length <= MAX_JSON) return json;
  json = JSON.stringify({ ...recipe, userPhotos: [] });
  if (json.length <= MAX_JSON) return json;
  json = JSON.stringify({ ...recipe, userPhotos: [], coverImage: undefined });
  return json.length <= MAX_JSON ? json : null;
}

export default async function handler(req: any, res: any) {
  if (!requireLogin(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!process.env.BACKUP_URL || !process.env.BACKUP_SECRET) {
    return res.status(503).json({ error: 'Syncing is not set up yet', code: 'not_configured' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }
  const profile = String(body?.profile || '');
  if (!PROFILES.includes(profile)) return res.status(400).json({ error: 'Unknown profile' });

  try {
    if (body.action === 'index') {
      const out = await callSheet({ action: 'syncIndex', profile });
      if (!out?.ok) return res.status(502).json({ error: out?.error || 'Could not read the profile' });
      return res.status(200).json({ items: out.items });
    }

    if (body.action === 'get') {
      const ids: string[] = Array.isArray(body.ids) ? body.ids.slice(0, 20).map(String) : [];
      const out = await callSheet({ action: 'syncGet', profile, ids });
      if (!out?.ok) return res.status(502).json({ error: out?.error || 'Could not read recipes' });
      const recipes = (out.recipes as string[]).map((j) => {
        try {
          return JSON.parse(j);
        } catch {
          return null;
        }
      }).filter(Boolean);
      return res.status(200).json({ recipes });
    }

    if (body.action === 'put') {
      const given: any[] = Array.isArray(body.recipes) ? body.recipes : [];
      const deleted: Array<{ id: string; updatedAt: string }> = Array.isArray(body.deleted) ? body.deleted : [];
      const items: any[] = [];
      const skipped: string[] = [];
      for (const r of given) {
        const json = fit(r);
        if (!json) skipped.push(String(r?.id));
        else items.push({ id: String(r.id), updatedAt: String(r.updatedAt || ''), title: String(r.title || ''), json });
      }
      for (const d of deleted) items.push({ id: String(d.id), updatedAt: String(d.updatedAt), deleted: true, title: '', json: '' });
      if (items.length === 0) return res.status(200).json({ ok: true, saved: 0, skipped });
      const out = await callSheet({ action: 'syncPut', profile, items });
      if (!out?.ok) return res.status(502).json({ error: out?.error || 'Could not save recipes' });
      return res.status(200).json({ ok: true, saved: items.length, skipped });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (err: any) {
    return res.status(502).json({ error: err?.message || 'Sync failed' });
  }
}
