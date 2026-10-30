/**
 * Converts Instagram embed HTML or rich text into clean plain text with preserved line breaks.
 */
export function cleanHtmlCaption(rawHtml: string): string {
  return rawHtml
    .replace(/<br\s*[\/]?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .trim();
}

/**
 * Splits raw instruction prose or multi-sentence directions into clean line-break separated steps,
 * preserving culinary abbreviations (tbsp., tsp., min., oz., lb., approx., etc.).
 */
export function splitInstructionIntoSteps(text: string): string[] {
  const rawLines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  const result: string[] = [];

  for (const rawLine of rawLines) {
    const clean = rawLine
      .replace(/^(?:step\s*\d+[:.)\-]?|\d+[.)]|[1-9]️⃣|🔟)\s*/i, '')
      .replace(/(\s*#[A-Za-z0-9_]+)+\s*$/, '')
      .trim();
    if (!clean) continue;

    // Short instruction or single sentence: keep intact
    if (clean.length < 80) {
      result.push(clean);
      continue;
    }

    // Protect common abbreviations from splitting
    const safeText = clean
      .replace(/\b(tbsp|tsp|min|mins|sec|secs|hr|hrs|oz|lb|lbs|approx|deg|temp|vs|e\.g|i\.e)\./gi, '$1__DOT__');

    // Split on period or exclamation mark followed by whitespace and capital letter or number
    const parts = safeText.split(/(?<=[.!?])\s+(?=[A-Z0-9])/);
    if (parts.length > 1) {
      for (const part of parts) {
        const restored = part.replace(/__DOT__/g, '.').trim();
        if (restored) result.push(restored);
      }
    } else {
      result.push(clean);
    }
  }

  return result;
}

import type { Recipe, Ingredient, InstructionStep } from '../types/recipe';
import { inferIngredientsFromSteps } from './ingredientInference';
import { fetchInstagramCover } from './imageService';

/**
 * Converts ISO 8601 duration like "PT25M" or "PT1H15M" into minutes
 */
function parseDuration(durationStr?: string): number | undefined {
  if (!durationStr || typeof durationStr !== 'string') return undefined;
  const match = durationStr.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (!match) return undefined;
  const hours = parseInt(match[1] || '0', 10);
  const mins = parseInt(match[2] || '0', 10);
  return hours * 60 + mins || undefined;
}

/**
 * Extracts raw image URL from schema image field (which can be a string, array, or object)
 */
function extractImage(imageField: any): string | undefined {
  if (!imageField) return undefined;
  if (typeof imageField === 'string') return imageField;
  if (Array.isArray(imageField) && imageField.length > 0) {
    return typeof imageField[0] === 'string' ? imageField[0] : imageField[0]?.url;
  }
  if (typeof imageField === 'object' && imageField.url) {
    return imageField.url;
  }
  return undefined;
}

/**
 * Cleans HTML tags from text
 */
function stripHtml(html: string): string {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || '';
}

/**
 * Parses JSON-LD schema objects for Recipe definition
 */
export function parseRecipeFromHtml(html: string, sourceUrl: string): Partial<Recipe> | null {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // 1. Try finding JSON-LD
    const jsonLdScripts = doc.querySelectorAll('script[type="application/ld+json"]');
    let recipeData: any = null;

    for (let i = 0; i < jsonLdScripts.length; i++) {
      try {
        const content = jsonLdScripts[i].textContent;
        if (!content) continue;
        const json = JSON.parse(content);

        // Can be a single object, an array, or a @graph
        if (json['@type'] === 'Recipe' || (Array.isArray(json['@type']) && json['@type'].includes('Recipe'))) {
          recipeData = json;
          break;
        } else if (Array.isArray(json)) {
          const found = json.find((item: any) => item['@type'] === 'Recipe' || (Array.isArray(item['@type']) && item['@type'].includes('Recipe')));
          if (found) { recipeData = found; break; }
        } else if (json['@graph'] && Array.isArray(json['@graph'])) {
          const found = json['@graph'].find((item: any) => item['@type'] === 'Recipe' || (Array.isArray(item['@type']) && item['@type'].includes('Recipe')));
          if (found) { recipeData = found; break; }
        }
      } catch {
        // continue
      }
    }

    if (recipeData) {
      // Ingredients
      const rawIngredients: string[] = Array.isArray(recipeData.recipeIngredient)
        ? recipeData.recipeIngredient
        : [];
      
      const ingredients: Ingredient[] = rawIngredients.map((raw, idx) => ({
        id: `ing-${Date.now()}-${idx}`,
        raw: stripHtml(String(raw).trim())
      })).filter(i => i.raw.length > 0);

      // Instructions
      let rawInstructions: string[] = [];
      if (Array.isArray(recipeData.recipeInstructions)) {
        recipeData.recipeInstructions.forEach((inst: any) => {
          if (typeof inst === 'string') {
            rawInstructions.push(inst);
          } else if (inst['@type'] === 'HowToStep' && inst.text) {
            rawInstructions.push(inst.text);
          } else if (inst['@type'] === 'HowToSection' && Array.isArray(inst.itemListElement)) {
            inst.itemListElement.forEach((sub: any) => {
              if (sub.text) rawInstructions.push(sub.text);
              else if (typeof sub === 'string') rawInstructions.push(sub);
            });
          }
        });
      } else if (typeof recipeData.recipeInstructions === 'string') {
        rawInstructions = recipeData.recipeInstructions.split(/\r?\n/).filter((l: string) => l.trim().length > 0);
      }

      const instructions: InstructionStep[] = rawInstructions.map((text, idx) => ({
        id: `step-${Date.now()}-${idx}`,
        stepNumber: idx + 1,
        text: stripHtml(text.trim())
      })).filter(s => s.text.length > 0);

      let servings = 4;
      if (recipeData.recipeYield) {
        const yieldVal = Array.isArray(recipeData.recipeYield) ? recipeData.recipeYield[0] : recipeData.recipeYield;
        const parsedYield = parseInt(String(yieldVal).replace(/\D+/g, ''), 10);
        if (!isNaN(parsedYield) && parsedYield > 0 && parsedYield < 100) {
          servings = parsedYield;
        }
      }

      // Source domain
      let domain = '';
      try {
        domain = new URL(sourceUrl).hostname.replace('www.', '');
      } catch {
        domain = 'Web Recipe';
      }

      return {
        title: stripHtml(recipeData.name || doc.title || 'Untitled Recipe'),
        description: stripHtml(recipeData.description || ''),
        sourceType: 'website',
        sourceUrl,
        sourceName: recipeData.author?.name || domain,
        coverImage: extractImage(recipeData.image),
        servings,
        prepTimeMinutes: parseDuration(recipeData.prepTime),
        cookTimeMinutes: parseDuration(recipeData.cookTime),
        ingredients,
        instructions,
        categories: ['Dinners'],
        tags: []
      };
    }

    // Fallback: OpenGraph tags
    const ogTitle = doc.querySelector('meta[property="og:title"]')?.getAttribute('content');
    const ogImage = doc.querySelector('meta[property="og:image"]')?.getAttribute('content');
    const ogDesc = doc.querySelector('meta[property="og:description"]')?.getAttribute('content');

    return {
      title: ogTitle || doc.title || 'Imported Recipe',
      description: ogDesc || '',
      sourceType: 'website',
      sourceUrl,
      sourceName: new URL(sourceUrl).hostname.replace('www.', ''),
      coverImage: ogImage || undefined,
      servings: 4,
      ingredients: [],
      instructions: [],
      categories: ['Dinners'],
      tags: []
    };
  } catch (err) {
    console.error('Error parsing recipe from HTML:', err);
    return null;
  }
}

/**
 * Intelligently parse raw pasted text (e.g., from an Instagram reel caption or cookbook text)
 */
export function parseRawRecipeText(text: string, titleHint?: string): Partial<Recipe> {
  // Pre-normalize text to handle inline section keywords or collapsed line breaks
  const preprocessed = cleanHtmlCaption(text)
    .replace(/\r\n/g, '\n')
    .replace(/\s*\b(ingredients|what you need|shopping list|grocery list|you'll need|for the sauce|for the marinade)[\s:]+/gi, '\nIngredients:\n')
    .replace(/\s*\b(instructions|directions|method|how to make|steps|preparation|how to|process)[\s:]+/gi, '\nInstructions:\n')
    .replace(/\s*\b(step\s*\d+[:.)\-]?)\s+/gi, '\n$1 ')
    .replace(/\s*([1-9]️⃣|🔟)\s*/g, '\n$1 ')
    .replace(/(?:^|\s+)(\d+[\.\)])\s+/g, '\n$1 ');

  const lines = preprocessed.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  
  let title = titleHint || '';
  let description = '';
  const ingredients: Ingredient[] = [];
  const instructions: InstructionStep[] = [];
  const tags: string[] = [];

  type SectionType = 'header' | 'ingredients' | 'instructions' | 'notes';
  let currentSection: SectionType = 'header';
  let detectedTitle = false;

  const ingredientKeywords = /^(?:[✨👉👇•\*\-#\s]*)\b(ingredients|what you need|shopping list|grocery list|you'll need|for the sauce|for the marinade)\b[\s:]*$/i;
  const instructionKeywords = /^(?:[✨👉👇•\*\-#\s]*)\b(instructions|directions|method|how to make|steps|preparation|how to|process)\b[\s:]*$/i;
  const notesKeywords = /^(?:[✨👉👇•\*\-#\s]*)\b(notes|jasmine's notes|tips|variations)\b[\s:]*$/i;
  const isHashtagLine = (l: string) => /^(#[A-Za-z0-9_]+\s*)+$/.test(l) || (l.startsWith('#') && (l.match(/#/g) || []).length >= 2);
  const isSocialPromoLine = (l: string) => /^(follow\s+@|subscribe|link in bio|save this for later|tap link|share with a friend)/i.test(l);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Extract hashtags into tags
    if (line.includes('#')) {
      const foundTags = line.match(/#([A-Za-z0-9_]+)/g);
      if (foundTags) {
        foundTags.forEach(t => {
          const cleanTag = t.replace('#', '').toLowerCase();
          if (cleanTag.length > 2 && !['fyp', 'foryou', 'reels', 'viral', 'explore', 'explorepage'].includes(cleanTag)) {
            if (!tags.includes(cleanTag)) tags.push(cleanTag);
          }
        });
      }
    }

    // Skip promo lines or hashtag-only lines from instructions/ingredients
    if (isHashtagLine(line) || isSocialPromoLine(line)) {
      continue;
    }

    // Check section transitions
    if (ingredientKeywords.test(line)) {
      currentSection = 'ingredients';
      continue;
    }
    if (instructionKeywords.test(line)) {
      currentSection = 'instructions';
      continue;
    }
    if (notesKeywords.test(line)) {
      currentSection = 'notes';
      continue;
    }

    // Auto-detect title from first line if not already set
    if (!detectedTitle && !title && currentSection === 'header') {
      if (line.length < 90 && !line.match(/^\d+[\.\)]/) && !line.includes('http')) {
        title = line.replace(/^[#\*\-✨👉👇•\s]+/, '').replace(/[\s✨👉👇]+$/, '');
        detectedTitle = true;
        continue;
      }
    }

    if (currentSection === 'header') {
      // A numbered line like "1. Melt the butter" is a direction, not an ingredient
      if (/^(?:step\s*\d+[:.)\-]?|\d+[.)]|[1-9]️⃣|🔟)\s+[A-Za-z]/i.test(line)) {
        currentSection = 'instructions';
        const stepTexts = splitInstructionIntoSteps(line);
        for (const st of stepTexts) {
          instructions.push({
            id: `step-${Date.now()}-${instructions.length}`,
            stepNumber: instructions.length + 1,
            text: st
          });
        }
        continue;
      }
      // Check if line looks like an ingredient (starts with amount/bullet)
      if (/^(\d|½|¼|¾|⅓|⅔|\-|\*|•)/.test(line) && line.length < 100) {
        currentSection = 'ingredients';
        const rawItems = line.includes('•') ? line.split(/\s*•\s*/) : [line];
        rawItems.forEach(item => {
          if (item.trim()) {
            ingredients.push({
              id: `ing-${Date.now()}-${ingredients.length}`,
              raw: item.trim().replace(/^[\-\*•]\s*/, '')
            });
          }
        });
      } else {
        description += (description ? ' ' : '') + line;
      }
    } else if (currentSection === 'ingredients') {
      // Check if line suddenly looks like an instruction
      if (/^(?:step\s*\d+[:.)\-]?|\d+[.)]|[1-9]️⃣|🔟)\s+/i.test(line)) {
        currentSection = 'instructions';
        const stepTexts = splitInstructionIntoSteps(line);
        for (const st of stepTexts) {
          instructions.push({
            id: `step-${Date.now()}-${instructions.length}`,
            stepNumber: instructions.length + 1,
            text: st
          });
        }
      } else {
        const rawItems = line.includes('•') ? line.split(/\s*•\s*/) : [line];
        rawItems.forEach(item => {
          if (item.trim()) {
            ingredients.push({
              id: `ing-${Date.now()}-${ingredients.length}`,
              raw: item.trim().replace(/^[\-\*•]\s*/, '')
            });
          }
        });
      }
    } else if (currentSection === 'instructions') {
      const stepTexts = splitInstructionIntoSteps(line);
      for (const st of stepTexts) {
        instructions.push({
          id: `step-${Date.now()}-${instructions.length}`,
          stepNumber: instructions.length + 1,
          text: st
        });
      }
    }
  }

  // If no sections were marked explicitly, heuristic split
  if (ingredients.length === 0 && instructions.length === 0 && lines.length > 0) {
    lines.forEach((l) => {
      if (isHashtagLine(l) || isSocialPromoLine(l)) return;
      if (/^(\d|½|¼|¾|⅓|⅔|\-|\*|•)/.test(l) && l.length < 100) {
        ingredients.push({
          id: `ing-${Date.now()}-${ingredients.length}`,
          raw: l.replace(/^[\-\*•]\s*/, '')
        });
      } else {
        const stepTexts = splitInstructionIntoSteps(l);
        for (const st of stepTexts) {
          instructions.push({
            id: `step-${Date.now()}-${instructions.length}`,
            stepNumber: instructions.length + 1,
            text: st
          });
        }
      }
    });
  }

  // Captions often omit an ingredient list: infer one from the directions
  if (ingredients.length < 2) {
    const sourceSteps = instructions.length > 0 ? instructions.map(s => s.text) : [description];
    const inferred = inferIngredientsFromSteps(sourceSteps);
    const existing = new Set(ingredients.map(i => i.raw.toLowerCase()));
    inferred.forEach((raw) => {
      if (!existing.has(raw.toLowerCase())) {
        ingredients.push({
          id: `ing-${Date.now()}-${ingredients.length}`,
          raw
        });
      }
    });
  }

  return {
    title: title || 'Instagram Recipe',
    description: description.slice(0, 200),
    ingredients,
    instructions,
    servings: 4,
    categories: ['Dinners', 'Instagram'],
    tags
  };
}

export interface InstagramFetchResult {
  success: boolean;
  recipe?: Partial<Recipe>;
  caption?: string;
  sourceUrl: string;
  authorName: string;
  error?: string;
}

/**
 * Extracts a recipe from an Instagram link by pulling its caption
 */
export async function fetchInstagramRecipeFromUrl(inputUrlOrText: string): Promise<InstagramFetchResult> {
  const trimmed = inputUrlOrText.trim();

  // 1. Extract Instagram URL if present
  const urlMatch = trimmed.match(/https?:\/\/(?:www\.)?instagram\.com\/(?:[A-Za-z0-9_.-]+\/)?(?:p|reel|reels|share\/reel)\/([A-Za-z0-9_-]+)\/?(?:\?[^\s]*)?/i);
  const targetUrl = urlMatch ? urlMatch[0] : (trimmed.startsWith('http') ? trimmed.split(/\s+/)[0] : '');

  // Check if user pasted a link with caption together in the same text
  let remainingText = targetUrl ? trimmed.replace(targetUrl, '').trim() : '';
  // If newlines were collapsed, insert breaks before common keywords
  if (remainingText) {
    remainingText = remainingText
      .replace(/\s*(ingredients|what you need|you'll need)[\s:]+/gi, '\nIngredients:\n')
      .replace(/\s*(instructions|directions|method|how to make|steps)[\s:]+/gi, '\nInstructions:\n')
      .replace(/(\d+[\.\)])\s+/g, '\n$1 ');
  }

  // Extract handle if available
  const userMatch = targetUrl.match(/instagram\.com\/([A-Za-z0-9_.-]+)\/(?:reel|p)\//);
  const authorName = userMatch && !['p', 'reel', 'reels', 'share'].includes(userMatch[1])
    ? `@${userMatch[1]} on Instagram`
    : 'Instagram Reel';

  // If caption was already pasted along with the URL in the text
  if (remainingText.length > 25) {
    const parsed = parseRawRecipeText(remainingText);
    const pastedCover = targetUrl ? await fetchInstagramCover(targetUrl) : undefined;
    return {
      success: true,
      recipe: {
        ...parsed,
        coverImage: pastedCover,
        sourceType: 'instagram',
        sourceUrl: targetUrl || inputUrlOrText,
        sourceName: authorName,
        categories: ['Dinners', 'Instagram']
      },
      caption: remainingText,
      sourceUrl: targetUrl || inputUrlOrText,
      authorName
    };
  }

  if (!targetUrl) {
    throw new Error('Please enter a valid Instagram post or reel link');
  }

  // 2. Query serverless endpoint /api/instagram
  try {
    const apiRes = await fetch(`/api/instagram?url=${encodeURIComponent(targetUrl)}`);
    if (apiRes.ok) {
      const data = await apiRes.json();
      if (data.caption && data.caption.length > 10) {
        const parsed = parseRawRecipeText(data.caption);
        const apiCover = await fetchInstagramCover(targetUrl, data.image);
        return {
          success: true,
          recipe: {
            ...parsed,
            coverImage: apiCover,
            sourceType: 'instagram',
            sourceUrl: targetUrl,
            sourceName: data.authorName || authorName,
            categories: ['Dinners', 'Instagram']
          },
          caption: data.caption,
          sourceUrl: targetUrl,
          authorName: data.authorName || authorName
        };
      }
    }
  } catch {
    // Continue to proxy fallback
  }

  // 3. Fallback to public CORS proxies
  try {
    const match = targetUrl.match(/\/(?:p|reel|reels|share\/reel)\/([A-Za-z0-9_-]+)/);
    const shortcode = match ? match[1] : '';
    if (shortcode) {
      const embedUrl = `https://www.instagram.com/p/${shortcode}/embed/captioned/`;
      const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(embedUrl)}`;
      const res = await fetch(proxyUrl);
      if (res.ok) {
        const json = await res.json();
        const html = json.contents || '';
        const captionMatch = html.match(/class="Caption"[^>]*>([\s\S]*?)<\/div>/i);
        if (captionMatch) {
          const caption = cleanHtmlCaption(captionMatch[1]);
          if (caption.length > 10) {
            const parsed = parseRawRecipeText(caption);
            const proxyCover = await fetchInstagramCover(targetUrl);
            return {
              success: true,
              recipe: {
                ...parsed,
                coverImage: proxyCover,
                sourceType: 'instagram',
                sourceUrl: targetUrl,
                sourceName: authorName,
                categories: ['Dinners', 'Instagram']
              },
              caption,
              sourceUrl: targetUrl,
              authorName
            };
          }
        }
      }
    }
  } catch {
    // Continue to failure reporting
  }

  return {
    success: false,
    sourceUrl: targetUrl,
    authorName,
    error: 'Instagram requires verification for this specific link. You can paste the copied caption text below to format in 1 click!'
  };
}
