import { useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { GoogleLogo } from '../components/GoogleLogo';
import { Wordmark } from '../components/Wordmark';

export function Signup() {
  const { user, signUpWithPassword, signInWithGoogle } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmSent, setConfirmSent] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await signUpWithPassword(email, password);
    setLoading(false);
    if (error) {
      setError(error);
      return;
    }
    setConfirmSent(true);
  };

  if (confirmSent) {
    return (
      <div className="mesh-bg animate-row-in flex h-full flex-col items-center justify-center overflow-y-auto px-6 pt-[env(safe-area-inset-top)] text-center">
        <Wordmark as="p" className="mb-1 font-brand text-base font-semibold text-brand" />
        <h1 className="text-xl font-bold text-stone-800 dark:text-stone-100">Check your email</h1>
        <p className="mt-2 text-sm text-stone-500 dark:text-stone-400">
          We sent a confirmation link to {email}. Confirm it, then sign in.
        </p>
        <Link to="/login" className="mt-6 font-semibold text-brand">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="mesh-bg animate-row-in flex h-full flex-col justify-center overflow-y-auto px-6 pb-12 pt-[calc(env(safe-area-inset-top)+3rem)]">
      <Wordmark as="p" className="mb-1 font-brand text-base font-semibold text-brand" />
      <h1 className="text-2xl font-bold text-stone-800 dark:text-stone-100">Create your account</h1>
      <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">Start tracking your balance, budgets, and spending.</p>

      <form onSubmit={submit} className="mt-8 space-y-4">
        <input
          type="email"
          required
          autoComplete="email"
          aria-label="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-stone-800 outline-none transition-colors focus:border-brand dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:placeholder:text-stone-500"
        />
        <input
          type="password"
          required
          minLength={10}
          autoComplete="new-password"
          aria-label="Password, minimum 10 characters"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password (min. 10 characters)"
          className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-stone-800 outline-none transition-colors focus:border-brand dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:placeholder:text-stone-500"
        />
        {error && <p className="animate-shake text-sm text-red-600 dark:text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-gradient-to-br from-brand to-brand-dark py-3 font-semibold text-white shadow-lg shadow-brand/25 transition-transform active:scale-[0.98] disabled:opacity-60"
        >
          {loading ? 'Creating account…' : 'Sign up'}
        </button>
      </form>

      <div className="my-5 flex items-center gap-3 text-xs text-stone-600 dark:text-stone-400">
        <div className="h-px flex-1 bg-stone-200 dark:bg-stone-700" />
        or
        <div className="h-px flex-1 bg-stone-200 dark:bg-stone-700" />
      </div>

      <button
        onClick={() => signInWithGoogle()}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-stone-200 py-3 font-semibold text-stone-700 transition-transform active:scale-[0.98] dark:border-stone-700 dark:text-stone-200"
      >
        <GoogleLogo />
        Continue with Google
      </button>

      <p className="mt-6 text-center text-sm text-stone-500 dark:text-stone-400">
        Already have an account?{' '}
        <Link to="/login" className="font-semibold text-brand">
          Sign in
        </Link>
      </p>
    </div>
  );
}
