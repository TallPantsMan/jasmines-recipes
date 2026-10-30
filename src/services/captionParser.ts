import type { Recipe, Ingredient, InstructionStep } from '../types/recipe';
import { inferIngredientsFromSteps, ingredientKey } from './ingredientInference';

/**
 * Turns the free-form text of a social post (an Instagram caption, a pasted recipe, scanned cookbook text)
 * into a structured recipe. It reads the text line by line instead of chopping it on keywords, so ordinary
 * words like "steps" or "method" inside a sentence never break a recipe apart.
 */

export interface ParsedCaption extends Partial<Recipe> {
  /** @handle credited in the caption ("creator: @someone"), when it differs from the poster */
  creator?: string;
}

export interface ParseTextOptions {
  source?: 'instagram' | 'cookbook' | 'text';
}

// ---------------------------------------------------------------------------------------------
// Categories (shared with the website importer)
// ---------------------------------------------------------------------------------------------

/**
 * Maps a recipe's category / keyword text onto the app's own filter categories
 * (Dinners, Baking, Salads & Sides). Falls back to Dinners.
 */
export function inferCategories(opts: { title?: string; categories?: string[]; keywords?: string[] }): string[] {
  const cat = (opts.categories || []).join(' ');
  const kw = (opts.keywords || []).join(' ');
  const title = opts.title || '';
  const out: string[] = [];

  const bakingWords = /\b(desserts?|baking|baked goods|cookies?|cakes?|cheesecakes?|brownies?|muffins?|cupcakes?|pastr(?:y|ies)|scones?|breads?|loaf)\b/i;
  const sideWords = /\b(salads?|sides?|side[- ]dish(?:es)?|appetizers?|starters?|snacks?|dips?|condiments?|sauces?|dressings?|slaw)\b/i;
  const dinnerWords = /\b(dinners?|mains?|main[- ]course|main[- ]dish|entr[eé]es?|suppers?|lunch(?:es)?|soups?|stews?)\b/i;

  const bakedTitle = /\b(cookies?|cakes?|brownies?|muffins?|cupcakes?|scones?|cheesecake|bread)\b/i.test(title) && !/garlic bread|bread ?crumbs?|bread bowl|french toast/i.test(title);
  if (bakingWords.test(cat) || bakingWords.test(kw) || bakedTitle) out.push('Baking');
  if (sideWords.test(cat) || /\b(salad|slaw)\b/i.test(title)) out.push('Salads & Sides');
  if (dinnerWords.test(cat) && !out.includes('Baking')) out.push('Dinners');
  if (out.length === 0) out.push('Dinners');
  return out;
}

// ---------------------------------------------------------------------------------------------
// Text clean-up
// ---------------------------------------------------------------------------------------------

const NAMED: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', ndash: '–', mdash: '—',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', deg: '°',
};

function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&([a-z0-9]+);/gi, (m, n) => NAMED[n.toLowerCase()] ?? m);
}

const EMOJI = /[\p{Extended_Pictographic}️‍⃣]/gu;
const EDGE_SYMBOLS = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;

/** Section keywords with their punctuation / emoji / "(serves 4)" notes stripped, for matching headers */
const bare = (s: string) => s.replace(/\([^)]*\)/g, ' ').replace(EDGE_SYMBOLS, '').replace(/\s+/g, ' ').trim().toLowerCase();

function normalizeText(text: string): string {
  let t = text;
  if (/<\/?[a-z][^>]*>/i.test(t)) {
    t = t.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(?:p|div|li)>/gi, '\n').replace(/<[^>]+>/g, '');
  }
  t = decodeEntities(t)
    .replace(/[​‌﻿ ]/g, ' ')
    .replace(/\r\n?/g, '\n')
    .replace(/\btable\s+(tablespoons?)\b/gi, '$1') // a common typo: "3 table tablespoons"
    .replace(/view all [\d.,kKmM]+ comments?/gi, '\n')
    .replace(/load more comments/gi, '\n')
    .replace(/^\s*see translation\s*$/gim, '');

  // Everything on one or two lines (copied from some apps): put the structure back
  const lineCount = t.split('\n').filter((l) => l.trim()).length;
  if (lineCount <= 3 && t.length > 150) {
    t = t
      .replace(/\s*\b(ingredients?|instructions?|directions?|method|notes?|tips?)\s*:\s*/gi, '\n$1:\n')
      .replace(/\s+(?=step\s*\d+\s*[:.)-])/gi, '\n')
      .replace(/\s+(?=\d{1,2}\s*[.)]\s+[A-Z])/g, '\n')
      .replace(/\s+(?=\d️?⃣)/g, '\n')
      .replace(/\s+•\s*/g, '\n• ');
  }
  return t;
}

// ---------------------------------------------------------------------------------------------
// Line classifiers
// ---------------------------------------------------------------------------------------------

const NUM = String.raw`(?:\d+\s+\d\/\d|\d+\/\d|\d+(?:[.,]\d+)?(?:\s*(?:-|–|to)\s*\d+(?:[.,]\d+)?)?|[½¼¾⅓⅔⅛⅜⅝⅞]|\d+\s*[½¼¾⅓⅔⅛])`;
const TIME_WORDS = /^(?:minutes?|mins?|seconds?|secs?|hours?|hrs?|days?|degrees?|°|f\b|c\b|times|inch(?:es)?|cm|mm|people|persons?|servings?|steps?)/i;
const QUANT_START = new RegExp(String.raw`^(?:about\s+|around\s+|roughly\s+|approx\.?\s+|~\s*)?(${NUM})\s*(?:x\s*)?(?:g\b|kg\b|ml\b|l\b|oz\b|lbs?\b|)?\s*(.*)$`, 'i');
const VAGUE_START = /^(?:a|an|some)?\s*(?:pinch|dash|handful|splash|drizzle|knob|sprinkle|bunch|glug|squeeze)\b/i;
const TO_TASTE = /\b(?:to taste|as needed|for (?:frying|serving|garnish|dusting|greasing)|optional)\b/i;

const IMPERATIVE = new Set((
  'mix add bake cook stir heat preheat combine whisk pour place put bring reduce season serve slice chop dice cut let allow ' +
  'transfer remove drain toss fold spread top layer blend mash knead roll simmer boil fry saute sauté roast grill cover ' +
  'refrigerate chill freeze garnish enjoy beat cream melt dissolve marinate coat brush sprinkle drizzle squeeze peel rinse ' +
  'wash pat prick score flip turn set use make prepare start finish repeat continue check taste adjust divide shape form ' +
  'stuff wrap then next once after when while meanwhile finally first begin take grab get lightly gently thinly generously ' +
  'deglaze sear steam strain cool rest rub arrange line grease pulse process whip stuff press dip dredge fill'
).split(/\s+/));

const firstWord = (s: string) => (s.toLowerCase().match(/[a-zé]+/) || [''])[0];
const startsWithImperative = (s: string) => IMPERATIVE.has(firstWord(s));

/** "2 cups flour", "1.5 lbs chicken breast", "a pinch of salt", "salt & pepper to taste" */
function isQuantityLine(s: string): boolean {
  const m = s.match(QUANT_START);
  if (m && m[2] && /^[A-Za-zÀ-ſ(]/.test(m[2]) && !TIME_WORDS.test(m[2])) return true;
  if (VAGUE_START.test(s)) return true;
  return TO_TASTE.test(s) && s.length < 60;
}

const STEP_LEAD = /^(?:step\s*\d+\s*[:.)\-–]?|\(?\d{1,2}\s*[.):\]]|\d️?⃣|\u{1F51F})\s*/iu;
const BULLET_LEAD = /^(?:[•·▪▫◦●○❖✔✅☑➡▶►*\-–—+~>]+|[\p{Extended_Pictographic}️‍]+)\s*/u;

const isHashtagLine = (l: string) => {
  const tags = l.match(/#[\p{L}\p{N}_]+/gu) || [];
  if (tags.length === 0) return false;
  const rest = l.replace(/#[\p{L}\p{N}_]+/gu, '').replace(/[^\p{L}\p{N}]/gu, '');
  return rest.length === 0 || (tags.length >= 3 && rest.length < tags.join('').length / 2);
};

const PROMO = new RegExp([
  String.raw`follow\s+(?:me|us|@|for|along|my|our)`,
  String.raw`like\s*(?:,|&|and|\+)\s*(?:share|save|comment|follow)`,
  String.raw`(?:link|links)\b.*\b(?:in|on)\s+(?:my\s+|the\s+)?(?:bio|profile|story|stories)`,
  String.raw`\b(?:in|on)\s+(?:my\s+)?bio\b`,
  String.raw`save\s+(?:this|it)\s+(?:post|reel|recipe|for)`,
  String.raw`(?:send|share)\s+(?:this\s+)?(?:to|with)\s+(?:a|your|someone|that|every)`,
  String.raw`tag\s+(?:a|your|someone|me|us|that)`,
  String.raw`comment\s+["“'‘]?\w+["”'’]?\s+(?:below|for|and|to)`,
  String.raw`dm\s+(?:me|us|for)`,
  String.raw`would you\s+(?:eat|try|pass|rate)`,
  String.raw`eat or pass`,
  String.raw`turn on (?:post\s+)?notif`,
  String.raw`subscribe`,
  String.raw`giveaway`,
  String.raw`use code`,
  String.raw`paid partnership|#ad\b|sponsored`,
  String.raw`check out (?:my|our)`,
  String.raw`(?:full|printable|written)\s+recipe\b.*\b(?:blog|website|link|bio|comments?|below|pinned|here|site)`,
  String.raw`recipe\s+(?:is\s+)?(?:in|on)\s+(?:the\s+)?(?:comments?|caption|bio|blog|website|link)`,
  String.raw`more recipes?\s+(?:at|on)`,
  String.raw`https?://|www\.`,
  String.raw`[a-z0-9-]+\.(?:com|net|org|co|io)\b`,
].join('|'), 'i');

const CREDIT = /(?:creator|credits?|cr|video(?:\s+by)?|recipe\s+(?:by|from)|by|via|from|\u{1F4F9}|\u{1F3A5}|\u{1F3AC})\s*[:\-–]?\s*@([A-Za-z0-9._]+)/iu;

const MACRO_STRONG = /\b\d+\s*(?:k?cals?|calories|kcal)\b|\b\d+\s*g\s*[CFP]\b|^\W*(?:macros?|nutrition|calories|cals)\b/i;
const MACRO_WORDS = /\b(?:protein|carbs?|fat|fibre|fiber|sugar)\b/gi;

const SECTION = {
  ING: /^(?:the\s+)?ingredients?(?:\s+list)?$|^what you(?:'ll| will)? need$|^you(?:'ll| will)? need$|^shopping list$|^grocery list$|^things you need$|^you need$/,
  INS: /^(?:instructions?|directions?|method|steps?|how to(?: make(?: it)?)?|preparation|procedure|cooking (?:instructions|method)|to make(?: it)?|let'?s (?:make it|cook)|make it)$/,
  NOTES: /^(?:important |extra |chef'?s? |pro |helpful |quick |recipe |cooking )?(?:notes?|tips?|tricks?|hacks?|variations?|substitutions?|storage|storing|reheating|serving suggestions?|tips (?:&|and) tricks)$/,
  RECIPE: /^(?:the |my )?(?:full |whole )?recipe(?: below| here)?$/,
  SUBHEAD: /^(?:for (?:the )?[a-z' &-]{2,30}|sauce|marinade|dressing|topping|toppings|filling|dough|crust|batter|glaze|frosting|garnish|to serve|for serving|optional(?: toppings)?)$/,
};

const GENERIC_TAG = /^(?:fyp\w*|foryou\w*|viral\w*|explore\w*|reels?\w*|trending\w*|insta\w*|food\w*|yumm?y\w*|delicious|tasty|eat\w*|hungry|cook(?:ing)?|homecook\w*|homemade|love\w*|like\w*|follow\w*|share\w*|\w*recipes?\w*|chef\w*|kitchen\w*|dinnertime|lunchtime|fastfood\w*|junkfood|photo\w*|pic\w*|\w*gram|\w*porn|\w*lover\w*|cravings?|nom\w*|goodfood|goodeats|feed\w*|content|creator|ad|sponsored|video|tiktok\w*|shorts?|fy\w*|new|best|easy\w*|simple|quick\w*|healthy|cookwithme|uglydelicious|asianfoodie)$/i;

// ---------------------------------------------------------------------------------------------
// Helpers for pieces of the result
// ---------------------------------------------------------------------------------------------

const toTitleCase = (s: string) => s.toLowerCase().replace(/(^|[\s(\-/])([a-zà-ÿ])/g, (_, a, b) => a + b.toUpperCase());

function cleanTitle(raw: string): string {
  let t = raw
    .replace(EMOJI, ' ')
    .replace(/#[\p{L}\p{N}_]+/gu, '')
    .replace(/^\s*(?:new|recipe|how to make|how to)\s*[:\-–]\s*/i, '')
    .replace(/\s+(?:recipe|recipes)\s*[!.]*\s*$/i, '')
    .replace(/\s+/g, ' ')
    .replace(/^[^\p{L}\p{N}(]+|[^\p{L}\p{N})?]+$/gu, '')
    .trim();
  const letters = t.replace(/[^A-Za-z]/g, '');
  if (letters.length > 4 && letters === letters.toUpperCase()) t = toTitleCase(t);
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** "Save this 10-minute miso soup recipe! ..." -> "10-Minute Miso Soup" */
function titleFromHook(line: string): string {
  const m = line.match(/\b(?:this|these|my|our|the|a|an)\s+((?:[\w'’-]+\s+){0,5}?[\w'’-]+)\s+recipes?\b/i);
  if (m) {
    const t = cleanTitle(m[1].replace(/^(?:amazing|best|easy|simple|delicious|favou?rite|new|viral)\s+/i, ''));
    if (t.length >= 4) return toTitleCase(t);
  }
  const cut = cleanTitle(line.split(/[.!?\n]/)[0]);
  if (cut.length <= 70) return cut;
  return cut.slice(0, 70).replace(/\s+\S*$/, '');
}

/** Splits a long unnumbered paragraph into sentence-sized steps; short fragments are glued to the previous one */
function splitProse(text: string): string[] {
  if (text.length <= 170) return [text];
  const safe = text.replace(/\b(tbsp|tsp|min|mins|sec|secs|hr|hrs|oz|lb|lbs|approx|deg|temp|vs|e\.g|i\.e)\./gi, '$1__DOT__');
  const parts = safe.split(/(?<=[.!?])\s+(?=[A-Z0-9])/).map((p) => p.replace(/__DOT__/g, '.').trim()).filter(Boolean);
  const out: string[] = [];
  for (const p of parts) {
    if (out.length > 0 && p.length < 30) out[out.length - 1] += ' ' + p;
    else out.push(p);
  }
  return out;
}

const QTY_TOKEN = /^(?:\d+(?:[.,]\d+)?|\d+\/\d+|[½¼¾⅓⅔⅛])$/;

/** "1 lb ground beef 1 onion 2 cans beans" (no separators at all) -> one item per amount */
function splitRunOnIngredients(text: string): string[] {
  const tokens = text.split(/\s+/);
  const items: string[][] = [[]];
  tokens.forEach((tok, idx) => {
    const cur = items[items.length - 1];
    const prev = tokens[idx - 1] || '';
    const next = tokens[idx + 1] || '';
    const startsNewItem =
      QTY_TOKEN.test(tok) && cur.length >= 2 && !QTY_TOKEN.test(prev) && !/^(?:to|-|–|and|or|x|plus)$/i.test(prev) &&
      /^[A-Za-z]/.test(next) && !TIME_WORDS.test(next);
    if (startsNewItem) items.push([tok]);
    else cur.push(tok);
  });
  return items.map((t) => t.join(' ')).filter(Boolean);
}

function splitInlineIngredients(text: string): string[] {
  if ((text.match(/•/g) || []).length >= 1) return text.split(/\s*•\s*/).filter(Boolean);
  const parts = text.split(/,\s*(?=(?:about\s+)?(?:\d|[½¼¾⅓⅔]|a\s+(?:pinch|dash|handful|splash)\b|(?:pinch|dash|handful)\b|salt\b|pepper\b))/i);
  return parts.flatMap(splitRunOnIngredients);
}

const TAG_HINTS: Array<[RegExp, string]> = [
  [/\bchicken\b/i, 'chicken'], [/\bbeef|steak\b/i, 'beef'], [/\bpork|bacon\b/i, 'pork'], [/\bturkey\b/i, 'turkey'], [/\bsalmon\b/i, 'salmon'],
  [/\bshrimp|prawns?\b/i, 'shrimp'], [/\btofu\b/i, 'tofu'], [/\bpasta|spaghetti|penne|rigatoni|noodles?\b/i, 'pasta'],
  [/\bchinese\b/i, 'chinese'], [/\bitalian\b/i, 'italian'], [/\bmexican\b/i, 'mexican'], [/\bthai\b/i, 'thai'], [/\bindian\b/i, 'indian'],
  [/\bjapanese|miso|dashi\b/i, 'japanese'], [/\bkorean|gochujang\b/i, 'korean'], [/\bgreek\b/i, 'greek'],
  [/\bair[- ]fryer\b/i, 'air fryer'], [/\bslow[- ]cooker|crock ?pot\b/i, 'slow cooker'], [/\binstant pot\b/i, 'instant pot'],
  [/\bone[- ]pot\b/i, 'one pot'], [/\bsheet[- ]pan\b/i, 'sheet pan'], [/\bno[- ]bake\b/i, 'no bake'],
  [/\bvegan\b/i, 'vegan'], [/\bvegetarian\b/i, 'vegetarian'], [/\bgluten[- ]free\b/i, 'gluten free'], [/\bhigh[- ]protein\b/i, 'high protein'],
  [/\bketo\b/i, 'keto'], [/\bmeal[- ]prep\b/i, 'meal prep'],
];

function buildCaptionTags(hashtags: string[], contentForHints: string): string[] {
  const hinted: string[] = [];
  TAG_HINTS.forEach(([re, tag]) => {
    if (re.test(contentForHints) && !hinted.includes(tag)) hinted.push(tag);
  });
  const useful = hashtags
    .map((t) => t.toLowerCase())
    .filter((t) => t.length > 2 && !GENERIC_TAG.test(t))
    .slice(0, 6);
  const all: string[] = [];
  [...hinted.slice(0, 3), ...useful].forEach((t) => {
    const flat = t.replace(/\s/g, '');
    if (all.some((x) => x.replace(/\s/g, '') === flat || x.replace(/\s/g, '') + 's' === flat || flat + 's' === x.replace(/\s/g, ''))) return;
    all.push(t);
  });
  return all.slice(0, 8);
}

/** Steps that carry no cooking information ("Enjoy!", "Bon appetit!") */
const FILLER_STEP = /^(?:enjoy(?: it| them)?|bon app[eé]tit|dig in|eat up|that'?s it)[\s!.\p{Extended_Pictographic}️]*$/iu;

const minutesFrom = (n: string, unit: string) => Math.round(parseFloat(n) * (/^h/i.test(unit) ? 60 : 1));

// ---------------------------------------------------------------------------------------------
// The parser
// ---------------------------------------------------------------------------------------------

type Section = 'header' | 'ingredients' | 'instructions' | 'notes' | 'auto';

export function parseRawRecipeText(text: string, titleHint?: string, options: ParseTextOptions = {}): ParsedCaption {
  const source = options.source || 'instagram';
  const lines = normalizeText(text).split('\n');

  let section: Section = 'header';
  let title = titleHint ? cleanTitle(titleHint) : '';
  let hookLine = '';
  const descriptionParts: string[] = [];
  const notes: string[] = [];
  const macros: string[] = [];
  const hashtags: string[] = [];
  const ingredientTexts: string[] = [];
  const steps: string[] = [];
  let servings: number | undefined;
  let prep: number | undefined;
  let cook: number | undefined;
  let creator: string | undefined;
  let attachIndex: number | null = null; // step that ends with ":" and is collecting the bullet list that follows it

  const nextContent = (from: number): string => {
    for (let j = from + 1; j < lines.length; j++) if (lines[j].trim()) return lines[j].trim();
    return '';
  };

  const addIngredient = (raw: string) => {
    let item = raw.replace(/\s+/g, ' ').replace(/^[\s\-–•]+|[\s,;]+$/g, '').trim();
    if (!item) return;
    // Very long side-comments in brackets belong with the notes, not on the shopping list
    if (item.length > 110) {
      const paren = item.match(/\s*\(([^()]{50,})\)/);
      if (paren) {
        notes.push(paren[1].trim().replace(/^./, (c) => c.toUpperCase()));
        item = item.replace(paren[0], '').trim();
      }
    }
    ingredientTexts.push(item);
  };

  const addStep = (raw: string, keepWhole: boolean) => {
    const t = raw.replace(/\s+/g, ' ').trim();
    if (!t) return;
    (keepWhole ? [t] : splitProse(t)).forEach((p) => steps.push(p));
  };

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    if (!line) continue;

    // hashtags: collect, then drop them from the text
    const found = line.match(/#([\p{L}\p{N}_]+)/gu);
    if (found) found.forEach((t) => { const c = t.slice(1); if (!hashtags.includes(c)) hashtags.push(c); });
    if (isHashtagLine(line)) continue;
    line = line.replace(/(\s*#[\p{L}\p{N}_]+)+\s*$/u, '').trim();
    if (!/[\p{L}\p{N}]/u.test(line)) { attachIndex = null; continue; } // dots, dashes, lone emoji

    // credited creator, then promo / "follow me" lines
    if (line.length <= 90) {
      const credit = line.match(CREDIT);
      if (credit && !isQuantityLine(line.replace(BULLET_LEAD, ''))) {
        if (!creator) creator = credit[1];
        continue;
      }
    }
    if (PROMO.test(line) && !(section === 'instructions' && startsWithImperative(line) && !/\bbio\b|follow|link/i.test(line))) continue;

    // serving counts, times and nutrition facts
    const plain = line.replace(BULLET_LEAD, '').trim();
    const servingMatch = plain.match(/^(?:serves|servings?|makes|yields?|feeds|serving size)\s*[:\-–]?\s*(?:about\s+|approx\.?\s*)?(\d+)\b/i) || plain.match(/^(\d+)\s+servings?$/i);
    const isServingLine = !!servingMatch && plain.length < 60;
    if (isServingLine) servings = servings || parseInt(servingMatch![1], 10);

    // "Prep: 10 min", "Cook time 15 min", or the "Serves 4 | Prep 10 min | Cook 15 min" strip.
    // A bare "Bake 10 minutes at 400F" is a cooking step, not a label, so cook/bake/total need a colon, the word "time", or the strip layout.
    const rawTimes = [...plain.matchAll(/\b(prep(?:aration)?|cook(?:ing)?|total|bake|baking)(\s*time)?\s*([:\-–])?\s*(\d+(?:\.\d+)?)\s*(h(?:ours?|rs?)?|m(?:in(?:ute)?s?)?)\b/gi)];
    const isStrip = rawTimes.length >= 2 && /[|•·]/.test(plain);
    const timeMatches = rawTimes.filter((m) => !!(m[2] || m[3] || isStrip));
    const isTimeLine = timeMatches.length > 0 && plain.length < 100;
    if (isTimeLine) {
      timeMatches.forEach((m) => {
        const mins = minutesFrom(m[4], m[5]);
        if (/prep/i.test(m[1])) prep = prep || mins;
        else cook = cook || mins;
      });
    }
    if (isServingLine || isTimeLine) continue;

    const macroWordCount = (plain.match(MACRO_WORDS) || []).length;
    const looksLikeMacros = MACRO_STRONG.test(plain) || (macroWordCount >= 2 && plain.length < 90 && !isQuantityLine(plain));
    if (looksLikeMacros && !(section === 'ingredients' && isQuantityLine(plain) && !MACRO_STRONG.test(plain))) {
      const perServe = plain.match(/per serv(?:e|ing).*?(\d+)\s*(?:total|servings?|serves)/i);
      if (perServe) servings = servings || parseInt(perServe[1], 10);
      else if (!/^\W*\(?macros?\b/i.test(plain) || /\d/.test(plain)) macros.push(plain.replace(/^\(|\)$/g, ''));
      continue;
    }

    // section headers, optionally with text after them ("Ingredients: 2 eggs")
    const inline = plain.match(/^(ingredients?|instructions?|directions?|method|notes?|tips?)\s*[:\-–—]\s*(\S.*)$/i);
    const key = bare(plain);
    let remainder = '';
    let newSection: Section | null = null;
    if (SECTION.ING.test(key)) newSection = 'ingredients';
    else if (SECTION.INS.test(key)) newSection = 'instructions';
    else if (SECTION.NOTES.test(key)) newSection = 'notes';
    else if (SECTION.RECIPE.test(key)) newSection = 'auto';
    else if (inline) {
      const k = inline[1].toLowerCase();
      newSection = /^ingredient/.test(k) ? 'ingredients' : /^(note|tip)/.test(k) ? 'notes' : 'instructions';
      remainder = inline[2];
    }
    if (newSection) {
      const serves = plain.match(/\([^)]*?(?:(?:serves?|servings?|feeds|makes)\s*(\d+)|(\d+)\s*(?:servings?|serves|people|portions?))[^)]*\)/i);
      if (serves) servings = servings || parseInt(serves[1] || serves[2], 10);
      section = newSection;
      attachIndex = null;
      if (!remainder) continue;
      line = remainder;
    } else if (section !== 'ingredients' && /^for (?:the )?[a-z' &-]{2,30}:?$/i.test(plain) && (isQuantityLine(nextContent(i).replace(BULLET_LEAD, '')) || BULLET_LEAD.test(nextContent(i)))) {
      // "For the sauce:" right before a list starts the ingredients
      section = 'ingredients';
      continue;
    }

    const body = line.replace(BULLET_LEAD, '').trim();
    const hadBullet = BULLET_LEAD.test(line);
    const numbered = STEP_LEAD.test(line) && !isQuantityLine(line);

    // title: first short, ordinary line before the recipe begins
    if (section === 'header') {
      // A paragraph that already reads like cooking directions ("Whisk 1 cup flour...") is the recipe itself, not a blurb
      const readsLikeDirections =
        startsWithImperative(body) && body.length > 40 &&
        (/\d/.test(body) || /\b(until|minutes?|heat|oven|pan|bowl|pot|bake|boil|simmer|stir|mix|whisk|combine)\b/i.test(body));
      if (!numbered && !isQuantityLine(body) && !readsLikeDirections) {
        if (!title && !hookLine) {
          const cand = cleanTitle(line);
          if (cand.length >= 3 && cand.length <= 80 && !/[.!?]\s/.test(cand) && !/\bsave this\b/i.test(cand)) { title = cand; continue; }
          hookLine = line;
        }
        descriptionParts.push(line);
        continue;
      }
      section = 'auto';
    }

    if (section === 'notes') {
      notes.push(body);
      continue;
    }

    if (section === 'ingredients') {
      const stepLike = numbered || (!isQuantityLine(body) && body.length > 100) || (body.length > 60 && /[.!]$/.test(body) && startsWithImperative(body));
      if (stepLike) {
        section = 'instructions';
      } else if (SECTION.SUBHEAD.test(bare(body)) || (/:\s*$/.test(body) && body.length <= 40 && !/\d/.test(body))) {
        continue; // "For the sauce:" style sub-heading inside the list
      } else {
        splitInlineIngredients(body).forEach(addIngredient);
        continue;
      }
    }

    // instructions / auto: decide per line
    if (numbered) {
      attachIndex = null;
      addStep(line.replace(STEP_LEAD, ''), true);
      section = 'instructions';
      continue;
    }
    if (/^step\s*\d+\s*[:.)\-–]?$/i.test(line)) continue;

    const quantityItem = isQuantityLine(body) && body.length <= 140 && !startsWithImperative(body) && !/[.!]$/.test(body.replace(/\)\.?$/, ')'));
    if ((hadBullet && quantityItem) || (section === 'auto' && quantityItem && body.length <= 90)) {
      splitInlineIngredients(body).forEach(addIngredient);
      if (attachIndex !== null) {
        steps[attachIndex] += (/[:]$/.test(steps[attachIndex]) ? ' ' : ', ') + body.replace(/[\s,;.]+$/, '');
      }
      continue;
    }

    // a normal sentence: a step (a trailing ":" means a bullet list follows and belongs to it)
    addStep(body, false);
    attachIndex = /:\s*$/.test(body) ? steps.length - 1 : null;
  }

  // ----- assemble -----------------------------------------------------------------------
  if (!title) {
    const fallbackLine = hookLine || descriptionParts[0] || '';
    title = fallbackLine ? titleFromHook(fallbackLine) : '';
  }
  if (!title || title.length < 3) title = source === 'instagram' ? 'Instagram Recipe' : 'Imported Recipe';

  const instructions: InstructionStep[] = steps
    .map((t) => t.replace(/\s+/g, ' ').trim())
    .filter((t) => !FILLER_STEP.test(t))
    .map((text, idx) => ({ id: `step-${Date.now()}-${idx}`, stepNumber: idx + 1, text }));

  // Captions often leave things out of the ingredient list: fill the gaps from quantities mentioned in the steps
  const seen = new Set<string>();
  const finalTexts: string[] = [];
  const pushUnique = (raw: string) => {
    const k = ingredientKey(raw) || raw.toLowerCase();
    for (const s of seen) if (s === k || s.endsWith(' ' + k) || k.endsWith(' ' + s)) return;
    seen.add(k);
    finalTexts.push(raw);
  };
  ingredientTexts.forEach(pushUnique);
  if (instructions.length > 0 || ingredientTexts.length < 2) {
    const inferred = inferIngredientsFromSteps(instructions.length > 0 ? instructions.map((s) => s.text) : [descriptionParts.join(' ')]);
    inferred
      .filter((raw) => ingredientTexts.length < 3 || /^(?:\d|[½¼¾⅓⅔])/.test(raw))
      .forEach(pushUnique);
  }
  const ingredients: Ingredient[] = finalTexts.map((raw, idx) => ({ id: `ing-${Date.now()}-${idx}`, raw }));

  let description = descriptionParts.join(' ').replace(/\s+/g, ' ').trim();
  const extras: string[] = [];
  if (notes.length > 0) extras.push(notes.join(' '));
  if (macros.length > 0) extras.push('Nutrition (per serving): ' + macros.join(' · '));
  description = [description, ...extras].filter(Boolean).join(' ');
  if (description.length > 900) description = description.slice(0, 900).replace(/\s+\S*$/, '') + '…';

  // "10-minute miso soup" in the headline is the only time many posts give
  if (!prep && !cook) {
    const headlineTime = `${title} ${hookLine || descriptionParts[0] || ''}`.match(/\b(\d{1,3})[- ]minute\b/i);
    if (headlineTime && Number(headlineTime[1]) <= 180) cook = Number(headlineTime[1]);
  }

  // Tag hints come from the headline only: an ingredient list that offers "beef or turkey bacon" doesn't make it a beef recipe
  const tags = buildCaptionTags(hashtags, `${title} ${descriptionParts.join(' ').slice(0, 160)}`);
  const baseCategories = inferCategories({ title, keywords: tags });
  const sourceCategory = source === 'instagram' ? 'Instagram' : source === 'cookbook' ? 'Cookbooks' : undefined;

  return {
    title,
    description,
    ingredients,
    instructions,
    servings: servings && servings > 0 && servings < 100 ? servings : 4,
    prepTimeMinutes: prep,
    cookTimeMinutes: cook,
    categories: sourceCategory ? [...baseCategories, sourceCategory] : baseCategories,
    tags,
    creator,
  };
}
