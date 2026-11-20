import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Users } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useCards } from '../hooks/useCards';
import { acceptInvite, previewInvite } from '../hooks/useHousehold';
import { SharingPicker } from '../components/SharingPicker';
import {
  clearStashedInviteToken,
  parseInviteToken,
  peekStashedInviteToken,
  stashInviteToken,
  type ShareMode,
} from '../lib/family';

type Preview = { household: string; role: 'adult' | 'child' } | null;

const CARD = 'rounded-2xl bg-white p-5 shadow-sm shadow-stone-200/60 dark:bg-stone-900 dark:shadow-black/40';

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="mesh-bg flex h-full items-center justify-center overflow-y-auto px-4 py-8">
      <div className="w-full max-w-md space-y-4">{children}</div>
    </div>
  );
}

/**
 * Where an invite link lands. The token is in the URL fragment: it is read once, moved into
 * sessionStorage (so it survives signing in, including Google's redirect) and removed from the
 * address bar. Nothing is shared until the person reads what will be shared and agrees.
 */
export function Join() {
  const { user, loading } = useAuth();
  const [token] = useState<string | null>(() => parseInviteToken(window.location.hash) ?? peekStashedInviteToken());

  useEffect(() => {
    if (!token) return;
    stashInviteToken(token);
    // Take the token out of the address bar and history.
    if (window.location.hash) window.history.replaceState(null, '', window.location.pathname);
  }, [token]);

  if (loading) {
    return (
      <Shell>
        <p className="text-center text-sm text-white dark:text-stone-400">Loading…</p>
      </Shell>
    );
  }

  if (!token) {
    return (
      <Shell>
        <div className={CARD}>
          <p className="text-sm font-semibold text-stone-800 dark:text-stone-100">This invite link is incomplete</p>
          <p className="mt-1 text-xs text-stone-600 dark:text-stone-400">
            Ask the family owner to send the whole link again, or create a new invite.
          </p>
          <Link to="/" className="mt-3 inline-block text-sm font-semibold text-brand">
            Go to the app
          </Link>
        </div>
      </Shell>
    );
  }

  if (!user) {
    return (
      <Shell>
        <div className={`${CARD} space-y-3`}>
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand/10 text-brand">
              <Users size={18} />
            </span>
            <p className="text-sm font-semibold text-stone-800 dark:text-stone-100">You&apos;ve been invited to a family</p>
          </div>
          <p className="text-xs text-stone-600 dark:text-stone-400">
            Sign in, or create a free account, using the email address this invite was sent to. Then you&apos;ll see exactly what would be shared
            before you agree to anything.
          </p>
          <div className="flex gap-2">
            <Link to="/login" className="flex-1 rounded-xl bg-brand py-2.5 text-center text-sm font-semibold text-white">
              Sign in
            </Link>
            <Link
              to="/signup"
              className="flex-1 rounded-xl border border-stone-200 py-2.5 text-center text-sm font-semibold text-stone-700 dark:border-stone-600 dark:text-stone-200"
            >
              Create account
            </Link>
          </div>
        </div>
      </Shell>
    );
  }

  return <JoinForm token={token} email={user.email ?? ''} />;
}

function JoinForm({ token, email }: { token: string; email: string }) {
  const navigate = useNavigate();
  const { cards } = useCards();
  const [preview, setPreview] = useState<Preview | undefined>(undefined);
  const [mode, setMode] = useState<ShareMode>('all');
  const [cardIds, setCardIds] = useState<string[]>([]);
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void previewInvite(token).then((p) => {
      if (!cancelled) setPreview(p);
    });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const leave = () => {
    clearStashedInviteToken();
    navigate('/', { replace: true });
  };

  if (preview === undefined) {
    return (
      <Shell>
        <div className="h-32 animate-pulse rounded-2xl bg-stone-200 dark:bg-stone-800" aria-hidden="true" />
      </Shell>
    );
  }

  if (preview === null) {
    return (
      <Shell>
        <div className={`${CARD} space-y-2`}>
          <p className="text-sm font-semibold text-stone-800 dark:text-stone-100">This invite isn&apos;t valid for this account</p>
          <p className="text-xs text-stone-600 dark:text-stone-400">
            You&apos;re signed in as <span className="font-semibold">{email}</span>. The invite may have expired, been used already, or been sent to a
            different email address. Ask the family owner for a new link, or sign in with the right account.
          </p>
          <button onClick={leave} className="text-sm font-semibold text-brand">
            Go to the app
          </button>
        </div>
      </Shell>
    );
  }

  const isChild = preview.role === 'child';
  const submit = async () => {
    setError(null);
    setSaving(true);
    const { error: err } = await acceptInvite(token, isChild ? 'all' : mode, isChild ? [] : cardIds);
    setSaving(false);
    if (err) return setError(err);
    clearStashedInviteToken();
    navigate('/family', { replace: true });
  };

  return (
    <Shell>
      <div className={`${CARD} space-y-4`}>
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
            <Users size={18} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-stone-800 dark:text-stone-100">Join {preview.household}</p>
            <p className="text-xs text-stone-600 dark:text-stone-400">As {isChild ? 'a child' : 'an adult'} · {email}</p>
          </div>
        </div>

        {isChild ? (
          <div className="space-y-1.5 rounded-xl bg-amber-50 p-3 text-xs leading-relaxed text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
            <p className="font-semibold">Everything you log is visible to the family owner.</p>
            <p>
              That includes amounts, categories and notes, from your manual entries and your bank SMS. You can&apos;t hide individual transactions.
              You can leave the family at any time, and you keep all your data.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs leading-relaxed text-stone-600 dark:text-stone-400">
              The family owner will see what you choose below, including notes on shared transactions. You can change this or leave at any
              time, and you can hide single transactions.
            </p>
            <SharingPicker
              mode={mode}
              cardIds={cardIds}
              cards={cards}
              onChange={(m, ids) => {
                setMode(m);
                setCardIds(ids);
              }}
            />
          </div>
        )}

        <label className="flex cursor-pointer items-start gap-2.5 text-sm text-stone-700 dark:text-stone-300">
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 accent-[var(--color-brand)]" />
          I understand what will be shared and I agree.
        </label>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <div className="flex gap-2">
          <button
            onClick={leave}
            className="rounded-xl border border-stone-200 px-4 py-2.5 text-sm font-semibold text-stone-700 transition-transform active:scale-[0.98] dark:border-stone-600 dark:text-stone-200"
          >
            Not now
          </button>
          <button
            onClick={() => void submit()}
            disabled={!agreed || saving || (!isChild && mode === 'cards' && cardIds.length === 0)}
            className="flex-1 rounded-xl bg-brand py-2.5 font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-50"
          >
            {saving ? 'Joining…' : 'Join family'}
          </button>
        </div>
      </div>
    </Shell>
  );
}
