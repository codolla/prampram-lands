CREATE TABLE IF NOT EXISTS public.walkin_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('enquiry', 'complaint', 'other')),
  visitor_name text,
  phone text,
  subject text,
  detail text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL
);

ALTER TABLE public.walkin_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "walkin logs read" ON public.walkin_logs;
CREATE POLICY "walkin logs read"
  ON public.walkin_logs FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR public.has_role(auth.uid(), 'frontdesk'::app_role)
  );

DROP POLICY IF EXISTS "walkin logs insert" ON public.walkin_logs;
CREATE POLICY "walkin logs insert"
  ON public.walkin_logs FOR INSERT TO authenticated
  WITH CHECK (
    (public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'manager'::app_role)
      OR public.has_role(auth.uid(), 'frontdesk'::app_role))
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS "walkin logs update" ON public.walkin_logs;
CREATE POLICY "walkin logs update"
  ON public.walkin_logs FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR (public.has_role(auth.uid(), 'frontdesk'::app_role) AND created_by = auth.uid())
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR (public.has_role(auth.uid(), 'frontdesk'::app_role) AND created_by = auth.uid())
  );

DROP POLICY IF EXISTS "walkin logs delete" ON public.walkin_logs;
CREATE POLICY "walkin logs delete"
  ON public.walkin_logs FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
  );

CREATE INDEX IF NOT EXISTS walkin_logs_created_at_idx ON public.walkin_logs (created_at DESC);
