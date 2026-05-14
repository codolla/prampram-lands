DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_bill_id_fkey') THEN
    ALTER TABLE public.payments DROP CONSTRAINT payments_bill_id_fkey;
  END IF;

  ALTER TABLE public.payments
    ADD CONSTRAINT payments_bill_id_fkey
    FOREIGN KEY (bill_id)
    REFERENCES public.bills(id)
    ON DELETE RESTRICT;

  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bills_land_id_fkey') THEN
    ALTER TABLE public.bills DROP CONSTRAINT bills_land_id_fkey;
  END IF;

  ALTER TABLE public.bills
    ADD CONSTRAINT bills_land_id_fkey
    FOREIGN KEY (land_id)
    REFERENCES public.lands(id)
    ON DELETE RESTRICT;
END $$;
