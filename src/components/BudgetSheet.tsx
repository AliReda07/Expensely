import { useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
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
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-800">Budgets</h2>
          <button onClick={onClose} className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={saveOverall} className="mb-6 flex items-end gap-2">
          <label className="block flex-1">
            <span className="mb-1 block text-xs font-medium text-slate-500">
              Overall monthly budget{profile?.overall_budget ? ` (currently ${profile.overall_budget} ${profile.currency})` : ''}
            </span>
            <input
              type="text"
              inputMode="decimal"
              value={overallBudget}
              onChange={(e) => setOverallBudget(e.target.value)}
              placeholder="e.g. 8000"
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-brand"
            />
          </label>
          <button
            type="submit"
            disabled={savingOverall}
            className="rounded-xl bg-brand px-4 py-2.5 font-semibold text-white disabled:opacity-60"
          >
            {savingOverall ? 'Saving…' : 'Save'}
          </button>
        </form>

        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

        <p className="mb-3 text-xs font-medium text-slate-500">Per-category limits</p>
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
      </div>
    </div>
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

  const save = async () => {
    const amount = Number(value);
    if (!amount || amount <= 0) return;
    setSaving(true);
    await onSave(amount);
    setSaving(false);
  };

  return (
    <div className="flex items-center gap-2">
      <span className="flex-1 text-sm text-slate-600">{categoryName}</span>
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="No limit"
        className="w-28 rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-brand"
      />
      <button
        onClick={save}
        disabled={saving}
        className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-600 disabled:opacity-60"
      >
        Save
      </button>
    </div>
  );
}
