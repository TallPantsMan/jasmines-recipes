// The instructions and answer shape shared by every route that turns messy recipe text (or a page PDF) into a clean recipe.
export const INSTRUCTIONS = `You turn messy recipe text (social media captions, pasted notes, text read from a cookbook photo) into a clean recipe.
Rules:
- Use ONLY what the text says. Never invent ingredients, amounts or steps. If one of those is missing, leave it empty. The one exception is prep and cook time, below.
- title: the dish name only, in Title Case (like "Baked Macaroni and Cheese"). No emojis, no "Recipe", no hype words.
- description: one or two plain sentences (the hook, a tip, or a nutrition line if given). Empty if there is nothing useful.
- ingredients: one string per ingredient, amount first, like "1 1/2 cups all-purpose flour". Split lines that hold several ingredients. Keep prep notes like ", diced".
- steps: one string per cooking step, in order, in plain sentences, without "Step 1" numbering. Split long run-on paragraphs into sensible steps. Keep tips and optional qualifiers (like "if using" or "to taste") inside the step they belong to.
- The text may already be organised (Title, Ingredients, Instructions from a website). Keep every real ingredient and step, but normalise the wording and layout the same way: plain steps without numbering or leftover web-page text, one clean ingredient per line, and a short plain description instead of marketing copy or the author's life story.
- Ignore calls to action ("comment RECIPE", "follow me", "link in bio"), credits, hashtags and emoji decoration.
- servings: a whole number, 0 if unknown.
- prepMinutes and cookMinutes: whole minutes. Use the times the text states. If the text gives none, estimate them realistically from the ingredients and steps: prepMinutes is hands-on chopping, mixing and assembling; cookMinutes is time on the heat, in the oven, or chilling and setting. Use 0 only for a part that truly takes no time (for example a no-cook salad has cookMinutes 0).
- categories: any of "Dinners", "Baking", "Salads & Sides". Pick what fits, or none.
- tags: up to 6 short lowercase words about the dish (cuisine, main ingredient, diet). No hashtags.
- creator: the Instagram/creator handle credited as the recipe's original author, without "@", or empty.`;

export const SCHEMA = {
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
