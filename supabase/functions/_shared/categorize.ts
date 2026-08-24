// Heuristic parser for free-form transaction text (bank SMS, quick chat messages).
// Deliberately dependency-free and deterministic so behavior is easy to reason about
// and debug, unlike an opaque LLM round-trip.

export interface CategoryRow {
  id: string;
  name: string;
}

export type TransactionType = 'expense' | 'income';

export interface ParsedTransaction {
  amount: number;
  type: TransactionType;
  category: CategoryRow | null;
  cardLast4: string | null;
}

export interface SmsPayload {
  message: string;
  /** The bank's SMS sender name/hotline, when the client sends structured JSON. */
  sender: string | null;
}

/**
 * The webhook body is either plain text (the original Shortcut setup: just the
 * message) or JSON `{"message": "...", "sender": "..."}` for clients that also
 * forward who sent it. Anything that isn't valid JSON with a string `message`
 * field is treated as plain text, so existing Shortcuts keep working unchanged.
 */
export function parseSmsPayload(raw: string): SmsPayload {
  const trimmed = raw.trim();
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object' && typeof (parsed as { message?: unknown }).message === 'string') {
      const obj = parsed as { message: string; sender?: unknown };
      const sender = typeof obj.sender === 'string' && obj.sender.trim() ? obj.sender.trim() : null;
      return { message: obj.message.trim(), sender };
    }
  } catch {
    // Not JSON -- fall through to plain text.
  }
  return { message: trimmed, sender: null };
}

const AMOUNT_PATTERN = /\d+(?:,\d{3})*(?:\.\d{1,2})?/;

const CURRENCY_TOKENS = 'EGP|USD|EUR|GBP|SAR|AED|KWD|QAR|JOD|\\$|£|€';
const AMOUNT_BODY = '\\d+(?:,\\d{3})*(?:\\.\\d{1,2})?';

// An amount sitting next to a currency token is far more trustworthy than
// "the first number in the message", which in a bank SMS is often the card digits.
const CURRENCY_AMOUNT_PATTERN = new RegExp(
  `(?:${CURRENCY_TOKENS})\\s*(${AMOUNT_BODY})|(${AMOUNT_BODY})\\s*(?:${CURRENCY_TOKENS})`,
  'i',
);

// Card/account references, e.g. "card ending 1234", "ending in 1234",
// "card no. 1234", "****1234", "xxxx1234", "card 1234". Each pattern requires a
// marker directly adjacent to the digits so ordinary 4-digit amounts are not
// mistaken for card numbers.
const CARD_REF_PATTERNS: RegExp[] = [
  /\bending\s*(?:in|with)?\s*[:#]?\s*[*xX•·-]*\s*(\d{4})\b/gi,
  /\b(?:card|acct|account|a\/c)\s*(?:no\.?|number|#)\s*[:#]?\s*[*xX•·-]*\s*(\d{4})\b/gi,
  /(?:[*xX•·]\s*){2,}(\d{4})\b/g,
  /\b(?:card|a\/c)\s*[:#]?\s*(\d{4})\b/gi,
];

/** The last four digits of the card a message refers to, if it names one. */
export function extractCardLast4(text: string): string | null {
  for (const pattern of CARD_REF_PATTERNS) {
    pattern.lastIndex = 0;
    const match = pattern.exec(text);
    if (match?.[1]) return match[1];
  }
  return null;
}

/** Blanks out card/account references so they cannot be read as the amount. */
function stripCardRefs(text: string): string {
  let cleaned = text;
  for (const pattern of CARD_REF_PATTERNS) {
    cleaned = cleaned.replace(new RegExp(pattern.source, pattern.flags), ' ');
  }
  return cleaned;
}

const INCOME_KEYWORDS = [
  'credited',
  'credit alert',
  'received',
  'deposit',
  'deposited',
  'refund',
  'refunded',
  'salary',
  'cash in',
];

const EXPENSE_KEYWORDS = [
  'debited',
  'debit alert',
  'spent',
  'purchase',
  'payment',
  'paid',
  'withdrawn',
  'withdrawal',
  'pos transaction',
  'cash out',
];

// Synonyms for each *preset* category name. Only consulted when the user's own
// category list actually contains that name (or a case-insensitive match of it) —
// a renamed or deleted preset simply won't match here, which is the correct behavior.
const EXPENSE_CATEGORY_KEYWORDS: Record<string, string[]> = {
  Food: ['restaurant', 'cafe', 'coffee', 'diner', 'eatery', 'kitchen', 'pizza', 'mcdonald', 'kfc', 'starbucks', 'burger', 'bakery'],
  Groceries: ['supermarket', 'grocery', 'groceries', 'carrefour', 'spinneys', 'hypermarket', 'market'],
  Transport: ['uber', 'careem', 'taxi', 'fuel', 'petrol', 'gas station', 'metro', 'parking', 'toll'],
  Shopping: ['amazon', 'noon', 'mall', 'store', 'boutique', 'shop'],
  Bills: ['electricity', 'water bill', 'internet', 'telecom', 'vodafone', 'orange', 'etisalat', 'utility', 'subscription', 'bill payment'],
  Entertainment: ['netflix', 'spotify', 'cinema', 'movie', 'steam', 'playstation', 'xbox'],
  Health: ['pharmacy', 'hospital', 'clinic', 'doctor', 'medical', 'dental'],
};

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function containsWord(haystack: string, needle: string): boolean {
  return new RegExp(`\\b${escapeRegExp(needle)}\\b`, 'i').test(haystack);
}

export function parseAmount(text: string): number | null {
  const withoutCardRefs = stripCardRefs(text);

  // Prefer a currency-adjacent amount; fall back to the first remaining number.
  const currencyMatch = withoutCardRefs.match(CURRENCY_AMOUNT_PATTERN);
  const raw = currencyMatch ? (currencyMatch[1] ?? currencyMatch[2]) : withoutCardRefs.match(AMOUNT_PATTERN)?.[0];
  if (!raw) return null;

  const value = Number(raw.replace(/,/g, ''));
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function detectType(text: string): TransactionType {
  if (INCOME_KEYWORDS.some((k) => containsWord(text, k))) return 'income';
  if (EXPENSE_KEYWORDS.some((k) => containsWord(text, k))) return 'expense';
  // Bank SMS that don't say either way are overwhelmingly purchase notifications.
  return 'expense';
}

export function detectCategory(text: string, categories: CategoryRow[], type: TransactionType): CategoryRow | null {
  // A category the user actually named (built-in or custom) appearing verbatim
  // in the message wins over any guessed synonym.
  const direct = categories.find((c) => containsWord(text, c.name));
  if (direct) return direct;

  if (type === 'income') {
    return categories.find((c) => c.name.toLowerCase() === 'income') ?? null;
  }

  for (const [canonicalName, keywords] of Object.entries(EXPENSE_CATEGORY_KEYWORDS)) {
    const match = categories.find((c) => c.name.toLowerCase() === canonicalName.toLowerCase());
    if (!match) continue;
    if (keywords.some((k) => containsWord(text, k))) return match;
  }

  return null;
}

export function parseTransaction(text: string, categories: CategoryRow[]): ParsedTransaction | null {
  const amount = parseAmount(text);
  if (amount === null) return null;

  const type = detectType(text);
  const category = detectCategory(text, categories, type);
  const cardLast4 = extractCardLast4(text);

  return { amount, type, category, cardLast4 };
}
