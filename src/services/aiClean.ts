import type { Recipe, Ingredient, InstructionStep } from '../types/recipe';
import { apiFetch } from './auth';

const ALLOWED_CATEGORIES = ['Dinners', 'Baking', 'Salads & Sides'];
const TIMEOUT_MS = 30000;

interface AiRecipe {
  title?: string;
  description?: string;
  servings?: number;
  prepMinutes?: number;
  cookMinutes?: number;
  ingredients?: string[];
  steps?: string[];
  categories?: string[];
  tags?: string[];
  creator?: string;
}

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((s) => String(s ?? '').trim()).filter(Boolean) : [];

const positive = (v: unknown): number | undefined => (typeof v === 'number' && v > 0 ? Math.round(v) : undefined);

/** A recipe we already parsed (for example from a website) written out as plain text, so the AI can normalise it too. */
function recipeToText(r: Partial<Recipe>): string {
  const lines: string[] = [];
  if (r.title) lines.push(`Title: ${r.title}`);
  if (r.description) lines.push(`Description: ${r.description}`);
  if (r.servings) lines.push(`Servings: ${r.servings}`);
  if (r.prepTimeMinutes) lines.push(`Prep time: ${r.prepTimeMinutes} minutes`);
  if (r.cookTimeMinutes) lines.push(`Cook time: ${r.cookTimeMinutes} minutes`);
  if (r.categories?.length) lines.push(`Categories: ${r.categories.join(', ')}`);
  if (r.tags?.length) lines.push(`Keywords: ${r.tags.join(', ')}`);
  if (r.ingredients?.length) lines.push('', 'Ingredients:', ...r.ingredients.map((i) => `- ${i.raw}`));
  if (r.instructions?.length) lines.push('', 'Instructions:', ...r.instructions.map((s, n) => `${n + 1}. ${s.text}`));
  return lines.join('\n');
}

/** Same tidy-up for a recipe that was already pulled apart, e.g. from a website's recipe data. */
export async function refineParsedRecipe<T extends Partial<Recipe>>(parsed: T): Promise<T> {
  const text = recipeToText(parsed);
  if (text.length < 40) return parsed;
  const { creator: _creator, ...refined } = await refineWithAi(text, parsed);
  return refined as unknown as T;
}

/**
 * Asks the server's AI to tidy a messy recipe. Anything the AI gets wrong or can't do falls back to what our own
 * parser already found, so a failure here only means "no extra polish", never a lost recipe.
 */
export async function refineWithAi<T extends Partial<Recipe>>(
  text: string,
  parsed: T
): Promise<T & { creator?: string }> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let res: Response;
    try {
      res = await apiFetch('/api/clean', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok || !(res.headers.get('content-type') || '').includes('json')) return parsed;
    const ai: AiRecipe | undefined = (await res.json())?.recipe;
    if (!ai) return parsed;

    const stamp = Date.now();
    const ingredients = strings(ai.ingredients);
    const steps = strings(ai.steps);
    const categories = strings(ai.categories).filter((c) => ALLOWED_CATEGORIES.includes(c));
    const tags = strings(ai.tags).map((t) => t.replace(/^#/, '').toLowerCase()).slice(0, 6);

    // Only trust the AI where it produced something; keep the parser's result otherwise
    const merged: Partial<Recipe> & { creator?: string } = { ...parsed };
    const title = (ai.title || '').trim();
    if (title) merged.title = title;
    if (ai.description?.trim()) merged.description = ai.description.trim();
    if (positive(ai.servings)) merged.servings = positive(ai.servings);
    if (positive(ai.prepMinutes)) merged.prepTimeMinutes = positive(ai.prepMinutes);
    if (positive(ai.cookMinutes)) merged.cookTimeMinutes = positive(ai.cookMinutes);
    if (ingredients.length > 0) {
      merged.ingredients = ingredients.map((raw, i): Ingredient => ({ id: `ing-${stamp}-${i}`, raw }));
    }
    if (steps.length > 0) {
      merged.instructions = steps.map((text, i): InstructionStep => ({ id: `step-${stamp}-${i}`, stepNumber: i + 1, text }));
    }
    if (categories.length > 0) {
      // Keep the source label (Instagram / Cookbooks) the parser added
      const sourceLabels = (parsed.categories || []).filter((c) => !ALLOWED_CATEGORIES.includes(c));
      merged.categories = [...categories, ...sourceLabels];
    }
    if (tags.length > 0) merged.tags = tags;
    if (ai.creator?.trim()) merged.creator = ai.creator.trim().replace(/^@/, '');
    return merged as T & { creator?: string };
  } catch {
    return parsed;
  }
}
