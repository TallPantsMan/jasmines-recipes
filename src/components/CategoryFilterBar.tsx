import React from 'react';
import type { FilterCategory } from '../types/recipe';
import { Heart, BookOpen, Clock, Utensils, Cake, Salad, Sparkles, Bookmark } from 'lucide-react';
import { InstagramIcon } from './Icons';

interface CategoryFilterBarProps {
  selectedCategory: FilterCategory;
  onSelectCategory: (cat: FilterCategory) => void;
  favoritesCount: number;
  wantToTryCount: number;
}

const CATEGORIES: { id: FilterCategory; label: string; icon: React.ReactNode }[] = [\n  { id: 'All', label: 'All Recipes', icon: <Utensils className="w-3.5 h-3.5" /> },\n  { id: 'Want to Try', label: 'Want to Try', icon: <Bookmark className="w-3.5 h-3.5 fill-current" /> },\n  { id: 'Favorites', label: 'Favorites', icon: <Heart className="w-3.5 h-3.5 fill-current" /> },\n  { id: 'Dinners', label: 'Dinners', icon: <Sparkles className="w-3.5 h-3.5" /> },\n  { id: 'Quick (<30m)', label: 'Quick (<30m)', icon: <Clock className="w-3.5 h-3.5" /> },\n  { id: 'Instagram', label: 'Instagram', icon: <InstagramIcon className="w-3.5 h-3.5" /> },\n  { id: 'Cookbooks', label: 'Cookbooks', icon: <BookOpen className="w-3.5 h-3.5" /> },\n  { id: 'Baking', label: 'Baking', icon: <Cake className="w-3.5 h-3.5" /> },\n  { id: 'Salads & Sides', label: 'Salads & Sides', icon: <Salad className="w-3.5 h-3.5" /> },\n];

export const CategoryFilterBar: React.FC<CategoryFilterBarProps> = ({
  selectedCategory,
  onSelectCategory,
  favoritesCount,
  wantToTryCount
}) => {
  return (
    <div className="w-full overflow-x-auto no-scrollbar py-2.5 sm:py-3 px-4 sm:px-6">
      <div className="max-w-6xl mx-auto flex items-center gap-2 min-w-max">
        {CATEGORIES.map((cat) => {
          const isActive = selectedCategory === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => onSelectCategory(cat.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs sm:text-sm font-semibold transition-all cursor-pointer select-none ${
                isActive
                  ? 'bg-[#FF5B26] text-white shadow-md shadow-[#FF5B26]/20 scale-[1.02]'
                  : 'bg-white hover:bg-[#F8F2EB] text-[#5A5246] border border-[#EFE7DE]'
              }`}
            >
              <span className={isActive ? 'text-white' : 'text-[#8A8072]'}>
                {cat.icon}
              </span>
              <span>{cat.label}</span>
              
              {/* Badge for Want to Try */}
              {cat.id === 'Want to Try' && wantToTryCount > 0 && (
                <span className={`px-2 py-0.2 rounded-full text-[11px] font-bold ${
                  isActive ? 'bg-white text-[#FF5B26]' : 'bg-[#FFEFEA] text-[#FF5B26]'
                }`}>
                  {wantToTryCount}
                </span>
              )}

              {/* Badge for Favorites */}
              {cat.id === 'Favorites' && favoritesCount > 0 && (
                <span className={`px-2 py-0.2 rounded-full text-[11px] font-bold ${
                  isActive ? 'bg-white text-[#FF5B26]' : 'bg-[#FFEFEA] text-[#FF5B26]'
                }`}>
                  {favoritesCount}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
