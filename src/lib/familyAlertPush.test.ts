import { describe, expect, it } from 'vitest';
import { composePush, nameFromEmail, type DigestRow } from './familyAlertPush';

const row = (over: Partial<DigestRow> = {}): DigestRow => ({
  owner_id: 'o',
  a_kind: 'budget',
  a_key: 'k',
  a_member: 'm',
  a_email: 'sara@example.com',
  a_category: 'Food',
  a_level: 'near',
  ...over,
});

describe('nameFromEmail', () => {
  it('uses the part before the @', () => {
    expect(nameFromEmail('sara@example.com')).toBe('sara');
    expect(nameFromEmail('weird')).toBe('weird');
  });
});

describe('composePush', () => {
  it('words a single near-budget alert', () => {
    expect(composePush([row()])).toEqual({ title: 'Family alert', body: 'sara is close to their Food budget' });
  });

  it('words over-budget, overall budget and large purchase', () => {
    const { title, body } = composePush([
      row({ a_level: 'over', a_category: null }),
      row({ a_kind: 'large_purchase', a_email: 'ahmed@example.com', a_category: null, a_level: null }),
    ]);
    expect(title).toBe('2 family alerts');
    expect(body).toBe('sara went over their overall budget · Large purchase by ahmed');
  });

  it('caps the list and says how many more', () => {
    const rows = Array.from({ length: 6 }, (_, i) => row({ a_key: `k${i}`, a_category: `Cat${i}` }));
    const { title, body } = composePush(rows);
    expect(title).toBe('6 family alerts');
    expect(body.split(' · ')).toHaveLength(5);
    expect(body.endsWith('and 2 more')).toBe(true);
  });

  it('never puts an amount in a lock-screen notification', () => {
    const { title, body } = composePush([row(), row({ a_kind: 'large_purchase', a_level: null })]);
    expect(`${title} ${body}`).not.toMatch(/\d{2,}|EGP|£|\$/);
  });
});
