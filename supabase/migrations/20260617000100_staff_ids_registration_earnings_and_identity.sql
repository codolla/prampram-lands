CREATE OR REPLACE FUNCTION public.normalize_identity(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(regexp_replace(lower(btrim(input)), '[^a-z0-9]', '', 'g'), '');
$$;
 
ALTER TABLE public.landowners
  ADD COLUMN IF NOT EXISTS identity_type text,
  ADD COLUMN IF NOT EXISTS identity_number text,
  ADD COLUMN IF NOT EXISTS identity_number_norm text;
 
CREATE OR REPLACE FUNCTION public.landowners_set_identity_norm()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.identity_number IS NULL OR btrim(NEW.identity_number) = '' THEN
    IF NEW.national_id IS NOT NULL AND btrim(NEW.national_id) <> '' THEN
      NEW.identity_number := NEW.national_id;
    END IF;
  END IF;
 
  IF NEW.identity_number IS NOT NULL AND btrim(NEW.identity_number) <> '' THEN
    NEW.identity_number_norm := public.normalize_identity(NEW.identity_number);
  ELSE
    NEW.identity_number_norm := NULL;
  END IF;
 
  RETURN NEW;
END;
$$;
 
DROP TRIGGER IF EXISTS trg_landowners_identity_norm ON public.landowners;
CREATE TRIGGER trg_landowners_identity_norm
  BEFORE INSERT OR UPDATE ON public.landowners
  FOR EACH ROW
  EXECUTE FUNCTION public.landowners_set_identity_norm();
 
CREATE UNIQUE INDEX IF NOT EXISTS landowners_identity_number_norm_uniq
  ON public.landowners(identity_number_norm)
  WHERE identity_number_norm IS NOT NULL;
 
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'landowners_identity_required'
  ) THEN
    ALTER TABLE public.landowners
      ADD CONSTRAINT landowners_identity_required
      CHECK (
        (identity_type IS NOT NULL AND identity_number IS NOT NULL)
        OR (national_id IS NOT NULL AND btrim(national_id) <> '')
      )
      NOT VALID;
  END IF;
END $$;
 
CREATE SEQUENCE IF NOT EXISTS public.staff_employee_seq;
 
CREATE OR REPLACE FUNCTION public.next_staff_employee_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n bigint;
BEGIN
  SELECT nextval('public.staff_employee_seq') INTO n;
  RETURN 'STF' || lpad(n::text, 6, '0');
END;
$$;
 
CREATE OR REPLACE FUNCTION public.ensure_payroll_staff_for_user(_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff_id uuid;
  v_name text;
  v_emp text;
BEGIN
  SELECT id INTO v_staff_id FROM public.payroll_staff WHERE user_id = _user_id LIMIT 1;
 
  IF v_staff_id IS NOT NULL THEN
    UPDATE public.payroll_staff
      SET employee_number = COALESCE(employee_number, public.next_staff_employee_number())
      WHERE id = v_staff_id AND employee_number IS NULL;
    RETURN v_staff_id;
  END IF;
 
  SELECT COALESCE(NULLIF(btrim(full_name), ''), NULLIF(btrim(email), ''), 'Staff')
    INTO v_name
  FROM public.profiles
  WHERE id = _user_id;
 
  v_emp := public.next_staff_employee_number();
 
  INSERT INTO public.payroll_staff (user_id, full_name, employee_number, base_salary, active)
  VALUES (_user_id, v_name, v_emp, 0, true)
  RETURNING id INTO v_staff_id;
 
  RETURN v_staff_id;
END;
$$;
 
CREATE OR REPLACE FUNCTION public.trg_user_roles_ensure_staff()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.ensure_payroll_staff_for_user(NEW.user_id);
  RETURN NEW;
END;
$$;
 
DROP TRIGGER IF EXISTS trg_user_roles_ensure_staff ON public.user_roles;
CREATE TRIGGER trg_user_roles_ensure_staff
  AFTER INSERT ON public.user_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_user_roles_ensure_staff();
 
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN (SELECT DISTINCT user_id FROM public.user_roles) LOOP
    PERFORM public.ensure_payroll_staff_for_user(r.user_id);
  END LOOP;
 
  UPDATE public.payroll_staff
    SET employee_number = public.next_staff_employee_number()
    WHERE employee_number IS NULL;
END $$;
 
CREATE TABLE IF NOT EXISTS public.registration_assists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.payroll_staff(id) ON DELETE CASCADE,
  landowner_id uuid NOT NULL REFERENCES public.landowners(id) ON DELETE CASCADE,
  amount numeric NOT NULL DEFAULT 10,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (staff_id, landowner_id)
);
 
CREATE INDEX IF NOT EXISTS idx_registration_assists_staff_time
  ON public.registration_assists(staff_id, created_at DESC);
 
ALTER TABLE public.registration_assists ENABLE ROW LEVEL SECURITY;
 
CREATE POLICY "registration_assists read admin/finance/manager"
  ON public.registration_assists FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'developer'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR public.has_role(auth.uid(), 'finance'::app_role)
  );
 
CREATE POLICY "registration_assists read own"
  ON public.registration_assists FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.payroll_staff ps
      WHERE ps.id = staff_id
        AND ps.user_id = auth.uid()
    )
  );
 
CREATE POLICY "registration_assists insert admin/frontdesk"
  ON public.registration_assists FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'developer'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR public.has_role(auth.uid(), 'frontdesk'::app_role)
  );
 
CREATE POLICY "registration_assists insert own staff"
  ON public.registration_assists FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'staff'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.payroll_staff ps
      WHERE ps.id = staff_id
        AND ps.user_id = auth.uid()
    )
  );
 
DROP FUNCTION IF EXISTS public.landowners_search(text, text, integer, integer);

CREATE OR REPLACE FUNCTION public.landowners_search(
  search_text TEXT,
  filter_mode TEXT,
  page_number INTEGER,
  page_size INTEGER
)
RETURNS TABLE (
  id UUID,
  full_name TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  identity_type TEXT,
  identity_number TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ,
  has_land BOOLEAN,
  total_count BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH params AS (
    SELECT
      COALESCE(TRIM(search_text), '') AS q,
      regexp_replace(COALESCE(TRIM(search_text), ''), '\D', '', 'g') AS q_phone,
      public.normalize_identity(COALESCE(TRIM(search_text), '')) AS q_id,
      GREATEST(1, COALESCE(page_number, 1)) AS p,
      GREATEST(1, COALESCE(page_size, 25)) AS s,
      COALESCE(NULLIF(TRIM(filter_mode), ''), 'all') AS f
  ),
  base AS (
    SELECT
      lo.id,
      lo.full_name,
      COALESCE(p.primary_phone, lo.phone) AS phone,
      lo.email,
      lo.address,
      lo.identity_type,
      COALESCE(lo.identity_number, lo.national_id) AS identity_number,
      lo.avatar_url,
      lo.created_at,
      EXISTS (
        SELECT 1
        FROM public.lands l
        WHERE l.current_owner_id = lo.id
      ) AS has_land
    FROM public.landowners lo
    LEFT JOIN LATERAL (
      SELECT lp.phone AS primary_phone
      FROM public.landowner_phones lp
      WHERE lp.landowner_id = lo.id AND lp.is_primary = true
      ORDER BY lp.phone
      LIMIT 1
    ) p ON true
    CROSS JOIN params pr
    WHERE
      pr.q = ''
      OR (
        lo.full_name ILIKE ('%' || pr.q || '%')
        OR COALESCE(lo.email, '') ILIKE ('%' || pr.q || '%')
        OR (
          pr.q_phone <> ''
          AND regexp_replace(COALESCE(lo.phone, ''), '\D', '', 'g') ILIKE ('%' || pr.q_phone || '%')
        )
        OR (
          pr.q_phone <> ''
          AND EXISTS (
            SELECT 1
            FROM public.landowner_phones lp
            WHERE lp.landowner_id = lo.id
              AND regexp_replace(lp.phone, '\D', '', 'g') ILIKE ('%' || pr.q_phone || '%')
          )
        )
        OR (
          pr.q_id IS NOT NULL
          AND (
            lo.identity_number_norm = pr.q_id
            OR public.normalize_identity(lo.national_id) = pr.q_id
          )
        )
      )
  )
  SELECT
    b.*,
    COUNT(*) OVER() AS total_count
  FROM base b
  CROSS JOIN params pr
  WHERE
    pr.f = 'all'
    OR (pr.f = 'linked' AND b.has_land = true)
    OR (pr.f = 'unlinked' AND b.has_land = false)
  ORDER BY b.full_name ASC
  OFFSET ((SELECT (p - 1) * s FROM params))
  LIMIT (SELECT s FROM params);
$$;
 
CREATE OR REPLACE FUNCTION public.landowners_search_stats(search_text TEXT)
RETURNS TABLE (
  linked_count BIGINT,
  unlinked_count BIGINT,
  total_count BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH params AS (
    SELECT
      COALESCE(TRIM(search_text), '') AS q,
      regexp_replace(COALESCE(TRIM(search_text), ''), '\D', '', 'g') AS q_phone,
      public.normalize_identity(COALESCE(TRIM(search_text), '')) AS q_id
  ),
  matched AS (
    SELECT
      lo.id,
      EXISTS (
        SELECT 1
        FROM public.lands l
        WHERE l.current_owner_id = lo.id
      ) AS has_land
    FROM public.landowners lo
    CROSS JOIN params pr
    WHERE
      pr.q = ''
      OR (
        lo.full_name ILIKE ('%' || pr.q || '%')
        OR COALESCE(lo.email, '') ILIKE ('%' || pr.q || '%')
        OR (
          pr.q_phone <> ''
          AND regexp_replace(COALESCE(lo.phone, ''), '\D', '', 'g') ILIKE ('%' || pr.q_phone || '%')
        )
        OR (
          pr.q_phone <> ''
          AND EXISTS (
            SELECT 1
            FROM public.landowner_phones lp
            WHERE lp.landowner_id = lo.id
              AND regexp_replace(lp.phone, '\D', '', 'g') ILIKE ('%' || pr.q_phone || '%')
          )
        )
        OR (
          pr.q_id IS NOT NULL
          AND (
            lo.identity_number_norm = pr.q_id
            OR public.normalize_identity(lo.national_id) = pr.q_id
          )
        )
      )
  )
  SELECT
    COALESCE(SUM(CASE WHEN has_land THEN 1 ELSE 0 END), 0) AS linked_count,
    COALESCE(SUM(CASE WHEN has_land THEN 0 ELSE 1 END), 0) AS unlinked_count,
    COUNT(*) AS total_count
  FROM matched;
$$;
