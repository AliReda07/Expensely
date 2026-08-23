import { useState, type FormEvent } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useProfile } from '../hooks/useProfile';
import { useCategories } from '../hooks/useCategories';
import { useBudgets } from '../hooks/useBudgets';
import { CategoryIcon } from '../components/CategoryIcon';
import { ICON_NAMES, getIcon } from '../lib/icons';

const SWATCHES = ['#f97316', '#3b82f6', '#ec4899', '#ef4444', '#a855f7', '#22c55e', '#14b8a6', '#64748b', '#eab308', '#06b6d4'];

export function Settings() {
  const { user, signOut } = useAuth();
  const { profile, updateProfile } = useProfile();
  const { categories, addCategory } = useCategories();
  const { budgets, setBudget } = useBudgets();

  const [startingBalance, setStartingBalance] = useState('');
  const [overallBudget, setOverallBudget] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryIcon, setNewCategoryIcon] = useState(ICON_NAMES[0]);
  const [newCategoryColor, setNewCategoryColor] = useState(SWATCHES[0]);
  const [addingCategory, setAddingCategory] = useState(false);

  const expenseCategories = categories.filter((c) => c.name !== 'Income');

  const saveProfile = async (e: FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    await updateProfile({
      ...(startingBalance !== '' ? { starting_balance: Number(startingBalance) } : {}),
      ...(overallBudget !== '' ? { overall_budget: Number(overallBudget) } : {}),
    });
    setStartingBalance('');
    setOverallBudget('');
    setSavingProfile(false);
  };

  const submitCategory = async (e: FormEvent) => {
    e.preventDefault();
    if (!newCategoryName.trim()) return;
    setAddingCategory(true);
    await addCategory({ name: newCategoryName.trim(), icon: newCategoryIcon, color: newCategoryColor });
    setNewCategoryName('');
    setAddingCategory(false);
  };

  return (
    <div className="space-y-8 px-4 pb-24 pt-6">
      <h1 className="text-xl font-bold text-slate-800">Settings</h1>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Balance & budget</h2>
        <form onSubmit={saveProfile} className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500">
              Starting balance (currently {profile?.starting_balance ?? 0} {profile?.currency})
            </span>
            <input
              type="number"
              step="0.01"
              value={startingBalance}
              onChange={(e) => setStartingBalance(e.target.value)}
              placeholder="e.g. 5000"
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-brand"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500">
              Overall monthly budget{profile?.overall_budget ? ` (currently ${profile.overall_budget} ${profile.currency})` : ''}
            </span>
            <input
              type="number"
              step="0.01"
              value={overallBudget}
              onChange={(e) => setOverallBudget(e.target.value)}
              placeholder="e.g. 8000"
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-brand"
            />
          </label>
          <button
            type="submit"
            disabled={savingProfile}
            className="w-full rounded-xl bg-brand py-2.5 font-semibold text-white disabled:opacity-60"
          >
            {savingProfile ? 'Saving…' : 'Save'}
          </button>
        </form>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Category budgets</h2>
        <div className="space-y-3">
          {expenseCategories.map((c) => {
            const existing = budgets.find((b) => b.category_id === c.id);
            return (
              <CategoryBudgetRow
                key={c.id}
                categoryId={c.id}
                categoryName={c.name}
                initialAmount={existing?.amount}
                onSave={(amount) => setBudget(c.id, amount)}
              />
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Categories</h2>
        <div className="mb-4 grid grid-cols-4 gap-3">
          {categories.map((c) => (
            <div key={c.id} className="flex flex-col items-center gap-1 text-[11px] font-medium text-slate-600">
              <CategoryIcon category={c} />
              <span className="truncate w-full text-center">{c.name}</span>
            </div>
          ))}
        </div>

        <form onSubmit={submitCategory} className="space-y-3 rounded-xl border border-slate-100 p-3">
          <p className="text-xs font-medium text-slate-500">Add a custom category</p>
          <input
            type="text"
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            placeholder="Category name"
            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-brand"
          />
          <div className="flex flex-wrap gap-2">
            {ICON_NAMES.map((name) => {
              const Icon = getIcon(name);
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => setNewCategoryIcon(name)}
                  className={`rounded-lg p-2 ${newCategoryIcon === name ? 'bg-brand/10 ring-2 ring-brand' : 'bg-slate-50'}`}
                >
                  <Icon size={18} className="text-slate-600" />
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-2">
            {SWATCHES.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => setNewCategoryColor(color)}
                className={`h-7 w-7 rounded-full ${newCategoryColor === color ? 'ring-2 ring-offset-2 ring-slate-400' : ''}`}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
          <button
            type="submit"
            disabled={addingCategory}
            className="w-full rounded-xl border border-brand py-2.5 font-semibold text-brand disabled:opacity-60"
          >
            {addingCategory ? 'Adding…' : 'Add category'}
          </button>
        </form>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Account</h2>
        <p className="mb-3 text-sm text-slate-500">{user?.email}</p>
        <button onClick={() => signOut()} className="w-full rounded-xl border border-slate-200 py-2.5 font-semibold text-slate-700">
          Sign out
        </button>
      </section>
    </div>
  );
}

function CategoryBudgetRow({
  categoryName,
  initialAmount,
  onSave,
}: {
  categoryId: string;
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
        type="number"
        step="0.01"
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
