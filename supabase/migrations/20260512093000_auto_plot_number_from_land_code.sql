CREATE OR REPLACE FUNCTION public.set_plot_number_from_land_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_suffix text;
BEGIN
  IF NEW.plot_number IS NULL OR btrim(NEW.plot_number) = '' THEN
    v_suffix := NULL;
    IF NEW.land_code IS NOT NULL THEN
      SELECT (regexp_match(NEW.land_code, '([0-9]+)$'))[1] INTO v_suffix;
    END IF;

    IF v_suffix IS NOT NULL THEN
      NEW.plot_number := 'P-' || lpad(v_suffix, 4, '0');
    ELSE
      NEW.plot_number := NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lands_auto_plot_number ON public.lands;

CREATE TRIGGER trg_lands_auto_plot_number
BEFORE INSERT ON public.lands
FOR EACH ROW
EXECUTE FUNCTION public.set_plot_number_from_land_code();

