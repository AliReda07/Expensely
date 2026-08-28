-- Payment due-day reminders (see PAYMENT_REMINDERS_PLAN.md).

-- Nullable and credit-cards-only: a null due day is how a card opts out of reminders
-- entirely (there's no separate toggle -- see decision 14). Set once when the card is
-- added and never maintained day-to-day, unlike a `next_due_date` that would go stale
-- the first month the user forgets to roll it forward.
alter table public.cards
  add column payment_due_day smallint
    check (payment_due_day is null or (payment_due_day between 1 and 31));

-- The send log and dedupe mechanism. The unique constraint is the whole dedupe story --
-- the payment-reminders edge function inserts a row *before* sending anything and
-- treats a conflict as "already handled, skip", so a retry, a manual dryRun-less test
-- invocation, or a redeploy can never double-send the same (card, due date, offset).
create table public.payment_reminders (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users (id) on delete cascade,
  card_id uuid not null references public.cards (id) on delete cascade,
  due_date date not null,
  offset_days smallint not null, -- 7 or 1
  amount_owed numeric not null,
  sent_at timestamptz not null default now(),
  dismissed_at timestamptz,
  unique (card_id, due_date, offset_days)
);

alter table public.payment_reminders enable row level security;

create policy "payment reminders are owner-only select" on public.payment_reminders
  for select using (auth.uid() = user_id);

-- The edge function inserts through the service role, which bypasses RLS -- this
-- owner-insert policy exists only for the client's dismiss action, which needs to
-- create today's row itself when the badge is already showing but the cron job
-- hasn't run yet (see usePaymentDue.ts).
create policy "payment reminders are owner-only insert" on public.payment_reminders
  for insert with check (auth.uid() = user_id);

create policy "payment reminders are owner-only update" on public.payment_reminders
  for update using (auth.uid() = user_id);

create index payment_reminders_user_due_idx on public.payment_reminders (user_id, due_date);

-- Available but not yet enabled on this project (installed_version was null as of
-- planning). pg_net lets the cron job below reach the edge function over HTTP;
-- pg_cron runs it on a schedule.
create extension if not exists pg_cron;
create extension if not exists pg_net;
