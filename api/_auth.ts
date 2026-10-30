import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

// Shared by the serverless routes. The leading underscore keeps Vercel from exposing this file as a route.
const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

const password = () => process.env.APP_PASSWORD || '';

// Running on Vercel without a password set must lock the app, never leave it open
const isHosted = () => Boolean(process.env.VERCEL) || process.env.NODE_ENV === 'production';

/** Local development with no APP_PASSWORD stays open so nobody gets locked out while building. */
export function authRequired(): boolean {
  return Boolean(password()) || isHosted();
}

// Derived from the password, so changing the password signs everyone out
const secret = () => createHash('sha256').update(`jasmines-recipes:${password()}:${process.env.AUTH_SECRET || ''}`).digest();

const sign = (payload: string) => createHmac('sha256', secret()).update(payload).digest('base64url');

export function issueToken(): string {
  const expires = String(Date.now() + YEAR_MS);
  return `${expires}.${sign(expires)}`;
}

function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function passwordMatches(attempt: unknown): boolean {
  return Boolean(password()) && typeof attempt === 'string' && safeEqual(attempt.trim(), password());
}

export function tokenIsValid(header: unknown): boolean {
  if (!password()) return false;
  const token = String(header || '').replace(/^Bearer\s+/i, '');
  const [expires, signature] = token.split('.');
  if (!expires || !signature || Number(expires) < Date.now()) return false;
  return safeEqual(signature, sign(expires));
}

/** Call first in a route: returns true when the request may continue, otherwise it has already answered 401. */
export function requireLogin(req: any, res: any): boolean {
  if (!authRequired()) return true;
  if (tokenIsValid(req.headers?.authorization)) return true;
  res.status(401).json({ error: 'Please sign in first' });
  return false;
}
