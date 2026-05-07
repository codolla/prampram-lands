DROP POLICY IF EXISTS "lands insert" ON public.lands;
CREATE POLICY "lands insert"
  ON public.lands FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'staff'::app_role)
    OR public.has_role(auth.uid(), 'finance'::app_role)
    OR public.has_role(auth.uid(), 'frontdesk'::app_role)
  );

DROP POLICY IF EXISTS "lands read scoped" ON public.lands;
CREATE POLICY "lands read scoped"
  ON public.lands FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR public.has_role(auth.uid(), 'finance'::app_role)
    OR public.has_role(auth.uid(), 'frontdesk'::app_role)
    OR (public.has_role(auth.uid(), 'staff'::app_role)
        AND public.is_staff_assigned_to_land(auth.uid(), id))
  );

DROP POLICY IF EXISTS "lands update scoped" ON public.lands;
CREATE POLICY "lands update scoped"
  ON public.lands FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'finance'::app_role)
    OR public.has_role(auth.uid(), 'frontdesk'::app_role)
    OR (public.has_role(auth.uid(), 'staff'::app_role)
        AND public.is_staff_assigned_to_land(auth.uid(), id))
  );

DROP POLICY IF EXISTS "landowners insert" ON public.landowners;
CREATE POLICY "landowners insert"
  ON public.landowners FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'staff'::app_role)
    OR public.has_role(auth.uid(), 'finance'::app_role)
    OR public.has_role(auth.uid(), 'frontdesk'::app_role)
  );

DROP POLICY IF EXISTS "landowners read scoped" ON public.landowners;
CREATE POLICY "landowners read scoped"
  ON public.landowners FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR public.has_role(auth.uid(), 'finance'::app_role)
    OR public.has_role(auth.uid(), 'frontdesk'::app_role)
    OR (public.has_role(auth.uid(), 'staff'::app_role)
        AND public.is_staff_assigned_to_owner(auth.uid(), id))
  );

DROP POLICY IF EXISTS "landowners update scoped" ON public.landowners;
CREATE POLICY "landowners update scoped"
  ON public.landowners FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'finance'::app_role)
    OR public.has_role(auth.uid(), 'frontdesk'::app_role)
    OR (public.has_role(auth.uid(), 'staff'::app_role)
        AND public.is_staff_assigned_to_owner(auth.uid(), id))
  );

DROP POLICY IF EXISTS "payments insert" ON public.payments;
CREATE POLICY "payments insert"
  ON public.payments FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'finance'::app_role)
    OR public.has_role(auth.uid(), 'frontdesk'::app_role)
  );

DROP POLICY IF EXISTS "payments update" ON public.payments;
CREATE POLICY "payments update"
  ON public.payments FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'finance'::app_role)
    OR public.has_role(auth.uid(), 'frontdesk'::app_role)
  );
