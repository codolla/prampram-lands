-- Land type enum
CREATE TYPE public.land_type AS ENUM (
  'residential', 'commercial', 'agricultural', 'industrial', 'mixed_use', 'other'
);

ALTER TABLE public.lands
  ADD COLUMN land_type public.land_type NOT NULL DEFAULT 'residential';

-- Rent packages
CREATE TABLE public.rent_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  land_type public.land_type NOT NULL,
  annual_amount NUMERIC(12,2) NOT NULL CHECK (annual_amount >= 0),
  description TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (land_type, name)
);

ALTER TABLE public.rent_packages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rent_packages read auth" ON public.rent_packages
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "rent_packages admin write" ON public.rent_packages
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_rent_packages_updated_at
  BEFORE UPDATE ON public.rent_packages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Link lands to a rent package (optional)
ALTER TABLE public.lands
  ADD COLUMN rent_package_id UUID REFERENCES public.rent_packages(id) ON DELETE SET NULL;

CREATE INDEX idx_lands_rent_package_id ON public.lands(rent_package_id);
CREATE INDEX idx_rent_packages_land_type ON public.rent_packages(land_type);