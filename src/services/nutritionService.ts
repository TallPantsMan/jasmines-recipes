import { apiFetch } from './auth';
import type { Recipe, Nutrition } from '../types/recipe';

/** A fingerprint of what the estimate was based on. If the ingredients or servings change, the estimate is out of date. */
export function nutritionBasis(r: Pick<Recipe, 'ingredients' | 'servings'>): string {
  const text = `${r.servings || 4}|${r.ingredients.map((i) => i.raw.trim().toLowerCase()).join('|')}`;
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
  return String(h);
}

/** Asks the server's AI for calories and macros per serving. Returns null if it can't be done right now. */
export async function estimateNutrition(r: Recipe): Promise<Nutrition | null> {
  if (r.ingredients.length === 0) return null;
  try {
    const res = await apiFetch('/api/nutrition', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ servings: r.servings || 4, ingredients: r.ingredients.map((i) => i.raw) }),
    });
    if (!res.ok || !(res.headers.get('content-type') || '').includes('json')) return null;
    const n = (await res.json())?.nutrition;
    if (!n || !n.calories) return null;
    return { ...n, basis: nutritionBasis(r) };
  } catch {
    return null;
  }
}
