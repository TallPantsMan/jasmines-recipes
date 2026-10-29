import type { Recipe, Ingredient, InstructionStep } from '../types/recipe';

/**
 * Converts ISO 8601 duration like "PT25M" or "PT1H15M" into minutes
 */
function parseDuration(durationStr?: string): number | undefined {
  if (!durationStr || typeof durationStr !== 'string') return undefined;
  const match = durationStr.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (!match) return undefined;
  const hours = parseInt(match[1] || '0', 10);
  const mins = parseInt(match[2] || '0', 10);
  return hours * 60 + mins || undefined;
}

/**
 * Extracts raw image URL from schema image field (which can be a string, array, or object)
 */
function extractImage(imageField: any): string | undefined {
  if (!imageField) return undefined;
  if (typeof imageField === 'string') return imageField;
  if (Array.isArray(imageField) && imageField.length > 0) {
    return typeof imageField[0] === 'string' ? imageField[0] : imageField[0]?.url;
  }
  if (typeof imageField === 'object' && imageField.url) {
    return imageField.url;
  }
  return undefined;
}

/**
 * Cleans HTML tags from text
 */
function stripHtml(html: string): string {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || '';
}

/**
 * Parses JSON-LD schema objects for Recipe definition
 */
export function parseRecipeFromHtml(html: string, sourceUrl: string): Partial<Recipe> | null {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // 1. Try finding JSON-LD
    const jsonLdScripts = doc.querySelectorAll('script[type="application/ld+json"]');
    let recipeData: any = null;

    for (let i = 0; i < jsonLdScripts.length; i++) {
      try {
        const content = jsonLdScripts[i].textContent;
        if (!content) continue;
        const json = JSON.parse(content);

        // Can be a single object, an array, or a @graph
        if (json['@type'] === 'Recipe' || (Array.isArray(json['@type']) && json['@type'].includes('Recipe'))) {
          recipeData = json;
          break;
        } else if (Array.isArray(json)) {
          const found = json.find((item: any) => item['@type'] === 'Recipe' || (Array.isArray(item['@type']) && item['@type'].includes('Recipe')));
          if (found) { recipeData = found; break; }
        } else if (json['@graph'] && Array.isArray(json['@graph'])) {
          const found = json['@graph'].find((item: any) => item['@type'] === 'Recipe' || (Array.isArray(item['@type']) && item['@type'].includes('Recipe')));
          if (found) { recipeData = found; break; }
        }
      } catch {
        // continue
      }
    }

    if (recipeData) {
      // Ingredients
      const rawIngredients: string[] = Array.isArray(recipeData.recipeIngredient)
        ? recipeData.recipeIngredient
        : [];
      
      const ingredients: Ingredient[] = rawIngredients.map((raw, idx) => ({
        id: `ing-${Date.now()}-${idx}`,
        raw: stripHtml(String(raw).trim())
      })).filter(i => i.raw.length > 0);

      // Instructions
      let rawInstructions: string[] = [];
      if (Array.isArray(recipeData.recipeInstructions)) {
        recipeData.recipeInstructions.forEach((inst: any) => {
          if (typeof inst === 'string') {
            rawInstructions.push(inst);
          } else if (inst['@type'] === 'HowToStep' && inst.text) {
            rawInstructions.push(inst.text);
          } else if (inst['@type'] === 'HowToSection' && Array.isArray(inst.itemListElement)) {
            inst.itemListElement.forEach((sub: any) => {
              if (sub.text) rawInstructions.push(sub.text);
              else if (typeof sub === 'string') rawInstructions.push(sub);
            });
          }
        });
      } else if (typeof recipeData.recipeInstructions === 'string') {
        rawInstructions = recipeData.recipeInstructions.split(/\r?\n/).filter((l: string) => l.trim().length > 0);
      }

      const instructions: InstructionStep[] = rawInstructions.map((text, idx) => ({
        id: `step-${Date.now()}-${idx}`,
        stepNumber: idx + 1,
        text: stripHtml(text.trim())
      })).filter(s => s.text.length > 0);

      let servings = 4;
      if (recipeData.recipeYield) {
        const yieldVal = Array.isArray(recipeData.recipeYield) ? recipeData.recipeYield[0] : recipeData.recipeYield;
        const parsedYield = parseInt(String(yieldVal).replace(/\D+/g, ''), 10);
        if (!isNaN(parsedYield) && parsedYield > 0 && parsedYield < 100) {
          servings = parsedYield;
        }
      }

      // Source domain
      let domain = '';
      try {
        domain = new URL(sourceUrl).hostname.replace('www.', '');
      } catch {
        domain = 'Web Recipe';
      }

      return {
        title: stripHtml(recipeData.name || doc.title || 'Untitled Recipe'),
        description: stripHtml(recipeData.description || ''),
        sourceType: 'website',
        sourceUrl,
        sourceName: recipeData.author?.name || domain,
        coverImage: extractImage(recipeData.image),
        servings,
        prepTimeMinutes: parseDuration(recipeData.prepTime),
        cookTimeMinutes: parseDuration(recipeData.cookTime),
        ingredients,
        instructions,
        categories: ['Dinners'],
        tags: []
      };
    }

    // Fallback: OpenGraph tags
    const ogTitle = doc.querySelector('meta[property="og:title"]')?.getAttribute('content');
    const ogImage = doc.querySelector('meta[property="og:image"]')?.getAttribute('content');
    const ogDesc = doc.querySelector('meta[property="og:description"]')?.getAttribute('content');

    return {
      title: ogTitle || doc.title || 'Imported Recipe',
      description: ogDesc || '',
      sourceType: 'website',
      sourceUrl,
      sourceName: new URL(sourceUrl).hostname.replace('www.', ''),
      coverImage: ogImage || undefined,
      servings: 4,
      ingredients: [],
      instructions: [],
      categories: ['Dinners'],
      tags: []
    };
  } catch (err) {
    console.error('Error parsing recipe from HTML:', err);
    return null;
  }
}

/**
 * Intelligently parse raw pasted text (e.g., from an Instagram reel caption or cookbook text)
 */
export function parseRawRecipeText(text: string, titleHint?: string): Partial<Recipe> {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  
  let title = titleHint || '';
  let description = '';
  const ingredients: Ingredient[] = [];
  const instructions: InstructionStep[] = [];

  type SectionType = 'header' | 'ingredients' | 'instructions' | 'notes';
  let currentSection: SectionType = 'header';
  let detectedTitle = false;

  const ingredientKeywords = /^(ingredients|what you need|shopping list|grocery list)[\s:]*$/i;
  const instructionKeywords = /^(instructions|directions|method|how to make|steps|preparation)[\s:]*$/i;
  const notesKeywords = /^(notes|jasmine's notes|tips|variations)[\s:]*$/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check section transitions
    if (ingredientKeywords.test(line)) {
      currentSection = 'ingredients';
      continue;
    }
    if (instructionKeywords.test(line)) {
      currentSection = 'instructions';
      continue;
    }
    if (notesKeywords.test(line)) {
      currentSection = 'notes';
      continue;
    }

    // Auto-detect title from first line if not already set
    if (!detectedTitle && !title && currentSection === 'header') {
      if (line.length < 90 && !line.match(/^\d+[\.\)]/) && !line.includes('http')) {
        title = line.replace(/^[#\*\-]+\s*/, '');
        detectedTitle = true;
        continue;
      }
    }

    if (currentSection === 'header') {
      // Check if line looks like an ingredient (starts with amount/bullet)
      if (/^(\d|½|¼|¾|⅓|⅔|\-|\*|•)/.test(line) && line.length < 100) {
        currentSection = 'ingredients';
        ingredients.push({
          id: `ing-${Date.now()}-${ingredients.length}`,
          raw: line.replace(/^[\-\*•]\s*/, '')
        });
      } else {
        description += (description ? ' ' : '') + line;
      }
    } else if (currentSection === 'ingredients') {
      // Check if line suddenly looks like an instruction
      if (/^(step\s*\d+|\d+\.)\s+/i.test(line)) {
        currentSection = 'instructions';
        instructions.push({
          id: `step-${Date.now()}-${instructions.length}`,
          stepNumber: instructions.length + 1,
          text: line.replace(/^(step\s*\d+|\d+\.)\s+/i, '')
        });
      } else {
        ingredients.push({
          id: `ing-${Date.now()}-${ingredients.length}`,
          raw: line.replace(/^[\-\*•]\s*/, '')
        });
      }
    } else if (currentSection === 'instructions') {
      instructions.push({
        id: `step-${Date.now()}-${instructions.length}`,
        stepNumber: instructions.length + 1,
        text: line.replace(/^(step\s*\d+|\d+[\.\)])\s+/i, '')
      });
    }
  }

  // If no sections were marked explicitly, heuristic split
  if (ingredients.length === 0 && instructions.length === 0 && lines.length > 0) {
    lines.forEach((l) => {
      if (/^(\d|½|¼|¾|⅓|⅔|\-|\*|•)/.test(l)) {
        ingredients.push({
          id: `ing-${Date.now()}-${ingredients.length}`,
          raw: l.replace(/^[\-\*•]\s*/, '')
        });
      } else {
        instructions.push({
          id: `step-${Date.now()}-${instructions.length}`,
          stepNumber: instructions.length + 1,
          text: l.replace(/^(step\s*\d+|\d+[\.\)])\s+/i, '')
        });
      }
    });
  }

  return {
    title: title || 'Pasted Recipe',
    description: description.slice(0, 200),
    ingredients,
    instructions,
    servings: 4,
    categories: ['Dinners'],
    tags: []
  };
}
