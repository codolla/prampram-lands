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
  national_id TEXT,
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
      lo.national_id,
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
      regexp_replace(COALESCE(TRIM(search_text), ''), '\D', '', 'g') AS q_phone
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
      )
  )
  SELECT
    COALESCE(SUM(CASE WHEN has_land THEN 1 ELSE 0 END), 0) AS linked_count,
    COALESCE(SUM(CASE WHEN has_land THEN 0 ELSE 1 END), 0) AS unlinked_count,
    COUNT(*) AS total_count
  FROM matched;
$$;

GRANT EXECUTE ON FUNCTION public.landowners_search(TEXT, TEXT, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.landowners_search_stats(TEXT) TO authenticated;
