import { useState, type FormEvent, type ReactNode } from 'react';
import { Banknote, ChevronRight, LogOut, MessageSquareText, Monitor, Moon, Sun, Wallet, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useProfile } from '../hooks/useProfile';
import { useCategories } from '../hooks/useCategories';
import { useBudgets } from '../hooks/useBudgets';
import { useCards } from '../hooks/useCards';
import { useTheme } from '../contexts/ThemeContext';
import { CategoryIcon } from '../components/CategoryIcon';
import { CardsSection } from '../components/CardsSection';
import { BudgetSheet } from '../components/BudgetSheet';
import { SmsAutoLogSheet } from '../components/SmsAutoLogSheet';
import { ICON_NAMES, getIcon } from '../lib/icons';

const SWATCHES = ['#f97316', '#3b82f6', '#ec4899', '#ef4444', '#a855f7', '#22c55e', '#14b8a6', '#64748b', '#eab308', '#06b6d4'];

const THEME_OPTIONS = [
  { value: 'light' as const, label: 'Light', icon: Sun },
  { value: 'dark' as const, label: 'Dark', icon: Moon },
  { value: 'system' as const, label: 'System', icon: Monitor },
];

export function Settings() {
  const { user, signOut } = useAuth();
  const { profile, updateProfile } = useProfile();
  const { categories, addCategory, deleteCategory } = useCategories();
  const { budgets, setBudget } = useBudgets();
  const { cards, addCard, deleteCard } = useCards();
  const { theme, setTheme } = useTheme();

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
      <h1 className="text-xl font-bold text-stone-800 dark:text-stone-100">Settings</h1>

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
          icon={<LogOut size={18} className="text-red-500 dark:text-red-400" />}
          iconBg="bg-red-50 dark:bg-red-500/10"
          labelClassName="text-red-600 dark:text-red-400"
          showChevron={false}
        />
      </SettingsSection>

      <SettingsSection title="Appearance">
        <div className="p-4">
          <div className="relative flex rounded-xl bg-stone-100 p-1 dark:bg-stone-700">
            <div
              className="absolute rounded-lg bg-white shadow transition-transform duration-200 ease-out dark:bg-stone-600"
              style={{
                top: 4,
                bottom: 4,
                left: 4,
                width: 'calc((100% - 8px) / 3)',
                transform: `translateX(${THEME_OPTIONS.findIndex((o) => o.value === theme) * 100}%)`,
              }}
            />
            {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => setTheme(value)}
                aria-pressed={theme === value}
                className={`relative z-10 flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-semibold transition-colors active:scale-95 ${
                  theme === value ? 'text-stone-800 dark:text-stone-100' : 'text-stone-500 dark:text-stone-400'
                }`}
              >
                <Icon size={15} />
                {label}
              </button>
            ))}
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title="Your money">
        <SettingsRow
          as="button"
          onClick={() => setShowBudgets(true)}
          label="Budgets"
          sublabel="Overall & per-category limits"
          icon={<Wallet size={18} className="text-emerald-600 dark:text-emerald-400" />}
          iconBg="bg-emerald-50 dark:bg-emerald-500/10"
        />
        <SettingsRow
          label="Currency"
          value={profile?.currency ?? 'EGP'}
          icon={<Banknote size={18} className="text-sky-600 dark:text-sky-400" />}
          iconBg="bg-sky-50 dark:bg-sky-500/10"
        />
        <SettingsRow
          as="button"
          onClick={() => setShowSmsSheet(true)}
          label="SMS auto-logging"
          sublabel={profile?.sms_token ? 'Enabled' : 'Log expenses from bank SMS automatically'}
          icon={<MessageSquareText size={18} className="text-violet-600 dark:text-violet-400" />}
          iconBg="bg-violet-50 dark:bg-violet-500/10"
        />
      </SettingsSection>

      <SettingsSection title="Cards">
        <CardsSection
          cards={cards}
          currency={profile?.currency ?? 'EGP'}
          onAdd={addCard}
          onDelete={deleteCard}
        />
      </SettingsSection>

      <SettingsSection title="Categories">
        <div className="grid grid-cols-4 gap-3 p-4">
          {categories.map((c, i) => {
            const deletable = c.user_id === user?.id;
            return (
              <div
                key={c.id}
                className="animate-row-in relative flex flex-col items-center gap-1 text-[11px] font-medium text-stone-600 transition-transform active:scale-95 dark:text-stone-400"
                style={{ animationDelay: `${Math.min(i, 8) * 25}ms` }}
              >
                <CategoryIcon category={c} />
                <span className="w-full truncate text-center">{c.name}</span>
                {deletable && (
                  <button
                    onClick={() => handleDeleteCategory(c.id, c.name)}
                    aria-label={`Delete ${c.name}`}
                    className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-white shadow transition-transform active:scale-90"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <form onSubmit={submitCategory} className="space-y-3 border-t border-stone-100 p-4 dark:border-stone-700">
          <p className="text-xs font-medium text-stone-500 dark:text-stone-400">Add a custom category</p>
          <input
            type="text"
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            placeholder="Category name"
            className="w-full rounded-xl border border-stone-200 px-3 py-2.5 outline-none focus:border-brand dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:placeholder:text-stone-500"
          />
          <div className="flex flex-wrap gap-2">
            {ICON_NAMES.map((name) => {
              const Icon = getIcon(name);
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => setNewCategoryIcon(name)}
                  className={`rounded-lg p-2 transition-all active:scale-90 ${newCategoryIcon === name ? 'bg-brand/10 ring-2 ring-brand' : 'bg-stone-50 dark:bg-stone-700'}`}
                >
                  <Icon size={18} className="text-stone-600 dark:text-stone-300" />
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
                className={`h-7 w-7 rounded-full transition-all active:scale-90 ${newCategoryColor === color ? 'ring-2 ring-offset-2 ring-stone-400 dark:ring-offset-stone-800' : ''}`}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
          <button
            type="submit"
            disabled={addingCategory}
            className="w-full rounded-xl border border-brand py-2.5 font-semibold text-brand transition-transform active:scale-[0.98] disabled:opacity-60"
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
      <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-stone-600 dark:text-stone-400">{title}</h2>
      <div className="divide-y divide-stone-100 overflow-hidden rounded-2xl bg-white shadow-sm shadow-stone-200/60 dark:divide-stone-700 dark:bg-stone-800 dark:shadow-black/30">
        {children}
      </div>
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
      className={`flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors ${as === 'button' ? 'active:bg-stone-50 dark:active:bg-stone-700/60' : ''}`}
    >
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${iconBg}`}>{icon}</span>
      <span className="min-w-0 flex-1">
        <p className={`truncate text-sm font-medium text-stone-800 dark:text-stone-100 ${labelClassName ?? ''}`}>{label}</p>
        {sublabel && <p className="truncate text-xs text-stone-600 dark:text-stone-400">{sublabel}</p>}
      </span>
      {value && <span className="text-sm text-stone-600 dark:text-stone-400">{value}</span>}
      {as === 'button' && showChevron && <ChevronRight size={18} className="shrink-0 text-stone-300 dark:text-stone-600" />}
    </Comp>
  );
}
