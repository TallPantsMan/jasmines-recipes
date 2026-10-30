/** A simple shopping list kept on this device, per profile. Ingredients are added from a recipe at the servings being cooked. */

export interface GroceryItem {
  id: string;
  text: string;
  from: string;
  checked: boolean;
}

const key = (profile: string) => `jasmines_recipes_grocery_${profile}`;

export function listGrocery(profile: string): GroceryItem[] {
  try {
    const items = JSON.parse(localStorage.getItem(key(profile)) || '[]');
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

function write(profile: string, items: GroceryItem[]): GroceryItem[] {
  try {
    localStorage.setItem(key(profile), JSON.stringify(items));
  } catch {
    /* storage full or blocked: the list just won't be remembered */
  }
  return items;
}

/** Adds lines, skipping any that are already on the list from the same recipe. Returns how many were new. */
export function addToGrocery(profile: string, from: string, lines: string[]): number {
  const items = listGrocery(profile);
  let added = 0;
  for (const text of lines) {
    if (items.some((i) => i.text === text && i.from === from)) continue;
    items.push({ id: `g-${Date.now()}-${added}-${Math.random().toString(36).slice(2, 6)}`, text, from, checked: false });
    added++;
  }
  write(profile, items);
  return added;
}

export const toggleGrocery = (profile: string, id: string) =>
  write(profile, listGrocery(profile).map((i) => (i.id === id ? { ...i, checked: !i.checked } : i)));

export const clearCheckedGrocery = (profile: string) => write(profile, listGrocery(profile).filter((i) => !i.checked));

export const clearAllGrocery = (profile: string) => write(profile, []);
