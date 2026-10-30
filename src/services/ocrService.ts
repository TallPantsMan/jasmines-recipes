import { createWorker } from 'tesseract.js';
import { parseRawRecipeText } from './recipeParser';
import { refineWithAi } from './aiClean';
import type { Recipe } from '../types/recipe';

export interface OcrProgress {
  status: string;
  progress: number;
}

export async function processCookbookImage(
  imageSource: File | string,
  onProgress?: (p: OcrProgress) => void
): Promise<{ rawText: string; parsedRecipe: Partial<Recipe> }> {
  const worker = await createWorker('eng');

  if (onProgress) {
    onProgress({ status: 'Initializing text scanner...', progress: 0.1 });
  }

  const ret = await worker.recognize(imageSource);
  const text = ret.data.text;

  if (onProgress) {
    onProgress({ status: 'Formatting recipe...', progress: 0.95 });
  }

  await worker.terminate();

  const { creator: _creator, ...parsed } = await refineWithAi(text, parseRawRecipeText(text, undefined, { source: 'cookbook' }));
  parsed.sourceType = 'cookbook';

  return {
    rawText: text,
    parsedRecipe: parsed
  };
}
