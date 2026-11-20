-- Premium entitlements and AI usage metering.
--
-- Deliberately NOT columns on `profiles`: that table is self-updatable by its RLS policy, so
-- any plan flag stored there could be flipped by the user from the browser with the public
-- anon key. These tables have a select-only policy for the owner and no write policy at all;
-- every write goes through the SECURITY DEFINER functions below, which only the service role
-- (the edge functions) may execute.

create table public.subscriptions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'premium')),
  status text not null default 'active' check (status in ('active', 'past_due', 'canceled')),
  -- Null for a hand-granted premium (no billing period); set by the payment webhook later.
  current_period_end timestamptz,
  provider text,
  provider_ref text,
  -- Lifetime count of AI messages used on the free trial.
  trial_messages_used integer not null default 0 check (trial_messages_used >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

create policy "subscriptions are owner-readable" on public.subscriptions
  for select using (auth.uid() = user_id);

create table public.ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  count integer not null default 0 check (count >= 0),
  primary key (user_id, day)
);

alter table public.ai_usage enable row level security;

create policy "ai usage is owner-readable" on public.ai_usage
  for select using (auth.uid() = user_id);

-- Supabase grants table privileges to anon/authenticated by default; RLS already blocks writes
-- (no policy), but there is no reason for these roles to hold the privilege at all.
revoke insert, update, delete, truncate on public.subscriptions from anon, authenticated;
revoke insert, update, delete, truncate on public.ai_usage from anon, authenticated;
revoke all on public.subscriptions, public.ai_usage from anon;

-- True while the subscription entitles the user to premium. The 3-day grace covers a late
-- renewal webhook or a card retry so a paying user isn't locked out mid-renewal.
create function public.is_premium(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select s.plan = 'premium'
        and (s.current_period_end is null and s.status = 'active'
             or s.current_period_end + interval '3 days' > now())
      from public.subscriptions s
      where s.user_id = p_user
    ),
    false
  );
$$;

-- Atomically checks the caller's allowance and, if allowed, spends one message.
-- Returns {allowed, tier, reason, trial_left}. The row lock on the subscription serialises a
-- user's concurrent requests, so two messages in flight can't both slip under the cap.
create function public.consume_ai_message(p_user uuid, p_daily_cap integer, p_trial_cap integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  sub public.subscriptions%rowtype;
  today date := (now() at time zone 'Africa/Cairo')::date;
  used integer;
begin
  insert into public.subscriptions (user_id) values (p_user) on conflict (user_id) do nothing;
  select * into sub from public.subscriptions where user_id = p_user for update;

  if public.is_premium(p_user) then
    insert into public.ai_usage (user_id, day, count) values (p_user, today, 0)
      on conflict (user_id, day) do nothing;
    select count into used from public.ai_usage where user_id = p_user and day = today for update;
    if used >= p_daily_cap then
      return jsonb_build_object('allowed', false, 'tier', 'premium', 'reason', 'daily_limit', 'trial_left', null);
    end if;
    update public.ai_usage set count = count + 1 where user_id = p_user and day = today;
    return jsonb_build_object('allowed', true, 'tier', 'premium', 'reason', null, 'trial_left', null);
  end if;

  if sub.trial_messages_used >= p_trial_cap then
    return jsonb_build_object('allowed', false, 'tier', 'free', 'reason', 'premium_required', 'trial_left', 0);
  end if;
  update public.subscriptions
    set trial_messages_used = trial_messages_used + 1, updated_at = now()
    where user_id = p_user;
  return jsonb_build_object(
    'allowed', true, 'tier', 'trial', 'reason', null,
    'trial_left', p_trial_cap - (sub.trial_messages_used + 1)
  );
end;
$$;

-- Gives a message back when the upstream model call failed, so an outage isn't billed to the
-- user's quota. Never goes below zero.
create function public.refund_ai_message(p_user uuid, p_tier text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_tier = 'premium' then
    update public.ai_usage
      set count = greatest(count - 1, 0)
      where user_id = p_user and day = (now() at time zone 'Africa/Cairo')::date;
  elsif p_tier = 'trial' then
    update public.subscriptions
      set trial_messages_used = greatest(trial_messages_used - 1, 0), updated_at = now()
      where user_id = p_user;
  end if;
end;
$$;

-- These run as their owner and must never be callable over the public REST API.
revoke execute on function public.is_premium(uuid) from public, anon, authenticated;
revoke execute on function public.consume_ai_message(uuid, integer, integer) from public, anon, authenticated;
revoke execute on function public.refund_ai_message(uuid, text) from public, anon, authenticated;
grant execute on function public.is_premium(uuid) to service_role;
grant execute on function public.consume_ai_message(uuid, integer, integer) to service_role;
grant execute on function public.refund_ai_message(uuid, text) to service_role;

-- Owners only ever need to read these; drop the remaining default privileges too.
revoke references, trigger on public.subscriptions, public.ai_usage from anon, authenticated;
