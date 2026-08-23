import { describe, expect, it } from 'vitest';
import { formatCurrency, formatDate, monthKey, monthLabel, monthRange } from './format';

describe('formatCurrency', () => {
  it('formats a positive amount in the given currency', () => {
    expect(formatCurrency(42.5, 'EGP')).toContain('42.50');
  });

  it('defaults to EGP when no currency is given', () => {
    expect(formatCurrency(10)).toMatch(/EGP/);
  });

  it('formats zero', () => {
    expect(formatCurrency(0, 'USD')).toContain('0.00');
  });
});

describe('monthKey', () => {
  it('pads single-digit months', () => {
    expect(monthKey(new Date(2026, 0, 15))).toBe('2026-01');
  });

  it('does not pad double-digit months', () => {
    expect(monthKey(new Date(2026, 10, 1))).toBe('2026-11');
  });
});

describe('monthRange', () => {
  it('returns the first and last day of the month', () => {
    expect(monthRange(new Date(2026, 1, 15))).toEqual({ start: '2026-02-01', end: '2026-02-28' });
  });

  it('handles a 31-day month', () => {
    expect(monthRange(new Date(2026, 0, 1))).toEqual({ start: '2026-01-01', end: '2026-01-31' });
  });

  it('handles December rolling into next year correctly', () => {
    expect(monthRange(new Date(2026, 11, 25))).toEqual({ start: '2026-12-01', end: '2026-12-31' });
  });
});

describe('monthLabel', () => {
  it('formats as "Month Year"', () => {
    expect(monthLabel(new Date(2026, 7, 1))).toBe('August 2026');
  });
});

describe('formatDate', () => {
  it('formats as "Mon D"', () => {
    expect(formatDate('2026-08-23')).toBe('Aug 23');
  });

  it('is not affected by local timezone offset (no day shift)', () => {
    expect(formatDate('2026-01-01')).toBe('Jan 1');
  });
});
