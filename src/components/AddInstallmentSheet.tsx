import { useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import { Sheet } from './Sheet';
import { cairoDateString } from '../lib/dueDate';
import type { InstallmentInput } from '../hooks/useInstallments';
import type { InstallmentPlan } from '../lib/installments';

const INPUT =
  'w-full rounded-xl border border-stone-200 px-3 py-2.5 outline-none transition-colors focus:border-brand dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:placeholder:text-stone-500';

export function AddInstallmentSheet({
  currency,
  plan,
  onSubmit,
  onClose,
}: {
  currency: string;
  /** When set, the sheet edits this plan instead of creating one. */
  plan?: InstallmentPlan;
  onSubmit: (input: InstallmentInput) => Promise<{ error: string | null }>;
  onClose: () => void;
}) {
  const [name, setName] = useState(plan?.name ?? '');
  const [monthly, setMonthly] = useState(plan ? String(plan.monthly_amount) : '');
  const [months, setMonths] = useState(plan ? String(plan.months_total) : '');
  const [firstDue, setFirstDue] = useState(plan?.first_due_date ?? cairoDateString(new Date()));
  const [paid, setPaid] = useState(plan ? String(plan.paid_count) : '0');
  const [cashPrice, setCashPrice] = useState(plan?.cash_price != null ? String(plan.cash_price) : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent, close: () => void) => {
    e.preventDefault();
    const monthlyAmount = Number(monthly);
    const monthsTotal = Number(months);
    const paidCount = Number(paid || 0);
    const price = cashPrice.trim() ? Number(cashPrice) : null;

    if (!name.trim() || name.trim().length > 60) return setError('Give the plan a name (up to 60 characters).');
    if (!(monthlyAmount > 0)) return setError('Enter the monthly amount.');
    if (!Number.isInteger(monthsTotal) || monthsTotal < 1 || monthsTotal > 120) return setError('Months must be between 1 and 120.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(firstDue)) return setError('Pick the first due date.');
    if (!Number.isInteger(paidCount) || paidCount < 0 || paidCount > monthsTotal) return setError('Months already paid must be between 0 and the total.');
    if (price !== null && !(price > 0)) return setError('Cash price must be a positive number, or left empty.');

    setError(null);
    setSaving(true);
    const result = await onSubmit({
      name: name.trim(),
      monthly_amount: monthlyAmount,
      months_total: monthsTotal,
      first_due_date: firstDue,
      paid_count: paidCount,
      cash_price: price,
    });
    setSaving(false);
    if (result.error) return setError(result.error);
    close();
  };

  return (
    <Sheet onClose={onClose}>
      {(close) => (
        <>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-stone-800 dark:text-stone-100">
              {plan ? 'Edit installment plan' : 'Add an installment plan'}
            </h2>
            <button
              onClick={close}
              className="rounded-full p-1.5 text-stone-500 transition-colors hover:bg-stone-100 active:scale-90 dark:text-stone-400 dark:hover:bg-stone-700"
              aria-label="Close"
            >
              <X size={20} />
            </button>
          </div>
          <form onSubmit={(e) => void submit(e, close)} className="space-y-3">
            <input
              type="text"
              aria-label="Plan name"
              maxLength={60}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name (e.g. valU - iPhone)"
              className={INPUT}
            />
            <div className="flex gap-2">
              <input
                type="text"
                inputMode="decimal"
                aria-label={`Monthly amount in ${currency}`}
                value={monthly}
                onChange={(e) => setMonthly(e.target.value)}
                placeholder={`Monthly (${currency})`}
                className={`${INPUT} min-w-0 flex-1 tabular-nums`}
              />
              <input
                type="text"
                inputMode="numeric"
                aria-label="Number of months"
                value={months}
                onChange={(e) => setMonths(e.target.value.replace(/\D/g, '').slice(0, 3))}
                placeholder="Months"
                className={`${INPUT} min-w-0 flex-1 tabular-nums`}
              />
            </div>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-stone-600 dark:text-stone-400">First due date</span>
              <input type="date" value={firstDue} onChange={(e) => setFirstDue(e.target.value)} className={INPUT} />
              <span className="mt-1 block text-xs text-stone-500 dark:text-stone-400">
                Later payments fall on the same day each month.
              </span>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-stone-600 dark:text-stone-400">Months already paid</span>
              <input
                type="text"
                inputMode="numeric"
                value={paid}
                onChange={(e) => setPaid(e.target.value.replace(/\D/g, '').slice(0, 3))}
                className={`${INPUT} tabular-nums`}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-stone-600 dark:text-stone-400">
                Cash price, optional
              </span>
              <input
                type="text"
                inputMode="decimal"
                value={cashPrice}
                onChange={(e) => setCashPrice(e.target.value)}
                placeholder={`What it costs upfront (${currency})`}
                className={`${INPUT} tabular-nums`}
              />
              <span className="mt-1 block text-xs text-stone-500 dark:text-stone-400">
                Premium uses this to show how much the plan costs over paying cash.
              </span>
            </label>

            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-xl bg-brand py-2.5 font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-50"
            >
              {saving ? 'Saving…' : plan ? 'Save changes' : 'Add plan'}
            </button>
          </form>
        </>
      )}
    </Sheet>
  );
}
