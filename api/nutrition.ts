import { requireLogin } from './_auth.js';
import { askGeminiJson, GeminiError } from './_gemini.js';

// Estimates calories and macros per serving from a recipe's ingredient list.
const MAX_INPUT = 8000;

const INSTRUCTIONS = `You estimate the nutrition of a home recipe from its ingredient list.
Rules:
- Work out the total for the whole recipe from the ingredient amounts, then divide by the number of servings given.
- Use typical values for each ingredient (for example from USDA data). Count oils, butter, sugar and other cooking fats as listed.
- Ignore ingredients with no amount only if they are tiny (salt, pepper, a pinch of herbs, garnish). Guess a normal amount for staples like "oil for frying".
- If the servings number is missing or 0, assume 4.
- Return whole numbers: calories (kcal), proteinG, carbsG, fatG per ONE serving. Also fiberG per serving.
- This is a rough estimate, never refuse. If the list is not food, return zeros.`;

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    calories: { type: 'INTEGER' },
    proteinG: { type: 'INTEGER' },
    carbsG: { type: 'INTEGER' },
    fatG: { type: 'INTEGER' },
    fiberG: { type: 'INTEGER' },
  },
  required: ['calories', 'proteinG', 'carbsG', 'fatG'],
};

const clean = (v: unknown) => (typeof v === 'number' && isFinite(v) && v >= 0 ? Math.round(v) : 0);

export default async function handler(req: any, res: any) {
  if (!requireLogin(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }
  const ingredients: string[] = Array.isArray(body?.ingredients) ? body.ingredients.map((i: unknown) => String(i).trim()).filter(Boolean) : [];
  const servings = Math.max(1, Math.round(Number(body?.servings) || 4));
  const text = `Servings: ${servings}\nIngredients:\n${ingredients.map((i) => `- ${i}`).join('\n')}`.slice(0, MAX_INPUT);
  if (ingredients.length === 0) return res.status(400).json({ error: 'No ingredients to work with' });

  try {
    const n = await askGeminiJson(INSTRUCTIONS, text, SCHEMA);
    const nutrition = {
      calories: clean(n.calories),
      proteinG: clean(n.proteinG),
      carbsG: clean(n.carbsG),
      fatG: clean(n.fatG),
      fiberG: clean(n.fiberG),
    };
    if (nutrition.calories === 0) return res.status(422).json({ error: 'Could not estimate this one' });
    return res.status(200).json({ nutrition });
  } catch (err: any) {
    const status = err instanceof GeminiError && err.notConfigured ? 503 : 502;
    return res.status(status).json({ error: err?.message || 'Nutrition estimate failed' });
  }
}
