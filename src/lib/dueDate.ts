/**
 * Pure date math for credit card payment due dates. Imported by both the client
 * (badge/banner rendering) and the payment-reminders edge function (email/push) --
 * kept dependency-free so the exact same file can be relative-imported from Deno
 * without an npm/jsr specifier mismatch.
 *
 * Everything here operates on Cairo-local calendar dates (see PAYMENT_REMINDERS_PLAN.md
 * decision 5 -- the app is effectively single-user and has no timezone column). Dates
 * are normalised to YYYY-MM-DD strings before any arithmetic, then wrapped in a
 * UTC-midnight Date only at the boundary, so nothing here can drift across a real UTC
 * midnight the way local Date arithmetic can.
 */

export interface MinimalTransaction {
  card_id: string | null;
  type: string;
  date: string;
}

function daysInMonth(year: number, month: number): number {
  // Day 0 of `month` (0-indexed here) is the last day of `month - 1`, i.e. the last
  // day of the 1-indexed `month` passed in below.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function clampDueDay(dueDay: number, year: number, month: number): number {
  return Math.min(dueDay, daysInMonth(year, month));
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function toDateString(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function toUtcDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

/** The Cairo-local calendar date of an instant, as YYYY-MM-DD, independent of the
 *  machine's own timezone (the cron job and any test runner may both be UTC). */
export function cairoDateString(instant: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(instant);
}

function cairoParts(instant: Date): { year: number; month: number; day: number } {
  const [year, month, day] = cairoDateString(instant).split('-').map(Number);
  return { year, month, day };
}

export function nextDueDate(dueDay: number, today: Date): Date {
  const { year, month, day } = cairoParts(today);
  const thisMonthDue = clampDueDay(dueDay, year, month);
  if (day <= thisMonthDue) {
    return toUtcDate(toDateString(year, month, thisMonthDue));
  }
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  return toUtcDate(toDateString(nextYear, nextMonth, clampDueDay(dueDay, nextYear, nextMonth)));
}

export function previousDueDate(dueDay: number, today: Date): Date {
  const { year, month, day } = cairoParts(today);
  const thisMonthDue = clampDueDay(dueDay, year, month);
  if (day <= thisMonthDue) {
    // Next due date is this month's, so the previous one was last month's.
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    return toUtcDate(toDateString(prevYear, prevMonth, clampDueDay(dueDay, prevYear, prevMonth)));
  }
  // Next due date is next month's, so the previous one was this month's.
  return toUtcDate(toDateString(year, month, thisMonthDue));
}

export function daysUntilDue(dueDay: number, today: Date): number {
  const nextStr = cairoDateString(nextDueDate(dueDay, today));
  const todayStr = cairoDateString(today);
  const diffMs = toUtcDate(nextStr).getTime() - toUtcDate(todayStr).getTime();
  return Math.round(diffMs / 86_400_000);
}

/**
 * A payment on the due date itself settles the *previous* cycle, not this one, so the
 * lower bound is exclusive -- an early payment (the good behaviour) must not fall
 * outside the window and still trigger a reminder. See decision 12.
 */
export function isPaidThisCycle(
  dueDay: number,
  today: Date,
  cardId: string,
  transactions: MinimalTransaction[],
): boolean {
  const prevDueStr = cairoDateString(previousDueDate(dueDay, today));
  const todayStr = cairoDateString(today);
  return transactions.some(
    (t) => t.card_id === cardId && t.type === 'income' && t.date > prevDueStr && t.date <= todayStr,
  );
}
