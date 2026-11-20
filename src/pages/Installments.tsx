import { useMemo, useState, type ReactNode } from 'react';
import { CalendarClock, Check, Lock, Pencil, Plus, Trash2, Undo2 } from 'lucide-react';
import { useInstallments, useAverageMonthlyIncome } from '../hooks/useInstallments';
import { useProfile } from '../hooks/useProfile';
import { useSubscription } from '../hooks/useSubscription';
import { AddInstallmentSheet } from '../components/AddInstallmentSheet';
import { ConfirmSheet } from '../components/ConfirmSheet';
import { formatCurrency, formatDate } from '../lib/format';
import {
  describeDue,
  financingCost,
  incomeShare,
  isActive,
  monthlyCommitment,
  monthsRemaining,
  nextInstallment,
  payoffDate,
  remainingAmount,
  type DueTone,
  type InstallmentPlan,
} from '../lib/installments';

/** Free accounts can track this many active plans; the database enforces it too. */
const FREE_ACTIVE_LIMIT = 2;

const TONE_STYLES: Record<DueTone, string> = {
  overdue: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300',
  urgent: 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400',
  soon: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400',
  calm: 'bg-stone-100 text-stone-600 dark:bg-stone-700 dark:text-stone-300',
};

export function Installments() {
  const { plans, loading, addPlan, updatePlan, deletePlan, adjustPaid } = useInstallments();
  const { profile } = useProfile();
  const { isPremium } = useSubscription();
  const monthlyIncome = useAverageMonthlyIncome(isPremium);
  const currency = profile?.currency ?? 'EGP';

  const [sheet, setSheet] = useState<{ plan?: InstallmentPlan } | null>(null);
  const [deleting, setDeleting] = useState<InstallmentPlan | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const active = useMemo(
    () =>
      plans
        .filter(isActive)
        .map((plan) => ({ plan, next: nextInstallment(plan, new Date()) }))
        .sort((a, b) => (a.next?.daysUntil ?? 0) - (b.next?.daysUntil ?? 0)),
    [plans],
  );
  const finished = plans.filter((p) => !isActive(p));
  const atFreeLimit = !isPremium && active.length >= FREE_ACTIVE_LIMIT;

  const run = async (action: Promise<{ error: string | null }>) => {
    setActionError(null);
    const { error } = await action;
    if (error) setActionError(error);
  };

  const share = incomeShare(active.map((a) => a.plan), monthlyIncome ?? 0);
  const lastPayoff = active.length ? active.map((a) => payoffDate(a.plan)).sort().at(-1)! : null;

  return (
    <div className="mesh-bg h-full space-y-5 overflow-y-auto px-4 pb-28 pt-[calc(env(safe-area-inset-top)+1.5rem)]">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-white dark:text-stone-100">Installments</h1>
        <button
          onClick={() => setSheet({})}
          disabled={atFreeLimit}
          className="flex items-center gap-1.5 rounded-full bg-white/90 px-3.5 py-2 text-sm font-semibold text-brand transition-transform active:scale-95 disabled:opacity-50 dark:bg-stone-800 dark:text-stone-100"
        >
          <Plus size={16} />
          Add plan
        </button>
      </div>

      {atFreeLimit && (
        <p className="rounded-xl bg-white/90 px-3.5 py-2.5 text-xs text-stone-600 dark:bg-stone-800 dark:text-stone-300">
          Free accounts can track {FREE_ACTIVE_LIMIT} active plans. Premium removes the limit and is launching soon.
        </p>
      )}
      {actionError && <p className="text-center text-xs text-red-200 dark:text-red-400">{actionError}</p>}

      {loading ? (
        <div className="h-24 animate-pulse rounded-2xl bg-stone-200 dark:bg-stone-800" aria-hidden="true" />
      ) : plans.length === 0 ? (
        <div className="rounded-2xl bg-white p-6 text-center shadow-sm shadow-stone-200/60 dark:bg-stone-900 dark:shadow-black/40">
          <CalendarClock size={28} className="mx-auto text-brand" />
          <p className="mt-2 text-sm font-semibold text-stone-800 dark:text-stone-100">No installment plans yet</p>
          <p className="mt-1 text-xs text-stone-600 dark:text-stone-400">
            Add a valU, Contact, Souhoola or bank plan and get a reminder before each payment is due.
          </p>
        </div>
      ) : (
        <>
          {/* Premium insights; free accounts see what they unlock. */}
          {active.length > 0 &&
            (isPremium ? (
              <div className="grid grid-cols-2 gap-2.5">
                <Stat label="Monthly commitment" value={formatCurrency(monthlyCommitment(active.map((a) => a.plan)), currency)} />
                <Stat label="Paid off by" value={lastPayoff ? formatDate(lastPayoff) + ', ' + lastPayoff.slice(0, 4) : '-'} />
                <Stat
                  label="Share of income"
                  value={share == null ? '-' : `${Math.round(share * 100)}%`}
                  hint={share == null ? 'Needs income logged' : 'vs. 3-month average income'}
                  wide
                />
              </div>
            ) : (
              <div className="flex gap-3 rounded-2xl border border-white/20 bg-white/90 p-3.5 dark:border-stone-700 dark:bg-stone-900">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
                  <Lock size={17} />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-stone-800 dark:text-stone-100">Premium insights</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-stone-600 dark:text-stone-400">
                    See what financing really costs, your payoff date, and how much of your income is already committed.
                    Premium is launching soon.
                  </p>
                </div>
              </div>
            ))}

          <div className="space-y-2.5">
            {active.map(({ plan, next }) => {
              const due = next ? describeDue(next.daysUntil) : null;
              const cost = isPremium ? financingCost(plan) : null;
              return (
                <div key={plan.id} className="rounded-2xl bg-white p-4 shadow-sm shadow-stone-200/60 dark:bg-stone-900 dark:shadow-black/40">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-stone-800 dark:text-stone-100">{plan.name}</p>
                      <p className="text-xs tabular-nums text-stone-600 dark:text-stone-400">
                        {formatCurrency(plan.monthly_amount, currency)} / month
                      </p>
                    </div>
                    {due && next && (
                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${TONE_STYLES[due.tone]}`}>
                        {due.text}
                      </span>
                    )}
                  </div>

                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-700" aria-hidden="true">
                    <div
                      className="h-full rounded-full bg-brand transition-[width] duration-300"
                      style={{ width: `${(plan.paid_count / plan.months_total) * 100}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-xs tabular-nums text-stone-600 dark:text-stone-400">
                    {plan.paid_count} of {plan.months_total} paid · {monthsRemaining(plan)} left ·{' '}
                    {formatCurrency(remainingAmount(plan), currency)} to go
                  </p>
                  {next && (
                    <p className="text-xs text-stone-500 dark:text-stone-400">Next payment {formatDate(next.dueDate)}</p>
                  )}
                  {cost != null && (
                    <p className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-400">
                      Financing costs {formatCurrency(cost, currency)} over paying cash
                    </p>
                  )}

                  <div className="mt-3 flex items-center gap-2">
                    <button
                      onClick={() => void run(adjustPaid(plan, 1))}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand py-2 text-sm font-semibold text-white transition-transform active:scale-[0.98]"
                    >
                      <Check size={16} />
                      Mark paid
                    </button>
                    {plan.paid_count > 0 && (
                      <IconButton label={`Undo last payment on ${plan.name}`} onClick={() => void run(adjustPaid(plan, -1))}>
                        <Undo2 size={16} />
                      </IconButton>
                    )}
                    <IconButton label={`Edit ${plan.name}`} onClick={() => setSheet({ plan })}>
                      <Pencil size={16} />
                    </IconButton>
                    <IconButton label={`Delete ${plan.name}`} onClick={() => setDeleting(plan)}>
                      <Trash2 size={16} />
                    </IconButton>
                  </div>
                </div>
              );
            })}
          </div>

          {finished.length > 0 && (
            <section>
              <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-stone-600 dark:text-stone-400">Paid off</h2>
              <div className="divide-y divide-stone-100 overflow-hidden rounded-2xl bg-white shadow-sm shadow-stone-200/60 dark:divide-stone-700 dark:bg-stone-900 dark:shadow-black/40">
                {finished.map((plan) => (
                  <div key={plan.id} className="flex items-center gap-3 px-4 py-3">
                    <Check size={16} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
                    <p className="min-w-0 flex-1 truncate text-sm text-stone-700 dark:text-stone-300">{plan.name}</p>
                    <IconButton label={`Undo last payment on ${plan.name}`} onClick={() => void run(adjustPaid(plan, -1))}>
                      <Undo2 size={16} />
                    </IconButton>
                    <IconButton label={`Delete ${plan.name}`} onClick={() => setDeleting(plan)}>
                      <Trash2 size={16} />
                    </IconButton>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {sheet && (
        <AddInstallmentSheet
          currency={currency}
          plan={sheet.plan}
          onSubmit={(input) => (sheet.plan ? updatePlan(sheet.plan.id, input) : addPlan(input))}
          onClose={() => setSheet(null)}
        />
      )}
      {deleting && (
        <ConfirmSheet
          message={`Delete "${deleting.name}"? Its reminders stop and this can't be undone.`}
          confirmLabel="Delete"
          onConfirm={() => void run(deletePlan(deleting.id))}
          onClose={() => setDeleting(null)}
        />
      )}
    </div>
  );
}

function Stat({ label, value, hint, wide }: { label: string; value: string; hint?: string; wide?: boolean }) {
  return (
    <div className={`rounded-2xl bg-white p-3.5 shadow-sm shadow-stone-200/60 dark:bg-stone-900 dark:shadow-black/40 ${wide ? 'col-span-2' : ''}`}>
      <p className="text-xs text-stone-600 dark:text-stone-400">{label}</p>
      <p className="mt-0.5 text-base font-bold tabular-nums text-stone-800 dark:text-stone-100">{value}</p>
      {hint && <p className="text-[11px] text-stone-500 dark:text-stone-400">{hint}</p>}
    </div>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="shrink-0 rounded-xl border border-stone-200 p-2 text-stone-600 transition-all hover:bg-stone-50 active:scale-90 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
    >
      {children}
    </button>
  );
}
