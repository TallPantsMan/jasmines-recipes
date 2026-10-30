import React, { useState } from 'react';
import { ChefHat } from 'lucide-react';
import { PROFILES, PROFILE_COLORS, getProfile, setProfile, type ProfileName } from '../services/profile';

/** Asks "who's cooking?" on a device that hasn't picked a profile yet, then shows the app for that person. */
const ProfileGate: React.FC<{ children: (profile: ProfileName) => React.ReactNode }> = ({ children }) => {
  const [profile, setChosen] = useState<ProfileName | null>(getProfile());

  if (profile) return <>{children(profile)}</>;

  return (
    <div className="min-h-[100dvh] bg-[#FDFBF7] flex items-center justify-center p-6">
      <div className="w-full max-w-sm text-center space-y-6">
        <div className="w-16 h-16 rounded-3xl bg-[#FFEFEA] text-[#FF5B26] flex items-center justify-center mx-auto shadow-lg shadow-[#FF5B26]/15">
          <ChefHat className="w-8 h-8 stroke-[2.2]" />
        </div>
        <div className="space-y-1.5">
          <h1 className="font-serif text-3xl font-extrabold text-[#221E1B] tracking-tight">Who's cooking?</h1>
          <p className="text-sm text-[#7D7366]">
            Pick your name and your recipes follow you to every phone and laptop. Any recipes already on this device will be added to your profile.
          </p>
        </div>
        <div className="space-y-3">
          {PROFILES.map((name) => (
            <button
              key={name}
              onClick={() => { setProfile(name); setChosen(name); }}
              className="w-full py-3 px-4 rounded-2xl bg-white border border-[#EFE7DE] hover:border-[#FF5B26] hover:bg-[#FFF7F4] text-lg font-serif font-bold text-[#221E1B] shadow-xs active:scale-[0.98] transition-all cursor-pointer flex items-center gap-4"
            >
              <span style={{ background: PROFILE_COLORS[name] }} className="w-10 h-10 rounded-full text-white flex items-center justify-center text-base font-bold shrink-0">
                {name[0]}
              </span>
              {name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ProfileGate;
