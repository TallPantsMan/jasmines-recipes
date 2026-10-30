import { db } from './db';
import type { Recipe, JasmineNote } from '../types/recipe';

const LOCAL_STORAGE_KEY = 'jasmines_recipes_persistent_store_v2';
const STORAGE_PERSISTED_KEY = 'jasmines_recipes_persisted_storage';

function saveToLocalStorage(recipes: Recipe[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(recipes));
  } catch {
    try {
      const lightweight = recipes.map(r => ({
        ...r,
        userPhotos: []
      }));
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(lightweight));
    } catch (e2) {
      console.warn('LocalStorage quota exhausted, IndexedDB is primary store', e2);
    }
  }
}

function loadFromLocalStorage(): Recipe[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed as Recipe[];
      }
    }
  } catch (err) {
    console.warn('Could not read recipes from localStorage', err);
  }
  return null;
}

export const RecipeService = {
  syncToLocalStorage(recipes: Recipe[]): void {
    saveToLocalStorage(recipes);
  },

  async requestPersistentStorage(): Promise<boolean> {
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
      try {
        const isPersisted = await navigator.storage.persist();
        localStorage.setItem(STORAGE_PERSISTED_KEY, isPersisted ? 'true' : 'false');
        return isPersisted;
      } catch {
        return false;
      }
    }
    return false;
  },

  async isStoragePersisted(): Promise<boolean> {
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persisted) {
      try {
        return await navigator.storage.persisted();
      } catch {
        return false;
      }
    }
    return false;
  },

  async init(): Promise<void> {
    await this.requestPersistentStorage();

    try {
      let idbCount = 0;
      try {
        idbCount = await db.recipes.count();
      } catch (err) {
        console.warn('IndexedDB count failed, checking localStorage fallback:', err);
      }

      const lsRecipes = loadFromLocalStorage();

      if (idbCount > 0) {
        const all = await db.recipes.toArray();
        saveToLocalStorage(all);
      } else if (lsRecipes && lsRecipes.length > 0) {
        try {
          await db.recipes.bulkPut(lsRecipes);
        } catch (rehydrateErr) {
          console.warn('Could not rehydrate IndexedDB from localStorage:', rehydrateErr);
        }
      }
      // Nothing saved yet: start with an empty box (the sample recipes are only for "Reset to defaults")
    } catch (err) {
      console.error('RecipeService.init error:', err);
    }
  },

  async getAllRecipes(): Promise<Recipe[]> {
    let fromIdb: Recipe[] = [];
    try {
      fromIdb = await db.recipes.toArray();
    } catch (err) {
      console.warn('Error reading from IndexedDB:', err);
    }

    const fromLs = loadFromLocalStorage();

    if (fromIdb.length > 0 && (!fromLs || fromIdb.length >= fromLs.length)) {
      saveToLocalStorage(fromIdb);
      return fromIdb;
    }

    if (fromLs && fromLs.length > 0) {
      try {
        await db.recipes.bulkPut(fromLs);
      } catch {}
      return fromLs;
    }

    if (fromIdb.length > 0) {
      return fromIdb;
    }

    return [];
  },

  async getRecipe(id: string): Promise<Recipe | undefined> {
    try {
      const r = await db.recipes.get(id);
      if (r) return r;
    } catch {}
    const fromLs = loadFromLocalStorage();
    return fromLs?.find(r => r.id === id);
  },

  async saveRecipe(recipe: Recipe): Promise<void> {
    recipe.updatedAt = new Date().toISOString();

    try {
      await db.recipes.put(recipe);
    } catch (err) {
      console.warn('IndexedDB put failed, saving to localStorage:', err);
    }

    const current = loadFromLocalStorage() || [];
    const idx = current.findIndex(r => r.id === recipe.id);
    if (idx >= 0) {
      current[idx] = recipe;
    } else {
      current.unshift(recipe);
    }
    saveToLocalStorage(current);
  },

  async deleteRecipe(id: string): Promise<void> {
    try {
      await db.recipes.delete(id);
    } catch (err) {
      console.warn('IndexedDB delete failed:', err);
    }

    const current = loadFromLocalStorage() || [];
    const filtered = current.filter(r => r.id !== id);
    saveToLocalStorage(filtered);
  },

  async toggleFavorite(id: string): Promise<boolean> {
    let newFav = false;
    const current = loadFromLocalStorage() || [];
    const match = current.find(r => r.id === id);
    if (match) {
      match.favorite = !match.favorite;
      match.updatedAt = new Date().toISOString();
      newFav = match.favorite;
      saveToLocalStorage(current);
    }

    try {
      const fromDb = await db.recipes.get(id);
      if (fromDb) {
        newFav = !fromDb.favorite;
        await db.recipes.update(id, { favorite: newFav, updatedAt: new Date().toISOString() });
      }
    } catch {}

    return newFav;
  },

  async toggleWantToTry(id: string): Promise<boolean> {
    let newWant = false;
    const current = loadFromLocalStorage() || [];
    const match = current.find(r => r.id === id);
    if (match) {
      match.wantToTry = !match.wantToTry;
      match.updatedAt = new Date().toISOString();
      newWant = match.wantToTry;
      saveToLocalStorage(current);
    }

    try {
      const fromDb = await db.recipes.get(id);
      if (fromDb) {
        newWant = !fromDb.wantToTry;
        await db.recipes.update(id, { wantToTry: newWant, updatedAt: new Date().toISOString() });
      }
    } catch {}

    return newWant;
  },

  async updateRating(id: string, rating: number): Promise<void> {
    const current = loadFromLocalStorage() || [];
    const match = current.find(r => r.id === id);
    if (match) {
      match.rating = rating;
      match.updatedAt = new Date().toISOString();
      saveToLocalStorage(current);
    }

    try {
      await db.recipes.update(id, { rating, updatedAt: new Date().toISOString() });
    } catch {}
  },

  async setFolders(id: string, folders: string[]): Promise<void> {
    const updatedAt = new Date().toISOString();
    const current = loadFromLocalStorage() || [];
    const match = current.find(r => r.id === id);
    if (match) {
      match.folders = folders;
      match.updatedAt = updatedAt;
      saveToLocalStorage(current);
    }

    try {
      await db.recipes.update(id, { folders, updatedAt });
    } catch {}
  },

  async addJasmineNote(id: string, text: string): Promise<JasmineNote> {
    const newNote: JasmineNote = {
      id: 'note-' + Date.now(),
      text,
      date: new Date().toISOString().split('T')[0]
    };

    const current = loadFromLocalStorage() || [];
    const match = current.find(r => r.id === id);
    if (match) {
      match.jasmineNotes = [newNote, ...(match.jasmineNotes || [])];
      match.updatedAt = new Date().toISOString();
      saveToLocalStorage(current);
    }

    try {
      const fromDb = await db.recipes.get(id);
      if (fromDb) {
        const updatedNotes = [newNote, ...(fromDb.jasmineNotes || [])];
        await db.recipes.update(id, {
          jasmineNotes: updatedNotes,
          updatedAt: new Date().toISOString()
        });
      }
    } catch {}

    return newNote;
  },

  async deleteJasmineNote(recipeId: string, noteId: string): Promise<void> {
    const current = loadFromLocalStorage() || [];
    const match = current.find(r => r.id === recipeId);
    if (match) {
      match.jasmineNotes = (match.jasmineNotes || []).filter(n => n.id !== noteId);
      match.updatedAt = new Date().toISOString();
      saveToLocalStorage(current);
    }

    try {
      const fromDb = await db.recipes.get(recipeId);
      if (fromDb) {
        const updatedNotes = (fromDb.jasmineNotes || []).filter(n => n.id !== noteId);
        await db.recipes.update(recipeId, {
          jasmineNotes: updatedNotes,
          updatedAt: new Date().toISOString()
        });
      }
    } catch {}
  },

  async addUserPhoto(recipeId: string, photoDataUrl: string): Promise<void> {
    try {
      const fromDb = await db.recipes.get(recipeId);
      if (fromDb) {
        const updatedPhotos = [...(fromDb.userPhotos || []), photoDataUrl];
        await db.recipes.update(recipeId, {
          userPhotos: updatedPhotos,
          updatedAt: new Date().toISOString()
        });
      }
    } catch {}

    const current = loadFromLocalStorage() || [];
    const match = current.find(r => r.id === recipeId);
    if (match) {
      match.userPhotos = [...(match.userPhotos || []), photoDataUrl];
      match.updatedAt = new Date().toISOString();
      saveToLocalStorage(current);
    }
  },

  async removeUserPhoto(recipeId: string, photoIndex: number): Promise<void> {
    try {
      const fromDb = await db.recipes.get(recipeId);
      if (fromDb) {
        const updatedPhotos = (fromDb.userPhotos || []).filter((_, idx) => idx !== photoIndex);
        await db.recipes.update(recipeId, {
          userPhotos: updatedPhotos,
          updatedAt: new Date().toISOString()
        });
      }
    } catch {}

    const current = loadFromLocalStorage() || [];
    const match = current.find(r => r.id === recipeId);
    if (match) {
      match.userPhotos = (match.userPhotos || []).filter((_, idx) => idx !== photoIndex);
      match.updatedAt = new Date().toISOString();
      saveToLocalStorage(current);
    }
  },

  /** Applies changes that came from the cloud copy, keeping their original edit times. */
  async applyRemote(recipes: Recipe[], deleteIds: string[]): Promise<void> {
    try {
      if (recipes.length) await db.recipes.bulkPut(recipes);
      if (deleteIds.length) await db.recipes.bulkDelete(deleteIds);
    } catch (err) {
      console.warn('IndexedDB apply failed:', err);
    }
    const byId = new Map((loadFromLocalStorage() || []).map(r => [r.id, r]));
    recipes.forEach(r => byId.set(r.id, r));
    deleteIds.forEach(id => byId.delete(id));
    saveToLocalStorage(Array.from(byId.values()));
  },

  /** Empties this device's copy (used when someone else's profile is about to be opened). */
  async clearLocal(): Promise<void> {
    try {
      await db.recipes.clear();
    } catch {}
    try {
      localStorage.removeItem(LOCAL_STORAGE_KEY);
    } catch {}
  },

  async exportAllAsJson(): Promise<string> {
    const all = await this.getAllRecipes();
    return JSON.stringify(all, null, 2);
  },

  async importFromJson(jsonString: string): Promise<number> {
    const data = JSON.parse(jsonString) as Recipe[];
    if (Array.isArray(data) && data.length > 0) {
      try {
        await db.recipes.bulkPut(data);
      } catch {}
      saveToLocalStorage(data);
      return data.length;
    }
    throw new Error('Invalid JSON recipe format');
  }
};
