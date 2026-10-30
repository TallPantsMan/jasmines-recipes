import React, { useEffect, useState } from 'react';
import { ChefHat } from 'lucide-react';

interface WelcomeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const WelcomeModal: React.FC<WelcomeModalProps> = ({ isOpen, onClose }) => {
  const [isFading, setIsFading] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setIsFading(false);
      return;
    }

    // Auto fade-out after 2.5 seconds, then dismiss at 3.0 seconds
    const fadeTimer = setTimeout(() => {
      setIsFading(true);
    }, 2500);

    const closeTimer = setTimeout(() => {
      handleDismiss();
    }, 3000);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(closeTimer);
    };
  }, [isOpen]);

  const handleDismiss = () => {
    localStorage.setItem('jasmines_recipes_welcome_seen', 'true');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      onClick={handleDismiss}
      className={`fixed inset-0 z-[70] bg-[#FDFBF7]/90 backdrop-blur-md flex items-center justify-center p-6 cursor-pointer select-none transition-opacity duration-500 ease-out ${
        isFading ? 'opacity-0' : 'opacity-100'
      }`}
      title="Tap anywhere to dismiss"
    >
      <div className="text-center max-w-sm space-y-4 animate-in zoom-in-95 fade-in duration-300">
        
        {/* ReciMe Tangerine Icon Badge */}
        <div className="w-20 h-20 rounded-3xl bg-[#FFEFEA] text-[#FF5B26] flex items-center justify-center mx-auto shadow-lg shadow-[#FF5B26]/15 transition-transform hover:scale-105">
          <ChefHat className="w-10 h-10 stroke-[2.2]" />
        </div>

        {/* Pure & Sweet Greeting */}
        <div className="space-y-1.5 pt-1">
          <h1 className="font-serif text-3xl sm:text-4xl font-extrabold text-[#221E1B] tracking-tight">
            Welcome! 🍳
          </h1>
          <p className="text-sm sm:text-base text-[#7D7366] font-medium">
            Jasmine's family recipe box
          </p>
        </div>

        {/* Gentle hint */}
        <p className="text-[11px] font-semibold text-[#A89E90] uppercase tracking-wider pt-2 animate-pulse">
          Tap anywhere to enter
        </p>

      </div>
    </div>
  );
};
