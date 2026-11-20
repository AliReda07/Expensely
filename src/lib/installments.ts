/**
 * Pure schedule math for installment plans (valU, Contact, Souhoola, bank plans...).
 * Imported by both the client (list, badges, premium insights) and the installment-reminders
 * edge function, so it stays dependency-free apart from dueDate.ts -- see that file for why
 * everything is done on Cairo-local YYYY-MM-DD strings rather than local Date arithmetic.
 *
 * Model: a plan is its first due date, a monthly amount, a number of months, and how many
 * installments the user has marked paid. Every later due date falls on the same day of the
 * month as the first, clamped for short months (31st -> 28th/29th/30th). Paid status is
 * tracked by hand ("Mark paid"), not inferred from transactions: installments are usually
 * collected by direct debit or paid in a provider's own app, which leaves no transaction
 * in Expensely to detect.
 */
import { cairoDateString, clampDueDay } from './dueDate.ts';

export interface InstallmentPlan {
  id: string;
  name: string;
  monthly_amount: number;
  months_total: number;
  /** YYYY-MM-DD of the first installment. */
  first_due_date: string;
  paid_count: number;
  /** What it would cost up front, if known. Lets premium show the cost of financing. */
  cash_price: number | null;
}

/** Days before the due date on which a reminder goes out; 0 = the due day itself. */
export const REMINDER_OFFSETS = [3, 0] as const;
export type ReminderOffset = (typeof REMINDER_OFFSETS)[number];

const DAY_MS = 86_400_000;

function parseDate(dateStr: string): { year: number; month: number; day: number } {
  const [year, month, day] = dateStr.split('-').map(Number);
  return { year, month, day };
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Whole days from `fromStr` to `toStr` (both YYYY-MM-DD); negative if `toStr` is earlier. */
export function daysBetween(fromStr: string, toStr: string): number {
  const a = parseDate(fromStr);
  const b = parseDate(toStr);
  return Math.round((Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / DAY_MS);
}

/** Due date (YYYY-MM-DD) of installment number `index`, where 0 is the first. */
export function dueDateFor(firstDueDate: string, index: number): string {
  const { year, month, day } = parseDate(firstDueDate);
  const monthIndex = month - 1 + index;
  const y = year + Math.floor(monthIndex / 12);
  const m = (monthIndex % 12) + 1;
  return `${y}-${pad2(m)}-${pad2(clampDueDay(day, y, m))}`;
}

export function isActive(plan: Pick<InstallmentPlan, 'months_total' | 'paid_count'>): boolean {
  return plan.paid_count < plan.months_total;
}

export function monthsRemaining(plan: Pick<InstallmentPlan, 'months_total' | 'paid_count'>): number {
  return Math.max(0, plan.months_total - plan.paid_count);
}

export interface NextInstallment {
  /** 0-based position in the schedule. */
  index: number;
  dueDate: string;
  /** Negative when overdue. */
  daysUntil: number;
}

/** The unpaid installment that matters now, or null once the plan is fully paid. */
export function nextInstallment(plan: InstallmentPlan, today: Date): NextInstallment | null {
  if (!isActive(plan)) return null;
  const dueDate = dueDateFor(plan.first_due_date, plan.paid_count);
  return { index: plan.paid_count, dueDate, daysUntil: daysBetween(cairoDateString(today), dueDate) };
}

/** Which reminder (if any) is due today for this many days out. */
export function reminderOffsetFor(daysUntil: number): ReminderOffset | null {
  return (REMINDER_OFFSETS as readonly number[]).includes(daysUntil) ? (daysUntil as ReminderOffset) : null;
}

export function payoffDate(plan: Pick<InstallmentPlan, 'first_due_date' | 'months_total'>): string {
  return dueDateFor(plan.first_due_date, plan.months_total - 1);
}

/** What is still to be paid on the plan. */
export function remainingAmount(plan: InstallmentPlan): number {
  return round2(monthsRemaining(plan) * plan.monthly_amount);
}

/** Total of every installment, paid or not. */
export function totalPayable(plan: Pick<InstallmentPlan, 'monthly_amount' | 'months_total'>): number {
  return round2(plan.monthly_amount * plan.months_total);
}

/**
 * Premium insight: how much extra the plan costs over paying cash. Null when the user didn't
 * enter a cash price. Can be zero (0% plans) but never negative -- a "discount" would just
 * be a mistyped price.
 */
export function financingCost(plan: InstallmentPlan): number | null {
  if (plan.cash_price == null) return null;
  return Math.max(0, round2(totalPayable(plan) - plan.cash_price));
}

/** Sum of the monthly payments the user is currently committed to. */
export function monthlyCommitment(plans: InstallmentPlan[]): number {
  return round2(plans.filter(isActive).reduce((sum, p) => sum + p.monthly_amount, 0));
}

/**
 * Premium insight: committed payments as a share of income, 0-1+ (can exceed 1). Null when
 * there is no income figure to compare against.
 */
export function incomeShare(plans: InstallmentPlan[], monthlyIncome: number): number | null {
  if (!(monthlyIncome > 0)) return null;
  return monthlyCommitment(plans) / monthlyIncome;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export type DueTone = 'overdue' | 'urgent' | 'soon' | 'calm';

/** Wording and urgency for how far off the next installment is. */
export function describeDue(daysUntil: number): { text: string; tone: DueTone } {
  if (daysUntil < 0) {
    const late = -daysUntil;
    return { text: `Overdue by ${late} ${late === 1 ? 'day' : 'days'}`, tone: 'overdue' };
  }
  if (daysUntil === 0) return { text: 'Due today', tone: 'urgent' };
  if (daysUntil === 1) return { text: 'Due tomorrow', tone: 'urgent' };
  if (daysUntil <= 3) return { text: `Due in ${daysUntil} days`, tone: 'soon' };
  return { text: `Due in ${daysUntil} days`, tone: 'calm' };
}
