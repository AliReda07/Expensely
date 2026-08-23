import { formatCurrency } from '../lib/format';

export function BudgetProgress({
  label,
  spent,
  budget,
  currency,
}: {
  label: string;
  spent: number;
  budget: number;
  currency: string;
}) {
  const pct = budget > 0 ? Math.min((spent / budget) * 100, 100) : 0;
  const over = spent > budget;
  const barColor = over ? 'bg-red-500' : pct >= 75 ? 'bg-amber-500' : 'bg-brand';

  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium text-slate-700">{label}</span>
        <span className={over ? 'font-semibold text-red-600' : 'text-slate-500'}>
          {formatCurrency(spent, currency)} / {formatCurrency(budget, currency)}
        </span>
      </div>
      <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
