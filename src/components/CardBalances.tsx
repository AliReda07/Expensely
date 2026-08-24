import { CreditCard, Plus, Wallet } from 'lucide-react';
import { formatCurrency } from '../lib/format';
import type { Card } from '../types';

type SelectedAccount = 'total' | 'cash' | string;

interface Row {
  key: string;
  name: string;
  last4: string | null;
  color: string | null;
  type: 'debit' | 'credit' | 'cash';
  balance: number;
  spent: number;
  creditLimit: number | null;
}

export function CardBalances({
  cards,
  balanceByCard,
  cashBalance,
  spentByCard,
  cashSpent,
  currency,
  selected,
  onSelect,
  onAddCard,
}: {
  cards: Card[];
  balanceByCard: Map<string, number>;
  cashBalance: number;
  spentByCard: Map<string, number>;
  cashSpent: number;
  currency: string;
  selected: SelectedAccount;
  onSelect: (account: SelectedAccount) => void;
  onAddCard: () => void;
}) {
  const rows: Row[] = [
    ...cards.map((c) => ({
      key: c.id,
      name: c.name,
      last4: c.last4,
      color: c.color,
      type: c.type,
      balance: balanceByCard.get(c.id) ?? 0,
      spent: spentByCard.get(c.id) ?? 0,
      creditLimit: c.credit_limit,
    })),
    {
      key: 'cash',
      name: 'Cash',
      last4: null,
      color: null,
      type: 'cash' as const,
      balance: cashBalance,
      spent: cashSpent,
      creditLimit: null,
    },
  ];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-stone-700 dark:text-stone-300">Your cards</h2>
        <button
          onClick={onAddCard}
          aria-label="Add card"
          className="-m-2 flex items-center gap-1 p-2 text-xs font-medium text-brand transition-transform active:scale-95"
        >
          <Plus size={13} />
          Add card
        </button>
      </div>
      <ul className="divide-y divide-stone-100 overflow-hidden rounded-2xl bg-white shadow-sm shadow-stone-200/60 dark:divide-stone-700 dark:bg-stone-800 dark:shadow-black/30">
        {rows.map((row, i) => {
          const isActive = selected === row.key;
          const isCredit = row.type === 'credit';
          return (
            <li key={row.key} className="animate-row-in" style={{ animationDelay: `${Math.min(i, 6) * 30}ms` }}>
              <button
                type="button"
                onClick={() => onSelect(row.key)}
                aria-pressed={isActive}
                className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors active:bg-stone-50 dark:active:bg-stone-700/60 ${
                  isActive ? 'bg-brand/5 dark:bg-brand/10' : ''
                }`}
              >
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-2 ring-offset-2 ring-offset-white transition-all dark:ring-offset-stone-800 ${
                    isActive ? 'ring-brand' : 'ring-transparent'
                  }`}
                  style={row.color ? { backgroundColor: `${row.color}1a`, color: row.color } : undefined}
                >
                  {row.type === 'cash' ? (
                    <Wallet size={18} className="text-stone-600 dark:text-stone-300" />
                  ) : (
                    <CreditCard size={18} />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <p className="truncate text-sm font-medium text-stone-800 dark:text-stone-100">{row.name}</p>
                    {row.last4 && (
                      <span className="shrink-0 text-xs tabular-nums text-stone-500 dark:text-stone-400">••{row.last4}</span>
                    )}
                    {isCredit && (
                      <span className="shrink-0 rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">
                        Credit
                      </span>
                    )}
                  </span>
                  <p className="truncate text-xs tabular-nums text-stone-600 dark:text-stone-400">
                    {formatCurrency(row.spent, currency)} spent this month
                  </p>
                </span>
                <span className="text-right">
                  <span
                    className={`block text-sm font-semibold tabular-nums ${
                      (isCredit ? row.balance > 0 : row.balance < 0)
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-stone-800 dark:text-stone-100'
                    }`}
                  >
                    {formatCurrency(row.balance, currency)}
                  </span>
                  {isCredit && (
                    <span className="text-[10px] tabular-nums text-stone-500 dark:text-stone-400">
                      {row.creditLimit != null ? `${formatCurrency(row.creditLimit - row.balance, currency)} left` : 'owed'}
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
