
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, anon, service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='is_staff_assigned_to_land') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.is_staff_assigned_to_land(uuid, uuid) TO authenticated, anon, service_role';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='is_staff_assigned_to_owner') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.is_staff_assigned_to_owner(uuid, uuid) TO authenticated, anon, service_role';
  END IF;
END $$;
