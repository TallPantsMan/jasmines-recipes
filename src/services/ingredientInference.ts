/**
 * Infers an ingredient list from recipe directions.
 * Instagram captions frequently skip the ingredient list and bury quantities
 * inside the steps ("add 2 cloves of minced garlic and a pinch of salt").
 */

const UNITS = [
  'cups?', 'tablespoons?', 'tbsps?', 'tbs', 'teaspoons?', 'tsps?', 'ounces?', 'oz', 'pounds?', 'lbs?', 'lb',
  'grams?', 'g', 'kg', 'kilograms?', 'ml', 'liters?', 'l', 'cloves?', 'pinch(?:es)?', 'dash(?:es)?', 'cans?',
  'slices?', 'sticks?', 'bunch(?:es)?', 'sprigs?', 'handfuls?', 'packages?', 'packets?', 'jars?', 'heads?',
  'stalks?', 'fillets?', 'pieces?', 'splash(?:es)?', 'drizzles?', 'knobs?'
].join('|');

// digits, fractions, ranges and unicode vulgar fractions
const NUM = '(?:\\d+\\s+\\d\\/\\d|\\d+\\/\\d|\\d+(?:\\.\\d+)?(?:\\s*-\\s*\\d+(?:\\.\\d+)?)?|[\\u00BD\\u00BC\\u00BE\\u2153\\u2154\\u215B]|\\d+\\s*[\\u00BD\\u00BC\\u00BE\\u2153\\u2154\\u215B])';
const VAGUE = '(?:a (?:little|bit of|splash of|drizzle of|handful of|pinch of|dash of|knob of|good)|a|an|some)';

// Words that end an ingredient phrase when scanning a step.
const STOP = /\b(?:and|or|plus|with|to|until|till|for|in|into|on|onto|over|then|while|when|so|using|about|at|per|before|after|if|as|from|inside|that|which|who|toss|stir|mix|cook|sear|add|sprinkle|melt|drizzle|whisk|blend|bake|roast|fry|simmer|serve|top)\b/i;

const FOOD_WORDS = new Set((
  'salt pepper garlic onion onions shallot shallots ginger butter oil olive vegetable canola sesame avocado coconut ' +
  'sugar honey maple syrup flour cornstarch starch baking powder soda yeast vanilla cinnamon nutmeg cumin paprika ' +
  'turmeric oregano basil thyme rosemary parsley cilantro dill mint sage chives scallions scallion ' +
  'chili chilli flakes cayenne curry masala garam coriander cardamom clove cloves bay leaves leaf crisp ' +
  'tomato tomatoes paste puree sauce ketchup mustard mayo mayonnaise vinegar soy sriracha gochujang miso tahini ' +
  'hot salsa pesto hummus yogurt yoghurt cream milk cheese parmesan mozzarella cheddar feta ricotta ' +
  'goat gouda gruyere provolone parm pecorino halloumi paneer egg eggs yolk yolks white whites ' +
  'chicken beef pork turkey lamb bacon sausage ham prosciutto pancetta steak ground mince meatballs ' +
  'shrimp prawns salmon tuna cod fish crab lobster scallops tofu tempeh chickpeas lentils beans bean ' +
  'rice pasta spaghetti penne noodles ramen orzo quinoa couscous oats oatmeal bread breadcrumbs panko tortilla tortillas ' +
  'potato potatoes sweet carrot carrots celery peppers bell jalapeno cucumber cucumbers zucchini squash pumpkin ' +
  'broccoli cauliflower spinach kale lettuce cabbage arugula mushrooms mushroom corn peas asparagus eggplant ' +
  'lemon lime orange apple apples banana bananas berries strawberries blueberries mango pineapple ' +
  'almonds walnuts pecans peanuts cashews pistachios seeds chia flax nuts raisins chocolate cocoa chips ' +
  'broth stock water wine beer juice zest dressing mirin sake oyster hoisin ' +
  'seasoning spice spices herbs greens powder bagel taco ' +
  'pickles olives capers anchovies dates'
).split(/\s+/));

const NON_FOOD = new Set((
  'pan pot bowl oven skillet lid heat minutes minute seconds hours hour sheet tray plate fork spoon knife ' +
  'mixture it them this that these those everything remaining rest top side sides time batches batch dish ' +
  'mixer blender processor fire stove burner foil paper parchment container jar board grill air fryer ' +
  'degrees fahrenheit celsius temperature medium low high texture consistency'
).split(/\s+/));

const ACTION_LEAD = /\b(?:with|add|adding|stir in|stir|mix in|mix|combine|toss(?: in)?|whisk(?: in)?|fold in|pour in|pour|sprinkle|drizzle|top(?:ped)?|garnish|sear|saute|saut\u00E9|fry|cook|grill|roast|bake|simmer|blend|mash|chop|dice|slice|mince|grate|shred|marinate|coat|brush|rub|squeeze|crack|beat|layer|spread|stuff|fill|dip|dredge|melt|brown|boil|steam|dress|use)\b/i;

const clean = (s: string) =>
  s
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[*_]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s,;:.\-\u2013]+|[\s,;:.\-\u2013]+$/g, '')
    .trim();

const normalizeKey = (s: string) =>
  s
    .toLowerCase()
    .replace(/\b(?:fresh|freshly|finely|roughly|thinly|thickly|coarsely|chopped|minced|diced|sliced|grated|shredded|melted|softened|cooked|raw|optional|extra|virgin|ground|crushed|large|medium|small|of|the|a|an|some)\b/g, '')
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/(?:es|s)$/, '');

const LEADING_AMOUNT = new RegExp(`^(?:about\\s+|around\\s+|roughly\\s+)?(?:${NUM}|${VAGUE})\\s*(?:(?:${UNITS})\\b\\.?\\s*)?(?:of\\s+)?`, 'i');

/** What an ingredient line is "about": "1 tablespoon of cornstarch" and "3 tbsp cornstarch" both give "cornstarch" */
export const ingredientKey = (raw: string): string => normalizeKey(raw.replace(/\([^)]*\)/g, ' ').replace(LEADING_AMOUNT, ''));

const looksLikeFood = (phrase: string): boolean => {
  const words = phrase.toLowerCase().replace(/[^a-z\s'-]/g, ' ').split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > 6) return false;
  if (words.every(w => NON_FOOD.has(w))) return false;
  return words.some(w => FOOD_WORDS.has(w) || FOOD_WORDS.has(w.replace(/s$/, '')) || FOOD_WORDS.has(w.replace(/es$/, '')));
};

const trimPhrase = (phrase: string): string => {
  // Cut at the first clause break / stop word so "garlic until fragrant" -> "garlic"
  const cut = phrase.split(/[,;.!]|\s[-\u2013\u2014]\s|\(/)[0];
  const m = cut.match(STOP);
  const head = m && m.index !== undefined && m.index > 0 ? cut.slice(0, m.index) : cut;
  return clean(head).replace(/^worth of\s+/i, '');
};

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

interface Candidate {
  raw: string;
  key: string;
  hasQuantity: boolean;
}

function extractFromSentence(sentence: string): Candidate[] {
  const out: Candidate[] = [];

  // 1) Quantified items: "2 cups flour", "1/2 tsp salt", "3 cloves of garlic", "a pinch of salt"
  const quantRe = new RegExp(
    `(?<![A-Za-z])((?:${NUM}|${VAGUE})(?![A-Za-z0-9])\\s*(?:(?:${UNITS})\\b\\.?\\s*(?:of\\s+)?)?)([A-Za-z][A-Za-z'\\- ]{1,45})`,
    'gi'
  );
  let m: RegExpExecArray | null;
  while ((m = quantRe.exec(sentence)) !== null) {
    const amountPart = m[1].trim();
    const tail = trimPhrase(m[2]);
    if (!tail) continue;
    // Skip time / temperature amounts like "10 minutes", "350 degrees"
    if (/^(?:minutes?|mins?|seconds?|secs?|hours?|hrs?|degrees?|f\b|c\b|inch|inches|times|more|total|people|servings?)\b/i.test(tail)) continue;
    if (!looksLikeFood(tail)) continue;
    const key = normalizeKey(tail);
    if (!key) continue;
    const plainAmount = /^(?:a|an|some)$/i.test(amountPart) ? '' : amountPart;
    out.push({ raw: clean(`${plainAmount} ${tail}`), key, hasQuantity: plainAmount !== '' });
  }

  // 2) Unquantified lists after cooking verbs: "add garlic, salt and pepper"
  const verbRe = new RegExp(`${ACTION_LEAD.source}\\s+((?:[^.!?;]|\\d\\.\\d)+)`, 'gi');
  while ((m = verbRe.exec(sentence)) !== null) {
    const items = m[1]
      .split(/,|\band\b|\bplus\b|\+|&|\bor\b/i)
      .map(s => s.trim())
      .filter(Boolean);
    for (const item of items) {
      const stripped = item
        .replace(/^(?:the|your|all the|all of the|all|some|a little|a bit of|more|extra|any|enough|both)\s+/i, '')
        .replace(/^(?:in|into|with|to|over|on)\s+/i, '')
        .replace(new RegExp('^(?:' + ACTION_LEAD.source.replace(/^\\\\b\(\?:|\)\\\\b$/g, '') + ')(?:\\s+(?:in|with))?\\s+', 'i'), '');
      const phrase = trimPhrase(stripped);
      if (!phrase || phrase.length < 3) continue;
      if (new RegExp(`^(?:${NUM})(?![A-Za-z0-9])`).test(phrase)) continue; // handled by quantified pass
      if (!looksLikeFood(phrase)) continue;
      const key = normalizeKey(phrase);
      if (key) out.push({ raw: capitalize(phrase.toLowerCase()), key, hasQuantity: false });
    }
  }

  return out;
}

/**
 * Infers an ingredient list from instruction step text.
 * Prefers quantified mentions ("2 tbsp soy sauce") over bare mentions ("soy sauce"),
 * and merges duplicate mentions of the same food into a single line.
 */
export function inferIngredientsFromSteps(stepTexts: string[]): string[] {
  const best = new Map<string, Candidate>();
  const order: string[] = [];

  stepTexts.forEach((text) => {
    const sentences = text
      .replace(/(\d)\.(\d)/g, '$1\u00A7$2')
      .split(/(?<=[.!?])\s+|\n+/)
      .map(s => s.replace(/\u00A7/g, '.'));
    sentences.forEach((sentence) => {
      extractFromSentence(sentence).forEach((cand) => {
        // Merge near-duplicates such as "garlic" vs "cloves garlic"
        const existingKey = [...best.keys()].find(
          k => k === cand.key || k.endsWith(` ${cand.key}`) || cand.key.endsWith(` ${k}`)
        );
        if (!existingKey) {
          best.set(cand.key, cand);
          order.push(cand.key);
        } else if (cand.hasQuantity && !best.get(existingKey)!.hasQuantity) {
          best.set(existingKey, cand);
        }
      });
    });
  });

  return order
    .map(k => best.get(k))
    .filter((c): c is Candidate => !!c)
    .map(c => capitalize(c.raw));
}
