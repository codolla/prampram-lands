-- =========================================================================
-- ENUMS
-- =========================================================================
CREATE TYPE public.app_role AS ENUM ('admin', 'staff', 'finance');
CREATE TYPE public.land_status AS ENUM ('active', 'disputed', 'leased');
CREATE TYPE public.size_unit AS ENUM ('acres', 'hectares');
CREATE TYPE public.bill_status AS ENUM ('pending', 'partial', 'paid', 'overdue');
CREATE TYPE public.payment_method AS ENUM ('cash', 'momo', 'bank');
CREATE TYPE public.document_kind AS ENUM ('indenture', 'agreement', 'receipt', 'other');

-- =========================================================================
-- updated_at helper
-- =========================================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- =========================================================================
-- profiles
-- =========================================================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  phone TEXT,
  avatar_url TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================================
-- user_roles + has_role()
-- =========================================================================
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
CREATE INDEX idx_user_roles_user ON public.user_roles(user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
$$;

CREATE OR REPLACE FUNCTION public.is_authenticated()
RETURNS BOOLEAN LANGUAGE SQL STABLE AS $$
  SELECT auth.uid() IS NOT NULL;
$$;

-- =========================================================================
-- handle_new_user — create profile + assign role on signup
-- (admin@example.com -> admin, everyone else -> staff)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.email
  );

  IF lower(NEW.email) = 'admin@example.com' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin')
      ON CONFLICT DO NOTHING;
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'staff')
      ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =========================================================================
-- landowners
-- =========================================================================
CREATE TABLE public.landowners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  national_id TEXT,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_landowners_name ON public.landowners(full_name);
CREATE TRIGGER landowners_updated_at BEFORE UPDATE ON public.landowners
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================================
-- lands
-- =========================================================================
CREATE TABLE public.lands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  land_code TEXT NOT NULL UNIQUE,
  plot_number TEXT,
  size_value NUMERIC(12,4),
  size_unit public.size_unit NOT NULL DEFAULT 'acres',
  location_description TEXT,
  gps_lat NUMERIC(10,7),
  gps_lng NUMERIC(10,7),
  status public.land_status NOT NULL DEFAULT 'active',
  current_owner_id UUID REFERENCES public.landowners(id) ON DELETE SET NULL,
  annual_rent_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_lands_owner ON public.lands(current_owner_id);
CREATE INDEX idx_lands_status ON public.lands(status);
CREATE TRIGGER lands_updated_at BEFORE UPDATE ON public.lands
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================================
-- land_coordinates (polygon points, ordered by seq)
-- =========================================================================
CREATE TABLE public.land_coordinates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  land_id UUID NOT NULL REFERENCES public.lands(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  lat NUMERIC(10,7) NOT NULL,
  lng NUMERIC(10,7) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (land_id, seq)
);
CREATE INDEX idx_land_coords_land ON public.land_coordinates(land_id);

-- =========================================================================
-- ownership_history
-- =========================================================================
CREATE TABLE public.ownership_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  land_id UUID NOT NULL REFERENCES public.lands(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES public.landowners(id) ON DELETE RESTRICT,
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE,
  transfer_note TEXT,
  recorded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ownership_land ON public.ownership_history(land_id);
CREATE INDEX idx_ownership_owner ON public.ownership_history(owner_id);

-- Trigger: when lands.current_owner_id changes, close prior history row + open new one
CREATE OR REPLACE FUNCTION public.track_ownership_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.current_owner_id IS NOT NULL THEN
      INSERT INTO public.ownership_history (land_id, owner_id, start_date)
      VALUES (NEW.id, NEW.current_owner_id, CURRENT_DATE);
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.current_owner_id IS DISTINCT FROM OLD.current_owner_id THEN
      UPDATE public.ownership_history
        SET end_date = CURRENT_DATE
        WHERE land_id = NEW.id AND owner_id = OLD.current_owner_id AND end_date IS NULL;
      IF NEW.current_owner_id IS NOT NULL THEN
        INSERT INTO public.ownership_history (land_id, owner_id, start_date)
        VALUES (NEW.id, NEW.current_owner_id, CURRENT_DATE);
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER lands_track_owner
  AFTER INSERT OR UPDATE OF current_owner_id ON public.lands
  FOR EACH ROW EXECUTE FUNCTION public.track_ownership_change();

-- =========================================================================
-- bills
-- =========================================================================
CREATE TABLE public.bills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  land_id UUID NOT NULL REFERENCES public.lands(id) ON DELETE CASCADE,
  billing_year INTEGER NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  due_date DATE NOT NULL,
  status public.bill_status NOT NULL DEFAULT 'pending',
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (land_id, billing_year)
);
CREATE INDEX idx_bills_land ON public.bills(land_id);
CREATE INDEX idx_bills_status ON public.bills(status);
CREATE INDEX idx_bills_due ON public.bills(due_date);
CREATE TRIGGER bills_updated_at BEFORE UPDATE ON public.bills
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================================
-- payments
-- =========================================================================
CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id UUID NOT NULL REFERENCES public.bills(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  paid_at DATE NOT NULL DEFAULT CURRENT_DATE,
  method public.payment_method NOT NULL DEFAULT 'cash',
  reference TEXT,
  receipt_number TEXT NOT NULL UNIQUE DEFAULT ('R-' || to_char(now(), 'YYYYMMDD') || '-' || lpad((floor(random()*100000)::int)::text, 5, '0')),
  recorded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_payments_bill ON public.payments(bill_id);
CREATE INDEX idx_payments_paid_at ON public.payments(paid_at);

-- Trigger: recompute bill status when payments change
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
CREATE TRIGGER payments_recompute_bill
  AFTER INSERT OR UPDATE OR DELETE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.recompute_bill_status();

-- =========================================================================
-- documents
-- =========================================================================
CREATE TABLE public.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  land_id UUID REFERENCES public.lands(id) ON DELETE CASCADE,
  landowner_id UUID REFERENCES public.landowners(id) ON DELETE CASCADE,
  kind public.document_kind NOT NULL DEFAULT 'other',
  storage_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT,
  size_bytes BIGINT,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (land_id IS NOT NULL OR landowner_id IS NOT NULL)
);
CREATE INDEX idx_documents_land ON public.documents(land_id);
CREATE INDEX idx_documents_owner ON public.documents(landowner_id);

-- =========================================================================
-- ENABLE RLS
-- =========================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.landowners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.land_coordinates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ownership_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- =========================================================================
-- POLICIES
-- =========================================================================

-- profiles
CREATE POLICY "profiles read auth" ON public.profiles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles update own or admin" ON public.profiles
  FOR UPDATE TO authenticated USING (id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "profiles insert own" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- user_roles
CREATE POLICY "user_roles read auth" ON public.user_roles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "user_roles admin write" ON public.user_roles
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "user_roles admin update" ON public.user_roles
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "user_roles admin delete" ON public.user_roles
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- landowners (admin/staff write)
CREATE POLICY "landowners read auth" ON public.landowners
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "landowners insert" ON public.landowners
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff'));
CREATE POLICY "landowners update" ON public.landowners
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff'));
CREATE POLICY "landowners delete" ON public.landowners
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- lands
CREATE POLICY "lands read auth" ON public.lands
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "lands insert" ON public.lands
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff'));
CREATE POLICY "lands update" ON public.lands
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff'));
CREATE POLICY "lands delete" ON public.lands
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- land_coordinates
CREATE POLICY "land_coords read auth" ON public.land_coordinates
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "land_coords write" ON public.land_coordinates
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff'));

-- ownership_history
CREATE POLICY "ownership read auth" ON public.ownership_history
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "ownership write" ON public.ownership_history
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff'));

-- bills (admin/finance write)
CREATE POLICY "bills read auth" ON public.bills
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "bills insert" ON public.bills
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'finance'));
CREATE POLICY "bills update" ON public.bills
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'finance'));
CREATE POLICY "bills delete" ON public.bills
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- payments
CREATE POLICY "payments read auth" ON public.payments
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "payments insert" ON public.payments
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'finance'));
CREATE POLICY "payments update" ON public.payments
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'finance'));
CREATE POLICY "payments delete" ON public.payments
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- documents (admin/staff)
CREATE POLICY "documents read auth" ON public.documents
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "documents insert" ON public.documents
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff'));
CREATE POLICY "documents delete" ON public.documents
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff'));

-- =========================================================================
-- STORAGE
-- =========================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('land-documents', 'land-documents', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "land-docs auth read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'land-documents');

CREATE POLICY "land-docs admin/staff write"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'land-documents'
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff')));

CREATE POLICY "land-docs admin/staff update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'land-documents'
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff')));

CREATE POLICY "land-docs admin/staff delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'land-documents'
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff')));