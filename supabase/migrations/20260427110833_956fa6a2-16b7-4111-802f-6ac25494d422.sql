-- set_updated_at: trigger-only, no need for users to call it
ALTER FUNCTION public.set_updated_at() SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;

-- handle_new_user: trigger fired by auth.users insert
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- track_ownership_change: trigger only
REVOKE EXECUTE ON FUNCTION public.track_ownership_change() FROM PUBLIC, anon, authenticated;

-- recompute_bill_status: trigger only
REVOKE EXECUTE ON FUNCTION public.recompute_bill_status() FROM PUBLIC, anon, authenticated;

-- has_role: needed inside RLS policies (which run with the caller's role).
-- Restrict to authenticated only.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;

-- is_authenticated: keep available to authenticated only
REVOKE EXECUTE ON FUNCTION public.is_authenticated() FROM PUBLIC, anon;