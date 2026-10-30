/** Which family member is using this device. The recipes follow the profile, not the device. */

export const PROFILES = ['Jasmine', 'Leslie', 'Alex'] as const;
export type ProfileName = (typeof PROFILES)[number];

/** Each person's color, so it's obvious at a glance whose box is open */
export const PROFILE_COLORS: Record<ProfileName, string> = {
  Jasmine: '#E0457B',
  Leslie: '#7C5CBF',
  Alex: '#2F8F83',
};

const PROFILE_KEY = 'jasmines_recipes_profile';

export function getProfile(): ProfileName | null {
  try {
    const p = localStorage.getItem(PROFILE_KEY);
    return PROFILES.includes(p as ProfileName) ? (p as ProfileName) : null;
  } catch {
    return null;
  }
}

export function setProfile(name: ProfileName | null) {
  try {
    if (name) localStorage.setItem(PROFILE_KEY, name);
    else localStorage.removeItem(PROFILE_KEY);
  } catch {
    /* private mode: the choice just won't be remembered */
  }
}
