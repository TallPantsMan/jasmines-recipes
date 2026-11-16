import { requireLogin } from './_auth.js';
import { askGeminiJson, GeminiError } from './_gemini.js';

// Works out which ingredients each cooking step uses, so the app can show the right amounts under every step.
const MAX_INPUT = 14000;

const INSTRUCTIONS = `You match a recipe's ingredients to its cooking steps. You get a numbered ingredient list and numbered steps.
For each step, return the numbers of the ingredients that step tells the cook to add, mix in, cook with or use.
Rules:
- Use ONLY ingredient numbers from the list. Never invent numbers or ingredients.
- Include an ingredient in the step where the cook puts it to use. If a step only refers back to a mixture that earlier steps already made ("combine the wet and dry ingredients", "stir well", "mix until smooth"), do not list those ingredients again.
- Words for a group mean every ingredient in that group: "both sugars" is every sugar in the list, "the spices" is the listed spices, "the dry ingredients" or "the sauce ingredients" are the ingredients that belong to them, but only in the step that first uses them.
- If an ingredient is used in several steps (half now, the rest later, or salt in the batter and again on top), list it in each step that uses it.
- If the same ingredient appears twice in the list (for example once for a marinade and once for a sauce), pick the one that fits that step.
- A step that adds no ingredients (preheat the oven, bake, rest, chill, wash) gets an empty list.
- Garnishes and toppings belong to the step that says to add or serve them.
Return one entry per step, in order, with the step number and its ingredient numbers.`;

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    steps: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          step: { type: 'INTEGER' },
          ingredients: { type: 'ARRAY', items: { type: 'INTEGER' } },
        },
        required: ['step', 'ingredients'],
      },
    },
  },
  required: ['steps'],
};

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
  const ingredients: string[] = Array.isArray(body?.ingredients) ? body.ingredients.map((i: unknown) => String(i).trim()) : [];
  const steps: string[] = Array.isArray(body?.steps) ? body.steps.map((s: unknown) => String(s).trim()) : [];
  if (ingredients.length === 0 || steps.length === 0) return res.status(400).json({ error: 'Need ingredients and steps' });

  const text = [
    'Ingredients:',
    ...ingredients.map((raw, i) => `${i + 1}. ${raw}`),
    '',
    'Steps:',
    ...steps.map((s, i) => `${i + 1}. ${s}`),
  ].join('\n');
  if (text.length > MAX_INPUT) return res.status(413).json({ error: 'Recipe is too long to work with' });

  try {
    const out = await askGeminiJson(INSTRUCTIONS, text, SCHEMA);
    // One list of ingredient positions (starting at 0) per step, checked against the real list
    const result: number[][] = steps.map(() => []);
    for (const entry of Array.isArray(out?.steps) ? out.steps : []) {
      const at = Number(entry?.step) - 1;
      if (!Number.isInteger(at) || at < 0 || at >= steps.length) continue;
      const refs = (Array.isArray(entry?.ingredients) ? entry.ingredients : [])
        .map((n: unknown) => Number(n) - 1)
        .filter((n: number) => Number.isInteger(n) && n >= 0 && n < ingredients.length);
      result[at] = [...new Set<number>(refs)].sort((a, b) => a - b);
    }
    return res.status(200).json({ steps: result });
  } catch (err: any) {
    const status = err instanceof GeminiError && err.notConfigured ? 503 : 502;
    return res.status(status).json({ error: err?.message || 'Could not match ingredients to steps' });
  }
}
