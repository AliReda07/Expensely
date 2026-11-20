-- Installment plans (valU, Contact, Souhoola, bank plans, ...) with reminders.
-- See PREMIUM_PLAN.md, Phase 3. No contract or account numbers are stored on purpose.

create table public.installment_plans (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  monthly_amount numeric not null check (monthly_amount > 0 and monthly_amount < 1000000000),
  months_total smallint not null check (months_total between 1 and 120),
  -- Every later due date falls on this date's day of the month, clamped for short months.
  first_due_date date not null check (first_due_date >= date '2020-01-01'),
  -- How many installments the user has marked paid; the next due one is index paid_count.
  paid_count smallint not null default 0 check (paid_count >= 0),
  -- What it would cost up front, if known (premium shows the cost of financing).
  cash_price numeric check (cash_price is null or (cash_price > 0 and cash_price < 1000000000)),
  created_at timestamptz not null default now(),
  constraint paid_count_within_plan check (paid_count <= months_total)
);

alter table public.installment_plans enable row level security;

create policy "installment plans are owner-only select" on public.installment_plans
  for select using (auth.uid() = user_id);
create policy "installment plans are owner-only insert" on public.installment_plans
  for insert with check (auth.uid() = user_id);
create policy "installment plans are owner-only update" on public.installment_plans
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "installment plans are owner-only delete" on public.installment_plans
  for delete using (auth.uid() = user_id);

create index installment_plans_user_idx on public.installment_plans (user_id);

-- Free accounts may have 2 active plans; premium is unlimited. A trigger rather than an RLS
-- check so it also covers the sneaky route: un-marking payments on a finished plan to bring
-- it back to life would otherwise get a free user past the limit through an UPDATE.
-- Rows already over the limit (e.g. after a premium lapses) are left alone; the trigger only
-- blocks creating or reactivating more. A null auth.uid() is the service role / maintenance
-- and is not limited.
create function public.enforce_installment_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  active_count integer;
begin
  if auth.uid() is null then
    return new;
  end if;

  -- Only a new active plan, or a finished one being brought back, can push the count up.
  if new.paid_count >= new.months_total then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.paid_count < old.months_total then
    return new;
  end if;

  if public.is_premium(new.user_id) then
    return new;
  end if;

  select count(*) into active_count
    from public.installment_plans
    where user_id = new.user_id and paid_count < months_total and id <> new.id;

  if active_count >= 2 then
    raise exception 'installment_limit_reached' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger installment_plans_limit
  before insert or update on public.installment_plans
  for each row execute function public.enforce_installment_limit();

-- Send log and dedupe: the reminder function inserts a row *before* sending, and the unique
-- constraint turns a retry or redeploy into a no-op instead of a double notification.
create table public.installment_reminders (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users (id) on delete cascade,
  plan_id uuid not null references public.installment_plans (id) on delete cascade,
  due_date date not null,
  offset_days smallint not null, -- 3 or 0
  sent_at timestamptz not null default now(),
  unique (plan_id, due_date, offset_days)
);

alter table public.installment_reminders enable row level security;

create policy "installment reminders are owner-only select" on public.installment_reminders
  for select using (auth.uid() = user_id);

-- Table privileges: clients read and manage their own plans; the reminder log is read-only to
-- them (only the service role writes it).
revoke truncate, references, trigger on public.installment_plans from anon, authenticated;
revoke all on public.installment_plans from anon;
revoke insert, update, delete, truncate, references, trigger on public.installment_reminders from anon, authenticated;
revoke all on public.installment_reminders from anon;

revoke execute on function public.enforce_installment_limit() from public, anon, authenticated;
