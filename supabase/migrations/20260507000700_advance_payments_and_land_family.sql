-- Advance payments (credit) + land family field

ALTER TABLE public.lands
  ADD COLUMN IF NOT EXISTS family TEXT;

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'bill',
  ADD COLUMN IF NOT EXISTS land_id UUID REFERENCES public.lands(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS landowner_id UUID REFERENCES public.landowners(id) ON DELETE SET NULL;

ALTER TABLE public.payments
  ALTER COLUMN bill_id DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payments_kind_check'
  ) THEN
    ALTER TABLE public.payments
      ADD CONSTRAINT payments_kind_check
      CHECK (kind IN ('bill', 'advance_deposit', 'advance_apply'));
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payments_kind_fk_check'
  ) THEN
    ALTER TABLE public.payments
      DROP CONSTRAINT payments_kind_fk_check;
  END IF;

  ALTER TABLE public.payments
    ADD CONSTRAINT payments_kind_fk_check
    CHECK (
      (kind = 'bill' AND bill_id IS NOT NULL)
      OR (kind = 'advance_apply' AND bill_id IS NOT NULL AND landowner_id IS NOT NULL)
      OR (
        kind = 'advance_deposit'
        AND bill_id IS NULL
        AND land_id IS NOT NULL
        AND landowner_id IS NOT NULL
      )
    );
END $$;

-- Backfill land_id + landowner_id for existing bill payments
UPDATE public.payments p
SET
  land_id = b.land_id,
  landowner_id = l.current_owner_id
FROM public.bills b
JOIN public.lands l ON l.id = b.land_id
WHERE p.bill_id = b.id
  AND (p.land_id IS NULL OR p.landowner_id IS NULL);

CREATE INDEX IF NOT EXISTS idx_payments_land_id ON public.payments(land_id);
CREATE INDEX IF NOT EXISTS idx_payments_landowner_kind ON public.payments(landowner_id, kind);

-- Ensure recompute trigger ignores advance deposits (bill_id NULL)
CREATE OR REPLACE FUNCTION public.recompute_bill_status()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_bill_id UUID;
  v_amount NUMERIC;
  v_paid NUMERIC;
  v_due DATE;
BEGIN
  v_bill_id := COALESCE(NEW.bill_id, OLD.bill_id);
  IF v_bill_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT amount, due_date INTO v_amount, v_due FROM public.bills WHERE id = v_bill_id;
  SELECT COALESCE(SUM(amount), 0) INTO v_paid FROM public.payments WHERE bill_id = v_bill_id;

  UPDATE public.bills SET status = CASE
    WHEN v_paid >= v_amount THEN 'paid'::public.bill_status
    WHEN v_paid > 0 THEN 'partial'::public.bill_status
    WHEN v_due < CURRENT_DATE THEN 'overdue'::public.bill_status
    ELSE 'pending'::public.bill_status
  END
  WHERE id = v_bill_id;

  RETURN NULL;
END;
$$;

-- Advance balance view (credits - debits)
CREATE OR REPLACE VIEW public.landowner_advance_balances
AS
SELECT
  landowner_id,
  (
    COALESCE(SUM(CASE WHEN kind = 'advance_deposit' THEN amount ELSE 0 END), 0)
    - COALESCE(SUM(CASE WHEN kind = 'advance_apply' THEN amount ELSE 0 END), 0)
  )::numeric(12,2) AS balance
FROM public.payments
WHERE landowner_id IS NOT NULL
GROUP BY landowner_id;

GRANT SELECT ON public.landowner_advance_balances TO authenticated;
