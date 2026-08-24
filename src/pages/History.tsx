import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Search } from 'lucide-react';
import { useProfile } from '../hooks/useProfile';
import { useCategories } from '../hooks/useCategories';
import { useCards } from '../hooks/useCards';
import { useTransactions } from '../hooks/useTransactions';
import { TransactionRow } from '../components/TransactionRow';
import { AddTransactionSheet } from '../components/AddTransactionSheet';
import type { TransactionWithCategory } from '../types';

export function History() {
  const { profile } = useProfile();
  const { categories } = useCategories();
  const { cards } = useCards();
  const { transactions, addTransaction, updateTransaction, deleteTransaction } = useTransactions(categories);
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [editing, setEditing] = useState<TransactionWithCategory | null>(null);

  const currency = profile?.currency ?? 'EGP';

  const filtered = useMemo(() => {
    return transactions.filter((t) => {
      if (categoryFilter !== 'all' && t.category_id !== categoryFilter) return false;
      if (query.trim()) {
        const q = query.trim().toLowerCase();
        const matchesNote = t.note?.toLowerCase().includes(q);
        const matchesCategory = t.category?.name.toLowerCase().includes(q);
        if (!matchesNote && !matchesCategory) return false;
      }
      return true;
    });
  }, [transactions, query, categoryFilter]);

  return (
    <div className="space-y-4 px-4 pb-24 pt-6">
      <div className="flex items-center gap-3">
        <Link
          to="/"
          aria-label="Back to Home"
          className="rounded-full p-1.5 text-slate-500 transition-all hover:bg-slate-100 active:scale-90 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          <ArrowLeft size={20} />
        </Link>
        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Transactions</h1>
      </div>

      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by note or category"
          className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-800 outline-none focus:border-brand dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
        />
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        <button
          onClick={() => setCategoryFilter('all')}
          className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-all active:scale-95 ${
            categoryFilter === 'all' ? 'bg-brand text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
          }`}
        >
          All
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            onClick={() => setCategoryFilter(c.id)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-all active:scale-95 ${
              categoryFilter === c.id ? 'bg-brand text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
            }`}
          >
            {c.name}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-600 dark:text-slate-400">No transactions found.</p>
      ) : (
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {filtered.map((t, i) => (
            <div key={t.id} className="animate-row-in" style={{ animationDelay: `${Math.min(i, 6) * 30}ms` }}>
              <TransactionRow transaction={t} currency={currency} onClick={() => setEditing(t)} />
            </div>
          ))}
        </div>
      )}

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
    </div>
  );
}
