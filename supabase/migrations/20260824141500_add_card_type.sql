-- Debit: starting_balance + income - expenses = money available.
-- Credit: starting_balance + expenses - income = amount owed (a liability).
alter table public.cards
  add column type text not null default 'debit' check (type in ('debit', 'credit'));
