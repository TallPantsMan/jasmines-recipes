import React, { useState, useEffect } from 'react';
import { recipeImageSrc, generatedCover } from '../services/imageService';
import type { Recipe, JasmineNote } from '../types/recipe';
import {
  X, Heart, Star, Play, Plus, Trash2, Edit3,
  ExternalLink, Camera, Check, Timer, MessageSquare, Bookmark
} from 'lucide-react';

interface RecipeDetailModalProps {
  recipe: Recipe;
  onClose: () => void;
  onEdit: (recipe: Recipe) => void;
  onDelete: (id: string) => void;
  onToggleFavorite: (e: React.MouseEvent, id: string) => void;
  onToggleWantToTry: (e: React.MouseEvent, id: string) => void;
  onUpdateRating: (id: string, rating: number) => void;
  onAddNote: (recipeId: string, text: string) => Promise<JasmineNote>;
  onDeleteNote: (recipeId: string, noteId: string) => void;
  onAddPhoto: (recipeId: string, dataUrl: string) => void;
  onRemovePhoto: (recipeId: string, index: number) => void;
  onStartCooking: (recipe: Recipe, servings: number) => void;
}

export const RecipeDetailModal: React.FC<RecipeDetailModalProps> = ({
  recipe,
  onClose,
  onEdit,
  onDelete,
  onToggleFavorite,
  onToggleWantToTry,
  onUpdateRating,
  onAddNote,
  onDeleteNote,
  onAddPhoto,
  onRemovePhoto,
  onStartCooking
}) => {
  const [servings, setServings] = useState<number>(recipe.servings || 4);
  const [checkedIngredients, setCheckedIngredients] = useState<Record<string, boolean>>({});
  const [newNoteText, setNewNoteText] = useState('');
  const [isSubmittingNote, setIsSubmittingNote] = useState(false);
  const [activeTimerMinutes, setActiveTimerMinutes] = useState<number | null>(null);
  const [timerSecondsLeft, setTimerSecondsLeft] = useState<number>(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);

  // Lock body scroll when modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, []);

  // Timer countdown
  useEffect(() => {
    let interval: any = null;
    if (isTimerRunning && timerSecondsLeft > 0) {
      interval = setInterval(() => {
        setTimerSecondsLeft(prev => prev - 1);
      }, 1000);
    } else if (timerSecondsLeft === 0 && isTimerRunning) {
      setIsTimerRunning(false);
      alert(`⏰ Timer finished for ${recipe.title}!`);
    }
    return () => clearInterval(interval);
  }, [isTimerRunning, timerSecondsLeft, recipe.title]);

  const startTimer = (minutes: number) => {
    setActiveTimerMinutes(minutes);
    setTimerSecondsLeft(minutes * 60);
    setIsTimerRunning(true);
  };

  const formatTimer = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const toggleIngredient = (id: string) => {
    setCheckedIngredients(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleAddNoteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNoteText.trim()) return;
    setIsSubmittingNote(true);
    try {
      await onAddNote(recipe.id, newNoteText.trim());
      setNewNoteText('');
    } finally {
      setIsSubmittingNote(false);
    }
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (dataUrl) {
        onAddPhoto(recipe.id, dataUrl);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm flex items-stretch sm:items-center justify-center p-0 sm:p-4 landscape:p-2 sm:landscape:p-4 animate-in fade-in duration-200">
      
      <div className="bg-[#FDFBF7] w-full max-w-5xl h-[100dvh] sm:h-auto sm:rounded-[32px] shadow-2xl overflow-hidden flex flex-col sm:max-h-[94vh] border border-[#EFE7DE]">
        
        {/* ReciMe Styled Top Bar */}
        <div style={{ paddingTop: 'max(1.25rem, calc(env(safe-area-inset-top, 0px) + 0.75rem))' }} className="shrink-0 sticky top-0 z-20 bg-[#FDFBF7]/95 backdrop-blur-md px-4 sm:px-6 pb-3 border-b border-[#F0E8DC] flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* Want to Try Bookmark Button */}
            <button
              onClick={(e) => onToggleWantToTry(e, recipe.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-all cursor-pointer text-xs font-bold ${
                recipe.wantToTry
                  ? 'bg-[#FF5B26] text-white border-[#FF5B26] shadow-sm'
                  : 'bg-white hover:bg-[#F8F2EB] text-[#5A5246] border-[#EFE7DE]'
              }`}
              title={recipe.wantToTry ? 'Tagged as Want to Try (Click to remove)' : 'Tag as Want to Try'}
            >
              <Bookmark className={`w-3.5 h-3.5 ${recipe.wantToTry ? 'fill-current' : 'stroke-[2.2]'}`} />
              <span className="hidden sm:inline">{recipe.wantToTry ? 'Want to Try' : 'Want to Try?'}</span>
            </button>

            {/* Favorite Heart Button */}
            <button
              onClick={(e) => onToggleFavorite(e, recipe.id)}
              className={`p-2 rounded-full border transition-all cursor-pointer ${
                recipe.favorite
                  ? 'bg-[#FFEFEA] text-[#FF5B26] border-[#FFCBBF] shadow-xs'
                  : 'bg-white hover:bg-gray-50 text-gray-400 border-gray-200'
              }`}
              title="Toggle Favorite"
            >
              <Heart className={`w-4 h-4 sm:w-5 sm:h-5 ${recipe.favorite ? 'fill-current' : 'stroke-[2.2]'}`} />
            </button>

            {/* Rating Stars */}
            <div className="flex items-center gap-1 bg-white px-2.5 py-1.5 rounded-full border border-[#EFE7DE] shadow-xs">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  onClick={() => onUpdateRating(recipe.id, star === recipe.rating ? 0 : star)}
                  className="p-0.5 text-amber-400 hover:scale-110 transition-transform cursor-pointer"
                >
                  <Star className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${star <= recipe.rating ? 'fill-current' : 'text-gray-200'}`} />
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onEdit(recipe)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-2xl bg-white hover:bg-[#F7F2EA] text-[#423B33] border border-[#E8DFC9] text-xs font-bold shadow-xs transition-all cursor-pointer"
            >
              <Edit3 className="w-3.5 h-3.5 text-[#FF5B26]" />
              <span>Edit</span>
            </button>
            <button
              onClick={() => {
                if (confirm(`Are you sure you want to delete "${recipe.title}"?`)) {
                  onDelete(recipe.id);
                  onClose();
                }
              }}
              className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-2xl transition-all cursor-pointer"
              title="Delete Recipe"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-2 bg-white hover:bg-gray-100 text-[#423B33] rounded-full border border-gray-200 shadow-xs transition-all cursor-pointer"
            >
              <X className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Body: Dual columns in Landscape, stacked in Portrait */}
        <div style={{ paddingBottom: 'max(1.5rem, calc(env(safe-area-inset-bottom, 0px) + 1rem))' }} className="overflow-y-auto overscroll-contain flex-1 min-h-0 p-4 sm:p-6 lg:p-8 space-y-6">
          
          {/* Active Kitchen Timer */}
          {activeTimerMinutes !== null && (
            <div className="bg-[#FFEFEA] border border-[#FFD5C8] rounded-2xl p-3.5 sm:p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-[#FF5B26] text-white rounded-xl animate-pulse">
                  <Timer className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs font-bold text-[#FF5B26] uppercase tracking-wider">Kitchen Timer</div>
                  <div className="text-xl sm:text-2xl font-mono font-bold text-[#221E1B]">
                    {formatTimer(timerSecondsLeft)}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsTimerRunning(!isTimerRunning)}
                  className="px-3.5 py-1.5 bg-white text-xs font-bold rounded-xl border border-[#FFC3B2] text-[#FF5B26] shadow-xs cursor-pointer"
                >
                  {isTimerRunning ? 'Pause' : 'Resume'}
                </button>
                <button
                  onClick={() => { setActiveTimerMinutes(null); setIsTimerRunning(false); }}
                  className="px-3 py-1.5 bg-[#FFD5C8] hover:bg-[#FFC3B2] text-xs font-bold rounded-xl text-[#A6350F] cursor-pointer"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          {/* TWO MAIN PANELS: Side-by-side in Landscape / Desktop */}
          <div className="grid grid-cols-1 landscape:grid-cols-12 md:grid-cols-12 gap-6 lg:gap-8 items-start">
            
            {/* LEFT PANEL: Hero photo, Title, Metadata, Jasmine's Diary */}
            <div className="landscape:col-span-5 md:col-span-5 space-y-6">
              
              {/* Hero Image */}
              <div className="relative rounded-[24px] overflow-hidden aspect-[4/3] bg-[#F5EFE7] shadow-sm">
                <img
 src={recipeImageSrc(recipe)}
 alt={recipe.title}
 className="w-full h-full object-cover"
 onError={(e) => { const fb = generatedCover(recipe); if (e.currentTarget.src !== fb) e.currentTarget.src = fb; }}
 />
                <div className="absolute top-3 left-3 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-white/95 text-[#221E1B] shadow-sm backdrop-blur-md">
                  {recipe.sourceType}
                </div>
              </div>

              {/* Title & Metadata */}
              <div>
                <div className="flex flex-wrap gap-1.5 mb-2.5">
                  {recipe.categories.map((cat, idx) => (
                    <span key={idx} className="text-xs font-bold px-3 py-0.5 rounded-full bg-[#FFEFEA] text-[#FF5B26]">
                      {cat}
                    </span>
                  ))}
                  {recipe.tags.map((tag, idx) => (
                    <span key={idx} className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-[#F5EFE6] text-[#6E6457]">
                      #{tag}
                    </span>
                  ))}
                </div>

                <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#221E1B] leading-tight">
                  {recipe.title}
                </h1>

                {recipe.sourceName && (
                  <div className="mt-1.5 text-xs sm:text-sm text-[#7D7366] flex items-center gap-1.5 font-medium">
                    <span>Source:</span>
                    <span className="font-bold text-[#221E1B]">{recipe.sourceName}</span>
                    {recipe.sourceUrl && (
                      <a
                        href={recipe.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[#FF5B26] hover:text-[#E84D1B] inline-flex items-center gap-0.5 ml-1 font-bold"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                )}

                {recipe.description && (
                  <p className="mt-2.5 text-xs sm:text-sm text-[#544C42] leading-relaxed">
                    {recipe.description}
                  </p>
                )}

                {/* Quick Info Grid */}
                <div className="mt-4 grid grid-cols-3 gap-2 p-3 bg-white rounded-2xl border border-[#EFE7DE] text-center shadow-xs">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-[#8A8072] font-bold">Prep</div>
                    <div className="text-xs sm:text-sm font-bold text-[#221E1B]">
                      {recipe.prepTimeMinutes ? `${recipe.prepTimeMinutes}m` : '—'}
                    </div>
                  </div>
                  <div className="border-x border-[#F5EDE3]">
                    <div className="text-[10px] uppercase tracking-wider text-[#8A8072] font-bold">Cook</div>
                    <div className="text-xs sm:text-sm font-bold text-[#221E1B]">
                      {recipe.cookTimeMinutes ? `${recipe.cookTimeMinutes}m` : '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-[#8A8072] font-bold">Level</div>
                    <div className="text-xs sm:text-sm font-bold text-[#221E1B]">
                      {recipe.difficulty || 'Easy'}
                    </div>
                  </div>
                </div>

                {/* ReciMe Signature "Start Cooking Mode" Button */}
                <button
                  onClick={() => onStartCooking(recipe, servings)}
                  className="w-full mt-4 flex items-center justify-center gap-2 py-3.5 px-6 rounded-2xl bg-[#FF5B26] hover:bg-[#E84D1B] text-white font-bold text-sm sm:text-base shadow-lg shadow-[#FF5B26]/30 active:scale-98 transition-all cursor-pointer"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>Start Cooking Mode</span>
                </button>
              </div>

              {/* JASMINE'S NOTES (ReciMe Cozy Card Style) */}
              <div className="bg-[#FFF8F5] rounded-3xl p-4 sm:p-5 border-2 border-[#FED7C7] shadow-xs">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-xl bg-[#FFEFEA] text-[#FF5B26]">
                      <MessageSquare className="w-4 h-4" />
                    </div>
                    <h3 className="font-serif text-base font-bold text-[#221E1B]">
                      Jasmine's Notes
                    </h3>
                  </div>
                  <span className="text-[11px] font-semibold text-[#FF5B26] bg-white px-2 py-0.5 rounded-full border border-[#FED7C7]">
                    Diary
                  </span>
                </div>

                <form onSubmit={handleAddNoteSubmit} className="mb-3">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newNoteText}
                      onChange={(e) => setNewNoteText(e.target.value)}
                      placeholder="Add personal tweak or observation..."
                      className="flex-1 px-3.5 py-2 text-xs bg-white border border-[#EEDBCA] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#FF5B26]/20 focus:border-[#FF5B26] text-[#221E1B]"
                    />
                    <button
                      type="submit"
                      disabled={isSubmittingNote || !newNoteText.trim()}
                      className="px-3.5 py-2 rounded-xl bg-[#FF5B26] hover:bg-[#E84D1B] disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1 shadow-xs cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                      <span>Add</span>
                    </button>
                  </div>
                </form>

                {recipe.jasmineNotes && recipe.jasmineNotes.length > 0 ? (
                  <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                    {recipe.jasmineNotes.map((note) => (
                      <div
                        key={note.id}
                        className="group bg-white p-3 rounded-2xl border border-[#F4E3D8] flex items-start justify-between gap-2 shadow-xs"
                      >
                        <div>
                          <p className="text-xs text-[#2D2721] font-medium leading-relaxed">
                            "{note.text}"
                          </p>
                          <span className="text-[10px] text-[#9A8F82] mt-0.5 block font-semibold">
                            {note.date}
                          </span>
                        </div>
                        <button
                          onClick={() => onDeleteNote(recipe.id, note.id)}
                          className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500 transition-opacity cursor-pointer"
                          title="Delete Note"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center py-2 text-[11px] text-[#9E9486] italic">
                    No personal notes yet. Jot down ingredient tweaks or family feedback!
                  </p>
                )}
              </div>

              {/* USER PHOTOS & COOKBOOK SNAPS */}
              <div className="bg-white rounded-3xl p-4 sm:p-5 border border-[#EFE7DE] shadow-xs">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Camera className="w-4 h-4 text-[#FF5B26]" />
                    <h3 className="font-serif text-base font-bold text-[#221E1B]">
                      My Cooks & Snaps
                    </h3>
                  </div>
                  
                  <label className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-[#FFEFEA] hover:bg-[#FFD5C8] text-[#FF5B26] text-xs font-bold cursor-pointer transition-all">
                    <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span>Upload</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handlePhotoUpload}
                      className="hidden"
                    />
                  </label>
                </div>

                {recipe.userPhotos && recipe.userPhotos.length > 0 ? (
                  <div className="grid grid-cols-3 gap-2">
                    {recipe.userPhotos.map((photo, idx) => (
                      <div key={idx} className="relative aspect-square rounded-2xl overflow-hidden group border border-[#EAE1D5]">
                        <img src={photo} alt={`Cook snapshot ${idx + 1}`} className="w-full h-full object-cover" />
                        <button
                          onClick={() => onRemovePhoto(recipe.id, idx)}
                          className="absolute top-1.5 right-1.5 p-1 bg-black/60 hover:bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                          title="Remove photo"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-4 rounded-2xl bg-[#FDFBF7] border border-dashed border-[#DFD5C7] text-center text-xs text-[#857B6E]">
                    Snap a photo of your finished plate or cookbook page!
                  </div>
                )}
              </div>

            </div>

            {/* RIGHT PANEL: Ingredients & Method */}
            <div className="landscape:col-span-7 md:col-span-7 space-y-6">
              
              {/* Ingredients Card */}
              <div className="bg-white rounded-3xl p-4 sm:p-6 border border-[#EFE7DE] shadow-xs">
                <div className="flex items-center justify-between pb-3.5 mb-3.5 border-b border-[#F5EFE8]">
                  <div>
                    <h3 className="font-serif text-lg font-bold text-[#221E1B]">
                      Ingredients
                    </h3>
                    <span className="text-xs text-[#8A8072]">
                      Tap to check off while cooking
                    </span>
                  </div>

                  {/* ReciMe Style Servings Stepper */}
                  <div className="flex items-center gap-2 bg-[#F8F2EA] px-3 py-1 rounded-full text-xs font-bold text-[#221E1B]">
                    <button
                      onClick={() => setServings(Math.max(1, servings - 1))}
                      className="w-5 h-5 rounded-full bg-white flex items-center justify-center hover:bg-gray-100 active:scale-95 cursor-pointer shadow-xs"
                    >
                      -
                    </button>
                    <span>{servings} servings</span>
                    <button
                      onClick={() => setServings(servings + 1)}
                      className="w-5 h-5 rounded-full bg-white flex items-center justify-center hover:bg-gray-100 active:scale-95 cursor-pointer shadow-xs"
                    >
                      +
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  {recipe.ingredients.map((ing) => {
                    const isChecked = !!checkedIngredients[ing.id];
                    return (
                      <div
                        key={ing.id}
                        onClick={() => toggleIngredient(ing.id)}
                        className={`flex items-start gap-3 p-2.5 rounded-2xl transition-all cursor-pointer select-none text-xs sm:text-sm ${
                          isChecked
                            ? 'bg-[#F7F2EB] text-[#A69C8F] line-through'
                            : 'hover:bg-[#FFF7F4] text-[#2C2620]'
                        }`}
                      >
                        {/* ReciMe Tactile Orange Checkbox */}
                        <div className={`mt-0.5 w-4 h-4 rounded-md border flex items-center justify-center transition-all shrink-0 ${
                          isChecked
                            ? 'bg-[#FF5B26] border-[#FF5B26] text-white'
                            : 'border-[#D4C9BC] bg-white'
                        }`}>
                          {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                        </div>
                        <span className="font-medium leading-snug">{ing.raw}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Instructions Card */}
              <div className="bg-white rounded-3xl p-4 sm:p-6 border border-[#EFE7DE] shadow-xs">
                <div className="pb-3.5 mb-4 border-b border-[#F5EFE8]">
                  <h3 className="font-serif text-lg font-bold text-[#221E1B]">
                    Instructions
                  </h3>
                  <span className="text-xs text-[#8A8072]">
                    Step-by-step preparation
                  </span>
                </div>

                <div className="space-y-5">
                  {recipe.instructions.map((step) => (
                    <div key={step.id} className="flex items-start gap-3.5">
                      <div className="w-7 h-7 rounded-2xl bg-[#FFEFEA] text-[#FF5B26] font-bold text-xs flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
                        {step.stepNumber}
                      </div>
                      <div className="flex-1">
                        <p className="text-xs sm:text-sm text-[#2C2620] leading-relaxed font-medium">
                          {step.text}
                        </p>

                        {step.timerMinutes && (
                          <div className="mt-2.5">
                            <button
                              onClick={() => startTimer(step.timerMinutes!)}
                              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-[#FFEFEA] hover:bg-[#FFD5C8] border border-[#FFD5C8] text-[#FF5B26] text-xs font-bold transition-all cursor-pointer"
                            >
                              <Timer className="w-3.5 h-3.5" />
                              <span>Start {step.timerMinutes}m Timer</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>

          </div>

        </div>

      </div>

    </div>
  );
};
