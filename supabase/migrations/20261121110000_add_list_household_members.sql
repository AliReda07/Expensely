-- The owner needs to see who is in the family (and remove people) even when their premium has
-- lapsed, so this is deliberately NOT premium-gated, unlike the dashboard functions. It returns
-- membership facts only (who, role, how much they share), never anything financial.
create function public.list_household_members()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  h uuid := public._family_owner_household(false);
begin
  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'user_id', m.user_id,
        'email', u.email,
        'role', m.role,
        'share_mode', m.share_mode,
        'joined_at', m.joined_at
      )
      order by (m.role = 'owner') desc, m.joined_at
    )
    from public.household_members m
    join auth.users u on u.id = m.user_id
    where m.household_id = h
  ), '[]'::jsonb);
end;
$$;

revoke execute on function public.list_household_members() from public, anon, authenticated;
grant execute on function public.list_household_members() to authenticated;
