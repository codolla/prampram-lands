-- 1. Enable PostGIS
CREATE EXTENSION IF NOT EXISTS postgis;

-- 2. Add columns to lands
ALTER TABLE public.lands
  ADD COLUMN IF NOT EXISTS boundary geography(Polygon, 4326),
  ADD COLUMN IF NOT EXISTS area_sqm double precision,
  ADD COLUMN IF NOT EXISTS boundary_type text
    CHECK (boundary_type IN ('survey', 'drawn'));

-- 3. Spatial index
CREATE INDEX IF NOT EXISTS lands_boundary_gix
  ON public.lands USING GIST (boundary);

-- 4. Helper: rebuild boundary from land_coordinates rows for a land
CREATE OR REPLACE FUNCTION public.rebuild_land_boundary_from_coords(_land_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_geom geometry;
  v_count int;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.land_coordinates WHERE land_id = _land_id;

  IF v_count < 3 THEN
    UPDATE public.lands
       SET boundary = NULL, area_sqm = NULL
     WHERE id = _land_id;
    RETURN;
  END IF;

  -- Build a closed ring from ordered coords
  WITH ordered AS (
    SELECT lng::double precision AS lng, lat::double precision AS lat, seq
      FROM public.land_coordinates
     WHERE land_id = _land_id
     ORDER BY seq
  ),
  closed AS (
    SELECT array_agg(ST_MakePoint(lng, lat) ORDER BY seq) AS pts
      FROM ordered
  )
  SELECT ST_MakeValid(
    ST_SetSRID(
      ST_MakePolygon(
        ST_MakeLine(
          CASE
            WHEN (pts[1] <-> pts[array_length(pts,1)]) = 0 THEN pts
            ELSE pts || pts[1:1]
          END
        )
      ),
      4326
    )
  ) INTO v_geom
  FROM closed;

  IF v_geom IS NULL OR NOT ST_IsValid(v_geom) THEN
    RETURN;
  END IF;

  UPDATE public.lands
     SET boundary = v_geom::geography,
         area_sqm = ST_Area(v_geom::geography),
         boundary_type = COALESCE(boundary_type, 'drawn')
   WHERE id = _land_id;
END;
$$;

-- 5. Trigger on land_coordinates -> sync boundary
CREATE OR REPLACE FUNCTION public.sync_boundary_from_coords()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_land_id uuid;
BEGIN
  v_land_id := COALESCE(NEW.land_id, OLD.land_id);
  PERFORM public.rebuild_land_boundary_from_coords(v_land_id);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS land_coordinates_sync_boundary ON public.land_coordinates;
CREATE TRIGGER land_coordinates_sync_boundary
AFTER INSERT OR UPDATE OR DELETE ON public.land_coordinates
FOR EACH ROW EXECUTE FUNCTION public.sync_boundary_from_coords();

-- 6. Helper: replace coordinates from a GeoJSON polygon (used by survey/drawn save path)
CREATE OR REPLACE FUNCTION public.set_land_boundary_from_geojson(
  _land_id uuid,
  _geojson jsonb,
  _boundary_type text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_geom geometry;
  v_geog geography;
  v_area double precision;
  v_ring jsonb;
  v_pt jsonb;
  v_seq int := 1;
BEGIN
  IF _boundary_type NOT IN ('survey', 'drawn') THEN
    RAISE EXCEPTION 'Invalid boundary_type: %', _boundary_type;
  END IF;

  -- Parse + validate
  v_geom := ST_SetSRID(ST_GeomFromGeoJSON(_geojson::text), 4326);
  IF v_geom IS NULL THEN
    RAISE EXCEPTION 'Could not parse GeoJSON';
  END IF;
  IF GeometryType(v_geom) <> 'POLYGON' THEN
    RAISE EXCEPTION 'GeoJSON must be a Polygon (got %)', GeometryType(v_geom);
  END IF;
  IF NOT ST_IsValid(v_geom) THEN
    v_geom := ST_MakeValid(v_geom);
    IF GeometryType(v_geom) <> 'POLYGON' THEN
      RAISE EXCEPTION 'Polygon could not be repaired';
    END IF;
  END IF;

  v_geog := v_geom::geography;
  v_area := ST_Area(v_geog);

  -- Replace land_coordinates rows (suspend trigger by direct delete/insert is fine;
  -- the trigger will re-run rebuild but result will match what we set explicitly)
  DELETE FROM public.land_coordinates WHERE land_id = _land_id;

  v_ring := (_geojson->'coordinates')->0;
  FOR i IN 0 .. jsonb_array_length(v_ring) - 1 LOOP
    v_pt := v_ring->i;
    -- Skip the closing duplicate point so seq mirrors unique vertices
    IF i = jsonb_array_length(v_ring) - 1 AND v_ring->0 = v_pt THEN
      EXIT;
    END IF;
    INSERT INTO public.land_coordinates (land_id, seq, lat, lng)
    VALUES (_land_id, v_seq, (v_pt->>1)::numeric, (v_pt->>0)::numeric);
    v_seq := v_seq + 1;
  END LOOP;

  UPDATE public.lands
     SET boundary = v_geog,
         area_sqm = v_area,
         boundary_type = _boundary_type,
         updated_at = now()
   WHERE id = _land_id;

  RETURN jsonb_build_object('area_sqm', v_area, 'boundary_type', _boundary_type);
END;
$$;

-- 7. Overlap detection helper
CREATE OR REPLACE FUNCTION public.find_overlapping_lands(_geojson jsonb, _exclude_land_id uuid DEFAULT NULL)
RETURNS TABLE(land_id uuid, land_code text, overlap_sqm double precision)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_geom geometry;
BEGIN
  v_geom := ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(_geojson::text), 4326));
  RETURN QUERY
  SELECT l.id, l.land_code,
         ST_Area(ST_Intersection(l.boundary::geometry, v_geom)::geography) AS overlap_sqm
    FROM public.lands l
   WHERE l.boundary IS NOT NULL
     AND (_exclude_land_id IS NULL OR l.id <> _exclude_land_id)
     AND ST_Intersects(l.boundary::geometry, v_geom)
   ORDER BY overlap_sqm DESC;
END;
$$;

-- 8. Backfill boundary for existing lands with coordinate rows
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT DISTINCT land_id FROM public.land_coordinates
  LOOP
    PERFORM public.rebuild_land_boundary_from_coords(r.land_id);
  END LOOP;
END;
$$;

-- 9. Grant execute on the RPCs we'll call from the client (RLS on lands still applies to UPDATEs)
GRANT EXECUTE ON FUNCTION public.set_land_boundary_from_geojson(uuid, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.find_overlapping_lands(jsonb, uuid) TO authenticated;