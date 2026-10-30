import type { Recipe } from '../types/recipe';

/**
 * "Recently deleted": a copy of each deleted recipe, kept on this device for 30 days so it can be put back.
 * Photos you added yourself are not kept (they could fill up the phone's storage).
 */

const DAYS = 30;
const MAX_ITEMS = 25;
const MAX_COVER_CHARS = 250_000;
const key = (profile: string) => `jasmines_recipes_bin_${profile}`;

export interface BinItem {
  recipe: Recipe;
  deletedAt: string;
}

function read(profile: string): BinItem[] {
  try {
    const items = JSON.parse(localStorage.getItem(key(profile)) || '[]') as BinItem[];
    const cutoff = Date.now() - DAYS * 24 * 3600 * 1000;
    return items.filter((i) => i?.recipe?.id && Date.parse(i.deletedAt) > cutoff);
  } catch {
    return [];
  }
}

function write(profile: string, items: BinItem[]) {
  // Keep the newest; if storage is full, drop the oldest until it fits
  let list = items.slice(0, MAX_ITEMS);
  while (list.length > 0) {
    try {
      localStorage.setItem(key(profile), JSON.stringify(list));
      return;
    } catch {
      list = list.slice(0, -1);
    }
  }
  try {
    localStorage.removeItem(key(profile));
  } catch {
    /* ignore */
  }
}

export function listBin(profile: string): BinItem[] {
  return read(profile);
}

export function addToBin(profile: string, recipe: Recipe) {
  const slim: Recipe = {
    ...recipe,
    userPhotos: [],
    coverImage: recipe.coverImage && recipe.coverImage.length > MAX_COVER_CHARS ? '' : recipe.coverImage,
  };
  write(profile, [{ recipe: slim, deletedAt: new Date().toISOString() }, ...read(profile).filter((i) => i.recipe.id !== recipe.id)]);
}

export function removeFromBin(profile: string, id: string) {
  write(profile, read(profile).filter((i) => i.recipe.id !== id));
}
