import { FormEvent, useState } from 'react';
import { ArrowRight, KeyRound, Lock, User } from 'lucide-react';
import { AuthUser, loginAccount, registerAccount } from '../auth/customAuth';

const HORROR_BG_URL = '/src/assets/images/horror_facility_corridor_1794997869635.jpg';

interface AuthScreenProps {
  onAuthenticated: (user: AuthUser) => void;
}

export function AuthScreen({ onAuthenticated }: AuthScreenProps) {
  const [authTab, setAuthTab] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bgFailed, setBgFailed] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const user =
        authTab === 'login'
          ? await loginAccount(username, password)
          : await registerAccount(username, password);
      onAuthenticated(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'İşlem başarısız.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#050508] text-stone-100 flex items-center justify-center p-6 relative overflow-hidden">
      {/* Horror Facility Background */}
      <div className="pointer-events-none fixed inset-0 z-0">
        {!bgFailed ? (
          <img
            src={HORROR_BG_URL}
            alt="ZONE 51 koridoru"
            referrerPolicy="no-referrer"
            onError={() => setBgFailed(true)}
            className="w-full h-full object-cover opacity-35"
          />
        ) : (
          <div
            className="w-full h-full"
            style={{
              background:
                'radial-gradient(circle at 50% 35%, rgba(127, 29, 29, 0.28), rgba(5, 5, 8, 0.98) 70%)',
            }}
          />
        )}
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(circle at center, rgba(5,5,8,0.45) 0%, rgba(5,5,8,0.92) 75%, #040407 100%)',
          }}
        />
      </div>

      {/* Centered Horror Terminal Box */}
      <div className="relative z-10 w-full max-w-md bg-[#09090e]/95 border border-red-950/70 shadow-2xl shadow-black/90 rounded-sm overflow-hidden">
        {/* Top Crimson Accent Line */}
        <div className="h-1 w-full bg-gradient-to-r from-red-950 via-red-600 to-red-950" />

        <div className="p-7 sm:p-8 space-y-6">
          <div className="text-center space-y-1.5">
            <h1 className="font-horror text-4xl font-bold tracking-[0.22em] text-stone-100">
              ZONE 51
            </h1>
            <p className="text-xs text-stone-400">
              {authTab === 'login' ? 'Hesabına giriş yap' : 'Yeni hesap oluştur'}
            </p>
          </div>

          {/* Login / Register Toggle */}
          <div className="grid grid-cols-2 bg-[#050508] p-1 border border-stone-800/90 rounded-sm">
            <button
              type="button"
              onClick={() => {
                setAuthTab('login');
                setError(null);
              }}
              className={`py-2 text-xs font-semibold tracking-wide transition-colors cursor-pointer ${
                authTab === 'login'
                  ? 'bg-red-900/60 text-white border border-red-700/60'
                  : 'text-stone-400 hover:text-stone-200 border border-transparent'
              }`}
            >
              Giriş Yap
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthTab('register');
                setError(null);
              }}
              className={`py-2 text-xs font-semibold tracking-wide transition-colors cursor-pointer ${
                authTab === 'register'
                  ? 'bg-red-900/60 text-white border border-red-700/60'
                  : 'text-stone-400 hover:text-stone-200 border border-transparent'
              }`}
            >
              Kayıt Ol
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="auth-username"
                className="block text-xs font-medium text-stone-300"
              >
                Kullanıcı Adı
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-stone-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="auth-username"
                  type="text"
                  autoComplete="username"
                  minLength={3}
                  maxLength={16}
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="3-16 karakter"
                  className="w-full pl-9 pr-3 py-2.5 bg-[#050508] border border-stone-800 rounded-sm text-sm text-stone-100 placeholder-stone-600 focus:outline-none focus:border-red-700"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="auth-password"
                className="block text-xs font-medium text-stone-300"
              >
                Şifre
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-stone-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="auth-password"
                  type="password"
                  autoComplete={authTab === 'login' ? 'current-password' : 'new-password'}
                  minLength={4}
                  maxLength={64}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="En az 4 karakter"
                  className="w-full pl-9 pr-3 py-2.5 bg-[#050508] border border-stone-800 rounded-sm text-sm text-stone-100 placeholder-stone-600 focus:outline-none focus:border-red-700"
                />
              </div>
            </div>

            {error && (
              <div className="text-xs text-red-300 bg-red-950/50 border border-red-800/70 rounded-sm px-3 py-2">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full py-3 px-4 bg-red-800 hover:bg-red-700 disabled:opacity-60 text-white font-horror font-bold tracking-[0.14em] text-sm rounded-sm border border-red-600/60 flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <KeyRound className="w-4 h-4" />
              <span>
                {busy
                  ? 'İşleniyor...'
                  : authTab === 'login'
                  ? 'TESİSE GİRİŞ YAP'
                  : 'KAYIT OL VE GİRİŞ YAP'}
              </span>
              {!busy && <ArrowRight className="w-4 h-4" />}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
