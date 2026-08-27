import { describe, expect, it } from 'vitest';
import {
  detectCategory,
  detectDirection,
  detectType,
  extractCardLast4,
  hasTransactionVerb,
  looksLikeInstantTransfer,
  looksLikeTransfer,
  matchCardByPhrase,
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
