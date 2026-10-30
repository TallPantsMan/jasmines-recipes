export interface Ingredient {
  id: string;
  raw: string;
  amount?: number;
  unit?: string;
  item?: string;
  section?: string;
}

export interface InstructionStep {
  id: string;
  stepNumber: number;
  text: string;
  section?: string;
  timerMinutes?: number;
}

export interface JasmineNote {
  id: string;
  text: string;
  date: string;
}

export type RecipeSourceType = 'website' | 'instagram' | 'video' | 'cookbook' | 'family' | 'manual';

export interface Recipe {
  id: string;
  title: string;
  description?: string;
  sourceType: RecipeSourceType;
  sourceUrl?: string;
  sourceName?: string;
  coverImage?: string;
  userPhotos: string[];
  servings: number;
  prepTimeMinutes?: number;
  cookTimeMinutes?: number;
  difficulty?: 'Easy' | 'Medium' | 'Advanced';
  categories: string[];
  tags: string[];
  ingredients: Ingredient[];
  instructions: InstructionStep[];
  jasmineNotes: JasmineNote[];
  rating: number;
  favorite: boolean;
  wantToTry?: boolean;
  /** Cookbook folders (made by the family, e.g. "Holidays") this recipe has been put in */
  folders?: string[];
  cookedCount?: number;
  lastCookedDate?: string;
  createdAt: string;
  updatedAt: string;
}

export type FilterCategory = 'All' | 'Want to Try' | 'Favorites' | 'Dinners' | 'Quick (<30m)' | 'Baking' | 'Salads & Sides' | 'Instagram' | 'Cookbooks';
