# Plan: fold the 0.50 EGP instant-transfer fee into outgoing transfers

**Status:** Designed, not implemented. Written by an Opus planning session for a Sonnet
session to execute. Decisions below were settled with the user — do not re-litigate them.

**Goal:** An outgoing instant transfer costs 0.50 EGP that the bank never mentions. Record
the true cost so the app's balance stops drifting.

---

## What the evidence says

The fee **cannot be parsed** — it has to be inferred. Two facts, both checked against the
live database:

1. **No fee SMS arrives.** There is not a single 0.50 transaction in the user's history, and
   no message matching `fee|رسوم|charge`. The bank charges silently.
2. **The transfer SMS never mentions it.** Real sample:
   `IPN transfer sent with amount of EGP 70.00 from 3670 on 01/09 at 11:51 PM. Ref# 62f71ff5.`

Consequence: this is a synthetic charge the app invents. It is therefore capped at exactly
the case the user confirmed they are billed for, and nothing wider.

Two transfer templates exist in the user's history and both are in scope:

| Template | Example | Hotline |
|---|---|---|
| English IPN | `IPN transfer sent with amount of EGP 70.00 from 3670` | 16607 |
| Arabic instant | `تم تنفيذ تحويل لحظي من بطاقتكم مسبقة الدفع بمبلغ 50.00 جم إلى ALI A****` | 19623 |

---

## Locked decisions (and why)

| # | Decision | Choice | Reasoning |
|---|---|---|---|
| 1 | Which transfers | **Outgoing instant transfers only**, both templates | User's answer: "all outgoing transfers". Incoming is free. |
| 2 | Detection rule | `looksLikeInstantTransfer(text) && detectDirection(text) === 'out'` | Both existing functions, no new parsing. `looksLikeInstantTransfer` matches `لحظي`/`فوري`/`ipn`/`instapay`, which is exactly the "instant" set and correctly excludes an ordinary non-instant bank transfer, which is not billed at this rate. |
| 3 | Why both conditions | Direction alone is not enough | `detectDirection` returns `'out'` for any message with `من حسابك`/`من بطاقتكم`, including ordinary purchase notices. Requiring the instant-transfer signal as well is what stops a POS purchase getting a phantom fee. |
| 4 | How recorded | **Folded into the transfer amount** — 70.00 becomes 70.50 | User's choice over a separate 0.50 row. Keeps the transaction list free of one tiny row per transfer. Accepted cost: the stored amount no longer matches the SMS, so the note must disclose it (step 3). |
| 5 | Category | Unchanged — `Transfer`, as today | Moot under decision 4: there is no separate row to categorize. `detectCategory`'s `looksLikeTransfer` branch already assigns it. |
| 6 | Where the logic lives | A pure function in `categorize.ts`; applied at the insert site in `sms-webhook/index.ts` | `parseTransaction` must keep returning **what the message actually says** — it is the tested, deterministic reading of the SMS. The fee is a policy decision about what to *record*, which belongs to the webhook. Keeping them separate means the parser's tests stay honest. |
| 7 | Rounding | `Math.round((amount + fee) * 100) / 100` | Float addition on a real amount from the user's history: `374.9 + 0.5` yields `375.40000000000003`. Must not reach the database. |
| 8 | Backfill | None | Existing transfers keep their recorded amounts. Retroactively editing history is a separate, opt-in task — see "Follow-ups". |

---

## Implementation

### Step 1 — the fee function

Add to `supabase/functions/_shared/categorize.ts`, directly after
`looksLikeInstantTransfer` (currently ends line 204), so it sits with the function it
depends on. `detectDirection` is defined further down but is a hoisted `function`
declaration, so ordering is fine.

```ts
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
```

### Step 2 — apply it at the insert site

In `supabase/functions/sms-webhook/index.ts`, after `parsed` is confirmed non-null and
before the insert. Add `instantTransferFee` to the import list at the top.

```ts
// See categorize.ts: the bank silently charges this and never sends an SMS for it, so the
// recorded amount has to be the transfer plus the fee or the app's balance drifts by 0.50
// on every transfer. The note says so explicitly (below) -- a stored amount that doesn't
// match the SMS the user can still see in their inbox is otherwise just confusing.
const fee = instantTransferFee(message);
const amount = fee > 0 ? Math.round((parsed.amount + fee) * 100) / 100 : parsed.amount;
```

Then use `amount` — **not** `parsed.amount` — in all three places that currently read it:

1. the `insert({ ... amount: parsed.amount ... })` call
2. `formatAmount(parsed.amount, profile.currency)` for `amountText`
3. anything derived from `amountText` (the push body and the HTTP response inherit it
   automatically)

Leave `parsed.amount` itself untouched.

### Step 3 — disclose the fee in the note

This needs care: the note is built in **two** branches and the second one discards the tag.

```ts
let note = message.slice(0, 300) + transferTag;
if (transferTag) {
  const direction = detectDirection(message);
  const party = extractTransferParty(message, direction);
  if (party) {
    note = direction === 'out' ? `To ${party}` : `From ${party}`;   // <-- tag dropped here
  }
}
```

When `fee > 0`, append a disclosure to whichever note was produced, e.g.
`` note += ' (incl. 0.50 fee)' `` after the whole block. A transfer to a named party must
end up as `To ALI A**** M****** (incl. 0.50 fee)` — if the disclosure only lands in the
first branch, the most common case silently shows an amount that contradicts the SMS.

### Step 4 — tests

Add a `describe('instantTransferFee')` block to
`supabase/functions/_shared/categorize.test.ts`. Use the real message texts:

| Input | Expected |
|---|---|
| `IPN transfer sent with amount of EGP 70.00 from 3670 …` | `0.5` |
| `IPN transfer received with amount of EGP 235.00 on 3670 …` | `0` |
| `تم تنفيذ تحويل لحظي من بطاقتكم مسبقة الدفع بمبلغ 50.00 جم إلى ALI A**** M****** …` | `0.5` |
| `تم إضافة تحويل لحظي لبطاقتكم مسبقة الدفع بمبلغ 50.00 جم من REHAB …` | `0` |
| The McDonald's purchase SMS (`تم خصم 90 EGP … عند MCDONALDS`) | `0` — the critical negative |
| An outgoing transfer with no instant/IPN wording | `0` |

Plus a rounding test asserting `374.9 + 0.5` stores as exactly `375.4`, using the real
amount from the user's history that exposes the float error.

### Step 5 — deploy

Rides in the **same `sms-webhook` deploy** as `MERCHANT_KEYWORDS_PLAN.md` and the
pre-existing uncommitted changes — the user has already decided everything ships together.
Run the full suite (`npx vitest run`) before deploying, not just the touched file.

---

## Accepted risks

- **Own-account transfers.** The user's history contains a matched pair sharing reference
  `295280099680` — an outgoing leg and an incoming leg one minute apart. If a transfer
  between the user's own accounts is actually free, the outgoing leg now gets a 0.50 fee it
  didn't incur. This is inherent to decision 1 ("all outgoing"), not a bug in the rule.
- **If the bank ever starts sending a fee SMS**, this double-counts: the inferred fee plus a
  real parsed one. Nothing in the code would detect that. Worth re-checking for 0.50
  transactions after a month of running.
- **A fee change** (0.50 is a policy set by the bank, not a law) means editing
  `INSTANT_TRANSFER_FEE`. It is a single exported constant for exactly that reason.

## Follow-ups (not in this change)

- Backfilling the fee onto historical transfers. There are roughly a dozen outgoing instant
  transfers in the table; a one-off `update` keyed on the same detection rule would correct
  them, but it rewrites records the user has already reconciled by eye. Only do this if asked.
