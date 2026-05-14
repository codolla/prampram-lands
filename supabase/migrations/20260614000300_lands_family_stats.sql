CREATE OR REPLACE FUNCTION public.lands_family_stats(
  family_text TEXT,
  status_filter TEXT,
  search_text TEXT
)
RETURNS TABLE (
  lands_count BIGINT,
  total_annual_rent NUMERIC,
  active_count BIGINT,
  disputed_count BIGINT,
  leased_count BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH params AS (
    SELECT
      NULLIF(TRIM(family_text), '') AS fam,
      COALESCE(NULLIF(TRIM(status_filter), ''), 'all') AS st,
      COALESCE(NULLIF(TRIM(search_text), ''), '') AS q
  ),
  filtered AS (
    SELECT
      l.id,
      l.status,
      COALESCE(l.annual_rent_amount, 0) AS annual_rent_amount
    FROM public.lands l
    CROSS JOIN params p
    WHERE
      (p.fam IS NULL OR l.family = p.fam)
      AND (
        p.q = ''
        OR l.land_code ILIKE ('%' || p.q || '%')
        OR COALESCE(l.plot_number, '') ILIKE ('%' || p.q || '%')
      )
      AND (p.st = 'all' OR l.status::text = p.st)
  )
  SELECT
    COUNT(*) AS lands_count,
    COALESCE(SUM(annual_rent_amount), 0) AS total_annual_rent,
    COALESCE(SUM(CASE WHEN status = 'active'::public.land_status THEN 1 ELSE 0 END), 0) AS active_count,
    COALESCE(SUM(CASE WHEN status = 'disputed'::public.land_status THEN 1 ELSE 0 END), 0) AS disputed_count,
    COALESCE(SUM(CASE WHEN status = 'leased'::public.land_status THEN 1 ELSE 0 END), 0) AS leased_count
  FROM filtered;
$$;

GRANT EXECUTE ON FUNCTION public.lands_family_stats(TEXT, TEXT, TEXT) TO authenticated;
