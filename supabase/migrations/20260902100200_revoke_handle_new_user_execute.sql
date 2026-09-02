-- handle_new_user() is SECURITY DEFINER and lives in the API-exposed public schema, so both
-- the anon and authenticated roles could call it over /rest/v1/rpc/handle_new_user. As a
-- trigger function a direct call errors out on the unassigned `new` record rather than doing
-- damage, but it runs as its owner and has no business being in the public API surface at
-- all -- flagged by the Supabase database linter as lints 0028 and 0029.
--
-- This does not affect the on_auth_user_created trigger: trigger invocation does not check
-- the caller's EXECUTE privilege on the trigger function, so new signups still get their
-- profiles row created.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
