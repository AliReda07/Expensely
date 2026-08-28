# Plan: Credit card payment reminders

**Status:** Designed, not implemented. Every decision below was settled with the user in a
grilling session. Do not re-litigate them — implement them.

**Goal:** When a credit card payment is coming due, warn the user 7 days before and again
1 day before, via email, web push, and an in-app alert on the card itself.

---

## Locked decisions (and why)

| # | Decision | Choice | Reasoning |
|---|---|---|---|
| 1 | Due date storage | `payment_due_day` smallint (1–31), nullable, credit cards only | Matches how issuers bill. Set once when adding the card, never maintained. An explicit `next_due_date` was rejected because it goes stale the first month the user forgets to update it. |
| 2 | Amount quoted | The live running owed balance the app already computes | The app has no statement-balance concept. A statement snapshot would be more accurate but needs a statement day, a second job, and a backfill story. Accepted tradeoff: the figure includes post-statement spend, so it over-states slightly. |
| 3 | Backend | Supabase `pg_cron` + `pg_net` → a `payment-reminders` edge function | n8n was considered and **rejected**: the user's n8n Cloud instance is on a free trial that will expire, and a scheduler that dies silently is the worst failure mode for a reminder. Keeping logic in the repo also means vitest coverage and reviewable diffs. |
| 4 | Channels | Email + web push + in-app badge | Push already works end-to-end. Email survives a swiped-away notification. |
| 5 | Clock | Hardcoded `Africa/Cairo`, job runs ~09:00 local | No timezone exists anywhere in the schema. The app is effectively single-user (see PRODUCT.md). Promote to a `profiles.timezone` column when a second user in another timezone actually exists. |
| 6 | Email transport | Resend, sandbox sender `onboarding@resend.dev` | No custom domain — the app serves off `*.vercel.app` and no provider can send from that. Sandbox delivers only to the Resend account's own address, which is invisible in a single-user app. |
| 7 | Recipient | `auth.users.email` of the card's owner, read via service role | Architecturally right, works for future users. **Precondition:** the user's Resend signup email must match their Expensely login email or sandbox mail silently won't arrive. |
| 8 | Dedupe | `payment_reminders` table, unique on `(card_id, due_date, offset_days)` | Insert-before-send so a retry, a manual test invocation, or a redeploy cannot double-send. |
| 9 | Clearing | Auto-clear when a payment is detected, plus manual dismiss | Income on a credit card already means "payment toward the balance" in the existing balance math. Manual dismiss covers paying outside the app. |
| 10 | Placement | Badge on the card's row in `CardBalances`; additional dismissible banner on Home for the 1-day case | Two severities, two levels of loudness. The user asked for "an alert on the card", and the row is where the card lives. |
| 11 | Short months | Clamp the due day to the last day of the month | Due day 31 → Feb 28/29. What issuers actually do. Rolling forward to the 1st was rejected because it warns *later* in the month where the cycle is already shortest. |
| 12 | Paid-detection window | Income on that card strictly after the **previous** due date, up to today | The billing cycle itself. Using "since the last reminder" was rejected because paying early — the good behaviour — would fall outside the window and still nag. |
| 13 | Zero balance | Skip entirely when owed ≤ 0 | An "EGP 0.00 due" email trains the user to filter the sender. |
| 14 | Opt-out | None. `payment_due_day` being nullable **is** the per-card opt-in | A second toggle would create the puzzling state of a card that knows its due date and deliberately says nothing. Push separately respects the existing notifications toggle. |
| 15 | Badge timing | Continuous from T-7 until paid or the date passes; email/push stay discrete at exactly T-7 and T-1 | Persistent UI should reflect persistent state. A badge that appears on day 7, vanishes on day 6 and returns on day 1 is baffling. |
| 16 | Badge source | Computed client-side | `useCards` has the cards and `useBalance` has the owed figure. The badge stays correct even if the cron job never runs — which is exactly the resilience that motivated rejecting n8n. |
| 17 | Dismissal storage | `dismissed_at` column on `payment_reminders` | Syncs across devices. localStorage was rejected: dismissing on the phone would leave the badge on the laptop. |
| 18 | Batching | One email per user per offset, listing every card due | Respects the inbox and the Resend free-tier daily cap. Reads better than two mails to mentally combine. |
| 19 | Cron auth | Random secret in Supabase Vault, passed by `pg_net` as a header, verified by the function | `supabase_vault` is already installed. Keeps the secret out of the `cron.schedule` SQL, and is scoped to this one function rather than being the service-role master key. |
| 20 | Testing | Pure date functions under vitest + a `dryRun` / `date` override on the function | Otherwise the February clamp is observable one day a year. |

---

## Verified environment facts

Established by direct inspection during planning — trust these, but re-verify if the repo has moved on.

- **Supabase project:** `qoaxxghhytqvuentfiuk` (name `expense-tracker`, eu-central-1, Postgres 17.6).
- **`pg_cron` 1.6.4 and `pg_net` 0.20.4 are available but `installed_version` is `null`.** Both need `create extension`.
- **`supabase_vault` 0.3.1 is already installed** (schema `vault`).
- **`pgcrypto` 1.3 is already installed** — use `gen_random_bytes` for the shared secret.
- **No email infrastructure exists.** No Resend, SendGrid, SMTP, nodemailer anywhere.
- **No scheduling infrastructure exists.** Both edge functions (`ask-proxy`, `sms-webhook`) are request-triggered.
- **No timezone column anywhere.** All dates are `timestamptz` or plain date strings.
- **`date-fns` v4.4.0 is already a dependency** — use it for the date math on the client.
- **Vitest already picks up tests under `supabase/functions/`** — `_shared/categorize.test.ts` imports from `vitest` and runs under the default `**/*.test.ts` glob. So shared Deno code *is* testable with `npm test`.
- **Vercel project:** `expense-tracker` (`prj_UqQeBpVLUAGXLrZklMlHEMvpEntM`), linked to GitHub `AliReda07/Expensely`. No custom domain.
- **n8n is not used by the app.** `src/pages/Ask.tsx:276` calls `supabase.functions.invoke('ask-proxy')`. The n8n workflow "Expense Tracker - Ask" is orphaned legacy. Do not wire anything new to n8n.

---

## Implementation

### Step 1 — Migration: `supabase/migrations/<timestamp>_add_payment_reminders.sql`

Add the due-day column:

```sql
alter table public.cards
  add column payment_due_day smallint
    check (payment_due_day is null or (payment_due_day between 1 and 31));
```

Comment it in the house style used by the other migrations (see
`20260824140000_add_cards.sql` for the tone — explain *why*, not just *what*): note that it
is nullable because a null due day is how a card opts out of reminders entirely, and that it
is only meaningful for `type = 'credit'`.

Create the send log:

```sql
create table public.payment_reminders (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users (id) on delete cascade,
  card_id uuid not null references public.cards (id) on delete cascade,
  due_date date not null,
  offset_days smallint not null,          -- 7 or 1
  amount_owed numeric not null,
  sent_at timestamptz not null default now(),
  dismissed_at timestamptz,
  unique (card_id, due_date, offset_days)
);
```

The unique constraint is the whole dedupe mechanism — the function inserts first and treats a
conflict as "already handled, skip". Mirror the RLS policy style of
`20260827180000_add_push_subscriptions.sql`: owner-only select, and owner-only **update**
(needed for the dismiss). Insert happens through the service role, which bypasses RLS, so an
owner-insert policy is not required — but add an index on `(user_id, due_date)`.

Also add to `supabase/schema.sql`, which is kept as the consolidated snapshot.

Enable the extensions in the same migration or a sibling one:

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;
```

### Step 2 — Pure date math: `src/lib/dueDate.ts` + `src/lib/dueDate.test.ts`

This file is imported by **both** the client and the edge function, so keep it dependency-light.
`date-fns` is fine on the client; if importing it into Deno proves awkward, hand-roll the two
helpers rather than duplicating the logic in two places.

Export at minimum:

- `clampDueDay(dueDay: number, year: number, month: number): number` — `Math.min(dueDay, daysInMonth)`.
- `nextDueDate(dueDay: number, today: Date): Date` — the next clamped occurrence on or after today.
- `previousDueDate(dueDay: number, today: Date): Date` — the clamped occurrence immediately before `nextDueDate`.
- `daysUntilDue(dueDay: number, today: Date): number` — whole days, computed on calendar dates not timestamps.

All of these operate on **Cairo-local calendar dates**. Do not use `Date` arithmetic that can
drift across a UTC midnight; normalise to a `YYYY-MM-DD` string first. `src/lib/format.test.ts`
already has a test named "is not affected by local timezone offset (no day shift)" — read it and
match that defensive approach.

Test cases that must exist:
- Due day 31 in February (non-leap → 28, leap → 29).
- Due day 30 in February.
- Due day 15 mid-month, and on the due date itself (`daysUntilDue === 0`).
- Rollover across a year boundary (due day 5, today Dec 30).
- `previousDueDate` when today is before the due day (previous month) and after it (this month).

### Step 3 — Shared paid/owed logic

Two derivations the client and server must agree on exactly:

**Owed** — replicate the credit branch of `src/hooks/useBalance.ts:56`:
`starting_balance + Σ(expenses) − Σ(income)` over *all* transactions for that card. Note the
sign convention in that file: `signed = income ? +amount : -amount`, then negated for credit
cards. Get this wrong and the email and the badge will disagree.

**Paid this cycle** — exists a transaction where `card_id = card.id`, `type = 'income'`, and
`date > previousDueDate(dueDay, today)` and `date <= today`.

> The lower bound is **exclusive** on purpose. A payment logged on the previous due date
> settles the *previous* cycle, so it must not suppress this cycle's reminder. This is a
> genuine ambiguity — a payment on the due date could belong to either cycle — and exclusive
> errs toward reminding rather than staying silent, which is the safer failure.

### Step 4 — Edge function: `supabase/functions/payment-reminders/index.ts`

Model it on `supabase/functions/sms-webhook/index.ts` for structure, service-role client
construction, and error handling.

Flow:

1. Reject unless the `X-Reminder-Secret` header matches `Deno.env.get('REMINDER_CRON_SECRET')`. Return 401 otherwise.
2. Accept optional JSON body `{ date?: string, dryRun?: boolean }` for testing. `date` overrides "today"; `dryRun` runs the whole computation and returns what *would* be sent without inserting rows, sending email, or pushing.
3. Compute today's Cairo-local date.
4. Select all credit cards with a non-null `payment_due_day`, joined to their owner.
5. For each card: compute `daysUntilDue`. Keep only cards where it is exactly **7** or **1**.
6. Drop cards where owed ≤ 0 (decision 13).
7. Drop cards where a payment was detected this cycle (Step 3).
8. Group survivors by `user_id`.
9. Per user, per offset: insert the `payment_reminders` rows. **A unique-violation on any row means it was already sent — skip that card.** If every card for that user is a duplicate, send nothing.
10. Send **one** email listing all that user's due cards for that offset, via the Resend API (`POST https://api.resend.com/emails`, `Authorization: Bearer ${RESEND_API_KEY}`, from `onboarding@resend.dev`). Recipient is the owner's `auth.users.email` — fetch via `supabaseAdmin.auth.admin.getUserById()`.
11. Send push via the existing `sendPushNotification()` from `supabase/functions/_shared/push.ts`. It already handles missing VAPID config and prunes stale 404/410 subscriptions — reuse it, do not reimplement.
12. Return a JSON summary of what was sent (useful for both `dryRun` and cron logs).

Order matters: insert the log rows **before** sending. A crash after insert costs one missed
reminder; a crash after sending but before insert costs a duplicate on the next run, and
duplicates are what erode trust in the channel.

Set `verify_jwt = false` for this function (it has no user session — the shared secret is the
auth). Check whether `supabase/config.toml` exists; if the other functions declare settings
there, follow suit.

### Step 5 — Schedule it

```sql
select cron.schedule(
  'payment-reminders-daily',
  '0 7 * * *',   -- 07:00 UTC = 09:00 Africa/Cairo (UTC+2, no DST since 2023... verify)
  $$
  select net.http_post(
    url := 'https://qoaxxghhytqvuentfiuk.supabase.co/functions/v1/payment-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Reminder-Secret', (select decrypted_secret from vault.decrypted_secrets where name = 'reminder_cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
```

**Verify the Cairo UTC offset before committing to `0 7`.** Egypt reintroduced DST in 2023
(UTC+3 in summer), so a fixed UTC hour drifts by an hour seasonally. For a 09:00-ish reminder
that drift is harmless — but say so in a comment rather than leaving it as an unexplained
constant, and do not silently assume UTC+2 year-round.

Store the secret first:

```sql
select vault.create_secret(encode(gen_random_bytes(32), 'hex'), 'reminder_cron_secret');
```

### Step 6 — Client: due-day input

`src/types/index.ts` — add `payment_due_day: number | null` to `Card`, documented in the same
commented style as the neighbouring fields (explain that null means no reminders).

`src/hooks/useCards.ts` — add `payment_due_day` to the `.select()` list on line 26 **and** to
the `CardInput` interface. This is easy to half-do; both are required.

`src/components/AddCardForm.tsx` — add a `payment_due_day` state (line ~32, beside
`creditLimit`) and a numeric input rendered **only when `type === 'credit'`**, matching how the
credit-limit field is already conditionally shown. Validate 1–31. Include it in the `onSubmit`
payload around line 60. Because `CardsSection` reuses this same form for editing
(`src/components/CardsSection.tsx:96`), this single change covers both add and edit.

### Step 7 — Client: the badge and banner

New `src/hooks/usePaymentDue.ts` (or a pure helper in `src/lib/dueDate.ts` called from Home) that,
given `cards`, `balanceByCard`, and the user's transactions, returns the set of cards currently
in a due window — using the *same* pure functions from Step 2.

`src/components/CardBalances.tsx` — the credit row currently renders
`{formatCurrency(row.spent, currency)} spent this month` at line 113. When a card is due,
replace or supplement that line with the due state: amber inside 7 days, red inside 1. Keep it
`tabular-nums` and match the existing type scale (`text-xs`). Do not add a new row height.

`src/pages/Home.tsx` — a dismissible banner above the existing content for the 1-day case only.
Dismissing writes `dismissed_at` on the corresponding `payment_reminders` row (creating it if
the badge is showing but the cron hasn't logged one yet — see decision 17's caveat).

### Step 8 — Verify

- `npm test` — the date math cases from Step 2 must pass.
- `npm run build` — `tsc -b` will catch the `Card` type change rippling through `useCards`, `AddCardForm`, and `CardBalances`.
- `npm run lint` (oxlint).
- Invoke the function with `{ "dryRun": true, "date": "2027-02-21" }` and confirm it reports a card with due day 31 as due in 7 days (the February clamp, end to end).
- Invoke with `dryRun: false` once for a real card to confirm the email actually lands, then check a second invocation sends nothing (dedupe working).

---

## Human steps the agent cannot do

1. **Sign up for Resend** and generate an API key. Critically — sign up with **the same email address used to log into Expensely**, or sandbox mail will not be delivered (decision 7).
2. **Set the function secrets:** `RESEND_API_KEY` and `REMINDER_CRON_SECRET` (matching the Vault value) in the Supabase dashboard under Edge Functions → Secrets.
3. **Confirm `VAPID_*` secrets are still set** — push silently no-ops without them (see `_shared/push.ts:28`).

---

## Known risks

- **Resend sandbox is single-recipient.** The moment a second real user signs up, their reminders vanish with no error visible in the app. If the app ever gains real users, this must become a verified domain.
- **The owed figure is a running balance, not a statement balance** (decision 2). It will read higher than the bank's actual minimum. If this proves annoying in practice, the upgrade path is a statement close day plus a `card_statements` snapshot table.
- **The paid-detection heuristic treats any income on a credit card as a payment.** A refund from a merchant looks identical to a payment and will suppress a reminder. Acceptable for now; worth revisiting if it bites.
- **A fixed UTC cron hour drifts against Egyptian DST** (Step 5).
