import { useMemo, useState } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid } from 'recharts';
import { useProfile } from '../hooks/useProfile';
import { useCategories } from '../hooks/useCategories';
import { useTransactions } from '../hooks/useTransactions';
import { useCards } from '../hooks/useCards';
import { useTheme } from '../contexts/ThemeContext';
import { MonthSelector } from '../components/MonthSelector';
import { formatCurrency, monthRange } from '../lib/format';

const TREND_MONTHS = 6;

export function Insights() {
  const { profile } = useProfile();
  const { categories } = useCategories();
  const { cards } = useCards();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const [month, setMonth] = useState(() => new Date());
  const currency = profile?.currency ?? 'EGP';
  const gridStroke = isDark ? '#1e293b' : '#f1f5f9';
  const tickFill = isDark ? '#94a3b8' : '#64748b';
  const tooltipStyle = {
    background: isDark ? '#1e293b' : '#ffffff',
    border: `1px solid ${isDark ? '#334155' : '#f1f5f9'}`,
    borderRadius: 8,
    color: isDark ? '#f1f5f9' : '#1e293b',
    fontSize: 13,
  };

  const rangeStart = new Date(month.getFullYear(), month.getMonth() - (TREND_MONTHS - 1), 1);
  const rangeEnd = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  const { transactions } = useTransactions(categories, {
    start: rangeStart.toISOString().slice(0, 10),
    end: rangeEnd.toISOString().slice(0, 10),
  });

  const expenses = transactions.filter((t) => t.type === 'expense');

  const { start: monthStart, end: monthEnd } = monthRange(month);
  const monthExpenses = expenses.filter((t) => t.date >= monthStart && t.date <= monthEnd);

  const pieData = useMemo(() => {
    const totals = new Map<string, number>();
    for (const t of monthExpenses) {
      const key = t.category?.name ?? 'Other';
      totals.set(key, (totals.get(key) ?? 0) + Number(t.amount));
    }
    return Array.from(totals.entries())
      .map(([name, value]) => ({
        name,
        value,
        color: monthExpenses.find((t) => (t.category?.name ?? 'Other') === name)?.category?.color ?? '#64748b',
      }))
      .sort((a, b) => b.value - a.value);
  }, [monthExpenses]);

  const totalSpent = pieData.reduce((sum, d) => sum + d.value, 0);
  const topCategory = pieData[0];

  const cardSpend = useMemo(() => {
    const byCard = new Map<string, number>();
    let cash = 0;
    for (const t of monthExpenses) {
      if (t.card_id) {
        byCard.set(t.card_id, (byCard.get(t.card_id) ?? 0) + Number(t.amount));
      } else {
        cash += Number(t.amount);
      }
    }
    const rows = cards.map((c) => ({
      key: c.id,
      name: c.name,
      last4: c.last4,
      color: c.color,
      value: byCard.get(c.id) ?? 0,
    }));
    if (cash > 0 || rows.length === 0) {
      rows.push({ key: 'cash', name: 'Cash', last4: null, color: '#64748b', value: cash });
    }
    return rows.sort((a, b) => b.value - a.value);
  }, [monthExpenses, cards]);

  const trendData = useMemo(() => {
    const months: { key: string; label: string; total: number }[] = [];
    for (let i = TREND_MONTHS - 1; i >= 0; i--) {
      const d = new Date(month.getFullYear(), month.getMonth() - i, 1);
      months.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleDateString('en-US', { month: 'short' }), total: 0 });
    }
    for (const t of expenses) {
      const d = new Date(t.date + 'T00:00:00');
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const bucket = months.find((m) => m.key === key);
      if (bucket) bucket.total += Number(t.amount);
    }
    return months;
  }, [expenses, month]);

  return (
    <div className="h-full space-y-6 overflow-y-auto px-4 pb-24 pt-6">
      <h1 className="text-xl font-bold text-stone-800 dark:text-stone-100">Insights</h1>

      <MonthSelector month={month} onChange={setMonth} />

      <div
        key={monthStart}
        className="animate-row-in rounded-2xl border border-stone-100 bg-white p-4 shadow-sm shadow-stone-200/60 dark:border-stone-700 dark:bg-stone-800 dark:shadow-black/30"
      >
        <p className="text-sm text-stone-500 dark:text-stone-400">Total spent</p>
        <p className="text-2xl font-bold tabular-nums text-stone-800 dark:text-stone-100">{formatCurrency(totalSpent, currency)}</p>

        {pieData.length === 0 ? (
          <p className="py-10 text-center text-sm text-stone-600 dark:text-stone-400">No spending this month.</p>
        ) : (
          <>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={2}
                    animationDuration={500}
                    animationEasing="ease-out"
                  >
                    {pieData.map((d) => (
                      <Cell key={d.name} fill={d.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => formatCurrency(Number(value), currency)} contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="mt-2 space-y-1.5">
              {pieData.map((d) => (
                <li key={d.name} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-stone-600 dark:text-stone-300">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                    {d.name}
                  </span>
                  <span className="font-medium tabular-nums text-stone-700 dark:text-stone-200">{formatCurrency(d.value, currency)}</span>
                </li>
              ))}
            </ul>
            {topCategory && (
              <p className="mt-3 text-xs text-stone-600 dark:text-stone-400">
                You spend the most on <span className="font-semibold text-stone-600 dark:text-stone-300">{topCategory.name}</span>.
              </p>
            )}
          </>
        )}
      </div>

      {cards.length > 0 && (
        <div className="rounded-2xl border border-stone-100 bg-white p-4 shadow-sm shadow-stone-200/60 dark:border-stone-700 dark:bg-stone-800 dark:shadow-black/30">
          <p className="mb-2 text-sm font-semibold text-stone-700 dark:text-stone-300">Spending by card</p>
          <ul className="space-y-1.5">
            {cardSpend.map((c) => (
              <li key={c.key} className="flex items-center justify-between text-sm">
                <span className="flex min-w-0 items-center gap-2 text-stone-600 dark:text-stone-300">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: c.color }} />
                  <span className="truncate">
                    {c.name}
                    {c.last4 && (
                      <span className="ml-1.5 text-xs tabular-nums text-stone-500 dark:text-stone-400">
                        ••{c.last4}
                      </span>
                    )}
                  </span>
                </span>
                <span className="font-medium tabular-nums text-stone-700 dark:text-stone-200">
                  {formatCurrency(c.value, currency)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-2xl border border-stone-100 bg-white p-4 shadow-sm shadow-stone-200/60 dark:border-stone-700 dark:bg-stone-800 dark:shadow-black/30">
        <p className="mb-2 text-sm font-semibold text-stone-700 dark:text-stone-300">Spending trend</p>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trendData} margin={{ left: -20 }}>
              <CartesianGrid vertical={false} stroke={gridStroke} />
              <XAxis dataKey="label" tick={{ fontSize: 12, fill: tickFill }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12, fill: tickFill }} axisLine={false} tickLine={false} />
              <Tooltip formatter={(value) => formatCurrency(Number(value), currency)} contentStyle={tooltipStyle} />
              <Line
                type="monotone"
                dataKey="total"
                stroke="#16a34a"
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
                animationDuration={600}
                animationEasing="ease-out"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
