DROP POLICY IF EXISTS "bills insert" ON public.bills;
CREATE POLICY "bills insert" ON public.bills
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
  );

DROP POLICY IF EXISTS "bills update" ON public.bills;
CREATE POLICY "bills update" ON public.bills
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
  );
