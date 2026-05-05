
-- Ensure shared timestamp helper exists
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TYPE public.payroll_component_type AS ENUM ('earning','deduction');
CREATE TYPE public.payroll_calc_type AS ENUM ('fixed','percent_of_base');
CREATE TYPE public.payroll_run_status AS ENUM ('draft','finalized','paid');

CREATE TABLE public.payroll_staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE,
  full_name text NOT NULL,
  employee_number text UNIQUE,
  job_title text,
  hire_date date,
  ssnit_number text,
  tin_number text,
  bank_name text,
  bank_account text,
  base_salary numeric NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.payroll_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text UNIQUE,
  type public.payroll_component_type NOT NULL,
  calc_type public.payroll_calc_type NOT NULL DEFAULT 'fixed',
  default_amount numeric NOT NULL DEFAULT 0,
  is_statutory boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.payroll_staff_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.payroll_staff(id) ON DELETE CASCADE,
  component_id uuid NOT NULL REFERENCES public.payroll_components(id) ON DELETE CASCADE,
  amount numeric,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (staff_id, component_id)
);

CREATE TABLE public.payroll_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_year int NOT NULL,
  period_month int NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  status public.payroll_run_status NOT NULL DEFAULT 'draft',
  total_gross numeric NOT NULL DEFAULT 0,
  total_deductions numeric NOT NULL DEFAULT 0,
  total_net numeric NOT NULL DEFAULT 0,
  notes text,
  created_by uuid,
  finalized_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (period_year, period_month)
);

CREATE TABLE public.payslips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.payroll_runs(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES public.payroll_staff(id) ON DELETE CASCADE,
  user_id uuid,
  base_salary numeric NOT NULL DEFAULT 0,
  total_earnings numeric NOT NULL DEFAULT 0,
  total_deductions numeric NOT NULL DEFAULT 0,
  gross_pay numeric NOT NULL DEFAULT 0,
  net_pay numeric NOT NULL DEFAULT 0,
  breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  paid boolean NOT NULL DEFAULT false,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, staff_id)
);

CREATE INDEX idx_payslips_user ON public.payslips(user_id);
CREATE INDEX idx_payslips_run ON public.payslips(run_id);

CREATE TRIGGER trg_payroll_staff_updated BEFORE UPDATE ON public.payroll_staff
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_payroll_components_updated BEFORE UPDATE ON public.payroll_components
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_payroll_runs_updated BEFORE UPDATE ON public.payroll_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.payroll_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_staff_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payslips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payroll_staff read" ON public.payroll_staff FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'finance') OR user_id = auth.uid());
CREATE POLICY "payroll_staff write" ON public.payroll_staff FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'finance'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'finance'));

CREATE POLICY "payroll_components read" ON public.payroll_components FOR SELECT TO authenticated USING (true);
CREATE POLICY "payroll_components write" ON public.payroll_components FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'finance'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'finance'));

CREATE POLICY "payroll_staff_components read" ON public.payroll_staff_components FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(),'admin') OR has_role(auth.uid(),'finance')
    OR EXISTS (SELECT 1 FROM public.payroll_staff ps WHERE ps.id = staff_id AND ps.user_id = auth.uid())
  );
CREATE POLICY "payroll_staff_components write" ON public.payroll_staff_components FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'finance'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'finance'));

CREATE POLICY "payroll_runs read" ON public.payroll_runs FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'finance'));
CREATE POLICY "payroll_runs write" ON public.payroll_runs FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'finance'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'finance'));

CREATE POLICY "payslips read" ON public.payslips FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'finance') OR user_id = auth.uid());
CREATE POLICY "payslips write" ON public.payslips FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'finance'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'finance'));

INSERT INTO public.payroll_components (name, code, type, calc_type, default_amount, is_statutory, description) VALUES
  ('SSNIT Employee', 'SSNIT_EMP', 'deduction', 'percent_of_base', 5.5, true, 'Tier 1 employee contribution (5.5% of basic salary)'),
  ('PAYE', 'PAYE', 'deduction', 'percent_of_base', 0, true, 'Pay-As-You-Earn income tax (computed using GRA bands)'),
  ('Transport Allowance', 'TRANS', 'earning', 'fixed', 0, false, 'Monthly transport allowance'),
  ('Housing Allowance', 'HOUSE', 'earning', 'fixed', 0, false, 'Monthly housing allowance');
