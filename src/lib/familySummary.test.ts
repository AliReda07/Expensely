import { describe, expect, it } from 'vitest';
import { alertText, budgetState, combineCategories, memberDisplayName, shareOfTotal, toMonthStart } from './familySummary';

const cat = (name: string, amount: number, color: string | null = '#111111') => ({ category_id: null, name, color, amount });

describe('toMonthStart', () => {
  it('returns the first of the month from local calendar fields', () => {
    expect(toMonthStart(new Date(2026, 10, 21))).toBe('2026-11-01');
    expect(toMonthStart(new Date(2027, 0, 31))).toBe('2027-01-01');
  });
});

describe('combineCategories', () => {
  it('merges members by category name and sorts biggest first', () => {
    const merged = combineCategories([
      { by_category: [cat('Food', 100), cat('Fun', 30)] },
      { by_category: [cat('Food', 50), cat('Bills', 200)] },
    ]);
    expect(merged.map((c) => [c.name, c.amount])).toEqual([
      ['Bills', 200],
      ['Food', 150],
      ['Fun', 30],
    ]);
  });

  it('does not mutate the inputs', () => {
    const first = { by_category: [cat('Food', 100)] };
    combineCategories([first, { by_category: [cat('Food', 50)] }]);
    expect(first.by_category[0].amount).toBe(100);
  });

  it('keeps a colour when the first occurrence had none', () => {
    const merged = combineCategories([{ by_category: [cat('Food', 1, null)] }, { by_category: [cat('Food', 1, '#abc')] }]);
    expect(merged[0].color).toBe('#abc');
  });

  it('handles no members', () => {
    expect(combineCategories([])).toEqual([]);
  });
});

describe('shareOfTotal', () => {
  it('is a 0-1 fraction, safe on empty totals', () => {
    expect(shareOfTotal(25, 100)).toBe(0.25);
    expect(shareOfTotal(5, 0)).toBe(0);
    expect(shareOfTotal(0, 100)).toBe(0);
    expect(shareOfTotal(150, 100)).toBe(1);
  });
});

describe('memberDisplayName', () => {
  it('says You for the signed-in owner and the email name for everyone else', () => {
    expect(memberDisplayName({ user_id: 'me', email: 'me@x.com' }, 'me')).toBe('You');
    expect(memberDisplayName({ user_id: 'u2', email: 'sara@x.com' }, 'me')).toBe('sara');
  });
});

describe('budgetState', () => {
  it('flags near at 80% and over at 100%', () => {
    expect(budgetState({ amount: 100, spent: 50 }).level).toBe('ok');
    expect(budgetState({ amount: 100, spent: 80 }).level).toBe('near');
    expect(budgetState({ amount: 100, spent: 100 }).level).toBe('over');
    expect(budgetState({ amount: 100, spent: 150 }).ratio).toBe(1.5);
  });
});

describe('alertText', () => {
  const money = (n: number) => `E${n}`;
  const day = (d: string) => `on-${d}`;
  const base = { member_id: 'm', email: 'sara@x.com' };

  it('words a near-budget alert with the percentage', () => {
    expect(alertText({ ...base, type: 'budget', category_id: 'c', category_name: 'Food', amount: 200, spent: 170, level: 'near' }, 'Sara', money, day)).toEqual({
      text: 'Sara has used 85% of their Food budget (E170 of E200)',
      tone: 'near',
    });
  });

  it('words an over-budget alert, and the overall budget when there is no category', () => {
    expect(alertText({ ...base, type: 'budget', category_id: null, category_name: null, amount: 100, spent: 130, level: 'over' }, 'Sara', money, day)).toEqual({
      text: 'Sara is over their overall budget (E130 of E100)',
      tone: 'over',
    });
  });

  it('words a large purchase', () => {
    expect(alertText({ ...base, type: 'large_purchase', amount: 3200, date: '2026-11-18' }, 'Sara', money, day)).toEqual({
      text: 'Sara spent E3200 on on-2026-11-18',
      tone: 'info',
    });
  });
});
