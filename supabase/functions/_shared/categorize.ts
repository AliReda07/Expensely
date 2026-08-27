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

export interface CardPhraseRow {
  id: string;
  sms_match_phrases: string[];
}

// U+0660-U+0669 Arabic-Indic digits, U+06F0-U+06F9 Extended (Persian/Urdu) Arabic-Indic digits.
const ARABIC_INDIC_DIGITS_RE = /[٠-٩]/g;
const EXTENDED_ARABIC_INDIC_DIGITS_RE = /[۰-۹]/g;
// U+064B-U+0652 combining diacritics (tashkeel), U+0640 tatweel (kashida).
const ARABIC_DIACRITICS_RE = /[ً-ْـ]/g;
// U+0623 alef with hamza above, U+0625 alef with hamza below, U+0622 alef with madda,
// U+0671 alef wasla -- all collapse to bare alef (U+0627) for matching purposes.
const ARABIC_ALEF_VARIANTS_RE = /[أإآٱ]/g;
// U+200B-U+200F zero-width space through right-to-left mark, U+202A-U+202E directional
// embedding/override controls, U+061C Arabic letter mark.
const BIDI_AND_ZERO_WIDTH_RE = /[​-‏‪-‮؜]/g;

/**
 * Puts free-form text into a single canonical form so every pattern below only has
 * to be written once. Arabic bank SMS vary in ways that are invisible to the eye but
 * break naive string/regex matching: Arabic-Indic digits instead of ASCII, diacritics,
 * a handful of interchangeable letter forms, and invisible bidi control characters.
 * Matching against this normalized text (never against what's stored) keeps every
 * downstream pattern -- English or Arabic -- written once in its plainest form.
 */
export function normalize(text: string): string {
  return text
    .replace(ARABIC_INDIC_DIGITS_RE, (d) => String(d.codePointAt(0)! - 0x0660))
    .replace(EXTENDED_ARABIC_INDIC_DIGITS_RE, (d) => String(d.codePointAt(0)! - 0x06f0))
    .replace(ARABIC_DIACRITICS_RE, '')
    .replace(ARABIC_ALEF_VARIANTS_RE, 'ا') // -> ا
    .replace(/ة/g, 'ه') // ة -> ه
    .replace(/ى/g, 'ي') // ى -> ي
    .replace(BIDI_AND_ZERO_WIDTH_RE, '')
    .replace(/\s+/g, ' ')
    .trim();
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

/**
 * Resolves a card by a phrase unique to its bank's SMS template (e.g. "مسبقة الدفع" for
 * a prepaid card's transfer notices), for banks that never print the card's last 4
 * digits and whose phone-side Sender automation isn't practical to set up (many banks
 * send from an alphanumeric Sender ID that a phone's SMS automation cannot filter a
 * contact by). Matched against the message body itself, so it needs no phone-side
 * cooperation at all -- unlike bank_sender, which depends on the client sending a
 * sender value. Each card can carry several phrases, since the same bank often
 * describes the same card differently across message types (a transfer notice and a
 * purchase notice from the same bank may share no wording at all). Mirrors the
 * sender-based fallback's safety rule: never guesses between multiple candidates, so
 * it only resolves when exactly one card matches -- via any one of its phrases.
 *
 * Matching requires a word boundary at both ends of each phrase (see containsWord),
 * not a bare substring search -- a short numeric phrase like a hotline number could
 * otherwise coincidentally appear inside an unrelated longer reference number and
 * misattribute the transaction.
 */
export function matchCardByPhrase(message: string, cards: CardPhraseRow[]): string | null {
  const normalizedMessage = normalize(message);
  const matches = cards.filter((c) => c.sms_match_phrases.some((phrase) => containsWord(normalizedMessage, normalize(phrase))));
  return matches.length === 1 ? matches[0].id : null;
}

// Confirmed against a real sample ("تم إضافة تحويل لحظي لبطاقتكم..."). Distinct from
// TRANSFER_KEYWORDS-style detection elsewhere: this only needs to know "is this worth
// labeling as a transfer at all", not which direction it went.
const TRANSFER_WORDS = ['تحويل', 'transfer', 'transferred'];

/** Whether the message describes itself as a transfer of any kind. */
export function looksLikeTransfer(text: string): boolean {
  const normalized = normalize(text);
  return TRANSFER_WORDS.some((word) => containsWord(normalized, word));
}

// Egyptian banks nearly always route a real-time transfer between two different banks
// over InstaPay (the Central Bank of Egypt's instant-payment rail), but the SMS itself
// describes it as "instant"/"immediate" rather than printing the brand name -- e.g. a
// real sample: "تحويل لحظي" ("instant transfer"). Deliberately labeled "Instant transfer"
// rather than "InstaPay" here: a same-bank transfer can use identical wording without
// touching that rail at all, so asserting the specific brand would sometimes be wrong.
const INSTANT_TRANSFER_WORDS = ['لحظي', 'فوري'];

/** Whether the message describes itself as an instant/real-time transfer. */
export function looksLikeInstantTransfer(text: string): boolean {
  const normalized = normalize(text);
  return INSTANT_TRANSFER_WORDS.some((word) => containsWord(normalized, word));
}

const AMOUNT_PATTERN = /\d+(?:,\d{3})*(?:\.\d{1,2})?/;

// "جم" (jeem-meem) is confirmed against a real Egyptian bank SMS ("بمبلغ 100.00 جم").
// It is only two letters, so unlike the Latin tokens it needs its own word-boundary
// guard below or it could match as a substring inside an unrelated longer word (e.g.
// the "جم" inside "المجموع", "total").
const CURRENCY_TOKENS = 'EGP|USD|EUR|GBP|SAR|AED|KWD|QAR|JOD|جم|\\$|£|€';
const AMOUNT_BODY = '\\d+(?:,\\d{3})*(?:\\.\\d{1,2})?';

// An amount sitting next to a currency token is far more trustworthy than
// "the first number in the message", which in a bank SMS is often the card digits.
// The outer lookbehind/lookahead only guard the non-digit side of each branch (the
// digit side is already anchored by \s* immediately meeting the amount), so they add
// a word-boundary check for short tokens like "جم" without disturbing "EGP300"-style
// matches where currency and digits are directly adjacent.
const CURRENCY_AMOUNT_PATTERN = new RegExp(
  `(?<![\\p{L}\\p{N}])(?:${CURRENCY_TOKENS})\\s*(${AMOUNT_BODY})|(${AMOUNT_BODY})\\s*(?:${CURRENCY_TOKENS})(?![\\p{L}\\p{N}])`,
  'iu',
);

// Card/account references, e.g. "card ending 1234", "ending in 1234",
// "card no. 1234", "****1234", "xxxx1234", "card 1234". Each pattern requires a
// marker directly adjacent to the digits so ordinary 4-digit amounts are not
// mistaken for card numbers.
// Matched against normalize()'d text, so Arabic patterns must use the normalized
// spelling: taa marbuta already folded to haa (بطاقة -> بطاقه), matching the same trap
// already hit once with الى/على -- a pattern written with the pre-normalization letter
// silently matches nothing.
const CARD_REF_PATTERNS: RegExp[] = [
  /\bending\s*(?:in|with)?\s*[:#]?\s*[*xX•·-]*\s*(\d{4})\b/gi,
  /\b(?:card|acct|account|a\/c)\s*(?:no\.?|number|#)\s*[:#]?\s*[*xX•·-]*\s*(\d{4})\b/gi,
  /(?:[*xX•·]\s*){2,}(\d{4})\b/g,
  /\b(?:card|a\/c)\s*[:#]?\s*(\d{4})\b/gi,
  // Confirmed against a real Egyptian bank SMS: "بطاقه المدفوعه مقدما رقم 6238" ("...card
  // number 6238"). Requires "بطاقه" ("card") somewhere before "رقم" ("number") -- with
  // only non-digit text between them, so it can't skip over an unrelated number -- to
  // avoid matching a bare "رقم" that names something else entirely (e.g. "رقم مرجعي", a
  // reference number, seen in another real sample with no card mention nearby at all).
  /بطاقه[^\d]{0,40}?رقم\s*[:#]?\s*[*xX•·-]*\s*(\d{4})\b/gi,
];

/** The last four digits of the card a message refers to, if it names one. */
export function extractCardLast4(text: string): string | null {
  const normalized = normalize(text);
  for (const pattern of CARD_REF_PATTERNS) {
    pattern.lastIndex = 0;
    const match = pattern.exec(normalized);
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
  // Arabic. 'اضافه' (normalized from 'إضافة') is confirmed against a real "money added
  // to your card" SMS. The rest are standard Egyptian bank vocabulary for the same kind
  // of event, not yet confirmed against a sample from this specific bank.
  'اضافه',
  'ايداع',
  'راتب',
  'استرداد',
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
  // Arabic, standard Egyptian bank vocabulary -- not yet confirmed against a real
  // outgoing-transaction sample from this user. Deliberately excludes the bare word
  // 'دفع' ("pay"), which also appears in non-transactional phrasing like "دفعة مستحقة"
  // (an upcoming/due payment, i.e. money hasn't moved yet).
  'خصم',
  'شراء',
  'سحب',
  'مشتريات',
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

// `\b` is ASCII-only in JavaScript: Arabic letters count as non-word characters to it,
// so a keyword wrapped in `\b` never matches inside Arabic text. Unicode property
// lookarounds give the same "not part of a longer word" guarantee for any script.
function containsWord(haystack: string, needle: string): boolean {
  return new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(needle)}(?![\\p{L}\\p{N}])`, 'iu').test(haystack);
}

export function parseAmount(text: string, opts: { requireCurrency?: boolean } = {}): number | null {
  const withoutCardRefs = stripCardRefs(normalize(text));

  // Prefer a currency-adjacent amount; fall back to the first remaining number.
  const currencyMatch = withoutCardRefs.match(CURRENCY_AMOUNT_PATTERN);
  if (opts.requireCurrency && !currencyMatch) return null;
  const raw = currencyMatch ? (currencyMatch[1] ?? currencyMatch[2]) : withoutCardRefs.match(AMOUNT_PATTERN)?.[0];
  if (!raw) return null;

  const value = Number(raw.replace(/,/g, ''));
  return Number.isFinite(value) && value > 0 ? value : null;
}

const ACCOUNT_NOUN = '(?:بطاقتك|بطاقتكم|حسابك|حسابكم)';

// Confirmed against a real "money added to your card" SMS: the incoming preposition is
// fused directly onto the noun with no space ("لبطاقتكم" = "to your card"). The
// lookbehind keeps the fused "ل" from matching mid-word (e.g. inside a longer word that
// happens to end just before the noun).
//
// Matched against normalize()'d text, where "الى" and "إلى" ("to") both collapse to
// "الي" (alef-maqsura -> yaa) and "على" ("on/onto") collapses to "علي" -- write the
// *normalized* spelling here, not the one that appears in a raw SMS.
const INCOMING_ACCOUNT_RE = new RegExp(
  `(?<![\\p{L}\\p{N}])ل${ACCOUNT_NOUN}|(?<![\\p{L}\\p{N}])(?:الي|علي)\\s+${ACCOUNT_NOUN}`,
  'u',
);

// Confirmed against a real outgoing-transfer SMS: "تم تنفيذ تحويل لحظي من بطاقتكم...
// بمبلغ 100.00 جم إلى ALI A**** M******..." -- note the recipient's name sits after
// "إلى" ("to"), not after an account noun, so it correctly does not trip the incoming
// pattern above; only "من" ("from") + one of the account nouns does.
const OUTGOING_ACCOUNT_RE = new RegExp(`(?<![\\p{L}\\p{N}])من\\s+${ACCOUNT_NOUN}`, 'u');

/**
 * Which way money moved relative to *this* card/account, based on the preposition
 * attached to "your card"/"your account" -- not the word "transfer" alone, which says
 * nothing about direction and appears in both incoming and outgoing messages.
 */
export function detectDirection(text: string): 'in' | 'out' | null {
  const normalized = normalize(text);
  if (INCOMING_ACCOUNT_RE.test(normalized)) return 'in';
  if (OUTGOING_ACCOUNT_RE.test(normalized)) return 'out';
  return null;
}

export function detectType(text: string): TransactionType {
  // The preposition on "your card/account" is a more specific signal than any single
  // keyword below, and is what actually distinguishes an incoming from an outgoing
  // transfer -- both of which otherwise just say "transfer".
  const direction = detectDirection(text);
  if (direction === 'in') return 'income';
  if (direction === 'out') return 'expense';

  const normalized = normalize(text);
  if (INCOME_KEYWORDS.some((k) => containsWord(normalized, k))) return 'income';
  if (EXPENSE_KEYWORDS.some((k) => containsWord(normalized, k))) return 'expense';
  // Bank SMS that don't say either way are overwhelmingly purchase notifications.
  return 'expense';
}

export function detectCategory(text: string, categories: CategoryRow[], type: TransactionType): CategoryRow | null {
  const normalized = normalize(text);

  // A category the user actually named (built-in or custom) appearing verbatim
  // in the message wins over any guessed synonym.
  const direct = categories.find((c) => containsWord(normalized, normalize(c.name)));
  if (direct) return direct;

  // A transfer's real category is "it's a transfer" -- not whatever generic bucket
  // (uncategorized, or the blanket Income category) it would otherwise fall into. Takes
  // priority over the income-type default below, so an incoming transfer lands here
  // rather than under plain "Income".
  if (looksLikeTransfer(text)) {
    const transferCategory = categories.find((c) => c.name.toLowerCase() === 'transfer');
    if (transferCategory) return transferCategory;
  }

  if (type === 'income') {
    return categories.find((c) => c.name.toLowerCase() === 'income') ?? null;
  }

  for (const [canonicalName, keywords] of Object.entries(EXPENSE_CATEGORY_KEYWORDS)) {
    const match = categories.find((c) => c.name.toLowerCase() === canonicalName.toLowerCase());
    if (!match) continue;
    if (keywords.some((k) => containsWord(normalized, k))) return match;
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
