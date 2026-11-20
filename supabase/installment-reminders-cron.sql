-- One-time setup for the installment-reminders cron job. Not a migration: run by hand
-- (`supabase db query --linked -f supabase/installment-reminders-cron.sql`) once the
-- installment-reminders edge function is deployed.
--
-- Reuses the vault secret `reminder_cron_secret` created for the card payment reminders (see
-- payment-reminders-cron.sql), which must match the REMINDER_CRON_SECRET function secret.
--
-- 07:05 UTC, five minutes after the card reminders so the two never start in the same second.
-- Same DST caveat as that job: 09:05 Cairo in winter, 08:05 in summer.
select cron.schedule(
  'installment-reminders-daily',
  '5 7 * * *',
  $$
  select net.http_post(
    url := 'https://qoaxxghhytqvuentfiuk.supabase.co/functions/v1/installment-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Reminder-Secret', (select decrypted_secret from vault.decrypted_secrets where name = 'reminder_cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
