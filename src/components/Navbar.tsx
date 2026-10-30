import React, { useState } from 'react';
import { Plus, Search, Sparkles, Download, Upload, RotateCcw, UtensilsCrossed, ChefHat, Share2, CheckCircle } from 'lucide-react';

interface NavbarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onAddClick: () => void;
  onExport: () => void;
  onImport: () => void;
  onShare: () => void;
  onReset: () => void;
  onShowWelcome: () => void;
  totalCount: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  searchQuery,
  onSearchChange,
  onAddClick,
  onExport,
  onImport,
  onShare,
  onReset,
  onShowWelcome,
  totalCount
}) => {
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);

  return (
    <header style={{ paddingTop: 'max(1rem, calc(env(safe-area-inset-top, 0px) + 0.75rem))' }} className="sticky top-0 z-30 bg-[#FDFBF7]/95 backdrop-blur-md border-b border-[#F2ECE3] px-4 sm:px-6 pb-3 transition-all">
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
        
        {/* ReciMe Styled Logo & Branding */}
        <div className="flex items-center justify-between w-full sm:w-auto">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#FF5B26] text-white flex items-center justify-center shadow-md shadow-[#FF5B26]/20 transition-transform active:scale-95 cursor-pointer" onClick={onShowWelcome} title="App Guide">
              <UtensilsCrossed className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-serif font-bold text-[#221E1B] tracking-tight">
                  Jasmine's Recipes
                </h1>
                <span className="text-[11px] font-bold tracking-wide uppercase px-2.5 py-0.5 rounded-full bg-[#FFEFEA] text-[#FF5B26]">
                  {totalCount} {totalCount === 1 ? 'recipe' : 'recipes'}
                </span>
              </div>
              <p className="text-xs text-[#82786D] font-medium hidden sm:block">
                All your websites, Instagram finds & cookbooks
              </p>
            </div>
          </div>

          {/* Mobile ReciMe Orange Add Button */}
          <button
            onClick={onAddClick}
            className="sm:hidden flex items-center gap-1.5 px-4 py-2 rounded-2xl bg-[#FF5B26] hover:bg-[#E84D1B] text-white text-xs font-bold shadow-md shadow-[#FF5B26]/25 active:scale-95 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Import</span>
          </button>
        </div>

        {/* Search Bar & Desktop Actions */}
        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-72 md:w-80">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9E9486]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search dishes, ingredients, or notes..."
              className="w-full pl-10 pr-4 py-2 text-sm bg-white border border-[#EFE7DE] rounded-2xl text-[#221E1B] placeholder-[#9E9486] focus:outline-none focus:ring-2 focus:ring-[#FF5B26]/20 focus:border-[#FF5B26] transition-all shadow-xs"
            />
            {searchQuery && (
              <button
                onClick={() => onSearchChange('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-[#9E9486] hover:text-[#524B41]"
              >
                Clear
              </button>
            )}
          </div>

          {/* Desktop ReciMe "+ Import Recipe" Button */}
          <button
            onClick={onAddClick}
            className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-2xl bg-[#FF5B26] hover:bg-[#E84D1B] active:scale-95 text-white text-sm font-bold shadow-md shadow-[#FF5B26]/25 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Import Recipe</span>
          </button>

          {/* Data & Backup Settings */}
          <div className="relative">
            <button
              onClick={() => setShowSettingsMenu(!showSettingsMenu)}
              title="Backup & Settings"
              className="p-2 text-[#7A7165] hover:text-[#221E1B] hover:bg-[#F3ECE2] rounded-2xl transition-all cursor-pointer"
            >
              <Sparkles className="w-5 h-5" />
            </button>

            {showSettingsMenu && (
              <>
                <div 
                  className="fixed inset-0 z-40" 
                  onClick={() => setShowSettingsMenu(false)} 
                />
                <div className="absolute right-0 mt-2 w-64 bg-white rounded-2xl shadow-xl border border-[#EFE7DE] py-2 z-50 text-sm animate-in fade-in zoom-in-95 duration-100">
                  <div className="px-3.5 py-1.5 flex items-center justify-between border-b border-[#F5EFE8] mb-1">
                    <span className="text-[10px] font-bold text-[#8C8274] uppercase tracking-wider">
                      My Recipe Box
                    </span>
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                      <CheckCircle className="w-3 h-3 text-emerald-600" />
                      <span>Saved & Persistent</span>
                    </span>
                  </div>

                  <button
                    onClick={() => { setShowSettingsMenu(false); onShare(); }}
                    className="w-full text-left px-3.5 py-2 text-[#3D372F] hover:bg-[#FFF7F4] flex items-center gap-2.5 transition-colors font-medium cursor-pointer"
                  >
                    <Share2 className="w-4 h-4 text-[#FF5B26]" />
                    <div>
                      <div className="text-xs font-bold text-[#221E1B]">Copy Sync / Share Link</div>
                      <div className="text-[10px] text-[#8C8274]">Sync across phone, tablet, & computer</div>
                    </div>
                  </button>

                  <button
                    onClick={() => { setShowSettingsMenu(false); onExport(); }}
                    className="w-full text-left px-3.5 py-2 text-[#3D372F] hover:bg-[#FFF7F4] flex items-center gap-2.5 transition-colors font-medium cursor-pointer"
                  >
                    <Download className="w-4 h-4 text-[#FF5B26]" />
                    <span>Backup Recipes (JSON)</span>
                  </button>

                  <button
                    onClick={() => { setShowSettingsMenu(false); onImport(); }}
                    className="w-full text-left px-3.5 py-2 text-[#3D372F] hover:bg-[#FFF7F4] flex items-center gap-2.5 transition-colors font-medium cursor-pointer"
                  >
                    <Upload className="w-4 h-4 text-emerald-600" />
                    <span>Restore Backup</span>
                  </button>

                  <div className="border-t border-[#F5EFE8] my-1"></div>

                  <button
                    onClick={() => { setShowSettingsMenu(false); onShowWelcome(); }}
                    className="w-full text-left px-3.5 py-2 text-[#3D372F] hover:bg-[#FFF7F4] flex items-center gap-2.5 transition-colors font-medium cursor-pointer"
                  >
                    <ChefHat className="w-4 h-4 text-[#FF5B26]" />
                    <span>Welcome & App Guide</span>
                  </button>

                  <button
                    onClick={() => { setShowSettingsMenu(false); onReset(); }}
                    className="w-full text-left px-3.5 py-2 text-red-600 hover:bg-red-50 flex items-center gap-2.5 transition-colors font-medium cursor-pointer"
                  >
                    <RotateCcw className="w-4 h-4 text-red-500" />
                    <span>Reset Sample Recipes</span>
                  </button>
                </div>
              </>
            )}
          </div>

        </div>

      </div>
    </header>
  );
};
