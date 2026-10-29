import React, { useState } from 'react';
import { X, Sparkles, Globe, BookOpen, Bookmark, ChefHat, Smartphone, ArrowRight } from 'lucide-react';
import { InstagramIcon } from './Icons';

interface WelcomeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const WelcomeModal: React.FC<WelcomeModalProps> = ({ isOpen, onClose }) => {
  const [dontShowAgain, setDontShowAgain] = useState(false);

  if (!isOpen) return null;

  const handleDismiss = () => {
    if (dontShowAgain) {
      localStorage.setItem('jasmines_recipes_welcome_seen', 'true');
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-black/60 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-200">
      <div className="bg-[#FDFBF7] w-full max-w-xl rounded-[32px] shadow-2xl overflow-hidden border border-[#EFE7DE] flex flex-col max-h-[95vh] relative animate-in zoom-in-95 duration-200">
        
        {/* Close Button */}
        <button
          onClick={handleDismiss}
          className="absolute top-4 right-4 p-2 rounded-full bg-white/80 hover:bg-white text-[#7A7165] hover:text-[#221E1B] transition-all cursor-pointer z-10 shadow-xs"
          title="Close"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Scrollable Content */}
        <div className="overflow-y-auto p-6 sm:p-8 space-y-6">
          
          {/* Header Greeting */}
          <div className="text-center space-y-2 pt-2">
            <div className="w-16 h-16 rounded-3xl bg-[#FFEFEA] text-[#FF5B26] flex items-center justify-center mx-auto shadow-sm shadow-[#FF5B26]/15 mb-3">
              <ChefHat className="w-8 h-8 stroke-[2]" />
            </div>
            
            <h2 className="font-serif text-2xl sm:text-3xl font-extrabold text-[#221E1B] tracking-tight">
              Welcome to Jasmine's Kitchen!
            </h2>
            <p className="text-xs sm:text-sm text-[#7D7366] max-w-md mx-auto leading-relaxed">
              All your recipes from websites, Instagram, and physical cookbooks—indexed, searchable, and 100% free forever.
            </p>
          </div>

          {/* Core Superpowers Cards */}
          <div className="space-y-3">
            
            {/* Feature 1: Multi-Source Import */}
            <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-[#EFE7DE] flex items-start gap-3.5 shadow-xs">
              <div className="w-10 h-10 rounded-2xl bg-[#FFEFEA] text-[#FF5B26] flex items-center justify-center shrink-0">
                <Globe className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-bold text-[#221E1B]">
                  Import from Any Website
                </h4>
                <p className="text-xs text-[#7A7165] mt-0.5 leading-relaxed">
                  Paste a link from NYT Cooking, food blogs, or Allrecipes to strip ads and automatically grab ingredients and steps.
                </p>
              </div>
            </div>

            {/* Feature 2: Instagram */}
            <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-[#EFE7DE] flex items-start gap-3.5 shadow-xs">
              <div className="w-10 h-10 rounded-2xl bg-pink-50 text-[#E1306C] flex items-center justify-center shrink-0">
                <InstagramIcon className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-bold text-[#221E1B]">
                  Instagram Reel & Caption Auto-Organizer
                </h4>
                <p className="text-xs text-[#7A7165] mt-0.5 leading-relaxed">
                  Copy any messy caption from a Reel and our smart parser will instantly format it into an organized recipe card.
                </p>
              </div>
            </div>

            {/* Feature 3: Cookbook OCR Scanner */}
            <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-[#EFE7DE] flex items-start gap-3.5 shadow-xs">
              <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-700 flex items-center justify-center shrink-0">
                <BookOpen className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-bold text-[#221E1B]">
                  Cookbook Camera Scanner
                </h4>
                <p className="text-xs text-[#7A7165] mt-0.5 leading-relaxed">
                  Snap a photo of any page from your favorite cookbook or family recipe card to digitize it into editable text.
                </p>
              </div>
            </div>

            {/* Feature 4: Want to Try & Personal Diary */}
            <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-[#EFE7DE] flex items-start gap-3.5 shadow-xs">
              <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
                <Bookmark className="w-5 h-5 fill-current" />
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-bold text-[#221E1B]">
                  'Want to Try' Queue & Personal Notes
                </h4>
                <p className="text-xs text-[#7A7165] mt-0.5 leading-relaxed">
                  Earmark dishes to make soon, jot down ingredient swaps ("used extra garlic!"), and upload photos of your finished plate.
                </p>
              </div>
            </div>

            {/* Feature 5: Countertop Cook Mode */}
            <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-[#EFE7DE] flex items-start gap-3.5 shadow-xs">
              <div className="w-10 h-10 rounded-2xl bg-[#FFEFEA] text-[#FF5B26] flex items-center justify-center shrink-0">
                <Sparkles className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-bold text-[#221E1B]">
                  Hands-Free Countertop Cook Mode
                </h4>
                <p className="text-xs text-[#7A7165] mt-0.5 leading-relaxed">
                  Prop your phone or tablet sideways on a kitchen stand: the ingredients checklist stays on the left while steps and timers stay on the right.
                </p>
              </div>
            </div>

          </div>

          {/* Quick Tip: Add to Home Screen */}
          <div className="p-3.5 sm:p-4 rounded-2xl bg-[#FFF8F5] border border-[#FFD5C8] flex items-center gap-3">
            <Smartphone className="w-5 h-5 text-[#FF5B26] shrink-0" />
            <p className="text-xs text-[#6B5F54] leading-relaxed">
              <strong>Tip:</strong> Tap <strong>Share → Add to Home Screen</strong> in your phone browser to install this with its own app icon!
            </p>
          </div>

          {/* Bottom Actions */}
          <div className="pt-2 space-y-3">
            <button
              onClick={handleDismiss}
              className="w-full py-3.5 px-6 rounded-2xl bg-[#FF5B26] hover:bg-[#E84D1B] text-white font-bold text-sm sm:text-base shadow-lg shadow-[#FF5B26]/30 flex items-center justify-center gap-2 active:scale-98 transition-all cursor-pointer"
            >
              <span>Explore My Recipe Box</span>
              <ArrowRight className="w-4 h-4 stroke-[2.5]" />
            </button>

            <div className="flex items-center justify-center gap-2 text-xs text-[#8A8072]">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={dontShowAgain}
                  onChange={(e) => setDontShowAgain(e.target.checked)}
                  className="w-4 h-4 text-[#FF5B26] accent-[#FF5B26] rounded cursor-pointer"
                />
                <span>Don't show this welcome screen on startup</span>
              </label>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
};
