import { describe, expect, it } from 'vitest';
import { clampDueDay, daysUntilDue, isPaidThisCycle, nextDueDate, previousDueDate } from './dueDate';

// All "today" instants below are given at noon UTC, which is always still the same
// calendar day in Cairo (UTC+2/+3) -- avoids any ambiguity about which side of the
// Cairo-local midnight the test actually lands on.
function cairoNoon(dateStr: string): Date {
  return new Date(`${dateStr}T12:00:00Z`);
}

describe('clampDueDay', () => {
  it('clamps day 31 to Feb 28 in a non-leap year', () => {
    expect(clampDueDay(31, 2026, 2)).toBe(28);
  });

  it('clamps day 31 to Feb 29 in a leap year', () => {
    expect(clampDueDay(31, 2028, 2)).toBe(29);
  });

  it('clamps day 30 to Feb 28 in a non-leap year', () => {
    expect(clampDueDay(30, 2026, 2)).toBe(28);
  });

  it('leaves a day that fits within the month untouched', () => {
    expect(clampDueDay(15, 2026, 3)).toBe(15);
  });
});

describe('daysUntilDue', () => {
  it('is 0 on the due date itself', () => {
    expect(daysUntilDue(15, cairoNoon('2026-03-15'))).toBe(0);
  });

  it('counts down mid-month', () => {
    expect(daysUntilDue(15, cairoNoon('2026-03-08'))).toBe(7);
    expect(daysUntilDue(15, cairoNoon('2026-03-14'))).toBe(1);
  });

  it('rolls over a year boundary', () => {
    expect(daysUntilDue(5, cairoNoon('2026-12-30'))).toBe(6);
  });

  it('reports 7 days for a due day 31 card in February (the clamp, end to end)', () => {
    expect(daysUntilDue(31, cairoNoon('2027-02-21'))).toBe(7);
  });
});

describe('previousDueDate', () => {
  it('falls in the previous month when today is before this month\'s due day', () => {
    expect(cairoDateStr(previousDueDate(15, cairoNoon('2026-01-10')))).toBe('2025-12-15');
  });

  it('falls in this month when today is after this month\'s due day', () => {
    expect(cairoDateStr(previousDueDate(15, cairoNoon('2026-01-20')))).toBe('2026-01-15');
  });

  it('clamps the previous month for a short-month due day', () => {
    // Next due is March 31; previous is February's clamped day.
    expect(cairoDateStr(previousDueDate(31, cairoNoon('2026-03-05')))).toBe('2026-02-28');
  });
});

describe('nextDueDate', () => {
  it('stays in the current month when today is on or before the due day', () => {
    expect(cairoDateStr(nextDueDate(15, cairoNoon('2026-01-15')))).toBe('2026-01-15');
  });

  it('rolls into next month once the due day has passed', () => {
    expect(cairoDateStr(nextDueDate(15, cairoNoon('2026-01-16')))).toBe('2026-02-15');
  });
});

describe('isPaidThisCycle', () => {
  const dueDay = 15;
  const cardId = 'card-1';

  it('is false with no income transactions', () => {
    expect(isPaidThisCycle(dueDay, cairoNoon('2026-03-20'), cardId, [])).toBe(false);
  });

  it('is true for income strictly after the previous due date', () => {
    const tx = [{ card_id: cardId, type: 'income', date: '2026-03-16' }];
    expect(isPaidThisCycle(dueDay, cairoNoon('2026-03-20'), cardId, tx)).toBe(true);
  });

  it('is false for a payment logged exactly on the previous due date (settles the prior cycle)', () => {
    const tx = [{ card_id: cardId, type: 'income', date: '2026-03-15' }];
    expect(isPaidThisCycle(dueDay, cairoNoon('2026-03-20'), cardId, tx)).toBe(false);
  });

  it('ignores income on other cards and non-income transactions', () => {
    const tx = [
      { card_id: 'card-2', type: 'income', date: '2026-03-16' },
      { card_id: cardId, type: 'expense', date: '2026-03-16' },
    ];
    expect(isPaidThisCycle(dueDay, cairoNoon('2026-03-20'), cardId, tx)).toBe(false);
  });
});

function cairoDateStr(date: Date): string {
  return date.toISOString().slice(0, 10);
}
