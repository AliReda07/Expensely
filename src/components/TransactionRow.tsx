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
      className="flex w-full items-center gap-3 py-3 text-left disabled:cursor-default"
      disabled={!onClick}
    >
      <CategoryIcon category={transaction.category} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-800">
          {transaction.category?.name ?? 'Uncategorized'}
        </p>
        <p className="truncate text-xs text-slate-400">
          {formatDate(transaction.date)}
          {transaction.note ? ` · ${transaction.note}` : ''}
        </p>
      </div>
      <span className={`text-sm font-semibold ${isIncome ? 'text-brand' : 'text-slate-800'}`}>
        {isIncome ? '+' : '-'}
        {formatCurrency(transaction.amount, currency)}
      </span>
    </button>
  );
}
