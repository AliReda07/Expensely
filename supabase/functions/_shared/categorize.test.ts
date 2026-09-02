import { describe, expect, it } from 'vitest';
import {
  detectCategory,
  detectDirection,
  detectType,
  extractCardLast4,
  extractTransferParty,
  hasTransactionVerb,
  instantTransferFee,
  looksLikeInstantTransfer,
  looksLikeTransfer,
  computePromotedPhrases,
  matchCardByPhrase,
  matchesPromotedPhrase,
  matchesTrustedSender,
  normalize,
  parseAmount,
  parseSmsPayload,
  parseTransaction,
} from './categorize';

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

  it('reads an amount next to the Egyptian pound abbreviation "جم"', () => {
    expect(parseAmount('بمبلغ 100.00 جم من SOME PERSON')).toBe(100);
  });

  it('does not pick up a reference number or hotline as the amount when a currency-adjacent amount exists', () => {
    // Real sample: the amount (100.00) appears before a long reference number and a
    // hotline, both of which must be ignored in favor of the currency-adjacent value.
    const sms =
      'تم إضافة تحويل لحظي لبطاقتكم مسبقة الدفع بمبلغ 100.00 جم من SOME PERSON ' +
      'رقم مرجعي 627260319444 يوم 08-25 الساعة 21:27 للمزيد اتصل بـ 19623';
    expect(parseAmount(sms)).toBe(100);
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

  it('does not mistake an Arabic reference number or hotline for card digits', () => {
    // Real sample: "رقم مرجعي" (reference number) and the hotline "19623" are not card
    // references at all -- this message genuinely never names a card.
    const sms =
      'تم إضافة تحويل لحظي لبطاقتكم مسبقة الدفع بمبلغ 100.00 جم من SOME PERSON ' +
      'رقم مرجعي 627260319444 يوم 08-25 الساعة 21:27 للمزيد اتصل بـ 19623';
    expect(extractCardLast4(sms)).toBeNull();
  });

  it('reads the last four digits from a real Arabic "card ... number NNNN" purchase SMS', () => {
    const sms =
      'تم خصم 150 EGP من بطاقة المدفوعة مقدما رقم 6238 باستخدام Mobile Payment عند ' +
      'PAYMOB-*Rockies Restau CA يوم 08/08/26 الساعه 20:03 المتاح 418.52EGP للمزيد إتصل ب ١٩٦٢٣';
    expect(extractCardLast4(sms)).toBe('6238');
  });

  it('does not match a bare "رقم" (number) with no "بطاقة" (card) mentioned nearby', () => {
    expect(extractCardLast4('رقم مرجعي 6238 للمزيد اتصل بـ 19623')).toBeNull();
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

  // Regression test for a real bug: an Arabic "money added to your card" transfer was
  // logged as an expense because 'expense' was the unconditional fallback and nothing
  // recognized the Arabic wording at all.
  it('treats a real Arabic "added to your card" transfer as income, not the expense default', () => {
    const sms =
      'تم إضافة تحويل لحظي لبطاقتكم مسبقة الدفع بمبلغ 100.00 جم من SOME PERSON ' +
      'رقم مرجعي 627260319444 يوم 08-25 الساعة 21:27 للمزيد اتصل بـ 19623';
    expect(detectType(sms)).toBe('income');
  });

  it('treats a prior charge being reversed as income', () => {
    expect(detectType('EGP 150 reversal credited to your account')).toBe('income');
  });

  it('treats a completed charge as an expense', () => {
    expect(detectType('Your card was charged EGP 45.00 at NETFLIX')).toBe('expense');
  });
});

describe('detectDirection', () => {
  // Confirmed against a real bank SMS: "لبطاقتكم" fuses the preposition "to" directly
  // onto "your card" with no space, which a plain \b-based match would never catch.
  it('reads the fused "to your card" preposition as incoming', () => {
    expect(detectDirection('تم إضافة تحويل لحظي لبطاقتكم بمبلغ 100.00 جم')).toBe('in');
  });

  it('reads the separated "to your account" preposition as incoming', () => {
    expect(detectDirection('تم تحويل مبلغ 100 جم الى حسابك')).toBe('in');
  });

  it('reads "from your account" as outgoing', () => {
    expect(detectDirection('تم تحويل مبلغ 100 جم من حسابك')).toBe('out');
  });

  it('reads the real outgoing-transfer sample ("من بطاقتكم") as outgoing', () => {
    const sms =
      'تم تنفيذ تحويل لحظي من بطاقتكم مسبقة الدفع بمبلغ 100.00 جم إلى ALI A**** M****** ' +
      'رقم مرجعي 627260319444 يوم 08-25 الساعة 21:27 للمزيد اتصل بـ 19623';
    expect(detectDirection(sms)).toBe('out');
  });

  it('does not treat "to <a person\'s name>" as incoming -- only "to your card/account" counts', () => {
    // Mirror image of the "from <person>" test below: the real outgoing sample says
    // "إلى ALI A**** M******" (to that person), which must not be confused with
    // "إلى حسابك"/"لبطاقتكم" (to your account) -- same word "إلى", opposite meaning.
    expect(detectDirection('تحويل بمبلغ 100 جم إلى ALI A**** M******')).toBeNull();
  });

  it('does not treat "from <a person\'s name>" as outgoing -- only "from your card/account" counts', () => {
    // The real sample says "من SOME PERSON" (money came from that person), which must
    // not be confused with "من حسابك" (from your account) -- they use the same word
    // "من" but mean opposite things for this app's purposes.
    expect(detectDirection('تحويل بمبلغ 100 جم من SOME PERSON')).toBeNull();
  });

  it('returns null for text with no account-direction phrasing at all', () => {
    expect(detectDirection('EGP 300 debited at CARREFOUR')).toBeNull();
  });

  // Real sample: Egyptian banks routing an InstaPay (IPN) transfer word the direction as
  // a verb ("sent"/"received") rather than a preposition on "your card"/"your account".
  it('reads an English "transfer sent" notice as outgoing', () => {
    const sms =
      'IPN transfer sent with amount of EGP 330.00 from 3670 on 29/08 at 12:54 AM. ' +
      'Ref# da2c9f0d. For more details call 16607';
    expect(detectDirection(sms)).toBe('out');
  });

  it('reads an English "transfer received" notice as incoming', () => {
    const sms =
      'IPN transfer received with amount of EGP 70.00 on 3670 on 29/08 at 12:45 AM. ' +
      'Ref# f922558e. For more details call 16607.';
    expect(detectDirection(sms)).toBe('in');
  });

  it('does not read a bare "sent" with no transfer wording as a direction', () => {
    expect(detectDirection('Your verification code was sent, EGP 50 off your next order')).toBeNull();
  });

  it('reads "transaction sent" as outgoing even without the word "transfer"', () => {
    expect(detectDirection('Transaction sent EGP 100.00 to merchant')).toBe('out');
  });
});

describe('extractTransferParty', () => {
  it('reads the recipient name from the real outgoing-transfer sample, stopping before the reference-number field', () => {
    const sms =
      'تم تنفيذ تحويل لحظي من بطاقتكم مسبقة الدفع بمبلغ 100.00 جم إلى ALI A**** M****** ' +
      'رقم مرجعي 627260319444 يوم 08-25 الساعة 21:27 للمزيد اتصل بـ 19623';
    expect(extractTransferParty(sms, 'out')).toBe('ALI A**** M******');
  });

  it('stops before "رقم" for a name shorter than the word cap, instead of swallowing it as part of the name', () => {
    // Real transaction from this user's history: the stored note ended up as
    // "To el t**** رقم" because the 2-word name left one word-cap slot free, which the
    // old pattern filled with "رقم" (the start of "رقم مرجعي", "reference number") since
    // nothing told it that field had already begun.
    const sms =
      'تم تنفيذ تحويل لحظي من بطاقتكم مسبقة الدفع بمبلغ 1.00 جم إلى el t**** ' +
      'رقم مرجعي 406121668403 يوم 08-27 الساعة 05:44 للمزيد اتصل بـ 19623';
    expect(extractTransferParty(sms, 'out')).toBe('el t****');
  });

  it('reads a 3-word recipient name that is not followed by a رقم field, without truncating it', () => {
    // The stop-word guard must not fire on ordinary words that merely aren't "رقم" --
    // this exercises all three word-cap slots with a trailing field absent entirely.
    expect(extractTransferParty('تم تحويل بمبلغ 100 جم الى Sara Ahmed Mostafa', 'out')).toBe('Sara Ahmed Mostafa');
  });

  it('reads a recipient name after the separated "to" preposition', () => {
    expect(extractTransferParty('تم تحويل مبلغ 100 جم الى Mona Ahmed', 'out')).toBe('Mona Ahmed');
  });

  it('reads an English "to <name>" recipient', () => {
    expect(extractTransferParty('Transferred EGP 100 to John Smith', 'out')).toBe('John Smith');
  });

  it('reads a sender name after "from" for an incoming transfer', () => {
    // Amount-then-sender ordering matches the existing "من SOME PERSON" fixture used
    // elsewhere in this file (see detectDirection's "does not treat 'from <person>'..."
    // case above) -- the name trailing at the end, not followed by another field.
    expect(extractTransferParty('تم إضافة تحويل لحظي لبطاقتكم بمبلغ 100.00 جم من SOME PERSON', 'in')).toBe('SOME PERSON');
  });

  it('returns null when the direction is unknown', () => {
    expect(extractTransferParty('تحويل بمبلغ 100 جم إلى ALI A**** M******', null)).toBeNull();
  });

  it('returns null when there is no name in that position', () => {
    expect(extractTransferParty('تم تنفيذ تحويل لحظي من بطاقتكم بمبلغ 100.00 جم', 'out')).toBeNull();
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

  describe('with a Transfer category available', () => {
    const categoriesWithTransfer = [...categories, { id: 'transfer', name: 'Transfer' }];

    it('routes an incoming transfer to Transfer instead of the generic Income category', () => {
      const sms = 'تم إضافة تحويل لحظي لبطاقتكم بمبلغ 100.00 جم من SOME PERSON';
      expect(detectCategory(sms, categoriesWithTransfer, 'income')?.name).toBe('Transfer');
    });

    it('routes an outgoing transfer to Transfer instead of falling through to null', () => {
      expect(detectCategory('تم تحويل بمبلغ 100 جم من حسابك', categoriesWithTransfer, 'expense')?.name).toBe('Transfer');
    });

    it('routes the real outgoing-transfer sample to Transfer end to end via parseTransaction', () => {
      const sms =
        'تم تنفيذ تحويل لحظي من بطاقتكم مسبقة الدفع بمبلغ 100.00 جم إلى ALI A**** M****** ' +
        'رقم مرجعي 627260319444 يوم 08-25 الساعة 21:27 للمزيد اتصل بـ 19623';
      const result = parseTransaction(sms, categoriesWithTransfer);
      expect(result?.type).toBe('expense');
      expect(result?.category?.name).toBe('Transfer');
    });

    it('still prefers Income when the message is not a transfer at all', () => {
      expect(detectCategory('EGP 8000 credited to your account', categoriesWithTransfer, 'income')?.name).toBe('Income');
    });

    it('does not route an ordinary purchase to Transfer', () => {
      expect(detectCategory('Purchase at STARBUCKS', categoriesWithTransfer, 'expense')?.name).toBe('Food');
    });

    it('falls back to the normal rules when no Transfer category exists', () => {
      // categories (without Transfer) is the module-level fixture used elsewhere.
      const sms = 'تم إضافة تحويل لحظي لبطاقتكم بمبلغ 100.00 جم من SOME PERSON';
      expect(detectCategory(sms, categories, 'income')?.name).toBe('Income');
    });
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

  it('parses a real Egyptian bank transfer SMS as income with no card attached', () => {
    // Real (redacted) sample that was previously mis-booked as an expense against cash.
    // It never mentions a card number -- only a reference number and a support hotline --
    // so cardLast4 correctly staying null reflects the message, not a parsing failure.
    const sms =
      'تم إضافة تحويل لحظي لبطاقتكم مسبقة الدفع بمبلغ 100.00 جم من SOME PERSON ' +
      'رقم مرجعي 627260319444 يوم 08-25 الساعة 21:27 للمزيد اتصل بـ 19623';
    const result = parseTransaction(sms, categories);
    expect(result?.amount).toBe(100);
    expect(result?.type).toBe('income');
    expect(result?.cardLast4).toBeNull();
  });

  it('parses a real Egyptian bank purchase SMS as an expense with the card resolved', () => {
    // Real (redacted) sample from the same prepaid card as the transfer above -- note it
    // describes the card differently ("بطاقة المدفوعة مقدما" here vs "مسبقة الدفع" there),
    // confirming a phrase captured from one message type doesn't necessarily generalize
    // to another. This message does carry the card's last 4 digits, unlike the transfer.
    const sms =
      'تم خصم 150 EGP من بطاقة المدفوعة مقدما رقم 6238 باستخدام Mobile Payment عند ' +
      'PAYMOB-*Rockies Restau CA يوم 08/08/26 الساعه 20:03 المتاح 418.52EGP للمزيد إتصل ب ١٩٦٢٣';
    const result = parseTransaction(sms, categories);
    expect(result?.amount).toBe(150);
    expect(result?.type).toBe('expense');
    expect(result?.cardLast4).toBe('6238');
  });

  it('parses the real outgoing-transfer SMS as an expense with no card attached', () => {
    // Real (redacted) sample, same prepaid card, opposite direction from the very first
    // sample this session was built on. Confirms OUTGOING_ACCOUNT_RE ("من بطاقتكم"),
    // previously provisional/unconfirmed. Like the incoming transfer, it never prints a
    // card number -- only a reference number and the same support hotline -- so
    // cardLast4 staying null is correct, not a parsing gap.
    const sms =
      'تم تنفيذ تحويل لحظي من بطاقتكم مسبقة الدفع بمبلغ 100.00 جم إلى ALI A**** M****** ' +
      'رقم مرجعي 627260319444 يوم 08-25 الساعة 21:27 للمزيد اتصل بـ 19623';
    const result = parseTransaction(sms, categories);
    expect(result?.amount).toBe(100);
    expect(result?.type).toBe('expense');
    expect(result?.cardLast4).toBeNull();
  });

  describe('strict mode', () => {
    it('rejects a real promotional SMS that quotes a currency-adjacent amount', () => {
      // Real sample: a Breadfast promo. "capped at EGP 5,000" is a currency-adjacent
      // number, so non-strict parsing books it as a fake EGP 5,000 expense -- confirmed
      // as a live bug before this gate existed. No transaction verb anywhere is what
      // actually distinguishes this from a real transaction notification.
      const sms =
        'Get 25% OFF, capped at EGP 5,000, on Fragrances and Beauty with code BTG25. ' +
        'Stock up on your beauty essentials and get everything delivered in an hour or ' +
        'less. Offer is valid today only. app.breadfast.com';
      expect(parseTransaction(sms, categories, { strict: true })).toBeNull();
      // Confirms it's booked as a real (wrong) transaction without the gate.
      expect(parseTransaction(sms, categories)).toEqual({
        amount: 5000,
        type: 'expense',
        category: null,
        cardLast4: null,
      });
    });

    it('still accepts every real transaction sample confirmed so far', () => {
      const realSamples = [
        'Card ending 4821 debited EGP 250.00 at CARREFOUR',
        'EGP 8,000 credited to card ending 1234 - salary',
        'تم إضافة تحويل لحظي لبطاقتكم مسبقة الدفع بمبلغ 100.00 جم من SOME PERSON رقم مرجعي 627260319444',
        'تم خصم 150 EGP من بطاقة المدفوعة مقدما رقم 6238 باستخدام Mobile Payment عند PAYMOB',
        'تم تنفيذ تحويل لحظي من بطاقتكم مسبقة الدفع بمبلغ 100.00 جم إلى ALI A**** M******',
        'IPN transfer sent with amount of EGP 330.00 from 3670 on 29/08 at 12:54 AM. Ref# da2c9f0d. For more details call 16607',
      ];
      for (const sms of realSamples) {
        expect(parseTransaction(sms, categories, { strict: true })).not.toBeNull();
      }
    });

    it('rejects a message with a number but no currency token at all (e.g. an OTP)', () => {
      expect(parseTransaction('Your verification code is 483920', categories, { strict: true })).toBeNull();
    });

    it('rejects an ambiguous ("تحويل" with no resolvable direction) transfer rather than guessing', () => {
      expect(parseTransaction('تحويل بمبلغ 100 جم', categories, { strict: true })).toBeNull();
    });

    it('parses the real "IPN transfer sent" sample as an outgoing Transfer expense', () => {
      const categoriesWithTransfer = [...categories, { id: 'transfer', name: 'Transfer' }];
      const sms =
        'IPN transfer sent with amount of EGP 330.00 from 3670 on 29/08 at 12:54 AM. ' +
        'Ref# da2c9f0d. For more details call 16607';
      expect(parseTransaction(sms, categoriesWithTransfer, { strict: true })).toEqual({
        amount: 330,
        type: 'expense',
        category: { id: 'transfer', name: 'Transfer' },
        cardLast4: null,
      });
    });

    it('logs a phrase-matched message even when no verb is recognized', () => {
      const sms = 'Successful transaction EGP 120.00 card 5624';
      expect(parseTransaction(sms, categories, { strict: true })).toBeNull();
      expect(parseTransaction(sms, categories, { strict: true, bypassVerbGate: true })).not.toBeNull();
    });

    it('still rejects a phrase-matched message with no currency-adjacent amount', () => {
      expect(
        parseTransaction('Your verification code is 483920', categories, { strict: true, bypassVerbGate: true }),
      ).toBeNull();
    });
  });
});

describe('hasTransactionVerb', () => {
  it('is true for a message with a resolvable transfer direction', () => {
    expect(hasTransactionVerb('تم إضافة تحويل لحظي لبطاقتكم بمبلغ 100.00 جم')).toBe(true);
  });

  it('is true for a message with an expense keyword', () => {
    expect(hasTransactionVerb('Card ending 4821 debited EGP 250.00')).toBe(true);
  });

  it('is true for a message with an income keyword', () => {
    expect(hasTransactionVerb('EGP 8,000 credited to your account')).toBe(true);
  });

  it('is false for a promotional message with no transaction verb', () => {
    expect(hasTransactionVerb('Get 25% OFF, capped at EGP 5,000, on Fragrances and Beauty')).toBe(false);
  });

  it('is false for an ambiguous transfer with no resolvable direction', () => {
    expect(hasTransactionVerb('تحويل بمبلغ 100 جم')).toBe(false);
  });

  it('is true for a real English "IPN transfer sent" notice', () => {
    const sms =
      'IPN transfer sent with amount of EGP 330.00 from 3670 on 29/08 at 12:54 AM. ' +
      'Ref# da2c9f0d. For more details call 16607';
    expect(hasTransactionVerb(sms)).toBe(true);
  });
});

describe('normalize', () => {
  it('converts Arabic-Indic digits to ASCII', () => {
    expect(normalize('٣٠٠')).toBe('300');
  });

  it('converts extended (Persian/Urdu) Arabic-Indic digits to ASCII', () => {
    expect(normalize('۳۰۰')).toBe('300');
  });

  it('strips Arabic diacritics and tatweel', () => {
    expect(normalize('مَرْحَبًا')).toBe('مرحبا');
    expect(normalize('اهــلا')).toBe('اهلا');
  });

  it('normalizes alef variants, taa marbuta and alef maqsura to their bare forms', () => {
    expect(normalize('أحمد')).toBe('احمد');
    expect(normalize('إحسان')).toBe('احسان');
    expect(normalize('آمن')).toBe('امن');
    expect(normalize('مدرسة')).toBe('مدرسه');
    expect(normalize('على')).toBe('علي');
  });

  it('strips invisible bidi and zero-width control characters', () => {
    expect(normalize('EGP‏ 300')).toBe('EGP 300');
    expect(normalize('‪EGP 300‬')).toBe('EGP 300');
  });

  it('collapses whitespace and trims', () => {
    expect(normalize('  EGP   300   debited  ')).toBe('EGP 300 debited');
  });

  it('leaves plain ASCII text unchanged apart from whitespace collapsing', () => {
    expect(normalize('Card ending 1234 debited EGP 300')).toBe('Card ending 1234 debited EGP 300');
  });
});

describe('containsWord Unicode-awareness (via detectCategory)', () => {
  // Regression test for the bug where `\b`, being ASCII-only, never matched a keyword
  // surrounded by Arabic text -- silently making any Arabic keyword dead code.
  it('matches a category name written in Arabic and surrounded only by Arabic text', () => {
    const arabicCategories = [{ id: 'restaurant', name: 'مطعم' }];
    expect(detectCategory('تم الدفع في مطعم الامس', arabicCategories, 'expense')?.name).toBe('مطعم');
  });

  it('does not match an Arabic word as a substring of a longer Arabic word', () => {
    const arabicCategories = [{ id: 'restaurant', name: 'مطعم' }];
    expect(detectCategory('مطعمين', arabicCategories, 'expense')).toBeNull();
  });
});

describe('detectCategory merchant keyword suffix matching (the MCDONALDS fix)', () => {
  const realMcdonaldsSms =
    'تم خصم 90 EGP  من بطاقة المدفوعة مقدما رقم 6238  باستخدام Mobile Payment عند ' +
    'MCDONALDS MAADI       CAI  يوم 02/09/26  الساعه 00:56  المتاح 1700.02EGP  للمزيد إتصل ب ١٩٦٢٣';

  it('categorizes the real MCDONALDS purchase SMS as Food', () => {
    expect(detectCategory(realMcdonaldsSms, categories, 'expense')?.name).toBe('Food');
  });

  it('matches the unpunctuated plural "MCDONALDS"', () => {
    expect(detectCategory('Purchase at MCDONALDS', categories, 'expense')?.name).toBe('Food');
  });

  it('still matches the apostrophe form "MCDONALD\'S" (no regression)', () => {
    expect(detectCategory("Purchase at MCDONALD'S", categories, 'expense')?.name).toBe('Food');
  });

  it('matches case-insensitively', () => {
    expect(detectCategory('purchase at mcdonalds', categories, 'expense')?.name).toBe('Food');
  });

  it('deliberately lets "market*" match inside "MARKETING" (accepted risk, see categorize.ts)', () => {
    // "market" is the one generic noun given the suffix-tolerant "*" anyway: in Egyptian
    // POS strings a "market" token is a grocer close to every time, and the cost of the
    // rare false positive here is a one-tap category fix in the app.
    expect(detectCategory('EGP 50 charged for MARKETING services', categories, 'expense')?.name).toBe('Groceries');
  });

  it('keeps other generic nouns strict, e.g. "metro" does not match inside "METROPOLITAN"', () => {
    expect(detectCategory('Ride to METROPOLITAN area', categories, 'expense')).toBeNull();
  });

  it('does not weaken the transaction verb gate', () => {
    // No transaction verb/direction and no currency-adjacent context beyond the cap figure --
    // this must still be rejected outright by parseTransaction's strict mode.
    const promo = 'Get 20% cashback at MCDONALDS, capped at EGP 5,000';
    expect(parseTransaction(promo, categories, { strict: true })).toBeNull();
  });

  describe('Food chains', () => {
    it.each([
      ['BUFFALO BURGER NASR CITY', 'Food'],
      ['BUFFALO BURG', 'Food'], // truncated POS string; "burger*" alone cannot match this
      ['COOK DOOR   MAADI', 'Food'], // also proves whitespace collapsing
      ['COOKDOOR HELIOPOLIS', 'Food'],
      ['CILANTRO CAFE', 'Food'],
      ['BAZOOKA', 'Food'],
      ['TWO BROZ', 'Food'],
      ['2 BROZ', 'Food'],
      ['TWOBROZ', 'Food'], // fused spelling; "broz*" alone cannot match this
      ['KFC MAADI', 'Food'], // regression guard, already worked
      ['ROMA PIZZA', 'Food'],
    ])('%s -> %s', (fragment, expectedCategory) => {
      expect(detectCategory(fragment, categories, 'expense')?.name).toBe(expectedCategory);
    });

    it('does not route "ROMANIA"/"ROMANTIC HOTEL" to Food via "roma*"', () => {
      expect(detectCategory('Purchase at ROMANIA IMPORTS', categories, 'expense')).toBeNull();
      expect(detectCategory('Booking at ROMANTIC HOTEL', categories, 'expense')).toBeNull();
    });

    it('does not route "COOKIES" to Food via the Cook Door entries', () => {
      // "cook door" stayed a strict phrase rather than becoming "cook*".
      expect(detectCategory('EGP 40 at SWEET COOKIES SHOP', categories, 'expense')).toBeNull();
    });
  });

  describe('Groceries chains', () => {
    it('categorizes the real FAWRY*ALMALKY MARKT purchase (uncategorized before this fix)', () => {
      const sms =
        'تم خصم 17 EGP  من بطاقة المدفوعة مقدما رقم 6238  باستخدام Mobile Payment عند ' +
        'FAWRY*ALMALKY MARKT     C  يوم 01/09/26  الساعه 23:30  المتاح 1790.02EGP  للمزيد إتصل ب ١٩٦٢٣';
      expect(detectCategory(sms, categories, 'expense')?.name).toBe('Groceries');
    });

    it('categorizes the real SEOUDI - MARRAS purchase (uncategorized before this fix)', () => {
      const sms =
        'تم خصم 374.9 جم من بطاقة الائتمان رقم 2307  عند SEOUDI - MARRAS يوم 08-30 ' +
        'الساعة 19:04 المتاح 10489.61 جم للمزيد اتصل ب 19623.';
      expect(detectCategory(sms, categories, 'expense')?.name).toBe('Groceries');
    });

    it('still matches a plain "Spinneys" mention (no regression)', () => {
      expect(detectCategory('عند Spinneys', categories, 'expense')?.name).toBe('Groceries');
    });

    it('matches the apostrophe form "SPINNEY\'S"', () => {
      expect(detectCategory("Purchase at SPINNEY'S", categories, 'expense')?.name).toBe('Groceries');
    });

    it.each(['MAHMOUD ELFAR', 'MAHMOUD EL FAR', 'MAHMOUD EL-FAR'])('matches "%s"', (fragment) => {
      expect(detectCategory(fragment, categories, 'expense')?.name).toBe('Groceries');
    });

    it('matches "OSCAR GRAND STORES"', () => {
      expect(detectCategory('OSCAR GRAND STORES', categories, 'expense')?.name).toBe('Groceries');
    });

    it('routes "METRO MARKET" to Groceries, not Transport (proves map ordering)', () => {
      expect(detectCategory('METRO MARKET', categories, 'expense')?.name).toBe('Groceries');
    });

    it('does not route a bare person-to-person "MAHMOUD" payment to Groceries', () => {
      // "mahmoud*" was deliberately rejected in favour of the "el far" stems.
      expect(detectCategory('Payment to MAHMOUD', categories, 'expense')).toBeNull();
    });
  });

  describe('"toll" no longer matches the bank\'s own "toll free" hotline text', () => {
    it('does not route a message ending in the toll-free hotline line to Transport', () => {
      const sms = 'Your Debit Card **5624 had a Successful transaction of EGP 800.00 @Scene cinema, for lost/stolen card call 16607, toll free';
      expect(detectCategory(sms, categories, 'expense')).toBeNull();
    });

    it('still matches an actual toll gate charge', () => {
      expect(detectCategory('EGP 15 at CAIRO TOLL GATE', categories, 'expense')?.name).toBe('Transport');
    });

    it('matches a fused "TOLLGATE" spelling', () => {
      expect(detectCategory('Purchase at 6TH OCTOBER TOLLGATE', categories, 'expense')?.name).toBe('Transport');
    });
  });
});

describe('looksLikeTransfer', () => {
  it('recognizes the real transfer sample', () => {
    const sms =
      'تم إضافة تحويل لحظي لبطاقتكم مسبقة الدفع بمبلغ 100.00 جم من SOME PERSON ' +
      'رقم مرجعي 627260319444 يوم 08-25 الساعة 21:27 للمزيد اتصل بـ 19623';
    expect(looksLikeTransfer(sms)).toBe(true);
  });

  it('does not flag a real purchase SMS as a transfer', () => {
    const sms =
      'تم خصم 150 EGP من بطاقة المدفوعة مقدما رقم 6238 باستخدام Mobile Payment عند ' +
      'PAYMOB-*Rockies Restau CA يوم 08/08/26 الساعه 20:03 المتاح 418.52EGP للمزيد إتصل ب ١٩٦٢٣';
    expect(looksLikeTransfer(sms)).toBe(false);
  });

  it('recognizes the English word regardless of case', () => {
    expect(looksLikeTransfer('Transfer of EGP 200 completed')).toBe(true);
    expect(looksLikeTransfer('EGP 200 TRANSFERRED to your account')).toBe(true);
  });

  it('does not match "transfer" as a substring of an unrelated word', () => {
    expect(looksLikeTransfer('EGP 200 transferable voucher issued')).toBe(false);
  });
});

describe('looksLikeInstantTransfer', () => {
  it('recognizes the real transfer sample ("تحويل لحظي")', () => {
    expect(looksLikeInstantTransfer('تم إضافة تحويل لحظي لبطاقتكم بمبلغ 100.00 جم')).toBe(true);
  });

  it('recognizes the alternate common wording "فوري"', () => {
    expect(looksLikeInstantTransfer('تم تحويل فوري بمبلغ 100 جم')).toBe(true);
  });

  it('does not flag a plain transfer with no instant/immediate wording', () => {
    expect(looksLikeInstantTransfer('تم تحويل بمبلغ 100 جم الى حسابك')).toBe(false);
  });

  it('does not flag the real purchase SMS', () => {
    const sms =
      'تم خصم 150 EGP من بطاقة المدفوعة مقدما رقم 6238 باستخدام Mobile Payment عند ' +
      'PAYMOB-*Rockies Restau CA يوم 08/08/26 الساعه 20:03 المتاح 418.52EGP للمزيد إتصل ب ١٩٦٢٣';
    expect(looksLikeInstantTransfer(sms)).toBe(false);
  });

  it('recognizes "IPN" as InstaPay\'s own abbreviation in its transfer notices', () => {
    const sms =
      'IPN transfer sent with amount of EGP 330.00 from 3670 on 29/08 at 12:54 AM. ' +
      'Ref# da2c9f0d. For more details call 16607';
    expect(looksLikeInstantTransfer(sms)).toBe(true);
  });
});

describe('instantTransferFee', () => {
  it('charges the fee on a real outgoing IPN transfer', () => {
    const sms =
      'IPN transfer sent with amount of EGP 70.00 from 3670 on 01/09 at 11:51 PM. ' +
      'Ref# 62f71ff5. For more details call 16607.';
    expect(instantTransferFee(sms)).toBe(0.5);
  });

  it('does not charge the fee on an incoming IPN transfer', () => {
    const sms =
      'IPN transfer received with amount of EGP 235.00 on 3670 on 02/09 at 12:29 AM. ' +
      'Ref# 0cae6a5c. For more details call 16607.';
    expect(instantTransferFee(sms)).toBe(0);
  });

  it('charges the fee on a real outgoing Arabic instant transfer', () => {
    const sms =
      'تم تنفيذ تحويل لحظي من بطاقتكم مسبقة الدفع بمبلغ 50.00 جم إلى ALI A**** M****** ' +
      'رقم مرجعي 295280099680 يوم 08-27 الساعة 14:42 للمزيد اتصل بـ 19623';
    expect(instantTransferFee(sms)).toBe(0.5);
  });

  it('does not charge the fee on an incoming Arabic instant transfer', () => {
    const sms =
      'تم إضافة تحويل لحظي لبطاقتكم مسبقة الدفع بمبلغ 50.00 جم من REHAB MOHAMED ABDELSAMEE ' +
      'رقم مرجعي 295280099680 يوم 08-27 الساعة 14:42 للمزيد اتصل بـ 19623';
    expect(instantTransferFee(sms)).toBe(0);
  });

  it('does not charge the fee on an ordinary purchase (the critical negative)', () => {
    const sms =
      'تم خصم 90 EGP  من بطاقة المدفوعة مقدما رقم 6238  باستخدام Mobile Payment عند ' +
      'MCDONALDS MAADI       CAI  يوم 02/09/26  الساعه 00:56  المتاح 1700.02EGP  للمزيد إتصل ب ١٩٦٢٣';
    expect(instantTransferFee(sms)).toBe(0);
  });

  it('does not charge the fee on an outgoing transfer with no instant/IPN wording', () => {
    expect(instantTransferFee('تم تحويل بمبلغ 100 جم من حسابك')).toBe(0);
  });

  it('rounds to two decimal places without float drift', () => {
    // 374.9 + 0.5 === 375.40000000000003 in raw floating point; the webhook's rounding
    // step must land on exactly 375.4. This uses the real amount from a live transaction.
    expect(Math.round((374.9 + instantTransferFee('IPN transfer sent EGP 374.90 from 3670')) * 100) / 100).toBe(375.4);
  });
});

describe('matchCardByPhrase', () => {
  it('resolves the one card whose phrase appears in the message', () => {
    const cards = [
      { id: 'prepaid', sms_match_phrases: ['مسبقة الدفع'] },
      { id: 'main', sms_match_phrases: [] },
    ];
    const sms = 'تم إضافة تحويل لحظي لبطاقتكم مسبقة الدفع بمبلغ 100.00 جم من SOME PERSON';
    expect(matchCardByPhrase(sms, cards)).toBe('prepaid');
  });

  it('is case-insensitive and normalizes Arabic letter forms on both sides', () => {
    // Phrase saved with plain taa marbuta/alef, message uses the same word with the
    // diacritic-and-variant forms a bank might actually send.
    const cards = [{ id: 'prepaid', sms_match_phrases: ['مسبقه الدفع'] }];
    expect(matchCardByPhrase('بطاقتكم مَسْبَقَة الدفع بمبلغ 100 جم', cards)).toBe('prepaid');
  });

  it('resolves via any one of several phrases on the same card', () => {
    // Real scenario: the same prepaid card is described as "مسبقة الدفع" in a transfer
    // notice but "بطاقة المدفوعة مقدما" in a purchase notice from the same bank -- one
    // phrase per card isn't enough to cover both message types.
    const cards = [
      { id: 'prepaid', sms_match_phrases: ['مسبقة الدفع', 'بطاقة المدفوعة مقدما'] },
      { id: 'main', sms_match_phrases: [] },
    ];
    const transferSms = 'تم إضافة تحويل لحظي لبطاقتكم مسبقة الدفع بمبلغ 100.00 جم من SOME PERSON';
    const purchaseSms = 'تم خصم 150 EGP من بطاقة المدفوعة مقدما رقم 6238 باستخدام Mobile Payment';
    expect(matchCardByPhrase(transferSms, cards)).toBe('prepaid');
    expect(matchCardByPhrase(purchaseSms, cards)).toBe('prepaid');
  });

  it('never guesses between two cards whose phrases both match', () => {
    const cards = [
      { id: 'a', sms_match_phrases: ['جم'] },
      { id: 'b', sms_match_phrases: ['مسبقة الدفع'] },
    ];
    expect(matchCardByPhrase('مسبقة الدفع بمبلغ 100 جم', cards)).toBeNull();
  });

  it('still refuses to guess when the ambiguity comes from two phrases on two different cards, not just one each', () => {
    const cards = [
      { id: 'a', sms_match_phrases: ['مسبقة الدفع', 'جم'] },
      { id: 'b', sms_match_phrases: ['مسبقة الدفع'] },
    ];
    expect(matchCardByPhrase('مسبقة الدفع بمبلغ 100 جم', cards)).toBeNull();
  });

  it('returns null when no card has a matching phrase', () => {
    const cards = [{ id: 'main', sms_match_phrases: ['بطاقة الراتب'] }];
    expect(matchCardByPhrase('مسبقة الدفع بمبلغ 100 جم', cards)).toBeNull();
  });

  it('returns null when no cards have any phrases configured at all', () => {
    const cards = [
      { id: 'a', sms_match_phrases: [] },
      { id: 'b', sms_match_phrases: [] },
    ];
    expect(matchCardByPhrase('مسبقة الدفع بمبلغ 100 جم', cards)).toBeNull();
  });

  it('does not match a short numeric phrase that only appears as a substring of a longer number', () => {
    // A hotline like "19623" is a risky choice of phrase for exactly this reason: without
    // a boundary check it would falsely match here, misattributing an unrelated message.
    const cards = [{ id: 'a', sms_match_phrases: ['19623'] }];
    expect(matchCardByPhrase('رقم مرجعي 627260319623445', cards)).toBeNull();
  });

  it('does match a short numeric phrase when it appears as its own standalone token', () => {
    const cards = [{ id: 'a', sms_match_phrases: ['19623'] }];
    expect(matchCardByPhrase('للمزيد اتصل بـ 19623', cards)).toBe('a');
  });
});

describe('computePromotedPhrases', () => {
  it('promotes a phrase two distinct users independently added', () => {
    const rows = [
      { user_id: 'u1', sms_match_phrases: ['IPN transfer sent'] },
      { user_id: 'u2', sms_match_phrases: ['IPN transfer sent'] },
    ];
    expect(computePromotedPhrases(rows)).toContain('IPN transfer sent'.toLowerCase());
  });

  it('does not promote a phrase only one user has added', () => {
    const rows = [{ user_id: 'u1', sms_match_phrases: ['IPN transfer sent'] }];
    expect(computePromotedPhrases(rows)).toEqual([]);
  });

  it('does not double-count the same user adding the phrase to two of their own cards', () => {
    const rows = [
      { user_id: 'u1', sms_match_phrases: ['IPN transfer sent'] },
      { user_id: 'u1', sms_match_phrases: ['IPN transfer sent'] },
    ];
    expect(computePromotedPhrases(rows)).toEqual([]);
  });

  it('merges phrases that are equivalent after normalization (Arabic diacritics/letter forms)', () => {
    const rows = [
      { user_id: 'u1', sms_match_phrases: ['مسبقة الدفع'] },
      { user_id: 'u2', sms_match_phrases: ['مَسْبَقَه الدفع'] },
    ];
    expect(computePromotedPhrases(rows)).toHaveLength(1);
  });

  it('merges phrases that only differ in case', () => {
    const rows = [
      { user_id: 'u1', sms_match_phrases: ['IPN transfer sent'] },
      { user_id: 'u2', sms_match_phrases: ['ipn TRANSFER sent'] },
    ];
    expect(computePromotedPhrases(rows)).toHaveLength(1);
  });

  it('ignores empty phrase entries', () => {
    const rows = [
      { user_id: 'u1', sms_match_phrases: [''] },
      { user_id: 'u2', sms_match_phrases: [''] },
    ];
    expect(computePromotedPhrases(rows)).toEqual([]);
  });

  it('respects a custom threshold', () => {
    const rows = [
      { user_id: 'u1', sms_match_phrases: ['Successful transaction'] },
      { user_id: 'u2', sms_match_phrases: ['Successful transaction'] },
    ];
    expect(computePromotedPhrases(rows, 3)).toEqual([]);
  });
});

describe('matchesPromotedPhrase', () => {
  it('matches a promoted phrase inside a message with word boundaries', () => {
    expect(matchesPromotedPhrase('IPN transfer sent with amount of EGP 330.00', ['ipn transfer sent'])).toBe(true);
  });

  it('does not match a promoted phrase that only appears as a substring of a longer word', () => {
    expect(matchesPromotedPhrase('unsentimental EGP 100', ['sent'])).toBe(false);
  });

  it('returns false when there are no promoted phrases', () => {
    expect(matchesPromotedPhrase('IPN transfer sent with amount of EGP 330.00', [])).toBe(false);
  });
});

describe('matchesTrustedSender', () => {
  it('matches when the sender label equals a registered bank_sender', () => {
    const cards = [{ bank_sender: 'HSBC' }, { bank_sender: null }];
    expect(matchesTrustedSender('HSBC', cards)).toBe(true);
  });

  it('is case-insensitive, matching the same rule as the existing card-resolution comparison', () => {
    const cards = [{ bank_sender: 'HSBC' }];
    expect(matchesTrustedSender('hsbc', cards)).toBe(true);
  });

  it('returns false when no card has a matching bank_sender', () => {
    const cards = [{ bank_sender: 'QNB' }];
    expect(matchesTrustedSender('HSBC', cards)).toBe(false);
  });

  it('returns false when sender is null', () => {
    const cards = [{ bank_sender: 'HSBC' }];
    expect(matchesTrustedSender(null, cards)).toBe(false);
  });

  it('returns true even when the sender matches more than one card -- unlike card resolution, trust does not require a unique match', () => {
    const cards = [{ bank_sender: 'HSBC' }, { bank_sender: 'HSBC' }];
    expect(matchesTrustedSender('HSBC', cards)).toBe(true);
  });

  it('returns false when no cards have bank_sender configured at all', () => {
    const cards = [{ bank_sender: null }, { bank_sender: null }];
    expect(matchesTrustedSender('HSBC', cards)).toBe(false);
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
