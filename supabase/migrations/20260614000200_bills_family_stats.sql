CREATE OR REPLACE FUNCTION public.bills_family_stats(family_text TEXT, status_filter TEXT)
RETURNS TABLE (
  bills_count BIGINT,
  total_billed NUMERIC,
  total_paid NUMERIC,
  total_outstanding NUMERIC,
  pending_count BIGINT,
  partial_count BIGINT,
  paid_count BIGINT,
  overdue_count BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH params AS (
    SELECT
      NULLIF(TRIM(family_text), '') AS fam,
      COALESCE(NULLIF(TRIM(status_filter), ''), 'all') AS st
  ),
  family_bills AS (
    SELECT
      b.id,
      b.amount,
      b.status
    FROM public.bills b
    JOIN public.lands l ON l.id = b.land_id
    CROSS JOIN params p
    WHERE
      (p.fam IS NULL OR l.family = p.fam)
      AND (p.st = 'all' OR b.status::text = p.st)
  ),
  paid AS (
    SELECT
      p.bill_id,
      COALESCE(SUM(p.amount), 0) AS paid_amount
    FROM public.payments p
    WHERE p.bill_id IN (SELECT id FROM family_bills)
    GROUP BY p.bill_id
  )
  SELECT
    COUNT(*) AS bills_count,
    COALESCE(SUM(fb.amount), 0) AS total_billed,
    COALESCE(SUM(COALESCE(p.paid_amount, 0)), 0) AS total_paid,
    COALESCE(SUM(GREATEST(0, fb.amount - COALESCE(p.paid_amount, 0))), 0) AS total_outstanding,
    COALESCE(SUM(CASE WHEN fb.status = 'pending'::public.bill_status THEN 1 ELSE 0 END), 0) AS pending_count,
    COALESCE(SUM(CASE WHEN fb.status = 'partial'::public.bill_status THEN 1 ELSE 0 END), 0) AS partial_count,
    COALESCE(SUM(CASE WHEN fb.status = 'paid'::public.bill_status THEN 1 ELSE 0 END), 0) AS paid_count,
    COALESCE(SUM(CASE WHEN fb.status = 'overdue'::public.bill_status THEN 1 ELSE 0 END), 0) AS overdue_count
  FROM family_bills fb
  LEFT JOIN paid p ON p.bill_id = fb.id;
$$;

GRANT EXECUTE ON FUNCTION public.bills_family_stats(TEXT, TEXT) TO authenticated;
