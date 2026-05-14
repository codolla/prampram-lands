DO $$
DECLARE
  c text;
BEGIN
  ALTER TABLE public.walkin_logs
    ADD COLUMN IF NOT EXISTS payment_as text;

  SELECT conname INTO c
  FROM pg_constraint
  WHERE conrelid = 'public.walkin_logs'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%kind%in%';

  IF c IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.walkin_logs DROP CONSTRAINT %I', c);
  END IF;

  ALTER TABLE public.walkin_logs
    ADD CONSTRAINT walkin_logs_kind_check
    CHECK (kind IN ('enquiry', 'complaint', 'other', 'payment'));
END $$;
