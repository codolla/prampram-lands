-- Allow front desk to record sms logs (payment notifications) and allow admins to clear logs.
DROP POLICY IF EXISTS "sms_logs insert" ON public.sms_logs;
CREATE POLICY "sms_logs insert" ON public.sms_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'finance'::app_role)
    OR public.has_role(auth.uid(), 'frontdesk'::app_role)
  );

DROP POLICY IF EXISTS "sms_logs delete" ON public.sms_logs;
CREATE POLICY "sms_logs delete" ON public.sms_logs
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
