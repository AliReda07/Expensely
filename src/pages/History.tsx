import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Search } from 'lucide-react';
import { useProfile } from '../hooks/useProfile';
import { useCategories } from '../hooks/useCategories';
import { useTransactions } from '../hooks/useTransactions';
import { TransactionRow } from '../components/TransactionRow';
import { AddTransactionSheet } from '../components/AddTransactionSheet';
import type { TransactionWithCategory } from '../types';

export function History() {
  const { profile } = useProfile();
  const { categories } = useCategories();
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
          className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100"
        >
          <ArrowLeft size={20} />
        </Link>
        <h1 className="text-xl font-bold text-slate-800">Transactions</h1>
      </div>

      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by note or category"
          className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-brand"
        />
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        <button
          onClick={() => setCategoryFilter('all')}
          className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium ${
            categoryFilter === 'all' ? 'bg-brand text-white' : 'bg-slate-100 text-slate-600'
          }`}
        >
          All
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            onClick={() => setCategoryFilter(c.id)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium ${
              categoryFilter === c.id ? 'bg-brand text-white' : 'bg-slate-100 text-slate-600'
            }`}
          >
            {c.name}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-400">No transactions found.</p>
      ) : (
        <div className="divide-y divide-slate-100">
          {filtered.map((t) => (
            <TransactionRow key={t.id} transaction={t} currency={currency} onClick={() => setEditing(t)} />
          ))}
        </div>
      )}

      {editing && (
        <AddTransactionSheet
          categories={categories}
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
