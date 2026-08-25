import { useState } from 'react';
import { X } from 'lucide-react';
import { Sheet } from './Sheet';
import type { Card, Category } from '../types';

// Same guideline the category grid elsewhere in the app already applies -- cap the
// first page so picking a category isn't a 9+-way decision before any expansion.
const CATEGORY_VISIBLE_COUNT = 8;

export interface TransactionFilters {
  categoryId: string; // 'all' | category id
  cardId: string; // 'all' | 'cash' | card id
  dateFrom: string;
  dateTo: string;
}

export function TransactionFilterSheet({
  categories,
  cards,
  filters,
  onChange,
  onClose,
}: {
  categories: Category[];
  cards: Card[];
  filters: TransactionFilters;
  onChange: (next: TransactionFilters) => void;
  onClose: () => void;
}) {
  const [showAllCategories, setShowAllCategories] = useState(
    () => categories.findIndex((c) => c.id === filters.categoryId) >= CATEGORY_VISIBLE_COUNT,
  );

  const set = (patch: Partial<TransactionFilters>) => onChange({ ...filters, ...patch });

  return (
    <Sheet onClose={onClose}>
      {(close) => (
        <>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-stone-800 dark:text-stone-100">Filter transactions</h2>
            <button
              onClick={close}
              aria-label="Close"
              className="rounded-full p-1.5 text-stone-500 transition-colors hover:bg-stone-100 active:scale-90 dark:text-stone-400 dark:hover:bg-stone-700"
            >
              <X size={20} />
            </button>
          </div>

          <div className="space-y-5">
            <div>
              <span className="mb-2 block text-xs font-medium text-stone-500 dark:text-stone-400">Category</span>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => set({ categoryId: 'all' })}
                  aria-pressed={filters.categoryId === 'all'}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-all active:scale-95 ${
                    filters.categoryId === 'all' ? 'bg-brand text-white' : 'bg-stone-100 text-stone-600 dark:bg-stone-700 dark:text-stone-300'
                  }`}
                >
                  All
                </button>
                {(showAllCategories ? categories : categories.slice(0, CATEGORY_VISIBLE_COUNT)).map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => set({ categoryId: c.id })}
                    aria-pressed={filters.categoryId === c.id}
                    className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-all active:scale-95 ${
                      filters.categoryId === c.id ? 'bg-brand text-white' : 'bg-stone-100 text-stone-600 dark:bg-stone-700 dark:text-stone-300'
                    }`}
                  >
                    {c.name}
                  </button>
                ))}
                {!showAllCategories && categories.length > CATEGORY_VISIBLE_COUNT && (
                  <button
                    type="button"
                    onClick={() => setShowAllCategories(true)}
                    className="shrink-0 rounded-full bg-stone-100 px-3 py-1.5 text-xs font-medium text-brand transition-all active:scale-95 dark:bg-stone-800"
                  >
                    +{categories.length - CATEGORY_VISIBLE_COUNT} more
                  </button>
                )}
              </div>
            </div>

            {cards.length > 0 && (
              <div>
                <span className="mb-2 block text-xs font-medium text-stone-500 dark:text-stone-400">Paid with</span>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => set({ cardId: 'all' })}
                    aria-pressed={filters.cardId === 'all'}
                    className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-all active:scale-95 ${
                      filters.cardId === 'all' ? 'bg-brand text-white' : 'bg-stone-100 text-stone-600 dark:bg-stone-700 dark:text-stone-300'
                    }`}
                  >
                    All
                  </button>
                  <button
                    type="button"
                    onClick={() => set({ cardId: 'cash' })}
                    aria-pressed={filters.cardId === 'cash'}
                    className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-all active:scale-95 ${
                      filters.cardId === 'cash' ? 'bg-brand text-white' : 'bg-stone-100 text-stone-600 dark:bg-stone-700 dark:text-stone-300'
                    }`}
                  >
                    Cash
                  </button>
                  {cards.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => set({ cardId: c.id })}
                      aria-pressed={filters.cardId === c.id}
                      className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-all active:scale-95 ${
                        filters.cardId === c.id ? 'text-white' : 'bg-stone-100 text-stone-600 dark:bg-stone-700 dark:text-stone-300'
                      }`}
                      style={filters.cardId === c.id ? { backgroundColor: c.color } : undefined}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <span className="mb-2 block text-xs font-medium text-stone-500 dark:text-stone-400">Date range</span>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={filters.dateFrom}
                  max={filters.dateTo || undefined}
                  onChange={(e) => set({ dateFrom: e.target.value })}
                  aria-label="From date"
                  className="min-w-0 flex-1 rounded-xl border border-stone-200 px-3 py-2.5 text-sm outline-none transition-colors focus:border-brand dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100"
                />
                <span className="shrink-0 text-xs text-stone-500 dark:text-stone-400">to</span>
                <input
                  type="date"
                  value={filters.dateTo}
                  min={filters.dateFrom || undefined}
                  onChange={(e) => set({ dateTo: e.target.value })}
                  aria-label="To date"
                  className="min-w-0 flex-1 rounded-xl border border-stone-200 px-3 py-2.5 text-sm outline-none transition-colors focus:border-brand dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={() => set({ categoryId: 'all', cardId: 'all', dateFrom: '', dateTo: '' })}
              className="w-full rounded-xl border border-stone-200 py-2.5 text-sm font-semibold text-stone-600 transition-transform active:scale-[0.98] dark:border-stone-700 dark:text-stone-300"
            >
              Clear filters
            </button>
          </div>
        </>
      )}
    </Sheet>
  );
}
