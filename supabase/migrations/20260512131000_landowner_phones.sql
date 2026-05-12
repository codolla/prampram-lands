-- Multiple phone numbers per landowner with exactly one primary number.
CREATE TABLE IF NOT EXISTS public.landowner_phones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  landowner_id UUID NOT NULL REFERENCES public.landowners(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (landowner_id, phone)
);

CREATE INDEX IF NOT EXISTS idx_landowner_phones_landowner ON public.landowner_phones(landowner_id);
CREATE INDEX IF NOT EXISTS idx_landowner_phones_phone ON public.landowner_phones(phone);

CREATE UNIQUE INDEX IF NOT EXISTS landowner_phones_one_primary_per_owner
  ON public.landowner_phones(landowner_id)
  WHERE (is_primary = true);

DROP TRIGGER IF EXISTS landowner_phones_updated_at ON public.landowner_phones;
CREATE TRIGGER landowner_phones_updated_at
  BEFORE UPDATE ON public.landowner_phones
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.landowner_phones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "landowner_phones read scoped" ON public.landowner_phones;
CREATE POLICY "landowner_phones read scoped"
  ON public.landowner_phones FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR public.has_role(auth.uid(), 'finance'::app_role)
    OR public.has_role(auth.uid(), 'frontdesk'::app_role)
    OR (public.has_role(auth.uid(), 'staff'::app_role)
        AND public.is_staff_assigned_to_owner(auth.uid(), landowner_id))
  );

DROP POLICY IF EXISTS "landowner_phones insert scoped" ON public.landowner_phones;
CREATE POLICY "landowner_phones insert scoped"
  ON public.landowner_phones FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'staff'::app_role)
    OR public.has_role(auth.uid(), 'finance'::app_role)
    OR public.has_role(auth.uid(), 'frontdesk'::app_role)
  );

DROP POLICY IF EXISTS "landowner_phones update scoped" ON public.landowner_phones;
CREATE POLICY "landowner_phones update scoped"
  ON public.landowner_phones FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'finance'::app_role)
    OR public.has_role(auth.uid(), 'frontdesk'::app_role)
    OR (public.has_role(auth.uid(), 'staff'::app_role)
        AND public.is_staff_assigned_to_owner(auth.uid(), landowner_id))
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'finance'::app_role)
    OR public.has_role(auth.uid(), 'frontdesk'::app_role)
    OR (public.has_role(auth.uid(), 'staff'::app_role)
        AND public.is_staff_assigned_to_owner(auth.uid(), landowner_id))
  );

DROP POLICY IF EXISTS "landowner_phones delete scoped" ON public.landowner_phones;
CREATE POLICY "landowner_phones delete scoped"
  ON public.landowner_phones FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'finance'::app_role)
    OR public.has_role(auth.uid(), 'frontdesk'::app_role)
    OR (public.has_role(auth.uid(), 'staff'::app_role)
        AND public.is_staff_assigned_to_owner(auth.uid(), landowner_id))
  );

DROP POLICY IF EXISTS "developer all" ON public.landowner_phones;
CREATE POLICY "developer all"
  ON public.landowner_phones
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'developer'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'developer'::app_role));

INSERT INTO public.landowner_phones (landowner_id, phone, is_primary)
SELECT id, phone, true
FROM public.landowners
WHERE phone IS NOT NULL AND btrim(phone) <> ''
ON CONFLICT (landowner_id, phone)
DO UPDATE SET is_primary = EXCLUDED.is_primary;

