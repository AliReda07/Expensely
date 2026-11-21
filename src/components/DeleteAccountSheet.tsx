import { useState, type FormEvent } from 'react';
import { Download, X } from 'lucide-react';
import { Sheet } from './Sheet';
import { confirmationMatches } from '../lib/dataExport';
import type { HouseholdRole } from '../lib/family';

/**
 * Permanent account deletion. Explains exactly what goes, offers a download first, and asks the
 * person to type their own email so a stray tap can't delete anything.
 */
export function DeleteAccountSheet({
  email,
  familyRole,
  onDownload,
  onDelete,
  onClose,
}: {
  email: string;
  familyRole: HouseholdRole | null;
  onDownload: () => Promise<{ error: string | null }>;
  onDelete: (typedEmail: string) => Promise<{ error: string | null }>;
  onClose: () => void;
}) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState<'download' | 'delete' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloaded, setDownloaded] = useState(false);

  const download = async () => {
    setError(null);
    setBusy('download');
    const result = await onDownload();
    setBusy(null);
    if (result.error) return setError(result.error);
    setDownloaded(true);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy('delete');
    const result = await onDelete(typed);
    // On success the app signs out and leaves this screen; only a failure comes back here.
    setBusy(null);
    if (result.error) setError(result.error);
  };

  return (
    <Sheet onClose={onClose}>
      {(close) => (
        <>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-red-600 dark:text-red-400">Delete my account</h2>
            <button
              onClick={close}
              className="rounded-full p-1.5 text-stone-500 transition-colors hover:bg-stone-100 active:scale-90 dark:text-stone-400 dark:hover:bg-stone-700"
              aria-label="Close"
            >
              <X size={20} />
            </button>
          </div>

          <div className="space-y-3 text-sm text-stone-700 dark:text-stone-300">
            <p>
              This permanently deletes <span className="font-semibold">{email}</span> and everything in it: your transactions, cards, budgets,
              installment plans, notification devices and plan. It cannot be undone, and we can&apos;t recover it afterwards.
            </p>
            {familyRole === 'owner' && (
              <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
                You own a family. It will be deleted too. Its members keep their own data, but stop sharing with anyone.
              </p>
            )}
            {(familyRole === 'adult' || familyRole === 'child') && (
              <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
                You&apos;ll be removed from your family, and the owner stops seeing your spending.
              </p>
            )}
            <button
              type="button"
              onClick={() => void download()}
              disabled={busy !== null}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-stone-200 py-2.5 text-sm font-semibold text-stone-700 transition-transform active:scale-[0.98] disabled:opacity-50 dark:border-stone-600 dark:text-stone-200"
            >
              <Download size={16} />
              {busy === 'download' ? 'Preparing…' : downloaded ? 'Downloaded. Download again' : 'Download my data first'}
            </button>
          </div>

          <form onSubmit={(e) => void submit(e)} className="mt-4 space-y-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-stone-600 dark:text-stone-400">
                Type your email address to confirm
              </span>
              <input
                type="email"
                autoComplete="off"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder={email}
                className="w-full rounded-xl border border-stone-200 px-3 py-2.5 outline-none transition-colors focus:border-red-500 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:placeholder:text-stone-500"
              />
            </label>
            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={close}
                className="rounded-xl border border-stone-200 px-4 py-2.5 text-sm font-semibold text-stone-700 transition-transform active:scale-[0.98] dark:border-stone-600 dark:text-stone-200"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!confirmationMatches(typed, email) || busy !== null}
                className="flex-1 rounded-xl bg-red-600 py-2.5 font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-40"
              >
                {busy === 'delete' ? 'Deleting…' : 'Delete everything'}
              </button>
            </div>
          </form>
        </>
      )}
    </Sheet>
  );
}
