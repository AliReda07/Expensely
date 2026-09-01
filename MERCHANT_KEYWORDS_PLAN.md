# Plan: merchant keyword matching (the MCDONALDS miss)

**Status:** Designed, not implemented. Written by an Opus planning session for a Sonnet
session to execute. Everything needed is below — do not re-derive the diagnosis.

**Goal:** Make `detectCategory` recognise merchant names as they actually appear in bank
POS strings, so `MCDONALDS MAADI CAI` lands in **Food** instead of uncategorized, and add
the restaurant chains the user is supplying (see "Restaurant keywords to add" — that
section is a placeholder and must be filled before this ships).

---

## The bug

A real SMS from 02/09/26 parsed correctly in every respect except the category:

```
تم خصم 90 EGP  من بطاقة المدفوعة مقدما رقم 6238  باستخدام Mobile Payment
عند MCDONALDS MAADI       CAI  يوم 02/09/26 ...
```

Verified by running the actual module: `amount: 90`, `type: 'expense'`,
`cardLast4: '6238'`, **`category: null`** — despite the user having a preset category
literally named `Food` (confirmed present in the `categories` table) and
`EXPENSE_CATEGORY_KEYWORDS.Food` containing `'mcdonald'`.

The cause is `containsWord` at [categorize.ts:329](supabase/functions/_shared/categorize.ts:329):

```ts
function containsWord(haystack: string, needle: string): boolean {
  return new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(needle)}(?![\\p{L}\\p{N}])`, 'iu').test(haystack);
}
```

The trailing `(?![\p{L}\p{N}])` demands that the keyword be followed by a non-letter.
`MCDONALDS` continues with `S`, so the lookahead fails and the keyword never matches.
Note that `MCDONALD'S` *would* match today (an apostrophe is not a letter) — it is
specifically the unpunctuated plural, which is how card networks print it, that fails.

This is not McDonald's-specific. It silently breaks any merchant name that suffixes or
pluralises a keyword.

---

## Locked decisions (and why)

| # | Decision | Choice | Reasoning |
|---|---|---|---|
| 1 | Where to fix | A **new** matcher used only by `detectCategory`'s keyword loop | `containsWord` is also the verb gate (`hasTransactionVerb`), the card-phrase matcher (`matchCardByPhrase`), the cross-user promoted-phrase matcher, and the transfer/direction detectors. Loosening it globally would let `خصم` match inside a longer Arabic word and `sent` match inside `sentence` — i.e. it would weaken the "is this a real transaction at all" gate that stops promo SMS being booked as expenses. The category lane is the only one that needs relaxing. |
| 2 | Matching rule | Word boundary required on the **left** only; letters allowed on the right | `MCDONALDS` = keyword + suffix. Keeping the left boundary is what stops a keyword matching mid-word. |
| 3 | Opt-in, not blanket | A trailing `*` on the keyword marks it suffix-tolerant | Brand names that continue into more letters are still that brand. Generic nouns that do are usually a *different word*: `market` → `marketing`, `metro` → `metropolitan`, `store` → `storage`. Blanket suffix-tolerance would trade one wrong category for several. |
| 4 | Notation | `'mcdonald*'` inside the existing `EXPENSE_CATEGORY_KEYWORDS` map | One list, not two parallel maps. Adding a restaurant stays a one-line edit, which matters because the user will keep adding them. |
| 5 | Truncated merchant names | Out of scope | POS strings are cut at ~22 chars, so the *keyword itself* can be truncated (`Scene cinema` arrived fine, but `UNION OF ARTISTS FOR CIN` lost "CINEMA"). Catching that needs "token is a prefix of keyword", which is far too false-positive-prone to be worth it. |
| 6 | Blast radius | Category only | A wrong category is user-editable and cheap. A wrong verb-gate decision books a fake transaction. Decision 1 keeps these lanes separate on purpose. |

---

## Implementation

All changes are in `supabase/functions/_shared/categorize.ts` unless stated.

### Step 1 — add the matcher

Insert directly after `containsWord` (currently ends line 331). `escapeRegExp` is already
defined above it at line 322, so both helpers are in scope.

```ts
// A category keyword ending in "*" also matches when the merchant name continues past it:
// "mcdonald*" matches "MCDONALDS". Card networks print merchant names unpunctuated and
// often pluralised, so containsWord's right-hand word boundary -- correct everywhere else --
// misses the most common spelling of the most common merchants.
//
// Deliberately opt-in per keyword rather than applied to every one of them: a brand name
// that continues into more letters is still that brand, but a generic noun that does is
// usually an unrelated word ("market" -> "marketing", "metro" -> "metropolitan"), and those
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
```

### Step 2 — use it in `detectCategory`

At [categorize.ts:483](supabase/functions/_shared/categorize.ts:483), inside the
`EXPENSE_CATEGORY_KEYWORDS` loop:

```ts
if (keywords.some((k) => matchesCategoryKeyword(normalized, k))) return match;
```

Do **not** touch line 464 (`const direct = categories.find(...)`) — that matches the
user's own category names verbatim and must stay strict.

### Step 3 — mark the existing keywords

`EXPENSE_CATEGORY_KEYWORDS` is at [categorize.ts:312](supabase/functions/_shared/categorize.ts:312).
Add `*` to these and leave everything else exactly as it is:

| Category | Gains `*` | Stays strict, and why |
|---|---|---|
| Food | `restaurant*` `cafe*` `coffee*` `diner*` `pizza*` `burger*` `mcdonald*` `starbucks*` | `kfc`, `eatery`, `kitchen` — no useful suffix form |
| Groceries | `supermarket*` `hypermarket*` `carrefour*` `market*` `grocer*` | see the revision note below |
| Transport | `taxi*` `parking*` `fuel*` `uber*` `careem*` | `metro` → `metropolitan`; `toll` (see known issue below) |
| Shopping | `amazon*` | `mall`, `store` → `storage`, `shop`, `noon` (ordinary word), `boutique` |
| Bills | `subscription*` | all others are already exact brand/noun forms |
| Entertainment | `cinema*` `movie*` `playstation*` | `steam` → `steamer`; `netflix`, `spotify`, `xbox` need no suffix |
| Health | `clinic*` `hospital*` `doctor*` | `medical`, `dental` |

**Revision to decision 3, for `market` only.** Decision 3 cites `market` → `marketing` as
the reason generic nouns stay strict. The user overrode this after review, and the evidence
supports them: in Egyptian POS strings a merchant token containing "market" is a grocer
essentially every time, whereas `MARKETING` as a merchant name on a card transaction is
close to hypothetical. The principle in decision 3 still governs every *other* generic noun
(`metro`, `store`, `shop`, `steam` all stay strict) — `market` is a deliberate, reasoned
exception, not a relaxation of the rule. Residual risk accepted: a merchant literally named
`... MARKETING` files as Groceries, which is a one-tap fix in the app.

`grocer*` replaces the separate `'grocery'` and `'groceries'` entries — one stem covers
grocery, groceries, and grocer.

Two stem changes worth making in the same pass, since `*` makes them work:

- `'bakery'` → `'baker*'` — covers *bakery*, *bakeries*, *baker*.
- `'pharmacy'` → `'pharmac*'` — covers *pharmacy*, *pharmacies*, *pharmacist*. The current
  entry cannot match "PHARMACIES" at all.
- Add `'dentist*'` to Health — `dental` does not cover the far more common shopfront word.

### Step 4 — merchant keywords to add

#### Food

The user supplied these. Add them to `EXPENSE_CATEGORY_KEYWORDS.Food`.

| Chain | Entry / entries | Reasoning |
|---|---|---|
| Buffalo Burger | `'buffalo*'` | `burger*` from step 3 would usually catch it, but POS truncation regularly cuts the second word (`BUFFALO BURG`), which `burger*` cannot match. `buffalo*` matches on the first word alone and also covers a fused `BUFFALOBURGER`. |
| Cook Door | `'cook door'` and `'cookdoor*'` | Two spellings in the wild. The spaced form stays strict — a bare `cook*` would swallow `COOKIES`, `COOKING`. `normalize()` collapses runs of whitespace, so the padded `COOK   DOOR` a bank prints still matches the single-space phrase. |
| Cilantro | `'cilantro*'` | Distinctive enough as a merchant token; the herb sense never appears as a POS merchant name. |
| Bazooka | `'bazooka*'` | Same. |
| Two Broz | `'broz*'` and `'twobroz*'` | `broz` is the distinctive half and covers both `TWO BROZ` and the `2 BROZ` spelling banks often print, since the left boundary sits after the space either way. `twobroz*` is needed separately because a fused `TWOBROZ` has a **letter** before `broz`, which the left-hand boundary rejects — that boundary is never relaxed (decision 2). |
| KFC | **no change** | Already present as `'kfc'` and staying strict per step 3. `KFC MAADI` matches today. |
| Roma Pizza | `'roma pizza*'` | Largely redundant — `pizza*` from step 3 already matches `ROMA PIZZA` — but harmless and explicit. Deliberately **not** `'roma*'`, which would match `ROMANIA`, `ROMANTIC`, and any `ROMA` hotel. |

Resulting `Food` array after steps 3 and 4 together:

```ts
Food: [
  'restaurant*', 'cafe*', 'coffee*', 'diner*', 'eatery', 'kitchen', 'pizza*',
  'mcdonald*', 'kfc', 'starbucks*', 'burger*', 'baker*',
  // Egyptian chains the user named. See the table above for why each is stemmed
  // the way it is -- in particular why "cook door" and "roma pizza" stay as phrases
  // and why "two broz" needs both a spaced and a fused entry.
  'buffalo*', 'cook door', 'cookdoor*', 'cilantro*', 'bazooka*', 'broz*', 'twobroz*',
],
```

#### Groceries

Two of these are backed by transactions sitting **uncategorized in the database right now** —
they are not hypothetical.

| Chain | Entry / entries | Reasoning |
|---|---|---|
| (any "market") | `'market*'` `'markt*'` | See the decision-3 revision in step 3. `markt*` is not a typo: the real row `FAWRY*ALMALKY MARKT` is uncategorized today because the bank truncated "MARKET". Both are needed — `market*` cannot match `MARKT`. |
| Seoudi | `'seoudi*'` | The real row `SEOUDI - MARRAS` is uncategorized today. `seoudi*` matches it, and the `*` covers branch suffixes. Deliberately **not** adding the `SOUDI`/`SAUDI` transliteration variants — `saudi` would match any Saudi-related merchant or transfer. |
| Mahmoud El Far | `'elfar*'` `'el far'` `'el-far'` | Three spellings appear on receipts. Deliberately **not** `'mahmoud*'`: it is an extremely common personal name, so it would misfile person-to-person payments as Groceries whenever the message isn't already caught as a transfer. |
| Oscar | `'oscar*'` | Distinctive as a merchant token in Egypt. |
| Spinneys | `'spinney*'` (replaces `'spinneys'`) | The existing strict `'spinneys'` cannot match the apostrophe form `SPINNEY'S`. The shorter stem covers `SPINNEYS`, `SPINNEY'S`, and branch suffixes. Confirmed working today for the plain form — do not regress it. |
| Carrefour | `'carrefour*'` (from step 3) | Already covered; `*` picks up `CARREFOUR CITY` / `CARREFOUR EXPRESS`. |

Resulting `Groceries` array after steps 3 and 4 together:

```ts
Groceries: [
  'supermarket*', 'hypermarket*', 'grocer*', 'market*', 'markt*',
  'carrefour*', 'spinney*',
  // Egyptian chains the user named. "markt" is a real truncation seen in this
  // user's own SMS, not a typo. See the table above for why Mahmoud El Far is
  // keyed on "el far" rather than the given name.
  'seoudi*', 'elfar*', 'el far', 'el-far', 'oscar*',
],
```

Note on ordering: `Object.entries` iterates in insertion order and the first category whose
keyword matches wins. `Food` sits before `Groceries`, which sits before `Transport`. That
ordering is load-bearing here — `METRO MARKET` resolves to Groceries via `market*` rather
than to Transport via `metro`. Do not reorder the map.

Rules to apply to any **further** chains the user adds later:

- **Lowercase.** Matching is case-insensitive (`'i'` flag) and runs against `normalize()`d
  text, so lowercase is the house form.
- **Shortest unambiguous stem, plus `*`.** POS strings are truncated at roughly 22
  characters and frequently drop the second word, so prefer `'buffalo*'` over
  `'buffalo burger'` and `'cook door'` only if the first word alone is too generic.
- **Watch for ordinary-word collisions** before adding `*`. A chain whose name is a common
  English or Arabic word should stay strict, or be entered as a two-word phrase.
- Arabic-named chains: write the entry in its **normalized** spelling — `normalize()` folds
  `ة`→`ه`, `ى`→`ي`, and all alef variants to `ا`. A pattern written with the raw letter
  silently matches nothing. This trap has already bitten this file twice (see the comments
  on `CARD_REF_PATTERNS` and `INCOMING_ACCOUNT_RE`).

### Step 5 — tests

Add to `supabase/functions/_shared/categorize.test.ts`. There is an existing
`describe('containsWord Unicode-awareness (via detectCategory)')` block at line 496 that
these sit naturally beside.

Required cases:

1. The real message from the bug report categorises as Food (full text above).
2. `MCDONALDS` (plural, no apostrophe) → Food.
3. `MCDONALD'S` → Food — the form that already worked; guards against a regression.
4. `mcdonalds` lowercase → Food.
5. **Negative:** a message containing `MARKETING` does not resolve to Groceries — this is
   the test that proves decision 3 is actually being honoured.
6. **Negative:** the verb gate is untouched — a promo message with a currency amount and no
   transaction verb still returns `null` from `parseTransaction({ strict: true })`.
7. One case per chain from step 4, each written the way a bank actually prints it —
   uppercase, with a branch name and padded whitespace after it:

   | Input fragment | Expected |
   |---|---|
   | `BUFFALO BURGER NASR CITY` | Food |
   | `BUFFALO BURG` (truncated) | Food — this is the case `burger*` alone fails |
   | `COOK DOOR   MAADI` | Food — also proves whitespace collapsing |
   | `COOKDOOR HELIOPOLIS` | Food |
   | `CILANTRO CAFE` | Food |
   | `BAZOOKA` | Food |
   | `TWO BROZ` | Food |
   | `2 BROZ` | Food |
   | `TWOBROZ` | Food — the fused case `broz*` cannot match |
   | `KFC MAADI` | Food — regression guard, already worked |
   | `ROMA PIZZA` | Food |

8. The Groceries entries, using the two real uncategorized rows as fixtures:

   | Input fragment | Expected |
   |---|---|
   | `FAWRY*ALMALKY MARKT     C` | Groceries — real row, uncategorized today |
   | `SEOUDI - MARRAS` | Groceries — real row, uncategorized today |
   | `عند Spinneys` | Groceries — regression guard, works today |
   | `SPINNEY'S` | Groceries — the apostrophe form the old entry missed |
   | `MAHMOUD ELFAR` / `MAHMOUD EL FAR` / `MAHMOUD EL-FAR` | Groceries, all three |
   | `OSCAR GRAND STORES` | Groceries |
   | `METRO MARKET` | Groceries, **not** Transport — proves map ordering |

9. **Negative:** a person-to-person payment naming `MAHMOUD` does not resolve to Groceries —
   proves `'mahmoud*'` was rejected in favour of the `el far` stems.
10. **Negative:** `ROMANIA` / `ROMANTIC HOTEL` does not resolve to Food — proves `roma pizza*`
   was chosen over `roma*`.
11. **Negative:** `COOKIES BY ...` does not resolve to Food via the Cook Door entries —
   proves `cook door` stayed a strict phrase rather than becoming `cook*`. (It may still
   match Food through another keyword; assert specifically that the Cook Door entries are
   not what fired, or pick a merchant string with no other Food keyword in it.)

Run with:

```bash
npx vitest run supabase/functions/_shared/categorize.test.ts
```

### Step 6 — deploy

`categorize.ts` is shared code compiled into the **`sms-webhook`** edge function. The fix
does nothing until that function is redeployed (currently version 25, last deployed
2026-08-29).

**Decided by the user: deploy everything together.** The working tree's pre-existing
uncommitted changes — cross-user promoted phrases and the trusted-sender verb-gate bypass,
across `categorize.ts`, `categorize.test.ts`, `sms-webhook/index.ts` and
`SmsAutoLogSheet.tsx` — ship in the same deploy as this keyword fix. Do not try to isolate
the keyword change.

Because that bundle includes two changes that **widen** what gets accepted as a real
transaction (both waive the verb gate — one on phrases other users typed, one on a
registered sender label), the deploy sequence matters:

1. Run the **full** suite, not just the file this plan touches:

   ```bash
   npx vitest run
   ```

   All of it must be green, including the pre-existing tests for promoted phrases and
   trusted senders. Those are the guard rails on the widened gate.
2. Commit the whole set before deploying, so the running function corresponds to a commit
   rather than to someone's working tree. Ask the user before committing — it is their repo
   convention, and the branch is `master`.
3. Deploy `sms-webhook`.
4. Verify against reality rather than assuming: the next bank SMS should appear with a
   category. The two rows that are uncategorized today (`FAWRY*ALMALKY MARKT`,
   `SEOUDI - MARRAS`) are **not** retroactively fixed by this — parsing happens once, at
   insert time. If the user wants those backfilled, that is a separate one-off task.

`payment-reminders` and `ask-proxy` are separate functions and are not affected.

---

## Known issues found nearby (not part of this change)

- **`'toll'` collides with "toll free".** Egyptian bank SMS routinely end with a toll-free
  hotline. Any expense whose message says "toll free" and matches no earlier keyword is
  categorised **Transport** today, before this change. Suggested fix if the user wants it:
  replace `'toll'` with `'toll gate'`/`'tollgate'`. Needs their sign-off — it is a
  behaviour change, not a bug fix.
- **Duplicate logging across profiles.** The 20:30 UTC message on 2026-09-01 was inserted
  twice, from two different `sms_token`s belonging to two different profiles, one second
  apart — one row resolved card 6238, the other stored `card_id: null`. There are 6 profiles
  with tokens in the database. The phone appears to be posting the same SMS to more than one
  webhook URL. Investigate the Shortcuts setup before changing any code.
