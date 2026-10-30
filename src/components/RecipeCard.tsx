import React from 'react';
import { recipeImageSrc, generatedCover } from '../services/imageService';
import type { Recipe } from '../types/recipe';
import { Heart, Clock, BookOpen, Globe, MessageSquare, Star, Utensils, Bookmark, Send, Play } from 'lucide-react';
import { InstagramIcon } from './Icons';
import { formatMinutes } from '../utils/formatTime';

interface RecipeCardProps {
  recipe: Recipe;
  onSelect: (recipe: Recipe) => void;
  onToggleFavorite: (e: React.MouseEvent, id: string) => void;
  onToggleWantToTry: (e: React.MouseEvent, id: string) => void;
  onSend: (recipe: Recipe) => void;
}

export const RecipeCard: React.FC<RecipeCardProps> = ({
  recipe,
  onSelect,
  onToggleFavorite,
  onToggleWantToTry,
  onSend
}) => {
  const getSourceBadge = () => {
    switch (recipe.sourceType) {
      case 'instagram':
        return (
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-white/95 text-[#E1306C] shadow-sm backdrop-blur-md">
            <InstagramIcon className="w-3 h-3" />
            <span>Instagram</span>
          </span>
        );
      case 'video':
        return (
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-white/95 text-sky-700 shadow-sm backdrop-blur-md">
            <Play className="w-3 h-3" />
            <span>Video</span>
          </span>
        );
      case 'cookbook':
        return (
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-white/95 text-amber-800 shadow-sm backdrop-blur-md">
            <BookOpen className="w-3 h-3" />
            <span>Cookbook</span>
          </span>
        );
      case 'website':
        return (
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-white/95 text-[#FF5B26] shadow-sm backdrop-blur-md">
            <Globe className="w-3 h-3" />
            <span className="truncate max-w-[110px]">{recipe.sourceName || 'Website'}</span>
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-white/95 text-emerald-800 shadow-sm backdrop-blur-md">
            <Utensils className="w-3 h-3" />
            <span>Custom</span>
          </span>
        );
    }
  };

  const totalTime = (recipe.prepTimeMinutes || 0) + (recipe.cookTimeMinutes || 0);

  return (
    <div
      onClick={() => onSelect(recipe)}
      className="group bg-white rounded-[26px] overflow-hidden border border-[#EFE7DE] hover:border-[#DDCFC0] shadow-sm hover:shadow-xl hover:shadow-black/5 transition-all duration-300 flex flex-col cursor-pointer hover:-translate-y-1"
    >
      {/* Cover Image & ReciMe Floating Badges */}
      <div className="relative aspect-[16/11] sm:aspect-[4/3] w-full overflow-hidden bg-[#F5EFE7]">
        <img
 src={recipeImageSrc(recipe)}
 alt={recipe.title}
 className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
 loading="lazy"
 onError={(e) => { const fb = generatedCover(recipe); if (e.currentTarget.src !== fb) e.currentTarget.src = fb; }}
 />

        {/* Top-Left Source Pill */}
        <div className="absolute top-3 left-3 flex items-center gap-1.5">
          {getSourceBadge()}
          {recipe.wantToTry && (
            <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-[#FF5B26] text-white shadow-sm backdrop-blur-md">
              <Bookmark className="w-2.5 h-2.5 fill-current" />
              <span>Want to Try</span>
            </span>
          )}
        </div>

        {/* Top-Right Action Buttons: Bookmark (Want to try) & Favorite (Heart) */}
        <div className="absolute top-3 right-3 flex items-center gap-1.5">
          {/* Want to Try Button */}
          <button
            onClick={(e) => onToggleWantToTry(e, recipe.id)}
            className={`p-2 rounded-full backdrop-blur-md transition-all active:scale-90 cursor-pointer ${
              recipe.wantToTry
                ? 'bg-white text-[#FF5B26] shadow-md'
                : 'bg-black/30 hover:bg-black/50 text-white'
            }`}
            title={recipe.wantToTry ? 'Tagged as Want to Try (Click to remove)' : 'Mark as Want to Try'}
          >
            <Bookmark className={`w-3.5 h-3.5 ${recipe.wantToTry ? 'fill-current' : 'stroke-[2.2]'}`} />
          </button>

          {/* Favorite Heart Button */}
          <button
            onClick={(e) => onToggleFavorite(e, recipe.id)}
            className={`p-2 rounded-full backdrop-blur-md transition-all active:scale-90 cursor-pointer ${
              recipe.favorite
                ? 'bg-white text-red-500 shadow-md'
                : 'bg-black/30 hover:bg-black/50 text-white'
            }`}
            title={recipe.favorite ? 'Remove from favorites' : 'Add to favorites'}
          >
            <Heart className={`w-3.5 h-3.5 ${recipe.favorite ? 'fill-current' : 'stroke-[2.2]'}`} />
          </button>
        </div>

        {/* User Photos Badge */}
        {recipe.userPhotos && recipe.userPhotos.length > 0 && (
          <div className="absolute bottom-3 right-3 px-2.5 py-1 rounded-full text-[11px] font-bold bg-black/70 text-white backdrop-blur-md flex items-center gap-1">
            <span>📸</span>
            <span>{recipe.userPhotos.length}</span>
          </div>
        )}
      </div>

      {/* Card Body */}
      <div className="p-4 sm:p-5 flex-1 flex flex-col justify-between">
        <div>
          {/* Tags */}
          <div className="flex flex-wrap gap-1.5 mb-2">
            {recipe.tags.slice(0, 2).map((t, i) => (
              <span key={i} className="text-[11px] font-semibold text-[#786E62] bg-[#F7F2EC] px-2.5 py-0.5 rounded-full">
                #{t}
              </span>
            ))}
          </div>

          {/* Title in ReciMe Fraunces font */}
          <h3 className="font-serif text-base sm:text-lg font-bold text-[#221E1B] group-hover:text-[#FF5B26] transition-colors line-clamp-2 leading-snug">
            {recipe.title}
          </h3>

          {/* Source Author */}
          {recipe.sourceName && (
            <p className="text-xs text-[#82786D] mt-1 line-clamp-1 font-medium">
              by <span className="text-[#3D372F]">{recipe.sourceName}</span>
            </p>
          )}

          {/* Description */}
          {recipe.description && (
            <p className="text-xs text-[#61584D] mt-2 line-clamp-2 leading-relaxed">
              {recipe.description}
            </p>
          )}
        </div>

        {/* Card Footer: Total time, ingredient count, Jasmine note pill */}
        <div className="pt-3.5 mt-3.5 border-t border-[#F5EFE8] flex items-center justify-between text-xs text-[#7A7165]">
          <div className="flex items-center gap-3">
            {totalTime > 0 && (
              <span className="flex items-center gap-1 font-bold text-[#3D372F]">
                <Clock className="w-3.5 h-3.5 text-[#FF5B26]" />
                {formatMinutes(totalTime)}
              </span>
            )}
            <span className="font-medium text-[#82786D]">{recipe.ingredients.length} items</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSend(recipe);
              }}
              className="flex items-center gap-1 font-bold text-[#FF5B26] hover:text-[#E84D1B] transition-colors cursor-pointer"
              title="Send this recipe"
            >
              <Send className="w-3.5 h-3.5" />
              Send
            </button>
          </div>

          <div className="flex items-center gap-2">
            {/* Jasmine Note Pill */}
            {recipe.jasmineNotes && recipe.jasmineNotes.length > 0 && (
              <span className="flex items-center gap-1 text-[11px] font-bold text-[#FF5B26] bg-[#FFEFEA] px-2.5 py-0.5 rounded-full" title="Jasmine's Notes">
                <MessageSquare className="w-3 h-3 text-[#FF5B26]" />
                <span>{recipe.jasmineNotes.length}</span>
              </span>
            )}

            {/* Star Rating */}
            {recipe.rating > 0 && (
              <div className="flex items-center gap-0.5 text-amber-500 font-bold">
                <Star className="w-3.5 h-3.5 fill-current" />
                <span>{recipe.rating}</span>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
