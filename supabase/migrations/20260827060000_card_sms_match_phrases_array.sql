-- Widen sms_match_phrase from one phrase to a list. A real sample showed the same card
-- described with different wording depending on message type ("مسبقة الدفع" in a transfer
-- notice vs "بطاقة المدفوعة مقدما" in a purchase notice from the same bank), so one phrase
-- per card isn't enough to cover every message template.
--
-- Safe to drop-and-recreate rather than migrate data: this column was added minutes ago
-- in the previous migration and nothing has used it yet.
alter table public.cards
  drop column sms_match_phrase;

alter table public.cards
  add column sms_match_phrases text[] not null default '{}';
