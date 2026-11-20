import type { HouseholdRole, ShareMode } from './family';

// Shapes returned by the household_summary / household_recent database functions.

export interface CategoryTotal {
  category_id: string | null;
  name: string;
  color: string | null;
  amount: number;
}

export interface MemberBudget {
  /** null is the member's overall monthly budget. */
  category_id: string | null;
  amount: number;
  spent: number;
}

export interface MemberSummary {
  user_id: string;
  email: string;
  role: HouseholdRole;
  share_mode: ShareMode;
  expense: number;
  income: number;
  by_category: CategoryTotal[];
  budgets: MemberBudget[];
}

export interface FamilySummary {
  month_start: string;
  month_end: string;
  family_expense: number;
  family_income: number;
  members: MemberSummary[];
}

export interface RecentRow {
  id: string;
  date: string;
  type: 'expense' | 'income';
  amount: number;
  note: string | null;
  category: string;
}

/** YYYY-MM-01 for the month containing `date`, using the date's own (local) calendar fields. */
export function toMonthStart(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
}

/** Family-wide category totals, biggest first. Merged by name so a category several members use counts once. */
export function combineCategories(members: Pick<MemberSummary, 'by_category'>[]): CategoryTotal[] {
  const byName = new Map<string, CategoryTotal>();
  for (const member of members) {
    for (const c of member.by_category) {
      const existing = byName.get(c.name);
      if (existing) {
        existing.amount += Number(c.amount);
        existing.color ??= c.color;
      } else {
        byName.set(c.name, { ...c, amount: Number(c.amount) });
      }
    }
  }
  return [...byName.values()].sort((a, b) => b.amount - a.amount);
}

/** part / total, clamped to 0-1, and 0 when there is no total. */
export function shareOfTotal(part: number, total: number): number {
  if (!(total > 0) || !(part > 0)) return 0;
  return Math.min(1, part / total);
}

/** "You" for the signed-in owner, otherwise the part of the email before the @. */
export function memberDisplayName(member: Pick<MemberSummary, 'user_id' | 'email'>, currentUserId: string | undefined): string {
  if (member.user_id === currentUserId) return 'You';
  return member.email.split('@')[0] || member.email;
}

export type BudgetLevel = 'ok' | 'near' | 'over';

/** Progress against a budget; "near" starts at 80%, matching household_alerts. */
export function budgetState(budget: Pick<MemberBudget, 'amount' | 'spent'>): { ratio: number; level: BudgetLevel } {
  const ratio = budget.amount > 0 ? budget.spent / budget.amount : 0;
  return { ratio, level: ratio >= 1 ? 'over' : ratio >= 0.8 ? 'near' : 'ok' };
}
