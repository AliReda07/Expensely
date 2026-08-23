import { useState } from 'react';
import { X, Trash2 } from 'lucide-react';
import { CategoryIcon } from './CategoryIcon';
import type { Category, TransactionType, TransactionWithCategory } from '../types';
import type { TransactionInput } from '../hooks/useTransactions';

export function AddTransactionSheet({
  categories,
  transaction,
  onClose,
  onAdd,
  onUpdate,
  onDelete,
}: {
  categories: Category[];
  transaction?: TransactionWithCategory;
  onClose: () => void;
  onAdd: (input: TransactionInput) => Promise<{ error: string | null }>;
  onUpdate?: (id: string, patch: Partial<TransactionInput>) => Promise<{ error: string | null }>;
  onDelete?: (id: string) => Promise<{ error: string | null }>;
}) {
  const isEditing = Boolean(transaction);
  const [type, setType] = useState<TransactionType>(transaction?.type ?? 'expense');
  const [amount, setAmount] = useState(transaction ? String(transaction.amount) : '');
  const [categoryId, setCategoryId] = useState<string | null>(transaction?.category_id ?? null);
  const [date, setDate] = useState(transaction?.date ?? new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState(transaction?.note ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const expenseCategories = categories.filter((c) => c.name !== 'Income');
  const incomeCategory = categories.find((c) => c.name === 'Income') ?? null;

  const submit = async () => {
    const numericAmount = Number(amount);
    if (!numericAmount || numericAmount <= 0) {
      setError('Enter an amount greater than 0.');
      return;
    }
    if (type === 'expense' && !categoryId) {
      setError('Pick a category.');
      return;
    }

    const input: TransactionInput = {
      type,
      amount: numericAmount,
      category_id: type === 'expense' ? categoryId : (incomeCategory?.id ?? null),
      date,
      note: note.trim() || null,
    };

    setSaving(true);
    const { error } = isEditing && onUpdate ? await onUpdate(transaction!.id, input) : await onAdd(input);
    setSaving(false);

    if (error) {
      setError(error);
      return;
    }
    onClose();
  };

  const remove = async () => {
    if (!transaction || !onDelete) return;
    setDeleting(true);
    const { error } = await onDelete(transaction.id);
    setDeleting(false);
    if (error) {
      setError(error);
      return;
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-t-2xl bg-white p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-800">{isEditing ? 'Edit transaction' : 'Add transaction'}</h2>
          <div className="flex items-center gap-1">
            {isEditing && onDelete && (
              <button
                onClick={remove}
                disabled={deleting}
                className="rounded-full p-1.5 text-red-500 hover:bg-red-50"
                aria-label="Delete transaction"
              >
                <Trash2 size={18} />
              </button>
            )}
            <button onClick={onClose} className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100">
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
          {(['expense', 'income'] as TransactionType[]).map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={`rounded-lg py-2 text-sm font-semibold capitalize transition-colors ${
                type === t ? 'bg-white text-slate-800 shadow' : 'text-slate-500'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <label className="mb-4 block">
          <span className="mb-1 block text-xs font-medium text-slate-500">Amount</span>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-lg font-semibold outline-none focus:border-brand"
          />
        </label>

        {type === 'expense' && (
          <div className="mb-4">
            <span className="mb-2 block text-xs font-medium text-slate-500">Category</span>
            <div className="grid grid-cols-4 gap-3">
              {expenseCategories.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setCategoryId(c.id)}
                  className={`flex flex-col items-center gap-1 rounded-xl p-2 text-[11px] font-medium text-slate-600 ${
                    categoryId === c.id ? 'ring-2 ring-brand' : ''
                  }`}
                >
                  <CategoryIcon category={c} />
                  <span className="truncate w-full text-center">{c.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <label className="mb-4 block">
          <span className="mb-1 block text-xs font-medium text-slate-500">Date</span>
          <input
            type="date"
            value={date}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-brand"
          />
        </label>

        <label className="mb-4 block">
          <span className="mb-1 block text-xs font-medium text-slate-500">Note (optional)</span>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What was this for?"
            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-brand"
          />
        </label>

        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

        <button
          onClick={submit}
          disabled={saving}
          className="w-full rounded-xl bg-brand py-3 font-semibold text-white disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}
