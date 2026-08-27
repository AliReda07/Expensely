-- Web Push subscriptions: one row per browser/device the user has enabled
-- notifications on. Sent to by the sms-webhook edge function (via the service
-- role, which bypasses RLS) right after it auto-logs a transaction from an
-- incoming bank SMS -- that happens from a phone-side automation, not
-- necessarily while the app is open, so a real push is what actually reaches
-- the user rather than an in-app toast.
create table public.push_subscriptions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

create policy "push subscriptions are owner-only select" on public.push_subscriptions
  for select using (auth.uid() = user_id);

create policy "push subscriptions are owner-only insert" on public.push_subscriptions
  for insert with check (auth.uid() = user_id);

create policy "push subscriptions are owner-only delete" on public.push_subscriptions
  for delete using (auth.uid() = user_id);

create index push_subscriptions_user_idx on public.push_subscriptions (user_id);
