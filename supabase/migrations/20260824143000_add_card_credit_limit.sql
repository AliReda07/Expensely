-- Credit cards only: the card's limit, so "available credit" (limit - owed) can be
-- shown without changing how owed itself is tracked.
alter table public.cards
  add column credit_limit numeric check (credit_limit is null or credit_limit >= 0);
