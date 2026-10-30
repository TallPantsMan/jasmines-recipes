import type { Recipe, Ingredient, InstructionStep } from '../types/recipe';
import { parseRawRecipeText, inferCategories } from './captionParser';
import { fetchInstagramCover } from './imageService';
import { fetchPageHtml } from './pageFetcher';

/**
 * Converts a recipe duration into minutes. Handles ISO 8601 ("PT25M", "PT1H15M", "PT01H15M",
 * "P0Y0M0DT0H20M0.000S"), plain text ("20 minutes", "1 hr 30 min") and {minValue,maxValue} objects.
 */
function parseDuration(value?: any): number | undefined {
  if (value == null) return undefined;
  if (Array.isArray(value)) return parseDuration(value[0]);
  if (typeof value === 'object') return parseDuration(value.minValue ?? value.value ?? value.maxValue);
  if (typeof value === 'number') return value > 0 ? Math.round(value) : undefined;
  const s = String(value).trim();
  if (!s) return undefined;

  let minutes = 0;
  const iso = s.match(/^P(?:\d+Y)?(?:\d+M)?(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:[\d.]+S)?)?$/i);
  if (iso) {
    const [, w, d, h, m] = iso;
    minutes = Number(w || 0) * 7 * 1440 + Number(d || 0) * 1440 + Number(h || 0) * 60 + Number(m || 0);
  } else {
    const h = s.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b/i);
    const m = s.match(/(\d+)\s*(?:minutes?|mins?|m)\b/i);
    minutes = (h ? Math.round(parseFloat(h[1]) * 60) : 0) + (m ? parseInt(m[1], 10) : 0);
  }
  return minutes > 0 ? minutes : undefined;
}

/**
 * Works out how many servings a recipe makes from schema.org recipeYield, which sites send as
 * "4", 4, ["48", "4 dozen cookies"], "Makes 12", "6 to 8 servings" or "2 potpies (8 servings each)".
 */
function parseServings(yieldField: any): number {
  const parts = (Array.isArray(yieldField) ? yieldField : [yieldField])
    .filter((v) => v != null)
    .map((v) => String(v));
  const valid = (n: number) => n >= 1 && n < 100;

  for (const part of parts) {
    const m =
      part.match(/(\d+)(?:\s*(?:-|–|—|to)\s*\d+)?\s*(?:servings?|people|persons?|portions?|pax)\b/i) ||
      part.match(/\bserves\s+(\d+)/i);
    if (m && valid(Number(m[1]))) return Number(m[1]);
  }
  for (const part of parts) {
    const m = part.match(/\d+/);
    if (m && valid(Number(m[0]))) return Number(m[0]);
  }
  return 4;
}

/**
 * Extracts raw image URL from schema image field (which can be a string, array, or object)
 */
function extractImage(imageField: any): string | undefined {
  if (!imageField) return undefined;
  if (typeof imageField === 'string') return imageField;
  if (Array.isArray(imageField)) {
    for (const item of imageField) {
      const found = extractImage(item);
      if (found) return found;
    }
    return undefined;
  }
  if (typeof imageField === 'object') return imageField.url || imageField.contentUrl || undefined;
  return undefined;
}

/**
 * Turns HTML (or text with entities such as &frac12; and &amp;) into clean plain text.
 * Uses DOMParser, which never runs scripts or loads images, unlike setting innerHTML on a live element.
 */
function stripHtml(html: string): string {
  const doc = new DOMParser().parseFromString(String(html ?? ''), 'text/html');
  return (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
}

/** schema.org fields like keywords / recipeCategory arrive as a string, a comma list, or an array */
function toList(value: any): string[] {
  const items = Array.isArray(value) ? value : value == null ? [] : [value];
  return items
    .flatMap((v) => (typeof v === 'string' ? v.split(',') : v?.name ? [String(v.name)] : []))
    .map((s) => stripHtml(s))
    .filter(Boolean);
}

function authorNames(author: any): string[] {
  const items = Array.isArray(author) ? author : author ? [author] : [];
  return items.map((a) => (typeof a === 'string' ? a : a?.name)).filter((n): n is string => !!n).map((n) => n.toLowerCase());
}

const JUNK_TAGS = /^(publisher-tested|web|recipes?|food|cook the book|skills|how to .*)$/i;

function buildTags(opts: { cuisine: string[]; categories: string[]; keywords: string[]; authors: string[]; title: string }): string[] {
  const tags: string[] = [];
  const titleLower = opts.title.toLowerCase();
  [...opts.cuisine, ...opts.categories, ...opts.keywords].forEach((raw) => {
    const t = raw.toLowerCase().replace(/^#/, '').trim();
    if (!t || t.length < 3 || t.length > 28) return;
    if (JUNK_TAGS.test(t) || opts.authors.includes(t) || t === titleLower) return;
    if (!tags.includes(t)) tags.push(t);
  });
  return tags.slice(0, 8);
}

/** Collects instruction text from the many shapes schema.org allows (strings, HowToStep, HowToSection, nested lists) */
function collectInstructionTexts(node: any, out: string[]): void {
  if (!node) return;
  if (Array.isArray(node)) {
    node.forEach((n) => collectInstructionTexts(n, out));
    return;
  }
  if (typeof node === 'string') {
    String(node)
      .replace(/<\/(?:p|li|div)>|<br\s*\/?>/gi, '\n')
      .split(/\r?\n/)
      .map((l) => stripHtml(l))
      .filter(Boolean)
      .forEach((l) => out.push(l));
    return;
  }
  if (typeof node === 'object') {
    if (Array.isArray(node.itemListElement)) collectInstructionTexts(node.itemListElement, out);
    else if (node.text) collectInstructionTexts(String(node.text), out);
    else if (node.name) collectInstructionTexts(String(node.name), out);
  }
}

/** Steps that carry no cooking information ("Gather all ingredients.", "Enjoy!") */
const FILLER_STEP = /^(?:(?:gather|get out|collect|assemble)\b[^.!]{0,40}\bingredients[.!\s]*|enjoy[.!\s]*|bon app[eé]tit[.!\s]*)$/i;

/** Fallback for older sites that mark up recipes with microdata instead of JSON-LD */
function parseMicrodataRecipe(doc: Document): { name?: string; ingredients: string[]; steps: string[] } | null {
  const scope = doc.querySelector('[itemtype*="schema.org/Recipe" i]');
  if (!scope) return null;
  const text = (el: Element) => (el.textContent || '').replace(/\s+/g, ' ').trim();
  const ingredients = Array.from(scope.querySelectorAll('[itemprop="recipeIngredient"], [itemprop="ingredients"]')).map(text).filter(Boolean);
  const steps: string[] = [];
  scope.querySelectorAll('[itemprop="recipeInstructions"]').forEach((el) => {
    const items = el.querySelectorAll('li, p');
    if (items.length > 0) items.forEach((li) => { const t = text(li); if (t) steps.push(t); });
    else (el.textContent || '').split(/\r?\n/).map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean).forEach((l) => steps.push(l));
  });
  const name = scope.querySelector('[itemprop="name"]');
  if (ingredients.length === 0 && steps.length === 0) return null;
  return { name: name ? text(name) : undefined, ingredients, steps };
}

const asAbsoluteUrl = (maybeUrl: string | undefined, base: string): string | undefined => {
  if (!maybeUrl) return undefined;
  try {
    return new URL(maybeUrl, base).href;
  } catch {
    return maybeUrl;
  }
};

/**
 * Parses JSON-LD schema objects for Recipe definition
 */
export function parseRecipeFromHtml(html: string, sourceUrl: string): Partial<Recipe> | null {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    let domain = '';
    try {
      domain = new URL(sourceUrl).hostname.replace(/^www\./, '');
    } catch {
      domain = 'Web Recipe';
    }

    const isRecipe = (item: any) =>
      item && (item['@type'] === 'Recipe' || (Array.isArray(item['@type']) && item['@type'].includes('Recipe')));
    const findRecipe = (json: any): any => {
      if (!json) return null;
      if (Array.isArray(json)) {
        for (const item of json) {
          const found = findRecipe(item);
          if (found) return found;
        }
        return null;
      }
      if (isRecipe(json)) return json;
      if (json['@graph']) return findRecipe(json['@graph']);
      return null;
    };

    // 1. Try finding JSON-LD (single object, array, or @graph)
    const jsonLdScripts = doc.querySelectorAll('script[type="application/ld+json"]');
    let recipeData: any = null;
    for (let i = 0; i < jsonLdScripts.length && !recipeData; i++) {
      try {
        const content = jsonLdScripts[i].textContent;
        if (content) recipeData = findRecipe(JSON.parse(content));
      } catch {
        // continue
      }
    }

    const ogImage = doc.querySelector('meta[property="og:image"]')?.getAttribute('content') || undefined;

    if (recipeData) {
      const ingredients: Ingredient[] = (Array.isArray(recipeData.recipeIngredient) ? recipeData.recipeIngredient : [])
        .map((raw: any, idx: number) => ({
          id: `ing-${Date.now()}-${idx}`,
          raw: stripHtml(typeof raw === 'string' ? raw : raw?.name || raw?.text || '')
        }))
        .filter((i: Ingredient) => i.raw.length > 0);

      const stepTexts: string[] = [];
      collectInstructionTexts(recipeData.recipeInstructions, stepTexts);
      const instructions: InstructionStep[] = stepTexts
        .filter((t) => !FILLER_STEP.test(t))
        .map((text, idx) => ({
          id: `step-${Date.now()}-${idx}`,
          stepNumber: idx + 1,
          text
        }));

      const title = stripHtml(recipeData.name || doc.title || 'Untitled Recipe');
      const cuisine = toList(recipeData.recipeCuisine);
      const categoryList = toList(recipeData.recipeCategory);
      const keywords = toList(recipeData.keywords);

      let prep = parseDuration(recipeData.prepTime);
      let cook = parseDuration(recipeData.cookTime);
      const total = parseDuration(recipeData.totalTime);
      if (!prep && !cook && total) cook = total;

      return {
        title,
        description: stripHtml(recipeData.description || ''),
        sourceType: 'website',
        sourceUrl,
        sourceName: domain,
        coverImage: asAbsoluteUrl(extractImage(recipeData.image) || ogImage, sourceUrl),
        servings: parseServings(recipeData.recipeYield),
        prepTimeMinutes: prep,
        cookTimeMinutes: cook,
        ingredients,
        instructions,
        categories: inferCategories({ title, categories: categoryList, keywords }),
        tags: buildTags({ cuisine, categories: categoryList, keywords, authors: authorNames(recipeData.author), title })
      };
    }

    // 2. Older sites: schema.org microdata
    const micro = parseMicrodataRecipe(doc);
    const ogTitle = doc.querySelector('meta[property="og:title"]')?.getAttribute('content');
    const ogDesc = doc.querySelector('meta[property="og:description"]')?.getAttribute('content');
    const title = stripHtml(micro?.name || ogTitle || doc.title || 'Imported Recipe');

    // 3. Last resort: OpenGraph tags only (title, picture, blurb) - no ingredients or steps found
    return {
      title,
      description: ogDesc ? stripHtml(ogDesc) : '',
      sourceType: 'website',
      sourceUrl,
      sourceName: domain,
      coverImage: asAbsoluteUrl(ogImage, sourceUrl),
      servings: 4,
      ingredients: (micro?.ingredients || []).map((raw, idx) => ({ id: `ing-${Date.now()}-${idx}`, raw })),
      instructions: (micro?.steps || [])
        .filter((t) => !FILLER_STEP.test(t))
        .map((text, idx) => ({ id: `step-${Date.now()}-${idx}`, stepNumber: idx + 1, text })),
      categories: inferCategories({ title }),
      tags: []
    };
  } catch (err) {
    console.error('Error parsing recipe from HTML:', err);
    return null;
  }
}

export { parseRawRecipeText } from './captionParser';

export interface InstagramFetchResult {
  success: boolean;
  recipe?: Partial<Recipe>;
  caption?: string;
  sourceUrl: string;
  authorName: string;
  error?: string;
}

/** Reads the caption and poster out of an Instagram /embed/captioned/ page (used when our own server route is unavailable) */
function captionFromEmbedHtml(html: string): { caption: string; username: string } {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const el = doc.querySelector('.Caption');
  if (!el) return { caption: '', username: '' };
  const username = (el.querySelector('.CaptionUsername')?.textContent || '').trim().replace(/^@/, '');
  el.querySelectorAll('.CaptionUsername, .CaptionComments').forEach((n) => n.remove());
  el.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));
  return { caption: (el.textContent || '').trim(), username };
}

/**
 * Extracts a recipe from an Instagram link by pulling its caption
 */
export async function fetchInstagramRecipeFromUrl(inputUrlOrText: string): Promise<InstagramFetchResult> {
  const trimmed = inputUrlOrText.trim();

  // 1. Extract the Instagram URL (tracking parameters and all) if present
  const urlMatch = trimmed.match(/https?:\/\/(?:www\.)?instagram\.com\/[^\s]+/i);
  const targetUrl = urlMatch
    ? urlMatch[0].replace(/[)\].,;!]+$/, '')
    : trimmed.startsWith('http') ? trimmed.split(/\s+/)[0] : '';

  // Handle from the link itself (instagram.com/feelgoodfoodie/reel/...), used only if the page doesn't name the poster
  const userMatch = targetUrl.match(/instagram\.com\/([A-Za-z0-9_.-]+)\/(?:reel|p)\//);
  const urlHandle = userMatch && !['p', 'reel', 'reels', 'share', 'tv'].includes(userMatch[1]) ? `@${userMatch[1]}` : '';

  const buildResult = (caption: string, handle: string, cover: string | undefined): InstagramFetchResult => {
    const { creator, ...parsed } = parseRawRecipeText(caption, undefined, { source: 'instagram' });
    const poster = handle || urlHandle;
    const credited = creator && poster && creator.toLowerCase() !== poster.replace(/^@/, '').toLowerCase() ? `@${creator}` : '';
    const sourceName = credited ? `${credited} via ${poster}` : poster || (creator ? `@${creator}` : 'Instagram Reel');
    return {
      success: true,
      recipe: {
        ...parsed,
        coverImage: cover,
        sourceType: 'instagram',
        sourceUrl: targetUrl,
        sourceName
      },
      caption,
      sourceUrl: targetUrl,
      authorName: poster || 'Instagram Reel'
    };
  };

  // 2. A caption pasted together with the link: parse the pasted text as-is
  const pasted = targetUrl ? trimmed.replace(urlMatch ? urlMatch[0] : targetUrl, '').trim() : '';
  if (pasted.length > 25) {
    const cover = await fetchInstagramCover(targetUrl);
    return buildResult(pasted, urlHandle, cover);
  }

  if (!targetUrl) {
    throw new Error('Please enter a valid Instagram post or reel link');
  }

  // 3. Our serverless endpoint /api/instagram
  try {
    const apiRes = await fetch(`/api/instagram?url=${encodeURIComponent(targetUrl)}`);
    if (apiRes.ok) {
      const data = await apiRes.json();
      if (data.caption && data.caption.length > 10) {
        const cover = await fetchInstagramCover(targetUrl, data.image);
        return buildResult(data.caption, data.username ? `@${data.username}` : data.authorName !== 'Instagram Reel' ? data.authorName || '' : '', cover);
      }
    }
  } catch {
    // Continue to proxy fallback
  }

  // 4. Fallback to public CORS proxies
  try {
    const match = targetUrl.match(/\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/);
    if (match) {
      const html = await fetchPageHtml(`https://www.instagram.com/p/${match[1]}/embed/captioned/`);
      const { caption, username } = captionFromEmbedHtml(html);
      if (caption.length > 10) {
        const cover = await fetchInstagramCover(targetUrl);
        return buildResult(caption, username ? `@${username}` : '', cover);
      }
    }
  } catch {
    // Continue to failure reporting
  }

  return {
    success: false,
    sourceUrl: targetUrl,
    authorName: urlHandle || 'Instagram Reel',
    error: 'Instagram requires verification for this specific link. You can paste the copied caption text below to format in 1 click!'
  };
}
