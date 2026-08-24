import { CreditCard, X } from 'lucide-react';
import { formatCurrency } from '../lib/format';
import { AddCardForm } from './AddCardForm';
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
  const remove = async (card: Card) => {
    const label = card.last4 ? `${card.name} ••${card.last4}` : card.name;
    if (!window.confirm(`Remove "${label}"? Its transactions are kept but become unassigned.`)) return;
    await onDelete(card.id);
  };

  return (
    <>
      <div className="space-y-3 p-4">
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Add a card</p>
        <AddCardForm cards={cards} currency={currency} onAdd={onAdd} />
      </div>

      {cards.length > 0 && (
        <ul className="divide-y divide-slate-100 border-t border-slate-100 dark:divide-slate-700 dark:border-slate-700">
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
                  <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{c.name}</p>
                  {c.type === 'credit' && (
                    <span className="shrink-0 rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">
                      Credit
                    </span>
                  )}
                </span>
                <p className="truncate text-xs tabular-nums text-slate-600 dark:text-slate-400">
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
    </>
  );
}
