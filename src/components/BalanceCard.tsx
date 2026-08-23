import { useState } from 'react';
import { Check, Pencil, X } from 'lucide-react';
import { formatCurrency } from '../lib/format';

export function BalanceCard({
  balance,
  currency,
  onSave,
}: {
  balance: number;
  currency: string;
  onSave?: (newBalance: number) => Promise<{ error: string | null }>;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="rounded-2xl bg-gradient-to-br from-brand to-brand-dark p-5 text-white shadow-lg shadow-brand/20">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-white/80">Current balance</p>
        {onSave && !editing && (
          <button onClick={startEdit} aria-label="Edit balance" className="text-white/70 hover:text-white">
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
            className="w-full min-w-0 rounded-lg bg-white/15 px-2 py-1 text-2xl font-bold tracking-tight text-white outline-none placeholder:text-white/50"
          />
          <button
            onClick={save}
            disabled={saving}
            aria-label="Save balance"
            className="shrink-0 rounded-lg bg-white/20 p-1.5 disabled:opacity-60"
          >
            <Check size={18} />
          </button>
          <button onClick={cancel} aria-label="Cancel editing balance" className="shrink-0 rounded-lg bg-white/20 p-1.5">
            <X size={18} />
          </button>
        </div>
      ) : (
        <p className="mt-1 text-3xl font-bold tracking-tight">{formatCurrency(balance, currency)}</p>
      )}

      {error && <p className="mt-1 text-xs text-red-100">{error}</p>}
    </div>
  );
}
