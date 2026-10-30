// Scales the amount at the start of an ingredient line ("1 1/2 cups flour", "2-3 cloves garlic", "½ tsp salt").
// Lines with no leading amount ("salt to taste") and anything after the first amount (like "(14 oz)") are left alone.

const VULGAR: Record<string, number> = { '½': 1 / 2, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 1 / 4, '¾': 3 / 4, '⅛': 1 / 8, '⅜': 3 / 8, '⅝': 5 / 8, '⅞': 7 / 8 };
const VULGAR_CHARS = Object.keys(VULGAR).join('');

const NUMBER = `(?:\\d+\\s+\\d+\\/\\d+|\\d+\\/\\d+|\\d*\\.?\\d+\\s*[${VULGAR_CHARS}]|[${VULGAR_CHARS}]|\\d+(?:\\.\\d+)?)`;
const LEADING_AMOUNT = new RegExp(`^(\\s*)(${NUMBER})(\\s*(?:-|–|to)\\s*(${NUMBER}))?(?![\\d/])`, 'i');

function toNumber(text: string): number {
  const t = text.trim();
  let m = t.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (m) return Number(m[1]) + Number(m[2]) / Number(m[3]);
  m = t.match(/^(\d+)\/(\d+)$/);
  if (m) return Number(m[1]) / Number(m[2]);
  m = t.match(new RegExp(`^(\\d*\\.?\\d*)\\s*([${VULGAR_CHARS}])$`));
  if (m) return (m[1] ? Number(m[1]) : 0) + VULGAR[m[2]];
  return Number(t);
}

const FRACTIONS: Array<[number, string]> = [
  [0, ''], [1 / 8, '1/8'], [1 / 4, '1/4'], [1 / 3, '1/3'], [3 / 8, '3/8'], [1 / 2, '1/2'],
  [5 / 8, '5/8'], [2 / 3, '2/3'], [3 / 4, '3/4'], [7 / 8, '7/8'], [1, ''],
];

/** 1.25 becomes "1 1/4"; anything that isn't close to a kitchen fraction becomes a one-decimal number. */
function toText(n: number): string {
  if (n >= 10) return String(Math.round(n));
  const whole = Math.floor(n);
  const rest = n - whole;
  let best = FRACTIONS[0];
  for (const f of FRACTIONS) if (Math.abs(f[0] - rest) < Math.abs(best[0] - rest)) best = f;
  if (Math.abs(best[0] - rest) > 0.04) return String(Math.round(n * 10) / 10);
  const w = whole + (best[0] === 1 ? 1 : 0);
  if (!best[1]) return String(w);
  return w > 0 ? `${w} ${best[1]}` : best[1];
}

export function scaleIngredient(raw: string, factor: number): string {
  if (!Number.isFinite(factor) || factor <= 0 || Math.abs(factor - 1) < 1e-9) return raw;
  const m = raw.match(LEADING_AMOUNT);
  if (!m) return raw;
  const [matched, lead, first, rangePart, second] = m;
  const tail = raw.slice(matched.length);
  const a = toText(toNumber(first) * factor);
  if (rangePart && second) {
    const sep = rangePart.match(/-|–|to/i)![0];
    const joiner = /to/i.test(sep) ? ' to ' : sep;
    return `${lead}${a}${joiner}${toText(toNumber(second) * factor)}${tail}`;
  }
  return `${lead}${a}${tail}`;
}
