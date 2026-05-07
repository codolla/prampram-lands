-- Hide developer profiles/roles/logs from non-developers, while still allowing self-access.
DROP POLICY IF EXISTS "profiles read auth" ON public.profiles;
CREATE POLICY "profiles read auth" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR public.has_role(auth.uid(), 'developer'::app_role)
    OR NOT public.has_role(id, 'developer'::app_role)
  );

DROP POLICY IF EXISTS "user_roles read auth" ON public.user_roles;
CREATE POLICY "user_roles read auth" ON public.user_roles
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'developer'::app_role)
    OR NOT public.has_role(user_id, 'developer'::app_role)
  );

-- Admins should not be able to grant/revoke developer role; only developers can manage developer users.
DROP POLICY IF EXISTS "user_roles admin write" ON public.user_roles;
CREATE POLICY "user_roles admin write" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (
    (public.has_role(auth.uid(), 'admin'::app_role) AND role <> 'developer'::app_role)
    OR public.has_role(auth.uid(), 'developer'::app_role)
  );

DROP POLICY IF EXISTS "user_roles admin update" ON public.user_roles;
CREATE POLICY "user_roles admin update" ON public.user_roles
  FOR UPDATE TO authenticated
  USING (
    (public.has_role(auth.uid(), 'admin'::app_role) AND role <> 'developer'::app_role)
    OR public.has_role(auth.uid(), 'developer'::app_role)
  )
  WITH CHECK (
    (public.has_role(auth.uid(), 'admin'::app_role) AND role <> 'developer'::app_role)
    OR public.has_role(auth.uid(), 'developer'::app_role)
  );

DROP POLICY IF EXISTS "user_roles admin delete" ON public.user_roles;
CREATE POLICY "user_roles admin delete" ON public.user_roles
  FOR DELETE TO authenticated
  USING (
    (public.has_role(auth.uid(), 'admin'::app_role) AND role <> 'developer'::app_role)
    OR public.has_role(auth.uid(), 'developer'::app_role)
  );

DROP POLICY IF EXISTS "activity_logs read" ON public.activity_logs;
CREATE POLICY "activity_logs read" ON public.activity_logs
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'developer'::app_role)
    OR (
      (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role))
      AND (actor_id IS NULL OR NOT public.has_role(actor_id, 'developer'::app_role))
    )
  );

DROP POLICY IF EXISTS "activity_logs delete" ON public.activity_logs;
CREATE POLICY "activity_logs delete" ON public.activity_logs
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'developer'::app_role));

-- Developer should be able to do everything (read/write/delete) across the app.
-- Add "developer all" policies rather than rewriting existing policies.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'app_settings',
    'profiles',
    'user_roles',
    'lands',
    'landowners',
    'bills',
    'payments',
    'ownership_history',
    'land_coordinates',
    'rent_packages',
    'land_types',
    'staff_zones',
    'staff_zone_assignments',
    'land_staff_assignments',
    'sms_logs',
    'walkin_logs',
    'activity_logs',
    'documents',
    'payroll_components',
    'payroll_staff',
    'payroll_staff_components',
    'payroll_runs',
    'payslips'
  ]
  LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', 'developer all', t);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.has_role(auth.uid(), %L::public.app_role)) WITH CHECK (public.has_role(auth.uid(), %L::public.app_role));',
        'developer all',
        t,
        'developer',
        'developer'
      );
    END IF;
  END LOOP;
END $$;

-- Allow developers to clear SMS logs too.
DROP POLICY IF EXISTS "sms_logs delete developer" ON public.sms_logs;
CREATE POLICY "sms_logs delete developer" ON public.sms_logs
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'developer'::app_role));

-- Storage: land documents bucket
DROP POLICY IF EXISTS "land-docs developer all" ON storage.objects;
CREATE POLICY "land-docs developer all"
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'land-documents' AND public.has_role(auth.uid(), 'developer'::app_role))
  WITH CHECK (bucket_id = 'land-documents' AND public.has_role(auth.uid(), 'developer'::app_role));
