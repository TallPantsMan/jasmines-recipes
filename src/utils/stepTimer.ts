import type { InstructionStep } from '../types/recipe';

const WORD_NUMBERS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  fifteen: 15, twenty: 20, thirty: 30, forty: 40, 'forty-five': 45, sixty: 60,
};

const NUMBER = '(\\d+(?:\\.\\d+)?|\\d+\\s*\\/\\s*\\d+|' + Object.keys(WORD_NUMBERS).join('|') + ')';
const UNIT = '(hours?|hrs?|h|minutes?|mins?|m)\\b';
const WAIT_WORDS = /\b(simmer|bake|boil|cook|roast|rest|chill|marinate|steep|fry|saut[eé]|sear|grill|broil|let sit|stand|cool|freeze|refrigerate|rise|proof|microwave|steam|reduce|set)\b/i;

function toNumber(raw: string): number {
  const s = raw.toLowerCase().replace(/\s+/g, '');
  if (WORD_NUMBERS[s] !== undefined) return WORD_NUMBERS[s];
  if (s.includes('/')) {
    const [a, b] = s.split('/').map(Number);
    return b ? a / b : 0;
  }
  return parseFloat(s);
}

function toMinutes(amount: number, unit: string): number {
  return /^h/i.test(unit) ? amount * 60 : amount;
}

/**
 * Looks in a step's text for a waiting time ("simmer for 10 minutes", "bake 1 hour 15 minutes")
 * and returns it in minutes. Returns undefined when the step has no clear wait.
 */
export function detectTimerMinutes(text: string): number | undefined {
  if (!text || !WAIT_WORDS.test(text)) return undefined;

  // "1 hour 15 minutes" / "1 hour and 30 mins"
  const combo = new RegExp(`${NUMBER}\\s*(?:hours?|hrs?|h)\\b\\s*(?:and\\s*)?${NUMBER}\\s*(?:minutes?|mins?|m)\\b`, 'i').exec(text);
  if (combo) {
    const total = Math.round(toNumber(combo[1]) * 60 + toNumber(combo[2]));
    if (total > 0) return total;
  }

  // "10-15 minutes" or "10 to 15 minutes" -> use the longer one
  const range = new RegExp(`${NUMBER}\\s*(?:-|–|to)\\s*${NUMBER}\\s*${UNIT}`, 'i').exec(text);
  if (range) {
    const total = Math.round(toMinutes(Math.max(toNumber(range[1]), toNumber(range[2])), range[3]));
    if (total > 0) return total;
  }

  const single = new RegExp(`${NUMBER}\\s*${UNIT}`, 'i').exec(text);
  if (single) {
    const total = Math.round(toMinutes(toNumber(single[1]), single[2]));
    if (total > 0 && total <= 24 * 60) return total;
  }
  return undefined;
}

/** The timer for a step: the saved one if there is one, otherwise one found in the text. */
export function stepTimerMinutes(step: InstructionStep): number | undefined {
  return step.timerMinutes || detectTimerMinutes(step.text);
}
