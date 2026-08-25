import { useState, type FormEvent } from 'react';
import { Check, X } from 'lucide-react';
import { Sheet } from './Sheet';
import type { Category, Profile } from '../types';

export function BudgetSheet({
  profile,
  categories,
  budgetByCategory,
  onClose,
  onSaveOverallBudget,
  onSaveCategoryBudget,
}: {
  profile: Profile | null;
  categories: Category[];
  budgetByCategory: Map<string, number>;
  onClose: () => void;
  onSaveOverallBudget: (amount: number) => Promise<{ error: string | null }>;
  onSaveCategoryBudget: (categoryId: string, amount: number) => Promise<{ error: string | null }>;
}) {
  const [overallBudget, setOverallBudget] = useState(
    profile?.overall_budget !== null && profile?.overall_budget !== undefined ? String(profile.overall_budget) : ''
  );
  const [savingOverall, setSavingOverall] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const expenseCategories = categories.filter((c) => c.name !== 'Income');

  const saveOverall = async (e: FormEvent) => {
    e.preventDefault();
    const amount = Number(overallBudget);
    if (overallBudget.trim() === '' || Number.isNaN(amount) || amount <= 0) {
      setError('Enter an amount greater than 0.');
      return;
    }
    setError(null);
    setSavingOverall(true);
    const result = await onSaveOverallBudget(amount);
    setSavingOverall(false);
    if (result.error) setError(result.error);
  };

  return (
    <Sheet onClose={onClose}>
      {(close) => (
        <>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-stone-800 dark:text-stone-100">Budgets</h2>
            <button
              onClick={close}
              className="rounded-full p-1.5 text-stone-500 transition-colors hover:bg-stone-100 active:scale-90 dark:text-stone-400 dark:hover:bg-stone-700"
              aria-label="Close"
            >
              <X size={20} />
            </button>
          </div>

          <form onSubmit={saveOverall} className="mb-6 flex items-end gap-2">
            <label className="block flex-1">
              <span className="mb-1 block text-xs font-medium text-stone-500 dark:text-stone-400">
                Overall monthly budget{profile?.overall_budget ? ` (currently ${profile.overall_budget} ${profile.currency})` : ''}
              </span>
              <input
                type="text"
                inputMode="decimal"
                value={overallBudget}
                onChange={(e) => setOverallBudget(e.target.value)}
                placeholder="e.g. 8000"
                className="w-full rounded-xl border border-stone-200 px-3 py-2.5 outline-none transition-colors focus:border-brand dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100"
              />
            </label>
            <button
              type="submit"
              disabled={savingOverall}
              className="rounded-xl bg-brand px-4 py-2.5 font-semibold text-white transition-transform active:scale-95 disabled:opacity-60"
            >
              {savingOverall ? 'Saving…' : 'Save'}
            </button>
          </form>

          {error && <p className="animate-shake mb-4 text-sm text-red-600 dark:text-red-400">{error}</p>}

          <p className="mb-3 text-xs font-medium text-stone-500 dark:text-stone-400">Per-category limits</p>
          <div className="space-y-3">
            {expenseCategories.map((c) => (
              <CategoryBudgetRow
                key={c.id}
                categoryName={c.name}
                initialAmount={budgetByCategory.get(c.id)}
                onSave={(amount) => onSaveCategoryBudget(c.id, amount)}
              />
            ))}
          </div>
        </>
      )}
    </Sheet>
  );
}

function CategoryBudgetRow({
  categoryName,
  initialAmount,
  onSave,
}: {
  categoryName: string;
  initialAmount?: number;
  onSave: (amount: number) => Promise<{ error: string | null }>;
}) {
  const [value, setValue] = useState(initialAmount !== undefined ? String(initialAmount) : '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    const amount = Number(value);
    if (!amount || amount <= 0) return;
    setSaving(true);
    const { error } = await onSave(amount);
    setSaving(false);
    if (!error) {
      setSaved(true);
      setTimeout(() => setSaved(false), 1400);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <span className="flex-1 text-sm text-stone-600 dark:text-stone-300">{categoryName}</span>
      <input
        type="text"
        inputMode="decimal"
        aria-label={`${categoryName} budget`}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="No limit"
        className="w-28 rounded-lg border border-stone-200 px-2 py-1.5 text-sm outline-none transition-colors focus:border-brand dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100"
      />
      <button
        onClick={save}
        disabled={saving}
        className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-all active:scale-95 disabled:opacity-60 ${
          saved
            ? 'bg-brand/10 text-brand'
            : 'bg-stone-100 text-stone-600 dark:bg-stone-700 dark:text-stone-300'
        }`}
      >
        {saved ? <Check size={13} className="animate-value-pop" /> : null}
        {saved ? 'Saved' : 'Save'}
      </button>
    </div>
  );
}
