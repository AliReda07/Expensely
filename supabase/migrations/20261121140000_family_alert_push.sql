-- Push alerts for family events. A daily job (family-alerts edge function) tells each premium
-- household owner about members at 80% / over a budget, and about large purchases.
--
-- Also fixes a privacy gap in household_alerts: a "large purchase" alert names one member's
-- individual transaction (who, amount, date), so it must never be raised for an adult who shares
-- totals only. Budget alerts are aggregates and stay.

-- What has already been pushed, so a retry or a second run never repeats an alert.
-- Service role only: RLS on with no policies, and no client privileges.
create table public.family_alert_log (
  owner_id uuid not null references auth.users (id) on delete cascade,
  alert_key text not null,
  sent_at timestamptz not null default now(),
  primary key (owner_id, alert_key)
);

alter table public.family_alert_log enable row level security;
revoke all on public.family_alert_log from anon, authenticated;

-- The alert rows for one household, with a stable key per alert:
--   budget:<member>:<category|overall>:<YYYY-MM>:<near|over>   (once per month per level)
--   large:<transaction id>                                       (once per purchase)
create function public._family_alerts(p_household uuid)
returns table (
  a_kind text, a_key text, a_member uuid, a_email text, a_category_id uuid, a_category text,
  a_level text, a_amount numeric, a_spent numeric, a_date date
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  today date := (now() at time zone 'Africa/Cairo')::date;
  s date := date_trunc('month', (now() at time zone 'Africa/Cairo')::date)::date;
  e date := (date_trunc('month', (now() at time zone 'Africa/Cairo')::date) + interval '1 month')::date - 1;
  month_key text := to_char(date_trunc('month', (now() at time zone 'Africa/Cairo')::date), 'YYYY-MM');
  threshold numeric;
begin
  select large_purchase_threshold into threshold from public.households where id = p_household;

  return query
  with vis as (select * from public._family_visible_tx(p_household, s - 7, e))
  select
    'budget'::text,
    'budget:' || b.member_id || ':' || coalesce(b.category_id::text, 'overall') || ':' || month_key || ':'
      || (case when sp.spent >= b.amount then 'over' else 'near' end),
    b.member_id,
    u.email::text,
    b.category_id,
    (select c.name from public.categories c where c.id = b.category_id)::text,
    (case when sp.spent >= b.amount then 'over' else 'near' end)::text,
    b.amount,
    sp.spent,
    null::date
  from public.member_budgets b
  join auth.users u on u.id = b.member_id
  cross join lateral (
    select coalesce(sum(v.amount), 0) as spent from vis v
    where v.user_id = b.member_id and v.type = 'expense' and v.date between s and e
      and (b.category_id is null or v.category_id = b.category_id)
  ) sp
  where b.household_id = p_household and sp.spent >= b.amount * 0.8
  union all
  select
    'large_purchase'::text,
    'large:' || v.id::text,
    v.user_id,
    u.email::text,
    null::uuid,
    null::text,
    null::text,
    v.amount,
    null::numeric,
    v.date
  from vis v
  join auth.users u on u.id = v.user_id
  join public.household_members m on m.household_id = p_household and m.user_id = v.user_id
  where threshold is not null and v.type = 'expense' and v.amount >= threshold and v.date >= today - 7
    -- A totals-only adult shares sums, never individual transactions.
    and not (m.role = 'adult' and m.share_mode = 'totals');
end;
$$;

-- Every household the job should look at: premium owners only, and never the owner's own
-- purchases (they know about those).
create function public.family_alerts_digest()
returns table (
  owner_id uuid, a_kind text, a_key text, a_member uuid, a_email text, a_category text,
  a_level text, a_amount numeric, a_spent numeric, a_date date
)
language sql
stable
security definer
set search_path = ''
as $$
  select h.owner_id, a.a_kind, a.a_key, a.a_member, a.a_email, a.a_category, a.a_level, a.a_amount, a.a_spent, a.a_date
  from public.households h
  cross join lateral public._family_alerts(h.id) a
  where public.is_premium(h.owner_id) and a.a_member <> h.owner_id;
$$;

-- The dashboard's own alert list, with the same totals-only rule applied to large purchases.
create or replace function public.household_alerts()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  h uuid := public._family_owner_household(true);
begin
  return coalesce((
    select jsonb_agg(
      case a.a_kind
        when 'budget' then jsonb_build_object(
          'type', 'budget', 'member_id', a.a_member, 'email', a.a_email,
          'category_id', a.a_category_id,
          'category_name', a.a_category, 'amount', a.a_amount, 'spent', a.a_spent, 'level', a.a_level)
        else jsonb_build_object(
          'type', 'large_purchase', 'member_id', a.a_member, 'email', a.a_email, 'amount', a.a_amount, 'date', a.a_date)
      end
    )
    from public._family_alerts(h) a
  ), '[]'::jsonb);
end;
$$;

revoke execute on function public._family_alerts(uuid) from public, anon, authenticated;
revoke execute on function public.family_alerts_digest() from public, anon, authenticated;
grant execute on function public.family_alerts_digest() to service_role;
