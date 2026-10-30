import { createWorker } from 'tesseract.js';
import { parseRawRecipeText } from './recipeParser';
import { refineWithAi } from './aiClean';
import type { Recipe } from '../types/recipe';

export interface OcrProgress {
  status: string;
  progress: number;
}

/** Reads one or more photos of recipe pages (in the order given) and turns the combined text into a recipe. */
export async function processCookbookImages(
  images: Array<File | string>,
  onProgress?: (p: OcrProgress) => void
): Promise<{ rawText: string; parsedRecipe: Partial<Recipe> }> {
  onProgress?.({ status: 'Initializing text scanner...', progress: 0.05 });
  const worker = await createWorker('eng');

  const pages: string[] = [];
  try {
    for (let i = 0; i < images.length; i++) {
      onProgress?.({
        status: images.length > 1 ? `Reading page ${i + 1} of ${images.length}...` : 'Reading photo...',
        progress: 0.1 + (0.8 * i) / images.length,
      });
      const ret = await worker.recognize(images[i]);
      pages.push(ret.data.text);
    }
  } finally {
    await worker.terminate();
  }
  const text = pages.join('\n\n');

  onProgress?.({ status: 'Formatting recipe...', progress: 0.95 });

  const { creator: _creator, ...parsed } = await refineWithAi(text, parseRawRecipeText(text, undefined, { source: 'cookbook' }));
  parsed.sourceType = 'cookbook';

  return {
    rawText: text,
    parsedRecipe: parsed
  };
}
