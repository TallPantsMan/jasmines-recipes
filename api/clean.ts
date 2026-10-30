import { requireLogin } from './_auth.js';

// Tidies a messy recipe (Instagram caption, pasted text, cookbook photo text) with Gemini's free tier.
// The key lives only in the server's environment (GEMINI_API_KEY), never in the app.
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const MAX_INPUT = 12000;

const INSTRUCTIONS = `You turn messy recipe text (social media captions, pasted notes, text read from a cookbook photo) into a clean recipe.
Rules:
- Use ONLY what the text says. Never invent ingredients, amounts, steps or times. If something is missing, leave it empty or 0.
- title: the dish name only, in normal capitalisation. No emojis, no "Recipe", no hype words.
- description: one or two plain sentences (the hook, a tip, or a nutrition line if given). Empty if there is nothing useful.
- ingredients: one string per ingredient, amount first, like "1 1/2 cups all-purpose flour". Split lines that hold several ingredients. Keep prep notes like ", diced".
- steps: one string per cooking step, in order, in plain sentences, without "Step 1" numbering. Split long run-on paragraphs into sensible steps. Keep tips that belong to a step inside that step.
- Ignore calls to action ("comment RECIPE", "follow me", "link in bio"), credits, hashtags and emoji decoration.
- servings: a whole number, 0 if unknown. prepMinutes and cookMinutes: whole minutes, 0 if unknown.
- categories: any of "Dinners", "Baking", "Salads & Sides". Pick what fits, or none.
- tags: up to 6 short lowercase words about the dish (cuisine, main ingredient, diet). No hashtags.
- creator: the Instagram/creator handle credited as the recipe's original author, without "@", or empty.`;

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    title: { type: 'STRING' },
    description: { type: 'STRING' },
    servings: { type: 'INTEGER' },
    prepMinutes: { type: 'INTEGER' },
    cookMinutes: { type: 'INTEGER' },
    ingredients: { type: 'ARRAY', items: { type: 'STRING' } },
    steps: { type: 'ARRAY', items: { type: 'STRING' } },
    categories: { type: 'ARRAY', items: { type: 'STRING' } },
    tags: { type: 'ARRAY', items: { type: 'STRING' } },
    creator: { type: 'STRING' },
  },
  required: ['title', 'ingredients', 'steps'],
};

export default async function handler(req: any, res: any) {
  if (!requireLogin(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(503).json({ error: 'AI clean-up is not set up on the server' });

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }
  const text = typeof body?.text === 'string' ? body.text.trim().slice(0, MAX_INPUT) : '';
  if (text.length < 20) return res.status(400).json({ error: 'Not enough text to work with' });

  const generationConfig: Record<string, unknown> = {
    responseMimeType: 'application/json',
    responseSchema: SCHEMA,
    temperature: 0.1,
  };
  // Skips the slow "thinking" phase on the 2.5 models; plain tidying doesn't need it
  if (MODEL.includes('2.5')) generationConfig.thinkingConfig = { thinkingBudget: 0 };

  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: INSTRUCTIONS }] },
        contents: [{ role: 'user', parts: [{ text }] }],
        generationConfig,
      }),
      signal: AbortSignal.timeout(25000),
    });
    if (!r.ok) {
      // Includes "too many requests" on the free tier; the app falls back to its own parser
      return res.status(502).json({ error: `AI service answered ${r.status}` });
    }
    const data: any = await r.json();
    const out = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || '').join('') || '';
    const recipe = JSON.parse(out);
    return res.status(200).json({ recipe });
  } catch (err: any) {
    return res.status(502).json({ error: err?.message || 'AI clean-up failed' });
  }
}
