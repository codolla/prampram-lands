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

  IF v_geom IS NULL THEN
    RETURN;
  END IF;

  v_geom := ST_CollectionExtract(v_geom, 3);

  IF GeometryType(v_geom) = 'MULTIPOLYGON' THEN
    SELECT (d).geom
      INTO v_geom
      FROM (SELECT ST_Dump(v_geom) AS d) x
     ORDER BY ST_Area(((d).geom)::geography) DESC
     LIMIT 1;
  END IF;

  IF v_geom IS NULL OR GeometryType(v_geom) <> 'POLYGON' OR NOT ST_IsValid(v_geom) THEN
    RETURN;
  END IF;

  UPDATE public.lands
     SET boundary = v_geom::geography,
         area_sqm = ST_Area(v_geom::geography),
         boundary_type = COALESCE(boundary_type, 'drawn')
   WHERE id = _land_id;
END;
$$;

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

  v_geom := ST_SetSRID(ST_GeomFromGeoJSON(_geojson::text), 4326);
  IF v_geom IS NULL THEN
    RAISE EXCEPTION 'Could not parse GeoJSON';
  END IF;

  IF GeometryType(v_geom) <> 'POLYGON' THEN
    RAISE EXCEPTION 'GeoJSON must be a Polygon (got %)', GeometryType(v_geom);
  END IF;

  IF NOT ST_IsValid(v_geom) THEN
    v_geom := ST_MakeValid(v_geom);
  END IF;

  v_geom := ST_CollectionExtract(v_geom, 3);
  IF GeometryType(v_geom) = 'MULTIPOLYGON' THEN
    SELECT (d).geom
      INTO v_geom
      FROM (SELECT ST_Dump(v_geom) AS d) x
     ORDER BY ST_Area(((d).geom)::geography) DESC
     LIMIT 1;
  END IF;

  IF v_geom IS NULL OR GeometryType(v_geom) <> 'POLYGON' OR NOT ST_IsValid(v_geom) THEN
    RAISE EXCEPTION 'Polygon could not be repaired';
  END IF;

  v_geog := v_geom::geography;
  v_area := ST_Area(v_geog);

  DELETE FROM public.land_coordinates WHERE land_id = _land_id;

  v_ring := (_geojson->'coordinates')->0;
  FOR i IN 0 .. jsonb_array_length(v_ring) - 1 LOOP
    v_pt := v_ring->i;
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
