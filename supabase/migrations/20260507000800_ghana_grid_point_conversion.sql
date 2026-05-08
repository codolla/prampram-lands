CREATE OR REPLACE FUNCTION public.ghana_grid_points_to_wgs84(points jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  out jsonb := '[]'::jsonb;
  p jsonb;
  e double precision;
  n double precision;
  g geometry;
  ll geometry;
BEGIN
  IF points IS NULL OR jsonb_typeof(points) <> 'array' THEN
    RAISE EXCEPTION 'points must be a json array';
  END IF;

  FOR p IN SELECT * FROM jsonb_array_elements(points)
  LOOP
    e := NULL;
    n := NULL;

    IF jsonb_typeof(p) = 'array' THEN
      e := NULLIF(p->>0, '')::double precision;
      n := NULLIF(p->>1, '')::double precision;
    ELSIF jsonb_typeof(p) = 'object' THEN
      e := COALESCE(
        NULLIF(p->>'e', '')::double precision,
        NULLIF(p->>'E', '')::double precision,
        NULLIF(p->>'east', '')::double precision,
        NULLIF(p->>'easting', '')::double precision
      );
      n := COALESCE(
        NULLIF(p->>'n', '')::double precision,
        NULLIF(p->>'N', '')::double precision,
        NULLIF(p->>'north', '')::double precision,
        NULLIF(p->>'northing', '')::double precision
      );
    ELSE
      RAISE EXCEPTION 'invalid point format';
    END IF;

    IF e IS NULL OR n IS NULL THEN
      RAISE EXCEPTION 'each point must include easting and northing';
    END IF;

    g := ST_SetSRID(ST_MakePoint(e, n), 2136);
    ll := ST_Transform(g, 4326);

    out := out || jsonb_build_array(jsonb_build_array(ST_X(ll), ST_Y(ll)));
  END LOOP;

  RETURN out;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ghana_grid_points_to_wgs84(jsonb) TO authenticated;
