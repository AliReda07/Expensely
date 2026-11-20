import { describe, expect, it } from 'vitest';
import {
  daysBetween,
  describeDue,
  dueDateFor,
  financingCost,
  incomeShare,
  isActive,
  monthlyCommitment,
  monthsRemaining,
  nextInstallment,
  payoffDate,
  reminderOffsetFor,
  remainingAmount,
  totalPayable,
  type InstallmentPlan,
} from './installments';

function plan(patch: Partial<InstallmentPlan> = {}): InstallmentPlan {
  return {
    id: 'p1',
    name: 'valU - phone',
    monthly_amount: 1000,
    months_total: 12,
    first_due_date: '2026-12-10',
    paid_count: 0,
    cash_price: null,
    ...patch,
  };
}

// Noon UTC is the same calendar day in Cairo year-round (UTC+2 / +3).
const day = (iso: string) => new Date(`${iso}T12:00:00Z`);

describe('dueDateFor', () => {
  it('keeps the day of month and rolls over the year', () => {
    expect(dueDateFor('2026-12-10', 0)).toBe('2026-12-10');
    expect(dueDateFor('2026-12-10', 1)).toBe('2027-01-10');
    expect(dueDateFor('2026-12-10', 13)).toBe('2028-01-10');
  });

  it('clamps the 31st to short months without drifting afterwards', () => {
    expect(dueDateFor('2026-01-31', 1)).toBe('2026-02-28');
    expect(dueDateFor('2026-01-31', 2)).toBe('2026-03-31');
    expect(dueDateFor('2026-01-31', 3)).toBe('2026-04-30');
  });

  it('uses 29 February in a leap year', () => {
    expect(dueDateFor('2027-12-31', 2)).toBe('2028-02-29');
  });
});

describe('daysBetween', () => {
  it('counts calendar days, negative when earlier', () => {
    expect(daysBetween('2026-12-07', '2026-12-10')).toBe(3);
    expect(daysBetween('2026-12-10', '2026-12-10')).toBe(0);
    expect(daysBetween('2026-12-10', '2026-12-08')).toBe(-2);
    expect(daysBetween('2026-12-30', '2027-01-02')).toBe(3);
  });
});

describe('nextInstallment', () => {
  it('points at the first unpaid installment', () => {
    expect(nextInstallment(plan({ paid_count: 2 }), day('2027-02-01'))).toEqual({
      index: 2,
      dueDate: '2027-02-10',
      daysUntil: 9,
    });
  });

  it('reports a negative daysUntil when overdue', () => {
    expect(nextInstallment(plan(), day('2026-12-12'))?.daysUntil).toBe(-2);
  });

  it('is null once every installment is paid', () => {
    expect(nextInstallment(plan({ paid_count: 12 }), day('2027-01-01'))).toBeNull();
  });
});

describe('reminderOffsetFor', () => {
  it('fires three days out and on the day, and only then', () => {
    expect(reminderOffsetFor(3)).toBe(3);
    expect(reminderOffsetFor(0)).toBe(0);
    for (const d of [-1, 1, 2, 4, 7]) expect(reminderOffsetFor(d)).toBeNull();
  });
});

describe('plan totals', () => {
  it('tracks progress', () => {
    const p = plan({ paid_count: 5 });
    expect(isActive(p)).toBe(true);
    expect(monthsRemaining(p)).toBe(7);
    expect(remainingAmount(p)).toBe(7000);
    expect(totalPayable(p)).toBe(12000);
    expect(payoffDate(p)).toBe('2027-11-10');
  });

  it('is inactive when fully paid', () => {
    const p = plan({ paid_count: 12 });
    expect(isActive(p)).toBe(false);
    expect(remainingAmount(p)).toBe(0);
  });
});

describe('premium insights', () => {
  it('computes the cost of financing, never negative', () => {
    expect(financingCost(plan({ cash_price: 10000 }))).toBe(2000);
    expect(financingCost(plan({ cash_price: 12000 }))).toBe(0);
    expect(financingCost(plan({ cash_price: 15000 }))).toBe(0);
    expect(financingCost(plan())).toBeNull();
  });

  it('sums only active plans toward the monthly commitment', () => {
    const plans = [plan({ monthly_amount: 1000 }), plan({ id: 'p2', monthly_amount: 500.5 }), plan({ id: 'p3', paid_count: 12 })];
    expect(monthlyCommitment(plans)).toBe(1500.5);
  });

  it('computes the share of income, or null with no income', () => {
    const plans = [plan({ monthly_amount: 3000 })];
    expect(incomeShare(plans, 10000)).toBeCloseTo(0.3);
    expect(incomeShare(plans, 0)).toBeNull();
  });
});

describe('describeDue', () => {
  it('words and ranks urgency', () => {
    expect(describeDue(-1)).toEqual({ text: 'Overdue by 1 day', tone: 'overdue' });
    expect(describeDue(-5)).toEqual({ text: 'Overdue by 5 days', tone: 'overdue' });
    expect(describeDue(0)).toEqual({ text: 'Due today', tone: 'urgent' });
    expect(describeDue(1)).toEqual({ text: 'Due tomorrow', tone: 'urgent' });
    expect(describeDue(3)).toEqual({ text: 'Due in 3 days', tone: 'soon' });
    expect(describeDue(12)).toEqual({ text: 'Due in 12 days', tone: 'calm' });
  });
});
