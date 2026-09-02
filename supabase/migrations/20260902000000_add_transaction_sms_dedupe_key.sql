-- Backstop against the same SMS being logged twice for one account -- e.g. a phone-side
-- automation retrying a failed POST, or a stray duplicate Shortcuts automation firing on
-- the same incoming message. Confirmed happening in practice: the same bank SMS was
-- inserted for two different users 9ms apart from two different webhook tokens.
--
-- Nullable and only ever set by sms-webhook: a manually-entered transaction from the app
-- itself has no source SMS to dedupe against, so it's simply never checked or written here.
--
-- Deliberately the normalized message text, not the stored `note` column: `note` is lossy
-- for transfers (rewritten to "To X"/"From X", discarding the raw text), so two genuinely
-- different transfers to the same person for the same amount would otherwise collide.
alter table public.transactions
  add column sms_dedupe_key text;

-- Partial index: only SMS-sourced rows ever populate this column, and the webhook only
-- ever looks up a specific user's own recent rows.
create index transactions_sms_dedupe_idx
  on public.transactions (user_id, sms_dedupe_key, created_at)
  where sms_dedupe_key is not null;
