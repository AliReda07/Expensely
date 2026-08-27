import { useMemo, useState } from 'react';
import { Tooltip, ResponsiveContainer, LineChart, Line, BarChart, Bar, Cell, LabelList, XAxis, YAxis, CartesianGrid } from 'recharts';
import { useAuth } from '../contexts/AuthContext';
import { useProfile } from '../hooks/useProfile';
import { useCategories } from '../hooks/useCategories';
import { useTransactions } from '../hooks/useTransactions';
import { useCards } from '../hooks/useCards';
import { useTheme } from '../contexts/ThemeContext';
import { MonthSelector } from '../components/MonthSelector';
import { formatCurrency, monthRange } from '../lib/format';
import { NEUTRAL_FALLBACK_COLOR } from '../lib/color';

const TREND_MONTHS = 6;
const CATEGORY_VISIBLE_COUNT = 8;

export function Insights() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const { categories } = useCategories();
  const { cards } = useCards();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const [month, setMonth] = useState(() => new Date());
  const [showAllCategories, setShowAllCategories] = useState(false);
  const currency = profile?.currency ?? 'EGP';
  // Matches the app's (navy-tinted, see index.css) stone dark-mode scale instead of
  // Recharts' default slate -- otherwise the tooltip renders visibly warm-gray on top
  // of its own cool-navy stone-900 card.
  const gridStroke = isDark ? '#2e355c' : '#f5f5f4';
  const tickFill = isDark ? '#a8a29e' : '#78716c';
  const tooltipStyle = {
    background: isDark ? '#1c2140' : '#ffffff',
    border: `1px solid ${isDark ? '#3c456f' : '#e7e5e4'}`,
    borderRadius: 8,
    color: isDark ? '#f5f5f4' : '#1c1917',
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

  const categorySpend = useMemo(() => {
    const totals = new Map<string, number>();
    for (const t of monthExpenses) {
      const key = t.category?.name ?? 'Other';
      totals.set(key, (totals.get(key) ?? 0) + Number(t.amount));
    }
    return Array.from(totals.entries())
      .map(([name, value]) => {
        const match = monthExpenses.find((t) => (t.category?.name ?? 'Other') === name);
        return {
          name,
          value,
          color: match?.category?.color ?? NEUTRAL_FALLBACK_COLOR,
          categoryId: match?.category?.id ?? null,
        };
      })
      .sort((a, b) => b.value - a.value);
  }, [monthExpenses]);

  const totalSpent = categorySpend.reduce((sum, d) => sum + d.value, 0);
  const topCategory = categorySpend[0];
  const visibleCategoryData = showAllCategories ? categorySpend : categorySpend.slice(0, CATEGORY_VISIBLE_COUNT);

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
      rows.push({ key: 'cash', name: 'Cash', last4: null, color: NEUTRAL_FALLBACK_COLOR, value: cash });
    }
    return rows.sort((a, b) => b.value - a.value);
  }, [monthExpenses, cards]);

  const trendData = useMemo(() => {
    // Signup month is the true floor for the trend -- otherwise a brand-new account
    // shows several flat-zero months that look identical to genuine zero-spend months,
    // when really there's just no account yet in that period.
    const signup = user?.created_at ? new Date(user.created_at) : null;
    const signupOrdinal = signup ? signup.getFullYear() * 12 + signup.getMonth() : null;

    const months: { key: string; label: string; total: number }[] = [];
    for (let i = TREND_MONTHS - 1; i >= 0; i--) {
      const d = new Date(month.getFullYear(), month.getMonth() - i, 1);
      const ordinal = d.getFullYear() * 12 + d.getMonth();
      if (signupOrdinal != null && ordinal < signupOrdinal) continue;
      months.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleDateString('en-US', { month: 'short' }), total: 0 });
    }
    for (const t of expenses) {
      const d = new Date(t.date + 'T00:00:00');
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const bucket = months.find((m) => m.key === key);
      if (bucket) bucket.total += Number(t.amount);
    }
    return months;
  }, [expenses, month, user]);

  return (
    <div className="mesh-bg h-full space-y-6 overflow-y-auto px-4 pb-24 pt-[calc(env(safe-area-inset-top)+1.5rem)]">
      <h1 className="text-xl font-bold text-white dark:text-stone-100">Insights</h1>

      <MonthSelector month={month} onChange={setMonth} />

      <div
        key={monthStart}
        className="animate-row-in rounded-2xl bg-white p-4 shadow-sm shadow-stone-200/60 dark:bg-stone-900 dark:shadow-black/40"
      >
        <p className="text-sm text-stone-500 dark:text-stone-400">Total spent</p>
        <p className="text-2xl font-bold tabular-nums text-stone-800 dark:text-stone-100">{formatCurrency(totalSpent, currency)}</p>

        {categorySpend.length === 0 ? (
          <p className="py-10 text-center text-sm text-stone-600 dark:text-stone-400">No spending this month.</p>
        ) : (
          <>
            <div style={{ height: visibleCategoryData.length * 40 + 16 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={visibleCategoryData} layout="vertical" margin={{ left: 8, right: 48 }} barCategoryGap={10}>
                  <CartesianGrid horizontal={false} stroke={gridStroke} />
                  <XAxis
                    type="number"
                    domain={[0, (dataMax: number) => dataMax * 1.2]}
                    tick={{ fontSize: 11, fill: tickFill }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fontSize: 12, fill: tickFill }}
                    axisLine={false}
                    tickLine={false}
                    width={82}
                  />
                  <Tooltip
                    cursor={{ fill: gridStroke, opacity: 0.4 }}
                    formatter={(value) => formatCurrency(Number(value), currency)}
                    contentStyle={tooltipStyle}
                  />
                  <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={20} animationDuration={500} animationEasing="ease-out">
                    {visibleCategoryData.map((d) => (
                      <Cell key={d.name} fill={d.color} />
                    ))}
                    <LabelList
                      dataKey="value"
                      position="right"
                      formatter={(value) => formatCurrency(Number(value), currency)}
                      fill={tickFill}
                      fontSize={11}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            {!showAllCategories && categorySpend.length > CATEGORY_VISIBLE_COUNT && (
              <button
                type="button"
                onClick={() => setShowAllCategories(true)}
                className="mt-2 text-xs font-medium text-brand transition-opacity active:opacity-60"
              >
                Show {categorySpend.length - CATEGORY_VISIBLE_COUNT} more
              </button>
            )}
            {topCategory && (
              <p className="mt-3 text-xs text-stone-600 dark:text-stone-400">
                You spend the most on <span className="font-semibold text-stone-600 dark:text-stone-300">{topCategory.name}</span>.
              </p>
            )}
          </>
        )}
      </div>

      {cards.length > 0 && (
        <div className="rounded-2xl bg-white p-4 shadow-sm shadow-stone-200/60 dark:bg-stone-900 dark:shadow-black/40">
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

      <div className="rounded-2xl bg-white p-4 shadow-sm shadow-stone-200/60 dark:bg-stone-900 dark:shadow-black/40">
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
                stroke="var(--color-brand)"
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
                animationDuration={600}
                animationEasing="ease-out"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        {/* The chart itself is an unlabeled SVG with hover-only tooltips -- this gives
            screen-reader users the same six months of data the sighted chart shows. */}
        <ul className="sr-only">
          {trendData.map((m) => (
            <li key={m.key}>
              {m.label}: {formatCurrency(m.total, currency)}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
