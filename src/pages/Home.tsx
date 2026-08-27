import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CreditCard, Layers, Pencil, Plus, Wallet } from 'lucide-react';
import { useProfile } from '../hooks/useProfile';
import { useCategories } from '../hooks/useCategories';
import { useBudgets } from '../hooks/useBudgets';
import { useCards } from '../hooks/useCards';
import { useTransactions } from '../hooks/useTransactions';
import { useBalance } from '../hooks/useBalance';
import { BalanceCard, type AccountOption } from '../components/BalanceCard';
import { CardBalances } from '../components/CardBalances';
import { AddCardSheet } from '../components/AddCardSheet';
import { BudgetProgress } from '../components/BudgetProgress';
import { BudgetSheet } from '../components/BudgetSheet';
import { TransactionRow } from '../components/TransactionRow';
import { AddTransactionSheet } from '../components/AddTransactionSheet';
import { formatCurrency, monthRange } from '../lib/format';
import type { Card } from '../types';

type SelectedAccount = 'total' | 'cash' | string;

export function Home() {
  const { profile, loading: profileLoading, updateProfile } = useProfile();
  const { categories } = useCategories();
  const { budgets, setBudget } = useBudgets();
  const { cards, loading: cardsLoading, addCard, updateCard, refetch: refetchCards } = useCards();
  const {
    balance,
    cashBalance,
    balanceByCard,
    loading: balanceLoading,
    refetch: refetchBalance,
  } = useBalance(profile?.starting_balance, cards);
  // Every one of these starts at a real-looking default (0 / null / []) before its
  // first fetch resolves -- without this, the hero would flash "EGP 0.00" on every
  // open, which for a money app reads as "did something go wrong" for a beat.
  const initialLoading = profileLoading || cardsLoading || balanceLoading;
  const [showAdd, setShowAdd] = useState(false);
  const [showBudgetSheet, setShowBudgetSheet] = useState(false);
  const [showAddCard, setShowAddCard] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<SelectedAccount>('total');

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

  const spentByCard = new Map<string, number>();
  let cashSpent = 0;
  for (const t of monthExpenses) {
    if (t.card_id) {
      spentByCard.set(t.card_id, (spentByCard.get(t.card_id) ?? 0) + Number(t.amount));
    } else {
      cashSpent += Number(t.amount);
    }
  }

  const budgetByCategory = new Map(budgets.map((b) => [b.category_id, b.amount]));

  const handleAdd = async (input: Parameters<typeof addTransaction>[0]) => {
    const result = await addTransaction(input);
    if (!result.error) {
      await Promise.all([refetchMonth(), refetchRecent(), refetchBalance()]);
    }
    return result;
  };

  // The edit field takes a *current* balance, so shift the stored starting balance
  // by the same delta rather than overwriting it and losing transaction history.
  const handleBalanceEdit = async (newBalance: number) => {
    const netFromTransactions = cashBalance - (profile?.starting_balance ?? 0);
    const result = await updateProfile({ starting_balance: newBalance - netFromTransactions });
    if (!result.error) await refetchBalance();
    return result;
  };

  const handleCardBalanceEdit = async (card: Card, newBalance: number) => {
    const currentBalance = balanceByCard.get(card.id) ?? 0;
    const netFromTransactions = currentBalance - Number(card.starting_balance);
    const result = await updateCard(card.id, { starting_balance: newBalance - netFromTransactions });
    if (!result.error) await Promise.all([refetchCards(), refetchBalance()]);
    return result;
  };

  const hasCards = cards.length > 0;
  const selectedCard = cards.find((c) => c.id === selectedAccount) ?? null;
  // A selected card that's since been deleted (or the default state) falls back to Total.
  const resolvedAccount: SelectedAccount = selectedAccount === 'cash' || selectedCard ? selectedAccount : 'total';

  let heroLabel = 'Current balance';
  let heroBalance = balance;
  let heroSublabel: string | undefined;
  let heroVariant: 'asset' | 'liability' = 'asset';
  let heroOnSave: ((next: number) => Promise<{ error: string | null }>) | undefined = handleBalanceEdit;
  let heroLiabilityPct: number | undefined;

  const accountOptions: AccountOption[] = [
    { key: 'total', label: 'Total balance', icon: <Layers size={14} /> },
    { key: 'cash', label: 'Cash', icon: <Wallet size={14} /> },
    ...cards.map((c) => ({ key: c.id, label: c.name, icon: <CreditCard size={14} />, dotColor: c.color })),
  ];

  if (hasCards) {
    if (resolvedAccount === 'total') {
      heroLabel = 'Total balance';
      heroBalance = balance;
      heroOnSave = undefined; // an aggregate isn't directly editable
    } else if (resolvedAccount === 'cash') {
      heroLabel = 'Cash';
      heroBalance = cashBalance;
      heroOnSave = handleBalanceEdit;
    } else if (selectedCard) {
      heroLabel = selectedCard.type === 'credit' ? `${selectedCard.name} · owed` : selectedCard.name;
      heroBalance = balanceByCard.get(selectedCard.id) ?? 0;
      heroVariant = selectedCard.type === 'credit' ? 'liability' : 'asset';
      heroOnSave = (next) => handleCardBalanceEdit(selectedCard, next);
      if (selectedCard.type === 'credit' && selectedCard.credit_limit != null) {
        const limit = Number(selectedCard.credit_limit);
        const available = limit - heroBalance;
        heroSublabel = `${formatCurrency(available, currency)} available of ${formatCurrency(limit, currency)} limit`;
        heroLiabilityPct = limit > 0 ? Math.max(0, Math.min(100, (heroBalance / limit) * 100)) : 100;
      }
    }
  }

  return (
    <div className="mesh-bg h-full space-y-6 overflow-y-auto px-4 pb-28 pt-[calc(env(safe-area-inset-top)+1.5rem)]">
      {initialLoading ? (
        <div className="animate-pulse space-y-4" aria-hidden="true">
          <div className="h-[104px] rounded-2xl bg-stone-200 dark:bg-stone-800" />
          <div className="h-16 rounded-xl bg-stone-200 dark:bg-stone-800" />
        </div>
      ) : (
        <>
          {/* Keying on the selection remounts the card, so its edit/error state never
              leaks between accounts when switching. */}
          <BalanceCard
            key={resolvedAccount}
            balance={heroBalance}
            currency={currency}
            label={heroLabel}
            sublabel={heroSublabel}
            variant={heroVariant}
            onSave={heroOnSave}
            liabilityPct={heroLiabilityPct}
            accountPicker={hasCards ? { options: accountOptions, selected: resolvedAccount, onSelect: setSelectedAccount } : undefined}
          />

          <CardBalances
            cards={cards}
            balanceByCard={balanceByCard}
            cashBalance={cashBalance}
            spentByCard={spentByCard}
            cashSpent={cashSpent}
            currency={currency}
            selected={resolvedAccount}
            onSelect={setSelectedAccount}
            onAddCard={() => setShowAddCard(true)}
          />
        </>
      )}

      {profile?.overall_budget ? (
        <div className="rounded-2xl bg-white p-4 shadow-sm shadow-stone-200/60 dark:bg-stone-900 dark:shadow-black/40">
          <div className="mb-1 flex items-center justify-end">
            <button
              onClick={() => setShowBudgetSheet(true)}
              aria-label="Edit budget"
              className="flex items-center gap-1 text-xs font-medium text-brand transition-transform active:scale-95"
            >
              <Pencil size={12} />
              Edit budget
            </button>
          </div>
          <BudgetProgress label="This month's budget" spent={totalSpent} budget={profile.overall_budget} currency={currency} />
        </div>
      ) : (
        <button
          onClick={() => setShowBudgetSheet(true)}
          className="block w-full rounded-xl border border-dashed border-stone-300 bg-white p-3 text-center text-sm text-stone-500 transition-all active:scale-[0.98] dark:border-stone-700 dark:bg-stone-800 dark:text-stone-400"
        >
          Set a monthly budget
        </button>
      )}

      {budgets.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-stone-700 dark:text-stone-300">Category budgets</h2>
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

      <div className="rounded-2xl bg-white p-4 shadow-sm shadow-stone-200/60 dark:bg-stone-900 dark:shadow-black/40">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-stone-700 dark:text-stone-300">Recent transactions</h2>
          <Link to="/history" className="text-xs font-medium text-brand transition-opacity active:opacity-60">
            View all
          </Link>
        </div>
        {recent.length === 0 ? (
          <p className="py-6 text-center text-sm text-stone-600 dark:text-stone-400">No transactions yet.</p>
        ) : (
          <div className="divide-y divide-stone-100 dark:divide-stone-800">
            {recent.map((t, i) => (
              <div key={t.id} className="animate-row-in" style={{ animationDelay: `${Math.min(i, 6) * 40}ms` }}>
                <TransactionRow transaction={t} currency={currency} />
              </div>
            ))}
          </div>
        )}
      </div>

      <button
        onClick={() => setShowAdd(true)}
        className="fixed bottom-20 right-5 z-20 flex h-14 w-14 items-center justify-center rounded-full bg-brand text-white shadow-lg shadow-brand/30 transition-transform duration-200 active:scale-90"
        aria-label="Add transaction"
      >
        <Plus size={26} className={`transition-transform duration-200 ${showAdd ? 'rotate-45' : 'rotate-0'}`} />
      </button>

      {showAdd && (
        <AddTransactionSheet
          categories={categories}
          cards={cards}
          onClose={() => setShowAdd(false)}
          onAdd={handleAdd}
        />
      )}

      {showBudgetSheet && (
        <BudgetSheet
          profile={profile}
          categories={categories}
          budgetByCategory={budgetByCategory}
          onClose={() => setShowBudgetSheet(false)}
          onSaveOverallBudget={(amount) => updateProfile({ overall_budget: amount })}
          onSaveCategoryBudget={(categoryId, amount) => setBudget(categoryId, amount)}
        />
      )}

      {showAddCard && (
        <AddCardSheet cards={cards} currency={currency} onSubmit={addCard} onClose={() => setShowAddCard(false)} />
      )}
    </div>
  );
}
