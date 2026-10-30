import React, { useState, useEffect } from 'react';
import type { Recipe } from '../types/recipe';
import { X, ChevronLeft, ChevronRight, Check, ListFilter, Sun, Timer, Sparkles } from 'lucide-react';
import confetti from 'canvas-confetti';
import { formatMinutes } from '../utils/formatTime';
import { scaleIngredient } from '../utils/scaleIngredient';
import { stepTimerMinutes } from '../utils/stepTimer';
import { stepIngredients } from '../utils/stepIngredients';
import { notify } from '../services/dialog';

const TEXT_SIZES = [
  'text-lg sm:text-2xl lg:text-3xl landscape:text-xl',
  'text-xl sm:text-3xl lg:text-4xl landscape:text-2xl landscape:lg:text-4xl',
  'text-2xl sm:text-4xl lg:text-5xl landscape:text-3xl landscape:lg:text-5xl',
  'text-3xl sm:text-5xl lg:text-6xl landscape:text-4xl landscape:lg:text-6xl',
];
const TEXT_SIZE_KEY = 'jasmines_recipes_cook_text_size';

interface CookModeModalProps {
  recipe: Recipe;
  initialServings: number;
  onClose: () => void;
}

export const CookModeModal: React.FC<CookModeModalProps> = ({
  recipe,
  initialServings,
  onClose
}) => {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [showPortraitIngredients, setShowPortraitIngredients] = useState(false);
  const [checkedIngredients, setCheckedIngredients] = useState<Record<string, boolean>>({});
  const [wakeLockActive, setWakeLockActive] = useState(false);
  const [timerSecs, setTimerSecs] = useState<number | null>(null);
  const [textSize, setTextSize] = useState<number>(() => {
    try {
      const n = Number(localStorage.getItem(TEXT_SIZE_KEY));
      return Number.isInteger(n) && n >= 0 && n < TEXT_SIZES.length ? n : 1;
    } catch {
      return 1;
    }
  });
  const changeTextSize = (delta: number) => {
    const next = Math.min(TEXT_SIZES.length - 1, Math.max(0, textSize + delta));
    setTextSize(next);
    try {
      localStorage.setItem(TEXT_SIZE_KEY, String(next));
    } catch {
      /* the size just won't be remembered */
    }
  };

  // A timer belongs to one step, so moving to another step clears it
  useEffect(() => { setTimerSecs(null); }, [currentStepIndex]);

  useEffect(() => {
    if (timerSecs === null) return;
    if (timerSecs <= 0) {
      notify(`⏰ Timer finished for ${recipe.title}!`);
      return;
    }
    const t = setTimeout(() => setTimerSecs(s => (s === null ? null : s - 1)), 1000);
    return () => clearTimeout(t);
  }, [timerSecs, recipe.title]);

  // Screen Wake Lock API
  useEffect(() => {
    let wakeLock: any = null;
    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLock = await (navigator as any).wakeLock.request('screen');
          setWakeLockActive(true);
        }
      } catch (err) {
        console.warn('Wake lock error or unsupported:', err);
      }
    };

    requestWakeLock();

    return () => {
      if (wakeLock) {
        wakeLock.release().catch(() => {});
      }
    };
  }, []);

  const totalSteps = recipe.instructions.length;
  const currentStep = recipe.instructions[currentStepIndex];
  const stepMinutes = currentStep ? stepTimerMinutes(currentStep) : undefined;
  const stepIngs = currentStep
    ? stepIngredients(currentStep.text, recipe.ingredients, initialServings / (recipe.servings || initialServings))
    : [];

  const handleNext = () => {
    if (currentStepIndex < totalSteps - 1) {
      setCurrentStepIndex(prev => prev + 1);
    } else {
      // Finished cooking! Celebratory confetti explosion
      confetti({
        particleCount: 160,
        spread: 80,
        origin: { y: 0.6 }
      });
    }
  };

  const handlePrev = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex(prev => prev - 1);
    }
  };

  // Keyboard navigation for hands-free counter experience
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'Space') {
        handleNext();
      } else if (e.key === 'ArrowLeft') {
        handlePrev();
      } else if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentStepIndex, totalSteps]);

  const isLastStep = currentStepIndex === totalSteps - 1;

  return (
    <div style={{ paddingTop: 'max(1rem, env(safe-area-inset-top, 0px))', paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 0px))' }} className="fixed inset-0 z-[60] bg-[#191614] text-[#FAF8F5] flex flex-col justify-between overflow-hidden select-none animate-in fade-in duration-200">
      
      {/* Top Header Bar */}
      <header className="px-4 sm:px-6 py-3 border-b border-white/10 flex items-center justify-between bg-black/40 backdrop-blur-md">
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Mobile Portrait Ingredients toggle */}
          <button
            onClick={() => setShowPortraitIngredients(!showPortraitIngredients)}
            className={`landscape:hidden flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
              showPortraitIngredients
                ? 'bg-[#FF5B26] border-[#FF5B26] text-white'
                : 'bg-white/10 hover:bg-white/20 border-white/15 text-white'
            }`}
          >
            <ListFilter className="w-3.5 h-3.5" />
            <span>Ingredients ({recipe.ingredients.length})</span>
          </button>

          {/* Landscape info badge */}
          <span className="hidden landscape:inline-flex items-center gap-1.5 text-xs text-white/70 font-semibold">
            <span>Cooking for {initialServings} servings</span>
          </span>

          {wakeLockActive && (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-300 bg-amber-400/10 px-2.5 py-0.5 rounded-full border border-amber-400/20">
              <Sun className="w-3 h-3" />
              <span>Screen Awake</span>
            </span>
          )}
        </div>

        <div className="text-center font-serif text-xs sm:text-base font-bold text-white/90 truncate max-w-[160px] sm:max-w-md">
          {recipe.title}
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          <div className="flex items-center rounded-full bg-white/10 text-white font-bold">
            <button
              onClick={() => changeTextSize(-1)}
              disabled={textSize === 0}
              title="Smaller text"
              className="px-2.5 py-1 text-xs disabled:opacity-30 cursor-pointer"
            >
              A-
            </button>
            <button
              onClick={() => changeTextSize(1)}
              disabled={textSize === TEXT_SIZES.length - 1}
              title="Bigger text"
              className="px-2.5 py-1 text-base disabled:opacity-30 cursor-pointer"
            >
              A+
            </button>
          </div>
          <button
            onClick={onClose}
            title="Close cook mode"
            className="p-1.5 sm:p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all cursor-pointer"
          >
            <X className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        </div>
      </header>

      {/* Main Body */}
      <div className="flex-1 flex overflow-hidden relative">
        
        {/* LANDSCAPE DEDICATED INGREDIENTS SIDEBAR */}
        <aside className="hidden landscape:flex flex-col w-80 lg:w-96 border-r border-white/10 bg-[#221E1B] overflow-y-auto p-5">
          <div className="flex items-center justify-between pb-3.5 border-b border-white/10 mb-3.5">
            <h4 className="font-serif text-sm sm:text-base font-bold text-white flex items-center gap-2">
              <ListFilter className="w-4 h-4 text-[#FF5B26]" />
              <span>Ingredients ({recipe.ingredients.length})</span>
            </h4>
            <span className="text-[11px] text-white/50 font-semibold">Tap to check</span>
          </div>

          <div className="space-y-2 flex-1">
            {recipe.ingredients.map((ing) => {
              const checked = !!checkedIngredients[ing.id];
              return (
                <div
                  key={ing.id}
                  onClick={() => setCheckedIngredients(p => ({ ...p, [ing.id]: !p[ing.id] }))}
                  className={`flex items-start gap-2.5 p-2.5 rounded-2xl transition-all cursor-pointer text-xs sm:text-sm ${
                    checked ? 'bg-white/5 text-white/30 line-through' : 'bg-white/10 text-white hover:bg-white/15'
                  }`}
                >
                  <div className={`mt-0.5 w-4 h-4 rounded-md border flex items-center justify-center shrink-0 ${
                    checked ? 'bg-[#FF5B26] border-[#FF5B26] text-white' : 'border-white/40'
                  }`}>
                    {checked && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                  </div>
                  <span className="font-medium leading-snug">{scaleIngredient(ing.raw, initialServings / (recipe.servings || initialServings))}</span>
                </div>
              );
            })}
          </div>
        </aside>

        {/* STEP DISPLAY AREA */}
        <div className="flex-1 flex flex-col justify-center items-center px-6 sm:px-12 landscape:px-10 py-6 max-w-4xl mx-auto text-center overflow-y-auto">
          
          {/* ReciMe Orange Step Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#FF5B26]/20 border border-[#FF5B26]/40 text-[#FF7A4D] text-xs font-bold uppercase tracking-wider mb-4 sm:mb-6">
            <span>Step {currentStepIndex + 1} of {totalSteps}</span>
          </div>

          <p className={`font-serif font-semibold leading-relaxed sm:leading-snug text-white/95 max-w-2xl whitespace-pre-line ${TEXT_SIZES[textSize]}`}>
            {currentStep?.text}
          </p>

          {stepIngs.length > 0 && (
            <div className="mt-5 flex flex-wrap justify-center gap-2 max-w-2xl">
              {stepIngs.map((line, i) => (
                <span key={i} className="text-sm sm:text-base font-semibold text-white/90 bg-white/10 border border-white/15 px-3.5 py-1.5 rounded-full">
                  {line}
                </span>
              ))}
            </div>
          )}

          {stepMinutes && (
            <div className="mt-6">
              {timerSecs === null ? (
                <button
                  onClick={() => setTimerSecs(stepMinutes * 60)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 font-bold text-xs sm:text-sm cursor-pointer"
                >
                  <Timer className="w-4 h-4" />
                  <span>Start {formatMinutes(stepMinutes)} timer</span>
                </button>
              ) : (
                <button
                  onClick={() => setTimerSecs(null)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-amber-500/30 text-amber-200 border border-amber-500/40 font-bold text-sm cursor-pointer"
                  title="Tap to stop the timer"
                >
                  <Timer className="w-4 h-4" />
                  <span>{timerSecs > 0 ? `${Math.floor(timerSecs / 60)}:${String(timerSecs % 60).padStart(2, '0')} left (tap to stop)` : 'Time is up!'}</span>
                </button>
              )}
            </div>
          )}

        </div>

        {/* PORTRAIT SLIDE-OVER INGREDIENTS */}
        {showPortraitIngredients && (
          <aside className="landscape:hidden absolute inset-0 bg-[#221E1B] p-5 overflow-y-auto z-30 animate-in slide-in-from-left duration-200">
            <div className="flex items-center justify-between pb-3.5 border-b border-white/10 mb-4">
              <h4 className="font-serif text-lg font-bold text-white flex items-center gap-2">
                <ListFilter className="w-4 h-4 text-[#FF5B26]" />
                <span>Ingredients</span>
              </h4>
              <button
                onClick={() => setShowPortraitIngredients(false)}
                className="px-3 py-1 bg-white/10 rounded-full text-xs text-white font-bold"
              >
                Back to Steps
              </button>
            </div>

            <div className="space-y-2.5">
              {recipe.ingredients.map((ing) => {
                const checked = !!checkedIngredients[ing.id];
                return (
                  <div
                    key={ing.id}
                    onClick={() => setCheckedIngredients(p => ({ ...p, [ing.id]: !p[ing.id] }))}
                    className={`flex items-start gap-3 p-3 rounded-2xl transition-all cursor-pointer ${
                      checked ? 'bg-white/5 text-white/40 line-through' : 'bg-white/10 text-white'
                    }`}
                  >
                    <div className={`mt-0.5 w-4 h-4 rounded-md border flex items-center justify-center shrink-0 ${
                      checked ? 'bg-[#FF5B26] border-[#FF5B26] text-white' : 'border-white/30'
                    }`}>
                      {checked && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>
                    <span className="text-sm font-medium">{scaleIngredient(ing.raw, initialServings / (recipe.servings || initialServings))}</span>
                  </div>
                );
              })}
            </div>
          </aside>
        )}

      </div>

      {/* Bottom Navigation */}
      <footer className="px-4 sm:px-6 py-3.5 sm:py-4 bg-black/40 border-t border-white/10 flex items-center justify-between gap-4">
        <button
          onClick={handlePrev}
          disabled={currentStepIndex === 0}
          className="flex items-center gap-1.5 sm:gap-2 px-4 sm:px-5 py-2.5 sm:py-3 rounded-2xl bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:pointer-events-none text-white font-bold text-xs sm:text-sm transition-all cursor-pointer"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Previous</span>
        </button>

        {/* ReciMe Progress Dots */}
        <div className="flex items-center gap-1 sm:gap-1.5">
          {recipe.instructions.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrentStepIndex(i)}
              className={`h-1.5 sm:h-2 rounded-full transition-all cursor-pointer ${
                i === currentStepIndex
                  ? 'w-7 sm:w-9 bg-[#FF5B26]'
                  : i < currentStepIndex
                  ? 'w-1.5 sm:w-2 bg-white/50'
                  : 'w-1.5 sm:w-2 bg-white/15'
              }`}
            />
          ))}
        </div>

        <button
          onClick={handleNext}
          className={`flex items-center gap-1.5 sm:gap-2 px-5 sm:px-7 py-2.5 sm:py-3 rounded-2xl font-bold text-xs sm:text-sm shadow-lg transition-all cursor-pointer ${
            isLastStep
              ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/30 active:scale-95'
              : 'bg-[#FF5B26] hover:bg-[#E84D1B] text-white shadow-[#FF5B26]/30 active:scale-95'
          }`}
        >
          {isLastStep ? (
            <>
              <Sparkles className="w-4 h-4" />
              <span>Finish Cooking!</span>
            </>
          ) : (
            <>
              <span>Next Step</span>
              <ChevronRight className="w-4 h-4" />
            </>
          )}
        </button>
      </footer>

    </div>
  );
};
