import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Search, SlidersHorizontal } from 'lucide-react';
import { useProfile } from '../hooks/useProfile';
import { useCategories } from '../hooks/useCategories';
import { useCards } from '../hooks/useCards';
import { useTransactions } from '../hooks/useTransactions';
import { TransactionRow } from '../components/TransactionRow';
import { AddTransactionSheet } from '../components/AddTransactionSheet';
import { TransactionFilterSheet, type TransactionFilters } from '../components/TransactionFilterSheet';
import type { TransactionWithCategory } from '../types';

const EMPTY_FILTERS: TransactionFilters = { categoryId: 'all', cardId: 'all', dateFrom: '', dateTo: '' };

export function History() {
  const { profile } = useProfile();
  const { categories } = useCategories();
  const { cards } = useCards();
  const { transactions, loading, addTransaction, updateTransaction, deleteTransaction } = useTransactions(categories);
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<TransactionFilters>(EMPTY_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [editing, setEditing] = useState<TransactionWithCategory | null>(null);

  const currency = profile?.currency ?? 'EGP';
  const activeFilterCount = [
    filters.categoryId !== 'all',
    filters.cardId !== 'all',
    filters.dateFrom !== '',
    filters.dateTo !== '',
  ].filter(Boolean).length;

  const filtered = useMemo(() => {
    return transactions.filter((t) => {
      if (filters.categoryId !== 'all' && t.category_id !== filters.categoryId) return false;
      if (filters.cardId === 'cash' && t.card_id !== null) return false;
      if (filters.cardId !== 'all' && filters.cardId !== 'cash' && t.card_id !== filters.cardId) return false;
      if (filters.dateFrom && t.date < filters.dateFrom) return false;
      if (filters.dateTo && t.date > filters.dateTo) return false;
      if (query.trim()) {
        const q = query.trim().toLowerCase();
        const matchesNote = t.note?.toLowerCase().includes(q);
        const matchesCategory = t.category?.name.toLowerCase().includes(q);
        if (!matchesNote && !matchesCategory) return false;
      }
      return true;
    });
  }, [transactions, query, filters]);

  return (
    <div className="mesh-bg h-full space-y-4 overflow-y-auto px-4 pb-24 pt-6">
      <div className="flex items-center gap-3">
        <Link
          to="/"
          aria-label="Back to Home"
          className="rounded-full border border-stone-900/10 bg-white/70 p-1.5 text-stone-500 backdrop-blur-sm transition-all hover:bg-stone-900/5 active:scale-90 dark:border-white/10 dark:bg-stone-900/50 dark:text-stone-400 dark:hover:bg-white/10"
        >
          <ArrowLeft size={20} />
        </Link>
        <h1 className="text-xl font-bold text-white dark:text-stone-100">Transactions</h1>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-500 dark:text-stone-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by note or category"
            aria-label="Search transactions"
            className="w-full rounded-xl border border-stone-200 bg-white py-2.5 pl-9 pr-3 text-sm text-stone-800 outline-none focus:border-brand dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:placeholder:text-stone-500"
          />
        </div>
        <button
          onClick={() => setShowFilters(true)}
          aria-label="Filter transactions"
          className="relative shrink-0 rounded-xl border border-stone-200 bg-white p-2.5 text-stone-600 transition-all active:scale-95 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300"
        >
          <SlidersHorizontal size={18} />
          {activeFilterCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-brand text-[10px] font-semibold text-white">
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      <div className="rounded-2xl bg-white p-4 shadow-sm shadow-stone-200/60 dark:bg-stone-900 dark:shadow-black/40">
        {loading ? (
          <div className="animate-pulse space-y-3" aria-hidden="true">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-14 rounded-xl bg-stone-100 dark:bg-stone-700" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-10 text-center text-sm text-stone-600 dark:text-stone-400">
            {transactions.length === 0 ? (
              <p>No transactions yet.</p>
            ) : (
              <>
                <p>No transactions match your search{activeFilterCount > 0 ? ' and filters' : ''}.</p>
                <button
                  onClick={() => {
                    setQuery('');
                    setFilters(EMPTY_FILTERS);
                  }}
                  className="mt-2 font-medium text-brand transition-opacity active:opacity-60"
                >
                  Clear filters
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="divide-y divide-stone-100 dark:divide-stone-800">
            {filtered.map((t, i) => (
              <div key={t.id} className="animate-row-in" style={{ animationDelay: `${Math.min(i, 6) * 30}ms` }}>
                <TransactionRow transaction={t} currency={currency} onClick={() => setEditing(t)} />
              </div>
            ))}
          </div>
        )}
      </div>

      {editing && (
        <AddTransactionSheet
          categories={categories}
          cards={cards}
          transaction={editing}
          onClose={() => setEditing(null)}
          onAdd={addTransaction}
          onUpdate={updateTransaction}
          onDelete={deleteTransaction}
        />
      )}

      {showFilters && (
        <TransactionFilterSheet
          categories={categories}
          cards={cards}
          filters={filters}
          onChange={setFilters}
          onClose={() => setShowFilters(false)}
        />
      )}
    </div>
  );
}
