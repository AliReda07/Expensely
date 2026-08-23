import { useMemo, useState } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid } from 'recharts';
import { useProfile } from '../hooks/useProfile';
import { useCategories } from '../hooks/useCategories';
import { useTransactions } from '../hooks/useTransactions';
import { MonthSelector } from '../components/MonthSelector';
import { formatCurrency, monthRange } from '../lib/format';

const TREND_MONTHS = 6;

export function Insights() {
  const { profile } = useProfile();
  const { categories } = useCategories();
  const [month, setMonth] = useState(() => new Date());
  const currency = profile?.currency ?? 'EGP';

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
    <div className="space-y-6 px-4 pb-24 pt-6">
      <h1 className="text-xl font-bold text-slate-800">Insights</h1>

      <MonthSelector month={month} onChange={setMonth} />

      <div className="rounded-2xl border border-slate-100 p-4">
        <p className="text-sm text-slate-500">Total spent</p>
        <p className="text-2xl font-bold text-slate-800">{formatCurrency(totalSpent, currency)}</p>

        {pieData.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-400">No spending this month.</p>
        ) : (
          <>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={2}>
                    {pieData.map((d) => (
                      <Cell key={d.name} fill={d.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => formatCurrency(Number(value), currency)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="mt-2 space-y-1.5">
              {pieData.map((d) => (
                <li key={d.name} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-slate-600">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                    {d.name}
                  </span>
                  <span className="font-medium text-slate-700">{formatCurrency(d.value, currency)}</span>
                </li>
              ))}
            </ul>
            {topCategory && (
              <p className="mt-3 text-xs text-slate-400">
                You spend the most on <span className="font-semibold text-slate-600">{topCategory.name}</span>.
              </p>
            )}
          </>
        )}
      </div>

      <div className="rounded-2xl border border-slate-100 p-4">
        <p className="mb-2 text-sm font-semibold text-slate-700">Spending trend</p>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trendData} margin={{ left: -20 }}>
              <CartesianGrid vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
              <Tooltip formatter={(value) => formatCurrency(Number(value), currency)} />
              <Line type="monotone" dataKey="total" stroke="#16a34a" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
