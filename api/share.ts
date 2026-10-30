import { randomInt } from 'node:crypto';
import { requireLogin } from './_auth.js';

// Short codes for sent recipes. The recipe itself (already squeezed into text by the app) is kept in the family
// Google Sheet, in the same place the backups go, under a code like JR-K7F3QZ.
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // no 0/O or 1/I, which are easy to mix up
const CODE_LENGTH = 6;
const MAX_PAYLOAD = 45000;

const newCode = () => 'JR-' + Array.from({ length: CODE_LENGTH }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');

async function callSheet(body: Record<string, unknown>): Promise<any> {
  const r = await fetch(process.env.BACKUP_URL as string, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ secret: process.env.BACKUP_SECRET, ...body }),
    redirect: 'follow',
    signal: AbortSignal.timeout(20000),
  });
  return r.json().catch(() => null);
}

export default async function handler(req: any, res: any) {
  if (!requireLogin(req, res)) return;
  if (!process.env.BACKUP_URL || !process.env.BACKUP_SECRET) {
    return res.status(503).json({ error: 'Sharing is not set up yet', code: 'not_configured' });
  }

  try {
    if (req.method === 'GET') {
      const code = String(req.query?.code || '').trim().toUpperCase();
      if (!/^JR-[2-9A-HJ-NP-Z]{6}$/.test(code)) return res.status(400).json({ error: 'That code is not valid' });
      const out = await callSheet({ action: 'fetch', code });
      if (out?.ok && typeof out.payload === 'string') return res.status(200).json({ payload: out.payload });
      return res.status(out?.error === 'not_found' ? 404 : 502).json({ error: out?.error === 'not_found' ? 'No recipe found for that code' : 'Could not reach the recipe store' });
    }

    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') {
        try {
          body = JSON.parse(body);
        } catch {
          body = {};
        }
      }
      const payload = typeof body?.payload === 'string' ? body.payload : '';
      if (!payload || payload.length > MAX_PAYLOAD) return res.status(400).json({ error: 'Recipe is empty or too large' });
      // A clash with an existing code is very unlikely; just pick another
      for (let attempt = 0; attempt < 4; attempt++) {
        const code = newCode();
        const out = await callSheet({ action: 'share', code, payload });
        if (out?.ok) return res.status(200).json({ code });
        if (out?.error !== 'taken') return res.status(502).json({ error: out?.error || 'Could not store the recipe' });
      }
      return res.status(502).json({ error: 'Could not make a code' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err: any) {
    return res.status(502).json({ error: err?.message || 'Sharing failed' });
  }
}
