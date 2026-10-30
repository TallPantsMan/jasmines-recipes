import { useEffect, useState, type ReactNode } from 'react';
import { ChefHat, Loader2 } from 'lucide-react';
import { checkSession, logIn, SIGNED_OUT_EVENT, type SessionState } from '../services/auth';

/** Shows the app only to someone who has typed the shared password (and remembers them afterwards). */
export default function LoginGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionState | 'checking'>('checking');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    checkSession().then((s) => alive && setSession(s));
    const onSignedOut = () => setSession('signed-out');
    window.addEventListener(SIGNED_OUT_EVENT, onSignedOut);
    return () => {
      alive = false;
      window.removeEventListener(SIGNED_OUT_EVENT, onSignedOut);
    };
  }, []);

  if (session === 'open' || session === 'signed-in') return <>{children}</>;

  if (session === 'checking') {
    return (
      <div className="min-h-screen bg-[#FDFBF7] flex items-center justify-center text-[#8C8274]">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim() || busy) return;
    setBusy(true);
    setError('');
    const problem = await logIn(password);
    setBusy(false);
    if (problem) {
      setError(problem);
      return;
    }
    setPassword('');
    setSession('signed-in');
  };

  return (
    <div className="min-h-screen bg-[#FDFBF7] flex items-center justify-center px-6 text-[#221E1B]">
      <form onSubmit={submit} className="w-full max-w-xs text-center space-y-5">
        <div className="w-16 h-16 rounded-3xl bg-[#F6EFE6] text-[#FF5B26] flex items-center justify-center mx-auto shadow-xs">
          <ChefHat className="w-8 h-8" />
        </div>
        <div>
          <h1 className="font-serif text-2xl font-bold">Jasmine's Recipe Box</h1>
          <p className="text-sm text-[#7D7366] mt-1">Enter the password to open it.</p>
        </div>
        <input
          type="password"
          autoFocus
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="w-full px-4 py-3 rounded-2xl border border-[#DFD5C7] bg-white text-base outline-none focus:border-[#FF5B26]"
        />
        {error && <p className="text-xs font-semibold text-[#C73B0D]">{error}</p>}
        <button
          type="submit"
          disabled={busy || !password.trim()}
          className="w-full px-5 py-3 rounded-2xl bg-[#FF5B26] text-white text-sm font-bold shadow-md shadow-[#FF5B26]/25 hover:bg-[#E84D1B] disabled:opacity-60 transition-all cursor-pointer"
        >
          {busy ? 'Checking…' : 'Open the recipe box'}
        </button>
        <p className="text-[11px] text-[#A09587]">This device will remember you afterwards.</p>
      </form>
    </div>
  );
}
