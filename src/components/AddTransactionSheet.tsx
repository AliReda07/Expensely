import { useState } from 'react';
import { X, Trash2 } from 'lucide-react';
import { CategoryIcon } from './CategoryIcon';
import { Sheet } from './Sheet';
import type { Card, Category, TransactionType, TransactionWithCategory } from '../types';
import type { TransactionInput } from '../hooks/useTransactions';

export function AddTransactionSheet({
  categories,
  cards = [],
  transaction,
  onClose,
  onAdd,
  onUpdate,
  onDelete,
}: {
  categories: Category[];
  cards?: Card[];
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
  const [cardId, setCardId] = useState<string | null>(transaction?.card_id ?? null);
  const [date, setDate] = useState(transaction?.date ?? new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState(transaction?.note ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const expenseCategories = categories.filter((c) => c.name !== 'Income');
  const incomeCategory = categories.find((c) => c.name === 'Income') ?? null;

  const submit = async (close: () => void) => {
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
      card_id: cardId,
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
    close();
  };

  const remove = async (close: () => void) => {
    if (!transaction || !onDelete) return;
    setDeleting(true);
    const { error } = await onDelete(transaction.id);
    setDeleting(false);
    if (error) {
      setError(error);
      return;
    }
    close();
  };

  return (
    <Sheet onClose={onClose}>
      {(close) => (
        <>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
              {isEditing ? 'Edit transaction' : 'Add transaction'}
            </h2>
            <div className="flex items-center gap-1">
              {isEditing && onDelete && (
                <button
                  onClick={() => remove(close)}
                  disabled={deleting}
                  className="rounded-full p-1.5 text-red-500 transition-colors hover:bg-red-50 active:scale-90 dark:text-red-400 dark:hover:bg-red-500/10"
                  aria-label="Delete transaction"
                >
                  <Trash2 size={18} />
                </button>
              )}
              <button
                onClick={close}
                className="rounded-full p-1.5 text-slate-500 transition-colors hover:bg-slate-100 active:scale-90 dark:text-slate-400 dark:hover:bg-slate-700"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          <div className="relative mb-4 flex rounded-xl bg-slate-100 p-1 dark:bg-slate-700">
            <div
              className="absolute rounded-lg bg-white shadow transition-transform duration-200 ease-out dark:bg-slate-600"
              style={{ top: 4, bottom: 4, left: 4, width: 'calc(50% - 4px)', transform: `translateX(${type === 'income' ? '100%' : '0%'})` }}
            />
            {(['expense', 'income'] as TransactionType[]).map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={`relative z-10 flex-1 rounded-lg py-2 text-sm font-semibold capitalize transition-colors active:scale-95 ${
                  type === t ? 'text-slate-800 dark:text-slate-100' : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          <label className="mb-4 block">
            <span className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Amount</span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-lg font-semibold tabular-nums outline-none transition-colors focus:border-brand dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </label>

          {type === 'expense' && (
            <div className="mb-4">
              <span className="mb-2 block text-xs font-medium text-slate-500 dark:text-slate-400">Category</span>
              <div className="grid grid-cols-4 gap-3">
                {expenseCategories.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setCategoryId(c.id)}
                    className={`flex flex-col items-center gap-1 rounded-xl p-2 text-[11px] font-medium text-slate-600 transition-all active:scale-90 dark:text-slate-300 ${
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

          {cards.length > 0 && (
            <div className="mb-4">
              <span className="mb-2 block text-xs font-medium text-slate-500 dark:text-slate-400">Paid with</span>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setCardId(null)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all active:scale-95 ${
                    cardId === null
                      ? 'bg-brand text-white'
                      : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                  }`}
                >
                  Cash
                </button>
                {cards.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCardId(c.id)}
                    className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all active:scale-95 ${
                      cardId === c.id
                        ? 'text-white'
                        : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                    }`}
                    style={cardId === c.id ? { backgroundColor: c.color } : undefined}
                  >
                    {c.name}
                    {c.last4 && <span className="tabular-nums opacity-80">••{c.last4}</span>}
                  </button>
                ))}
              </div>
            </div>
          )}

          <label className="mb-4 block">
            <span className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Date</span>
            <input
              type="date"
              value={date}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none transition-colors focus:border-brand dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </label>

          <label className="mb-4 block">
            <span className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Note (optional)</span>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What was this for?"
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none transition-colors focus:border-brand dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
            />
          </label>

          {error && <p className="animate-shake mb-3 text-sm text-red-600 dark:text-red-400">{error}</p>}

          <button
            onClick={() => submit(close)}
            disabled={saving}
            className="w-full rounded-xl bg-brand py-3 font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </>
      )}
    </Sheet>
  );
}
