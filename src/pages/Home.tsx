import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useProfile } from '../hooks/useProfile';
import { useCategories } from '../hooks/useCategories';
import { useBudgets } from '../hooks/useBudgets';
import { useTransactions } from '../hooks/useTransactions';
import { useBalance } from '../hooks/useBalance';
import { BalanceCard } from '../components/BalanceCard';
import { BudgetProgress } from '../components/BudgetProgress';
import { TransactionRow } from '../components/TransactionRow';
import { AddTransactionSheet } from '../components/AddTransactionSheet';
import { monthRange } from '../lib/format';

export function Home() {
  const { profile } = useProfile();
  const { categories } = useCategories();
  const { budgets } = useBudgets();
  const { balance, refetch: refetchBalance } = useBalance(profile?.starting_balance);
  const [showAdd, setShowAdd] = useState(false);

  const { start, end } = monthRange(new Date());
  const { transactions: monthTransactions, addTransaction, refetch: refetchMonth } = useTransactions(categories, {
    start,
    end,
  });
  const { transactions: recent, refetch: refetchRecent } = useTransactions(categories, { limit: 5 });

  const currency = profile?.currency ?? 'EGP';
  const monthExpenses = monthTransactions.filter((t) => t.type === 'expense');
  const totalSpent = monthExpenses.reduce((sum, t) => sum + Number(t.amount), 0);

  const spentByCategory = new Map<string, number>();
  for (const t of monthExpenses) {
    if (!t.category_id) continue;
    spentByCategory.set(t.category_id, (spentByCategory.get(t.category_id) ?? 0) + Number(t.amount));
  }

  const handleAdd = async (input: Parameters<typeof addTransaction>[0]) => {
    const result = await addTransaction(input);
    if (!result.error) {
      await Promise.all([refetchMonth(), refetchRecent(), refetchBalance()]);
    }
    return result;
  };

  return (
    <div className="space-y-6 px-4 pb-28 pt-6">
      <BalanceCard balance={balance} currency={currency} />

      {profile?.overall_budget ? (
        <BudgetProgress label="This month's budget" spent={totalSpent} budget={profile.overall_budget} currency={currency} />
      ) : (
        <Link to="/settings" className="block rounded-xl border border-dashed border-slate-300 p-3 text-center text-sm text-slate-500">
          Set a monthly budget in Settings
        </Link>
      )}

      {budgets.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-700">Category budgets</h2>
          {budgets.map((b) => {
            const category = categories.find((c) => c.id === b.category_id);
            if (!category) return null;
            return (
              <BudgetProgress
                key={b.id}
                label={category.name}
                spent={spentByCategory.get(b.category_id) ?? 0}
                budget={b.amount}
                currency={currency}
              />
            );
          })}
        </div>
      )}

      <div>
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">Recent transactions</h2>
          <Link to="/history" className="text-xs font-medium text-brand">
            View all
          </Link>
        </div>
        {recent.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">No transactions yet.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {recent.map((t) => (
              <TransactionRow key={t.id} transaction={t} currency={currency} />
            ))}
          </div>
        )}
      </div>

      <button
        onClick={() => setShowAdd(true)}
        className="fixed bottom-20 right-5 z-20 flex h-14 w-14 items-center justify-center rounded-full bg-brand text-white shadow-lg shadow-brand/30"
        aria-label="Add transaction"
      >
        <Plus size={26} />
      </button>

      {showAdd && (
        <AddTransactionSheet categories={categories} onClose={() => setShowAdd(false)} onAdd={handleAdd} />
      )}
    </div>
  );
}
