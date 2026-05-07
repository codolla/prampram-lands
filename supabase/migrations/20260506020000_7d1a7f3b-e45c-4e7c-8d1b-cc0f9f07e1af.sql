DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'land_code_seq') THEN
    CREATE SEQUENCE public.land_code_seq;
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.generate_land_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next bigint;
  v_code text;
BEGIN
  LOOP
    v_next := nextval('public.land_code_seq');
    v_code := 'PCLS-' || to_char(now(), 'YYYY') || '-' || lpad(v_next::text, 4, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.lands WHERE land_code = v_code);
  END LOOP;
  RETURN v_code;
END;
$$;

DO $$
DECLARE
  v_next bigint;
BEGIN
  SELECT
    COALESCE(
      MAX((regexp_match(land_code, '^PCLS-[0-9]{4}-([0-9]+)$'))[1]::bigint),
      0
    ) + 1
  INTO v_next
  FROM public.lands;

  PERFORM setval('public.land_code_seq', v_next, false);
END
$$;

ALTER TABLE public.lands
  ALTER COLUMN land_code SET DEFAULT public.generate_land_code();
