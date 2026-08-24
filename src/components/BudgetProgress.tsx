import { formatCurrency } from '../lib/format';

// Green -> amber -> red as spend approaches (and passes) the limit, interpolated smoothly
// rather than snapping between fixed bands.
const COLOR_STOPS: { at: number; rgb: [number, number, number] }[] = [
  { at: 0, rgb: [22, 163, 74] }, // brand green
  { at: 60, rgb: [245, 158, 11] }, // amber-500
  { at: 100, rgb: [220, 38, 38] }, // red-600
];

const BAR_GRADIENT = 'linear-gradient(to right, #16a34a, #f59e0b, #dc2626)';

function progressColor(pct: number): string {
  const clamped = Math.max(0, Math.min(pct, 100));
  const upper = COLOR_STOPS.findIndex((stop) => stop.at >= clamped);
  if (upper <= 0) return `rgb(${COLOR_STOPS[0].rgb.join(',')})`;
  const a = COLOR_STOPS[upper - 1];
  const b = COLOR_STOPS[upper];
  const t = (clamped - a.at) / (b.at - a.at);
  const rgb = a.rgb.map((v, i) => Math.round(v + (b.rgb[i] - v) * t));
  return `rgb(${rgb.join(',')})`;
}

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
        <span className="font-medium text-slate-700 dark:text-slate-300">{label}</span>
        <span
          className={`tabular-nums transition-colors ${
            over ? 'font-semibold text-red-600 dark:text-red-400' : pct === 0 ? 'text-slate-500 dark:text-slate-400' : 'font-medium'
          }`}
          style={!over && pct > 0 ? { color } : undefined}
        >
          {formatCurrency(spent, currency)} / {formatCurrency(budget, currency)}
        </span>
      </div>
      <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
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
