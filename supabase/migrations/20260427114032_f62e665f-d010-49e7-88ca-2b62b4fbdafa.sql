-- App settings (single-row config)
CREATE TABLE public.app_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sms_provider text NOT NULL DEFAULT 'arkesel' CHECK (sms_provider IN ('arkesel','hubtel','mnotify')),
  sms_sender_id text NOT NULL DEFAULT 'PLS',
  reminder_template text NOT NULL DEFAULT 'Dear {owner}, your land rate bill {bill} of GHS {amount} for {year} is overdue. Please pay to avoid penalties. Thank you.',
  reminder_cooldown_days integer NOT NULL DEFAULT 7,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "app_settings read auth" ON public.app_settings
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "app_settings admin write" ON public.app_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER app_settings_set_updated_at
  BEFORE UPDATE ON public.app_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.app_settings DEFAULT VALUES;

-- SMS logs
CREATE TABLE public.sms_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id uuid,
  landowner_id uuid,
  phone text NOT NULL,
  message text NOT NULL,
  provider text NOT NULL,
  status text NOT NULL CHECK (status IN ('sent','failed')),
  provider_response text,
  sent_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sms_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sms_logs read auth" ON public.sms_logs
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "sms_logs insert" ON public.sms_logs
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'finance'));

CREATE INDEX idx_sms_logs_bill ON public.sms_logs(bill_id);
CREATE INDEX idx_sms_logs_created ON public.sms_logs(created_at DESC);