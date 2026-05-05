-- Fix mutable search_path on is_authenticated
ALTER FUNCTION public.is_authenticated() SET search_path = public;

-- has_role is invoked by RLS policies; PostgreSQL still allows policy use after EXECUTE is revoked.
-- Lock it down further from authenticated direct calls.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM authenticated;