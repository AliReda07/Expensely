import { ChevronLeft, ChevronRight } from 'lucide-react';
import { monthLabel } from '../lib/format';

export function MonthSelector({
  month,
  onChange,
}: {
  month: Date;
  onChange: (next: Date) => void;
}) {
  const isCurrentMonth =
    month.getFullYear() === new Date().getFullYear() && month.getMonth() === new Date().getMonth();

  const shift = (delta: number) => onChange(new Date(month.getFullYear(), month.getMonth() + delta, 1));

  return (
    <div className="flex items-center justify-between">
      <button
        onClick={() => shift(-1)}
        className="rounded-full p-2 text-slate-500 transition-all hover:bg-slate-100 active:scale-90 dark:text-slate-400 dark:hover:bg-slate-800"
        aria-label="Previous month"
      >
        <ChevronLeft size={18} />
      </button>
      <span key={monthLabel(month)} className="animate-row-in text-sm font-semibold text-slate-700 dark:text-slate-300">
        {monthLabel(month)}
      </span>
      <button
        onClick={() => shift(1)}
        disabled={isCurrentMonth}
        className="rounded-full p-2 text-slate-500 transition-all hover:bg-slate-100 active:scale-90 disabled:opacity-30 disabled:hover:bg-transparent disabled:active:scale-100 dark:text-slate-400 dark:hover:bg-slate-800"
        aria-label="Next month"
      >
        <ChevronRight size={18} />
      </button>
    </div>
  );
}
