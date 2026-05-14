ALTER TABLE public.walkin_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "walkin logs read" ON public.walkin_logs;
CREATE POLICY "walkin logs read"
  ON public.walkin_logs FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'developer'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR public.has_role(auth.uid(), 'frontdesk'::app_role)
  );

DROP POLICY IF EXISTS "walkin logs insert" ON public.walkin_logs;
CREATE POLICY "walkin logs insert"
  ON public.walkin_logs FOR INSERT TO authenticated
  WITH CHECK (
    (public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'developer'::app_role)
      OR public.has_role(auth.uid(), 'manager'::app_role)
      OR public.has_role(auth.uid(), 'frontdesk'::app_role))
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS "walkin logs update" ON public.walkin_logs;
CREATE POLICY "walkin logs update"
  ON public.walkin_logs FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'developer'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR (public.has_role(auth.uid(), 'frontdesk'::app_role) AND created_by = auth.uid())
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'developer'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR (public.has_role(auth.uid(), 'frontdesk'::app_role) AND created_by = auth.uid())
  );

DROP POLICY IF EXISTS "walkin logs delete" ON public.walkin_logs;
CREATE POLICY "walkin logs delete"
  ON public.walkin_logs FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'developer'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
  );
