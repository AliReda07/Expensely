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

export interface UserPhraseRow {
  user_id: string;
  sms_match_phrases: string[];
}

// A single user's own phrase (see matchCardByPhrase) only ever helps that user. This is
// the cross-user counterpart: when several *different* users have independently typed
// the same wording into their own card's "phrase unique to this bank's SMS" field, that
// agreement is itself a signal worth acting on for everyone, the same way a built-in
// word in EXPENSE_KEYWORDS/INCOME_KEYWORDS is -- it just got discovered by usage instead
// of hand-curated. Deliberately requires >1 user: one person's own phrase is not
// evidence of anything beyond what matchCardByPhrase already grants them.
//
// Note what this counts: the short label text itself (e.g. "IPN transfer sent"), which
// users type into Settings themselves specifically to be matched -- never the SMS
// message bodies those phrases get matched against. No user's raw bank SMS is ever read
// by or attributed to another user anywhere in this flow.
const PROMOTION_THRESHOLD = 2;

/**
 * Phrases (normalized) that at least `threshold` distinct users have added to a card of
 * their own. A user adding the same phrase to two of their own cards only counts once --
 * it's users agreeing with each other that counts, not raw occurrences.
 */
export function computePromotedPhrases(allUserPhrases: UserPhraseRow[], threshold = PROMOTION_THRESHOLD): string[] {
  const usersByPhrase = new Map<string, Set<string>>();
  for (const row of allUserPhrases) {
    for (const rawPhrase of row.sms_match_phrases) {
      // Lowercased on top of normalize(): matching against a message is already
      // case-insensitive (containsWord's 'i' flag), so two users typing different
      // casing of the same English phrase must count as agreement here too.
      const key = normalize(rawPhrase).toLowerCase();
      if (!key) continue;
      if (!usersByPhrase.has(key)) usersByPhrase.set(key, new Set());
      usersByPhrase.get(key)!.add(row.user_id);
    }
  }
  return [...usersByPhrase.entries()].filter(([, users]) => users.size >= threshold).map(([phrase]) => phrase);
}

/** Whether the message contains one of the cross-user promoted phrases (see above). */
export function matchesPromotedPhrase(message: string, promotedPhrases: string[]): boolean {
  const normalizedMessage = normalize(message);
  return promotedPhrases.some((phrase) => containsWord(normalizedMessage, phrase));
}

export interface CardSenderRow {
  bank_sender: string | null;
}

/**
 * Whether the client-supplied `sender` label (see SmsPayload) matches a `bank_sender`
 * the user already registered on one of their own cards. This is the same trust logic
 * as a saved phrase, just via a different signal: `bank_sender` is only ever set by the
 * user themselves, specifically to declare "this label identifies a real bank" -- so a
 * match here is exactly as strong a declaration as a saved phrase, and should be able to
 * waive the same verb gate (see parseTransaction's `bypassVerbGate`). It previously
 * wasn't consulted for that at all, only for picking a card -- after the message had
 * already been accepted or rejected without it.
 *
 * Deliberately `.some(...)`, not "exactly one match": for card *resolution* an ambiguous
 * sender match must stay unresolved (see the caller's own "never guess" rule), but for
 * *trust* purposes it doesn't matter which of several cards share that sender -- the
 * message is still genuinely from a bank the user has told this app to expect messages
 * from either way.
 */
export function matchesTrustedSender(sender: string | null, cards: CardSenderRow[]): boolean {
  if (!sender) return false;
  return cards.some((c) => c.bank_sender?.toLowerCase() === sender.toLowerCase());
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
// "ipn"/"instapay" are the exception -- IPN is InstaPay's own abbreviation in its own
// transfer notices, so unlike the generic wording above it does identify the rail.
const INSTANT_TRANSFER_WORDS = ['لحظي', 'فوري', 'ipn', 'instapay'];

/** Whether the message describes itself as an instant/real-time transfer. */
export function looksLikeInstantTransfer(text: string): boolean {
  const normalized = normalize(text);
  return INSTANT_TRANSFER_WORDS.some((word) => containsWord(normalized, word));
}

// Egyptian instant transfers carry a flat fee the bank never prints in the SMS and never
// sends a separate message for -- verified against the user's full history: no 0.50
// transaction and no message mentioning a fee has ever arrived. So the fee cannot be
// parsed, only inferred, which is why this is deliberately narrow.
//
// Both conditions are required. Direction alone is not enough: detectDirection returns
// 'out' for any message containing "من حسابك"/"من بطاقتكم", which includes ordinary
// purchase notices -- gating on the instant-transfer signal as well is what stops a POS
// purchase being charged a phantom fee. And looksLikeInstantTransfer alone is not enough,
// because an incoming transfer matches it just as well as an outgoing one, and only the
// sender is billed.
export const INSTANT_TRANSFER_FEE = 0.5;

export function instantTransferFee(text: string): number {
  return looksLikeInstantTransfer(text) && detectDirection(text) === 'out' ? INSTANT_TRANSFER_FEE : 0;
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
  'reversal',
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
  'charged',
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
// A trailing "*" marks a keyword as suffix-tolerant -- see matchesCategoryKeyword. Applied
// per-keyword, not blanket: a brand name that continues into more letters is still that
// brand ("mcdonald*" -> MCDONALDS), but a generic noun that does is usually an unrelated
// word ("metro" -> METROPOLITAN, "store" -> STORAGE, "steam" -> STEAMER), so those keep the
// strict (no "*") form deliberately.
//
// "market*"/"markt*" are the one deliberate exception to that "generic nouns stay strict"
// rule: in Egyptian POS strings a merchant token containing "market" is a grocer close to
// every time, and "markt" is a real truncation of "market" seen in this user's own SMS
// history, not a typo. A merchant literally named "... MARKETING" would misfile as
// Groceries under this rule; accepted as a one-tap-to-fix risk.
const EXPENSE_CATEGORY_KEYWORDS: Record<string, string[]> = {
  Food: [
    'restaurant*', 'cafe*', 'coffee*', 'diner*', 'eatery', 'kitchen', 'pizza*',
    'mcdonald*', 'kfc', 'starbucks*', 'burger*', 'baker*',
    // Egyptian chains the user named. "cook door" and "roma pizza" stay as strict phrases
    // (a bare "cook*" would swallow COOKIES/COOKING; a bare "roma*" would swallow
    // ROMANIA/ROMANTIC). "two broz" needs both a spaced and a fused entry: "broz*" covers
    // "TWO BROZ" and "2 BROZ" (the left boundary sits after the space either way), but a
    // fused "TWOBROZ" has a letter immediately before "broz", which the left-hand boundary
    // -- never relaxed -- rejects, hence the separate "twobroz*".
    'buffalo*', 'cook door', 'cookdoor*', 'cilantro*', 'bazooka*', 'broz*', 'twobroz*',
  ],
  Groceries: [
    'supermarket*', 'hypermarket*', 'grocer*', 'market*', 'markt*',
    'carrefour*', 'spinney*',
    // Egyptian chains the user named. "el far" is used instead of "mahmoud*" because
    // Mahmoud is an extremely common personal name -- keying on it would misfile ordinary
    // person-to-person payments as Groceries.
    'seoudi*', 'elfar*', 'el far', 'el-far', 'oscar*',
  ],
  // 'toll' alone would match the "toll free" hotline text nearly every Egyptian bank SMS
  // ends with (e.g. "for lost/stolen card call 16607, toll free"), miscategorizing any
  // message that matches no earlier keyword as Transport. 'toll gate'/'tollgate*' key on
  // the actual charge instead -- a toll road payment, not the bank's own free phone line.
  Transport: ['uber*', 'careem*', 'taxi*', 'fuel*', 'petrol', 'gas station', 'metro', 'parking*', 'toll gate', 'tollgate*'],
  Shopping: ['amazon*', 'noon', 'mall', 'store', 'boutique', 'shop'],
  Bills: ['electricity', 'water bill', 'internet', 'telecom', 'vodafone', 'orange', 'etisalat', 'utility', 'subscription*', 'bill payment'],
  Entertainment: ['netflix', 'spotify', 'cinema*', 'movie*', 'steam', 'playstation*', 'xbox'],
  Health: ['pharmac*', 'hospital*', 'clinic*', 'doctor*', 'medical', 'dental', 'dentist*'],
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

// A category keyword ending in "*" also matches when the merchant name continues past it:
// "mcdonald*" matches "MCDONALDS". Card networks print merchant names unpunctuated and
// often pluralised, so containsWord's right-hand word boundary -- correct everywhere else --
// misses the most common spelling of the most common merchants.
//
// Deliberately opt-in per keyword rather than applied to every one of them: a brand name
// that continues into more letters is still that brand, but a generic noun that does is
// usually an unrelated word ("metro" -> "metropolitan", "store" -> "storage"), and those
// have to keep the strict rule. The left-hand boundary is never relaxed, so a keyword still
// cannot match in the middle of a word.
//
// Scoped to detectCategory's keyword loop on purpose. containsWord is also the transaction
// verb gate and the card-phrase matcher, where a loose match would let a promo SMS through
// as a real transaction -- a much more expensive mistake than a wrong category.
function matchesCategoryKeyword(haystack: string, keyword: string): boolean {
  if (!keyword.endsWith('*')) return containsWord(haystack, keyword);
  const stem = keyword.slice(0, -1);
  return new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(stem)}`, 'iu').test(haystack);
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

// English transfer notices name the direction with a verb instead of a preposition on
// "your card"/"your account" -- confirmed against a real InstaPay/IPN sample: "IPN
// transfer sent with amount of EGP 330.00 from 3670". Note that sample's "from 3670" is
// the sender's *own* wallet, so the preposition means the opposite of what the Arabic
// "من حسابك" rule reads it as; the verb is the only trustworthy signal here.
//
// Deliberately requires a transfer word to be present as well (see detectDirection), so
// a bare "sent"/"received" in unrelated text -- an OTP that was "sent to you", a voucher
// "received" -- can never set a direction on its own.
const OUTGOING_TRANSFER_VERBS = ['sent', 'outgoing'];
const INCOMING_TRANSFER_VERBS = ['received', 'incoming'];

/**
 * Which way money moved relative to *this* card/account, based on the preposition
 * attached to "your card"/"your account" -- not the word "transfer" alone, which says
 * nothing about direction and appears in both incoming and outgoing messages.
 */
export function detectDirection(text: string): 'in' | 'out' | null {
  const normalized = normalize(text);
  if (INCOMING_ACCOUNT_RE.test(normalized)) return 'in';
  if (OUTGOING_ACCOUNT_RE.test(normalized)) return 'out';

  // Transfer + an explicit direction verb. Checked last so the Arabic account-noun
  // rules above, which are the more specific signal, always win where both could apply.
  const hasTransferWord = looksLikeTransfer(normalized);
  // "sent"/"outgoing" are additionally gated by "transaction": some banks phrase the
  // same outgoing notice around that noun instead of "transfer"/"تحويل" (e.g.
  // "Transaction sent EGP 100"). Deliberately not a bare TRANSACTION keyword on its
  // own -- "transaction" alone appears in summaries/inquiries too -- only "transaction"
  // + an explicit outgoing verb together counts, same reasoning as TRANSFER_WORDS.
  if ((hasTransferWord || containsWord(normalized, 'transaction')) && OUTGOING_TRANSFER_VERBS.some((v) => containsWord(normalized, v))) {
    return 'out';
  }
  if (hasTransferWord && INCOMING_TRANSFER_VERBS.some((v) => containsWord(normalized, v))) {
    return 'in';
  }
  return null;
}

// Bank SMS run the name straight into the next field with a space, not a comma or
// period ("إلى ALI A**** M****** رقم مرجعي ..." -- no punctuation before "رقم" at
// all), so there's no delimiter to stop at. Capping at three space-separated words
// bounds the match for the one confirmed 3-word sample, but doesn't help when the name
// is *shorter* than the cap -- confirmed against a real message with a 2-word name
// ("...إلى el t**** رقم مرجعي 406121668403..."): the cap alone happily consumes "رقم"
// as if it were the name's third word, storing "el t**** رقم" as the transaction note.
// The negative lookahead below is what actually stops at the field boundary regardless
// of the name's length -- the word-count cap now only guards against a name that's
// merely long, e.g. a rare four-part name, not against swallowing the next field.
// Uses the same "(?![\p{L}\p{N}])" trick as containsWord instead of `\b`, which is
// ASCII-only in JS and would silently never match "رقم" as a whole word at all.
const NAME_TAIL = "([\\p{L}][\\p{L}*.'-]*(?:\\s+(?!رقم(?![\\p{L}\\p{N}]))[\\p{L}][\\p{L}*.'-]*){0,2})";

// Confirmed against the same real outgoing-transfer sample OUTGOING_ACCOUNT_RE cites:
// the recipient's name sits directly after "إلى" ("to"), separate from the "من
// بطاقتكم" (from your card) marker that establishes the direction. No collision
// between the two: this only ever looks for "الي"/"علي"/"to", never "من".
const OUTGOING_PARTY_RE = new RegExp(`(?<![\\p{L}\\p{N}])(?:الي|علي|to)\\s+${NAME_TAIL}`, 'iu');

// The presumed incoming mirror of OUTGOING_PARTY_RE -- an incoming transfer's sender
// name after "من" ("from"). Unlike the outgoing case, this is *not yet* confirmed
// against a real incoming-transfer sample with a named sender, only inferred from the
// bank's outgoing format; treat a match here as best-effort; extractTransferParty's
// caller falls back to the raw message when it comes back null. Safe from colliding
// with the direction marker itself: INCOMING_ACCOUNT_RE never uses "من", only
// "ل"/"الي"/"علي" + account noun, so any "من" in an incoming message is unrelated to it.
const INCOMING_PARTY_RE = new RegExp(`(?<![\\p{L}\\p{N}])(?:من|from)\\s+${NAME_TAIL}`, 'iu');

/**
 * The other party on a transfer -- who you sent money to (outgoing) or received it
 * from (incoming) -- read from the same preposition + name pattern the bank's SMS
 * already uses to say so, rather than the transaction note staying the raw SMS text.
 * Returns null (caller keeps its existing raw-message fallback) when the direction is
 * unknown or the message doesn't contain a recognizable name in that position.
 */
export function extractTransferParty(text: string, direction: 'in' | 'out' | null): string | null {
  if (!direction) return null;
  const normalized = normalize(text);
  const pattern = direction === 'out' ? OUTGOING_PARTY_RE : INCOMING_PARTY_RE;
  const match = pattern.exec(normalized);
  return match ? match[1].trim() : null;
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
    if (keywords.some((k) => matchesCategoryKeyword(normalized, k))) return match;
  }

  return null;
}

/**
 * Whether the message contains an actual transaction signal -- a resolved direction
 * (see detectDirection) or an income/expense verb -- as opposed to merely containing a
 * number next to a currency code. A promo SMS quoting a discount cap ("capped at EGP
 * 5,000") has no such signal at all, which is exactly what distinguishes it from a real
 * transaction notification.
 */
export function hasTransactionVerb(text: string): boolean {
  if (detectDirection(text) !== null) return true;
  const normalized = normalize(text);
  return INCOME_KEYWORDS.some((k) => containsWord(normalized, k)) || EXPENSE_KEYWORDS.some((k) => containsWord(normalized, k));
}

export function parseTransaction(
  text: string,
  categories: CategoryRow[],
  opts: { strict?: boolean; bypassVerbGate?: boolean } = {},
): ParsedTransaction | null {
  const amount = parseAmount(text, { requireCurrency: opts.strict });
  if (amount === null) return null;

  // A trusted source the user themselves configured -- a phrase saved on their own card,
  // a phrase enough other users independently agree on, or a sender label matching a
  // registered bank_sender -- is a deliberate "this is a real transaction template/source"
  // declaration, and outranks the built-in verb vocabulary, which by construction only
  // covers wordings already seen. It waives the verb requirement but NOT the
  // currency-adjacent amount requirement above: without that, any matching message
  // carrying a stray number would book a bogus transaction.
  if (opts.strict && !opts.bypassVerbGate && !hasTransactionVerb(text)) return null;

  const type = detectType(text);
  const category = detectCategory(text, categories, type);
  const cardLast4 = extractCardLast4(text);

  return { amount, type, category, cardLast4 };
}
