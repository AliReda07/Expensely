-- sms_token is the entire auth story for the SMS webhook -- it is the token in the URL path
-- that identifies the user, and there is no session behind it. But it was generated
-- client-side (SmsAutoLogSheet.tsx) and written straight through by useProfile, so the column
-- accepted any string at all. A modified client, or a direct PostgREST PATCH with the public
-- anon key, could set it to a single character and make that account's ledger writable by
-- anyone who guessed it.
--
-- The generator produces 24 CSPRNG bytes as 48 lowercase hex characters. The accepted range
-- is deliberately wider than exactly 48 so an older or future token length doesn't fail this
-- migration, while still forcing enough entropy to be unguessable.
--
-- Verified against live data before applying: all 7 existing tokens match this pattern.
alter table public.profiles
  add constraint sms_token_is_high_entropy
  check (sms_token is null or sms_token ~ '^[0-9a-f]{32,128}$');
