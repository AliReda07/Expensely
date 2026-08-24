-- The bank's SMS sender name/hotline, e.g. "HSBC" or a shortcode. Used by the SMS
-- webhook only as a fallback card match when a bank's SMS never includes the card's
-- last 4 digits -- and only when exactly one of the user's cards has that sender.
alter table public.cards
  add column bank_sender text;
