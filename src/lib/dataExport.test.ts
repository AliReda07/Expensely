import { afterEach, describe, expect, it, vi } from 'vitest';
import { confirmationMatches, downloadJson, exportFileName } from './dataExport';

afterEach(() => vi.restoreAllMocks());

describe('exportFileName', () => {
  it('uses the local date', () => {
    expect(exportFileName(new Date(2026, 10, 21))).toBe('expensely-data-2026-11-21.json');
    expect(exportFileName(new Date(2027, 0, 5))).toBe('expensely-data-2027-01-05.json');
  });
});

describe('confirmationMatches', () => {
  it('matches the email ignoring case and spaces', () => {
    expect(confirmationMatches('  Sara@Example.com ', 'sara@example.com')).toBe(true);
  });

  it('rejects anything else, and a missing email', () => {
    expect(confirmationMatches('sara@example.org', 'sara@example.com')).toBe(false);
    expect(confirmationMatches('', 'sara@example.com')).toBe(false);
    expect(confirmationMatches('sara@example.com', null)).toBe(false);
    expect(confirmationMatches('', '')).toBe(false);
  });
});

describe('downloadJson', () => {
  it('downloads the data as a named JSON file and releases the URL', () => {
    vi.useFakeTimers();
    const createObjectURL = vi.fn(() => 'blob:fake');
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    downloadJson('export.json', { hello: 'world' });

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = (createObjectURL.mock.calls[0] as unknown as [Blob])[0];
    expect(blob.type).toBe('application/json');
    expect(click).toHaveBeenCalledTimes(1);
    expect(document.querySelector('a[download]')).toBeNull();

    vi.advanceTimersByTime(1000);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake');
    vi.useRealTimers();
  });
});
