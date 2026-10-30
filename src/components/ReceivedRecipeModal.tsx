import React from 'react';
import type { Recipe } from '../types/recipe';
import { recipeImageSrc, generatedCover } from '../services/imageService';
import { Check, Clock, X } from 'lucide-react';
import { formatMinutes } from '../utils/formatTime';

interface ReceivedRecipeModalProps {
  recipe: Recipe;
  alreadyHave: boolean;
  onSave: () => void;
  onDismiss: () => void;
}

/** Shown when a recipe code is pasted into Import: a preview, with one tap to keep it. */
export const ReceivedRecipeModal: React.FC<ReceivedRecipeModalProps> = ({ recipe, alreadyHave, onSave, onDismiss }) => {
  const totalTime = (recipe.prepTimeMinutes || 0) + (recipe.cookTimeMinutes || 0);

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-6">
      <div className="bg-[#FDFBF7] w-full sm:max-w-md rounded-t-[28px] sm:rounded-[28px] overflow-hidden shadow-2xl max-h-[92vh] flex flex-col">
        <div className="relative aspect-[16/9] bg-[#F5EFE7] shrink-0">
          <img
            src={recipeImageSrc(recipe)}
            alt={recipe.title}
            className="w-full h-full object-cover"
            onError={(e) => { const fb = generatedCover(recipe); if (e.currentTarget.src !== fb) e.currentTarget.src = fb; }}
          />
          <button
            onClick={onDismiss}
            aria-label="Close"
            className="absolute top-3 right-3 p-2 rounded-full bg-black/40 text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-3 overflow-y-auto">
          <p className="text-[11px] font-bold uppercase tracking-wider text-[#FF5B26]">A recipe was sent to you</p>
          <h2 className="font-serif text-xl font-bold text-[#221E1B] leading-snug">{recipe.title}</h2>
          {recipe.sourceName && <p className="text-xs text-[#82786D]">by {recipe.sourceName}</p>}
          {recipe.description && <p className="text-sm text-[#61584D] leading-relaxed line-clamp-3">{recipe.description}</p>}
          <div className="flex items-center gap-4 text-xs font-semibold text-[#3D372F]">
            {totalTime > 0 && (
              <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5 text-[#FF5B26]" />{formatMinutes(totalTime)}</span>
            )}
            <span>{recipe.ingredients.length} ingredients</span>
            <span>{recipe.instructions.length} steps</span>
          </div>

          {alreadyHave && (
            <p className="p-3 bg-amber-50 text-amber-900 text-xs rounded-2xl border border-amber-200">
              You already have a recipe like this in your box. You can still save another copy.
            </p>
          )}

          <div className="flex gap-3 pt-1">
            <button
              onClick={onDismiss}
              className="flex-1 py-3 rounded-2xl border border-[#DFD5C7] bg-white text-sm font-bold text-[#544C42] cursor-pointer"
            >
              Not now
            </button>
            <button
              onClick={onSave}
              className="flex-[2] py-3 rounded-2xl bg-[#FF5B26] hover:bg-[#E84D1B] text-white text-sm font-bold shadow-md shadow-[#FF5B26]/25 flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Check className="w-4 h-4 stroke-[2.5]" />
              Save to my recipes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

