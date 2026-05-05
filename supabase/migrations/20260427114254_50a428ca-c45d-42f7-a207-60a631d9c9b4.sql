ALTER TABLE public.app_settings
  ADD COLUMN arkesel_api_key text,
  ADD COLUMN hubtel_client_id text,
  ADD COLUMN hubtel_client_secret text,
  ADD COLUMN mnotify_api_key text;

-- Restrict reads to admins only (credentials are sensitive)
DROP POLICY IF EXISTS "app_settings read auth" ON public.app_settings;

CREATE POLICY "app_settings admin read" ON public.app_settings
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));