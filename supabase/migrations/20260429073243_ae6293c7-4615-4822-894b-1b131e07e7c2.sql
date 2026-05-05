
-- 1. Create land_types table
CREATE TABLE public.land_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID
);

ALTER TABLE public.land_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "land_types read auth" ON public.land_types
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "land_types admin write" ON public.land_types
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER land_types_set_updated_at
  BEFORE UPDATE ON public.land_types
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. Seed from existing enum values
INSERT INTO public.land_types (name, label, sort_order) VALUES
  ('residential',  'Residential',  10),
  ('commercial',   'Commercial',   20),
  ('agricultural', 'Agricultural', 30),
  ('industrial',   'Industrial',   40),
  ('mixed_use',    'Mixed Use',    50),
  ('other',        'Other',        60);

-- 3. Add new id columns
ALTER TABLE public.lands ADD COLUMN land_type_id UUID REFERENCES public.land_types(id);
ALTER TABLE public.rent_packages ADD COLUMN land_type_id UUID REFERENCES public.land_types(id);

UPDATE public.lands l
  SET land_type_id = lt.id
  FROM public.land_types lt
  WHERE lt.name = l.land_type::text;

UPDATE public.rent_packages p
  SET land_type_id = lt.id
  FROM public.land_types lt
  WHERE lt.name = p.land_type::text;

-- 4. Drop old enum columns
ALTER TABLE public.lands DROP COLUMN land_type;
ALTER TABLE public.rent_packages DROP COLUMN land_type;

-- 5. Make new columns required
ALTER TABLE public.lands ALTER COLUMN land_type_id SET NOT NULL;
ALTER TABLE public.rent_packages ALTER COLUMN land_type_id SET NOT NULL;

-- 6. Restore unique constraint on rent_packages (was on land_type + name)
ALTER TABLE public.rent_packages
  ADD CONSTRAINT rent_packages_land_type_name_unique UNIQUE (land_type_id, name);

-- 7. Drop old enum type
DROP TYPE public.land_type;

-- 8. Block deletion of land types still in use
CREATE OR REPLACE FUNCTION public.prevent_land_type_in_use_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.lands WHERE land_type_id = OLD.id) THEN
    RAISE EXCEPTION 'Cannot delete land type: still in use by one or more lands';
  END IF;
  IF EXISTS (SELECT 1 FROM public.rent_packages WHERE land_type_id = OLD.id) THEN
    RAISE EXCEPTION 'Cannot delete land type: still in use by one or more rent packages';
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER land_types_prevent_delete_if_used
  BEFORE DELETE ON public.land_types
  FOR EACH ROW EXECUTE FUNCTION public.prevent_land_type_in_use_delete();

CREATE INDEX idx_lands_land_type_id ON public.lands(land_type_id);
CREATE INDEX idx_rent_packages_land_type_id ON public.rent_packages(land_type_id);
