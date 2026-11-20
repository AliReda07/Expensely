-- Family households (premium). Design: FAMILY_DESIGN.md (kept local).
--
-- The central rule: existing tables and their policies are NOT widened. A household owner never
-- reads a member's rows directly. The family dashboard is fed only by the SECURITY DEFINER
-- functions below, each returning exactly what a screen needs. Every state change also goes
-- through a function; clients hold SELECT only, and only on rows that are theirs.

-- Adults can hide a single transaction from the household owner. (Children cannot: for a child
-- everything is shared. See _family_visible_tx.)
alter table public.transactions add column is_private boolean not null default false;

create table public.households (
  id uuid primary key default uuid_generate_v4(),
  owner_id uuid not null unique references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  large_purchase_threshold numeric check (large_purchase_threshold is null or large_purchase_threshold > 0),
  created_at timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households (id) on delete cascade,
  -- unique: a person belongs to at most one household.
  user_id uuid not null unique references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'adult', 'child')),
  share_mode text not null default 'all' check (share_mode in ('all', 'cards', 'totals')),
  shared_card_ids uuid[] not null default '{}',
  consented_at timestamptz not null default now(),
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id),
  -- A child shares everything; there is nothing to configure.
  constraint child_shares_everything check (role <> 'child' or (share_mode = 'all' and cardinality(shared_card_ids) = 0)),
  constraint cards_mode_has_cards check (share_mode <> 'cards' or cardinality(shared_card_ids) > 0)
);

create unique index household_one_owner on public.household_members (household_id) where role = 'owner';

create table public.household_invites (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid not null references public.households (id) on delete cascade,
  -- SHA-256 of the token. The token itself is shown once to the owner and never stored, so a
  -- database leak does not leak usable invite links.
  token_hash text not null unique,
  invited_email text not null check (invited_email = lower(invited_email) and char_length(invited_email) <= 254),
  role text not null check (role in ('adult', 'child')),
  expires_at timestamptz not null,
  used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.member_budgets (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid not null,
  member_id uuid not null,
  -- null = the member's overall monthly budget.
  category_id uuid references public.categories (id) on delete cascade,
  amount numeric not null check (amount > 0 and amount < 1000000000),
  -- Removing a member removes the budgets the parent set for them.
  foreign key (household_id, member_id) references public.household_members (household_id, user_id) on delete cascade,
  unique nulls not distinct (household_id, member_id, category_id)
);

create index household_invites_household_idx on public.household_invites (household_id);

-- Hard ceiling on members, as a backstop to the checks in the functions.
create function public.enforce_household_size()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.household_members where household_id = new.household_id) >= 6 then
    raise exception 'household_full';
  end if;
  return new;
end;
$$;

create trigger household_members_size
  before insert on public.household_members
  for each row execute function public.enforce_household_size();

-- Policy helpers. SECURITY DEFINER so the policies below don't recurse through each other's
-- RLS; both only ever answer about the caller (auth.uid()).
create function public.is_household_owner(p_household uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.households h where h.id = p_household and h.owner_id = auth.uid());
$$;

create function public.is_household_member(p_household uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.household_members m where m.household_id = p_household and m.user_id = auth.uid());
$$;

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.household_invites enable row level security;
alter table public.member_budgets enable row level security;

create policy "household visible to its members" on public.households
  for select using (public.is_household_owner(id) or public.is_household_member(id));
create policy "own membership, or the owner's member list" on public.household_members
  for select using (user_id = auth.uid() or public.is_household_owner(household_id));
create policy "budgets visible to the member and the owner" on public.member_budgets
  for select using (member_id = auth.uid() or public.is_household_owner(household_id));
-- household_invites: deliberately no policy. Not readable by any client; the owner lists
-- pending invites through list_invites(), which never returns a token.

revoke all on public.households, public.household_members, public.household_invites, public.member_budgets from anon;
revoke insert, update, delete, truncate, references, trigger on public.households from authenticated;
revoke insert, update, delete, truncate, references, trigger on public.household_members from authenticated;
revoke insert, update, delete, truncate, references, trigger on public.member_budgets from authenticated;
revoke all on public.household_invites from authenticated;

-- ---------------------------------------------------------------------------------------------
-- Internal helpers (not callable by any client)
-- ---------------------------------------------------------------------------------------------

-- The caller's household, if they own one; optionally requires the owner to be premium.
create function public._family_owner_household(p_require_premium boolean)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  h uuid;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;
  select id into h from public.households where owner_id = uid;
  if h is null then
    raise exception 'not_owner';
  end if;
  if p_require_premium and not public.is_premium(uid) then
    raise exception 'premium_required';
  end if;
  return h;
end;
$$;

-- The one place that decides what the owner may see of each member's transactions:
--   owner, child        -> everything (a child is told at join that everything is shared)
--   adult, all/totals   -> everything not marked private
--   adult, cards        -> only transactions on the card ids they chose, and not private
-- 'totals' members still contribute here; the *row-returning* function refuses them separately.
create function public._family_visible_tx(p_household uuid, p_start date, p_end date)
returns table (user_id uuid, id uuid, type text, amount numeric, category_id uuid, card_id uuid, date date, note text)
language sql
stable
security definer
set search_path = ''
as $$
  select t.user_id, t.id, t.type, t.amount, t.category_id, t.card_id, t.date, t.note
  from public.household_members m
  join public.transactions t on t.user_id = m.user_id
  where m.household_id = p_household
    and t.date between p_start and p_end
    and (
      m.role in ('owner', 'child')
      or (
        not t.is_private
        and (m.share_mode in ('all', 'totals') or (m.share_mode = 'cards' and t.card_id = any (m.shared_card_ids)))
      )
    );
$$;

-- ---------------------------------------------------------------------------------------------
-- Household lifecycle
-- ---------------------------------------------------------------------------------------------

create function public.create_household(p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  h uuid;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if not public.is_premium(uid) then raise exception 'premium_required'; end if;
  if exists (select 1 from public.household_members where user_id = uid) then
    raise exception 'already_in_household';
  end if;
  if p_name is null or char_length(btrim(p_name)) not between 1 and 60 then
    raise exception 'invalid_name';
  end if;
  insert into public.households (owner_id, name) values (uid, btrim(p_name)) returning id into h;
  insert into public.household_members (household_id, user_id, role) values (h, uid, 'owner');
  return h;
end;
$$;

create function public.delete_household()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Sharing ends for everyone; nothing financial is deleted (it all lives in members' own rows).
  delete from public.households where id = public._family_owner_household(false);
end;
$$;

create function public.leave_household()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  r text;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  select role into r from public.household_members where user_id = uid;
  if r is null then raise exception 'not_a_member'; end if;
  if r = 'owner' then raise exception 'owner_cannot_leave'; end if;
  delete from public.household_members where user_id = uid;
end;
$$;

create function public.remove_member(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  h uuid := public._family_owner_household(false);
begin
  delete from public.household_members where household_id = h and user_id = p_user and role <> 'owner';
  if not found then raise exception 'not_a_member'; end if;
end;
$$;

-- An adult changes what they share. Applies from then on. Children and the owner cannot.
create function public.update_my_sharing(p_share_mode text, p_shared_card_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  r text;
  cards uuid[] := coalesce(p_shared_card_ids, '{}');
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  select role into r from public.household_members where user_id = uid;
  if r is null then raise exception 'not_a_member'; end if;
  if r = 'child' then raise exception 'children_cannot_change'; end if;
  if r = 'owner' then raise exception 'not_applicable'; end if;
  if p_share_mode not in ('all', 'cards', 'totals') then raise exception 'invalid_share_mode'; end if;
  if p_share_mode <> 'cards' then
    cards := '{}';
  elsif cardinality(cards) = 0
     or exists (select 1 from unnest(cards) c where not exists (select 1 from public.cards k where k.id = c and k.user_id = uid)) then
    raise exception 'invalid_cards';
  end if;
  update public.household_members set share_mode = p_share_mode, shared_card_ids = cards where user_id = uid;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Invites
-- ---------------------------------------------------------------------------------------------

create function public.create_invite(p_email text, p_role text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  h uuid := public._family_owner_household(true);
  e text := lower(btrim(coalesce(p_email, '')));
  tok text;
  inv public.household_invites%rowtype;
begin
  if p_role not in ('adult', 'child') then raise exception 'invalid_role'; end if;
  if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(e) > 254 then raise exception 'invalid_email'; end if;

  perform 1 from public.households where id = h for update;

  -- A fresh invite replaces an older pending one for the same address.
  update public.household_invites set revoked_at = now()
    where household_id = h and invited_email = e and used_at is null and revoked_at is null;

  if (select count(*) from public.household_members where household_id = h)
     + (select count(*) from public.household_invites
          where household_id = h and used_at is null and revoked_at is null and expires_at > now()) >= 6 then
    raise exception 'household_full';
  end if;

  tok := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.household_invites (household_id, token_hash, invited_email, role, expires_at)
    values (h, encode(sha256(convert_to(tok, 'utf8')), 'hex'), e, p_role, now() + interval '48 hours')
    returning * into inv;

  return jsonb_build_object('id', inv.id, 'token', tok, 'expires_at', inv.expires_at);
end;
$$;

create function public.list_invites()
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
    select jsonb_agg(jsonb_build_object('id', i.id, 'email', i.invited_email, 'role', i.role, 'expires_at', i.expires_at)
                     order by i.created_at desc)
    from public.household_invites i
    where i.household_id = h and i.used_at is null and i.revoked_at is null and i.expires_at > now()
  ), '[]'::jsonb);
end;
$$;

create function public.revoke_invite(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  h uuid := public._family_owner_household(false);
begin
  update public.household_invites set revoked_at = now()
    where id = p_id and household_id = h and used_at is null and revoked_at is null;
  if not found then raise exception 'invalid_invite'; end if;
end;
$$;

-- Returns {household, role} for a token that is valid for the signed-in user, or null. Used by
-- the join screen to show what is about to be shared. Every failure looks the same on purpose.
create function public.preview_invite(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  mail text;
  inv public.household_invites%rowtype;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  select lower(email) into mail from auth.users where id = uid;
  select * into inv from public.household_invites
    where token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'utf8')), 'hex');
  if not found or inv.used_at is not null or inv.revoked_at is not null or inv.expires_at <= now()
     or inv.invited_email is distinct from mail then
    return null;
  end if;
  return jsonb_build_object(
    'household', (select name from public.households where id = inv.household_id),
    'role', inv.role
  );
end;
$$;

create function public.accept_invite(p_token text, p_share_mode text, p_shared_card_ids uuid[], p_consent boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  mail text;
  inv public.household_invites%rowtype;
  hh public.households%rowtype;
  mode text := p_share_mode;
  cards uuid[] := coalesce(p_shared_card_ids, '{}');
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if p_consent is distinct from true then raise exception 'consent_required'; end if;

  select lower(email) into mail from auth.users where id = uid;
  select * into inv from public.household_invites
    where token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'utf8')), 'hex')
    for update;
  -- One indistinguishable error for unknown, expired, used, revoked and wrong-email tokens.
  if not found or inv.used_at is not null or inv.revoked_at is not null or inv.expires_at <= now()
     or inv.invited_email is distinct from mail then
    raise exception 'invalid_invite';
  end if;

  if exists (select 1 from public.household_members where user_id = uid) then
    raise exception 'already_in_household';
  end if;

  select * into hh from public.households where id = inv.household_id for update;
  if not public.is_premium(hh.owner_id) then raise exception 'household_inactive'; end if;
  if (select count(*) from public.household_members where household_id = hh.id) >= 6 then
    raise exception 'household_full';
  end if;

  if inv.role = 'child' then
    mode := 'all';
    cards := '{}';
  else
    if mode not in ('all', 'cards', 'totals') then raise exception 'invalid_share_mode'; end if;
    if mode <> 'cards' then
      cards := '{}';
    elsif cardinality(cards) = 0
       or exists (select 1 from unnest(cards) c where not exists (select 1 from public.cards k where k.id = c and k.user_id = uid)) then
      raise exception 'invalid_cards';
    end if;
  end if;

  insert into public.household_members (household_id, user_id, role, share_mode, shared_card_ids, consented_at)
    values (hh.id, uid, inv.role, mode, cards, now());
  update public.household_invites set used_at = now() where id = inv.id;

  return jsonb_build_object('household', hh.name, 'role', inv.role);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Owner settings
-- ---------------------------------------------------------------------------------------------

-- p_amount null clears the member's budget for that category (or the overall budget).
create function public.set_member_budget(p_member uuid, p_category uuid, p_amount numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  h uuid := public._family_owner_household(true);
begin
  if not exists (select 1 from public.household_members where household_id = h and user_id = p_member and role <> 'owner') then
    raise exception 'not_a_member';
  end if;
  -- A category must be one the member can actually use: a preset or one of their own.
  if p_category is not null and not exists (
    select 1 from public.categories c where c.id = p_category and (c.user_id is null or c.user_id = p_member)
  ) then
    raise exception 'invalid_category';
  end if;

  if p_amount is null then
    delete from public.member_budgets
      where household_id = h and member_id = p_member and category_id is not distinct from p_category;
    return;
  end if;
  if p_amount <= 0 or p_amount >= 1000000000 then raise exception 'invalid_amount'; end if;

  insert into public.member_budgets (household_id, member_id, category_id, amount)
    values (h, p_member, p_category, p_amount)
    on conflict (household_id, member_id, category_id) do update set amount = excluded.amount;
end;
$$;

create function public.set_large_purchase_threshold(p_amount numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  h uuid := public._family_owner_household(true);
begin
  if p_amount is not null and (p_amount <= 0 or p_amount >= 1000000000) then raise exception 'invalid_amount'; end if;
  update public.households set large_purchase_threshold = p_amount where id = h;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Dashboard (owner, premium). Aggregates and shared rows only; see _family_visible_tx.
-- ---------------------------------------------------------------------------------------------

create function public.household_summary(p_month date default null)
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

-- Recent shared rows for one member. A 'totals' member shares sums only, never rows.
create function public.household_recent(p_member uuid, p_limit integer default 20)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  h uuid := public._family_owner_household(true);
  m public.household_members%rowtype;
  lim integer := least(greatest(coalesce(p_limit, 20), 1), 50);
begin
  select * into m from public.household_members where household_id = h and user_id = p_member;
  if not found then raise exception 'not_a_member'; end if;
  if m.role = 'adult' and m.share_mode = 'totals' then raise exception 'not_shared'; end if;

  return coalesce((
    select jsonb_agg(row_to_json(r)::jsonb order by r.date desc, r.id)
    from (
      select v.id, v.date, v.type, v.amount, v.note, coalesce(c.name, 'Other') as category
      from public._family_visible_tx(h, date '2000-01-01', date '2100-01-01') v
      left join public.categories c on c.id = v.category_id
      where v.user_id = p_member
      order by v.date desc, v.id
      limit lim
    ) r
  ), '[]'::jsonb);
end;
$$;

-- Members at 80% or over of a budget this month, and large purchases in the last 7 days.
create function public.household_alerts()
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

-- ---------------------------------------------------------------------------------------------
-- Privileges. Clients may call exactly the public API below, as `authenticated`; the internal
-- helpers and the trigger function are callable by no client.
-- ---------------------------------------------------------------------------------------------

revoke execute on function
  public._family_owner_household(boolean),
  public._family_visible_tx(uuid, date, date),
  public.enforce_household_size(),
  public.is_household_owner(uuid),
  public.is_household_member(uuid),
  public.create_household(text),
  public.delete_household(),
  public.leave_household(),
  public.remove_member(uuid),
  public.update_my_sharing(text, uuid[]),
  public.create_invite(text, text),
  public.list_invites(),
  public.revoke_invite(uuid),
  public.preview_invite(text),
  public.accept_invite(text, text, uuid[], boolean),
  public.set_member_budget(uuid, uuid, numeric),
  public.set_large_purchase_threshold(numeric),
  public.household_summary(date),
  public.household_recent(uuid, integer),
  public.household_alerts()
from public, anon, authenticated;

-- The two RLS helpers must be executable by the role evaluating the policies.
grant execute on function public.is_household_owner(uuid), public.is_household_member(uuid) to authenticated;

grant execute on function
  public.create_household(text),
  public.delete_household(),
  public.leave_household(),
  public.remove_member(uuid),
  public.update_my_sharing(text, uuid[]),
  public.create_invite(text, text),
  public.list_invites(),
  public.revoke_invite(uuid),
  public.preview_invite(text),
  public.accept_invite(text, text, uuid[], boolean),
  public.set_member_budget(uuid, uuid, numeric),
  public.set_large_purchase_threshold(numeric),
  public.household_summary(date),
  public.household_recent(uuid, integer),
  public.household_alerts()
to authenticated;
