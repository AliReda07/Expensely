-- Self-service data export (Egypt PDPL right of access; see LEGAL_CHILDREN_DATA.md). One call
-- returns everything the signed-in user has in the app as a single JSON document, built from
-- auth.uid() so it can only ever describe the caller.
--
-- Deliberately left out:
--   * secrets: the SMS webhook token's value (only whether one is set), push keys, payment
--     provider references
--   * other people's data: an owner's export lists their family's name and size, not its
--     members' emails or spending
--   * internal bookkeeping: SMS de-duplication keys and reminder send logs
create function public.export_my_data()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  return jsonb_build_object(
    'about', 'Everything Expensely holds about this account. Generated at your request.',
    'exported_at', now(),
    'account', (select jsonb_build_object('id', u.id, 'email', u.email, 'created_at', u.created_at)
                from auth.users u where u.id = uid),
    'profile', (select (to_jsonb(p) - 'id' - 'sms_token') || jsonb_build_object('sms_token_set', p.sms_token is not null)
                from public.profiles p where p.id = uid),
    'transactions', coalesce((select jsonb_agg(to_jsonb(t) - 'user_id' - 'sms_dedupe_key' order by t.date, t.created_at)
                              from public.transactions t where t.user_id = uid), '[]'::jsonb),
    'cards', coalesce((select jsonb_agg(to_jsonb(c) - 'user_id' order by c.created_at)
                       from public.cards c where c.user_id = uid), '[]'::jsonb),
    'categories', coalesce((select jsonb_agg(to_jsonb(c) - 'user_id' order by c.name)
                            from public.categories c where c.user_id = uid), '[]'::jsonb),
    'budgets', coalesce((select jsonb_agg(to_jsonb(b) - 'user_id' order by b.created_at)
                         from public.budgets b where b.user_id = uid), '[]'::jsonb),
    'installment_plans', coalesce((select jsonb_agg(to_jsonb(i) - 'user_id' order by i.first_due_date)
                                   from public.installment_plans i where i.user_id = uid), '[]'::jsonb),
    'subscription', (select to_jsonb(s) - 'user_id' - 'provider_ref' from public.subscriptions s where s.user_id = uid),
    'ai_usage', coalesce((select jsonb_agg(to_jsonb(a) - 'user_id' order by a.day)
                          from public.ai_usage a where a.user_id = uid), '[]'::jsonb),
    'family_membership', (select jsonb_build_object('family', h.name, 'role', m.role, 'share_mode', m.share_mode,
                                                    'shared_card_ids', m.shared_card_ids, 'joined_at', m.joined_at)
                          from public.household_members m join public.households h on h.id = m.household_id
                          where m.user_id = uid and m.role <> 'owner'),
    'family_budgets_set_for_you', coalesce((select jsonb_agg(jsonb_build_object('category_id', b.category_id, 'amount', b.amount))
                                            from public.member_budgets b where b.member_id = uid), '[]'::jsonb),
    'family_you_own', (select jsonb_build_object('name', h.name, 'members',
                                                 (select count(*) from public.household_members m where m.household_id = h.id))
                       from public.households h where h.owner_id = uid),
    'push_devices', (select count(*) from public.push_subscriptions p where p.user_id = uid)
  );
end;
$$;

revoke execute on function public.export_my_data() from public, anon, authenticated;
grant execute on function public.export_my_data() to authenticated;
