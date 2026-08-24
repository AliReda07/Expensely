import { useState, type ReactNode } from 'react';
import { Check, ChevronDown, Pencil, X } from 'lucide-react';
import { formatCurrency } from '../lib/format';

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
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const startEdit = () => {
    setValue(String(balance));
    setError(null);
    setEditing(true);
  };

  const cancel = () => {
    setEditing(false);
    setError(null);
  };

  const save = async () => {
    const trimmed = value.trim();
    const amount = Number(trimmed);
    if (trimmed === '' || !/^-?\d+(\.\d+)?$/.test(trimmed) || Number.isNaN(amount)) {
      setError('Enter a valid number');
      return;
    }
    setSaving(true);
    const result = await onSave?.(amount);
    setSaving(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    setEditing(false);
  };

  const isNegative = variant === 'liability' ? balance > 0 : balance < 0;

  return (
    <div
      className={`relative overflow-visible rounded-2xl p-5 text-white shadow-lg transition-shadow duration-500 ${
        isNegative ? 'shadow-red-600/20' : 'shadow-brand/20'
      }`}
    >
      <div
        aria-hidden="true"
        className={`absolute inset-0 overflow-hidden rounded-2xl bg-gradient-to-br from-brand to-brand-dark transition-opacity duration-500 ${
          isNegative ? 'opacity-0' : 'opacity-100'
        }`}
      />
      <div
        aria-hidden="true"
        className={`absolute inset-0 overflow-hidden rounded-2xl bg-gradient-to-br from-red-500 to-red-700 transition-opacity duration-500 ${
          isNegative ? 'opacity-100' : 'opacity-0'
        }`}
      />

      <div className="relative">
        <div className="flex items-center justify-between">
          {accountPicker ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => setPickerOpen((o) => !o)}
                aria-expanded={pickerOpen}
                className="-m-1 flex items-center gap-1 rounded-lg p-1 text-sm font-medium text-white/80 transition-colors hover:text-white"
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
                  <div className="animate-dropdown-in absolute left-0 top-full z-20 mt-2 w-56 overflow-hidden rounded-xl bg-white p-1 text-left shadow-xl dark:bg-slate-800">
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
                          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-slate-50 active:bg-slate-100 dark:hover:bg-slate-700 dark:active:bg-slate-600"
                        >
                          <Check size={14} className={isSelected ? 'text-brand' : 'text-transparent'} />
                          <span className="text-slate-500 dark:text-slate-400">{opt.icon}</span>
                          {opt.dotColor && (
                            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: opt.dotColor }} />
                          )}
                          <span className="min-w-0 flex-1 truncate font-medium text-slate-800 dark:text-slate-100">
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
            <p className="text-sm font-medium text-white/80">{label}</p>
          )}

          {onSave && !editing && (
            <button
              onClick={startEdit}
              aria-label="Edit balance"
              className="rounded-lg p-1 text-white/70 transition-all hover:text-white active:scale-90"
            >
              <Pencil size={16} />
            </button>
          )}
        </div>

        {editing ? (
          <div className="mt-1 flex items-center gap-2">
            <input
              type="text"
              inputMode="decimal"
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="w-full min-w-0 rounded-lg bg-white/15 px-2 py-1 text-2xl font-bold tracking-tight tabular-nums text-white outline-none placeholder:text-white/50"
            />
            <button
              onClick={save}
              disabled={saving}
              aria-label="Save balance"
              className="shrink-0 rounded-lg bg-white/20 p-1.5 transition-transform active:scale-90 disabled:opacity-60"
            >
              <Check size={18} />
            </button>
            <button
              onClick={cancel}
              aria-label="Cancel editing balance"
              className="shrink-0 rounded-lg bg-white/20 p-1.5 transition-transform active:scale-90"
            >
              <X size={18} />
            </button>
          </div>
        ) : (
          <>
            <p key={balance} className="animate-value-pop mt-1 text-3xl font-bold tracking-tight tabular-nums">
              {formatCurrency(balance, currency)}
            </p>
            {sublabel && <p className="mt-0.5 text-xs tabular-nums text-white/70">{sublabel}</p>}
          </>
        )}

        {error && <p className="animate-shake mt-1 text-xs text-red-100">{error}</p>}
      </div>
    </div>
  );
}
