-- A short phrase that appears in this bank's SMS template (e.g. "مسبقة الدفع" for a
-- prepaid card's transfer notifications). A second fallback for the same problem as
-- bank_sender -- resolving a card when its SMS never print the last 4 digits -- for
-- when per-bank Sender-based automation isn't practical on the phone (many banks send
-- from an alphanumeric Sender ID that iOS Shortcuts cannot filter a contact by).
-- Matched against the message body itself, so it needs no phone-side setup at all.
alter table public.cards
  add column sms_match_phrase text;
