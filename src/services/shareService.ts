import type { Recipe, RecipeSourceType } from '../types/recipe';

/**
 * Sending a recipe puts the whole recipe inside the link itself (squeezed small), so there is no server or account
 * in between. Whoever opens the link in the app is offered to save it. Photos are left out; a cover from an
 * Instagram post is fetched again by the receiving app from the post's address.
 */

const HASH_PREFIX = '#/send/';
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
  const types: RecipeSourceType[] = ['website', 'instagram', 'cookbook', 'family', 'manual'];
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

export async function buildRecipeLink(r: Recipe): Promise<string> {
  return `${appAddress()}${HASH_PREFIX}${await pack(recipeToPayload(r))}`;
}

/** The recipe in the address bar, if someone opened a "send" link. */
export async function readIncomingRecipe(): Promise<Recipe | null> {
  const hash = window.location.hash;
  if (!hash.startsWith(HASH_PREFIX)) return null;
  try {
    return payloadToRecipe(await unpack(hash.slice(HASH_PREFIX.length)));
  } catch {
    return null;
  }
}

export const hasIncomingLink = (): boolean => window.location.hash.startsWith(HASH_PREFIX);

export function clearIncomingLink() {
  try {
    window.history.replaceState(null, '', appAddress());
  } catch {
    window.location.hash = '';
  }
}

export type ShareOutcome = 'shared' | 'copied' | 'failed' | 'cancelled';

async function shareOrCopy(data: { title: string; text: string; url: string }): Promise<ShareOutcome> {
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share(data);
      return 'shared';
    } catch (err: any) {
      if (err?.name === 'AbortError') return 'cancelled'; // closed the share sheet on purpose
    }
  }
  try {
    await navigator.clipboard.writeText(data.url);
    return 'copied';
  } catch {
    return 'failed';
  }
}

export async function sendRecipe(r: Recipe): Promise<ShareOutcome> {
  const url = await buildRecipeLink(r);
  return shareOrCopy({ title: r.title, text: `Here's a recipe for you: ${r.title}`, url });
}

export function shareApp(): Promise<ShareOutcome> {
  return shareOrCopy({ title: "Jasmine's Recipe Box", text: "Jasmine's Recipe Box", url: appAddress() });
}
