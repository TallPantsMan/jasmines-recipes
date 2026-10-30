import type { Recipe } from '../types/recipe';
import { apiFetch } from './auth';

/** Downscale + re-encode an image data URL so it stays small enough to persist. */
export function compressImageDataUrl(dataUrl: string, maxWidth = 900, quality = 0.8): Promise<string> {
  return new Promise((resolve) => {
    if (typeof Image === 'undefined') return resolve(dataUrl);
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(dataUrl);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      } catch {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve('');
    img.src = dataUrl;
  });
}

const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve) => {
    const r = new FileReader();
    r.onloadend = () => resolve(typeof r.result === 'string' ? r.result : '');
    r.onerror = () => resolve('');
    r.readAsDataURL(blob);
  });

/** A photo from the camera or gallery, shrunk so it stays small enough to save. */
export async function fileToCompressedDataUrl(file: File, maxWidth = 900, quality = 0.8): Promise<string> {
  const raw = await blobToDataUrl(file);
  return raw ? compressImageDataUrl(raw, maxWidth, quality) : '';
}

/**
 * Gets the cover image (post thumbnail / reel cover) for an Instagram link as a
 * persistent data URL. Tries our serverless endpoint first, then a public proxy.
 */
export async function fetchInstagramCover(targetUrl: string, apiImage?: string): Promise<string | undefined> {
  // A missing cover must never lose the recipe, so any failure here just means "no cover"
  try {
    return await fetchInstagramCoverUnsafe(targetUrl, apiImage);
  } catch {
    return undefined;
  }
}

async function fetchInstagramCoverUnsafe(targetUrl: string, apiImage?: string): Promise<string | undefined> {
  if (apiImage && apiImage.startsWith('data:image')) {
    const c = await compressImageDataUrl(apiImage);
    if (c) return c;
  }
  try {
    const res = await apiFetch(`/api/instagram?url=${encodeURIComponent(targetUrl)}`);
    if (res.ok) {
      const data = await res.json();
      if (data.image && String(data.image).startsWith('data:image')) {
        const c = await compressImageDataUrl(data.image);
        if (c) return c;
      }
    }
  } catch {
    /* fall through to proxy */
  }
  try {
    const m = targetUrl.match(/\/(?:p|reel|reels|share\/reel)\/([A-Za-z0-9_-]+)/);
    if (!m) return undefined;
    const embed = `https://www.instagram.com/p/${m[1]}/embed/captioned/`;
    const page = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(embed)}`);
    if (!page.ok) return undefined;
    const html: string = (await page.json()).contents || '';
    const im =
      html.match(/class="EmbeddedMediaImage"[^>]*?src="([^"]+)"/i) ||
      html.match(/property="og:image"\s+content="([^"]+)"/i);
    if (!im) return undefined;
    const imgUrl = im[1].replace(/&amp;/g, '&');
    const imgRes = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(imgUrl)}`);
    if (!imgRes.ok) return undefined;
    const dataUrl = await blobToDataUrl(await imgRes.blob());
    return dataUrl ? (await compressImageDataUrl(dataUrl)) || undefined : undefined;
  } catch {
    return undefined;
  }
}

const PALETTES: Array<[string, string]> = [
  ['#FF8A5B', '#FF5B26'],
  ['#FFB36B', '#F2762E'],
  ['#F7A072', '#E4572E'],
  ['#FFC27A', '#FF8F3F'],
  ['#F4978E', '#E5604E'],
  ['#FFAD84', '#F0653A'],
];

const EMOJI_RULES: Array<[RegExp, string]> = [
  [/pasta|rigatoni|spaghetti|penne|noodle|ramen|mac|lasagna|orzo/i, '\u{1F35D}'],
  [/pizza/i, '\u{1F355}'],
  [/burger/i, '\u{1F354}'],
  [/taco|burrito|quesadilla|nacho/i, '\u{1F32E}'],
  [/salad|slaw|bowl/i, '\u{1F957}'],
  [/soup|stew|chili|broth|curry/i, '\u{1F372}'],
  [/chicken|wing|poultry|turkey/i, '\u{1F357}'],
  [/steak|beef|pork|rib|meat|bbq/i, '\u{1F969}'],
  [/shrimp|salmon|fish|tuna|seafood|crab|lobster|sushi/i, '\u{1F364}'],
  [/rice|fried rice|risotto/i, '\u{1F35A}'],
  [/egg|omelet|breakfast|pancake|waffle|toast/i, '\u{1F373}'],
  [/cake|cookie|brownie|dessert|pie|cupcake|sweet|chocolate|ice cream/i, '\u{1F370}'],
  [/bread|sandwich|bagel/i, '\u{1F96A}'],
  [/smoothie|drink|juice|cocktail/i, '\u{1F379}'],
  [/veg|broccoli|carrot|potato|cauliflower/i, '\u{1F966}'],
];

const hash = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
};

/** A pretty, deterministic illustrated cover so every recipe always has an image. */
export function generatedCover(recipe: Pick<Recipe, 'id' | 'title' | 'categories'>): string {
  const seed = hash(`${recipe.id}${recipe.title}`);
  const [c1, c2] = PALETTES[seed % PALETTES.length];
  const text = `${recipe.title} ${(recipe.categories || []).join(' ')}`;
  const emoji = (EMOJI_RULES.find(([re]) => re.test(text)) || [null, '\u{1F37D}\u{FE0F}'])[1];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs><rect width="800" height="600" fill="url(#g)"/><circle cx="650" cy="90" r="190" fill="#fff" opacity="0.10"/><circle cx="120" cy="540" r="230" fill="#fff" opacity="0.08"/><text x="400" y="360" font-size="230" text-anchor="middle">${emoji}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/** The image to show for a recipe: its own cover, or a generated one. */
export function recipeImageSrc(recipe: Pick<Recipe, 'id' | 'title' | 'categories' | 'coverImage'>): string {
  return recipe.coverImage && recipe.coverImage.trim() ? recipe.coverImage : generatedCover(recipe);
}
