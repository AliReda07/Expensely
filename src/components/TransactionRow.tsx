import { CategoryIcon } from './CategoryIcon';
import { formatCurrency, formatDate } from '../lib/format';
import type { TransactionWithCategory } from '../types';

export function TransactionRow({
  transaction,
  currency,
  onClick,
}: {
  transaction: TransactionWithCategory;
  currency: string;
  onClick?: () => void;
}) {
  const isIncome = transaction.type === 'income';
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-lg py-3 text-left transition-all disabled:cursor-default ${
        onClick ? '-mx-2 px-2 active:scale-[0.98] active:bg-slate-50 dark:active:bg-slate-800/60' : ''
      }`}
      disabled={!onClick}
    >
      <CategoryIcon category={transaction.category} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
          {transaction.category?.name ?? 'Uncategorized'}
        </p>
        <p className="truncate text-xs text-slate-600 dark:text-slate-400">
          {formatDate(transaction.date)}
          {transaction.note ? ` · ${transaction.note}` : ''}
        </p>
      </div>
      <span className={`text-sm font-semibold tabular-nums ${isIncome ? 'text-brand' : 'text-slate-800 dark:text-slate-100'}`}>
        {isIncome ? '+' : '-'}
        {formatCurrency(transaction.amount, currency)}
      </span>
    </button>
  );
}
