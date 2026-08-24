import { describe, expect, it } from 'vitest';
import { detectCategory, detectType, extractCardLast4, parseAmount, parseSmsPayload, parseTransaction } from './categorize';

const categories = [
  { id: 'food', name: 'Food' },
  { id: 'groceries', name: 'Groceries' },
  { id: 'transport', name: 'Transport' },
  { id: 'income', name: 'Income' },
  { id: 'fuel', name: 'Fuel' },
];

describe('parseAmount', () => {
  it('prefers the currency-adjacent amount over the card digits', () => {
    expect(parseAmount('Card ending 1234 debited EGP 3000')).toBe(3000);
  });

  it('reads an amount written before the currency code', () => {
    expect(parseAmount('Purchase 250.75 EGP at CARREFOUR')).toBe(250.75);
  });

  it('handles thousands separators', () => {
    expect(parseAmount('EGP 12,500.50 debited')).toBe(12500.5);
  });

  it('ignores masked card digits when finding the amount', () => {
    expect(parseAmount('POS purchase ****4821 amount 940')).toBe(940);
  });

  it('falls back to the first number when no currency token is present', () => {
    expect(parseAmount('spent 1500 at the cafe')).toBe(1500);
  });

  it('returns null when the only digits are a card reference', () => {
    expect(parseAmount('Your card ending 1234 was used today')).toBeNull();
  });

  it('returns null when there is no number at all', () => {
    expect(parseAmount('payment declined')).toBeNull();
  });
});

describe('extractCardLast4', () => {
  it.each([
    ['Card ending 1234 debited EGP 300', '1234'],
    ['ending in 4821, EGP 90 spent', '4821'],
    ['Purchase on card no. 5566 for EGP 20', '5566'],
    ['POS ****7788 EGP 45', '7788'],
    ['Card 9012 debited EGP 75', '9012'],
  ])('finds the last four digits in %j', (text, expected) => {
    expect(extractCardLast4(text)).toBe(expected);
  });

  it('does not mistake a plain four-digit amount for a card', () => {
    expect(extractCardLast4('spent 1500 at the cafe')).toBeNull();
  });

  it('does not treat an amount following the word card as card digits', () => {
    expect(extractCardLast4('card debited EGP 3000')).toBeNull();
  });
});

describe('detectType', () => {
  it('treats credits as income', () => {
    expect(detectType('EGP 8000 credited to your account')).toBe('income');
  });

  it('treats debits as expenses', () => {
    expect(detectType('EGP 300 debited')).toBe('expense');
  });

  it('defaults to expense when the wording is ambiguous', () => {
    expect(detectType('EGP 300 at CARREFOUR')).toBe('expense');
  });
});

describe('detectCategory', () => {
  it('matches a merchant keyword to its category', () => {
    expect(detectCategory('Purchase at STARBUCKS', categories, 'expense')?.name).toBe('Food');
  });

  it('prefers a literal category name over a keyword guess', () => {
    // "Fuel" is a custom category and appears verbatim, so it wins over Transport's
    // "petrol"/"fuel" keyword mapping.
    expect(detectCategory('Fuel stop', categories, 'expense')?.name).toBe('Fuel');
  });

  it('routes income to the Income category', () => {
    expect(detectCategory('salary credited', categories, 'income')?.name).toBe('Income');
  });

  it('returns null when nothing matches', () => {
    expect(detectCategory('EGP 20 at ZZZQQQ', categories, 'expense')).toBeNull();
  });
});

describe('parseTransaction', () => {
  it('parses a realistic bank SMS end to end', () => {
    const result = parseTransaction('Card ending 4821 debited EGP 250.00 at CARREFOUR', categories);
    expect(result).toEqual({
      amount: 250,
      type: 'expense',
      category: { id: 'groceries', name: 'Groceries' },
      cardLast4: '4821',
    });
  });

  it('parses an income SMS', () => {
    const result = parseTransaction('EGP 8,000 credited to card ending 1234 - salary', categories);
    expect(result?.amount).toBe(8000);
    expect(result?.type).toBe('income');
    expect(result?.category?.name).toBe('Income');
    expect(result?.cardLast4).toBe('1234');
  });

  it('returns null when no amount can be found', () => {
    expect(parseTransaction('card ending 1234 blocked', categories)).toBeNull();
  });
});

describe('parseSmsPayload', () => {
  it('treats plain text as the message with no sender, unchanged from the original Shortcut setup', () => {
    expect(parseSmsPayload('EGP 300 debited at CARREFOUR')).toEqual({
      message: 'EGP 300 debited at CARREFOUR',
      sender: null,
    });
  });

  it('reads message and sender from JSON', () => {
    expect(parseSmsPayload('{"message":"EGP 300 debited","sender":"HSBC"}')).toEqual({
      message: 'EGP 300 debited',
      sender: 'HSBC',
    });
  });

  it('treats JSON without a sender field as having no sender', () => {
    expect(parseSmsPayload('{"message":"EGP 300 debited"}')).toEqual({
      message: 'EGP 300 debited',
      sender: null,
    });
  });

  it('falls back to plain text when the body merely looks like it could be JSON but is not an object with a message', () => {
    expect(parseSmsPayload('{"amount": 300}')).toEqual({
      message: '{"amount": 300}',
      sender: null,
    });
  });

  it('falls back to plain text for malformed JSON', () => {
    expect(parseSmsPayload('{not valid json')).toEqual({
      message: '{not valid json',
      sender: null,
    });
  });

  it('trims whitespace from both message and sender', () => {
    expect(parseSmsPayload('{"message":"  EGP 300 debited  ","sender":"  HSBC  "}')).toEqual({
      message: 'EGP 300 debited',
      sender: 'HSBC',
    });
  });

  it('treats a blank sender string as no sender', () => {
    expect(parseSmsPayload('{"message":"EGP 300 debited","sender":"   "}')).toEqual({
      message: 'EGP 300 debited',
      sender: null,
    });
  });
});
