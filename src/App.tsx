import React, { useState, useEffect, useMemo } from 'react';
import type { Recipe, FilterCategory, JasmineNote } from './types/recipe';
import { RecipeService } from './services/recipeService';
import { Navbar } from './components/Navbar';
import { CategoryFilterBar } from './components/CategoryFilterBar';
import { RecipeCard } from './components/RecipeCard';
import { RecipeDetailModal } from './components/RecipeDetailModal';
import { CookModeModal } from './components/CookModeModal';
import { AddRecipeModal } from './components/AddRecipeModal';
import { WelcomeModal } from './components/WelcomeModal';
import { Plus, UtensilsCrossed } from 'lucide-react';

export function App() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<FilterCategory>('All');
  const [isLoading, setIsLoading] = useState(true);

  // Modals
  const [activeRecipe, setActiveRecipe] = useState<Recipe | null>(null);
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isWelcomeOpen, setIsWelcomeOpen] = useState(false);

  // Check first visit for welcome screen
  useEffect(() => {
    const hasSeenWelcome = localStorage.getItem('jasmines_recipes_welcome_seen');
    if (!hasSeenWelcome) {
      setIsWelcomeOpen(true);
    }
  }, []);
  const [cookModeState, setCookModeState] = useState<{ recipe: Recipe; servings: number } | null>(null);

  // Initial load & share link sync
  useEffect(() => {
    async function loadData() {
      try {
        await RecipeService.init();
        const loaded = await RecipeService.getAllRecipes();
        setRecipes(loaded);

        // Check if user opened a cross-device ?share= sync link
        if (typeof window !== 'undefined') {
          const params = new URLSearchParams(window.location.search);
          const shareData = params.get('share');
          if (shareData) {
            try {
              const decoded = decodeURIComponent(atob(shareData));
              const sharedRecipes = JSON.parse(decoded);
              if (Array.isArray(sharedRecipes) && sharedRecipes.length > 0) {
                if (confirm(`Sync ${sharedRecipes.length} recipes from shared link into your kitchen recipe box?`)) {
                  await RecipeService.importFromJson(decoded);
                  const merged = await RecipeService.getAllRecipes();
                  setRecipes(merged);
                  window.history.replaceState({}, '', window.location.pathname);
                }
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

  // Handlers
  const handleToggleFavorite = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const newFav = await RecipeService.toggleFavorite(id);
    setRecipes(prev => prev.map(r => r.id === id ? { ...r, favorite: newFav } : r));
    if (activeRecipe && activeRecipe.id === id) {
      setActiveRecipe(prev => prev ? { ...prev, favorite: newFav } : null);
    }
  };

  const handleToggleWantToTry = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const newWant = await RecipeService.toggleWantToTry(id);
    setRecipes(prev => prev.map(r => r.id === id ? { ...r, wantToTry: newWant } : r));
    if (activeRecipe && activeRecipe.id === id) {
      setActiveRecipe(prev => prev ? { ...prev, wantToTry: newWant } : null);
    }
  };

  const handleUpdateRating = async (id: string, rating: number) => {
    await RecipeService.updateRating(id, rating);
    setRecipes(prev => prev.map(r => r.id === id ? { ...r, rating } : r));
    if (activeRecipe && activeRecipe.id === id) {
      setActiveRecipe(prev => prev ? { ...prev, rating } : null);
    }
  };

  const handleAddNote = async (recipeId: string, text: string): Promise<JasmineNote> => {
    const newNote = await RecipeService.addJasmineNote(recipeId, text);
    setRecipes(prev => prev.map(r => {
      if (r.id === recipeId) {
        return { ...r, jasmineNotes: [newNote, ...(r.jasmineNotes || [])] };
      }
      return r;
    }));
    if (activeRecipe && activeRecipe.id === recipeId) {
      setActiveRecipe(prev => prev ? {
        ...prev,
        jasmineNotes: [newNote, ...(prev.jasmineNotes || [])]
      } : null);
    }
    return newNote;
  };

  const handleDeleteNote = async (recipeId: string, noteId: string) => {
    await RecipeService.deleteJasmineNote(recipeId, noteId);
    setRecipes(prev => prev.map(r => {
      if (r.id === recipeId) {
        return { ...r, jasmineNotes: (r.jasmineNotes || []).filter(n => n.id !== noteId) };
      }
      return r;
    }));
    if (activeRecipe && activeRecipe.id === recipeId) {
      setActiveRecipe(prev => prev ? {
        ...prev,
        jasmineNotes: (prev.jasmineNotes || []).filter(n => n.id !== noteId)
      } : null);
    }
  };

  const handleAddPhoto = async (recipeId: string, dataUrl: string) => {
    await RecipeService.addUserPhoto(recipeId, dataUrl);
    setRecipes(prev => prev.map(r => {
      if (r.id === recipeId) {
        return { ...r, userPhotos: [...(r.userPhotos || []), dataUrl] };
      }
      return r;
    }));
    if (activeRecipe && activeRecipe.id === recipeId) {
      setActiveRecipe(prev => prev ? {
        ...prev,
        userPhotos: [...(prev.userPhotos || []), dataUrl]
      } : null);
    }
  };

  const handleRemovePhoto = async (recipeId: string, index: number) => {
    await RecipeService.removeUserPhoto(recipeId, index);
    setRecipes(prev => prev.map(r => {
      if (r.id === recipeId) {
        return { ...r, userPhotos: (r.userPhotos || []).filter((_, i) => i !== index) };
      }
      return r;
    }));
    if (activeRecipe && activeRecipe.id === recipeId) {
      setActiveRecipe(prev => prev ? {
        ...prev,
        userPhotos: (prev.userPhotos || []).filter((_, i) => i !== index)
      } : null);
    }
  };

  const handleSaveRecipe = async (recipe: Recipe) => {
    await RecipeService.saveRecipe(recipe);
    setRecipes(prev => {
      const idx = prev.findIndex(r => r.id === recipe.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = recipe;
        return copy;
      }
      return [recipe, ...prev];
    });
    if (activeRecipe && activeRecipe.id === recipe.id) {
      setActiveRecipe(recipe);
    }
  };

  const handleDeleteRecipe = async (id: string) => {
    await RecipeService.deleteRecipe(id);
    setRecipes(prev => prev.filter(r => r.id !== id));
    if (activeRecipe && activeRecipe.id === id) {
      setActiveRecipe(null);
    }
  };

  const handleExportBackup = async () => {
    const jsonStr = await RecipeService.exportAllAsJson();
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `jasmines-recipes-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportBackup = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (ev) => {
        try {
          const content = ev.target?.result as string;
          const count = await RecipeService.importFromJson(content);
          const reloaded = await RecipeService.getAllRecipes();
          setRecipes(reloaded);
          alert(`Successfully imported ${count} recipes!`);
        } catch {
          alert('Failed to import backup file. Check file format.');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const handleShareBox = () => {
    try {
      const exportable = recipes.map(r => ({
        ...r,
        userPhotos: [] // Keep share URLs compact without huge photo bytes
      }));
      const encoded = btoa(encodeURIComponent(JSON.stringify(exportable)));
      const shareUrl = `${window.location.origin}${window.location.pathname}?share=${encoded}`;
      
      if (navigator.clipboard) {
        navigator.clipboard.writeText(shareUrl);
        alert('Recipe Box Sync Link copied to clipboard!\n\nOpen this link on Jasmine\'s phone or any other device to sync all recipes.');
      } else {
        prompt('Copy this sync link to transfer recipes across devices:', shareUrl);
      }
    } catch {
      handleExportBackup();
    }
  };

  const handleResetDefaults = async () => {
    if (confirm('Reset your recipe box to the original sample recipes? This will overwrite your changes.')) {
      await RecipeService.resetToDefaults();
      const reloaded = await RecipeService.getAllRecipes();
      setRecipes(reloaded);
    }
  };

  return (
    <div className="min-h-screen bg-[#FDFBF7] flex flex-col text-[#221E1B]">
      
      {/* ReciMe Styled Top Navigation */}
      <Navbar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onAddClick={() => {
          setEditingRecipe(null);
          setIsAddModalOpen(true);
        }}
        onExport={handleExportBackup}
        onImport={handleImportBackup}
        onShare={handleShareBox}
        onReset={handleResetDefaults}
        onShowWelcome={() => setIsWelcomeOpen(true)}
        totalCount={recipes.length}
      />

      {/* ReciMe Pill Categories */}
      <CategoryFilterBar
        selectedCategory={selectedCategory}
        onSelectCategory={setSelectedCategory}
        favoritesCount={favoritesCount}
        wantToTryCount={wantToTryCount}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-4 sm:py-6">
        
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 text-[#8C8274] gap-3">
            <div className="w-8 h-8 border-3 border-[#FF5B26] border-t-transparent rounded-full animate-spin"></div>
            <p className="text-sm font-semibold">Opening Jasmine's Recipe Box...</p>
          </div>
        ) : filteredRecipes.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 landscape:grid-cols-2 landscape:md:grid-cols-3 gap-5 sm:gap-6">
            {filteredRecipes.map((recipe) => (
              <RecipeCard
                key={recipe.id}
                recipe={recipe}
                onSelect={(r) => setActiveRecipe(r)}
                onToggleFavorite={handleToggleFavorite}
                onToggleWantToTry={handleToggleWantToTry}
              />
            ))}
          </div>
        ) : (
          /* Empty Search / Category state */
          <div className="max-w-md mx-auto py-12 sm:py-16 text-center space-y-4">
            <div className="w-16 h-16 rounded-3xl bg-[#F6EFE6] text-[#FF5B26] flex items-center justify-center mx-auto shadow-xs">
              <UtensilsCrossed className="w-8 h-8 stroke-[1.8]" />
            </div>
            <div>
              <h3 className="font-serif text-lg sm:text-xl font-bold text-[#221E1B]">
                No recipes found
              </h3>
              <p className="text-xs sm:text-sm text-[#7D7366] mt-1">
                {searchQuery
                  ? `We couldn't find anything matching "${searchQuery}". Try searching for an ingredient or clearing your search.`
                  : `There are no recipes in the "${selectedCategory}" category yet.`}
              </p>
            </div>
            <div className="pt-2 flex justify-center gap-3">
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="px-4 py-2.5 rounded-2xl border border-[#DFD5C7] bg-white text-xs font-bold text-[#544C42] hover:bg-[#FDFBF7] transition-all cursor-pointer"
                >
                  Clear Search
                </button>
              )}
              <button
                onClick={() => {
                  setEditingRecipe(null);
                  setIsAddModalOpen(true);
                }}
                className="px-5 py-2.5 rounded-2xl bg-[#FF5B26] text-white text-xs font-bold shadow-md shadow-[#FF5B26]/25 hover:bg-[#E84D1B] transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4 stroke-[2.5]" />
                <span>Import a Recipe</span>
              </button>
            </div>
          </div>
        )}

      </main>

      {/* ReciMe Footer */}
      <footer className="border-t border-[#F2ECE3] py-6 text-center text-xs text-[#857B6E]">
        <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p>
            Crafted for <strong className="font-serif font-bold text-[#221E1B]">Jasmine</strong> • 100% Free Kitchen Box
          </p>
          <div className="flex items-center gap-3 text-[11px] font-semibold text-[#A09587]">
            <span>📱 Add to Home Screen</span>
            <span>•</span>
            <span>Landscape & Portrait Ready</span>
          </div>
        </div>
      </footer>

      {/* Detail View Modal */}
      {activeRecipe && (
        <RecipeDetailModal
          recipe={activeRecipe}
          onClose={() => setActiveRecipe(null)}
          onEdit={(r) => {
            setEditingRecipe(r);
            setIsAddModalOpen(true);
          }}
          onDelete={handleDeleteRecipe}
          onToggleFavorite={handleToggleFavorite}
          onToggleWantToTry={handleToggleWantToTry}
          onUpdateRating={handleUpdateRating}
          onAddNote={handleAddNote}
          onDeleteNote={handleDeleteNote}
          onAddPhoto={handleAddPhoto}
          onRemovePhoto={handleRemovePhoto}
          onStartCooking={(r, s) => {
            setCookModeState({ recipe: r, servings: s });
          }}
        />
      )}

      {/* Cook Mode Modal */}
      {cookModeState && (
        <CookModeModal
          recipe={cookModeState.recipe}
          initialServings={cookModeState.servings}
          onClose={() => setCookModeState(null)}
        />
      )}

      {/* Import / Edit Recipe Modal */}
      {isAddModalOpen && (
        <AddRecipeModal
          initialRecipe={editingRecipe || undefined}
          onSave={handleSaveRecipe}
          onClose={() => {
            setIsAddModalOpen(false);
            setEditingRecipe(null);
          }}
        />
      )}

      {/* Welcome Tour / Guide Modal */}
      <WelcomeModal
        isOpen={isWelcomeOpen}
        onClose={() => setIsWelcomeOpen(false)}
      />

    </div>
  );
}

export default App;
