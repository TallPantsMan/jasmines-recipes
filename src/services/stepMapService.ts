import { apiFetch } from './auth';
import type { Recipe, InstructionStep } from '../types/recipe';
import { stepMapBasis } from '../utils/stepIngredients';

/**
 * Asks the server's AI which ingredients each step uses. Returns the steps with that filled in, plus the fingerprint
 * of what it was worked out for, or null if it can't be done right now (the app then matches by name instead).
 */
export async function mapStepIngredients(r: Recipe): Promise<{ instructions: InstructionStep[]; stepMapBasis: string } | null> {
  if (r.ingredients.length === 0 || r.instructions.length === 0) return null;
  try {
    const res = await apiFetch('/api/stepmap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ingredients: r.ingredients.map((i) => i.raw), steps: r.instructions.map((s) => s.text) }),
    });
    if (!res.ok || !(res.headers.get('content-type') || '').includes('json')) return null;
    const refs: unknown = (await res.json())?.steps;
    if (!Array.isArray(refs) || refs.length !== r.instructions.length) return null;
    return {
      instructions: r.instructions.map((s, i) => ({
        ...s,
        ingredientRefs: (Array.isArray(refs[i]) ? refs[i] : []).filter(
          (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 0 && (n as number) < r.ingredients.length
        ),
      })),
      stepMapBasis: stepMapBasis(r),
    };
  } catch {
    return null;
  }
}
