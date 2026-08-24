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
  starting_balance numeric not null default 0,
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

-- Existing transactions keep card_id = null, which reads as "cash / unassigned".
-- Removing a card preserves its transaction history rather than deleting it.
alter table public.transactions
  add column card_id uuid references public.cards (id) on delete set null;

create index transactions_card_idx on public.transactions (card_id);
