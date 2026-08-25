import { formatCurrency } from '../lib/format';
import { progressColor } from '../lib/color';

const BAR_GRADIENT = 'linear-gradient(to right, #16a34a, #f59e0b, #dc2626)';

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
  const color = progressColor(pct);

  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium text-stone-700 dark:text-stone-300">{label}</span>
        <span
          className={`tabular-nums transition-colors ${
            over ? 'font-semibold text-red-600 dark:text-red-400' : pct === 0 ? 'text-stone-500 dark:text-stone-400' : 'font-medium'
          }`}
          style={!over && pct > 0 ? { color } : undefined}
        >
          {formatCurrency(spent, currency)} / {formatCurrency(budget, currency)}
        </span>
      </div>
      <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-stone-100 dark:bg-stone-700">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${pct}%`,
            backgroundImage: BAR_GRADIENT,
            // The gradient is sized as if it always spans the full track, so the fill
            // reveals more of it (green -> amber -> red) as pct grows, rather than
            // squeezing all three colors into whatever sliver is currently filled.
            backgroundSize: pct > 0 ? `${10000 / pct}% 100%` : '100% 100%',
          }}
        />
      </div>
    </div>
  );
}
