-- Frontdesk should only handle logbooks (walkin_logs). Remove frontdesk access from core records.

-- lands
DROP POLICY IF EXISTS "lands insert" ON public.lands;
CREATE POLICY "lands insert"
  ON public.lands FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'staff'::app_role)
    OR public.has_role(auth.uid(), 'finance'::app_role)
  );

DROP POLICY IF EXISTS "lands read scoped" ON public.lands;
CREATE POLICY "lands read scoped"
  ON public.lands FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR public.has_role(auth.uid(), 'finance'::app_role)
    OR (public.has_role(auth.uid(), 'staff'::app_role)
        AND public.is_staff_assigned_to_land(auth.uid(), id))
  );

DROP POLICY IF EXISTS "lands update scoped" ON public.lands;
CREATE POLICY "lands update scoped"
  ON public.lands FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'finance'::app_role)
    OR (public.has_role(auth.uid(), 'staff'::app_role)
        AND public.is_staff_assigned_to_land(auth.uid(), id))
  );

-- landowners
DROP POLICY IF EXISTS "landowners insert" ON public.landowners;
CREATE POLICY "landowners insert"
  ON public.landowners FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'staff'::app_role)
    OR public.has_role(auth.uid(), 'finance'::app_role)
  );

DROP POLICY IF EXISTS "landowners read scoped" ON public.landowners;
CREATE POLICY "landowners read scoped"
  ON public.landowners FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR public.has_role(auth.uid(), 'finance'::app_role)
    OR (public.has_role(auth.uid(), 'staff'::app_role)
        AND public.is_staff_assigned_to_owner(auth.uid(), id))
  );

DROP POLICY IF EXISTS "landowners update scoped" ON public.landowners;
CREATE POLICY "landowners update scoped"
  ON public.landowners FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'finance'::app_role)
    OR (public.has_role(auth.uid(), 'staff'::app_role)
        AND public.is_staff_assigned_to_owner(auth.uid(), id))
  );

-- payments: remove frontdesk insert/update and block frontdesk-only reads
DROP POLICY IF EXISTS "payments insert" ON public.payments;
CREATE POLICY "payments insert"
  ON public.payments FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'finance'::app_role)
  );

DROP POLICY IF EXISTS "payments update" ON public.payments;
CREATE POLICY "payments update"
  ON public.payments FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'finance'::app_role)
  );

DROP POLICY IF EXISTS "payments read auth" ON public.payments;
CREATE POLICY "payments read scoped" ON public.payments
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR public.has_role(auth.uid(), 'finance'::app_role)
    OR public.has_role(auth.uid(), 'staff'::app_role)
  );

-- bills: block frontdesk-only reads
DROP POLICY IF EXISTS "bills read auth" ON public.bills;
CREATE POLICY "bills read scoped" ON public.bills
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR public.has_role(auth.uid(), 'finance'::app_role)
    OR public.has_role(auth.uid(), 'staff'::app_role)
  );

-- sms_logs: remove frontdesk insert and block frontdesk-only reads
DROP POLICY IF EXISTS "sms_logs insert" ON public.sms_logs;
CREATE POLICY "sms_logs insert" ON public.sms_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'finance'::app_role)
  );

DROP POLICY IF EXISTS "sms_logs read auth" ON public.sms_logs;
CREATE POLICY "sms_logs read scoped" ON public.sms_logs
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR public.has_role(auth.uid(), 'finance'::app_role)
  );

