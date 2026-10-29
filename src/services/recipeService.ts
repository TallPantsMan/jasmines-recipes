import { db } from './db';
import type { Recipe, JasmineNote } from '../types/recipe';
import { SEED_RECIPES } from '../data/seedRecipes';

export const RecipeService = {
  async init(): Promise<void> {
    const count = await db.recipes.count();
    if (count === 0) {
      await db.recipes.bulkAdd(SEED_RECIPES);
    }
  },

  async getAllRecipes(): Promise<Recipe[]> {
    return await db.recipes.toArray();
  },

  async getRecipe(id: string): Promise<Recipe | undefined> {
    return await db.recipes.get(id);
  },

  async saveRecipe(recipe: Recipe): Promise<void> {
    recipe.updatedAt = new Date().toISOString();
    await db.recipes.put(recipe);
  },

  async deleteRecipe(id: string): Promise<void> {
    await db.recipes.delete(id);
  },

  async toggleFavorite(id: string): Promise<boolean> {
    const recipe = await db.recipes.get(id);
    if (!recipe) return false;
    const newFav = !recipe.favorite;
    await db.recipes.update(id, { favorite: newFav, updatedAt: new Date().toISOString() });
    return newFav;
  },

  async toggleWantToTry(id: string): Promise<boolean> {
    const recipe = await db.recipes.get(id);
    if (!recipe) return false;
    const newWant = !recipe.wantToTry;
    await db.recipes.update(id, { wantToTry: newWant, updatedAt: new Date().toISOString() });
    return newWant;
  },

  async updateRating(id: string, rating: number): Promise<void> {
    await db.recipes.update(id, { rating, updatedAt: new Date().toISOString() });
  },

  async addJasmineNote(id: string, text: string): Promise<JasmineNote> {
    const recipe = await db.recipes.get(id);
    if (!recipe) throw new Error('Recipe not found');

    const newNote: JasmineNote = {
      id: 'note-' + Date.now(),
      text,
      date: new Date().toISOString().split('T')[0]
    };

    const updatedNotes = [newNote, ...(recipe.jasmineNotes || [])];
    await db.recipes.update(id, {
      jasmineNotes: updatedNotes,
      updatedAt: new Date().toISOString()
    });

    return newNote;
  },

  async deleteJasmineNote(recipeId: string, noteId: string): Promise<void> {
    const recipe = await db.recipes.get(recipeId);
    if (!recipe) return;
    const updatedNotes = (recipe.jasmineNotes || []).filter(n => n.id !== noteId);
    await db.recipes.update(recipeId, {
      jasmineNotes: updatedNotes,
      updatedAt: new Date().toISOString()
    });
  },

  async addUserPhoto(recipeId: string, photoDataUrl: string): Promise<void> {
    const recipe = await db.recipes.get(recipeId);
    if (!recipe) return;
    const updatedPhotos = [...(recipe.userPhotos || []), photoDataUrl];
    await db.recipes.update(recipeId, {
      userPhotos: updatedPhotos,
      updatedAt: new Date().toISOString()
    });
  },

  async removeUserPhoto(recipeId: string, photoIndex: number): Promise<void> {
    const recipe = await db.recipes.get(recipeId);
    if (!recipe) return;
    const updatedPhotos = (recipe.userPhotos || []).filter((_, idx) => idx !== photoIndex);
    await db.recipes.update(recipeId, {
      userPhotos: updatedPhotos,
      updatedAt: new Date().toISOString()
    });
  },

  async exportAllAsJson(): Promise<string> {
    const all = await db.recipes.toArray();
    return JSON.stringify(all, null, 2);
  },

  async importFromJson(jsonString: string): Promise<number> {
    const data = JSON.parse(jsonString) as Recipe[];
    if (Array.isArray(data)) {
      await db.recipes.bulkPut(data);
      return data.length;
    }
    throw new Error('Invalid JSON recipe format');
  },

  async resetToDefaults(): Promise<void> {
    await db.recipes.clear();
    await db.recipes.bulkAdd(SEED_RECIPES);
  }
};
