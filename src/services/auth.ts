/** Keeps the shared password's "remember me" token on this device and attaches it to our own server calls. */

const TOKEN_KEY = 'jasmines_recipes_auth_token';
export const SIGNED_OUT_EVENT = 'jasmines-recipes:signed-out';

export function getToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

function setToken(token: string) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private mode: the sign-in just won't be remembered */
  }
}

export function signOut() {
  setToken('');
  window.dispatchEvent(new Event(SIGNED_OUT_EVENT));
}

/** fetch() for our own /api routes only. Never use it for third-party addresses, it would hand them the token. */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = getToken();
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const res = await fetch(path, { ...init, headers });
  if (res.status === 401 && token) signOut();
  return res;
}

export type SessionState = 'open' | 'signed-in' | 'signed-out';

/**
 * Asks the server whether a password is needed. If the server can't be reached (kitchen with bad wifi),
 * a device that signed in before is let through so saved recipes stay usable offline.
 */
export async function checkSession(): Promise<SessionState> {
  try {
    const res = await apiFetch('/api/login');
    if (!(res.headers.get('content-type') || '').includes('json')) throw new Error('no server');
    const data = await res.json();
    if (!data.required) return 'open';
    return data.ok ? 'signed-in' : 'signed-out';
  } catch {
    return getToken() ? 'signed-in' : 'signed-out';
  }
}

export async function logIn(password: string): Promise<string | null> {
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.token) {
      setToken(data.token);
      return null;
    }
    return data.error || 'Could not sign in';
  } catch {
    return 'Could not reach the server. Check your connection and try again.';
  }
}
