import React from 'react';
import type { FilterCategory } from '../types/recipe';
import { Heart, BookOpen, Clock, Utensils, Cake, Salad, Sparkles, Bookmark, FolderOpen, X } from 'lucide-react';
import { InstagramIcon } from './Icons';

interface CategoryFilterBarProps {
  selectedCategory: FilterCategory;
  onSelectCategory: (cat: FilterCategory) => void;
  favoritesCount: number;
  wantToTryCount: number;
  folders: string[];
  selectedFolder: string | null;
  onSelectFolder: (folder: string | null) => void;
  onDeleteFolder: (folder: string) => void;
}

const CATEGORIES: { id: FilterCategory; label: string; icon: React.ReactNode }[] = [
  { id: 'All', label: 'All Recipes', icon: <Utensils className="w-3.5 h-3.5" /> },
  { id: 'Want to Try', label: 'Want to Try', icon: <Bookmark className="w-3.5 h-3.5 fill-current" /> },
  { id: 'Favorites', label: 'Favorites', icon: <Heart className="w-3.5 h-3.5 fill-current" /> },
  { id: 'Dinners', label: 'Dinners', icon: <Sparkles className="w-3.5 h-3.5" /> },
  { id: 'Quick (<30m)', label: 'Quick (<30m)', icon: <Clock className="w-3.5 h-3.5" /> },
  { id: 'Instagram', label: 'Instagram', icon: <InstagramIcon className="w-3.5 h-3.5" /> },
  { id: 'Cookbooks', label: 'Cookbooks', icon: <BookOpen className="w-3.5 h-3.5" /> },
  { id: 'Baking', label: 'Baking', icon: <Cake className="w-3.5 h-3.5" /> },
  { id: 'Salads & Sides', label: 'Salads & Sides', icon: <Salad className="w-3.5 h-3.5" /> },
];

export const CategoryFilterBar: React.FC<CategoryFilterBarProps> = ({
  selectedCategory,
  onSelectCategory,
  favoritesCount,
  wantToTryCount,
  folders,
  selectedFolder,
  onSelectFolder,
  onDeleteFolder
}) => {
  return (
    <div className="w-full overflow-x-auto no-scrollbar py-2.5 sm:py-3 px-4 sm:px-6">
      <div className="max-w-6xl mx-auto flex items-center gap-2 min-w-max">
        {CATEGORIES.map((cat) => {
          const isActive = selectedCategory === cat.id && !selectedFolder;
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

        {folders.length > 0 && <span className="w-px h-6 bg-[#E4DACB] mx-1 shrink-0" />}
        {folders.map((folder) => {
          const isActive = selectedFolder === folder;
          return (
            <div
              key={folder}
              className={`flex items-center rounded-full text-xs sm:text-sm font-semibold transition-all select-none ${
                isActive
                  ? 'bg-[#2C2620] text-white shadow-md'
                  : 'bg-white hover:bg-[#F8F2EB] text-[#5A5246] border border-[#EFE7DE]'
              }`}
            >
              <button
                onClick={() => onSelectFolder(isActive ? null : folder)}
                className="flex items-center gap-2 pl-4 pr-3 py-2 cursor-pointer"
              >
                <FolderOpen className={`w-3.5 h-3.5 ${isActive ? 'text-white' : 'text-[#8A8072]'}`} />
                <span>{folder}</span>
              </button>
              {isActive && (
                <button
                  onClick={() => onDeleteFolder(folder)}
                  title="Delete this folder"
                  className="pr-3 pl-1 py-2 text-white/70 hover:text-white cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
