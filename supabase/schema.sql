-- Expensely schema
-- Run this once in the Supabase SQL editor for your project.

create extension if not exists "uuid-ossp";

-- One row per authenticated user, created automatically on signup.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  starting_balance numeric not null default 0,
  overall_budget numeric,
  currency text not null default 'EGP',
  -- The random token in the SMS webhook's URL path. It is the entire auth story for that
  -- endpoint -- there is no session behind it -- and it is generated client-side, so the
  -- format is constrained here rather than trusted: without this, a modified client or a
  -- direct PostgREST PATCH with the public anon key could set it to a single character and
  -- make that account's ledger writable by anyone who guessed it. The generator produces 24
  -- CSPRNG bytes as 48 lowercase hex chars; the range is wider than 48 so a differently-sized
  -- token doesn't break, while still forcing enough entropy to be unguessable.
  sms_token text unique
    check (sms_token is null or sms_token ~ '^[0-9a-f]{32,128}$'),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles are self-readable" on public.profiles
  for select using (auth.uid() = id);

create policy "profiles are self-updatable" on public.profiles
  for update using (auth.uid() = id);

create policy "profiles are self-insertable" on public.profiles
  for insert with check (auth.uid() = id);

-- Auto-create a profile row whenever a new auth user is created.
create function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- The function above is SECURITY DEFINER and lives in the API-exposed public schema, so
-- without this both anon and authenticated could call it over /rest/v1/rpc/handle_new_user
-- (Supabase database linter 0028/0029). A direct call errors out on the unassigned `new`
-- record rather than doing damage, but it runs as its owner and does not belong in the
-- public API surface. Revoking EXECUTE does not stop the trigger above from firing --
-- trigger invocation does not check the caller's EXECUTE privilege.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- Categories: preset rows have user_id = null (visible to everyone),
-- custom rows belong to one user.
create table public.categories (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users (id) on delete cascade,
  name text not null,
  icon text not null,
  color text not null,
  is_preset boolean not null default false,
  created_at timestamptz not null default now(),
  -- A preset category is global by definition. Without this, a user could insert their own
  -- row with is_preset = true (the RLS insert policy only checks user_id), and sms-webhook
  -- selects `is_preset.eq.true` across all users -- so one account could inject a category
  -- into every other user's SMS categorization, leaving victims with transactions pointing
  -- at a category their own select policy forbids them from reading.
  constraint preset_categories_are_global check (not is_preset or user_id is null)
);

alter table public.categories enable row level security;

create policy "categories are readable by owner or preset" on public.categories
  for select using (user_id is null or auth.uid() = user_id);

create policy "categories are insertable by owner" on public.categories
  for insert with check (auth.uid() = user_id);

create policy "categories are updatable by owner" on public.categories
  for update using (auth.uid() = user_id);

create policy "categories are deletable by owner" on public.categories
  for delete using (auth.uid() = user_id);

insert into public.categories (user_id, name, icon, color, is_preset) values
  (null, 'Food', 'utensils', '#f97316', true),
  (null, 'Transport', 'car', '#3b82f6', true),
  (null, 'Shopping', 'shopping-bag', '#ec4899', true),
  (null, 'Bills', 'receipt', '#ef4444', true),
  (null, 'Entertainment', 'clapperboard', '#a855f7', true),
  (null, 'Health', 'heart-pulse', '#22c55e', true),
  (null, 'Groceries', 'shopping-cart', '#14b8a6', true),
  (null, 'Other', 'more-horizontal', '#64748b', true),
  (null, 'Income', 'wallet', '#16a34a', true),
  (null, 'Transfer', 'arrow-left-right', '#6366f1', true);

-- Cards: a user's individual payment cards.
--
-- Only the last four digits are ever stored. A full card number (PAN) is
-- PCI-DSS regulated data and must never live in this table -- the CHECK
-- constraint below makes storing anything longer than four digits impossible.
create table public.cards (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  last4 text check (last4 ~ '^[0-9]{4}$'),
  color text not null default '#3b82f6',
  -- Debit: starting_balance + income - expenses = money available.
  -- Credit: starting_balance + expenses - income = amount owed (a liability).
  type text not null default 'debit' check (type in ('debit', 'credit')),
  starting_balance numeric not null default 0,
  -- Credit cards only: the card's limit, so "available credit" (limit - owed) can be
  -- shown without changing how owed itself is tracked.
  credit_limit numeric check (credit_limit is null or credit_limit >= 0),
  -- The bank's SMS sender name/hotline, e.g. "HSBC" or a shortcode. Used by the SMS
  -- webhook only as a fallback card match when a bank's SMS never includes the card's
  -- last 4 digits -- and only when exactly one of the user's cards has that sender.
  bank_sender text,
  -- Phrases that appear in this bank's SMS templates (e.g. "مسبقة الدفع" for a prepaid
  -- card's transfer notices) -- a list, not a single value, because the same bank
  -- describes the same card differently across message types (a transfer notice and a
  -- purchase notice from the same bank may use entirely different wording). A second
  -- fallback for the same problem as bank_sender -- resolving a card when its SMS never
  -- print the last 4 digits -- for when per-bank Sender-based automation isn't
  -- practical on the phone (many banks send from an alphanumeric Sender ID that iOS
  -- Shortcuts cannot filter a contact by). Matched against the message body itself, so
  -- it needs no phone-side setup at all.
  sms_match_phrases text[] not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.cards enable row level security;

create policy "cards are owner-only select" on public.cards
  for select using (auth.uid() = user_id);

create policy "cards are owner-only insert" on public.cards
  for insert with check (auth.uid() = user_id);

create policy "cards are owner-only update" on public.cards
  for update using (auth.uid() = user_id);

create policy "cards are owner-only delete" on public.cards
  for delete using (auth.uid() = user_id);

-- Last four digits are unique per user so an incoming bank SMS naming
-- "card ending 1234" always resolves to exactly one card.
create unique index cards_user_last4_idx on public.cards (user_id, last4)
  where last4 is not null;

-- Transactions: both expenses and income share this table.
-- card_id = null means cash / unassigned. Removing a card preserves its
-- transaction history rather than deleting it.
create table public.transactions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null check (type in ('expense', 'income')),
  amount numeric not null check (amount > 0),
  category_id uuid references public.categories (id) on delete set null,
  card_id uuid references public.cards (id) on delete set null,
  date date not null default current_date,
  note text,
  created_at timestamptz not null default now()
);

alter table public.transactions enable row level security;

create policy "transactions are owner-only select" on public.transactions
  for select using (auth.uid() = user_id);

create policy "transactions are owner-only insert" on public.transactions
  for insert with check (auth.uid() = user_id);

create policy "transactions are owner-only update" on public.transactions
  for update using (auth.uid() = user_id);

create policy "transactions are owner-only delete" on public.transactions
  for delete using (auth.uid() = user_id);

create index transactions_user_date_idx on public.transactions (user_id, date desc);
create index transactions_card_idx on public.transactions (card_id);

-- Per-category budgets. The overall monthly budget lives on profiles.overall_budget
-- instead of a nullable category_id here, so this table can use a plain
-- unique(user_id, category_id) constraint that Supabase's upsert can target directly.
create table public.budgets (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete cascade,
  amount numeric not null check (amount > 0),
  created_at timestamptz not null default now(),
  unique (user_id, category_id)
);

alter table public.budgets enable row level security;

create policy "budgets are owner-only select" on public.budgets
  for select using (auth.uid() = user_id);

create policy "budgets are owner-only insert" on public.budgets
  for insert with check (auth.uid() = user_id);

create policy "budgets are owner-only update" on public.budgets
  for update using (auth.uid() = user_id);

create policy "budgets are owner-only delete" on public.budgets
  for delete using (auth.uid() = user_id);

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
