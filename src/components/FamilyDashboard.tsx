import { useEffect, useState } from 'react';
import { BellRing, ChevronDown, History, TriangleAlert } from 'lucide-react';
import { MonthSelector } from './MonthSelector';
import { Sheet } from './Sheet';
import { useFamilyAlerts, useFamilySummary, fetchMemberRecent } from '../hooks/useFamilySummary';
import { MemberBudgetSheet, ThresholdSheet } from './FamilyBudgetSheets';
import {
  alertText,
  budgetState,
  combineCategories,
  memberDisplayName,
  shareOfTotal,
  type CategoryTotal,
  type FamilyAlert,
  type MemberSummary,
  type RecentRow,
} from '../lib/familySummary';
import { NEUTRAL_FALLBACK_COLOR } from '../lib/color';
import { formatCurrency, formatDate } from '../lib/format';

const CARD = 'rounded-2xl bg-white p-4 shadow-sm shadow-stone-200/60 dark:bg-stone-900 dark:shadow-black/40';

function Bar({ fraction, color }: { fraction: number; color: string }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-700" aria-hidden="true">
      <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${Math.max(2, fraction * 100)}%`, backgroundColor: color }} />
    </div>
  );
}

function CategoryBars({ categories, currency, limit }: { categories: CategoryTotal[]; currency: string; limit?: number }) {
  const shown = limit ? categories.slice(0, limit) : categories;
  const top = shown[0]?.amount ?? 0;
  return (
    <ul className="space-y-2.5">
      {shown.map((c) => (
        <li key={c.name}>
          <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
            <span className="min-w-0 truncate text-stone-700 dark:text-stone-300">{c.name}</span>
            <span className="shrink-0 tabular-nums text-stone-800 dark:text-stone-100">{formatCurrency(c.amount, currency)}</span>
          </div>
          <Bar fraction={shareOfTotal(c.amount, top)} color={c.color ?? NEUTRAL_FALLBACK_COLOR} />
        </li>
      ))}
    </ul>
  );
}

export function FamilyDashboard({ currency, currentUserId }: { currency: string; currentUserId: string | undefined }) {
  const [month, setMonth] = useState(() => new Date());
  // Bumped after the parent changes a budget or the threshold, so the numbers and alerts refetch.
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = () => setRefreshKey((k) => k + 1);
  const { summary, error, loading } = useFamilySummary(month, refreshKey);
  const alerts = useFamilyAlerts(refreshKey);
  const [recentFor, setRecentFor] = useState<MemberSummary | null>(null);
  const [budgetFor, setBudgetFor] = useState<MemberSummary | null>(null);
  const [showThreshold, setShowThreshold] = useState(false);

  return (
    <div className="space-y-4">
      <MonthSelector month={month} onChange={setMonth} />

      {loading ? (
        <div className="h-32 animate-pulse rounded-2xl bg-stone-200 dark:bg-stone-800" aria-hidden="true" />
      ) : error || !summary ? (
        <p className={`${CARD} text-sm text-stone-700 dark:text-stone-300`}>{error ?? 'Could not load the family summary.'}</p>
      ) : (
        <>
          <div className={CARD}>
            <p className="text-xs text-stone-600 dark:text-stone-400">Family spent</p>
            <p className="mt-0.5 text-2xl font-bold tabular-nums text-stone-800 dark:text-stone-100">
              {formatCurrency(summary.family_expense, currency)}
            </p>
            <p className="mt-1 text-xs tabular-nums text-stone-600 dark:text-stone-400">
              Income {formatCurrency(summary.family_income, currency)}
            </p>
            <p className="mt-1 text-[11px] text-stone-500 dark:text-stone-400">Only what each member has chosen to share.</p>
          </div>

          {alerts.length > 0 && (
            <AlertsCard
              alerts={alerts}
              currency={currency}
              nameOf={(a) => memberDisplayName({ user_id: a.member_id, email: a.email }, currentUserId)}
            />
          )}

          {summary.family_expense === 0 && summary.family_income === 0 ? (
            <p className={`${CARD} text-center text-sm text-stone-600 dark:text-stone-400`}>No shared spending this month.</p>
          ) : (
            <>
              <CategoryCard categories={combineCategories(summary.members)} currency={currency} />
              <div className="space-y-2.5">
                {summary.members.map((m) => (
                  <MemberCard
                    key={m.user_id}
                    member={m}
                    familyExpense={summary.family_expense}
                    currency={currency}
                    name={memberDisplayName(m, currentUserId)}
                    onShowRecent={() => setRecentFor(m)}
                    onSetBudgets={() => setBudgetFor(m)}
                  />
                ))}
              </div>
            </>
          )}

          <button
            onClick={() => setShowThreshold(true)}
            className="flex w-full items-center gap-3 rounded-2xl bg-white p-4 text-left shadow-sm shadow-stone-200/60 transition-transform active:scale-[0.99] dark:bg-stone-900 dark:shadow-black/40"
          >
            <BellRing size={18} className="shrink-0 text-stone-500 dark:text-stone-400" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-stone-800 dark:text-stone-100">Flag large purchases</span>
              <span className="block text-xs text-stone-600 dark:text-stone-400">
                {summary.large_purchase_threshold ? `At ${formatCurrency(Number(summary.large_purchase_threshold), currency)} or more` : 'Off'}
              </span>
            </span>
          </button>
        </>
      )}

      {budgetFor && (
        <MemberBudgetSheet
          member={budgetFor}
          name={memberDisplayName(budgetFor, currentUserId)}
          currency={currency}
          onChanged={refresh}
          onClose={() => setBudgetFor(null)}
        />
      )}
      {showThreshold && summary && (
        <ThresholdSheet
          current={summary.large_purchase_threshold ? Number(summary.large_purchase_threshold) : null}
          currency={currency}
          onChanged={refresh}
          onClose={() => setShowThreshold(false)}
        />
      )}

      {recentFor && (
        <RecentSheet
          member={recentFor}
          name={memberDisplayName(recentFor, currentUserId)}
          currency={currency}
          onClose={() => setRecentFor(null)}
        />
      )}
    </div>
  );
}

function AlertsCard({
  alerts,
  currency,
  nameOf,
}: {
  alerts: FamilyAlert[];
  currency: string;
  nameOf: (a: FamilyAlert) => string;
}) {
  return (
    <div className="space-y-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-500/10">
      <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">Needs attention</p>
      <ul className="space-y-1.5">
        {alerts.map((a, i) => {
          const { text, tone } = alertText(a, nameOf(a), (n) => formatCurrency(n, currency), (d) => formatDate(d));
          return (
            <li key={i} className="flex items-start gap-2 text-sm">
              <TriangleAlert
                size={15}
                className={`mt-0.5 shrink-0 ${tone === 'over' ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'}`}
              />
              <span className={tone === 'over' ? 'font-medium text-red-800 dark:text-red-300' : 'text-amber-900 dark:text-amber-200'}>{text}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function CategoryCard({ categories, currency }: { categories: CategoryTotal[]; currency: string }) {
  const [all, setAll] = useState(false);
  if (categories.length === 0) return null;
  return (
    <div className={CARD}>
      <p className="mb-3 text-sm font-semibold text-stone-800 dark:text-stone-100">By category</p>
      <CategoryBars categories={categories} currency={currency} limit={all ? undefined : 6} />
      {categories.length > 6 && (
        <button onClick={() => setAll((v) => !v)} className="mt-3 text-xs font-semibold text-brand">
          {all ? 'Show less' : `Show all ${categories.length}`}
        </button>
      )}
    </div>
  );
}

function MemberCard({
  member,
  familyExpense,
  currency,
  name,
  onShowRecent,
  onSetBudgets,
}: {
  member: MemberSummary;
  familyExpense: number;
  currency: string;
  name: string;
  onShowRecent: () => void;
  onSetBudgets: () => void;
}) {
  const [open, setOpen] = useState(false);
  const totalsOnly = member.role === 'adult' && member.share_mode === 'totals';
  const roleLabel = member.role === 'owner' ? 'Owner' : member.role === 'child' ? 'Child' : 'Adult';

  return (
    <div className={CARD}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 text-left"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-stone-800 dark:text-stone-100">
            {name} <span className="ml-1 text-xs font-normal text-stone-500 dark:text-stone-400">{roleLabel}</span>
          </p>
          <p className="text-sm font-bold tabular-nums text-stone-800 dark:text-stone-100">{formatCurrency(member.expense, currency)}</p>
        </div>
        <ChevronDown size={18} className={`shrink-0 text-stone-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <div className="mt-2">
        <Bar fraction={shareOfTotal(member.expense, familyExpense)} color="var(--color-brand)" />
      </div>

      {open && (
        <div className="mt-4 space-y-4 border-t border-stone-100 pt-4 dark:border-stone-700">
          {totalsOnly && (
            <p className="text-xs text-stone-600 dark:text-stone-400">{name} shares totals only, so individual transactions aren&apos;t shown.</p>
          )}
          {member.by_category.length > 0 ? (
            <CategoryBars categories={member.by_category} currency={currency} />
          ) : (
            <p className="text-xs text-stone-600 dark:text-stone-400">No shared spending this month.</p>
          )}

          {member.budgets.length > 0 && (
            <div className="space-y-2.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-600 dark:text-stone-400">Budgets</p>
              {member.budgets.map((b) => {
                const { ratio, level } = budgetState(b);
                const label = b.category_name ?? (b.category_id === null ? 'Overall' : 'Category');
                return (
                  <div key={b.category_id ?? 'overall'}>
                    <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
                      <span className="text-stone-700 dark:text-stone-300">{label}</span>
                      <span
                        className={`tabular-nums ${
                          level === 'over' ? 'font-semibold text-red-600 dark:text-red-400' : level === 'near' ? 'text-amber-700 dark:text-amber-400' : 'text-stone-600 dark:text-stone-400'
                        }`}
                      >
                        {formatCurrency(b.spent, currency)} of {formatCurrency(b.amount, currency)}
                      </span>
                    </div>
                    <Bar
                      fraction={Math.min(1, ratio)}
                      color={level === 'over' ? '#dc2626' : level === 'near' ? '#d97706' : 'var(--color-brand)'}
                    />
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {!totalsOnly && (
              <button
                onClick={onShowRecent}
                className="flex items-center gap-1.5 text-sm font-semibold text-brand transition-transform active:scale-95"
              >
                <History size={15} />
                Recent transactions
              </button>
            )}
            {member.role !== 'owner' && (
              <button onClick={onSetBudgets} className="text-sm font-semibold text-brand transition-transform active:scale-95">
                {member.budgets.length > 0 ? 'Edit budgets' : 'Set budgets'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function RecentSheet({
  member,
  name,
  currency,
  onClose,
}: {
  member: MemberSummary;
  name: string;
  currency: string;
  onClose: () => void;
}) {
  const [state, setState] = useState<{ rows: RecentRow[]; error: string | null } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchMemberRecent(member.user_id, 20).then((result) => {
      if (!cancelled) setState(result);
    });
    return () => {
      cancelled = true;
    };
  }, [member.user_id]);

  return (
    <Sheet onClose={onClose}>
      {(close) => (
        <>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-stone-800 dark:text-stone-100">{name}&apos;s recent</h2>
            <button onClick={close} className="text-sm font-semibold text-brand">
              Done
            </button>
          </div>
          {state === null ? (
            <div className="h-24 animate-pulse rounded-xl bg-stone-100 dark:bg-stone-700" aria-hidden="true" />
          ) : state.error ? (
            <p className="text-sm text-stone-700 dark:text-stone-300">{state.error}</p>
          ) : state.rows.length === 0 ? (
            <p className="text-sm text-stone-600 dark:text-stone-400">Nothing shared yet.</p>
          ) : (
            <ul className="divide-y divide-stone-100 dark:divide-stone-700">
              {state.rows.map((r) => (
                <li key={r.id} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-stone-800 dark:text-stone-100">{r.note || r.category}</p>
                    <p className="text-xs text-stone-600 dark:text-stone-400">
                      {r.category} · {formatDate(r.date)}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 text-sm font-semibold tabular-nums ${
                      r.type === 'income' ? 'text-emerald-600 dark:text-emerald-400' : 'text-stone-800 dark:text-stone-100'
                    }`}
                  >
                    {r.type === 'income' ? '+' : ''}
                    {formatCurrency(Number(r.amount), currency)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Sheet>
  );
}
