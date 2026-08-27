import { useState, type ReactNode } from 'react';
import { Check, ChevronDown, Pencil, X } from 'lucide-react';
import { formatCurrency } from '../lib/format';
import { progressColor } from '../lib/color';

// A change this large relative to the current balance gets a confirmation step before
// saving, since this input silently rewrites the stored starting balance rather than
// logging a transaction -- a typo here has no undo.
const LARGE_CHANGE_RATIO = 0.2;

export interface AccountOption {
  key: string;
  label: string;
  icon: ReactNode;
  dotColor?: string | null;
}

export function BalanceCard({
  balance,
  currency,
  label = 'Current balance',
  /** Small line under the balance, e.g. "EGP 80,000 available of EGP 100,000 limit". */
  sublabel,
  /** 'asset': negative reads as bad (red). 'liability': owing money (positive) reads as bad (red). */
  variant = 'asset',
  onSave,
  accountPicker,
  /** For a liability card with a known credit limit: % of that limit currently owed
   *  (0-100). Colors the card along the same green->amber->red scale budgets use,
   *  instead of a flat red for any amount owed. Omitted (e.g. no limit on file, or an
   *  asset gone negative) falls back to a flat red for "this is bad." */
  liabilityPct,
}: {
  balance: number;
  currency: string;
  label?: string;
  sublabel?: string;
  variant?: 'asset' | 'liability';
  onSave?: (newBalance: number) => Promise<{ error: string | null }>;
  /** When set, the label becomes a dropdown for switching which account this card shows. */
  accountPicker?: {
    options: AccountOption[];
    selected: string;
    onSelect: (key: string) => void;
  };
  liabilityPct?: number;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  // A large change needs a confirmation step before it saves (see LARGE_CHANGE_RATIO).
  // That confirmation is a custom in-app prompt, not window.confirm() -- the native
  // dialog is unreliable inside an iOS home-screen-installed PWA and can silently do
  // nothing when triggered, which looks exactly like the save button not working.
  const [confirmAmount, setConfirmAmount] = useState<number | null>(null);

  const startEdit = () => {
    setValue(String(balance));
    setError(null);
    setConfirmAmount(null);
    setEditing(true);
  };

  const cancel = () => {
    setEditing(false);
    setError(null);
    setConfirmAmount(null);
  };

  const commitSave = async (amount: number) => {
    setSaving(true);
    const result = await onSave?.(amount);
    setSaving(false);
    setConfirmAmount(null);
    if (result?.error) {
      setError(result.error);
      return;
    }
    setEditing(false);
  };

  const attemptSave = () => {
    const trimmed = value.trim();
    const amount = Number(trimmed);
    if (trimmed === '' || !/^-?\d+(\.\d+)?$/.test(trimmed) || Number.isNaN(amount)) {
      setError('Enter a valid number');
      return;
    }
    const delta = Math.abs(amount - balance);
    const isLargeChange = delta > Math.max(Math.abs(balance), 1) * LARGE_CHANGE_RATIO;
    if (isLargeChange) {
      setError(null);
      setConfirmAmount(amount);
      return;
    }
    void commitSave(amount);
  };

  const isNegative = variant === 'liability' ? balance > 0 : balance < 0;
  // With a known limit, the sublabel's color scales along the same green->amber->red
  // ramp budgets use, so "owe a little, plenty of headroom" reads calmer than "over
  // the limit" instead of both getting an identical alarm color.
  const liabilityColor = liabilityPct != null ? progressColor(liabilityPct) : undefined;

  return (
    <div className="flex flex-col items-center py-6 text-center">
      {accountPicker ? (
        <div className="relative">
          <button
            type="button"
            onClick={() => setPickerOpen((o) => !o)}
            aria-expanded={pickerOpen}
            className="flex items-center gap-1.5 rounded-full border border-stone-900/10 bg-stone-900/5 px-3 py-1.5 text-sm font-medium text-stone-700 backdrop-blur-sm transition-colors active:scale-95 dark:border-white/10 dark:bg-white/10 dark:text-white/90"
          >
            {label}
            <ChevronDown size={14} className={`transition-transform duration-200 ${pickerOpen ? 'rotate-180' : ''}`} />
          </button>

          {pickerOpen && (
            <>
              <button
                type="button"
                aria-label="Close account picker"
                className="fixed inset-0 z-10 cursor-default"
                onClick={() => setPickerOpen(false)}
              />
              <div className="animate-dropdown-in absolute left-1/2 top-full z-20 mt-2 w-56 -translate-x-1/2 overflow-hidden rounded-xl bg-white p-1 text-left shadow-xl dark:bg-stone-800">
                {accountPicker.options.map((opt) => {
                  const isSelected = opt.key === accountPicker.selected;
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => {
                        accountPicker.onSelect(opt.key);
                        setPickerOpen(false);
                      }}
                      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-stone-50 active:bg-stone-100 dark:hover:bg-stone-700 dark:active:bg-stone-600"
                    >
                      <Check size={14} className={isSelected ? 'text-brand' : 'text-transparent'} />
                      <span className="text-stone-500 dark:text-stone-400">{opt.icon}</span>
                      {opt.dotColor && (
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: opt.dotColor }} />
                      )}
                      <span className="min-w-0 flex-1 truncate font-medium text-stone-800 dark:text-stone-100">
                        {opt.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      ) : (
        <p className="text-sm font-medium text-stone-600 dark:text-white/80">{label}</p>
      )}

      {editing ? (
        <div className="mt-2 w-full max-w-xs">
          {confirmAmount !== null ? (
            <>
              <p className="text-sm text-stone-700 dark:text-white">
                Set balance to {formatCurrency(confirmAmount, currency)}?
              </p>
              <div className="mt-2 flex items-center justify-center gap-2">
                <button
                  onClick={() => void commitSave(confirmAmount)}
                  disabled={saving}
                  className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white transition-transform active:scale-95 disabled:opacity-60"
                >
                  {saving ? 'Saving…' : 'Yes, set it'}
                </button>
                <button
                  onClick={() => setConfirmAmount(null)}
                  className="rounded-lg bg-stone-900/5 px-3 py-1.5 text-sm font-medium text-stone-700 transition-transform active:scale-95 dark:bg-white/10 dark:text-white/80"
                >
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  inputMode="decimal"
                  autoFocus
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  className="w-full min-w-0 rounded-lg border border-stone-200 bg-white px-2 py-1 text-center text-2xl font-bold tracking-tight tabular-nums text-stone-900 outline-none focus:border-brand dark:border-stone-700 dark:bg-stone-800 dark:text-white"
                />
                <button
                  onClick={attemptSave}
                  disabled={saving}
                  aria-label="Save balance"
                  className="shrink-0 rounded-lg bg-brand p-1.5 text-white transition-transform active:scale-90 disabled:opacity-60"
                >
                  <Check size={18} />
                </button>
                <button
                  onClick={cancel}
                  aria-label="Cancel editing balance"
                  className="shrink-0 rounded-lg bg-stone-900/5 p-1.5 text-stone-700 transition-transform active:scale-90 dark:bg-white/10 dark:text-white/80"
                >
                  <X size={18} />
                </button>
              </div>
              <p className="mt-1 text-xs text-stone-500 dark:text-white/70">
                Adjusts your starting balance -- this won't add a transaction.
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="mt-1 flex items-center gap-1.5">
          <p
            key={balance}
            className={`animate-value-pop text-4xl font-bold tracking-tight tabular-nums ${
              isNegative ? 'text-red-600 dark:text-red-400' : 'text-[#1b347d] dark:text-white'
            }`}
          >
            {formatCurrency(balance, currency)}
          </p>
          {onSave && (
            <button
              onClick={startEdit}
              aria-label="Edit balance"
              className="rounded-lg p-1 text-stone-400 transition-all hover:text-stone-700 active:scale-90 dark:text-white/50 dark:hover:text-white"
            >
              <Pencil size={16} />
            </button>
          )}
        </div>
      )}

      {!editing && sublabel && (
        <p className="mt-0.5 text-xs tabular-nums text-stone-500 dark:text-white/70" style={liabilityColor ? { color: liabilityColor } : undefined}>
          {sublabel}
        </p>
      )}

      {error && <p className="animate-shake mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
