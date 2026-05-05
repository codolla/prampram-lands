-- Add a JSON copy of the outer ring for easy client-side rendering.
ALTER TABLE public.staff_zones
  ADD COLUMN IF NOT EXISTS ring jsonb;

CREATE OR REPLACE FUNCTION public.upsert_staff_zone(
  _id uuid,
  _name text,
  _description text,
  _active boolean,
  _ring jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_geog geography(Polygon, 4326);
  v_geom geometry;
  v_pts text;
  v_first_lng float8;
  v_first_lat float8;
  v_last_lng float8;
  v_last_lat float8;
  v_ring jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'admin role required';
  END IF;

  IF jsonb_array_length(_ring) < 3 THEN
    RAISE EXCEPTION 'zone polygon needs at least 3 points';
  END IF;

  v_ring := _ring;
  v_first_lng := (v_ring->0->>0)::float8;
  v_first_lat := (v_ring->0->>1)::float8;
  v_last_lng  := (v_ring->(jsonb_array_length(v_ring)-1)->>0)::float8;
  v_last_lat  := (v_ring->(jsonb_array_length(v_ring)-1)->>1)::float8;
  IF v_first_lng <> v_last_lng OR v_first_lat <> v_last_lat THEN
    v_ring := v_ring || jsonb_build_array(jsonb_build_array(v_first_lng, v_first_lat));
  END IF;

  SELECT string_agg((p->>0) || ' ' || (p->>1), ',' ORDER BY ord)
  INTO v_pts
  FROM jsonb_array_elements(v_ring) WITH ORDINALITY AS t(p, ord);

  v_geom := ST_MakeValid(ST_GeomFromText('POLYGON((' || v_pts || '))', 4326));
  IF GeometryType(v_geom) <> 'POLYGON' THEN
    RAISE EXCEPTION 'invalid polygon geometry';
  END IF;
  v_geog := v_geom::geography;

  IF _id IS NULL THEN
    INSERT INTO public.staff_zones (name, description, active, boundary, ring, created_by)
    VALUES (_name, _description, COALESCE(_active, true), v_geog, v_ring, auth.uid())
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.staff_zones
       SET name = _name,
           description = _description,
           active = COALESCE(_active, active),
           boundary = v_geog,
           ring = v_ring,
           updated_at = now()
     WHERE id = _id
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'zone % not found', _id;
    END IF;
  END IF;

  RETURN v_id;
END;
$$;
