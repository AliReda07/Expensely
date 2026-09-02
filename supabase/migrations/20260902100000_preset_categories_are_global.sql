-- A preset category is global by definition: it is seeded with user_id = null and read by
-- every user. Nothing stopped a user inserting their own row with is_preset = true -- the
-- RLS insert policy only checks `auth.uid() = user_id` and never looked at is_preset -- and
-- sms-webhook selects `is_preset.eq.true` across all users when it builds the category set
-- for a message. So one account could inject a category name into every other user's SMS
-- categorization, and the victim's transaction would end up pointing at a category their own
-- RLS select policy ("user_id is null or auth.uid() = user_id") forbids them from reading:
-- it renders as broken/uncategorized in their history with no way to fix it.
--
-- Verified against live data before applying: zero rows had is_preset with a non-null
-- user_id, so this validates against everything already stored.
alter table public.categories
  add constraint preset_categories_are_global
  check (not is_preset or user_id is null);
