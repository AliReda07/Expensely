-- One-time setup for the family-alerts cron job. Not a migration: run by hand
-- (`supabase db query --linked -f supabase/family-alerts-cron.sql`) once the family-alerts edge
-- function is deployed.
--
-- Reuses the vault secret `reminder_cron_secret` created for the card payment reminders (see
-- payment-reminders-cron.sql), which must match the REMINDER_CRON_SECRET function secret.
--
-- 07:10 UTC, after the card (07:00) and installment (07:05) reminders so none start together.
-- Same DST caveat as those jobs: 09:10 Cairo in winter, 08:10 in summer.
select cron.schedule(
  'family-alerts-daily',
  '10 7 * * *',
  $$
  select net.http_post(
    url := 'https://qoaxxghhytqvuentfiuk.supabase.co/functions/v1/family-alerts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Reminder-Secret', (select decrypted_secret from vault.decrypted_secrets where name = 'reminder_cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
