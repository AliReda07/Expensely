import { useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import { Sheet } from './Sheet';
import { useCategories } from '../hooks/useCategories';
import { setLargePurchaseThreshold, setMemberBudget } from '../hooks/useFamilySummary';
import { formatCurrency } from '../lib/format';
import type { MemberBudget, MemberSummary } from '../lib/familySummary';

const INPUT =
  'w-full rounded-xl border border-stone-200 px-3 py-2.5 outline-none transition-colors focus:border-brand dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:placeholder:text-stone-500';

function SheetHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <h2 className="text-lg font-semibold text-stone-800 dark:text-stone-100">{title}</h2>
      <button
        onClick={onClose}
        className="rounded-full p-1.5 text-stone-500 transition-colors hover:bg-stone-100 active:scale-90 dark:text-stone-400 dark:hover:bg-stone-700"
        aria-label="Close"
      >
        <X size={20} />
      </button>
    </div>
  );
}

const budgetLabel = (b: MemberBudget) => b.category_name ?? (b.category_id === null ? 'Overall' : 'Category');

/** The parent sets a member's monthly budgets: one overall, plus any preset category. */
export function MemberBudgetSheet({
  member,
  name,
  currency,
  onChanged,
  onClose,
}: {
  member: MemberSummary;
  name: string;
  currency: string;
  /** Called after any successful change so the dashboard can refresh. */
  onChanged: () => void;
  onClose: () => void;
}) {
  const { categories } = useCategories();
  // A member can only be given a budget on a preset category or one of their own, and the parent
  // can only see the presets, so those are the choices.
  const presets = categories.filter((c) => c.is_preset && c.name !== 'Income');
  const [budgets, setBudgets] = useState(member.budgets);
  const [categoryId, setCategoryId] = useState<string>('');
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apply = async (cat: string | null, value: number | null, label: string) => {
    setError(null);
    setSaving(true);
    const result = await setMemberBudget(member.user_id, cat, value);
    setSaving(false);
    if (result.error) return setError(result.error);
    setBudgets((prev) => {
      const rest = prev.filter((b) => b.category_id !== cat);
      return value === null ? rest : [...rest, { category_id: cat, category_name: cat ? label : null, amount: value, spent: 0 }];
    });
    onChanged();
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const value = Number(amount);
    if (!(value > 0)) return setError('Enter an amount greater than 0.');
    const cat = categoryId || null;
    const label = cat ? (presets.find((c) => c.id === cat)?.name ?? 'Category') : 'Overall';
    await apply(cat, value, label);
    setAmount('');
  };

  return (
    <Sheet onClose={onClose}>
      {(close) => (
        <>
          <SheetHeader title={`${name}'s budgets`} onClose={close} />

          {budgets.length > 0 && (
            <ul className="mb-4 divide-y divide-stone-100 rounded-xl border border-stone-100 dark:divide-stone-700 dark:border-stone-700">
              {budgets.map((b) => (
                <li key={b.category_id ?? 'overall'} className="flex items-center gap-3 px-3 py-2.5">
                  <span className="min-w-0 flex-1 truncate text-sm text-stone-800 dark:text-stone-100">{budgetLabel(b)}</span>
                  <span className="text-sm tabular-nums text-stone-700 dark:text-stone-300">{formatCurrency(b.amount, currency)}</span>
                  <button
                    onClick={() => void apply(b.category_id, null, budgetLabel(b))}
                    disabled={saving}
                    aria-label={`Remove the ${budgetLabel(b)} budget`}
                    className="shrink-0 rounded-full p-1 text-stone-500 transition-colors hover:bg-stone-100 disabled:opacity-50 dark:text-stone-400 dark:hover:bg-stone-700"
                  >
                    <X size={16} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <form onSubmit={(e) => void submit(e)} className="space-y-3">
            <select
              aria-label="What the budget covers"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className={INPUT}
            >
              <option value="">Overall monthly budget</option>
              {presets.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <input
              type="text"
              inputMode="decimal"
              aria-label={`Monthly amount in ${currency}`}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={`Monthly amount (${currency})`}
              className={`${INPUT} tabular-nums`}
            />
            <p className="text-xs text-stone-600 dark:text-stone-400">
              Setting a budget that already exists replaces it. {name} can see the budgets you set for them.
            </p>
            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            <button
              type="submit"
              disabled={saving || !amount.trim()}
              className="w-full rounded-xl bg-brand py-2.5 font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save budget'}
            </button>
          </form>
        </>
      )}
    </Sheet>
  );
}

/** The amount above which a single purchase is flagged in the family alerts. */
export function ThresholdSheet({
  current,
  currency,
  onChanged,
  onClose,
}: {
  current: number | null;
  currency: string;
  onChanged: () => void;
  onClose: () => void;
}) {
  const [amount, setAmount] = useState(current ? String(current) : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (value: number | null, close: () => void) => {
    setError(null);
    setSaving(true);
    const result = await setLargePurchaseThreshold(value);
    setSaving(false);
    if (result.error) return setError(result.error);
    onChanged();
    close();
  };

  return (
    <Sheet onClose={onClose}>
      {(close) => (
        <>
          <SheetHeader title="Flag large purchases" onClose={close} />
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const value = Number(amount);
              if (!(value > 0)) return setError('Enter an amount greater than 0, or turn the flag off.');
              void save(value, close);
            }}
            className="space-y-3"
          >
            <p className="text-xs text-stone-600 dark:text-stone-400">
              Purchases at or above this amount, from the last 7 days, show up in the family alerts. Only transactions members share count.
            </p>
            <input
              type="text"
              inputMode="decimal"
              aria-label={`Amount in ${currency}`}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={`Amount (${currency})`}
              className={`${INPUT} tabular-nums`}
            />
            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            <div className="flex gap-2">
              {current !== null && (
                <button
                  type="button"
                  onClick={() => void save(null, close)}
                  disabled={saving}
                  className="rounded-xl border border-stone-200 px-4 py-2.5 text-sm font-semibold text-stone-700 transition-transform active:scale-[0.98] disabled:opacity-50 dark:border-stone-600 dark:text-stone-200"
                >
                  Turn off
                </button>
              )}
              <button
                type="submit"
                disabled={saving || !amount.trim()}
                className="flex-1 rounded-xl bg-brand py-2.5 font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        </>
      )}
    </Sheet>
  );
}
