import React, { useState, useEffect, useMemo, useRef } from 'react';
import { fetchInstagramCover } from './services/imageService';
import type { Recipe, FilterCategory, JasmineNote } from './types/recipe';
import { RecipeService } from './services/recipeService';
import { signOut } from './services/auth';
import { syncProfile, rememberDeletion } from './services/syncService';
import { estimateNutrition } from './services/nutritionService';
import { setProfile, type ProfileName } from './services/profile';
import { backupRecipe, backupAll, flushBackupQueue } from './services/backupService';
import {
  sendRecipe, shareApp, recipeFromCode, hasShortCodeReady, prepareShortCodes, type ShareOutcome
} from './services/shareService';
import { notify, askConfirm } from './services/dialog';
import { DialogHost } from './components/DialogHost';
import { ReceivedRecipeModal } from './components/ReceivedRecipeModal';
import { Navbar } from './components/Navbar';
import { CategoryFilterBar } from './components/CategoryFilterBar';
import { RecipeCard } from './components/RecipeCard';
import { RecipeDetailModal } from './components/RecipeDetailModal';
import { CookModeModal } from './components/CookModeModal';
import { AddRecipeModal } from './components/AddRecipeModal';
import { WelcomeModal } from './components/WelcomeModal';
import { Plus, UtensilsCrossed } from 'lucide-react';

export function App({ profile }: { profile: ProfileName }) {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<FilterCategory>('All');
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [backupStatus, setBackupStatus] = useState('');
  const [toast, setToast] = useState('');
  const [incomingRecipe, setIncomingRecipe] = useState<Recipe | null>(null);

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
      } catch (err) {
        console.error('Failed to initialize recipes:', err);
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, []);

  // Profile sync: the cloud copy of this person's recipes and this device's copy are kept the same
  const [syncState, setSyncState] = useState<'idle' | 'syncing' | 'ok' | 'error'>('idle');
  const runSync = async () => {
    setSyncState('syncing');
    try {
      const { changed } = await syncProfile(profile);
      if (changed) {
        const fresh = await RecipeService.getAllRecipes();
        setRecipes(fresh);
        setActiveRecipe(prev => (prev ? fresh.find(r => r.id === prev.id) || null : prev));
      }
      setSyncState('ok');
    } catch (err) {
      console.warn('Sync failed:', err);
      setSyncState('error');
    }
  };
  const runSyncRef = useRef(runSync);
  runSyncRef.current = runSync;

  // Once the box has opened, and again whenever the app comes back into view
  useEffect(() => {
    if (isLoading) return;
    runSyncRef.current();
    const onVisible = () => { if (document.visibilityState === 'visible') runSyncRef.current(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [isLoading]);

  // A few seconds after any change on this device, send it to the cloud copy
  useEffect(() => {
    if (isLoading) return;
    const t = setTimeout(() => runSyncRef.current(), 4000);
    return () => clearTimeout(t);
  }, [recipes, isLoading]);

  const handleSwitchProfile = async () => {
    if (!(await askConfirm(`Switch to a different profile? Your recipes stay safe in ${profile}'s profile and come back when you pick ${profile} again.`, 'Switch'))) return;
    try {
      await syncProfile(profile);
    } catch {
      if (!(await askConfirm("Couldn't save your latest changes to the cloud (no connection?). Anything not yet synced on this device will be lost if you switch now. Switch anyway?", 'Switch anyway'))) return;
    }
    await RecipeService.clearLocal();
    setProfile(null);
    window.location.reload();
  };

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
      if (selectedFolder && !recipe.folders?.includes(selectedFolder)) return false;
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
  }, [recipes, selectedCategory, selectedFolder, searchQuery]);

  // Every folder name in use, A to Z
  const folderNames = useMemo(() => {
    const names = new Set<string>();
    recipes.forEach(r => r.folders?.forEach(f => names.add(f)));
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [recipes]);

  // If the folder being viewed no longer has any recipes, go back to everything
  useEffect(() => {
    if (selectedFolder && !folderNames.includes(selectedFolder)) setSelectedFolder(null);
  }, [folderNames, selectedFolder]);

  const handleSetFolders = async (id: string, folders: string[]) => {
    await RecipeService.setFolders(id, folders);
    setRecipes(prev => prev.map(r => r.id === id ? { ...r, folders } : r));
    setActiveRecipe(prev => (prev && prev.id === id ? { ...prev, folders } : prev));
  };

  /** Works out calories and macros for a recipe and saves them. Returns false if the AI couldn't do it right now. */
  const handleEstimateNutrition = async (recipe: Recipe): Promise<boolean> => {
    const nutrition = await estimateNutrition(recipe);
    if (!nutrition) return false;
    await RecipeService.setNutrition(recipe.id, nutrition);
    setRecipes(prev => prev.map(r => r.id === recipe.id ? { ...r, nutrition } : r));
    setActiveRecipe(prev => (prev && prev.id === recipe.id ? { ...prev, nutrition } : prev));
    return true;
  };

  const handleDeleteFolder = async (name: string) => {
    if (!(await askConfirm(`Delete the folder "${name}"? The recipes inside stay in your box, they just leave this folder.`, 'Delete folder'))) return;
    for (const r of recipes) {
      if (r.folders?.includes(name)) await handleSetFolders(r.id, r.folders.filter(f => f !== name));
    }
    setSelectedFolder(null);
  };

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

  // Retry any backups that couldn't be sent earlier (no signal, etc.)
  useEffect(() => {
    void flushBackupQueue();
  }, []);

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(''), 3500);
  };

  const reportShare = (outcome: ShareOutcome, copiedMessage: string) => {
    if (outcome === 'copied') showToast(copiedMessage);
    else if (outcome === 'failed') showToast("Couldn't share from this browser. Try again from your phone.");
  };

  const handleSendRecipe = async (recipe: Recipe) => {
    // Short codes are normally made ahead of time; when this one isn't ready yet, say so instead of looking frozen
    if (!hasShortCodeReady(recipe)) setToast('Getting the share code ready…');
    const outcome = await sendRecipe(recipe);
    setToast('');
    reportShare(outcome, 'Recipe code copied. Paste it into a message to send it.');
  };

  // Get short codes ready in the background so Send opens straight away
  useEffect(() => {
    if (isLoading || recipes.length === 0) return;
    const timer = setTimeout(() => void prepareShortCodes(recipes), 3000);
    return () => clearTimeout(timer);
  }, [recipes, isLoading]);

  const handleShareApp = async () => {
    reportShare(await shareApp(), 'App link copied.');
  };

  // A recipe code pasted into the Import box: show a preview and offer to save it
  const handlePastedCode = async (text: string): Promise<boolean> => {
    const recipe = await recipeFromCode(text);
    if (!recipe) return false;
    setIncomingRecipe(recipe);
    return true;
  };

  const handleSaveIncoming = async () => {
    if (!incomingRecipe) return;
    const saved = incomingRecipe;
    setIncomingRecipe(null);
    await handleSaveRecipe(saved);
    showToast(`Saved "${saved.title}" to your recipes`);
  };

  const dismissIncoming = () => setIncomingRecipe(null);
  const alreadyHaveIncoming =
    !!incomingRecipe &&
    recipes.some(
      (r) =>
        (incomingRecipe.sourceUrl && r.sourceUrl === incomingRecipe.sourceUrl) ||
        r.title.trim().toLowerCase() === incomingRecipe.title.trim().toLowerCase()
    );

  const handleBackupNow = async () => {
    setBackupStatus('Backing up…');
    const result = await backupAll(recipes);
    setBackupStatus(result.ok ? `Backed up ${result.sent} ✓` : 'Backup failed');
    if (!result.ok) notify(result.reason || 'Backup failed.');
    setTimeout(() => setBackupStatus(''), 4000);
  };

  const handleSaveRecipe = async (recipe: Recipe) => {
    await RecipeService.saveRecipe(recipe);
    backupRecipe(recipe);
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
    rememberDeletion(profile, id);
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
          notify(`Successfully imported ${count} recipes!`);
        } catch {
          notify('Failed to import backup file. Check file format.');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  return (
    <div className="min-h-screen bg-[#FDFBF7] flex flex-col text-[#221E1B]">
      <DialogHost />

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
        onShowWelcome={() => setIsWelcomeOpen(true)}
        totalCount={recipes.length}
        profile={profile}
      />

      {/* ReciMe Pill Categories */}
      <CategoryFilterBar
        selectedCategory={selectedCategory}
        onSelectCategory={(cat) => { setSelectedCategory(cat); setSelectedFolder(null); }}
        folders={folderNames}
        selectedFolder={selectedFolder}
        onSelectFolder={(f) => { setSelectedFolder(f); setSelectedCategory('All'); }}
        onDeleteFolder={handleDeleteFolder}
        favoritesCount={favoritesCount}
        wantToTryCount={wantToTryCount}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-4 sm:py-6">
        
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 text-[#8C8274] gap-3">
            <div className="w-8 h-8 border-3 border-[#FF5B26] border-t-transparent rounded-full animate-spin"></div>
            <p className="text-sm font-semibold">Opening your Recipe Box...</p>
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
                onSend={handleSendRecipe}
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
                {recipes.length === 0 ? 'Your recipe box is empty' : 'No recipes found'}
              </h3>
              <p className="text-xs sm:text-sm text-[#7D7366] mt-1">
                {recipes.length === 0
                  ? 'Tap "Import Recipe" at the top to add your first one.'
                  : searchQuery
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
          <p className="font-serif font-bold text-[#221E1B]">
            For Jasmine, Love Alex
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-4 sm:gap-x-3 gap-y-1.5 text-[11px] font-semibold text-[#A09587] [&>*]:whitespace-nowrap">
            <span>📱 Add to Home Screen</span>
            <span className="hidden sm:inline">•</span>
            <button onClick={handleShareApp} className="hover:text-[#FF5B26] transition-colors cursor-pointer">Share app</button>
            <span className="hidden sm:inline">•</span>
            <button
              onClick={handleBackupNow}
              disabled={backupStatus === 'Backing up…'}
              className="hover:text-[#FF5B26] transition-colors cursor-pointer"
            >
              {backupStatus || 'Back up now'}
            </button>
            <span className="hidden sm:inline">•</span>
            <span title={syncState === 'error' ? "Couldn't reach the cloud copy. Changes will sync when you're back online." : 'Your recipes are saved to your profile'}>
              {syncState === 'syncing' ? 'Syncing…' : syncState === 'error' ? 'Not synced' : '✓ Synced'}
            </span>
            <span className="hidden sm:inline">•</span>
            <button onClick={handleSwitchProfile} className="hover:text-[#FF5B26] transition-colors cursor-pointer">{profile}: switch</button>
            <span className="hidden sm:inline">•</span>
            <button onClick={signOut} className="hover:text-[#FF5B26] transition-colors cursor-pointer">Sign out</button>
          </div>
        </div>
      </footer>

      {incomingRecipe && (
        <ReceivedRecipeModal
          recipe={incomingRecipe}
          alreadyHave={alreadyHaveIncoming}
          onSave={handleSaveIncoming}
          onDismiss={dismissIncoming}
        />
      )}

      {toast && (
        <div
          role="status"
          className="fixed left-1/2 -translate-x-1/2 bottom-6 z-[70] max-w-[90vw] px-4 py-3 rounded-2xl bg-[#221E1B] text-white text-xs font-semibold shadow-xl"
        >
          {toast}
        </div>
      )}

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
          onEstimateNutrition={handleEstimateNutrition}
          allFolders={folderNames}
          onSetFolders={handleSetFolders}
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
          onPasteRecipeCode={handlePastedCode}
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

