CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE public.staff_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  boundary geography(Polygon, 4326) NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX staff_zones_boundary_gix ON public.staff_zones USING gist (boundary);
CREATE INDEX staff_zones_active_idx ON public.staff_zones (active);

CREATE TABLE public.staff_zone_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id uuid NOT NULL REFERENCES public.staff_zones(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  UNIQUE (zone_id, user_id)
);

CREATE INDEX staff_zone_assignments_user_idx ON public.staff_zone_assignments (user_id);
CREATE INDEX staff_zone_assignments_zone_idx ON public.staff_zone_assignments (zone_id);

CREATE TABLE public.land_staff_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  land_id uuid NOT NULL,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  UNIQUE (land_id, user_id)
);

CREATE INDEX land_staff_assignments_user_idx ON public.land_staff_assignments (user_id);
CREATE INDEX land_staff_assignments_land_idx ON public.land_staff_assignments (land_id);

CREATE TRIGGER staff_zones_set_updated_at
BEFORE UPDATE ON public.staff_zones
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Helpers: use geometry casts since ST_Contains is geometry-only.
CREATE OR REPLACE FUNCTION public.is_staff_assigned_to_land(_user_id uuid, _land_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.land_staff_assignments lsa
      WHERE lsa.user_id = _user_id
        AND lsa.land_id = _land_id
    )
    OR
    EXISTS (
      SELECT 1
      FROM public.staff_zone_assignments sza
      JOIN public.staff_zones sz ON sz.id = sza.zone_id
      JOIN public.lands l ON l.id = _land_id
      WHERE sza.user_id = _user_id
        AND sz.active = true
        AND (
          (l.boundary IS NOT NULL AND ST_Contains(sz.boundary::geometry, l.boundary::geometry))
          OR (
            l.boundary IS NULL
            AND l.gps_lat IS NOT NULL AND l.gps_lng IS NOT NULL
            AND ST_Contains(
              sz.boundary::geometry,
              ST_SetSRID(ST_MakePoint(l.gps_lng::float8, l.gps_lat::float8), 4326)
            )
          )
        )
    );
$$;

CREATE OR REPLACE FUNCTION public.is_staff_assigned_to_owner(_user_id uuid, _owner_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.lands l
    WHERE l.current_owner_id = _owner_id
      AND public.is_staff_assigned_to_land(_user_id, l.id)
  );
$$;

ALTER TABLE public.staff_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_zone_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.land_staff_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_zones read auth"
  ON public.staff_zones FOR SELECT TO authenticated USING (true);
CREATE POLICY "staff_zones admin write"
  ON public.staff_zones FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "staff_zone_assignments read auth"
  ON public.staff_zone_assignments FOR SELECT TO authenticated USING (true);
CREATE POLICY "staff_zone_assignments admin write"
  ON public.staff_zone_assignments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "land_staff_assignments read auth"
  ON public.land_staff_assignments FOR SELECT TO authenticated USING (true);
CREATE POLICY "land_staff_assignments admin write"
  ON public.land_staff_assignments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "lands read auth" ON public.lands;
DROP POLICY IF EXISTS "lands update" ON public.lands;

CREATE POLICY "lands read scoped"
  ON public.lands FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'finance'::app_role)
    OR (public.has_role(auth.uid(), 'staff'::app_role)
        AND public.is_staff_assigned_to_land(auth.uid(), id))
  );

CREATE POLICY "lands update scoped"
  ON public.lands FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR (public.has_role(auth.uid(), 'staff'::app_role)
        AND public.is_staff_assigned_to_land(auth.uid(), id))
  );

DROP POLICY IF EXISTS "landowners read auth" ON public.landowners;
DROP POLICY IF EXISTS "landowners update" ON public.landowners;

CREATE POLICY "landowners read scoped"
  ON public.landowners FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'finance'::app_role)
    OR (public.has_role(auth.uid(), 'staff'::app_role)
        AND public.is_staff_assigned_to_owner(auth.uid(), id))
  );

CREATE POLICY "landowners update scoped"
  ON public.landowners FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR (public.has_role(auth.uid(), 'staff'::app_role)
        AND public.is_staff_assigned_to_owner(auth.uid(), id))
  );

DROP POLICY IF EXISTS "land_coords read auth" ON public.land_coordinates;

CREATE POLICY "land_coords read scoped"
  ON public.land_coordinates FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'finance'::app_role)
    OR (public.has_role(auth.uid(), 'staff'::app_role)
        AND public.is_staff_assigned_to_land(auth.uid(), land_id))
  );
