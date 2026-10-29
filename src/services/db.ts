import Dexie, { type Table } from 'dexie';
import type { Recipe } from '../types/recipe';

export class RecipeDatabase extends Dexie {
  recipes!: Table<Recipe, string>;

  constructor() {
    super('JasminesRecipeDatabase');
    this.version(1).stores({
      recipes: 'id, title, sourceType, favorite, rating, *categories, *tags, createdAt'
    });
    this.version(2).stores({
      recipes: 'id, title, sourceType, favorite, wantToTry, rating, *categories, *tags, createdAt'
    });
  }
}

export const db = new RecipeDatabase();