import { useState, type FormEvent, type ReactNode } from 'react';
import { Banknote, ChevronRight, LogOut, MessageSquareText, Wallet, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useProfile } from '../hooks/useProfile';
import { useCategories } from '../hooks/useCategories';
import { useBudgets } from '../hooks/useBudgets';
import { CategoryIcon } from '../components/CategoryIcon';
import { BudgetSheet } from '../components/BudgetSheet';
import { SmsAutoLogSheet } from '../components/SmsAutoLogSheet';
import { ICON_NAMES, getIcon } from '../lib/icons';

const SWATCHES = ['#f97316', '#3b82f6', '#ec4899', '#ef4444', '#a855f7', '#22c55e', '#14b8a6', '#64748b', '#eab308', '#06b6d4'];

export function Settings() {
  const { user, signOut } = useAuth();
  const { profile, updateProfile } = useProfile();
  const { categories, addCategory, deleteCategory } = useCategories();
  const { budgets, setBudget } = useBudgets();

  const [showBudgets, setShowBudgets] = useState(false);
  const [showSmsSheet, setShowSmsSheet] = useState(false);

  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryIcon, setNewCategoryIcon] = useState(ICON_NAMES[0]);
  const [newCategoryColor, setNewCategoryColor] = useState(SWATCHES[0]);
  const [addingCategory, setAddingCategory] = useState(false);

  const budgetByCategory = new Map(budgets.map((b) => [b.category_id, b.amount]));

  const submitCategory = async (e: FormEvent) => {
    e.preventDefault();
    if (!newCategoryName.trim()) return;
    setAddingCategory(true);
    await addCategory({ name: newCategoryName.trim(), icon: newCategoryIcon, color: newCategoryColor });
    setNewCategoryName('');
    setAddingCategory(false);
  };

  const handleDeleteCategory = async (id: string, name: string) => {
    if (!window.confirm(`Delete "${name}"? Transactions using it will become uncategorized.`)) return;
    await deleteCategory(id);
  };

  return (
    <div className="min-h-full space-y-6 px-4 pb-24 pt-6">
      <h1 className="text-xl font-bold text-slate-800">Settings</h1>

      <SettingsSection title="Account">
        <SettingsRow
          label={user?.email ?? ''}
          sublabel="Signed in"
          icon={<span className="text-sm font-semibold text-brand">{(user?.email ?? '?')[0].toUpperCase()}</span>}
          iconBg="bg-brand/10"
        />
        <SettingsRow
          as="button"
          onClick={() => signOut()}
          label="Sign out"
          icon={<LogOut size={18} className="text-red-500" />}
          iconBg="bg-red-50"
          labelClassName="text-red-600"
          showChevron={false}
        />
      </SettingsSection>

      <SettingsSection title="Your money">
        <SettingsRow
          as="button"
          onClick={() => setShowBudgets(true)}
          label="Budgets"
          sublabel="Overall & per-category limits"
          icon={<Wallet size={18} className="text-emerald-600" />}
          iconBg="bg-emerald-50"
        />
        <SettingsRow label="Currency" value={profile?.currency ?? 'EGP'} icon={<Banknote size={18} className="text-sky-600" />} iconBg="bg-sky-50" />
        <SettingsRow
          as="button"
          onClick={() => setShowSmsSheet(true)}
          label="SMS auto-logging"
          sublabel={profile?.sms_token ? 'Enabled' : 'Log expenses from bank SMS automatically'}
          icon={<MessageSquareText size={18} className="text-violet-600" />}
          iconBg="bg-violet-50"
        />
      </SettingsSection>

      <SettingsSection title="Categories">
        <div className="grid grid-cols-4 gap-3 p-4">
          {categories.map((c) => {
            const deletable = c.user_id === user?.id;
            return (
              <div key={c.id} className="relative flex flex-col items-center gap-1 text-[11px] font-medium text-slate-600">
                <CategoryIcon category={c} />
                <span className="w-full truncate text-center">{c.name}</span>
                {deletable && (
                  <button
                    onClick={() => handleDeleteCategory(c.id, c.name)}
                    aria-label={`Delete ${c.name}`}
                    className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-white shadow"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <form onSubmit={submitCategory} className="space-y-3 border-t border-slate-100 p-4">
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
      </SettingsSection>

      {showBudgets && (
        <BudgetSheet
          profile={profile}
          categories={categories}
          budgetByCategory={budgetByCategory}
          onClose={() => setShowBudgets(false)}
          onSaveOverallBudget={(amount) => updateProfile({ overall_budget: amount })}
          onSaveCategoryBudget={(categoryId, amount) => setBudget(categoryId, amount)}
        />
      )}

      {showSmsSheet && (
        <SmsAutoLogSheet
          profile={profile}
          onClose={() => setShowSmsSheet(false)}
          onSaveToken={(token) => updateProfile({ sms_token: token })}
        />
      )}
    </div>
  );
}

function SettingsSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-600">{title}</h2>
      <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white shadow-sm shadow-slate-200/60">{children}</div>
    </section>
  );
}

function SettingsRow({
  as = 'div',
  onClick,
  icon,
  iconBg,
  label,
  sublabel,
  value,
  labelClassName,
  showChevron = true,
}: {
  as?: 'div' | 'button';
  onClick?: () => void;
  icon: ReactNode;
  iconBg: string;
  label: string;
  sublabel?: string;
  value?: string;
  labelClassName?: string;
  showChevron?: boolean;
}) {
  const Comp = as;
  return (
    <Comp
      onClick={onClick}
      className={`flex w-full items-center gap-3 px-4 py-3.5 text-left ${as === 'button' ? 'active:bg-slate-50' : ''}`}
    >
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${iconBg}`}>{icon}</span>
      <span className="min-w-0 flex-1">
        <p className={`truncate text-sm font-medium text-slate-800 ${labelClassName ?? ''}`}>{label}</p>
        {sublabel && <p className="truncate text-xs text-slate-600">{sublabel}</p>}
      </span>
      {value && <span className="text-sm text-slate-600">{value}</span>}
      {as === 'button' && showChevron && <ChevronRight size={18} className="shrink-0 text-slate-300" />}
    </Comp>
  );
}
