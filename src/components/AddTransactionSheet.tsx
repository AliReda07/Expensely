import { useState } from 'react';
import { X, Trash2 } from 'lucide-react';
import { CategoryIcon } from './CategoryIcon';
import { Sheet } from './Sheet';
import type { Card, Category, TransactionType, TransactionWithCategory } from '../types';
import type { TransactionInput } from '../hooks/useTransactions';

// Caps on how many options show before a "more" toggle -- keeps the initial decision
// within the ~4-item working-memory guideline (rounded up to fill the 4-column category
// grid's first two rows) instead of dumping every category/card on screen at once.
const CATEGORY_VISIBLE_COUNT = 8;
const CARD_VISIBLE_COUNT = 4;

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
  const expenseCategories = categories.filter((c) => c.name !== 'Income');
  const incomeCategory = categories.find((c) => c.name === 'Income') ?? null;

  const [type, setType] = useState<TransactionType>(transaction?.type ?? 'expense');
  const [amount, setAmount] = useState(transaction ? String(transaction.amount) : '');
  const [categoryId, setCategoryId] = useState<string | null>(transaction?.category_id ?? null);
  const [cardId, setCardId] = useState<string | null>(transaction?.card_id ?? null);
  const [date, setDate] = useState(transaction?.date ?? new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState(transaction?.note ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Both grids default to a capped first page so a growing category/card list doesn't
  // turn "pick one" into a wall of options -- but if we're editing a transaction whose
  // category or card already lives past the fold, start expanded so it's visible.
  const [showAllCategories, setShowAllCategories] = useState(
    () => expenseCategories.findIndex((c) => c.id === transaction?.category_id) >= CATEGORY_VISIBLE_COUNT,
  );
  const [showAllCards, setShowAllCards] = useState(
    () => cards.findIndex((c) => c.id === transaction?.card_id) >= CARD_VISIBLE_COUNT,
  );

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
            <h2 className="text-lg font-semibold text-stone-800 dark:text-stone-100">
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
                className="rounded-full p-1.5 text-stone-500 transition-colors hover:bg-stone-100 active:scale-90 dark:text-stone-400 dark:hover:bg-stone-700"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          <div className="relative mb-4 flex rounded-xl bg-stone-100 p-1 dark:bg-stone-700">
            <div
              className="absolute rounded-lg bg-white shadow transition-transform duration-200 ease-out dark:bg-stone-600"
              style={{ top: 4, bottom: 4, left: 4, width: 'calc(50% - 4px)', transform: `translateX(${type === 'income' ? '100%' : '0%'})` }}
            />
            {(['expense', 'income'] as TransactionType[]).map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={`relative z-10 flex-1 rounded-lg py-2 text-sm font-semibold capitalize transition-colors active:scale-95 ${
                  type === t ? 'text-stone-800 dark:text-stone-100' : 'text-stone-500 dark:text-stone-400'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          <label className="mb-4 block">
            <span className="mb-1 block text-xs font-medium text-stone-500 dark:text-stone-400">Amount</span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full rounded-xl border border-stone-200 px-3 py-2.5 text-lg font-semibold tabular-nums outline-none transition-colors focus:border-brand dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100"
            />
          </label>

          {type === 'expense' && (
            <div className="mb-4">
              <span className="mb-2 block text-xs font-medium text-stone-500 dark:text-stone-400">Category</span>
              <div className="grid grid-cols-4 gap-3">
                {(showAllCategories ? expenseCategories : expenseCategories.slice(0, CATEGORY_VISIBLE_COUNT)).map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setCategoryId(c.id)}
                    className={`flex flex-col items-center gap-1 rounded-xl p-2 text-[11px] font-medium text-stone-600 transition-all active:scale-90 dark:text-stone-300 ${
                      categoryId === c.id ? 'ring-2 ring-brand' : ''
                    }`}
                  >
                    <CategoryIcon category={c} />
                    <span className="truncate w-full text-center">{c.name}</span>
                  </button>
                ))}
              </div>
              {!showAllCategories && expenseCategories.length > CATEGORY_VISIBLE_COUNT && (
                <button
                  type="button"
                  onClick={() => setShowAllCategories(true)}
                  className="mt-2 text-xs font-medium text-brand transition-opacity active:opacity-60"
                >
                  Show {expenseCategories.length - CATEGORY_VISIBLE_COUNT} more
                </button>
              )}
            </div>
          )}

          {cards.length > 0 && (
            <div className="mb-4">
              <span className="mb-2 block text-xs font-medium text-stone-500 dark:text-stone-400">Paid with</span>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setCardId(null)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all active:scale-95 ${
                    cardId === null
                      ? 'bg-brand text-white'
                      : 'bg-stone-100 text-stone-600 dark:bg-stone-700 dark:text-stone-300'
                  }`}
                >
                  Cash
                </button>
                {(showAllCards ? cards : cards.slice(0, CARD_VISIBLE_COUNT)).map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCardId(c.id)}
                    className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all active:scale-95 ${
                      cardId === c.id
                        ? 'text-white'
                        : 'bg-stone-100 text-stone-600 dark:bg-stone-700 dark:text-stone-300'
                    }`}
                    style={cardId === c.id ? { backgroundColor: c.color } : undefined}
                  >
                    {c.name}
                    {c.last4 && <span className="tabular-nums opacity-80">••{c.last4}</span>}
                  </button>
                ))}
                {!showAllCards && cards.length > CARD_VISIBLE_COUNT && (
                  <button
                    type="button"
                    onClick={() => setShowAllCards(true)}
                    className="rounded-full px-3 py-1.5 text-xs font-medium text-brand transition-opacity active:opacity-60"
                  >
                    +{cards.length - CARD_VISIBLE_COUNT} more
                  </button>
                )}
              </div>
            </div>
          )}

          <label className="mb-4 block">
            <span className="mb-1 block text-xs font-medium text-stone-500 dark:text-stone-400">Date</span>
            <input
              type="date"
              value={date}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-xl border border-stone-200 px-3 py-2.5 outline-none transition-colors focus:border-brand dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100"
            />
          </label>

          <label className="mb-4 block">
            <span className="mb-1 block text-xs font-medium text-stone-500 dark:text-stone-400">Note (optional)</span>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What was this for?"
              className="w-full rounded-xl border border-stone-200 px-3 py-2.5 outline-none transition-colors focus:border-brand dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:placeholder:text-stone-500"
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
