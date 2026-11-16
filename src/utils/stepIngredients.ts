import type { Ingredient, InstructionStep, Recipe } from '../types/recipe';
import { scaleIngredient } from './scaleIngredient';

// Words that say how much or how it's prepared, not what the ingredient is
const UNITS = new Set([
  'tsp', 'teaspoon', 'teaspoons', 'tbsp', 'tablespoon', 'tablespoons', 'cup', 'cups', 'oz', 'ounce', 'ounces', 'lb', 'lbs',
  'pound', 'pounds', 'g', 'gram', 'grams', 'kg', 'ml', 'l', 'liter', 'liters', 'pinch', 'dash', 'clove', 'cloves', 'head',
  'heads', 'can', 'cans', 'stick', 'sticks', 'slice', 'slices', 'piece', 'pieces', 'bunch', 'sprig', 'sprigs', 'package',
]);
const FILLER = new Set([
  'of', 'a', 'an', 'the', 'and', 'or', 'to', 'for', 'fresh', 'large', 'small', 'medium', 'light', 'dark', 'neutral', 'ground',
  'minced', 'chopped', 'diced', 'sliced', 'grated', 'melted', 'softened', 'divided', 'optional', 'taste', 'plus', 'more',
  'extra', 'virgin', 'whole', 'boneless', 'skinless', 'thinly', 'finely', 'roughly', 'cold', 'warm', 'hot', 'room',
  'temperature', 'unsalted', 'salted', 'lightly', 'beaten', 'packed', 'heaping', 'about', 'cut', 'into', 'inch', 'pieces',
]);
// Too general on their own: "sauce" should not match every sauce
const GENERIC = new Set(['sauce', 'powder', 'paste', 'juice', 'oil', 'sugar', 'flour', 'milk', 'water', 'butter']);

const COLOR_OR_TYPE = new Set(['baking', 'black', 'brown', 'white', 'sweet', 'green', 'red', 'yellow', 'cream', 'sour', 'dry', 'whipping', 'heavy', 'sesame', 'soy', 'olive', 'coconut', 'apple', 'rice', 'corn', 'brown']);

const stem =(w: string) => {
  if (w.length > 4 && w.endsWith('ies')) return w.slice(0, -3) + 'y';
  if (w.length > 3 && w.endsWith('oes')) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
};

function coreWords(raw: string): string[] {
  const text = raw.toLowerCase().replace(/\([^)]*\)/g, ' ').split(',')[0];
  return text
    .split(/[^a-zà-ÿ]+/)
    .filter((w) => w.length >= 2 && !UNITS.has(w) && !FILLER.has(w))
    .map(stem);
}

/**
 * The ingredients a step talks about, with the amounts to use (scaled to the servings being cooked).
 * Matches by name, so "sauce ingredients" or "the dry ingredients" are not expanded.
 */
export function stepIngredients(stepText: string, ingredients: Ingredient[], factor = 1): string[] {
  const lower = stepText.toLowerCase();
  const words = new Set((lower.match(/[a-zà-ÿ]+/g) || []).map(stem));
  const cores = ingredients.map((i) => coreWords(i.raw));
  // How many ingredients use each word: "gorgonzola" is a safe nickname for "crumbled Gorgonzola cheese" if no other
  // ingredient uses that word (while "cheese" alone, used by several, is not)
  const wordCount = new Map<string, number>();
  for (const c of cores) for (const w of new Set(c)) wordCount.set(w, (wordCount.get(w) || 0) + 1);
  // How many ingredients END with each word ("brown sugar" and "white sugar" both end with "sugar")
  const lastCount = new Map<string, number>();
  for (const c of cores) if (c.length > 0) lastCount.set(c[c.length - 1], (lastCount.get(c[c.length - 1]) || 0) + 1);

  // Ingredients that match, grouped by name (recipes often list the same thing twice: once for the marinade, once for the sauce)
  const groups = new Map<string, Array<{ raw: string; score: number }>>();
  ingredients.forEach((ing, idx) => {
    const core = cores[idx];
    if (core.length === 0) return;
    const all = core.every((w) => words.has(w));
    const last = core[core.length - 1];
    // A very common word ("sugar", "flour") alone is only a safe nickname when it is clear which ingredient it means:
    // one ingredient ends with it, or the step says it in the plural ("both sugars") and so means them all
    const saysPlural = GENERIC.has(last) && new RegExp(`\\b${last}s\\b`).test(lower);
    const lastOnly = core.length > 1 && words.has(last) && (!GENERIC.has(last) || lastCount.get(last) === 1 || saysPlural);
    const distinctOnly =
      core.length > 1 &&
      core.some((w) => w.length >= 4 && wordCount.get(w) === 1 && !COLOR_OR_TYPE.has(w) && !GENERIC.has(w) && words.has(w));
    if (!(all || lastOnly || distinctOnly)) return;

    // Prefer the line whose amount (and whole name) the step itself mentions
    const amount = ing.raw.toLowerCase().match(/^\s*(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?|[½¼¾⅓⅔⅛])\s*([a-z]+)?/);
    const amountText = amount ? `${amount[1].trim()} ${amount[2] || ''}`.trim() : '';
    const amountRe = amountText
      ? new RegExp(
          `(?<![\\d./])${amountText.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&').replace(/\s+/g, '\\s*')}\\s+(?:of\\s+)?(?:[a-zà-ÿ]+\\s+){0,2}${core[core.length - 1]}`
        )
      : null;
    const rawWords = (ing.raw.toLowerCase().split(',')[0].match(/[a-zà-ÿ]{3,}/g) || []).filter((w) => !UNITS.has(w));
    let score = 0;
    if (amountRe && amountRe.test(lower)) score += 2;
    if (rawWords.length > 0 && rawWords.every((w) => lower.includes(w))) score += 1;

    const key = core.join(' ');
    groups.set(key, [...(groups.get(key) || []), { raw: ing.raw, score }]);
  });

  const out: string[] = [];
  for (const list of groups.values()) {
    const best = Math.max(...list.map((l) => l.score));
    // Same name listed twice and the step doesn't say which: show the first one only
    const keep = best > 0 ? list.filter((l) => l.score === best) : list.slice(0, 1);
    for (const k of keep) out.push(scaleIngredient(k.raw, factor));
  }
  return out;
}

/** A fingerprint of the ingredients and steps. The AI's step-by-step ingredient matches are only trusted while this still agrees. */
export function stepMapBasis(r: Pick<Recipe, 'ingredients' | 'instructions'>): string {
  const text = `${r.ingredients.map((i) => i.raw.trim().toLowerCase()).join('|')}#${r.instructions.map((s) => s.text.trim().toLowerCase()).join('|')}`;
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
  return String(h);
}

/**
 * The ingredient amounts to show under one step. Uses the AI's matches when they are up to date with the recipe, and
 * otherwise falls back to matching by name (so a new, edited or offline recipe still shows chips).
 */
export function ingredientsForStep(
  step: InstructionStep,
  recipe: Pick<Recipe, 'ingredients' | 'instructions' | 'stepMapBasis'>,
  factor = 1
): string[] {
  if (step.ingredientRefs && recipe.stepMapBasis && recipe.stepMapBasis === stepMapBasis(recipe)) {
    return step.ingredientRefs
      .map((i) => recipe.ingredients[i])
      .filter((ing): ing is Ingredient => !!ing)
      .map((ing) => scaleIngredient(ing.raw, factor));
  }
  return stepIngredients(step.text, recipe.ingredients, factor);
}