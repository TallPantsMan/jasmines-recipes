import type { Recipe, RecipeSourceType } from '../types/recipe';
import { apiFetch } from './auth';

/**
 * Sending a recipe turns the whole recipe into a code (squeezed small), so there is no server or account in between.
 * It goes in a message; whoever pastes that message into the app's Import box is offered to save it. Photos are left out; a cover from an
 * Instagram post is fetched again by the receiving app from the post's address.
 */

const CODE_PREFIX = 'JASMINE-RECIPE-';
const MAX_LIST = 120;

interface SharedPayload {
  t: string;           // title
  d?: string;          // description
  s?: number;          // servings
  p?: number;          // prep minutes
  c?: number;          // cook minutes
  k?: string[];        // categories
  g?: string[];        // tags
  i: string[];         // ingredients
  n: string[];         // steps
  u?: string;          // source link
  a?: string;          // source name
  y?: RecipeSourceType; // source type
  f?: string;          // cover image, only when it's a web address
  l?: 'Easy' | 'Medium' | 'Advanced';
}

const toBase64Url = (bytes: Uint8Array): string => {
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const fromBase64Url = (text: string): Uint8Array => {
  const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

/** "z" marks a squeezed payload, "p" a plain one (for browsers that can't squeeze). */
async function pack(payload: SharedPayload): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  if (typeof CompressionStream !== 'undefined') {
    try {
      return 'z' + toBase64Url(await pipe(bytes, new CompressionStream('deflate-raw')));
    } catch {
      /* fall through to plain */
    }
  }
  return 'p' + toBase64Url(bytes);
}

async function unpack(text: string): Promise<unknown> {
  const bytes = fromBase64Url(text.slice(1));
  const raw = text[0] === 'z' ? await pipe(bytes, new DecompressionStream('deflate-raw')) : bytes;
  return JSON.parse(new TextDecoder().decode(raw));
}

const clean = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const list = (v: unknown, max: number): string[] =>
  Array.isArray(v) ? v.map((x) => clean(x, max)).filter(Boolean).slice(0, MAX_LIST) : [];
const num = (v: unknown): number | undefined => (typeof v === 'number' && v > 0 && v < 100000 ? Math.round(v) : undefined);

export function recipeToPayload(r: Recipe): SharedPayload {
  const p: SharedPayload = {
    t: r.title,
    i: r.ingredients.map((x) => x.raw),
    n: r.instructions.map((x) => x.text),
  };
  if (r.description) p.d = r.description;
  if (r.servings) p.s = r.servings;
  if (r.prepTimeMinutes) p.p = r.prepTimeMinutes;
  if (r.cookTimeMinutes) p.c = r.cookTimeMinutes;
  if (r.categories?.length) p.k = r.categories;
  if (r.tags?.length) p.g = r.tags;
  if (r.sourceUrl) p.u = r.sourceUrl;
  if (r.sourceName) p.a = r.sourceName;
  if (r.sourceType) p.y = r.sourceType;
  if (r.difficulty) p.l = r.difficulty;
  if (r.coverImage && /^https?:\/\//.test(r.coverImage)) p.f = r.coverImage;
  return p;
}

/** Turns what arrived in a link back into a brand new recipe for this device, checking it's a sane recipe first. */
export function payloadToRecipe(data: unknown): Recipe | null {
  if (!data || typeof data !== 'object') return null;
  const p = data as Record<string, unknown>;
  const title = clean(p.t, 200);
  const ingredients = list(p.i, 400);
  const steps = list(p.n, 2000);
  if (!title || (ingredients.length === 0 && steps.length === 0)) return null;

  const now = new Date().toISOString();
  const stamp = Date.now();
  const types: RecipeSourceType[] = ['website', 'instagram', 'video', 'cookbook', 'family', 'manual'];
  const sourceType = types.includes(p.y as RecipeSourceType) ? (p.y as RecipeSourceType) : 'manual';
  const cover = clean(p.f, 2000);
  const link = clean(p.u, 2000);

  return {
    id: `recipe-${stamp}-${Math.random().toString(36).slice(2, 6)}`,
    title,
    description: clean(p.d, 1500) || undefined,
    sourceType,
    sourceUrl: /^https?:\/\//.test(link) ? link : undefined,
    sourceName: clean(p.a, 200) || undefined,
    coverImage: /^https?:\/\//.test(cover) ? cover : undefined,
    userPhotos: [],
    servings: num(p.s) || 4,
    prepTimeMinutes: num(p.p),
    cookTimeMinutes: num(p.c),
    difficulty: p.l === 'Medium' || p.l === 'Advanced' ? p.l : 'Easy',
    categories: list(p.k, 60).length ? list(p.k, 60) : ['Dinners'],
    tags: list(p.g, 60),
    ingredients: ingredients.map((raw, i) => ({ id: `ing-${stamp}-${i}`, raw })),
    instructions: steps.map((text, i) => ({ id: `step-${stamp}-${i}`, stepNumber: i + 1, text })),
    jasmineNotes: [],
    rating: 0,
    favorite: false,
    wantToTry: true,
    createdAt: now,
    updatedAt: now,
  };
}

const appAddress = () => `${window.location.origin}${window.location.pathname}`;

export async function buildRecipeCode(r: Recipe): Promise<string> {
  return `${CODE_PREFIX}${await pack(recipeToPayload(r))}`;
}

// Short codes (JR-K7F3QZ) are looked up on the server; the long code carries the whole recipe and needs no lookup
const SHORT_CODE = /\bJR-[2-9A-HJ-NP-Z]{6}\b/i;

export const looksLikeRecipeCode = (text: string): boolean => text.includes(CODE_PREFIX) || SHORT_CODE.test(text);

async function recipeFromLongCode(text: string): Promise<Recipe | null> {
  const at = text.indexOf(CODE_PREFIX);
  if (at < 0) return null;
  // Some chat apps add line breaks to long text, so a code split across lines is joined back up
  const after = text.slice(at + CODE_PREFIX.length);
  const attempts = [after.match(/^[A-Za-z0-9_\-\s]+/)?.[0].replace(/\s+/g, ''), after.match(/^[A-Za-z0-9_-]+/)?.[0]];
  for (const code of attempts) {
    if (!code) continue;
    try {
      const recipe = payloadToRecipe(await unpack(code));
      if (recipe) return recipe;
    } catch {
      /* try the next way of reading it */
    }
  }
  return null;
}

async function recipeFromShortCode(text: string): Promise<Recipe | null> {
  const code = text.match(SHORT_CODE)?.[0].toUpperCase();
  if (!code) return null;
  try {
    const res = await apiFetch(`/api/share?code=${encodeURIComponent(code)}`);
    if (!res.ok) return null;
    const { payload } = await res.json();
    return typeof payload === 'string' ? payloadToRecipe(await unpack(payload)) : null;
  } catch {
    return null;
  }
}

/** The recipe inside a pasted code, whether it was pasted on its own or inside the whole message it arrived in. */
export async function recipeFromCode(text: string): Promise<Recipe | null> {
  return (await recipeFromLongCode(text)) ?? (await recipeFromShortCode(text));
}
export type ShareOutcome = 'shared' | 'copied' | 'failed' | 'cancelled';

async function shareOrCopy(data: { title: string; text: string; url?: string }): Promise<ShareOutcome> {
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share(data);
      return 'shared';
    } catch (err: any) {
      if (err?.name === 'AbortError') return 'cancelled'; // closed the share sheet on purpose
    }
  }
  try {
    await navigator.clipboard.writeText(data.url || data.text);
    return 'copied';
  } catch {
    return 'failed';
  }
}

// Making a short code means a trip to the server and the Sheet, which takes seconds. Codes are remembered per recipe
// (and re-made when the recipe changes), and made ahead of time in the background, so tapping Send can open the share sheet at once.
const CODE_CACHE_KEY = 'jasmines_recipes_short_codes';
type CodeCache = Record<string, { hash: string; code: string }>;

const loadCodeCache = (): CodeCache => {
  try {
    return JSON.parse(localStorage.getItem(CODE_CACHE_KEY) || '{}') as CodeCache;
  } catch {
    return {};
  }
};

const rememberCode = (id: string, hash: string, code: string) => {
  try {
    const cache = loadCodeCache();
    cache[id] = { hash, code };
    localStorage.setItem(CODE_CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* private mode or full storage: the code is just made again next time */
  }
};

// A quick fingerprint of what would be sent, so an edited recipe gets a fresh code
const fingerprint = (text: string): string => {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return `${text.length}:${h}`;
};

const cachedShortCode = (r: Recipe): string | null => {
  const hit = loadCodeCache()[r.id];
  return hit && hit.hash === fingerprint(JSON.stringify(recipeToPayload(r))) ? hit.code : null;
};

/** True when Send can open straight away because the short code is already made. */
export const hasShortCodeReady = (r: Recipe): boolean => cachedShortCode(r) !== null;

/** A short code kept on the server, or null when that isn't available right now. */
async function shortCodeFor(r: Recipe): Promise<string | null> {
  const ready = cachedShortCode(r);
  if (ready) return ready;
  try {
    const payload = recipeToPayload(r);
    const res = await apiFetch('/api/share', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload: await pack(payload) }),
    });
    if (!res.ok) return null;
    const { code } = await res.json();
    if (typeof code !== 'string' || !code) return null;
    rememberCode(r.id, fingerprint(JSON.stringify(payload)), code);
    return code;
  } catch {
    return null;
  }
}

let preparing = false;

/** Quietly makes short codes for recipes that don't have one yet, one at a time. Safe to call as often as you like. */
export async function prepareShortCodes(recipes: Recipe[]): Promise<void> {
  if (preparing) return;
  preparing = true;
  try {
    for (const r of recipes) {
      if (cachedShortCode(r)) continue;
      if ((await shortCodeFor(r)) === null) break; // offline or not set up: try again next time
    }
  } finally {
    preparing = false;
  }
}

export async function sendRecipe(r: Recipe): Promise<ShareOutcome> {
  // The short code is easy to read and type. If it can't be made (no signal, sharing not set up), the long code
  // still works because it carries the whole recipe.
  const short = await shortCodeFor(r);
  const code = short ?? (await buildRecipeCode(r));
  const text =
    `Here's a recipe for you: ${r.title}\n\n` +
    `To save it: open Jasmine's Recipe Box, tap Import, and paste this whole message.\n\n` +
    `Recipe code: ${short ? code : '\n' + code}`;
  return shareOrCopy({ title: r.title, text });
}
export function shareApp(): Promise<ShareOutcome> {
  return shareOrCopy({ title: "Jasmine's Recipe Box", text: "Jasmine's Recipe Box", url: appAddress() });
}


