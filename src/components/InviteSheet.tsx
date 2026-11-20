import { useState, type FormEvent } from 'react';
import { Check, Copy, Share2, X } from 'lucide-react';
import { Sheet } from './Sheet';

const INPUT =
  'w-full rounded-xl border border-stone-200 px-3 py-2.5 outline-none transition-colors focus:border-brand dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:placeholder:text-stone-500';

type Role = 'adult' | 'child';

export function InviteSheet({
  onCreate,
  onClose,
}: {
  onCreate: (email: string, role: Role) => Promise<{ error: string | null; link: string | null; expiresAt: string | null }>;
  onClose: () => void;
}) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('adult');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ link: string; email: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const result = await onCreate(email.trim(), role);
    setSaving(false);
    if (result.error || !result.link) return setError(result.error ?? 'Something went wrong. Please try again.');
    setCreated({ link: result.link, email: email.trim().toLowerCase() });
  };

  const copy = async () => {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Could not copy. Press and hold the link to copy it.');
    }
  };

  const share = async () => {
    if (!created) return;
    try {
      await navigator.share({ title: 'Join my family on Expensely', url: created.link });
    } catch {
      // The person closed the share sheet; nothing to do.
    }
  };

  return (
    <Sheet onClose={onClose}>
      {(close) => (
        <>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-stone-800 dark:text-stone-100">
              {created ? 'Send this link' : 'Invite someone'}
            </h2>
            <button
              onClick={close}
              className="rounded-full p-1.5 text-stone-500 transition-colors hover:bg-stone-100 active:scale-90 dark:text-stone-400 dark:hover:bg-stone-700"
              aria-label="Close"
            >
              <X size={20} />
            </button>
          </div>

          {created ? (
            <div className="space-y-3">
              <p className="text-sm text-stone-700 dark:text-stone-300">
                Send this to <span className="font-semibold">{created.email}</span> yourself, for example on WhatsApp. It works once,
                expires in 48 hours, and only for that email address.
              </p>
              <p className="break-all rounded-xl bg-stone-100 p-3 text-xs text-stone-700 dark:bg-stone-900 dark:text-stone-300">
                {created.link}
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-400">
                This is the only time the link is shown. If you lose it, create a new invite.
              </p>
              {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
              <div className="flex gap-2">
                <button
                  onClick={() => void copy()}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand py-2.5 font-semibold text-white transition-transform active:scale-[0.98]"
                >
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                  {copied ? 'Copied' : 'Copy link'}
                </button>
                {typeof navigator.share === 'function' && (
                  <button
                    onClick={() => void share()}
                    className="flex items-center justify-center gap-1.5 rounded-xl border border-stone-200 px-4 py-2.5 font-semibold text-stone-700 transition-transform active:scale-[0.98] dark:border-stone-600 dark:text-stone-200"
                  >
                    <Share2 size={16} />
                    Share
                  </button>
                )}
              </div>
            </div>
          ) : (
            <form onSubmit={(e) => void submit(e)} className="space-y-3">
              <input
                type="email"
                aria-label="Their email address"
                autoComplete="off"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Their email (the one they sign in with)"
                className={INPUT}
              />
              <fieldset className="space-y-2">
                <legend className="sr-only">Role</legend>
                {(
                  [
                    ['adult', 'Adult', 'Chooses what to share with you, and can hide single transactions.'],
                    ['child', 'Child', 'Everything they log is visible to you. They are told this before joining.'],
                  ] as const
                ).map(([value, label, text]) => (
                  <label
                    key={value}
                    className={`flex cursor-pointer gap-3 rounded-xl border p-3 transition-colors ${
                      role === value ? 'border-brand bg-brand/5' : 'border-stone-200 dark:border-stone-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name="invite-role"
                      checked={role === value}
                      onChange={() => setRole(value)}
                      className="mt-1 accent-[var(--color-brand)]"
                    />
                    <span>
                      <span className="block text-sm font-semibold text-stone-800 dark:text-stone-100">{label}</span>
                      <span className="block text-xs text-stone-600 dark:text-stone-400">{text}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
              {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
              <button
                type="submit"
                disabled={saving || !email.trim()}
                className="w-full rounded-xl bg-brand py-2.5 font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-50"
              >
                {saving ? 'Creating…' : 'Create invite link'}
              </button>
            </form>
          )}
        </>
      )}
    </Sheet>
  );
}
