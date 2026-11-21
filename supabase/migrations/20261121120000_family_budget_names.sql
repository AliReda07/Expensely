-- Family dashboard, step 4d. Replaces two functions (same signatures, so their privileges are
-- kept) to add what the budget and alert screens need:
--   household_summary: the owner's large-purchase threshold, and each budget's category name
--                      (a budget on a category with no spending this month had no name to show)
--   household_alerts:  the category name on budget alerts
-- Visibility rules are untouched: both still read only through _family_visible_tx.

create or replace function public.household_summary(p_month date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  h uuid := public._family_owner_household(true);
  s date := date_trunc('month', coalesce(p_month, (now() at time zone 'Africa/Cairo')::date))::date;
  e date := (date_trunc('month', coalesce(p_month, (now() at time zone 'Africa/Cairo')::date)) + interval '1 month')::date - 1;
begin
  return (
    with vis as (select * from public._family_visible_tx(h, s, e))
    select jsonb_build_object(
      'month_start', s,
      'month_end', e,
      'large_purchase_threshold', (select hh.large_purchase_threshold from public.households hh where hh.id = h),
      'family_expense', coalesce((select sum(v.amount) from vis v where v.type = 'expense'), 0),
      'family_income', coalesce((select sum(v.amount) from vis v where v.type = 'income'), 0),
      'members', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'user_id', m.user_id,
            'email', u.email,
            'role', m.role,
            'share_mode', m.share_mode,
            'expense', coalesce((select sum(v.amount) from vis v where v.user_id = m.user_id and v.type = 'expense'), 0),
            'income', coalesce((select sum(v.amount) from vis v where v.user_id = m.user_id and v.type = 'income'), 0),
            'by_category', coalesce((
              select jsonb_agg(jsonb_build_object('category_id', x.category_id, 'name', x.name, 'color', x.color, 'amount', x.amount)
                               order by x.amount desc)
              from (
                select v.category_id, coalesce(c.name, 'Other') as name, c.color, sum(v.amount) as amount
                from vis v left join public.categories c on c.id = v.category_id
                where v.user_id = m.user_id and v.type = 'expense'
                group by v.category_id, c.name, c.color
              ) x
            ), '[]'::jsonb),
            'budgets', coalesce((
              select jsonb_agg(jsonb_build_object(
                'category_id', b.category_id,
                'category_name', (select c.name from public.categories c where c.id = b.category_id),
                'amount', b.amount,
                'spent', (select coalesce(sum(v.amount), 0) from vis v
                          where v.user_id = m.user_id and v.type = 'expense'
                            and (b.category_id is null or v.category_id = b.category_id))
              ))
              from public.member_budgets b where b.household_id = h and b.member_id = m.user_id
            ), '[]'::jsonb)
          )
          order by (m.role = 'owner') desc, u.email
        )
        from public.household_members m join auth.users u on u.id = m.user_id
        where m.household_id = h
      ), '[]'::jsonb)
    )
  );
end;
$$;

create or replace function public.household_alerts()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  h uuid := public._family_owner_household(true);
  today date := (now() at time zone 'Africa/Cairo')::date;
  s date := date_trunc('month', (now() at time zone 'Africa/Cairo')::date)::date;
  e date := (date_trunc('month', (now() at time zone 'Africa/Cairo')::date) + interval '1 month')::date - 1;
  threshold numeric;
begin
  select large_purchase_threshold into threshold from public.households where id = h;
  return (
    with vis as (select * from public._family_visible_tx(h, s - 7, e))
    select coalesce(jsonb_agg(a), '[]'::jsonb) from (
      select jsonb_build_object(
        'type', 'budget',
        'member_id', b.member_id,
        'email', u.email,
        'category_id', b.category_id,
        'category_name', (select c.name from public.categories c where c.id = b.category_id),
        'amount', b.amount,
        'spent', sp.spent,
        'level', case when sp.spent >= b.amount then 'over' else 'near' end
      ) as a
      from public.member_budgets b
      join auth.users u on u.id = b.member_id
      cross join lateral (
        select coalesce(sum(v.amount), 0) as spent from vis v
        where v.user_id = b.member_id and v.type = 'expense' and v.date between s and e
          and (b.category_id is null or v.category_id = b.category_id)
      ) sp
      where b.household_id = h and sp.spent >= b.amount * 0.8
      union all
      select jsonb_build_object(
        'type', 'large_purchase', 'member_id', v.user_id, 'email', u.email, 'amount', v.amount, 'date', v.date
      )
      from vis v join auth.users u on u.id = v.user_id
      where threshold is not null and v.type = 'expense' and v.amount >= threshold and v.date >= today - 7
    ) q
  );
end;
$$;
