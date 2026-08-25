import { useState } from 'react';
import { CreditCard, Plus, X } from 'lucide-react';
import { formatCurrency } from '../lib/format';
import { AddCardSheet } from './AddCardSheet';
import type { CardInput } from '../hooks/useCards';
import type { Card } from '../types';

export function CardsSection({
  cards,
  currency,
  onAdd,
  onDelete,
}: {
  cards: Card[];
  currency: string;
  onAdd: (input: CardInput) => Promise<{ error: string | null }>;
  onDelete: (id: string) => Promise<{ error: string | null }>;
}) {
  const [showAdd, setShowAdd] = useState(false);

  const remove = async (card: Card) => {
    const label = card.last4 ? `${card.name} ••${card.last4}` : card.name;
    if (!window.confirm(`Remove "${label}"? Its transactions are kept but become unassigned.`)) return;
    await onDelete(card.id);
  };

  return (
    <>
      <div className="p-4">
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-stone-300 py-2.5 text-sm font-medium text-stone-600 transition-all active:scale-[0.98] dark:border-stone-600 dark:text-stone-300"
        >
          <Plus size={16} />
          Add a card
        </button>
      </div>

      {cards.length > 0 && (
        <ul className="divide-y divide-stone-100 border-t border-stone-100 dark:divide-stone-700 dark:border-stone-700">
          {cards.map((c, i) => (
            <li
              key={c.id}
              className="animate-row-in flex items-center gap-3 px-4 py-3"
              style={{ animationDelay: `${Math.min(i, 6) * 30}ms` }}
            >
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                style={{ backgroundColor: `${c.color}1a`, color: c.color }}
              >
                <CreditCard size={18} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <p className="truncate text-sm font-medium text-stone-800 dark:text-stone-100">{c.name}</p>
                  {c.type === 'credit' && (
                    <span className="shrink-0 rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">
                      Credit
                    </span>
                  )}
                </span>
                <p className="truncate text-xs tabular-nums text-stone-600 dark:text-stone-400">
                  {c.last4 ? `•••• ${c.last4}` : 'No digits saved'}
                  {c.type === 'credit' && c.credit_limit != null && (
                    <> · Limit {formatCurrency(c.credit_limit, currency)}</>
                  )}
                  {c.bank_sender && <> · from {c.bank_sender}</>}
                </p>
              </span>
              <button
                onClick={() => remove(c)}
                aria-label={`Remove ${c.name}`}
                className="rounded-full p-1.5 text-red-500 transition-all hover:bg-red-50 active:scale-90 dark:text-red-400 dark:hover:bg-red-500/10"
              >
                <X size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {showAdd && <AddCardSheet cards={cards} currency={currency} onAdd={onAdd} onClose={() => setShowAdd(false)} />}
    </>
  );
}
