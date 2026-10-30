import React, { useState, useEffect, useMemo, useRef } from 'react';
import { fetchInstagramCover } from './services/imageService';
import type { Recipe, FilterCategory, JasmineNote } from './types/recipe';
import { RecipeService } from './services/recipeService';
import { Navbar } from './components/Navbar';
import { CategoryFilterBar } from './components/CategoryFilterBar';
import { RecipeCard } from './components/RecipeCard';
import { RecipeDetailModal } from './components/RecipeDetailModal';
import { AddRecipeModal } from './components/AddRecipeModal';
import { CookModeModal } from './components/CookModeModal';
import { WelcomeModal } from './components/WelcomeModal';
import { ChefHat, Plus, Sparkles, BookOpen, Heart, RefreshCw } from 'lucide-react';

export function App() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<FilterCategory>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [cookingRecipe, setCookingRecipe] = useState<{ recipe: Recipe; servings: number } | null>(null);
  const [showWelcome, setShowWelcome] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Initial Load from Dexie & LocalStorage
  useEffect(() => {
    async function loadData() {
      try {
        const loaded = await RecipeService.getRecipes();
        setRecipes(loaded);

        // Check if welcome modal was dismissed previously
        const seenWelcome = localStorage.getItem('jasmines_recipes_welcome_seen');
        if (!seenWelcome) {
          setShowWelcome(true);
        }

        // Check for shared recipe in URL hash
        if (window.location.hash.startsWith('#recipe=')) {
          const raw = window.location.hash.replace('#recipe=', '');
          if (raw) {
            try {
              const shared = JSON.parse(decodeURIComponent(escape(atob(raw))));
              if (shared && shared.title) {
                // Add to local state if not exists
                const exists = loaded.find(r => r.title === shared.title);
                if (!exists) {
                  const imported: Recipe = {
                    ...shared,
                    id: `shared-${Date.now()}`,
                    createdAt: new Date().toISOString()
                  };
                  await RecipeService.saveRecipe(imported);
                  setRecipes(prev => [imported, ...prev]);
                  setSelectedRecipe(imported);
                } else {
                  setSelectedRecipe(exists);
                }
                // Clear hash
                window.history.replaceState(null, '', window.location.pathname);
              }
            } catch (e) {
              console.warn('Could not decode share link', e);
            }
          }
        }
      } catch (err) {
        console.error('Failed to initialize recipes:', err);
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, []);

  // Backfill: Instagram recipes whose cover is missing/expired get the post's cover saved permanently
  const coverBackfillTried = useRef<Set<string>>(new Set());
  useEffect(() => {
    recipes.forEach((r) => {
      if (r.sourceType !== 'instagram' || !r.sourceUrl) return;
      if (r.coverImage && r.coverImage.startsWith('data:image')) return;
      if (coverBackfillTried.current.has(r.id)) return;
      coverBackfillTried.current.add(r.id);
      fetchInstagramCover(r.sourceUrl).then(async (cover) => {
        if (!cover) return;
        const updated = { ...r, coverImage: cover };
        await RecipeService.saveRecipe(updated);
        setRecipes(prev => prev.map(x => (x.id === r.id ? { ...x, coverImage: cover } : x)));
      });
    });
  }, [recipes]);

  // Real-time autosave to localStorage whenever recipes change
  useEffect(() => {
    if (recipes.length > 0) {
      RecipeService.syncToLocalStorage(recipes);
    }
  }, [recipes]);

  // Window unload listener
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (recipes.length > 0) {
        RecipeService.syncToLocalStorage(recipes);
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [recipes]);

  // Filtered & Searched recipes
  const filteredRecipes = useMemo(() => {
    return recipes.filter((recipe) => {
      // 1. Category Filter
      if (selectedCategory === 'Want to Try' && !recipe.wantToTry) return false;
      if (selectedCategory === 'Favorites' && !recipe.favorite) return false;
      if (selectedCategory === 'Instagram' && recipe.sourceType !== 'instagram' && !recipe.categories.includes('Instagram')) return false;
      if (selectedCategory === 'Cookbooks' && recipe.sourceType !== 'cookbook' && !recipe.categories.includes('Cookbooks')) return false;
      if (selectedCategory === 'Dinners' && !recipe.categories.includes('Dinners')) return false;
      if (selectedCategory === 'Baking' && !recipe.categories.includes('Baking')) return false;
      if (selectedCategory === 'Salads & Sides' && !recipe.categories.includes('Salads & Sides')) return false;
      if (selectedCategory === 'Quick (<30m)') {
        const total = (recipe.prepTimeMinutes || 0) + (recipe.cookTimeMinutes || 0);
        const hasTag = recipe.categories.includes('Quick (<30m)') || recipe.tags.some(t => t.toLowerCase().includes('quick') || t.toLowerCase().includes('30'));
        if (total > 30 && !hasTag) return false;
      }

      // 2. Search Query Filter
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      const inTitle = recipe.title.toLowerCase().includes(q);
      const inDesc = recipe.description?.toLowerCase().includes(q);
      const inSource = recipe.sourceName?.toLowerCase().includes(q);
      const inTags = recipe.tags.some(t => t.toLowerCase().includes(q));
      const inIngredients = recipe.ingredients.some(i => i.raw.toLowerCase().includes(q));
      const inNotes = recipe.jasmineNotes?.some(n => n.text.toLowerCase().includes(q));

      return inTitle || inDesc || inSource || inTags || inIngredients || inNotes;
    });
  }, [recipes, selectedCategory, searchQuery]);

  // Favorites and Want to Try counts
  const favoritesCount = useMemo(() => {
    return recipes.filter(r => r.favorite).length;
  }, [recipes]);

  const wantToTryCount = useMemo(() => {
    return recipes.filter(r => r.wantToTry).length;
  }, [recipes]);

  // Actions
  const handleToggleFavorite = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const updated = recipes.map(r => r.id === id ? { ...r, favorite: !r.favorite } : r);
    setRecipes(updated);
    const target = updated.find(r => r.id === id);
    if (target) await RecipeService.saveRecipe(target);
    if (selectedRecipe && selectedRecipe.id === id) {
      setSelectedRecipe(target || null);
    }
  };

  const handleToggleWantToTry = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const updated = recipes.map(r => r.id === id ? { ...r, wantToTry: !r.wantToTry } : r);
    setRecipes(updated);
    const target = updated.find(r => r.id === id);
    if (target) await RecipeService.saveRecipe(target);
    if (selectedRecipe && selectedRecipe.id === id) {
      setSelectedRecipe(target || null);
    }
  };

  const handleUpdateRating = async (id: string, rating: number) => {
    const updated = recipes.map(r => r.id === id ? { ...r, rating } : r);
    setRecipes(updated);
    const target = updated.find(r => r.id === id);
    if (target) await RecipeService.saveRecipe(target);
    if (selectedRecipe && selectedRecipe.id === id) {
      setSelectedRecipe(target || null);
    }
  };

  const handleSaveRecipe = async (recipe: Recipe) => {
    await RecipeService.saveRecipe(recipe);
    setRecipes(prev => {
      const idx = prev.findIndex(r => r.id === recipe.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = recipe;
        return next;
      }
      return [recipe, ...prev];
    });
    setEditingRecipe(null);
    setIsAddModalOpen(false);
    setSelectedRecipe(recipe);
  };

  const handleDeleteRecipe = async (id: string) => {
    await RecipeService.deleteRecipe(id);
    setRecipes(prev => prev.filter(r => r.id !== id));
    if (selectedRecipe?.id === id) {
      setSelectedRecipe(null);
    }
  };

  const handleAddNote = async (recipeId: string, text: string): Promise<JasmineNote> => {
    const note: JasmineNote = {
      id: `note-${Date.now()}`,
      text,
      date: new Date().toISOString().split('T')[0]
    };
    const target = recipes.find(r => r.id === recipeId);
    if (target) {
      const updatedRecipe: Recipe = {
        ...target,
        jasmineNotes: [note, ...(target.jasmineNotes || [])]
      };
      await RecipeService.saveRecipe(updatedRecipe);
      setRecipes(prev => prev.map(r => r.id === recipeId ? updatedRecipe : r));
      if (selectedRecipe?.id === recipeId) {
        setSelectedRecipe(updatedRecipe);
      }
    }
    return note;
  };

  const handleDeleteNote = async (recipeId: string, noteId: string) => {
    const target = recipes.find(r => r.id === recipeId);
    if (target) {
      const updatedRecipe: Recipe = {
        ...target,
        jasmineNotes: (target.jasmineNotes || []).filter(n => n.id !== noteId)
      };
      await RecipeService.saveRecipe(updatedRecipe);
      setRecipes(prev => prev.map(r => r.id === recipeId ? updatedRecipe : r));
      if (selectedRecipe?.id === recipeId) {
        setSelectedRecipe(updatedRecipe);
      }
    }
  };

  const handleAddPhoto = async (recipeId: string, dataUrl: string) => {
    const target = recipes.find(r => r.id === recipeId);
    if (target) {
      const updatedRecipe: Recipe = {
        ...target,
        userPhotos: [...(target.userPhotos || []), dataUrl]
      };
      await RecipeService.saveRecipe(updatedRecipe);
      setRecipes(prev => prev.map(r => r.id === recipeId ? updatedRecipe : r));
      if (selectedRecipe?.id === recipeId) {
        setSelectedRecipe(updatedRecipe);
      }
    }
  };

  const handleRemovePhoto = async (recipeId: string, index: number) => {
    const target = recipes.find(r => r.id === recipeId);
    if (target) {
      const nextPhotos = [...(target.userPhotos || [])];
      nextPhotos.splice(index, 1);
      const updatedRecipe: Recipe = {
        ...target,
        userPhotos: nextPhotos
      };
      await RecipeService.saveRecipe(updatedRecipe);
      setRecipes(prev => prev.map(r => r.id === recipeId ? updatedRecipe : r));
      if (selectedRecipe?.id === recipeId) {
        setSelectedRecipe(updatedRecipe);
      }
    }
  };

  const handleExportData = () => {
    const jsonStr = RecipeService.exportToJson(recipes);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `jasmines-recipes-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportData = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const text = await file.text();
      const imported = await RecipeService.importFromJson(text);
      setRecipes(imported);
      alert(`🎉 Successfully restored ${imported.length} recipes into Jasmine's Box!`);
    };
    input.click();
  };

  const handleShareApp = () => {
    if (navigator.share) {
      navigator.share({
        title: "Jasmine's Recipes",
        text: 'All your favorite recipes from websites, Instagram, and cookbooks in one cozy kitchen box!',
        url: window.location.origin
      }).catch(() => {});
    } else {
      navigator.clipboard.writeText(window.location.origin);
      alert('📋 Link copied to clipboard! Share it with Jasmine or friends.');
    }
  };

  const handleResetToSeeds = async () => {
    if (confirm('Restore all default starter recipes? Your custom additions will be kept.')) {
      const restored = await RecipeService.restoreDefaults();
      setRecipes(restored);
    }
  };

  return (
    <div className="min-h-screen bg-[#FDFBF7] text-[#221E1B] flex flex-col font-sans selection:bg-[#FFEFEA] selection:text-[#FF5B26]">
      
      {/* ReciMe Styled Top Navbar */}
      <Navbar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onAddClick={() => { setEditingRecipe(null); setIsAddModalOpen(true); }}
        onExport={handleExportData}
        onImport={handleImportData}
        onShare={handleShareApp}
        onReset={handleResetToSeeds}
        onShowWelcome={() => setShowWelcome(true)}
        totalCount={recipes.length}
      />

      {/* ReciMe Category Filters */}
      <CategoryFilterBar
        selectedCategory={selectedCategory}
        onSelectCategory={setSelectedCategory}
        favoritesCount={favoritesCount}
        wantToTryCount={wantToTryCount}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-4 sm:py-6">
        
        {/* Subheader / Active Filter View */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <h2 className="text-xl sm:text-2xl font-serif font-bold text-[#221E1B]">
              {selectedCategory === 'All' ? 'All Recipes' : selectedCategory}
            </h2>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-[#F5EFE7] text-[#6E6457]">
              {filteredRecipes.length}
            </span>
          </div>

          {/* Quick Add CTA Button for Desktop */}
          <button
            onClick={() => { setEditingRecipe(null); setIsAddModalOpen(true); }}
            className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-2xl bg-[#FF5B26] hover:bg-[#E84D1B] text-white text-xs font-bold shadow-md shadow-[#FF5B26]/20 active:scale-95 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Import Recipe</span>
          </button>
        </div>

        {/* Recipes Grid */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 text-[#8F8477] space-y-3">
            <RefreshCw className="w-8 h-8 animate-spin text-[#FF5B26]" />
            <p className="text-sm font-semibold">Opening Jasmine's Kitchen Box...</p>
          </div>
        ) : filteredRecipes.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
            {filteredRecipes.map((recipe) => (
              <RecipeCard
                key={recipe.id}
                recipe={recipe}
                onSelect={setSelectedRecipe}
                onToggleFavorite={handleToggleFavorite}
                onToggleWantToTry={handleToggleWantToTry}
              />
            ))}
          </div>
        ) : (
          /* Empty State */
          <div className="text-center py-16 sm:py-24 px-4 bg-white/70 rounded-[32px] border border-dashed border-[#E5DACD] max-w-lg mx-auto space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-[#FFEFEA] text-[#FF5B26] flex items-center justify-center mx-auto shadow-inner">
              <ChefHat className="w-8 h-8 stroke-[2]" />
            </div>
            <div className="space-y-1">
              <h3 className="font-serif text-xl font-bold text-[#221E1B]">No recipes found</h3>
              <p className="text-xs sm:text-sm text-[#7D7264] max-w-sm mx-auto">
                {searchQuery
                  ? `No matches for "${searchQuery}". Try searching for another ingredient or clear the filter.`
                  : `You don't have any recipes in "${selectedCategory}" yet.`}
              </p>
            </div>
            <div className="pt-2">
              <button
                onClick={() => { setEditingRecipe(null); setIsAddModalOpen(true); }}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-[#FF5B26] hover:bg-[#E84D1B] text-white text-xs font-bold shadow-md shadow-[#FF5B26]/20 active:scale-95 transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4 stroke-[2.5]" />
                <span>Import a Recipe Now</span>
              </button>
            </div>
          </div>
        )}

      </main>

      {/* ReciMe Footer */}
      <footer className="mt-auto border-t border-[#F0E8DC] py-6 px-4 text-center text-xs text-[#8A8072] space-y-1">
        <p className="font-semibold text-[#5A5246]">
          Crafted with ❤️ for Jasmine · Warm Vanilla & Tangerine Kitchen Box
        </p>
        <p className="text-[11px] text-[#A69C8E]">
          Works offline & saves automatically to your device · ReciMe inspired
        </p>
      </footer>

      {/* MODALS */}

      {/* 1. Welcome Modal */}
      <WelcomeModal
        isOpen={showWelcome}
        onClose={() => setShowWelcome(false)}
      />

      {/* 2. Recipe Detail Modal */}
      {selectedRecipe && (
        <RecipeDetailModal
          recipe={selectedRecipe}
          onClose={() => setSelectedRecipe(null)}
          onEdit={(r) => { setSelectedRecipe(null); setEditingRecipe(r); setIsAddModalOpen(true); }}
          onDelete={handleDeleteRecipe}
          onToggleFavorite={handleToggleFavorite}
          onToggleWantToTry={handleToggleWantToTry}
          onUpdateRating={handleUpdateRating}
          onAddNote={handleAddNote}
          onDeleteNote={handleDeleteNote}
          onAddPhoto={handleAddPhoto}
          onRemovePhoto={handleRemovePhoto}
          onStartCooking={(r, s) => setCookingRecipe({ recipe: r, servings: s })}
        />
      )}

      {/* 3. Add / Edit Recipe Modal */}
      {isAddModalOpen && (
        <AddRecipeModal
          initialRecipe={editingRecipe || undefined}
          onSave={handleSaveRecipe}
          onClose={() => { setIsAddModalOpen(false); setEditingRecipe(null); }}
        />
      )}

      {/* 4. Cook Mode Modal */}
      {cookingRecipe && (
        <CookModeModal
          recipe={cookingRecipe.recipe}
          initialServings={cookingRecipe.servings}
          onClose={() => setCookingRecipe(null)}
        />
      )}

    </div>
  );
}
