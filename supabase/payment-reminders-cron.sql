-- One-time setup for the payment-reminders cron job. Not a migration: run this by
-- hand in the Supabase SQL editor *after* the human steps in
-- PAYMENT_REMINDERS_PLAN.md are done (Resend signup, RESEND_API_KEY and
-- REMINDER_CRON_SECRET set as function secrets, edge function deployed).
--
-- Run the two statements in order. The secret value must match REMINDER_CRON_SECRET
-- exactly -- copy it from here into the function secret, or generate it in the
-- dashboard first and paste it into vault.create_secret below instead.

select vault.create_secret(encode(gen_random_bytes(32), 'hex'), 'reminder_cron_secret');

-- 07:00 UTC = 09:00 Africa/Cairo at UTC+2 (winter). Egypt reintroduced DST in 2023
-- (UTC+3 in summer), so this fixed UTC hour drifts to an 08:00 Cairo-local reminder
-- during the DST months. Harmless for a "sometime in the morning" reminder -- if it
-- ever needs to be exact, this is the line to revisit.
select cron.schedule(
  'payment-reminders-daily',
  '0 7 * * *',
  $$
  select net.http_post(
    url := 'https://qoaxxghhytqvuentfiuk.supabase.co/functions/v1/payment-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Reminder-Secret', (select decrypted_secret from vault.decrypted_secrets where name = 'reminder_cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
