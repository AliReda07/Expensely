-- A dedicated preset category for transfers, so a transfer no longer falls through to
-- a generic bucket (uncategorized, or a coincidental "Other" name match) just because
-- it isn't a purchase at a merchant. detectCategory() in the SMS parser resolves any
-- message matched by looksLikeTransfer() to this category by name.
insert into public.categories (user_id, name, icon, color, is_preset) values
  (null, 'Transfer', 'arrow-left-right', '#6366f1', true);
